# Implementation Plan: Run Inputs & Variables

## Overview

This plan implements Run Inputs (declared, typed inputs on the Start node,
collected via a Run Dialog before execution) and Variables (human-readable
Step Reference Keys plus a Variable Picker for referencing them) as
described in `requirements.md` and `design.md`. Work proceeds bottom-up:
shared test fixtures and dependencies first, then the backend rendering fix
(`rendering.py` + `engine.py`), then the frontend pure libraries
(`types/index.ts`, `run-inputs.ts`, `graph.ts`, `input-payload-display.ts`),
then the UI components, then wiring into `workflow-builder.tsx` and
`workflow-runs.tsx`.

Each property test implements exactly one numbered property from
`design.md`'s Correctness Properties section and is tagged with a comment:
`Feature: run-inputs-and-variables, Property {N}: {property text}`. Per
`design.md`'s Testing Strategy, property-based tests apply only to pure
functions (`rendering.py`, `run-inputs.ts`, `graph.ts`,
`input-payload-display.ts`); UI components (`run-input-editor.tsx`,
`variable-picker.tsx`, `run-dialog.tsx`, `workflow-runs.tsx`,
`workflow-builder.tsx`) are covered with React Testing Library example-based
tests instead, following the existing `pages/__tests__/landing.test.tsx`
convention. Each property test lives in its own test file (one property per
file) so independent properties can be implemented and reviewed in
parallel without colliding on the same test file.

Out of scope (per the design and explicit instruction): RBAC/permissions,
per-node model settings beyond the existing `NodeConfig.model`, and
branching/conditional execution.

## Tasks

- [x] 1. Set up property-testing dependencies and the shared placeholder-extraction fixture table
  - [x] 1.1 Add `fast-check` and `hypothesis` as pinned dev dependencies
    - Add `"fast-check": "4.9.0"` to `apps/web/package.json` `devDependencies`.
    - Add `hypothesis==6.165.2` to `services/execution-service/requirements-dev.txt`.
    - _Requirements: Design > Testing Strategy (frontend/backend property test tooling)_

  - [x] 1.2 Create the shared placeholder-extraction fixture table
    - Create `fixtures/placeholder-extraction-cases.json` at the repo root (new
      top-level directory; no existing shared location exists between
      `apps/web` and `services/execution-service`). Each entry has the shape
      `{"name": string, "template": string, "variables": Record<string, unknown>, "expectedRendered": string, "expectedNames": string[]}`,
      covering: doubled braces (`{{x}}`), nested braces (`{a{b}c}`), unmatched
      braces (`{x`, `x}`), a valid placeholder immediately followed by an
      extra `}` (`{name}}`), adjacent placeholders (`{a}{b}`), Unicode
      identifiers being rejected (non-ASCII names are not recognised
      placeholders per the `^[A-Za-z_][A-Za-z0-9_]*$` pattern), an unknown
      identifier left literal, and a `{"text": v}`-shaped variable value.
    - This file is the single source of truth consumed read-only by both the
      Python test in task 2.7 and the TypeScript test in task 7.4 (loaded via
      `json.load`/`fs.readFileSync` + `JSON.parse`, not a compiled import, so
      no `tsconfig`/build changes are needed).
    - _Requirements: Requirement 4 (Criterion 6), Requirement 6 (Criterion 6); Design > Testing Strategy "Consistency check"_

