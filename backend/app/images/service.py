import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.comfyui.client import ComfyClient
from app.comfyui.injector import inject_txt2img, load_workflow
from app.config import settings
from app.db.models import Image

_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "images"


async def generate_and_save(
    prompt: str,
    seed: int | None,
    user_id: int,
    db: Session,
) -> Image:
    """Run the txt2img workflow on ComfyUI, persist the PNG and DB row.

    Raises ComfyError on failure — callers map to HTTP status. Used by both
    POST /images/generate and the chat tool dispatcher.
    """
    template = load_workflow("txt2img_zimage")
    workflow, resolved_seed = inject_txt2img(template, prompt, seed)

    client = ComfyClient()
    png_bytes = await client.generate(
        workflow, timeout_seconds=settings.comfy_timeout_seconds
    )

    filename = f"{uuid.uuid4().hex}.png"
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)
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
