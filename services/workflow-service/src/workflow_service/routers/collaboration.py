import json
from typing import AsyncGenerator
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.workflow_service.collaboration import GraphChange, hub, merge_graph
from src.workflow_service.db import get_db
from src.workflow_service.models import Workflow, WorkflowVersion
from src.workflow_service.permissions import current_clerk_id, require_role

logger = structlog.get_logger()
router = APIRouter()


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _get_workflow(db: AsyncSession, workflow_id: UUID) -> Workflow:
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.post("/{workflow_id}/collab/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Refresh the caller's presence on a workflow."""
    clerk_id = current_clerk_id(request)
    workflow = await _get_workflow(db, workflow_id)
    await require_role(request, workflow.workspace_id, "viewer")
    await hub.heartbeat(workflow_id, clerk_id)
    return None


@router.get("/{workflow_id}/collab/presence")
async def presence(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return the user ids currently present on a workflow."""
    workflow = await _get_workflow(db, workflow_id)
    await require_role(request, workflow.workspace_id, "viewer")
    users = await hub.present_users(workflow_id)
    return {"workflow_id": str(workflow_id), "users": users}


@router.post("/{workflow_id}/collab/changes", status_code=status.HTTP_202_ACCEPTED)
async def apply_change(
    request: Request,
    workflow_id: UUID,
    change: GraphChange,
    db: AsyncSession = Depends(get_db),
):
    """Apply a graph change to the workflow's draft version and broadcast it.

    The change is merged into the latest draft version's graph and persisted,
    then published to the workflow's collaboration channel so other connected
    clients receive it in real time.
    """
    clerk_id = current_clerk_id(request)
    workflow = await _get_workflow(db, workflow_id)
    await require_role(request, workflow.workspace_id, "editor")

    # Merge into the latest draft version (or the root version if none is draft).
    result = await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow_id)
        .order_by(WorkflowVersion.version_number.desc())
    )
    version = result.scalars().first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workflow has no versions"
        )

    merged = merge_graph(version.graph, change)
    version.graph = merged
    await db.commit()

    change.actor = clerk_id
    await hub.publish(workflow_id, change)

    logger.info(
        "collab_change_applied",
        workflow_id=str(workflow_id),
        change_type=change.type,
        actor=clerk_id,
    )
    return {"ok": True, "graph": merged}


@router.get("/{workflow_id}/collab/stream")
async def stream_changes(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """SSE stream of collaboration events for a workflow.

    Emits ``presence`` events (the current user list) and ``change`` events
    (graph mutations) as they happen. The client should also POST heartbeats
    periodically to stay in the presence set.
    """
    clerk_id = current_clerk_id(request)
    workflow = await _get_workflow(db, workflow_id)
    await require_role(request, workflow.workspace_id, "viewer")

    async def event_stream() -> AsyncGenerator[str, None]:
        # Announce current presence immediately, then stream changes.
        await hub.heartbeat(workflow_id, clerk_id)
        users = await hub.present_users(workflow_id)
        yield _sse_event("presence", {"users": users})

        async for change in hub.subscribe(workflow_id):
            yield _sse_event("change", change.model_dump())

    return StreamingResponse(event_stream(), media_type="text/event-stream")