import asyncio

import httpx

from app.config import settings

# Ollama on first request loads the model into RAM (~10-20s warm-up).
# CPU inference for 4B can take 30-90s on a typical reply.
_TIMEOUT = httpx.Timeout(180.0, connect=5.0)

# With OLLAMA_KEEP_ALIVE=0 the model is unloaded after every reply, so the next
# call cold-reloads (~2.5GB). Right after a ComfyUI generation the box is still
# freeing/swapping RAM, and Ollama can briefly refuse connections while it
# reloads — a transient RequestError, not a real outage. Retry a few times with
# backoff before giving up so a single blip doesn't surface as a 503.
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = (2.0, 4.0)


class OllamaError(Exception):
    pass


async def chat(
    messages: list[dict],
    tools: list[dict] | None = None,
    model: str | None = None,
) -> dict:
    """Call Ollama /api/chat (non-streaming).

    Returns {'content': str | None, 'tool_calls': list | None}. Either may be
    set; Ollama returns content="" when it decides to call tools instead.
    """
    payload = {
        "model": model or settings.ollama_model,
        "messages": messages,
        "stream": False,
        # Overrides the server's OLLAMA_KEEP_ALIVE per request. "0" unloads
        # after replying (local ComfyUI needs the VRAM); "30m" keeps the model
        # warm when ComfyUI is remote. See Settings.ollama_keep_alive.
        "keep_alive": settings.ollama_keep_alive,
    }
    if tools:
        payload["tools"] = tools

    last_error: httpx.RequestError | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await client.post(
                    f"{settings.ollama_base_url}/api/chat", json=payload
                )
                break
            except httpx.RequestError as e:
                # Connection-level failure (refused/reset/connect-timeout) —
                # usually a cold-reload blip. Back off and retry; only the last
                # attempt's failure is surfaced.
                last_error = e
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_RETRY_BACKOFF_SECONDS[attempt])
        else:
            raise OllamaError(
                f"Cannot reach Ollama at {settings.ollama_base_url} after "
                f"{_MAX_RETRIES} attempts: {last_error}"
            ) from last_error

    if resp.status_code != 200:
        raise OllamaError(f"Ollama returned HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    msg = data.get("message") or {}
    return {
        "content": msg.get("content"),
        "tool_calls": msg.get("tool_calls"),
    }
