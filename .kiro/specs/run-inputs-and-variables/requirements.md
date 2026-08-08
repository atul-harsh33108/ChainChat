# Requirements Document

## Introduction

ChainChat workflows currently execute a fixed chain of prompts with no way for a
runner to supply input at run time, and no way for an author to reference an
upstream step's output except by typing its raw, generator-assigned node id
(e.g. `prompt_lx8z1k`). This makes saved workflows brittle and non-reusable:
every run produces the same prompts, and editing a prompt to reference another
step requires knowing an internal identifier that is never shown in the UI.

"Run inputs & variables" closes this gap. Workflow authors declare named,
typed inputs on the Start node and assign human-readable reference keys to
Prompt nodes. Runners are presented with a form built from those declared
inputs before a run starts. The prompt editor gains a picker that lists every
variable a prompt is allowed to reference (declared inputs plus upstream
Prompt steps), and the run history shows exactly which input values produced
a given run. The feature is additive to the existing `WorkflowGraph` JSONB
shape and the existing `Execution.input_payload` column, so no schema
migration is required to store the new declarations, and workflows saved
before this feature shipped keep working unchanged.

## Glossary

- **Workflow_Builder**: The React/Vite single-page application page where
  users design a workflow graph and initiate runs
  (`apps/web/src/pages/workflow-builder.tsx`).
- **Workflow_Graph**: The `{ nodes, edges }` structure persisted verbatim in
  `WorkflowVersion.graph` (JSONB).
- **Start_Node**: A node in a Workflow_Graph whose `type` is `"start"`.
- **Prompt_Node**: A node in a Workflow_Graph whose `type` is `"prompt"`; the
  only node type that produces an Execution_Step.
- **Run_Input**: A named, typed input declared in a Start_Node's `config`,
  consisting of a key, a label, a field type, an optional default value, an
  optional help text, and a required flag.
- **Run_Input_Key**: The unique identifier of a Run_Input, valid as a
  `{placeholder}` name (matches `^[A-Za-z_][A-Za-z0-9_]*$`).
- **Step_Reference_Key**: The identifier by which a Prompt_Node's rendered
  output can be referenced as a `{placeholder}` in a downstream prompt.
  Defaults to the id-derived key produced by `toStepKey()` and may be
  overridden by the author with a custom, human-readable value.
- **Graph_Compiler**: The client-side module that converts a Workflow_Graph
  into a list of Execution_Steps and validates references before a run is
  submitted (`apps/web/src/lib/graph.ts`).
- **Execution_Step**: One entry of the `steps` array sent to
  `POST /api/v1/executions`, corresponding to one Prompt_Node.
- **Execution_Request**: The full payload sent to `POST /api/v1/executions`,
  containing `workspace_id`, `chain_id`, `input_payload`, and `steps`.
- **Execution_Engine**: The backend service that runs Execution_Steps in
  dependency order and renders each step's prompt
  (`services/execution-service/src/execution_service/engine.py`).
- **Run_Dialog**: The Workflow_Builder UI element presented to the runner to
  collect Run_Input values before an Execution_Request is submitted.
- **Variable_Picker**: The prompt editor UI control that lists insertable
  variable references (Run_Input_Keys and upstream Step_Reference_Keys).
- **Workflow_Runs_Page**: The page that lists past executions of a workflow
  and their outcomes (`apps/web/src/pages/workflow-runs.tsx`).
- **Upstream_Variable**: A Run_Input, or a Prompt_Node's Step_Reference_Key
  where that Prompt_Node is transitively reachable via incoming edges from
  the referencing Prompt_Node (as computed by `executableAncestors()`).

## Requirements

### Requirement 1: Declare Run Inputs on the Start Node

**User Story:** As a workflow author, I want to declare named inputs on the
Start node, so that anyone running the workflow can supply values without
editing the graph.

#### Acceptance Criteria

1. THE Workflow_Builder SHALL allow an author to add, edit, reorder, and
   remove Run_Inputs on a Start_Node, supporting up to a maximum of 50
   Run_Inputs per Start_Node.
