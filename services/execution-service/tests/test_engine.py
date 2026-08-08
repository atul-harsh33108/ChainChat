"""Unit test for engine.py's precedence integration.

Feature: run-inputs-and-variables
Validates: Requirements 4 (Criteria 4, 5); Requirement 8 (Criterion 3)
"""

import json
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


# --- Decision-node branching (GAP-08) ---------------------------------------
#
# Covers `_condition_met`, `_step_should_be_skipped`, and the `_mark_step_status`
# "skipped" terminal-status handling used by `run_execution`'s per-step gate.

from src.execution_service.engine import (
    _condition_met,
    _mark_step_status,
    _step_should_be_skipped,
)


class TestConditionMet:
    def test_contains_matches_case_insensitive_substring(self):
        upstream = {"extract": {"text": "This is Urgent news"}}
        condition = {"source_step": "extract", "op": "contains", "value": "urgent"}
        assert _condition_met(condition, upstream, set()) is True

    def test_contains_no_match_returns_false(self):
        upstream = {"extract": {"text": "This is routine news"}}
        condition = {"source_step": "extract", "op": "contains", "value": "urgent"}
        assert _condition_met(condition, upstream, set()) is False

    def test_equals_matches_after_trimming_whitespace(self):
        upstream = {"classify": {"text": "  positive  \n"}}
        condition = {"source_step": "classify", "op": "equals", "value": "positive"}
        assert _condition_met(condition, upstream, set()) is True

    def test_equals_mismatch_returns_false(self):
        upstream = {"classify": {"text": "negative"}}
        condition = {"source_step": "classify", "op": "equals", "value": "positive"}
        assert _condition_met(condition, upstream, set()) is False

    def test_not_empty_true_for_non_blank_text(self):
        upstream = {"summarize": {"text": "some summary"}}
        condition = {"source_step": "summarize", "op": "not_empty"}
        assert _condition_met(condition, upstream, set()) is True

    def test_not_empty_false_for_blank_text(self):
        upstream = {"summarize": {"text": "   "}}
        condition = {"source_step": "summarize", "op": "not_empty"}
        assert _condition_met(condition, upstream, set()) is False

    def test_unknown_op_returns_false(self):
        upstream = {"extract": {"text": "anything"}}
        condition = {"source_step": "extract", "op": "regex", "value": ".*"}
        assert _condition_met(condition, upstream, set()) is False

    def test_missing_source_step_returns_false(self):
        condition = {"op": "not_empty"}
        assert _condition_met(condition, {}, set()) is False

    def test_source_step_in_skipped_keys_returns_false(self):
        """A condition can never be met against a step that was itself
        skipped, so downstream branches cascade-skip instead of evaluating
        against a non-existent output."""
        upstream = {"extract": {}}
        condition = {"source_step": "extract", "op": "not_empty"}
        assert _condition_met(condition, upstream, {"extract"}) is False


class TestStepShouldBeSkipped:
    def _step(self, depends_on=None, conditions=None):
        return ExecutionStep(
            id=uuid.uuid4(),
            execution_id=uuid.uuid4(),
            step_key="step_b",
            depends_on=depends_on or [],
            conditions=conditions or [],
            provider="openrouter",
            model_key="google/gemma-4-31b-it:free",
            prompt="{extract}",
        )

    def test_no_conditions_and_no_skipped_deps_runs(self):
        step = self._step(depends_on=["extract"])
        upstream = {"extract": {"text": "urgent issue"}}
        assert _step_should_be_skipped(step, upstream, set()) is False

    def test_cascades_skip_when_a_dependency_was_skipped(self):
        step = self._step(depends_on=["extract"])
        assert _step_should_be_skipped(step, {}, {"extract"}) is True

    def test_skipped_when_condition_not_met(self):
        step = self._step(
            depends_on=["extract"],
            conditions=[{"source_step": "extract", "op": "contains", "value": "urgent"}],
        )
        upstream = {"extract": {"text": "routine update"}}
        assert _step_should_be_skipped(step, upstream, set()) is True

    def test_runs_when_condition_met(self):
        step = self._step(
            depends_on=["extract"],
            conditions=[{"source_step": "extract", "op": "contains", "value": "urgent"}],
        )
        upstream = {"extract": {"text": "urgent issue"}}
        assert _step_should_be_skipped(step, upstream, set()) is False

    def test_multiple_conditions_are_and_ed(self):
        step = self._step(
            depends_on=["extract"],
            conditions=[
                {"source_step": "extract", "op": "contains", "value": "urgent"},
                {"source_step": "extract", "op": "not_empty"},
            ],
        )
        # Second condition (not_empty) passes but first (contains) fails.
        upstream = {"extract": {"text": "routine update"}}
        assert _step_should_be_skipped(step, upstream, set()) is True


