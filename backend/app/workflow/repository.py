from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Workflow


def create_workflow(
    db: Session, user_id: int, name: str | None, graph: dict[str, Any] | None
) -> Workflow:
    wf = Workflow(
        user_id=user_id,
        name=name or "Untitled workflow",
        graph=graph or {"nodes": [], "edges": []},
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return wf


def list_user_workflows(db: Session, user_id: int) -> list[Workflow]:
    stmt = (
        select(Workflow)
        .where(Workflow.user_id == user_id)
        .order_by(Workflow.updated_at.desc())
    )
    return list(db.scalars(stmt))


def get_user_workflow(
    db: Session, workflow_id: int, user_id: int
) -> Workflow | None:
    wf = db.get(Workflow, workflow_id)
    if wf is None or wf.user_id != user_id:
        return None
    return wf


def update_workflow(
    db: Session,
    workflow: Workflow,
    name: str | None,
    graph: dict[str, Any] | None,
) -> Workflow:
    if name is not None:
        workflow.name = name
    if graph is not None:
        workflow.graph = graph
    # Bump updated_at even if only one field changed (onupdate covers it, but
    # set explicitly so a graph-only save still reorders the sidebar list).
    workflow.updated_at = datetime.utcnow()
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


def delete_workflow(db: Session, workflow: Workflow) -> None:
    db.delete(workflow)
    db.commit()