2. THE Workflow_Builder SHALL require each Run_Input to have a non-empty
   Run_Input_Key of at most 64 characters, a non-empty label of at most 200
   characters, and a field type of `text`, `textarea`, `number`, or `select`.
3. WHERE a Run_Input's field type is `select`, THE Workflow_Builder SHALL
   require between 1 and 100 selectable options to be defined, with no two
   options on the same Run_Input being identical.
4. WHERE a Run_Input has a default value, THE Workflow_Builder SHALL store
   that default value alongside the Run_Input definition.
5. WHERE a Run_Input has help text or a placeholder string, THE
   Workflow_Builder SHALL store that text alongside the Run_Input definition,
   limited to at most 500 characters for help text and at most 200 characters
   for a placeholder.
6. THE Workflow_Builder SHALL store each Run_Input's required flag as either
   `true` or `false`, defaulting to `false` when not set by the author.
7. THE Workflow_Builder SHALL persist Run_Input definitions inside the
   Start_Node's `config` field as part of the Workflow_Graph, without
   requiring a change to the backend graph storage schema.
8. IF an author attempts to save two Run_Inputs on the same Start_Node with
   the same Run_Input_Key, THEN THE Workflow_Builder SHALL reject the save
   and report which key is duplicated.
9. IF an author enters a Run_Input_Key that does not match
   `^[A-Za-z_][A-Za-z0-9_]*$`, THEN THE Workflow_Builder SHALL reject the
   entry and report the allowed pattern.
10. IF an author attempts to save a Run_Input with an empty Run_Input_Key, an
    empty label, a Run_Input_Key or label exceeding its maximum length, a
    field type outside `text`, `textarea`, `number`, or `select`, or a
    `select` field type with fewer than 1 or more than 100 defined options,
    THEN THE Workflow_Builder SHALL reject the save and report which
    requirement was not met.
11. IF a Run_Input's default value does not conform to its field type (for
    example, a non-numeric default on a `number` field, or a default that is
    not one of the defined options on a `select` field), THEN THE
    Workflow_Builder SHALL reject the save and report the conflict between
    the default value and the field type.
12. IF an author attempts to add a Run_Input beyond the maximum of 50
    Run_Inputs on a single Start_Node, THEN THE Workflow_Builder SHALL
    reject the addition and report that the maximum has been reached.

**Correctness properties (suitable for property-based testing):**
- Round trip: for any list of valid Run_Input definitions, serializing them
  into a Start_Node's `config`, saving, reloading, and deserializing SHALL
  produce an equivalent list of Run_Input definitions (order, keys, labels,
  types, defaults, help text, and required flags preserved).
- Invariant: for any accepted set of Run_Inputs on a single Start_Node, all
  Run_Input_Keys SHALL be pairwise distinct and SHALL each match
  `^[A-Za-z_][A-Za-z0-9_]*$`.

---

### Requirement 2: Present a Run Dialog When Inputs Are Declared

**User Story:** As a person running a saved workflow, I want to fill in a
form for the workflow's declared inputs, so that I can control what the
workflow does without editing prompts.

#### Acceptance Criteria

1. WHEN a runner presses Run on a workflow whose Workflow_Graph declares one
   or more Run_Inputs, THE Workflow_Builder SHALL display the Run_Dialog
   before submitting an Execution_Request.
2. THE Run_Dialog SHALL render one form field per declared Run_Input, in the
   order those Run_Inputs are declared on the Workflow_Graph's Start_Node,
   using each Run_Input's label, field type, placeholder text, and help text.
3. WHERE a Run_Input has a default value, THE Run_Dialog SHALL pre-fill that
   Run_Input's form field with the default value.
4. WHERE a declared Run_Input's field type is select, THE Run_Dialog SHALL
   render that Run_Input's declared list of options as selectable choices
   and SHALL restrict that form field's value to one of those options.
5. WHEN a runner presses Run on a workflow whose Workflow_Graph declares no
   Run_Inputs, THE Workflow_Builder SHALL submit the Execution_Request
   immediately without displaying the Run_Dialog.
