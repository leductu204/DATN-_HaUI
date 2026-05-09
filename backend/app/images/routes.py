import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.comfyui.client import ComfyClient, ComfyError
from app.comfyui.injector import inject_txt2img, load_workflow
from app.config import settings
from app.db.models import Image, User
from app.db.session import get_db
from app.images.schemas import ImageGenerateRequest, ImageOut

router = APIRouter(prefix="/images", tags=["images"])

_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "images"


def _to_out(image: Image) -> ImageOut:
    return ImageOut(
        id=image.id,
        prompt=image.prompt,
        seed=image.seed,
        url=f"/static/images/{image.filename}",
        created_at=image.created_at,
    )


@router.post("/generate", response_model=ImageOut, status_code=201)
async def generate_image(
    payload: ImageGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = load_workflow("txt2img_zimage")
    workflow, resolved_seed = inject_txt2img(template, payload.prompt, payload.seed)

    client = ComfyClient()
    try:
        png_bytes = await client.generate(workflow, timeout_seconds=settings.comfy_timeout_seconds)
    except ComfyError as e:
        msg = str(e)
        # Distinguish unreachable (503) from execution timeout (504).
        if "timed out" in msg.lower():
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, msg)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, msg)

    filename = f"{uuid.uuid4().hex}.png"
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    (_STORAGE_DIR / filename).write_bytes(png_bytes)

    image = Image(
        user_id=current_user.id,
        prompt=payload.prompt,
        seed=resolved_seed,
        filename=filename,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
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
