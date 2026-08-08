"""Prompt template rendering and variable resolution.

Extracted from ``engine.py`` so the placeholder-substitution algorithm has
its own focused, heavily property-tested module. See ``design.md`` for
`run-inputs-and-variables` for the full rationale, including the "doubled
trailing brace" edge case handled below.
"""

import re
from typing import Any

_IDENT_START = re.compile(r"[A-Za-z_]")
_IDENT_CHAR = re.compile(r"[A-Za-z0-9_]")


def render_prompt(template: str, variables: dict[str, Any]) -> str:
    """Substitute maximal, non-nested ``{name}`` placeholders.

    A single left-to-right bracket-matching pass identifies which `{`/`}`
    pairs are "top level" (not nested inside another still-open `{`); a
    second pass substitutes a top-level pair only when its content is a
    valid identifier, it is not immediately adjacent to another brace
    (``{{``/``}}``), and the identifier is a known variable. Every other
    brace -- unmatched, nested, doubled, or referencing an unknown key -- is
    copied through unchanged. This never raises: the two passes are pure
    index arithmetic over `template`, and every substituted value is a
    JSON-decoded type (str/int/float/bool/None/dict/list), so `str(value)`
    cannot raise either.
    """
    if not template:
        return ""

    n = len(template)
    open_stack: list[int] = []
    top_level_pairs: dict[int, int] = {}

    for i, ch in enumerate(template):
        if ch == "{":
            open_stack.append(i)
        elif ch == "}":
            if not open_stack:
                continue  # unmatched '}': leave as literal text
            open_idx = open_stack.pop()
            if not open_stack:
                top_level_pairs[open_idx] = i
            # else: nested inside an outer, still-open '{' -- not recorded,
            # so it will be copied through literally in the pass below.

    def is_identifier(name: str) -> bool:
        return bool(name) and bool(_IDENT_START.match(name[0])) and all(
            _IDENT_CHAR.match(c) for c in name[1:]
        )

    result: list[str] = []
    i = 0
    while i < n:
        close_idx = top_level_pairs.get(i)
        if close_idx is not None:
            name = template[i + 1 : close_idx]
            doubled = (i > 0 and template[i - 1] == "{") or (
                close_idx + 1 < n and template[close_idx + 1] == "}"
            )
            if is_identifier(name) and not doubled and name in variables:
                result.append(_stringify(variables[name]))
                i = close_idx + 1
                continue
        result.append(template[i])
        i += 1

    return "".join(result)


def _stringify(value: Any) -> str:
    if isinstance(value, dict) and "text" in value:
        return str(value["text"])
    return str(value)


def resolve_variables(
    step_inputs: dict[str, Any],
    upstream_outputs: dict[str, Any],
    input_payload: dict[str, Any],
) -> dict[str, Any]:
    """Merge a step's rendering context with ``input_payload`` last.

    ``input_payload`` always wins on a key collision, regardless of
    dict-write order, satisfying Requirement 4 Criterion 5's precedence
    rule. Extracted as its own pure function so the precedence merge is
    property-testable without mocking the async DB session.
    """
    return {**step_inputs, **upstream_outputs, **input_payload}


def extract_placeholder_names(template: str) -> set[str]:
    """Names of every recognised placeholder in `template` (used for
    unresolved-reference validation; substitutes against `{n: n for n in
    ...}` so every syntactically valid identifier is treated as 'known'."""
    names: set[str] = set()
    render_prompt(template, _AllKnown(names))
    return names


class _AllKnown(dict):
    """A dict-like that reports every key as present and records it, so
    render_prompt's substitution pass doubles as name extraction without
    duplicating the bracket-matching logic."""

    def __init__(self, sink: set[str]) -> None:
        super().__init__()
        self._sink = sink

    def __contains__(self, key: object) -> bool:
        self._sink.add(str(key))
        return True

    def __getitem__(self, key: object) -> Any:
        return ""