- [x] 2. Implement prompt rendering (execution-service)
  - [x] 2.1 Implement `services/execution-service/src/execution_service/rendering.py`
    - Implement `render_prompt(template, variables)`: single left-to-right
      bracket-matching pass to find top-level (non-nested) `{...}` pairs,
      then substitute only pairs whose content is a valid identifier, not
      adjacent to another brace, and present in `variables`; everything else
      (unmatched, nested, doubled braces, unknown identifiers) passes through
      literally. Stringify a `{"text": v}` dict value as `str(v)`, otherwise
      `str(value)`.
    - Implement `resolve_variables(step_inputs, upstream_outputs,
      input_payload)`: a pure merge helper returning
      `{**step_inputs, **upstream_outputs, **input_payload}` so
      `input_payload` always wins on a key collision, regardless of
      dict-write order. Extracting this as its own pure function (rather than
      inlining the merge in `engine.py`) is what makes the precedence rule
      (Requirement 4 Criterion 5) property-testable without mocking the
      database session.
    - Implement `extract_placeholder_names(template)` using the `_AllKnown`
      dict-like sink technique from `design.md` so it reuses
      `render_prompt`'s bracket-matching logic instead of duplicating it.
    - _Requirements: Requirement 4 (Criteria 1, 2, 3, 4, 6, 7); Design > Components and Interfaces > `rendering.py`_

  - [x]* 2.2 Write property test for rendering identity/idempotence
    - File: `services/execution-service/tests/test_rendering_property6.py`
    - **Property 6: Rendering is the identity when no placeholder resolves, and is idempotent on that output**
    - **Validates: Requirements 4.3**

  - [x]* 2.3 Write property test for rendering never raising
    - File: `services/execution-service/tests/test_rendering_property7.py`
    - **Property 7: Rendering never raises**
    - **Validates: Requirements 4.6, 4.7**

  - [x]* 2.4 Write property test for `{"text": v}` vs. plain-string equivalence
    - File: `services/execution-service/tests/test_rendering_property9.py`
    - **Property 9: A `{"text": v}` value and the plain string `v` render identically**
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 2.5 Write property test for `input_payload` precedence
    - File: `services/execution-service/tests/test_rendering_property8.py`
    - Exercises `resolve_variables` + `render_prompt` together: for a key
      present in both an upstream output and `input_payload`, the rendered
      result must equal rendering with only the `input_payload` value.
    - **Property 8: `input_payload` takes precedence over upstream output for the same key**
    - **Validates: Requirements 4.4, 4.5**

  - [x]* 2.6 Write property test for per-step resolvability of `input_payload` keys
    - File: `services/execution-service/tests/test_rendering_property17.py`
    - Simulates N synthetic steps accumulating `upstream_outputs`; for every
      step index, a placeholder matching an `input_payload` key must resolve
      to that value regardless of how many steps have already completed.
    - **Property 17: An `input_payload` key remains resolvable at every step of an execution**
    - **Validates: Requirements 8.3**

  - [x]* 2.7 Write fixture-table-driven unit tests for `render_prompt`/`extract_placeholder_names`
    - File: `services/execution-service/tests/test_rendering_fixtures.py`
    - Loads `fixtures/placeholder-extraction-cases.json` (task 1.2) and
      asserts `render_prompt(case.template, case.variables) ==
      case.expectedRendered` and `extract_placeholder_names(case.template) ==
      set(case.expectedNames)` for every case, pinning down the ambiguous
      `{name}}` edge case called out in `design.md`.
    - _Requirements: Requirement 4 (Criterion 6); Design > Testing Strategy "Consistency check"_

- [x] 3. Fix engine.py precedence using rendering.py
  - [x] 3.1 Update `engine.py` to render via `resolve_variables` + `render_prompt`
    - Import `render_prompt` and `resolve_variables` from `rendering.py`.
    - In `_run_step_with_retries`, replace the inline
      `variables = {**(step.inputs or {}), **context}` /
      `_render_prompt(...)` calls with
      `variables = resolve_variables(step.inputs or {}, upstream_outputs, input_payload)`
      and `rendered = render_prompt(step.prompt or "", variables)`, threading
      `upstream_outputs` and `input_payload` as separate parameters instead
      of one merged `context` dict.
    - In `run_execution`, keep seeding `input_payload = dict(execution.input_payload or {})`
      and accumulate `upstream_outputs` separately from the `context` dict
      used for `output_payload`, so `output_payload`'s existing shape
      (inputs + all step outputs merged) is unchanged.
    - Delete the now-unused private `_render_prompt` and `_PLACEHOLDER` regex
      from `engine.py`.
    - _Requirements: Requirement 4 (Criteria 4, 5); Requirement 8 (Criterion 3); Design > Overview "Two pre-existing gaps", Design > Components and Interfaces > `engine.py` changes_

  - [x]* 3.2 Write unit test for engine.py's precedence integration
    - File: `services/execution-service/tests/test_engine.py`
    - Construct an `ExecutionStep`-like object and a mocked `AsyncSession`
      (`unittest.mock.AsyncMock`) to call `_run_step_with_retries` directly
      with a stubbed provider, asserting the rendered prompt reflects
      `input_payload` over a colliding `upstream_outputs` value.
    - _Requirements: Requirement 4 (Criteria 4, 5); Requirement 8 (Criterion 3)_