6. WHEN a runner confirms the Run_Dialog, THE Workflow_Builder SHALL submit
   an Execution_Request whose `input_payload` contains one entry per
   declared Run_Input, keyed by Run_Input_Key, with each entry's value equal
   exactly to the value entered or selected in that Run_Input's form field,
   without modification, truncation, or reformatting.
7. IF a runner dismisses the Run_Dialog via a Cancel control, an Escape key
   press, or a dialog-close control, THEN THE Workflow_Builder SHALL NOT
   submit an Execution_Request and SHALL close the Run_Dialog.

**Correctness properties (suitable for property-based testing):**
- Metamorphic: for any Workflow_Graph, the number of form fields rendered by
  the Run_Dialog SHALL equal the number of Run_Inputs declared on that
  Workflow_Graph's Start_Node.
- Order-preserving: for any Workflow_Graph, the sequence of Run_Input_Keys
  corresponding to the rendered form fields SHALL match the declaration
  order of Run_Inputs on that Workflow_Graph's Start_Node.

---

### Requirement 3: Validate Required Inputs Before Submission

**User Story:** As a person running a workflow, I want to be warned about
missing required inputs before the run starts, so that I do not waste a run
on incomplete data.

#### Acceptance Criteria

1. WHEN a runner confirms the Run_Dialog, THE Workflow_Builder SHALL check,
   in a single validation pass, every Run_Input marked required for a
   submitted value that is present and contains at least one non-whitespace
   character.
2. IF one or more required Run_Inputs have a submitted value that is
   missing, an empty string, or consists only of whitespace characters,
   THEN THE Workflow_Builder SHALL block submission, mark each such
   Run_Input as invalid, and preserve the currently submitted values of all
   other Run_Inputs in the Run_Dialog unchanged.
3. WHEN every required Run_Input has a submitted value that is present and
   contains at least one non-whitespace character, THE Workflow_Builder
   SHALL proceed to submit the Execution_Request.
4. WHILE a required Run_Input in the Run_Dialog is marked invalid, THE
   Workflow_Builder SHALL keep the Run_Dialog open and display a visible
   indicator on that Run_Input that distinguishes it from valid Run_Inputs.
5. WHEN a runner submits a value containing at least one non-whitespace
   character into a required Run_Input that is currently marked invalid,
   THE Workflow_Builder SHALL clear the invalid marking and the visible
   indicator for that Run_Input.

**Correctness properties (suitable for property-based testing):**
- Invariant: for any set of Run_Input definitions and any submitted values,
  submission SHALL be blocked if and only if at least one Run_Input with
  `required = true` has a submitted value that is missing, an empty string,
  or consists only of whitespace characters.
- Invariant: blocking submission SHALL NOT alter the submitted value of any
  Run_Input other than adding/removing its invalid marking and visible
  indicator.

---

### Requirement 4: Distinguish Missing, Empty, and Present Input Values at Render Time

**User Story:** As a workflow author, I want predictable prompt rendering
regardless of whether an input was left blank or never sent, so that I can
reason about what a run will produce.

#### Acceptance Criteria

1. WHEN an Execution_Step's prompt contains a recognised placeholder `{name}`
   and a value for key `name` is available — resolved from `input_payload`
   or from an upstream-produced output per the precedence rule in Criterion
   5 — as a non-empty string, or as an object of the form `{"text": v}`
   where `v` is a non-empty string, THE Execution_Engine SHALL substitute
   `v` into the rendered prompt in place of the placeholder.
2. WHEN an Execution_Step's prompt contains a recognised placeholder `{name}`
   and the resolved value for key `name` (per the precedence rule in
   Criterion 5) is an empty string, or an object of the form `{"text": v}`
   where `v` is an empty string, THE Execution_Engine SHALL substitute the
   empty string into the rendered prompt in place of the placeholder.
3. IF an Execution_Step's prompt contains a recognised placeholder `{name}`
   and no value for key `name` is available in either `input_payload` or
   any upstream-produced output, THEN THE Execution_Engine SHALL leave that
   placeholder unchanged in the rendered prompt.
