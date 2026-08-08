"""Fixture-table-driven unit tests for render_prompt/extract_placeholder_names.

These are plain example-based tests (not Hypothesis-based) that consume the
shared fixture table at ``fixtures/placeholder-extraction-cases.json`` (repo
root), which is the single source of truth for the "maximal, non-nested,
non-doubled placeholder" rule shared between this backend module and the
frontend's `extractPlaceholders` in `graph.ts` (see task 7.4). Keeping both
suites reading the same file is what the design doc's Testing Strategy
"Consistency check" refers to.

Requirements: Requirement 4 (Criterion 6); Design > Testing Strategy
"Consistency check".
"""

import json
from pathlib import Path
from typing import Any

import pytest

from src.execution_service.rendering import extract_placeholder_names, render_prompt

# tests/ -> execution-service/ -> services/ -> repo root
_FIXTURES_PATH = (
    Path(__file__).resolve().parents[3] / "fixtures" / "placeholder-extraction-cases.json"
)


def _load_cases() -> list[dict[str, Any]]:
    assert _FIXTURES_PATH.is_file(), f"fixture file not found at {_FIXTURES_PATH}"
    with _FIXTURES_PATH.open(encoding="utf-8") as f:
        cases: list[dict[str, Any]] = json.load(f)
    assert cases, "fixture file loaded but contains no cases"
    return cases


_CASES = _load_cases()


@pytest.mark.parametrize("case", _CASES, ids=[case["name"] for case in _CASES])
def test_render_prompt_matches_fixture(case: dict[str, Any]) -> None:
    rendered = render_prompt(case["template"], case["variables"])
    assert rendered == case["expectedRendered"], (
        f"case {case['name']!r}: render_prompt({case['template']!r}, "
        f"{case['variables']!r}) == {rendered!r}, expected {case['expectedRendered']!r}"
    )


@pytest.mark.parametrize("case", _CASES, ids=[case["name"] for case in _CASES])
def test_extract_placeholder_names_matches_fixture(case: dict[str, Any]) -> None:
    names = extract_placeholder_names(case["template"])
    expected = set(case["expectedNames"])
    assert names == expected, (
        f"case {case['name']!r}: extract_placeholder_names({case['template']!r}) "
        f"== {names!r}, expected {expected!r}"
    )
