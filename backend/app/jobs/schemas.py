from pydantic import BaseModel


class JobOut(BaseModel):
    id: str
    kind: str  # generate | edit | video
    label: str
    source: str  # chat | workflow
    status: str  # queued | running
    age_seconds: float