4. WHEN an Execution_Step's prompt contains a recognised placeholder `{name}`
   and `input_payload` does not contain key `name` but an upstream step has
   produced output containing key `name`, THE Execution_Engine SHALL
   substitute the value produced by that upstream step into the rendered
   prompt, applying the same non-empty, empty, and plain-string vs.
   `{"text": v}` handling defined in Criteria 1 and 2.
5. IF an Execution_Step's prompt contains a recognised placeholder `{name}`
   and both `input_payload` contains key `name` and an upstream step has
   produced output containing key `name`, THEN THE Execution_Engine SHALL
   resolve the value from `input_payload` and SHALL NOT use the
   upstream-produced value for that placeholder.
6. THE Execution_Engine SHALL treat a substring of a prompt as a recognised
   placeholder only when it is a maximal, non-nested substring of the form
   `{name}` bounded by a single unescaped `{` and the next unescaped `}`
   with no intervening `{` or `}` characters, where `name` is a key that
   could appear in `input_payload` or in an upstream-produced output; any
   substring containing doubled brace characters (`{{`, `}}`), an unmatched
   `{` or `}`, or nested braces (a `{` occurring before the matching `}` of
   an enclosing pair) SHALL be treated as literal text and left unchanged in
   the rendered prompt.
7. THE Execution_Engine SHALL render every prompt template string to
   completion without raising an exception, for any `input_payload`, any
   set of upstream-produced outputs, and any substituted values regardless
   of whether they are strings, empty strings, non-string types, or objects
   of the form `{"text": v}`, including templates containing literal `{` or
   `}` characters not part of a recognised placeholder.

**Correctness properties (suitable for property-based testing):**
- Round trip / idempotence: for any template string containing no
  recognised placeholders that match a key resolvable from `input_payload`
  or upstream-produced outputs, rendering SHALL return the template
  unchanged, and rendering that output again SHALL produce the same string.
- Invariant: for any template string, any `input_payload`, and any set of
  upstream-produced outputs, rendering SHALL never raise an exception,
  regardless of unmatched braces, nested braces, or non-string variable
  values.
- Precedence: for any key present in both `input_payload` and an
  upstream-produced output, rendering SHALL produce the same output as
  rendering with only the `input_payload` value present.
- Metamorphic: for any template and any resolved variable, replacing a
  variable's dict value `{"text": v}` with the plain string `v` SHALL
  produce the same rendered output.

---

### Requirement 5: Prevent Ambiguous Collisions Between Input Keys and Step Reference Keys

**User Story:** As a workflow author, I want a clear error when a declared
input and a step's reference key share a name, so that I am not surprised by
which value a downstream prompt actually resolves to.

#### Acceptance Criteria

1. IF a Workflow_Graph declares a Run_Input whose Run_Input_Key is an exact,
   case-sensitive string match to the Step_Reference_Key of one or more
   Prompt_Nodes in the same Workflow_Graph, THEN THE Graph_Compiler SHALL
   reject the Workflow_Graph and report a validation error that identifies
   every colliding key.
2. THE Graph_Compiler SHALL perform the collision check described in Criterion
   1 for both author-assigned and default, id-derived Step_Reference_Keys.
3. IF the Graph_Compiler rejects a Workflow_Graph as described in Criterion 1,
   THEN THE Graph_Compiler SHALL prevent submission of any Execution_Request
   for that Workflow_Graph until the collision is resolved.

**Correctness properties (suitable for property-based testing):**
- Invariant: for any accepted (non-error) Workflow_Graph, the set of
  Run_Input_Keys and the set of Step_Reference_Keys SHALL be disjoint.

---

### Requirement 6: Assign Human-Readable Reference Keys to Prompt Steps

**User Story:** As a workflow author, I want to give a prompt step a
memorable name, so that I can reference its output from other prompts
without looking up a generated node id.

#### Acceptance Criteria

1. THE Workflow_Builder SHALL allow an author to set a custom
   Step_Reference_Key on a Prompt_Node.