- [ ] 4. Checkpoint - backend rendering and precedence
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add Run Input and Step Reference Key types
  - [x] 5.1 Extend `apps/web/src/types/index.ts`
    - Add `RunInputFieldType = 'text' | 'textarea' | 'number' | 'select'`.
    - Add the `RunInputDef` interface (`key`, `label`, `fieldType`,
      `required`, `defaultValue?`, `helpText?`, `placeholder?`, `options?`)
      exactly as specified in `design.md`.
    - Add `runInputs?: RunInputDef[]` and `stepKey?: string` to `NodeConfig`.
    - _Requirements: Requirement 1 (Criteria 2, 4, 5, 6); Requirement 6 (Criterion 1); Design > Components and Interfaces > Frontend types_

- [x] 6. Implement the run-inputs.ts library
  - [x] 6.1 Implement `apps/web/src/lib/run-inputs.ts`
    - Export `RUN_INPUT_KEY_PATTERN` and `MAX_RUN_INPUTS = 50`.
    - Implement `getStartNode(graph)`, `getRunInputs(graph)` (treating an
      absent/`null`/empty-array `config.runInputs` as `[]`, per Requirement
      10 Criterion 1), `isBlank(value)`.
    - Implement `validateRunInput(candidate, siblings)` checking key
      non-empty/length/pattern/uniqueness, label non-empty/length, `fieldType`
      enum, `select` option count (1-100) and uniqueness, `defaultValue`
      conformance to `fieldType`, and the 50-sibling ceiling.
    - Implement `buildInputPayload(defs, formValues)`: one entry per declared
      `RunInputDef`, number-typed for `fieldType === 'number'`, string
      otherwise, `''` for a blank field with no default.
    - _Requirements: Requirement 1 (Criteria 1, 2, 3, 6, 8, 9, 10, 11, 12); Requirement 3 (Criteria 1, 2); Requirement 8 (Criteria 1, 2); Requirement 10 (Criterion 1); Design > Components and Interfaces > `run-inputs.ts`_

  - [x]* 6.2 Write property test for Run_Input round-tripping through storage
    - File: `apps/web/src/lib/__tests__/run-inputs.property-2.test.ts`
    - **Property 2: Run_Input declarations round-trip through storage**
    - **Validates: Requirements 1.1, 1.4, 1.5, 1.6, 1.7**

  - [x]* 6.3 Write property test for `validateRunInput`'s acceptance predicate
    - File: `apps/web/src/lib/__tests__/run-inputs.property-1.test.ts`
    - **Property 1: Run_Input acceptance is a well-formedness predicate**
    - **Validates: Requirements 1.2, 1.3, 1.9, 1.10, 1.11, 1.12**

  - [x]* 6.4 Write unit tests for representative invalid Run_Input error strings
    - File: `apps/web/src/lib/__tests__/run-inputs.errors.test.ts`
    - Covers a handful of concrete invalid shapes (bad key pattern, key too
      long, duplicate key, empty label, `select` with 0 options, `select`
      with a non-member default, `number` with a non-numeric default, 51st
      Run_Input) and asserts each produces a specific, identifying message.
    - _Requirements: Requirement 1 (Criterion 10)_

  - [x]* 6.5 Write property test for `buildInputPayload`'s exactness
    - File: `apps/web/src/lib/__tests__/run-inputs.property-16.test.ts`
    - **Property 16: The submitted `input_payload` is exactly the collected Run_Input values**
    - **Validates: Requirements 8.1, 8.2**

