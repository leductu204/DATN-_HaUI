from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Image


# Video files live in the same images table (distinguished by extension). When
# picking a source for edit/animate we want the latest still IMAGE, never a
# previously generated clip.
_VIDEO_EXTS = (".mp4", ".webm", ".mov", ".mkv", ".gif")


def get_latest_user_image(db: Session, user_id: int) -> Image | None:
    stmt = (
        select(Image)
        .where(Image.user_id == user_id)
        .order_by(Image.created_at.desc(), Image.id.desc())
    )
    for img in db.scalars(stmt):
        if not img.filename.lower().endswith(_VIDEO_EXTS):
            return img
    return None


def list_user_images(db: Session, user_id: int, limit: int = 100) -> list[Image]:
    stmt = (
        select(Image)
        .where(Image.user_id == user_id)
        .order_by(Image.created_at.desc(), Image.id.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