2. WHEN an author does not set a custom Step_Reference_Key on a Prompt_Node,
   THE Graph_Compiler SHALL derive the Step_Reference_Key from the node id
   using the existing `toStepKey()` transformation.
3. IF an author enters a custom Step_Reference_Key that does not match
   `^[A-Za-z_][A-Za-z0-9_]*$` or exceeds 64 characters in length, THEN THE
   Workflow_Builder SHALL reject the entry and report the allowed pattern
   and maximum length.
4. IF an author sets a Step_Reference_Key, whether custom or derived, that
   is identical (using case-sensitive comparison) to another Prompt_Node's
   Step_Reference_Key within the same Workflow_Graph, or to any
   Run_Input_Key defined in that Workflow_Graph, THEN THE Graph_Compiler
   SHALL report a validation error identifying the duplicated key and
   SHALL prevent the Execution_Request from being submitted until the
   duplication is resolved.
5. WHEN an author renames a Prompt_Node's Step_Reference_Key, THE
   Workflow_Builder SHALL leave existing `{oldKey}` placeholders in other
   prompts unchanged rather than rewriting them automatically.
6. IF a rendered prompt contains a `{name}` placeholder whose `name` does
   not match, using case-sensitive comparison, any Run_Input_Key or any
   Upstream_Variable's Step_Reference_Key, THEN THE Graph_Compiler SHALL
   report a validation error identifying the unresolved reference and
   SHALL prevent the Execution_Request from being submitted until the
   reference is resolved.
7. THE Graph_Compiler SHALL load Workflow_Graphs saved before Step_Reference_
   Key assignment existed and SHALL derive each Prompt_Node's
   Step_Reference_Key using the same `toStepKey()` transformation used prior
   to this feature, so previously saved prompts continue to resolve their
   references without modification.

**Correctness properties (suitable for property-based testing):**
- Invariant: for any Workflow_Graph accepted by the Graph_Compiler, all
  Step_Reference_Keys SHALL be pairwise distinct and SHALL each match
  `^[A-Za-z_][A-Za-z0-9_]*$`.
- Stability: for any Workflow_Graph containing a Prompt_Node without a custom
  Step_Reference_Key, compiling that graph twice without modification SHALL
  produce the same Step_Reference_Key both times.
- Model-based: for any Prompt_Node lacking a custom Step_Reference_Key, the
  Graph_Compiler's derived key SHALL equal `toStepKey(node.id)`.

---

### Requirement 7: Insert Variable References From a Picker

**User Story:** As a workflow author, I want to pick a variable from a list
instead of typing an id, so that I don't introduce typos or reference
something unavailable.

#### Acceptance Criteria

1. WHEN an author opens the Variable_Picker for a Prompt_Node, THE
   Workflow_Builder SHALL list every Run_Input_Key declared on the
   Workflow_Graph's Start_Node and every Step_Reference_Key belonging to an
   Upstream_Variable of that Prompt_Node.
2. THE Workflow_Builder SHALL exclude the current Prompt_Node's own
   Step_Reference_Key and any non-upstream Prompt_Node's Step_Reference_Key
   from the Variable_Picker's list for that Prompt_Node.
3. WHEN an author selects an entry from the Variable_Picker while the prompt
   text has an active text selection, THE Workflow_Builder SHALL replace the
   selected text with the corresponding `{key}` placeholder.
4. WHEN an author selects an entry from the Variable_Picker while the prompt
   text has a cursor position and no active text selection, THE Workflow_
   Builder SHALL insert the corresponding `{key}` placeholder at that cursor
   position.
5. IF an author selects an entry from the Variable_Picker while the prompt
   text field has no established cursor position or text selection, THEN THE
   Workflow_Builder SHALL insert the corresponding `{key}` placeholder at the
   end of the prompt text.
6. WHILE a Prompt_Node has zero Upstream_Variables and zero declared
   Run_Inputs, THE Workflow_Builder SHALL display the Variable_Picker as
   empty rather than omitting it.