- [x] 7. Extend graph.ts with variable/reference-key support and validation
  - [x] 7.1 Export `executableAncestors` and add `stepReferenceKey`
    - Promote the existing closure-local `executableAncestors` inside
      `graphToSteps` to a standalone, exported, graph-scoped function
      `executableAncestors(graph, nodeId): string[]`.
    - Add `stepReferenceKey(node): string`: returns `node.config?.stepKey`
      when set and non-empty, else `toStepKey(node.id)`.
    - Update `graphToSteps` to use `stepReferenceKey(node)` in place of
      `toStepKey(node.id)` when assigning `step_key` and `depends_on`.
    - _Requirements: Requirement 6 (Criteria 1, 2, 7); Requirement 7 (Criterion 1); Design > Components and Interfaces > `graph.ts` edited_

  - [x]* 7.2 Write property test for `stepReferenceKey` stability
    - File: `apps/web/src/lib/__tests__/graph.property-12.test.ts`
    - **Property 12: A Prompt_Node's derived Step_Reference_Key is stable and matches `toStepKey`**
    - **Validates: Requirements 6.2, 6.7**

  - [x] 7.3 Implement `extractPlaceholders` in graph.ts
    - Export `extractPlaceholders(template): string[]` implementing the same
      "maximal, non-nested, non-doubled" bracket-matching rule as
      `rendering.render_prompt`/`extract_placeholder_names`, mirrored
      client-side (extracting names only, no substitution).
    - _Requirements: Requirement 6 (Criterion 6); Design > Components and Interfaces > `graph.ts` edited (note on duplicating the placeholder-extraction rule)_

  - [x]* 7.4 Write fixture-table-driven unit tests for `extractPlaceholders`
    - File: `apps/web/src/lib/__tests__/graph.placeholders.test.ts`
    - Loads `fixtures/placeholder-extraction-cases.json` (task 1.2) and
      asserts `extractPlaceholders(case.template)` matches
      `case.expectedNames` for every case, keeping this extractor consistent
      with the backend's `extract_placeholder_names`.
    - _Requirements: Requirement 6 (Criterion 6); Design > Testing Strategy "Consistency check"_

  - [x] 7.5 Add collision, well-formedness, and unresolved-reference validation to `graphToSteps`
    - After building `steps`, append three checks to the existing `errors`
      array (alongside the current "no prompt text" / "duplicate step keys"
      checks, unchanged):
      1. Reference-key collisions: any key present in both
         `getRunInputs(graph).map(d => d.key)` and
         `executable.map(stepReferenceKey)`, and any `stepReferenceKey`
         duplicated across two or more Prompt nodes.
      2. Reference-key well-formedness: any `stepReferenceKey` not matching
         `RUN_INPUT_KEY_PATTERN` or exceeding 64 characters.
      3. Unresolved placeholder references: for each Prompt node, every name
         from `extractPlaceholders(node.config?.prompt)` not present in that
         node's `Run_Input_Keys ∪ executableAncestors(graph, node.id).map(stepReferenceKey)`.
    - _Requirements: Requirement 5 (Criteria 1, 2, 3); Requirement 6 (Criteria 4, 6); Design > Components and Interfaces > `graph.ts` edited (`graphToSteps` changes)_

  - [x]* 7.6 Write property test for collision-free accepted-graph key namespace
    - File: `apps/web/src/lib/__tests__/graph.property-10.test.ts`
    - **Property 10: Accepted graphs have a well-formed, collision-free key namespace**
    - **Validates: Requirements 5.1, 5.2, 6.4**

  - [x]* 7.7 Write property test for unresolved-reference rejection
    - File: `apps/web/src/lib/__tests__/graph.property-11.test.ts`
    - **Property 11: Every recognised placeholder in an accepted graph resolves to a declared name**
    - **Validates: Requirements 6.6**

  - [x]* 7.8 Write property test for rename non-propagation
    - File: `apps/web/src/lib/__tests__/graph.property-13.test.ts`
    - Asserts that recompiling a graph after changing one Prompt node's
      `config.stepKey` leaves every node's `config.prompt` text (and thus
      any `{oldKey}` placeholders within it) byte-for-byte unchanged.
    - **Property 13: Renaming a Step_Reference_Key does not rewrite other prompts**
    - **Validates: Requirements 6.5**

  - [x]* 7.9 Write property test for Variable_Picker entry composition
    - File: `apps/web/src/lib/__tests__/graph.property-14.test.ts`
    - Asserts `[...getRunInputs(graph).map(d => d.key),
      ...executableAncestors(graph, nodeId).map(id =>
      stepReferenceKey(byId(id)))]` equals the union of Run_Input_Keys and
      upstream Step_Reference_Keys, and never contains the node's own key.
    - **Property 14: The Variable_Picker's entries are exactly the Run_Inputs plus upstream steps**
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 7.10 Write regression test for legacy graphs
    - File: `apps/web/src/lib/__tests__/graph.legacy.test.ts`
    - A fixture graph with no `runInputs` and no `stepKey` on any node must
      compile via `graphToSteps` to the same number of steps, same order, and
      same `step_key` values as it did before this feature (derived
      `toStepKey(node.id)` for every step).
    - _Requirements: Requirement 10 (Criteria 1, 2)_

