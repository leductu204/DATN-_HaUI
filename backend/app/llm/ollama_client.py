import httpx

from app.config import settings

# Ollama on first request loads the model into RAM (~10-20s warm-up).
# CPU inference for 4B can take 30-90s on a typical reply.
_TIMEOUT = httpx.Timeout(180.0, connect=5.0)


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
    }
    if tools:
        payload["tools"] = tools

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
        except httpx.RequestError as e:
            raise OllamaError(f"Cannot reach Ollama at {settings.ollama_base_url}: {e}") from e
    if resp.status_code != 200:
        raise OllamaError(f"Ollama returned HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    msg = data.get("message") or {}
    return {
        "content": msg.get("content"),
        "tool_calls": msg.get("tool_calls"),
    }