@pytest.mark.asyncio
async def test_mark_step_status_skipped_sets_completed_at():
    """'skipped' is a terminal status like 'completed'/'failed': it must set
    completed_at so run duration/ordering logic treats it as finished."""
    step = ExecutionStep(
        id=uuid.uuid4(),
        execution_id=uuid.uuid4(),
        step_key="step_c",
        depends_on=[],
        provider="openrouter",
        model_key="google/gemma-4-31b-it:free",
    )
    session = AsyncMock()
    session.commit = AsyncMock()

    await _mark_step_status(session, step, "skipped", outputs={})

    assert step.status == "skipped"
    assert step.outputs == {}
    assert step.completed_at is not None


# --- Output-node execution (format steps, GAP-08 completion) ---------------
#
# Covers `_format_output` and `_run_format_step`: an Output_Node becomes a
# real step (step_type="format") that reformats its single upstream
# dependency's text without calling any AI provider.

from src.execution_service.engine import _format_output, _run_format_step


class TestFormatOutput:
    def test_text_format_passes_through_verbatim(self):
        assert _format_output("text", "hello world") == {"text": "hello world"}

    def test_markdown_format_passes_through_verbatim(self):
        assert _format_output("markdown", "# Heading\n\nBody") == {
            "text": "# Heading\n\nBody"
        }

    def test_none_format_defaults_to_text_passthrough(self):
        assert _format_output(None, "plain") == {"text": "plain"}

    def test_json_format_parses_and_pretty_prints(self):
        result = _format_output("json", '{"a": 1, "b": [2, 3]}')
        assert result["json"] == {"a": 1, "b": [2, 3]}
        assert json.loads(result["text"]) == {"a": 1, "b": [2, 3]}

    def test_json_format_strips_fenced_code_block(self):
        fenced = '```json\n{"ok": true}\n```'
        result = _format_output("json", fenced)
        assert result["json"] == {"ok": True}

    def test_json_format_strips_fenced_code_block_without_language_tag(self):
        fenced = '```\n{"ok": true}\n```'
        result = _format_output("json", fenced)
        assert result["json"] == {"ok": True}

    def test_json_format_invalid_json_reports_error_without_raising(self):
        result = _format_output("json", "not json at all")
        assert result["text"] == "not json at all"
        assert "format_error" in result
        assert "json" not in result


@pytest.mark.asyncio
async def test_run_format_step_reformats_single_upstream_dependency():
    step = ExecutionStep(
        id=uuid.uuid4(),
        execution_id=uuid.uuid4(),
        step_key="render",
        depends_on=["extract"],
        step_type="format",
        format="json",
        provider="openrouter",
        model_key="google/gemma-4-31b-it:free",
    )
    session = AsyncMock()
    session.commit = AsyncMock()
    upstream_outputs = {"extract": {"text": '{"score": 5}'}}

    outputs = await _run_format_step(session, step, upstream_outputs)

    assert outputs["json"] == {"score": 5}
    assert step.status == "completed"
    assert step.outputs == outputs
    assert step.completed_at is not None


@pytest.mark.asyncio
async def test_run_format_step_with_no_dependency_formats_empty_text():
    step = ExecutionStep(
        id=uuid.uuid4(),
        execution_id=uuid.uuid4(),
        step_key="render",
        depends_on=[],
        step_type="format",
        format="text",
        provider="openrouter",
        model_key="google/gemma-4-31b-it:free",
    )
    session = AsyncMock()
    session.commit = AsyncMock()

    outputs = await _run_format_step(session, step, {})

    assert outputs == {"text": ""}
    assert step.status == "completed"


class TestFormatStepSkipCascading:
    """A format step (Output_Node) is just another step to `_step_should_be_skipped`:
    it cascade-skips like any other step when its single dependency was skipped."""

    def test_format_step_cascades_skip_from_skipped_dependency(self):
        step = ExecutionStep(
            id=uuid.uuid4(),
            execution_id=uuid.uuid4(),
            step_key="render",
            depends_on=["extract"],
            step_type="format",
            format="text",
            provider="openrouter",
            model_key="google/gemma-4-31b-it:free",
        )
        assert _step_should_be_skipped(step, {}, {"extract"}) is True

    def test_format_step_runs_when_dependency_not_skipped(self):
        step = ExecutionStep(
            id=uuid.uuid4(),
            execution_id=uuid.uuid4(),
            step_key="render",
            depends_on=["extract"],
            step_type="format",
            format="text",
            provider="openrouter",
            model_key="google/gemma-4-31b-it:free",
        )
        upstream = {"extract": {"text": "some text"}}
        assert _step_should_be_skipped(step, upstream, set()) is False
