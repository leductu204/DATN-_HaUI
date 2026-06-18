from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Quality = Literal["draft", "standard", "high"]
AspectRatio = Literal["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]


MAX_COUNT = 4


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    seed: int | None = None  # null or negative = random
    quality: Quality = "standard"
    aspect_ratio: AspectRatio = "1:1"
    count: int = Field(default=1, ge=1, le=MAX_COUNT)


class ImageEditRequest(BaseModel):
    """Edit a SPECIFIC image by id (used by the workflow Image node when a
    reference image is wired in). The chat tool path edits the latest image
    instead — see orchestrator.edit_image."""

    image_id: int
    prompt: str = Field(min_length=1, max_length=2000)
    strength: float = Field(default=0.65, ge=0.0, le=1.0)
    quality: Quality = "standard"
    aspect_ratio: AspectRatio = "1:1"
    count: int = Field(default=1, ge=1, le=MAX_COUNT)


class VideoGenerateRequest(BaseModel):
    """Animate an existing owned image into a short clip (LTX-Video i2v). Used
    by the workflow Video node; the chat tool path animates the latest image."""

    image_id: int
    prompt: str = Field(min_length=1, max_length=2000)
    quality: Quality = "standard"
    aspect_ratio: AspectRatio = "16:9"
    count: int = Field(default=1, ge=1, le=MAX_COUNT)


class ImageOut(BaseModel):
    id: int
    prompt: str
    seed: int
    url: str
    created_at: datetime
