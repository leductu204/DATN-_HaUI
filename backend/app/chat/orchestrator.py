import json
import logging
import re
import time
import uuid

from sqlalchemy.orm import Session

logger = logging.getLogger("chat.orchestrator")


def _truncate(text: str, limit: int = 80) -> str:
    text = text.replace("\n", " ").strip()
    return text if len(text) <= limit else text[:limit] + "…"

from app.chat import repository
from app.comfyui.client import ComfyError
from app.db.models import Conversation, Message, User
from app.images import repository as image_repository
from app.images import service as image_service
from app.llm import ollama_client
from app.llm.tools import TOOLS

MAX_TOOL_ITERATIONS = 3

# Hardcoded confirmation text returned after a successful tool call so we can
# skip the second LLM round-trip (~15s saved). Lost: LLM-generated contextual
# Vietnamese reply. Gained: latency. Error paths still go through LLM so it
# can explain what went wrong.
_TOOL_OK_REPLIES = {
    "generate_image": "Đã tạo ảnh theo yêu cầu.",
    "edit_image": "Đã chỉnh sửa ảnh xong.",
    "generate_video": "Đã tạo video từ ảnh.",
}

SYSTEM_PROMPT = (
    "You are a helpful assistant with three media tools:\n"
    "- generate_image: create a NEW image from scratch. Use when the user "
    "asks to draw, create, render, or generate something.\n"
    "- edit_image: modify the user's MOST RECENT image. Use when the user "
    "asks to restyle, transform, regenerate-with-changes, or otherwise "
    "modify an image already in this conversation (\"make it anime\", "
    "\"change the colors\", \"try a different version\").\n"
    "- generate_video: animate the user's MOST RECENT image into a short "
    "clip. Use when the user asks to animate, add motion, or make a video "
    "from an existing image (\"make it move\", \"tạo video từ ảnh này\").\n\n"
    "Rules:\n"
    "1. For non-media requests (questions, math, conversation), reply with "
    "text — do NOT call any tool.\n"
    "2. For edit_image, the `target_prompt` must describe the FULL final "
    "image (subject + style + setting), not just the change. Translate "
    "Vietnamese user requests into descriptive English prompts.\n"
    "3. If the user message starts with \"[Đã đính kèm: ...]\" they just "
    "uploaded a photo from their device — treat it as the source for "
    "edit_image or generate_video (do NOT call generate_image).\n"
    "4. After a successful tool call, write a short natural-language "
    "confirmation — do NOT repeat the URL, the user sees the result inline."
)


_TITLE_MAX_CHARS = 60


def _derive_title(text: str) -> str:
    """Make a short conversation title from the first user message.

    Strips qwen3 command prefixes (/think, /no_think), trims whitespace,
    truncates at a word boundary near 60 chars.
    """
    cleaned = re.sub(r"^/(no_think|think)\s*", "", text, flags=re.IGNORECASE).strip()
    # Drop a leading "[Đã đính kèm: <url>]" upload marker so the title is just
    # the user's actual request, not the image path.
    cleaned = re.sub(r"^\[Đã đính kèm:[^\]]*\]\s*", "", cleaned).strip()
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


_MAX_COUNT = 4


