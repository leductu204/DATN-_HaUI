from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Conversation, Message


def create_conversation(db: Session, user_id: int, title: str | None) -> Conversation:
    convo = Conversation(user_id=user_id, title=title or "New chat")
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


def list_user_conversations(db: Session, user_id: int) -> list[Conversation]:
    stmt = (
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
    )
    return list(db.scalars(stmt))


def get_user_conversation(
    db: Session, conversation_id: int, user_id: int
) -> Conversation | None:
    convo = db.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user_id:
        return None
    return convo


def list_messages(db: Session, conversation_id: int) -> list[Message]:
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return list(db.scalars(stmt))


def append_message(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    tool_calls: list | None = None,
    tool_call_id: str | None = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        tool_calls=tool_calls,
        tool_call_id=tool_call_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def touch_conversation(db: Session, conversation: Conversation) -> None:
    conversation.updated_at = datetime.utcnow()
    db.add(conversation)
    db.commit()
