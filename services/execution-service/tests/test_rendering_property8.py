"""Property test: input_payload takes precedence over upstream output.

Feature: run-inputs-and-variables, Property 8: input_payload takes
precedence over upstream output for the same key
Validates: Requirements 4.4, 4.5
"""

from hypothesis import assume, given, settings
from hypothesis import strategies as st

from src.execution_service.rendering import render_prompt, resolve_variables

_IDENTIFIER = st.from_regex(r"[A-Za-z_][A-Za-z0-9_]{0,15}", fullmatch=True)


@given(
    key=_IDENTIFIER,
    upstream_value=st.text(),
    input_value=st.text(),
    step_inputs=st.dictionaries(_IDENTIFIER, st.text(), max_size=5),
    other_upstream_outputs=st.dictionaries(_IDENTIFIER, st.text(), max_size=5),
)
@settings(max_examples=100)
def test_input_payload_wins_over_colliding_upstream_output(
    key: str,
    upstream_value: str,
    input_value: str,
    step_inputs: dict[str, str],
    other_upstream_outputs: dict[str, str],
) -> None:
    """For a key present in both an upstream output and input_payload (with
    different values, so precedence actually matters), rendering the merged
    variables must equal rendering with only the input_payload value present
    for that key -- regardless of step_inputs or any other upstream outputs.
    """
    assume(upstream_value != input_value)

    # Ensure `key` really does collide: present in upstream_outputs with a
    # different value than in input_payload, no matter what the generated
    # `other_upstream_outputs` dict happened to contain for `key`.
    upstream_outputs = {**other_upstream_outputs, key: upstream_value}
    input_payload = {key: input_value}
    template = "{" + key + "}"

    variables_full = resolve_variables(step_inputs, upstream_outputs, input_payload)
    rendered_full = render_prompt(template, variables_full)

    variables_input_only = resolve_variables({}, {}, input_payload)
    rendered_input_only = render_prompt(template, variables_input_only)

    assert rendered_full == rendered_input_only
    assert rendered_full == input_value


@given(
    key=_IDENTIFIER,
    upstream_value=st.text(),
    input_value=st.text(),
    prefix=st.text(max_size=10),
    suffix=st.text(max_size=10),
)
@settings(max_examples=100)
def test_input_payload_wins_within_surrounding_text(
    key: str,
    upstream_value: str,
    input_value: str,
    prefix: str,
    suffix: str,
) -> None:
    """The precedence rule holds when the placeholder is embedded in a
    larger template alongside literal surrounding text."""
    assume(upstream_value != input_value)

    upstream_outputs = {key: upstream_value}
    input_payload = {key: input_value}
    template = f"{prefix}{{{key}}}{suffix}"

    variables_full = resolve_variables({}, upstream_outputs, input_payload)
    rendered_full = render_prompt(template, variables_full)

    variables_input_only = resolve_variables({}, {}, input_payload)
    rendered_input_only = render_prompt(template, variables_input_only)

    assert rendered_full == rendered_input_only