- [x] 8. Implement input-payload-display.ts
  - [x] 8.1 Implement `apps/web/src/lib/input-payload-display.ts`
    - Implement `classifyInputValue(value): 'scalar' | 'array' | 'object'`
      and `hasNoInputs(payload): boolean` (true for `null`, `undefined`, or
      an object with zero own enumerable keys).
    - _Requirements: Requirement 9 (Criteria 1, 2); Requirement 10 (Criterion 3); Design > Components and Interfaces > `input-payload-display.ts`_

  - [x]* 8.2 Write property test for `classifyInputValue`
    - File: `apps/web/src/lib/__tests__/input-payload-display.property-18.test.ts`
    - **Property 18: The Runs Page's value classifier matches JSON's own structure**
    - **Validates: Requirements 9.1**

  - [x]* 8.3 Write property test for `hasNoInputs`
    - File: `apps/web/src/lib/__tests__/input-payload-display.property-19.test.ts`
    - **Property 19: The "no inputs" predicate matches null, undefined, and empty-object payloads exactly**
    - **Validates: Requirements 9.2, 10.3**

- [ ] 9. Checkpoint - core libraries and validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build the Run Input editor (Start node inspector)
  - [x] 10.1 Implement `apps/web/src/components/workflow/run-input-editor.tsx`
    - Row-based editor over `RunInputDef[]`: add (disabled at
      `MAX_RUN_INPUTS`), edit, reorder (up/down), remove. Each row calls
      `validateRunInput` on change, shows inline errors, and blocks
      committing an invalid row. Commits via
      `updateSelectedConfig({ runInputs: nextDefs })`.
    - _Requirements: Requirement 1 (Criteria 1, 8, 9, 10, 11, 12); Design > Components and Interfaces > `run-input-editor.tsx`_

  - [x]* 10.2 Write RTL unit tests for the Run Input editor
    - File: `apps/web/src/components/workflow/__tests__/run-input-editor.test.tsx`
    - Covers: adding/editing/reordering/removing a row; "Add" disabled at 50
      Run_Inputs; an inline error shown for an invalid key/label/select
      option set, and the offending change not committed while invalid.
    - _Requirements: Requirement 1 (Criteria 1, 8, 9, 10, 11, 12)_

