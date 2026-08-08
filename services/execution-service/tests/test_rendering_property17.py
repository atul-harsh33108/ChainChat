"""Property test: an input_payload key remains resolvable at every step.

Feature: run-inputs-and-variables, Property 17: An input_payload key remains
resolvable at every step of an execution
Validates: Requirements 8.3
"""

from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st

from src.execution_service.rendering import render_prompt, resolve_variables

_IDENTIFIER = st.from_regex(r"[A-Za-z_][A-Za-z0-9_]{0,15}", fullmatch=True)
_INPUT_PAYLOAD = st.dictionaries(
    keys=_IDENTIFIER, values=st.text(), min_size=1, max_size=5
)


@given(
    input_payload=_INPUT_PAYLOAD,
    key_index=st.integers(min_value=0, max_value=4),
    step_outputs=st.lists(st.text(), min_size=0, max_size=10),
)
@settings(max_examples=100)
def test_input_payload_key_resolvable_at_every_step(
    input_payload: dict[str, str], key_index: int, step_outputs: list[str]
) -> None:
    """A placeholder for an input_payload key resolves to that value at
    every synthetic step index, no matter how many prior steps have
    accumulated their own outputs into upstream_outputs."""
    keys = sorted(input_payload.keys())
    key = keys[key_index % len(keys)]
    expected_value = input_payload[key]
    template = "{" + key + "}"

    upstream_outputs: dict[str, Any] = {}
    for i, output_value in enumerate(step_outputs):
        upstream_outputs[f"step_{i}"] = {"text": output_value}

        variables = resolve_variables({}, upstream_outputs, input_payload)
        rendered = render_prompt(template, variables)

        assert rendered == expected_value
