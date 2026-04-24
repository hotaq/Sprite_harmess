# Story 1.7: Run One-Shot Print Tasks with Text, JSON, and NDJSON Output

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to run one-shot tasks from the command line with structured output options,
so that Sprite Harness can be used in scripts and automation.

## Acceptance Criteria

1. Given the user runs `sprite --print "<task>"` or equivalent, when the task completes, fails, is cancelled, or stops for approval-required input, then `text` and `json` modes return only after the terminal state, and `json` output includes structured final status, summary, provider/model state, and correlation IDs.
2. Given the user selects `ndjson` output, when the runtime emits lifecycle events, then events stream as newline-delimited JSON as they occur, and the output remains schema-compatible with runtime event contracts.

## Tasks / Subtasks

- [x] Add a one-shot print execution path over `AgentRuntime` (AC: 1, 2)
  - [x] Add a core helper that runs a non-interactive task through the same runtime lifecycle used by interactive tasks.
  - [x] Keep CLI/print adapter code from owning or reconstructing canonical task state.
  - [x] Stop the current minimal first-task runtime at an explicit terminal state for `text` and `json`; if approval-required input is requested, preserve that waiting status in the output rather than inventing completion.
- [x] Add CLI flags for print mode and output selection (AC: 1, 2)
  - [x] Support `--print <task>` and `-p <task>` for one-shot execution.
  - [x] Support output mode selection for `text`, `json`, and `ndjson`, using existing config output defaults where practical.
  - [x] Keep existing positional task, `--steer`, and `--cancel` behavior working.
- [x] Implement structured `text`, `json`, and `ndjson` renderers (AC: 1, 2)
  - [x] For `text`, emit human-readable final task state, summary, provider/model state, correlation IDs, terminal or waiting state, and warnings.
  - [x] For `json`, emit one valid JSON object only after the final/waiting state is known; include final status, summary, provider/model state, session/task/correlation IDs, and events.
  - [x] For `ndjson`, write each runtime event as one newline-delimited JSON object as it is observed; do not rely on text parsing.
- [x] Add tests for one-shot output behavior (AC: 1, 2)
  - [x] Add CLI smoke tests for `--print`, `-p`, output mode selection, and config default interaction.
  - [x] Add JSON parse/assertions for single-result output.
  - [x] Add NDJSON line parsing that validates every line against the runtime event contract shape.
  - [x] Re-run `npm run build`, `npm run typecheck`, and `npm test`.

## Dev Notes

### Story Intent

Story 1.7 turns the runtime event contract from Story 1.6 into scriptable CLI output. The implementation should provide the first automation-friendly path without adding a second runtime loop, a second state model, or adapter-owned lifecycle truth.

The current runtime is still intentionally minimal: task planning creates a first loop and waits because repository inspection and tool execution are deferred to later stories. For Story 1.7, that means one-shot print mode must be honest about the current runtime status. It can finish a print command after the runtime reaches the current waiting or terminal boundary, but it must not pretend that tool execution or final summary generation exists yet.

### Previous Story Learnings

From Story 1.6:

- Runtime events are now first-class typed records emitted through `RuntimeEventBus`.
- `AgentRuntime.subscribeToEvents()` is the adapter-facing consumption path; adapters should render from emitted event objects.
- `AgentRuntime.getEventHistory(taskId?)` returns cloned event records so adapters cannot mutate canonical history.
- Runtime event records are schema-versioned and event-specific payloads are type-coupled through `RuntimeEventPayloadMap`.
- Subscriber exceptions must not abort task transitions.
- Existing CLI rendering in `createInteractiveTaskMessage()` already subscribes to runtime events and prints their types; reuse that pattern rather than parsing output text.

### Scope Boundaries

In scope:

- one-shot print CLI path
- output mode selection for `text`, `json`, and `ndjson`
- adapter rendering from runtime state/events
- structured JSON/NDJSON output compatible with runtime event contracts
- tests covering CLI output and event serialization

Out of scope for Story 1.7:

