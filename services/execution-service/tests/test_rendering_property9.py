"""Property test: {"text": v} value and plain string v render identically.

Feature: run-inputs-and-variables, Property 9: A {"text": v} value and the
plain string v render identically
Validates: Requirements 4.1, 4.2
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from src.execution_service.rendering import render_prompt

_IDENTIFIER = st.from_regex(r"[A-Za-z_][A-Za-z0-9_]{0,15}", fullmatch=True)


@given(name=_IDENTIFIER, value=st.text())
@settings(max_examples=100)
def test_text_dict_equivalent_to_plain_string(name: str, value: str) -> None:
    template = "{" + name + "}"

    rendered_plain = render_prompt(template, {name: value})
    rendered_dict = render_prompt(template, {name: {"text": value}})

    assert rendered_plain == rendered_dict


@given(
    name=_IDENTIFIER,
    value=st.text(),
    prefix=st.text(max_size=10),
    suffix=st.text(max_size=10),
)
@settings(max_examples=100)
def test_text_dict_equivalent_to_plain_string_within_surrounding_text(
    name: str, value: str, prefix: str, suffix: str
) -> None:
    template = f"{prefix}{{{name}}}{suffix}"

    rendered_plain = render_prompt(template, {name: value})
    rendered_dict = render_prompt(template, {name: {"text": value}})

    assert rendered_plain == rendered_dict
