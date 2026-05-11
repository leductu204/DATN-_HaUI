import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.comfyui.client import ComfyClient
from app.comfyui.injector import inject_img2img, inject_txt2img, load_workflow
from app.config import settings
from app.db.models import Image

_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "images"


def _ensure_storage() -> None:
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)


async def generate_and_save(
    prompt: str,
    seed: int | None,
    user_id: int,
    db: Session,
) -> Image:
    """Run the txt2img workflow on ComfyUI, persist PNG + DB row."""
    template = load_workflow("txt2img_zimage")
    workflow, resolved_seed = inject_txt2img(template, prompt, seed)

    client = ComfyClient()
    png_bytes = await client.generate(
        workflow, timeout_seconds=settings.comfy_timeout_seconds
    )

    filename = f"{uuid.uuid4().hex}.png"
    _ensure_storage()
    (_STORAGE_DIR / filename).write_bytes(png_bytes)

    image = Image(
        user_id=user_id,
        prompt=prompt,
        seed=resolved_seed,
        filename=filename,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


async def edit_and_save(
    source_image: Image,
    target_prompt: str,
    strength: float,
    user_id: int,
    db: Session,
) -> Image:
    """Run img2img on an existing user image with target_prompt as the full
    description of the desired output. Saves a NEW image row + PNG.
    """
    source_path = _STORAGE_DIR / source_image.filename
    if not source_path.exists():
        raise FileNotFoundError(f"Source image missing on disk: {source_path}")
    source_bytes = source_path.read_bytes()

    client = ComfyClient()
    comfy_filename = await client.upload_image(
        source_bytes, name=source_image.filename
    )

    template = load_workflow("img2img_zimage")
    workflow, resolved_seed = inject_img2img(
        template,
        target_prompt=target_prompt,
        input_filename=comfy_filename,
        strength=strength,
        seed=None,
    )

    png_bytes = await client.generate(
        workflow, timeout_seconds=settings.comfy_timeout_seconds
    )

    filename = f"{uuid.uuid4().hex}.png"
    _ensure_storage()
    (_STORAGE_DIR / filename).write_bytes(png_bytes)

    image = Image(
        user_id=user_id,
        prompt=target_prompt,
        seed=resolved_seed,
        filename=filename,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image
