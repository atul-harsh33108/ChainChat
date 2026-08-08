import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import Any

import structlog
from redis import Redis
from rq import Queue
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from src.execution_service.ai import get_provider
from src.execution_service.config import settings
from src.execution_service.db import AsyncSessionLocal
from src.execution_service.models import Execution, ExecutionStep
from src.execution_service.rendering import render_prompt, resolve_variables

logger = structlog.get_logger()

_redis_conn = Redis.from_url(settings.redis_url)
queue = Queue("execution", connection=_redis_conn)


class ExecutionCancelledError(Exception):
    """Raised when an execution is cancelled while running."""


async def _load_execution(session: AsyncSession, execution_id: Any) -> Execution:
    result = await session.execute(
        select(Execution)
        .where(Execution.id == execution_id)
        .options(selectinload(Execution.steps))
    )
    return result.scalar_one()


async def _mark_step_status(
    session: AsyncSession,
    step: ExecutionStep,
    status: str,
    outputs: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    step.status = status
    if outputs is not None:
        step.outputs = outputs
    if error is not None:
        step.error_message = error

    now = datetime.now(timezone.utc)
    if status == "running" and step.started_at is None:
        step.started_at = now
    if status in ("completed", "failed"):
        step.completed_at = now

    await session.commit()


async def _check_cancelled(session: AsyncSession, execution: Execution) -> bool:
    await session.refresh(execution)
    return execution.status == "cancelled"


def _friendly_error(exc: Exception) -> str:
    """Turn provider HTTP errors into something a user can act on."""
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)

    if status == 429:
        return (
            "Rate limited by OpenRouter (429). Free models allow only a few "
            "requests per minute - wait a moment and run again."
        )
    if status in (401, 403):
        return f"Provider rejected the API key ({status}). Check OPENAI_API_KEY."
    if status == 404:
        return "Model not found (404). The model id may no longer exist on OpenRouter."
    if status is not None and response is not None:
        detail = ""
        try:
            payload = response.json()
            detail = payload.get("error", {}).get("message") or ""
        except Exception:
            detail = ""
        return f"Provider error {status}. {detail}".strip()
    return str(exc)


def _retry_delay(exc: Exception, attempt: int) -> float:
    """Back off longer for rate limits, honouring Retry-After when present."""
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)

    if status == 429:
        retry_after = (getattr(response, "headers", {}) or {}).get("retry-after")
        if retry_after:
            try:
                return min(float(retry_after), 30.0)
            except (TypeError, ValueError):
                pass
        # Exponential: 5s, 10s, 20s...
        return min(5.0 * (2**attempt), 30.0)
    return 1.0 * (attempt + 1)


async def _run_step_with_retries(
    session: AsyncSession,
    execution: Execution,
    step: ExecutionStep,
    upstream_outputs: dict[str, Any],
    input_payload: dict[str, Any],
    max_retries: int = 2,
) -> dict[str, Any]:
    provider = get_provider(step.provider)
    # input_payload is merged last so it always wins over an upstream step's
    # output when a key is present in both (Req 4.5), regardless of step
    # completion order.
    variables = resolve_variables(step.inputs or {}, upstream_outputs, input_payload)
    rendered = render_prompt(step.prompt or "", variables)

    for attempt in range(max_retries + 1):
        if await _check_cancelled(session, execution):
            raise ExecutionCancelledError()

        step.retry_count = attempt
        await _mark_step_status(session, step, "running")

        try:
            logger.info(
                "step_running",
                execution_id=str(execution.id),
                step_key=step.step_key,
                attempt=attempt,
            )
            text = await provider.complete(rendered, **{"model": step.model_key})
            outputs = {"text": text}
            await _mark_step_status(session, step, "completed", outputs=outputs)
            return outputs
        except Exception as exc:
            message = _friendly_error(exc)
            logger.warning(
                "step_failed",
                execution_id=str(execution.id),
                step_key=step.step_key,
                attempt=attempt,
                error=message,
            )
            if attempt >= max_retries:
                await _mark_step_status(session, step, "failed", error=message)
                raise RuntimeError(message) from exc
            await asyncio.sleep(_retry_delay(exc, attempt))

    return {}


async def _topological_steps(steps: list[ExecutionStep]) -> list[ExecutionStep]:
    step_map = {s.step_key: s for s in steps}
    in_degree = {s.step_key: len(s.depends_on or []) for s in steps}
    dependents: dict[str, list[str]] = {s.step_key: [] for s in steps}

    for s in steps:
        for dep in s.depends_on or []:
            if dep not in step_map:
                raise ValueError(f"Unknown dependency: {dep}")
            dependents[dep].append(s.step_key)

    ready = deque([key for key, deg in in_degree.items() if deg == 0])
    ordered: list[ExecutionStep] = []

    while ready:
        key = ready.popleft()
        ordered.append(step_map[key])
        for dep_key in dependents[key]:
            in_degree[dep_key] -= 1
            if in_degree[dep_key] == 0:
                ready.append(dep_key)

    if len(ordered) != len(steps):
        raise ValueError("Cycle detected in execution step dependencies")

    return ordered


async def run_execution(execution_id: Any, max_retries: int = 2) -> None:
    """Run all steps of an execution in dependency order with retries."""
    async with AsyncSessionLocal() as session:
        execution = await _load_execution(session, execution_id)
        if execution.status in ("completed", "failed", "cancelled"):
            logger.info("execution_already_terminal", status=execution.status)
            return

        execution.status = "running"
        await session.commit()

        input_payload: dict[str, Any] = dict(execution.input_payload or {})
        upstream_outputs: dict[str, Any] = {}
        context: dict[str, Any] = dict(input_payload)  # preserves existing output_payload shape

        try:
            ordered = await _topological_steps(list(execution.steps))
            for step in ordered:
                if await _check_cancelled(session, execution):
                    raise ExecutionCancelledError()

                outputs = await _run_step_with_retries(
                    session,
                    execution,
                    step,
                    upstream_outputs,
                    input_payload,
                    max_retries=max_retries,
                )
                upstream_outputs[step.step_key] = outputs
                context[step.step_key] = outputs

            execution.output_payload = context
            execution.status = "completed"
            logger.info("execution_completed", execution_id=str(execution.id))
        except ExecutionCancelledError:
            execution.status = "cancelled"
            logger.info("execution_cancelled", execution_id=str(execution.id))
        except Exception as exc:
            execution.status = "failed"
            execution.error_message = str(exc)
            logger.error("execution_failed", execution_id=str(execution.id), error=str(exc))
        finally:
            execution.updated_at = datetime.now(timezone.utc)
            await session.commit()


def run_execution_sync(execution_id: Any, max_retries: int = 2) -> None:
    """Synchronous wrapper for RQ workers."""
    asyncio.run(run_execution(execution_id, max_retries=max_retries))


def enqueue_execution(execution_id: Any) -> str:
    """Enqueue an execution job on the RQ queue."""
    job = queue.enqueue(run_execution_sync, str(execution_id))
    return str(job.id)
