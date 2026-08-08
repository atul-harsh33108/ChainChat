"""Property-based test for prompt rendering identity/idempotence.

# Feature: run-inputs-and-variables, Property 6: Rendering is the identity when no placeholder resolves, and is idempotent on that output
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from src.execution_service.rendering import extract_placeholder_names, render_prompt

# Templates built from a small, mixed alphabet so both "normal" placeholder-
# shaped substrings and brace edge cases (doubled/nested/unmatched braces)
# show up frequently under generation.
_TEMPLATE_ALPHABET = "abcXYZ_012{} \n"

_templates = st.text(alphabet=_TEMPLATE_ALPHABET, max_size=60)

# Variable values are simple JSON-compatible scalars; their content is
# irrelevant to this property since none of them will be reachable by any
# placeholder name extracted from the generated template.
_variable_values = st.one_of(
    st.text(max_size=20),
    st.integers(),
    st.booleans(),
    st.none(),
)


@given(template=_templates, extra_variables=st.dictionaries(
    st.text(min_size=1, max_size=10), _variable_values, max_size=5
))
@settings(max_examples=100)
def test_render_prompt_is_identity_and_idempotent_when_no_placeholder_resolves(
    template: str, extra_variables: dict
) -> None:
    """For a template with no recognised placeholder resolvable against
    `variables`, render_prompt returns the template unchanged, and
    rendering that output again produces the same string."""
    # Strip out any candidate variable keys that happen to coincide with a
    # name the template actually references, so `variables` is guaranteed
    # to resolve none of the template's recognised placeholders.
    referenced_names = extract_placeholder_names(template)
    variables = {
        key: value
        for key, value in extra_variables.items()
        if key not in referenced_names
    }

    rendered_once = render_prompt(template, variables)
    assert rendered_once == template

    rendered_twice = render_prompt(rendered_once, variables)
    assert rendered_twice == rendered_once