**Correctness properties (suitable for property-based testing):**
- Metamorphic: for any Workflow_Graph and any Prompt_Node, the set of entries
  offered by the Variable_Picker SHALL equal the union of that graph's
  Run_Input_Keys and the Step_Reference_Keys returned by
  `executableAncestors()` for that Prompt_Node, and SHALL never include that
  Prompt_Node's own Step_Reference_Key.
- Invariant: for any insertion triggered from the Variable_Picker, the
  resulting prompt text SHALL contain the inserted `{key}` placeholder
  exactly once more than before the insertion, and all prompt text outside
  the replaced or insertion point SHALL remain unchanged.

---

### Requirement 8: Submit Input Values With the Execution Request

**User Story:** As a workflow author, I want the values collected in the
Run_Dialog to actually reach my prompts, so that the run reflects what the
runner entered.

#### Acceptance Criteria

1. WHEN the Workflow_Builder submits an Execution_Request for a workflow
   with declared Run_Inputs, THE Workflow_Builder SHALL set
   `input_payload` to an object containing exactly one entry per declared
   Run_Input, keyed by Run_Input_Key, whose value is that Run_Input's form
   field value in the Run_Dialog at the time of submission, represented as a
   number for a Run_Input of type `number` and as a string for all other
   field types, using an empty string for any field the runner left blank
   with no default value.
2. WHEN the Workflow_Builder submits an Execution_Request for a workflow
   with no declared Run_Inputs, THE Workflow_Builder SHALL set
   `input_payload` to an empty object.
3. THE Execution_Engine SHALL include every key/value pair from the
   Execution's `input_payload` in the rendering context used to render every
   Execution_Step of that Execution, from the first step through the last,
   such that a key present in `input_payload` remains available for
   placeholder resolution regardless of how many steps have already been
   rendered.

**Correctness properties (suitable for property-based testing):**
- Round trip: for any set of Run_Input values collected in the Run_Dialog,
  the `input_payload` of the resulting Execution_Request SHALL contain a
  value for every declared Run_Input_Key equal to the collected value, and
  SHALL contain no additional keys.

---

### Requirement 9: Display Input Values in Run History

**User Story:** As a team member reviewing past runs, I want to see what
input values produced a given run, so that I can reproduce or audit it.

#### Acceptance Criteria

1. THE Workflow_Runs_Page SHALL display each listed run's `input_payload`
   key-value pairs alongside that run's status and steps, preserving the
   structure of nested objects and arrays so that scalar values, nested
   objects, and arrays remain visually distinguishable from one another.
2. IF a run's `input_payload` is an empty object, null, or otherwise absent,
   THEN THE Workflow_Runs_Page SHALL indicate that the run used no inputs
   rather than showing an empty section.
3. IF a run's `input_payload` contains a value whose corresponding
   Run_Input declaration is no longer present in the current Workflow_Graph,
   THEN THE Workflow_Runs_Page SHALL display that value keyed by its
   original Run_Input_Key.

---

### Requirement 10: Keep Existing Workflows and Runs Working Unchanged

**User Story:** As an existing ChainChat user, I want my previously saved
workflows and their run history to keep working after this feature ships, so
that I am not forced to edit old workflows.

#### Acceptance Criteria

1. WHEN the Workflow_Builder loads a Workflow_Graph whose Start_Node's
   `config` contains no Run_Input definitions (the field is absent, `null`,
   or an empty array), THE Workflow_Builder SHALL treat that Start_Node as
   declaring zero Run_Inputs.
2. WHEN the Workflow_Builder loads a Workflow_Graph whose Prompt_Nodes have
   no custom Step_Reference_Key, THE Graph_Compiler SHALL compile that graph
   to an Execution_Steps list with the same number of steps, in the same
   order, and with the same Step_Reference_Key values (derived per
   Requirement 6 Criterion 2) as it produced before this feature shipped.
3. IF an execution's `input_payload` is `null` or an empty object, THEN THE
   Workflow_Runs_Page SHALL render that execution's row without raising an
   error and SHALL indicate that the run used no inputs, per Requirement 9
   Criterion 2.
