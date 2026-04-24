# Story 1.8: Produce Final Summary for First Runnable Task

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want every completed task to produce a concise final summary,
so that I can understand what the agent did and what remains uncertain.

## Acceptance Criteria

1. Given a task reaches a completed, failed, cancelled, or approval-required terminal state, when the runtime finalizes the task, then the user receives a final summary with final status, task result, provider/model used, important events, and unresolved risks when available, and the final summary is derived from runtime state/events rather than adapter-local text parsing.
2. Given the task did not run tools or validation yet, when the final summary is generated, then it explicitly states what was not attempted and remains valid for the first minimal runtime task.

## Tasks / Subtasks

- [x] Add a runtime-owned final summary model for first-task execution (AC: 1, 2)
  - [x] Define typed summary fields in core, including status, result text, provider/model, important events, unresolved risks, and not-attempted notes.
  - [x] Build the summary from `PlannedExecutionFlow` and runtime event records; do not parse CLI text.
  - [x] Include approval-required waiting as the current non-interactive stop boundary without pretending the task completed.
- [x] Attach final summaries to one-shot print results (AC: 1, 2)
  - [x] Extend `OneShotPrintTaskResult` with the runtime final summary.
  - [x] Keep existing top-level Story 1.7 fields backward-compatible where practical.
  - [x] Ensure JSON output contains the structured final summary object.
- [x] Render final summaries in CLI text output (AC: 1, 2)
  - [x] Show concise final status, task result, provider/model, important events, unresolved risks, and not-attempted notes.
  - [x] Avoid adapter-local lifecycle reconstruction; render the summary returned by core.
  - [x] Preserve `ndjson` behavior as raw runtime event records only.
- [x] Add tests for final summary behavior (AC: 1, 2)
  - [x] Add core tests for generated summaries across max-iterations, cancelled, completed, failed, and approval-required states where practical.
  - [x] Add CLI smoke assertions for text and JSON summary output.
  - [x] Confirm minimal runtime summaries explicitly state no tool execution and no validation occurred.
  - [x] Re-run `npm run build`, `npm run typecheck`, and `npm test`.

## Dev Notes

### Story Intent

Story 1.8 gives the runtime a canonical final summary for the current first runnable task. The implementation should not add real tool execution, validation, session persistence, learning review, or model-generated summaries yet. It should summarize the minimal runtime truth honestly: planning happened, tool execution and validation have not started, and one-shot print mode currently stops at the configured boundary.

The important architectural move is ownership: final summary data belongs in `packages/core`, and CLI output should render that data. Do not let `packages/cli` infer final task truth by parsing text, event names, or status strings on its own.

### Previous Story Learnings

From Story 1.7:

- `runOneShotPrintTask()` is the non-interactive execution path over `AgentRuntime`.
- `OneShotPrintTaskResult` already carries task, status, provider/model state, IDs, waiting/terminal state, warnings, and events.
- Text and JSON renderers live in `packages/cli/src/index.ts`; they should stay presentation-only.
- NDJSON output writes actual runtime event records via `AgentRuntime.subscribeToEvents()` and must remain schema-compatible with `packages/core/src/runtime-events.ts`.
- Existing CLI tests verify text, JSON, NDJSON, alias behavior, event validation, and secret redaction.

### Scope Boundaries

In scope:

- runtime-owned final summary shape for the first minimal task
- final summary generation from `PlannedExecutionFlow` plus runtime events
- summary exposure through one-shot print text and JSON output
- honest not-attempted notes for tools and validation
- tests for runtime summary generation and CLI rendering

Out of scope for Story 1.8:

- real repository inspection, file editing, command execution, or validation
- model-generated narrative summaries
- persisted session summary artifacts
- learning review or memory candidate generation
- JSON-RPC or TUI summary retrieval
- changing runtime event schema unless strictly required

### Technical Requirements

