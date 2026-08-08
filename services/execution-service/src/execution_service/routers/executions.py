import asyncio
import json
from typing import AsyncGenerator
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.execution_service.db import AsyncSessionLocal, get_db
from src.execution_service.engine import enqueue_execution
from src.execution_service.models import Execution, ExecutionStep
from src.execution_service.schemas import ExecutionCreate, ExecutionRead

logger = structlog.get_logger()
router = APIRouter()


async def _build_execution(session: AsyncSession, data: ExecutionCreate) -> Execution:
    execution = Execution(
        workspace_id=data.workspace_id,
        chain_id=data.chain_id,
        status="pending",
        input_payload=data.input_payload,
    )
    session.add(execution)
    await session.flush()

    for step_create in data.steps:
        step = ExecutionStep(
            execution_id=execution.id,
            step_key=step_create.step_key,
            depends_on=step_create.depends_on,
            conditions=step_create.conditions,
            provider=step_create.provider,
            model_key=step_create.model_key,
            prompt=step_create.prompt,
            inputs=step_create.inputs,
        )
        session.add(step)

    await session.commit()
    await session.refresh(execution)
    return execution


@router.post("", response_model=ExecutionRead, status_code=201)
async def create_execution(data: ExecutionCreate, db: AsyncSession = Depends(get_db)):
    execution = await _build_execution(db, data)
    logger.info("execution_created", execution_id=str(execution.id))
    enqueue_execution(execution.id)
    return execution


@router.get("", response_model=list[ExecutionRead])
async def list_executions(
    db: AsyncSession = Depends(get_db),
    chain_id: UUID | None = None,
    workspace_id: UUID | None = None,
    limit: int = 100,
    offset: int = 0,
):
    query = select(Execution)
    if chain_id:
        query = query.where(Execution.chain_id == chain_id)
    if workspace_id:
        query = query.where(Execution.workspace_id == workspace_id)
    result = await db.execute(
        query.order_by(desc(Execution.created_at)).limit(limit).offset(offset)
    )
    return result.scalars().all()


@router.get("/{execution_id}", response_model=ExecutionRead)
async def get_execution(execution_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Execution).where(Execution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _execution_stream(execution_id: UUID) -> AsyncGenerator[str, None]:
    """Poll the execution and emit SSE updates until it reaches a terminal state.

    Uses a fresh session per poll rather than the request-scoped one: the worker
    writes from a different session, and a long-lived session would keep serving
    stale identity-mapped rows (and outlive the request scope).
    """
    last_status: str | None = None
    last_step_count = -1

    while True:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Execution).where(Execution.id == execution_id)
            )
            execution = result.scalar_one_or_none()
            if not execution:
                yield _sse_event("error", {"detail": "Execution not found"})
                break

            status_value = execution.status
            steps = [
                {
                    "step_key": s.step_key,
                    "status": s.status,
                    "retry_count": s.retry_count,
                    "outputs": s.outputs,
                    "error_message": s.error_message,
                }
                for s in execution.steps
            ]

        payload = {"id": str(execution_id), "status": status_value, "steps": steps}

        if status_value != last_status or len(steps) != last_step_count:
            yield _sse_event("status", payload)
            last_status = status_value
            last_step_count = len(steps)

        if status_value in ("completed", "failed", "cancelled"):
            yield _sse_event("done", payload)
            break

        await asyncio.sleep(1)


@router.get("/{execution_id}/stream")
async def stream_execution(execution_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Execution).where(Execution.id == execution_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Execution not found")
    return StreamingResponse(
        _execution_stream(execution_id), media_type="text/event-stream"
    )


@router.post("/{execution_id}/cancel", response_model=ExecutionRead)
async def cancel_execution(execution_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Execution).where(Execution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.status in ("completed", "failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel execution in status {execution.status}",
        )

    execution.status = "cancelled"
    await db.commit()
    await db.refresh(execution)
    logger.info("execution_cancelled", execution_id=str(execution.id))
    return execution
