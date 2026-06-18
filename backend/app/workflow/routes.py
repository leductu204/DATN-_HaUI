from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.workflow import repository
from app.workflow.schemas import (
    WorkflowCreate,
    WorkflowOut,
    WorkflowSummary,
    WorkflowUpdate,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("", response_model=WorkflowOut, status_code=201)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return repository.create_workflow(
        db, current_user.id, payload.name, payload.graph
    )


@router.get("", response_model=list[WorkflowSummary])
def list_workflows(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return repository.list_user_workflows(db, current_user.id)


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = repository.get_user_workflow(db, workflow_id, current_user.id)
    if wf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    return wf


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    workflow_id: int,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = repository.get_user_workflow(db, workflow_id, current_user.id)
    if wf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    return repository.update_workflow(db, wf, payload.name, payload.graph)


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = repository.get_user_workflow(db, workflow_id, current_user.id)
    if wf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    repository.delete_workflow(db, wf)