- [x] 11. Build the Variable Picker
  - [x] 11.1 Implement `apps/web/src/components/workflow/variable-picker.tsx`
    - `DropdownMenu`-based trigger listing `entries: string[]`; shows an
      empty-state item when `entries` is empty. On selection, inserts
      `` `{${key}}` `` into the target textarea using
      `selectionStart`/`selectionEnd` (defaulting to `value.length` if the
      element was never focused), replacing an active selection or inserting
      at the cursor otherwise, then restores focus after the inserted text.
    - _Requirements: Requirement 7 (Criteria 1, 2, 3, 4, 5, 6); Design > Components and Interfaces > `variable-picker.tsx`_

  - [x]* 11.2 Write RTL unit tests for the Variable Picker
    - File: `apps/web/src/components/workflow/__tests__/variable-picker.test.tsx`
    - Covers the three insertion scenarios (active selection replaced, cursor
      position with no selection, no established cursor -> appended at end)
      each leaving surrounding text unchanged and adding exactly one
      placeholder occurrence, plus the empty-entries empty-state.
    - **Property 15: Inserting a variable reference adds exactly one placeholder and preserves surrounding text** (exercised as RTL examples per Design > Testing Strategy, not fast-check, since this is UI behavior)
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6**

- [x] 12. Build the Run Dialog
  - [x] 12.1 Implement `apps/web/src/components/workflow/run-dialog.tsx`
    - Local `values`/`invalid` state seeded from `defaultValue`s. Renders one
      field per `RunInputDef` in array order (`Input`/`Textarea`/`Select`
      matching `fieldType`). On confirm, marks blank required fields
      invalid and keeps other values untouched if any are invalid; otherwise
      calls `onConfirm(buildInputPayload(runInputs, values))`. Clears a
      field's invalid flag as soon as it receives a non-whitespace value.
      Any non-confirm dismissal (Cancel, Escape, overlay/close) calls
      `onCancel` and never `onConfirm`.
    - _Requirements: Requirement 2 (Criteria 1, 2, 3, 4, 5, 6, 7); Requirement 3 (Criteria 1, 2, 3, 4, 5); Design > Components and Interfaces > `run-dialog.tsx`_

  - [x]* 12.2 Write RTL unit tests for the Run Dialog
    - File: `apps/web/src/components/workflow/__tests__/run-dialog.test.tsx`
    - Covers: field count/order/labels matching declared Run_Inputs;
      default-value pre-fill; `select` options restriction; blocking
      confirmation with a blank required field while preserving other field
      values and showing an invalid indicator; clearing the invalid
      indicator on input; Cancel/Escape/close-button never calling
      `onConfirm`.
    - _Requirements: Requirement 2 (Criteria 1, 2, 3, 4, 5, 6, 7); Requirement 3 (Criteria 1, 2, 3, 4, 5)_

- [x] 13. Wire Run Inputs and the Variable Picker into workflow-builder.tsx
  - [x] 13.1 Wire the Start node inspector to `run-input-editor.tsx`
    - Replace the current "Only Prompt nodes call a model" branch for
      `nodeType === 'start'` with `<RunInputEditor>` bound to
      `selected.data.config.runInputs`.
    - _Requirements: Requirement 1 (Criterion 1); Design > Components and Interfaces > `run-input-editor.tsx`_

  - [x] 13.2 Wire the Prompt node inspector's Variable Picker
    - Compute `entries` for the selected Prompt node
      (`getRunInputs(graph).map(d => d.key)` concatenated with
      `executableAncestors(graph, selected.id).map(id => stepReferenceKey(...))`)
      and render `<VariablePicker entries={entries} .../>` next to the
      prompt `Textarea`, replacing the current static hint paragraph.
    - _Requirements: Requirement 7 (Criteria 1, 2); Design > Components and Interfaces > `variable-picker.tsx` (workflow-builder.tsx wiring)_

  - [x] 13.3 Add `pendingRun` state and conditional `RunDialog` rendering
    - Add `const [pendingRun, setPendingRun] = useState<{ workflowId: string; graph: WorkflowGraph } | null>(null)`
      and render `<RunDialog>` when `pendingRun` is set, per `design.md`'s
      exact wiring (`onCancel` clears `pendingRun`; `onConfirm` clears it and
      calls `submitRun`).
    - _Requirements: Requirement 2 (Criteria 1, 7); Design > Components and Interfaces > `workflow-builder.tsx` (edited)_

  - [x] 13.4 Update `handleRun`/`submitRun` to branch on declared Run_Inputs
    - Extract `submitRun(workflowId, graph, inputPayload)` (the existing
      `runWorkflow.mutateAsync` + toast logic). `handleRun` calls
      `handleSave()`, then `getRunInputs(buildGraph())`: if non-empty, sets
      `pendingRun` and returns; if empty, calls `submitRun(id, graph, {})`
      directly.
    - _Requirements: Requirement 2 (Criteria 1, 5, 6); Requirement 8 (Criteria 1, 2, 3); Design > Components and Interfaces > `workflow-builder.tsx` (edited)_

  - [ ]* 13.5 Write RTL unit test for the run-submission branch
    - File: `apps/web/src/pages/__tests__/workflow-builder.test.tsx`
    - Asserts pressing Run opens the Run Dialog when the graph's Start node
      declares Run_Inputs, and submits immediately with `input_payload: {}`
      when it declares none.
    - _Requirements: Requirement 2 (Criteria 1, 5)_