- Core runtime behavior remains in `packages/core`; CLI must only render the returned summary.
- Prefer a small pure helper such as `createFinalTaskSummary(state)` over embedding summary assembly in CLI code.
- Summary fields must use `camelCase` and avoid secrets.
- The summary should include at minimum:
  - `status`
  - `result`
  - `provider`
  - `model`
  - `importantEvents`
  - `unresolvedRisks`
  - `notAttempted`
  - `sessionId`
  - `taskId`
  - `correlationId`
- Important events should be selected from runtime event records, preserving stable event IDs and types.
- The current minimal runtime should include not-attempted notes for repository inspection/tool execution and validation.
- Approval-required waiting should be treated as a final summary boundary for one-shot print mode, with status still reflecting `waiting-for-input`.

### Architecture Compliance

- The runtime event stream is the source of lifecycle truth.
- CLI, TUI, print mode, and RPC must stay thin adapters over `AgentRuntime`.
- Runtime summaries must be rebuildable from runtime state/events, not hidden adapter state.
- Event records must remain append-only and schema-compatible.
- Provider auth state must remain redacted; never include raw auth values or environment secrets in summaries.

### File Structure Guidance

Expected implementation areas:

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/task-state.ts`
- `packages/core/src/runtime-loop.ts` if summary source data needs light adjustment
- `packages/cli/src/index.ts`
- `tests/runtime-loop.test.ts`
- `tests/cli-smoke.test.ts`

Avoid new packages or dependencies for this story.

### Testing Requirements

- Existing tests must continue passing.
- Add runtime tests that assert final summaries:
  - are generated from runtime-owned state
  - include status, result, provider/model, IDs, important events, unresolved risks, and not-attempted notes
  - represent cancelled, completed, failed/max-iterations, and approval-required boundaries honestly
- Add CLI tests that assert:
  - text output includes a `Final summary:` section
  - JSON output includes a structured `finalSummary`
  - minimal runtime output states tools and validation were not attempted
  - no secret such as `OPENAI_API_KEY` appears in output
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Story 1.8 definition: `_bmad-output/planning-artifacts/epics.md` (Story 1.8)
- PRD final summary requirements: `_bmad-output/planning-artifacts/prd.md` (FR6, CLI one-shot journey, final task summary expectations)
- Architecture summary/event guidance: `_bmad-output/planning-artifacts/architecture.md` (runtime event stream, format patterns, CLI adapter responsibilities, anti-patterns)
- Previous implementation context: `_bmad-output/implementation-artifacts/1-7-run-one-shot-print-tasks-with-text-json-and-ndjson-output.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm test -- tests/runtime-loop.test.ts tests/cli-smoke.test.ts` (red phase: 5 expected failures before implementation)
- `npm test -- tests/runtime-loop.test.ts tests/cli-smoke.test.ts` (25 tests)
- `npm run build`
- `npm run typecheck`
- `npm test` (43 tests)
- `npm test -- tests/runtime-loop.test.ts tests/cli-smoke.test.ts` (review fix: 25 tests)
- `npm run build` (review fix)
- `npm run typecheck` (review fix)
- `npm test` (review fix: 43 tests)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added runtime-owned final summary generation in core with status, result, provider/model, IDs, important events, unresolved risks, and not-attempted notes.
- Extended one-shot print results with `finalSummary` while preserving existing top-level result fields.
- Updated CLI text output to render the runtime final summary and left NDJSON output as raw runtime events only.
- Added runtime tests for max-iterations, cancelled, completed, failed, approval-required, and one-shot summary exposure.
- Added CLI smoke assertions for text and JSON final summary output, including explicit tool/validation not-attempted notes and secret redaction.
- Review fix: terminal interactive CLI output now also renders the runtime final summary for cancelled tasks.

### File List

- `_bmad-output/implementation-artifacts/1-8-produce-final-summary-for-first-runnable-task.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/cli/src/index.ts`
- `tests/runtime-loop.test.ts`
- `tests/cli-smoke.test.ts`

### Change Log

- 2026-04-24: Created Story 1.8 with implementation context for runtime-owned final summaries.
- 2026-04-24: Implemented runtime-owned final summaries for first runnable tasks and moved story to review.
- 2026-04-24: Addressed review gap by rendering final summaries for interactive terminal CLI output and moved story to done.
