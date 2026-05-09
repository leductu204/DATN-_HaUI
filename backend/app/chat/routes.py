from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.chat import orchestrator, repository
from app.chat.schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
)
from app.db.models import User
from app.db.session import get_db
from app.llm import ollama_client

router = APIRouter(prefix="/conversations", tags=["chat"])


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return repository.create_conversation(db, current_user.id, payload.title)


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return repository.list_user_conversations(db, current_user.id)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = repository.get_user_conversation(db, conversation_id, current_user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return repository.list_messages(db, conversation_id)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
)
async def post_message(
    conversation_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = repository.get_user_conversation(db, conversation_id, current_user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    try:
        return await orchestrator.handle_message(
            convo, payload.content, current_user, db
        )
    except ollama_client.OllamaError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