- [x] 14. Display run inputs on the Workflow Runs page
  - [x] 14.1 Add an Inputs block to `workflow-runs.tsx`
    - Insert the `dl`/`dt`/`dd` block from `design.md` after each run's
      header and before its step list, using `hasNoInputs(run.input_payload)`
      to show "No inputs" and `classifyInputValue` to switch between inline
      scalar rendering and a `<pre>`-formatted JSON block, iterating
      `Object.entries(run.input_payload)` directly (not the current graph's
      declared Run_Inputs).
    - _Requirements: Requirement 9 (Criteria 1, 2, 3); Requirement 10 (Criterion 3); Design > Components and Interfaces > `workflow-runs.tsx` (edited)_

  - [ ]* 14.2 Write RTL unit tests for the Inputs block
    - File: `apps/web/src/pages/__tests__/workflow-runs.test.tsx`
    - Covers: "No inputs" rendered for `null`/absent/empty-object
      `input_payload`; scalar values rendered inline; nested
      object/array values rendered as formatted JSON; a key with no matching
      current-graph Run_Input declaration (orphaned key) still rendered.
    - _Requirements: Requirement 9 (Criteria 1, 2, 3); Requirement 10 (Criterion 3)_

- [ ] 15. Final checkpoint - full feature verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a
  faster MVP; core implementation tasks are never marked optional.
- Property tests are one-property-per-file by convention in this plan so
  independent properties can be implemented in parallel without editing the
  same test file.
- `fixtures/placeholder-extraction-cases.json` (task 1.2) is the single
  source of truth for the "maximal, non-nested, non-doubled placeholder"
  rule shared by `rendering.py` (backend, render-time) and `graph.ts`
  (frontend, compile-time validation); both test suites read it, neither
  side hand-maintains a duplicate list.
- `resolve_variables` (task 2.1) is a small refactor beyond `design.md`'s
  illustrative inline-merge snippet in `engine.py`: extracting the
  precedence merge into its own pure function in `rendering.py` keeps
  Properties 8 and 17 testable without mocking the async DB session, while
  preserving the exact merge order (`input_payload` last) `design.md`
  specifies.
- No backend schema migration is required anywhere in this plan — every new
  field (`NodeConfig.runInputs`, `NodeConfig.stepKey`) lives inside existing
  JSON(B) columns.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "5.1", "8.1"] },
    { "id": 1, "tasks": ["3.1", "6.1", "7.1", "8.2", "8.3", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 2, "tasks": ["3.2", "6.2", "6.3", "6.4", "6.5", "7.2", "7.3", "7.8", "10.1", "11.1", "12.1"] },
    { "id": 3, "tasks": ["7.4", "7.5", "10.2", "11.2", "12.2", "14.1"] },
    { "id": 4, "tasks": ["7.6", "7.7", "7.9", "7.10", "13.1", "14.2"] },
    { "id": 5, "tasks": ["13.2"] },
    { "id": 6, "tasks": ["13.3"] },
    { "id": 7, "tasks": ["13.4"] },
    { "id": 8, "tasks": ["13.5"] }
  ]
}
```
