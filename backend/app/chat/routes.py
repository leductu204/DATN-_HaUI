from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.chat.schemas import ChatRequest, ChatResponse
from app.db.models import User
from app.llm import ollama_client

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    messages = [m.model_dump() for m in payload.messages]
    try:
        reply = await ollama_client.chat(messages)
    except ollama_client.OllamaError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    return ChatResponse(reply=reply)