async def _dispatch_tool(
    name: str,
    args: dict,
    user: User,
    db: Session,
    overrides: dict | None = None,
) -> list[dict]:
    """Dispatch a tool call. Returns a LIST of result dicts — one per generated
    item (count 1-4). A single error returns a one-element list."""
    # Explicit chat-bar dropdown choices override whatever the LLM inferred.
    overrides = overrides or {}

    def _quality() -> str | None:
        return overrides.get("quality") or args.get("quality")

    def _aspect() -> str | None:
        return overrides.get("aspect_ratio") or args.get("aspect_ratio")

    def _count() -> int:
        try:
            return max(1, min(_MAX_COUNT, int(args.get("count", 1))))
        except (TypeError, ValueError):
            return 1

    if name == "generate_image":
        prompt = args.get("prompt")
        if not prompt or not isinstance(prompt, str):
            return [{"status": "error", "error": "prompt is required"}]
        seed = args.get("seed")
        if seed in (None, -1):
            seed = None
        count = _count()
        results: list[dict] = []
        for i in range(count):
            t0 = time.monotonic()
            try:
                image = await image_service.generate_and_save(
                    prompt=prompt,
                    # Only honour an explicit seed for a single image; multiple
                    # need distinct random seeds to differ.
                    seed=seed if count == 1 else None,
                    user_id=user.id,
                    db=db,
                    quality=_quality(),
                    aspect_ratio=_aspect(),
                )
            except ComfyError as e:
                results.append({"status": "error", "error": str(e)})
                break
            results.append({
                "status": "ok",
                "image_id": image.id,
                "url": f"/static/images/{image.filename}",
                "duration_seconds": round(time.monotonic() - t0, 1),
            })
        return results

    if name == "edit_image":
        target_prompt = args.get("target_prompt")
        if not target_prompt or not isinstance(target_prompt, str):
            return [{"status": "error", "error": "target_prompt is required"}]
        strength = args.get("strength")
        try:
            strength = float(strength) if strength is not None else 0.65
        except (TypeError, ValueError):
            strength = 0.65

        source = image_repository.get_latest_user_image(db, user.id)
        if source is None:
            return [{
                "status": "error",
                "error": (
                    "No image to edit. Ask the user to generate an image "
                    "first, then try the edit again."
                ),
            }]
        results = []
        for _ in range(_count()):
            t0 = time.monotonic()
            try:
                image = await image_service.edit_and_save(
                    source_image=source,
                    target_prompt=target_prompt,
                    strength=strength,
                    user_id=user.id,
                    db=db,
                    quality=_quality(),
                    aspect_ratio=_aspect(),
                )
            except (ComfyError, FileNotFoundError) as e:
                results.append({"status": "error", "error": str(e)})
                break
            results.append({
                "status": "ok",
                "image_id": image.id,
                "url": f"/static/images/{image.filename}",
                "edited_from": source.id,
                "duration_seconds": round(time.monotonic() - t0, 1),
            })
        return results

    if name == "generate_video":
        motion_prompt = args.get("motion_prompt")
        if not motion_prompt or not isinstance(motion_prompt, str):
            return [{"status": "error", "error": "motion_prompt is required"}]

        source = image_repository.get_latest_user_image(db, user.id)
        if source is None:
            return [{
                "status": "error",
                "error": (
                    "No image to animate. Ask the user to generate or upload "
                    "an image first, then try again."
                ),
            }]
        results = []
        for _ in range(_count()):
            t0 = time.monotonic()
            try:
                video = await image_service.generate_video_and_save(
                    source_image=source,
                    motion_prompt=motion_prompt,
                    user_id=user.id,
                    db=db,
                    quality=_quality(),
                    aspect_ratio=_aspect(),
                )
            except (ComfyError, FileNotFoundError) as e:
                results.append({"status": "error", "error": str(e)})
                break
            results.append({
                "status": "ok",
                "image_id": video.id,
                "url": f"/static/images/{video.filename}",
                "media_type": "video",
                "animated_from": source.id,
                "duration_seconds": round(time.monotonic() - t0, 1),
            })
        return results

    return [{"status": "error", "error": f"Unknown tool: {name}"}]


async def handle_message(
    conversation: Conversation,
    user_content: str,
    user: User,
    db: Session,
    quality: str | None = None,
    aspect_ratio: str | None = None,
) -> Message:
    """Run the chat loop: save user msg, call LLM (possibly with tool calls),
    dispatch tools, save all intermediate messages, return final assistant
    message.

    `quality`/`aspect_ratio` are explicit user overrides from the chat input
    dropdowns; when set they take precedence over what the LLM infers.
    """
    overrides = {"quality": quality, "aspect_ratio": aspect_ratio}
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
            dispatched: list[tuple[str, dict]] = []
            for call in tool_calls:
                func = call.get("function") or {}
                name = func.get("name") or ""
                args = func.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}

                # Surface tool decisions in the BE terminal log.
                preview_key = {
                    "generate_image": "prompt",
                    "edit_image": "target_prompt",
                    "generate_video": "motion_prompt",
                }.get(name, "prompt")
                preview = _truncate(str(args.get(preview_key, "")))
                logger.info(
                    "[tool] -> %s user=%s %s=%r",
                    name, user.id, preview_key, preview,
                )

                t_call = time.monotonic()
                tool_results = await _dispatch_tool(name, args, user, db, overrides)
                elapsed = time.monotonic() - t_call

                ok_n = sum(1 for r in tool_results if r.get("status") == "ok")
                if ok_n == len(tool_results):
                    logger.info(
                        "[tool] <- %s ok x%d in %.1fs", name, ok_n, elapsed,
                    )
                else:
                    err = next(
                        (r.get("error") for r in tool_results if r.get("status") != "ok"),
                        "unknown",
                    )
                    logger.warning(
                        "[tool] <- %s %d/%d ok, ERROR: %s (after %.1fs)",
                        name, ok_n, len(tool_results), err, elapsed,
                    )

                # One tool message per generated item → one image/video card each.
                for r in tool_results:
                    dispatched.append((name, r))
                    repository.append_message(
                        db,
                        conversation.id,
                        "tool",
                        json.dumps(r, ensure_ascii=False),
                        tool_call_id=uuid.uuid4().hex,
                    )

            # Shortcut: if every tool succeeded, skip the second LLM call and
            # post a hardcoded confirmation. Saves ~15s. Errors still loop so
            # the LLM can explain them to the user.
            if all(r.get("status") == "ok" for _, r in dispatched):
                first_name = dispatched[0][0] if dispatched else ""
                reply = _TOOL_OK_REPLIES.get(first_name, "Đã hoàn thành.")
                final_message = repository.append_message(
                    db, conversation.id, "assistant", reply
                )
                break

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
