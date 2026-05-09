from datetime import datetime

from pydantic import BaseModel, Field


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    seed: int | None = None  # null or negative = random


class ImageOut(BaseModel):
    id: int
    prompt: str
    seed: int
    url: str
    created_at: datetime
