from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkflowCreate(BaseModel):
    name: str | None = None
    # React Flow graph snapshot. Optional on create (new boards start empty).
    graph: dict[str, Any] | None = None


class WorkflowUpdate(BaseModel):
    """Patch a workflow. Both fields optional — only the present ones change."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    graph: dict[str, Any] | None = None


class WorkflowSummary(BaseModel):
    """Lightweight row for the sidebar list — no graph payload."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    updated_at: datetime


class WorkflowOut(WorkflowSummary):
    graph: dict[str, Any]
