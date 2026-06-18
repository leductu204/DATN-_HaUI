from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.db.models import User
from app.llm import ollama_client
from app.llm.schemas import LLMCompleteRequest, LLMCompleteResponse

router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/complete", response_model=LLMCompleteResponse)
async def complete(
    payload: LLMCompleteRequest,
    current_user: User = Depends(get_current_user),
):
    """Stateless single-turn LLM completion for workflow LLM nodes.

    Unlike /conversations/{id}/messages this keeps no history and exposes no
    tools — it just maps prompt (+ optional system) to a text reply.
    """
    messages: list[dict] = []
    if payload.system:
        messages.append({"role": "system", "content": payload.system})
    messages.append({"role": "user", "content": payload.prompt})

    try:
        result = await ollama_client.chat(messages)
    except ollama_client.OllamaError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    return LLMCompleteResponse(content=(result.get("content") or "").strip())
