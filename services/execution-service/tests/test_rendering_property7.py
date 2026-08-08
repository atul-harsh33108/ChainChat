"""Property test: rendering never raises.

# Feature: run-inputs-and-variables, Property 7: Rendering never raises

For any template string, any `input_payload`, and any set of
upstream-produced outputs, rendering SHALL never raise an exception,
regardless of unmatched braces, nested braces, doubled braces, or
non-string variable values.

Validates: Requirements 4.6, 4.7
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from src.execution_service.rendering import render_prompt

# Templates deliberately biased toward brace-heavy text (unmatched, nested,
# doubled) alongside plain text, so Hypothesis explores both "boring" and
# brace-pathological inputs rather than relying on uniform text sampling
# alone.
_brace_biased_text = st.text(
    alphabet=st.sampled_from("{}abcxyz_0129 \n\t"),
    max_size=50,
)

_template_strategy = st.one_of(_brace_biased_text, st.text(max_size=50))

# Arbitrary JSON-like variable values, including the {"text": v} shape and
# nested containers, to exercise _stringify with non-string types.
_json_scalar = st.one_of(
    st.text(max_size=20),
    st.integers(),
    st.floats(allow_nan=True, allow_infinity=True),
    st.booleans(),
    st.none(),
)

_json_value = st.recursive(
    _json_scalar,
    lambda children: st.one_of(
        st.lists(children, max_size=3),
        st.dictionaries(st.text(max_size=10), children, max_size=3),
    ),
    max_leaves=5,
)

_text_shaped_value = st.builds(lambda v: {"text": v}, _json_value)

_variable_value = st.one_of(_json_value, _text_shaped_value)

# Identifier-shaped keys are more likely to actually match a placeholder
# name than fully arbitrary text keys, so bias toward them while still
# allowing arbitrary text keys to cover unknown/malformed keys.
_identifier_key = st.from_regex(r"^[A-Za-z_][A-Za-z0-9_]{0,10}$", fullmatch=True)
_variables_key = st.one_of(_identifier_key, st.text(max_size=10))

_variables_strategy = st.dictionaries(_variables_key, _variable_value, max_size=8)


@settings(max_examples=100)
@given(
    template=_template_strategy,
    step_inputs=_variables_strategy,
    upstream_outputs=_variables_strategy,
    input_payload=_variables_strategy,
)
def test_render_prompt_never_raises(
    template: str,
    step_inputs: dict,
    upstream_outputs: dict,
    input_payload: dict,
) -> None:
    # Merge the three variable sources the way resolve_variables does
    # (input_payload last), then render. No exception should ever
    # propagate out of render_prompt, and the result must always be a str.
    variables = {**step_inputs, **upstream_outputs, **input_payload}

    result = render_prompt(template, variables)

    assert isinstance(result, str)


@settings(max_examples=100)
@given(template=_template_strategy, variables=_variables_strategy)
def test_render_prompt_never_raises_single_variable_source(
    template: str, variables: dict
) -> None:
    # Simpler single-source variant to directly exercise render_prompt's
    # own contract (never raises, always returns str) independent of the
    # three-way merge used in the engine.
    result = render_prompt(template, variables)

    assert isinstance(result, str)
