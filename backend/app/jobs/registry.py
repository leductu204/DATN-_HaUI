"""In-process registry of ComfyUI jobs in flight.

Single-process only (module-level dict). Lets the FE show a global "what's
running" bar across chat + workflow and cancel a job, since the work lives on
the backend regardless of which page dispatched it.
"""
import asyncio
import time
import uuid
from dataclasses import dataclass, field


@dataclass
class Job:
    id: str
    user_id: int
    kind: str  # "generate" | "edit" | "video"
    label: str  # short prompt preview
    source: str  # "chat" | "workflow"
    created_at: float
    status: str = "queued"  # queued (waiting for GPU) | running
    comfy_prompt_id: str | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)

    def set_running(self, prompt_id: str) -> None:
        self.comfy_prompt_id = prompt_id
        self.status = "running"


_jobs: dict[str, Job] = {}


def create(user_id: int, kind: str, label: str, source: str = "chat") -> Job:
    job = Job(
        id=uuid.uuid4().hex,
        user_id=user_id,
        kind=kind,
        label=(label or "").strip()[:120],
        source=source,
        created_at=time.time(),
    )
    _jobs[job.id] = job
    return job


def remove(job_id: str) -> None:
    _jobs.pop(job_id, None)


def get(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def list_for_user(user_id: int) -> list[Job]:
    return [j for j in _jobs.values() if j.user_id == user_id]
