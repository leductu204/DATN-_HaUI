from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.comfyui.client import ComfyError
from app.db.models import Image, User
from app.db.session import get_db
from app.images import repository as image_repository
from app.images import service as image_service
from app.images.schemas import (
    ImageEditRequest,
    ImageGenerateRequest,
    ImageOut,
    VideoGenerateRequest,
)

router = APIRouter(prefix="/images", tags=["images"])


def _to_out(image: Image) -> ImageOut:
    return ImageOut(
        id=image.id,
        prompt=image.prompt,
        seed=image.seed,
        url=f"/static/images/{image.filename}",
        created_at=image.created_at,
    )


@router.get("", response_model=list[ImageOut])
def list_images(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All media this user has generated/uploaded, newest first — feeds the
    asset library panel."""
    limit = max(1, min(limit, 500))
    images = image_repository.list_user_images(db, current_user.id, limit)
    return [_to_out(i) for i in images]


def _raise_comfy(e: ComfyError):
    msg = str(e)
    if "timed out" in msg.lower():
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, msg)
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, msg)


@router.post("/generate", response_model=list[ImageOut], status_code=201)
async def generate_image(
    payload: ImageGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate `count` images (1-4). Each runs sequentially with its own random
    seed → distinct options. Returns the list newest-first is not needed; order
    matches generation."""
    out: list[ImageOut] = []
    try:
        for _ in range(payload.count):
            image = await image_service.generate_and_save(
                prompt=payload.prompt,
                seed=payload.seed if payload.count == 1 else None,
                user_id=current_user.id,
                db=db,
                quality=payload.quality,
                aspect_ratio=payload.aspect_ratio,
                source="workflow",
            )
            out.append(_to_out(image))
    except ComfyError as e:
        if out:  # partial success — return what we got rather than 5xx
            return out
        _raise_comfy(e)
    return out


@router.post("/edit", response_model=list[ImageOut], status_code=201)
async def edit_image(
    payload: ImageEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a specific owned image, returning `count` NEW variations (1-4).

    Used by the workflow Image node when a reference image is connected; the
    chat flow edits the latest image via the edit_image tool instead.
    """
    source = db.get(Image, payload.image_id)
    if source is None or source.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source image not found")
    out: list[ImageOut] = []
    try:
        for _ in range(payload.count):
            image = await image_service.edit_and_save(
                source_image=source,
                target_prompt=payload.prompt,
                strength=payload.strength,
                user_id=current_user.id,
                db=db,
                quality=payload.quality,
                aspect_ratio=payload.aspect_ratio,
                source="workflow",
            )
            out.append(_to_out(image))
    except ComfyError as e:
        if out:
            return out
        _raise_comfy(e)
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return out


@router.post("/video", response_model=list[ImageOut], status_code=201)
async def generate_video(
    payload: VideoGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Animate an owned image into `count` short clips (1-4). Each url is .mp4.
    Used by the workflow Video node."""
    source = db.get(Image, payload.image_id)
    if source is None or source.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source image not found")
    out: list[ImageOut] = []
    try:
        for _ in range(payload.count):
            image = await image_service.generate_video_and_save(
                source_image=source,
                motion_prompt=payload.prompt,
                user_id=current_user.id,
                db=db,
                quality=payload.quality,
                aspect_ratio=payload.aspect_ratio,
                source="workflow",
            )
            out.append(_to_out(image))
    except ComfyError as e:
        if out:
            return out
        _raise_comfy(e)
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return out


@router.post("/upload", response_model=ImageOut, status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a user image (PNG/JPEG/WebP, ≤10MB). The saved row becomes the
    latest user image, so the next chat message that triggers `edit_image`
    will use it as the source.
    """
    raw = await file.read()
    try:
        image = image_service.save_user_upload(
            raw_bytes=raw,
            content_type=file.content_type or "",
            user_id=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return _to_out(image)


@router.get("/{image_id}", response_model=ImageOut)
def get_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.get(Image, image_id)
    if image is None or image.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
    return _to_out(image)
