from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.comfyui.client import ComfyError
from app.db.models import Image, User
from app.db.session import get_db
from app.images import service as image_service
from app.images.schemas import ImageGenerateRequest, ImageOut

router = APIRouter(prefix="/images", tags=["images"])


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
    try:
        image = await image_service.generate_and_save(
            prompt=payload.prompt,
            seed=payload.seed,
            user_id=current_user.id,
            db=db,
        )
    except ComfyError as e:
        msg = str(e)
        if "timed out" in msg.lower():
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, msg)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, msg)
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
