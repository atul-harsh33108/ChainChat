"""Unit test for engine.py's precedence integration.

Feature: run-inputs-and-variables
Validates: Requirements 4 (Criteria 4, 5); Requirement 8 (Criterion 3)
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from src.execution_service.engine import _run_step_with_retries
from src.execution_service.models import Execution, ExecutionStep


@pytest.mark.asyncio
async def test_run_step_with_retries_prefers_input_payload_over_upstream_output():
    """When a placeholder's key exists in both upstream_outputs and
    input_payload, the rendered prompt sent to the provider must reflect the
    input_payload's value, not the colliding upstream_outputs value (Req 4.4,
    4.5, 8.3).
    """
    execution = Execution(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        chain_id=uuid.uuid4(),
        status="running",  # not "cancelled", so _check_cancelled returns False
    )
    step = ExecutionStep(
        id=uuid.uuid4(),
        execution_id=execution.id,
        step_key="step_a",
        depends_on=[],
        provider="openrouter",
        model_key="google/gemma-4-31b-it:free",
        prompt="{key}",
        inputs={},
    )

    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    upstream_outputs = {"key": {"text": "upstream_value"}}
    input_payload = {"key": "input_value"}

    fake_provider = AsyncMock()
    fake_provider.complete = AsyncMock(return_value="ok")

    with patch(
        "src.execution_service.engine.get_provider", return_value=fake_provider
    ):
        outputs = await _run_step_with_retries(
            session, execution, step, upstream_outputs, input_payload
        )

    rendered = fake_provider.complete.call_args.args[0]
    assert rendered == "input_value"
    assert outputs == {"text": "ok"}
