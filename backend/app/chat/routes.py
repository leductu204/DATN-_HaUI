import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.chat import orchestrator, repository
from app.chat.schemas import (
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
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


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = repository.get_user_conversation(db, conversation_id, current_user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return repository.update_conversation_title(db, convo, payload.title.strip())


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


async def _poll_disconnect(request: Request) -> None:
    """Resolve when the client drops the connection (e.g. the Stop button
    aborts the fetch)."""
    while True:
        if await request.is_disconnected():
            return
        await asyncio.sleep(0.4)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
)
async def post_message(
    conversation_id: int,
    payload: MessageCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = repository.get_user_conversation(db, conversation_id, current_user.id)
    if convo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")

    # Run the chat work as a task and race it against client-disconnect. If the
    # user hits Stop (fetch aborts → client disconnects), cancel the task so the
    # in-flight Ollama call is dropped instead of running to completion.
    work = asyncio.create_task(
        orchestrator.handle_message(
            convo,
            payload.content,
            current_user,
            db,
            quality=payload.quality,
            aspect_ratio=payload.aspect_ratio,
        )
    )
    watcher = asyncio.create_task(_poll_disconnect(request))
    try:
        done, _ = await asyncio.wait(
            {work, watcher}, return_when=asyncio.FIRST_COMPLETED
        )
        if work in done:
            return work.result()
        # Client disconnected → stop the orchestrator.
        work.cancel()
        try:
            await work
        except BaseException:
            pass
        raise HTTPException(499, "Đã dừng phản hồi")
    except ollama_client.OllamaError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    finally:
        watcher.cancel()
