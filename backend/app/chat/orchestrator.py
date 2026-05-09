import json
import uuid

from sqlalchemy.orm import Session

from app.chat import repository
from app.comfyui.client import ComfyError
from app.db.models import Conversation, Message, User
from app.images import service as image_service
from app.llm import ollama_client
from app.llm.tools import TOOLS

MAX_TOOL_ITERATIONS = 3

SYSTEM_PROMPT = (
    "You are a helpful assistant integrated with an image generation tool. "
    "Use the `generate_image` tool ONLY when the user explicitly asks to "
    "draw, create, render, or generate an image. For all other requests "
    "(questions, conversation, math, explanations), reply with text and do "
    "NOT call the tool. After a successful image generation, write a brief "
    "natural-language reply confirming the image is ready — do not repeat "
    "the URL, the user already sees it."
)


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
    repository.append_message(db, conversation.id, "user", user_content)

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
