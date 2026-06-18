import time

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.comfyui.client import ComfyClient
from app.db.models import User
from app.jobs import registry
from app.jobs.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobOut])
def list_jobs(current_user: User = Depends(get_current_user)):
    now = time.time()
    jobs = sorted(registry.list_for_user(current_user.id), key=lambda j: j.created_at)
    return [
        JobOut(
            id=j.id,
            kind=j.kind,
            label=j.label,
            source=j.source,
            status=j.status,
            age_seconds=round(now - j.created_at, 1),
        )
        for j in jobs
    ]


@router.post("/{job_id}/cancel", status_code=202)
async def cancel_job(job_id: str, current_user: User = Depends(get_current_user)):
    job = registry.get(job_id)
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    # Signal the waiting coroutine to abort, and ask ComfyUI to stop the running
    # prompt. Queued jobs (still waiting for the GPU lock) abort before submit.
    job.cancel_event.set()
    if job.comfy_prompt_id:
        await ComfyClient().interrupt()
    return {"status": "cancelling"}