- full final summary model from Story 1.8
- real repository inspection, tool execution, validation, memory, or skill events
- JSON-RPC transport
- persisted session `events.ndjson` files
- TUI rendering
- provider network calls beyond existing provider state resolution

### Technical Requirements

- CLI entry remains in `packages/cli/src/index.ts` using Commander.
- Core runtime behavior remains in `packages/core`; CLI must not duplicate task lifecycle logic.
- `ndjson` output must serialize actual `RuntimeEventRecord` objects as they are observed.
- `json` output must be a single JSON object, not mixed with human text.
- Output must avoid leaking secrets; provider auth values must stay redacted as in prior stories.
- Output fields use `camelCase` and include at minimum:
  - `status`
  - `summary`
  - `sessionId`
  - `taskId`
  - `correlationId`
  - `provider`
  - `model`
  - `events`
  - `warnings`
  - `waitingState` and/or `terminalState` when present
- Prefer small rendering helpers over large CLI branching if the CLI starts getting hard to scan.

### Architecture Compliance

- Print mode is an adapter over `AgentRuntime`, not a separate runtime.
- Text, JSON, NDJSON, TUI, and RPC must all consume the same event stream over time.
- `text` and `json` modes return after the runtime reaches the current non-interactive stop boundary.
- `ndjson` streams lifecycle events as they occur through subscription.
- Runtime event names and payloads must remain schema-compatible with `packages/core/src/runtime-events.ts`.
- Keep Commander and presentation-specific code out of `packages/core`.

### File Structure Guidance

Expected implementation areas:

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `packages/cli/src/index.ts`
- optional renderer helpers under `packages/cli/src/` if needed
- `tests/cli-smoke.test.ts`
- `tests/runtime-events.test.ts` if additional event serialization contract coverage is needed

### Testing Requirements

- Existing tests must continue passing.
- Add CLI smoke coverage for:
  - `sprite --print "task"` default text output
  - `sprite -p "task"` alias behavior
  - JSON output parses as one object and includes status, summary, provider/model state, and IDs
  - NDJSON output parses line-by-line and each line matches the runtime event base shape
  - secrets such as `OPENAI_API_KEY` do not appear in text, JSON, or NDJSON output
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Story 1.7 definition: `_bmad-output/planning-artifacts/epics.md` (Story 1.7)
- PRD command/output requirements: `_bmad-output/planning-artifacts/prd.md` (Command Structure, Output Formats, FR7, FR8, FR88, NFR3, NFR4)
- Architecture output/event guidance: `_bmad-output/planning-artifacts/architecture.md` (runtime event stream, CLI adapter responsibilities, event base shape, naming rules)
- Previous implementation context: `_bmad-output/implementation-artifacts/1-6-emit-runtime-lifecycle-events-for-first-task-execution.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm test -- tests/cli-smoke.test.ts` (red phase: 3 expected failures before implementation)
- `npm run typecheck`
- `npm test -- tests/cli-smoke.test.ts` (13 tests)
- `npm run build`
- `npm run typecheck`
- `npm test` (40 tests)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added `runOneShotPrintTask` and output-format resolution helpers in core so print mode runs over `AgentRuntime` instead of adapter-owned task state.
- Added `--print <task>` / `-p <task>` and `--output <format>` CLI support for `text`, `json`, and `ndjson`.
- Text output now renders a human-readable one-shot result with status, summary, provider/model, IDs, terminal/waiting state, warnings, and events.
- JSON output returns a single structured result object with status, summary, provider/model state, session/task/correlation IDs, events, and redacted auth state.
- NDJSON output writes actual runtime event records as newline-delimited JSON through the runtime subscription path.
- Added CLI smoke tests for text, JSON, NDJSON/config default output, alias behavior, event schema validation, and secret redaction.

### File List

- `_bmad-output/implementation-artifacts/1-7-run-one-shot-print-tasks-with-text-json-and-ndjson-output.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/cli/src/index.ts`
- `tests/cli-smoke.test.ts`

### Change Log

- 2026-04-24: Created Story 1.7 with implementation context for one-shot print mode and text/json/ndjson output.
- 2026-04-24: Implemented one-shot print mode with text/json/ndjson output and moved story to review.
