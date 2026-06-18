import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.comfyui.client import ComfyClient
from app.comfyui.injector import (
    inject_i2v_ltxv,
    inject_img2img,
    inject_img2img_flux,
    inject_txt2img,
    inject_txt2img_flux,
    load_workflow,
)
from app.comfyui.presets import image_spec, video_spec
from app.config import settings
from app.db.models import Image
from app.jobs import registry as jobs

_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "images"
_UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # 10 MB hard cap
_UPLOAD_PROMPT_MARKER = "[uploaded by user]"

# (content-type, expected magic prefix, file extension) — anything else rejects.
_ALLOWED_UPLOADS = {
    "image/png": (b"\x89PNG\r\n\x1a\n", "png"),
    "image/jpeg": (b"\xff\xd8\xff", "jpg"),
    "image/jpg": (b"\xff\xd8\xff", "jpg"),
    "image/webp": (b"RIFF", "webp"),  # actually "RIFF....WEBP", checked below
}


def _ensure_storage() -> None:
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _is_flux() -> bool:
    return settings.comfy_backend.lower() == "flux_kontext"


def save_user_upload(
    raw_bytes: bytes, content_type: str, user_id: int, db: Session
) -> Image:
    """Persist a user-uploaded image and insert an Image row so it becomes
    the latest source for the next edit_image tool call.

    Validation is light (size cap + magic-byte prefix) — heavy parsing is left
    to ComfyUI's LoadImage node downstream.
    """
    if len(raw_bytes) == 0:
        raise ValueError("Empty file")
    if len(raw_bytes) > _UPLOAD_MAX_BYTES:
        raise ValueError(
            f"File too large ({len(raw_bytes)/1e6:.1f}MB, max 10MB)"
        )

    ct = (content_type or "").lower().split(";")[0].strip()
    spec = _ALLOWED_UPLOADS.get(ct)
    if spec is None:
        raise ValueError(f"Unsupported content type: {content_type!r}")
    magic, ext = spec
    if not raw_bytes.startswith(magic):
        raise ValueError(f"File does not look like {ct}")
    if ct == "image/webp" and raw_bytes[8:12] != b"WEBP":
        raise ValueError("File does not look like image/webp")

    filename = f"{uuid.uuid4().hex}.{ext}"
    _ensure_storage()
    (_STORAGE_DIR / filename).write_bytes(raw_bytes)

    image = Image(
        user_id=user_id,
        prompt=_UPLOAD_PROMPT_MARKER,
        seed=0,
        filename=filename,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


async def generate_and_save(
    prompt: str,
    seed: int | None,
    user_id: int,
    db: Session,
    quality: str | None = None,
    aspect_ratio: str | None = None,
    source: str = "chat",
) -> Image:
    """Run the txt2img workflow on ComfyUI, persist PNG + DB row."""
    width, height, steps = image_spec(quality, aspect_ratio)
    if _is_flux():
        template = load_workflow("txt2img_flux_kontext")
        workflow, resolved_seed = inject_txt2img_flux(
            template, prompt, seed, width=width, height=height, steps=steps
        )
    else:
        template = load_workflow("txt2img_zimage")
        workflow, resolved_seed = inject_txt2img(
            template, prompt, seed, width=width, height=height
        )

    client = ComfyClient()
    job = jobs.create(user_id, "generate", prompt, source)
    try:
        png_bytes = await client.generate(
            workflow,
            timeout_seconds=settings.comfy_timeout_seconds,
            free_after=not _is_flux(),
            cancel_event=job.cancel_event,
            on_submit=job.set_running,
        )
    finally:
        jobs.remove(job.id)

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
    quality: str | None = None,
    aspect_ratio: str | None = None,
    source: str = "chat",
) -> Image:
    """Edit a user image with target_prompt. Saves a NEW image row + PNG.

    z-image backend: denoise-based img2img, `strength` controls similarity.
    flux_kontext backend: instruction-edit via ReferenceLatent, `strength` is
    ignored — the LLM should write the FULL description of the desired output.
    """
    source_path = _STORAGE_DIR / source_image.filename
    if not source_path.exists():
        raise FileNotFoundError(f"Source image missing on disk: {source_path}")
    source_bytes = source_path.read_bytes()

    client = ComfyClient()
    comfy_filename = await client.upload_image(
        source_bytes, name=source_image.filename
    )

    width, height, steps = image_spec(quality, aspect_ratio)
    if _is_flux():
        template = load_workflow("img2img_flux_kontext")
        workflow, resolved_seed = inject_img2img_flux(
            template,
            target_prompt=target_prompt,
            input_filename=comfy_filename,
            seed=None,
            width=width,
            height=height,
            steps=steps,
        )
    else:
        template = load_workflow("img2img_zimage")
        workflow, resolved_seed = inject_img2img(
            template,
            target_prompt=target_prompt,
            input_filename=comfy_filename,
            strength=strength,
            seed=None,
        )

    job = jobs.create(user_id, "edit", target_prompt, source)
    try:
        png_bytes = await client.generate(
            workflow,
            timeout_seconds=settings.comfy_timeout_seconds,
            free_after=not _is_flux(),
            cancel_event=job.cancel_event,
            on_submit=job.set_running,
        )
    finally:
        jobs.remove(job.id)

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


async def generate_video_and_save(
    source_image: Image,
    motion_prompt: str,
    user_id: int,
    db: Session,
    quality: str | None = None,
    aspect_ratio: str | None = None,
    source: str = "chat",
) -> Image:
    """Animate a still image into a short clip via LTX-Video i2v. Uploads the
    source to ComfyUI, runs the i2v workflow, saves the resulting video (mp4)
    + a DB row (filename carries the extension so it's recognised as video).
    """
    source_path = _STORAGE_DIR / source_image.filename
    if not source_path.exists():
        raise FileNotFoundError(f"Source image missing on disk: {source_path}")
    source_bytes = source_path.read_bytes()

    client = ComfyClient()
    comfy_filename = await client.upload_image(
        source_bytes, name=source_image.filename
    )

    # Pick the model by GPU VRAM: L4-class (≥ threshold) runs the sharper 13B,
    # a T4 falls back to 2B so it doesn't OOM. Unknown VRAM (probe failed) →
    # play safe with 2B.
    vram = await client.total_vram_gb()
    use_13b = vram is not None and vram >= settings.ltxv_vram_threshold_gb
    ckpt = settings.ltxv_ckpt_13b if use_13b else settings.ltxv_ckpt_2b

    v_width, v_height, v_steps, v_length = video_spec(quality, aspect_ratio)
    template = load_workflow("i2v_ltxv")
    workflow, resolved_seed = inject_i2v_ltxv(
        template,
        motion_prompt=motion_prompt,
        input_filename=comfy_filename,
        seed=None,
        width=v_width,
        height=v_height,
        steps=v_steps,
        length=v_length,
        ckpt_name=ckpt,
    )

    job = jobs.create(user_id, "video", motion_prompt, source)
    try:
        video_bytes, ext = await client.generate_video(
            workflow,
            timeout_seconds=settings.comfy_video_timeout_seconds,
            # Roomy cloud GPU keeps the model warm; only unload on the tight local box.
            free_after=settings.comfy_backend.lower() == "zimage",
            cancel_event=job.cancel_event,
            on_submit=job.set_running,
        )
    finally:
        jobs.remove(job.id)

    filename = f"{uuid.uuid4().hex}{ext}"
    _ensure_storage()
    (_STORAGE_DIR / filename).write_bytes(video_bytes)

    image = Image(
        user_id=user_id,
        prompt=motion_prompt,
        seed=resolved_seed,
        filename=filename,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image
