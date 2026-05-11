from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Image


def get_latest_user_image(db: Session, user_id: int) -> Image | None:
    stmt = (
        select(Image)
        .where(Image.user_id == user_id)
        .order_by(Image.created_at.desc(), Image.id.desc())
        .limit(1)
    )
    return db.scalars(stmt).first()
