import json
import re
import uuid

from sqlalchemy.orm import Session

from app.chat import repository
from app.comfyui.client import ComfyError
from app.db.models import Conversation, Message, User
from app.images import repository as image_repository
from app.images import service as image_service
from app.llm import ollama_client
from app.llm.tools import TOOLS

MAX_TOOL_ITERATIONS = 3

SYSTEM_PROMPT = (
    "You are a helpful assistant with two image tools:\n"
    "- generate_image: create a NEW image from scratch. Use when the user "
    "asks to draw, create, render, or generate something.\n"
    "- edit_image: modify the user's MOST RECENT image. Use when the user "
    "asks to restyle, transform, regenerate-with-changes, or otherwise "
    "modify an image already in this conversation (\"make it anime\", "
    "\"change the colors\", \"try a different version\").\n\n"
    "Rules:\n"
    "1. For non-image requests (questions, math, conversation), reply with "
    "text — do NOT call either tool.\n"
    "2. For edit_image, the `target_prompt` must describe the FULL final "
    "image (subject + style + setting), not just the change. Translate "
    "Vietnamese user requests into descriptive English prompts.\n"
    "3. After a successful tool call, write a short natural-language "
    "confirmation — do NOT repeat the URL, the user sees the image inline."
)


_TITLE_MAX_CHARS = 60


def _derive_title(text: str) -> str:
    """Make a short conversation title from the first user message.

    Strips qwen3 command prefixes (/think, /no_think), trims whitespace,
    truncates at a word boundary near 60 chars.
    """
    cleaned = re.sub(r"^/(no_think|think)\s*", "", text, flags=re.IGNORECASE).strip()
    if not cleaned:
        return "New chat"
    if len(cleaned) <= _TITLE_MAX_CHARS:
        return cleaned
    cutoff = cleaned[:_TITLE_MAX_CHARS]
    last_space = cutoff.rfind(" ")
    if last_space > 20:
        return cutoff[:last_space] + "…"
    return cutoff + "…"


def _format_for_llm(messages: list[Message]) -> list[dict]:
    out: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        msg: dict = {"role": m.role, "content": m.content or ""}
        if m.tool_calls:
            msg["tool_calls"] = m.tool_calls
        out.append(msg)
    return out


async def _dispatch_tool(name: str, args: dict, user: User, db: Session) -> dict:
    if name == "generate_image":
        prompt = args.get("prompt")
        if not prompt or not isinstance(prompt, str):
            return {"status": "error", "error": "prompt is required"}
        seed = args.get("seed")
        if seed in (None, -1):
            seed = None
        try:
            image = await image_service.generate_and_save(
                prompt=prompt, seed=seed, user_id=user.id, db=db
            )
        except ComfyError as e:
            return {"status": "error", "error": str(e)}
        return {
            "status": "ok",
            "image_id": image.id,
            "url": f"/static/images/{image.filename}",
        }

    if name == "edit_image":
        target_prompt = args.get("target_prompt")
        if not target_prompt or not isinstance(target_prompt, str):
            return {"status": "error", "error": "target_prompt is required"}
        strength = args.get("strength")
        try:
            strength = float(strength) if strength is not None else 0.65
        except (TypeError, ValueError):
            strength = 0.65

        source = image_repository.get_latest_user_image(db, user.id)
        if source is None:
            return {
                "status": "error",
                "error": (
                    "No image to edit. Ask the user to generate an image "
                    "first, then try the edit again."
                ),
            }
        try:
            image = await image_service.edit_and_save(
                source_image=source,
                target_prompt=target_prompt,
                strength=strength,
                user_id=user.id,
                db=db,
            )
        except ComfyError as e:
            return {"status": "error", "error": str(e)}
        except FileNotFoundError as e:
            return {"status": "error", "error": str(e)}
        return {
            "status": "ok",
            "image_id": image.id,
            "url": f"/static/images/{image.filename}",
            "edited_from": source.id,
        }

    return {"status": "error", "error": f"Unknown tool: {name}"}


async def handle_message(
    conversation: Conversation,
    user_content: str,
    user: User,
    db: Session,
) -> Message:
    """Run the chat loop: save user msg, call LLM (possibly with tool calls),
    dispatch tools, save all intermediate messages, return final assistant
    message.
    """
    existing = repository.list_messages(db, conversation.id)
    is_first_user_msg = not any(m.role == "user" for m in existing)

    repository.append_message(db, conversation.id, "user", user_content)

    if is_first_user_msg and conversation.title == "New chat":
        new_title = _derive_title(user_content)
        if new_title and new_title != "New chat":
            conversation.title = new_title
            db.add(conversation)
            db.commit()

    final_message: Message | None = None
    for _ in range(MAX_TOOL_ITERATIONS):
        history = repository.list_messages(db, conversation.id)
        messages_for_llm = _format_for_llm(history)

        result = await ollama_client.chat(messages_for_llm, tools=TOOLS)
        content = result.get("content") or ""
        tool_calls = result.get("tool_calls")

        if tool_calls:
            repository.append_message(
                db,
                conversation.id,
                "assistant",
                content,
                tool_calls=tool_calls,
            )
            for call in tool_calls:
                func = call.get("function") or {}
                name = func.get("name") or ""
                args = func.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                tool_result = await _dispatch_tool(name, args, user, db)
                repository.append_message(
                    db,
                    conversation.id,
                    "tool",
                    json.dumps(tool_result, ensure_ascii=False),
                    tool_call_id=uuid.uuid4().hex,
                )
            continue

        final_message = repository.append_message(
            db, conversation.id, "assistant", content
        )
        break

    if final_message is None:
        # Safety net: tool loop didn't converge to a text reply.
        final_message = repository.append_message(
            db,
            conversation.id,
            "assistant",
            "(System: the assistant exceeded the tool-call iteration limit.)",
        )

    repository.touch_conversation(db, conversation)
    return final_message
