"""Quality + aspect-ratio presets shared by image and video generation.

A request carries a `quality` tier and an `aspect_ratio`; these map to concrete
(width, height, steps[, length]) the injectors patch into the ComfyUI workflow.
Centralised here so tuning the demo's speed/quality is a one-file change.
"""

# quality -> (long_side_px, steps)
QUALITY_IMAGE: dict[str, tuple[int, int]] = {
    "draft": (512, 8),
    "standard": (768, 14),
    "high": (1024, 24),
}

# quality -> (long_side_px, steps, frame_count). LTX needs length = 8n+1.
QUALITY_VIDEO: dict[str, tuple[int, int, int]] = {
    "draft": (512, 6, 65),
    "standard": (768, 8, 97),
    "high": (960, 10, 121),
}

# aspect_ratio -> (w_ratio, h_ratio)
ASPECTS: dict[str, tuple[int, int]] = {
    "1:1": (1, 1),
    "16:9": (16, 9),
    "9:16": (9, 16),
    "4:3": (4, 3),
    "3:4": (3, 4),
    "3:2": (3, 2),
    "2:3": (2, 3),
}

DEFAULT_QUALITY = "standard"
DEFAULT_ASPECT = "1:1"


def _round_to(value: float, multiple: int) -> int:
    return max(multiple, int(round(value / multiple)) * multiple)


def _dims(long_side: int, aspect: str, divisor: int) -> tuple[int, int]:
    rw, rh = ASPECTS.get(aspect, ASPECTS[DEFAULT_ASPECT])
    if rw >= rh:
        width, height = float(long_side), long_side * rh / rw
    else:
        width, height = long_side * rw / rh, float(long_side)
    return _round_to(width, divisor), _round_to(height, divisor)


def image_spec(quality: str | None, aspect: str | None) -> tuple[int, int, int]:
    """Return (width, height, steps) for an image request. Latent dims rounded
    to a multiple of 16."""
    long_side, steps = QUALITY_IMAGE.get(
        (quality or DEFAULT_QUALITY).lower(), QUALITY_IMAGE[DEFAULT_QUALITY]
    )
    width, height = _dims(long_side, (aspect or DEFAULT_ASPECT), 16)
    return width, height, steps


def video_spec(
    quality: str | None, aspect: str | None
) -> tuple[int, int, int, int]:
    """Return (width, height, steps, length) for a video request. LTX needs
    dims divisible by 32 and length = 8n+1 (the table values already satisfy)."""
    long_side, steps, length = QUALITY_VIDEO.get(
        (quality or DEFAULT_QUALITY).lower(), QUALITY_VIDEO[DEFAULT_QUALITY]
    )
    width, height = _dims(long_side, (aspect or DEFAULT_ASPECT), 32)
    return width, height, steps, length
