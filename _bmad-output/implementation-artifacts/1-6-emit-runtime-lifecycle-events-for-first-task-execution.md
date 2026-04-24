# Story 1.6: Emit Runtime Lifecycle Events for First Task Execution

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want the runtime to emit structured lifecycle events,  
so that CLI, print mode, TUI, RPC, audit, and tests can observe the same task truth.

## Acceptance Criteria

1. Given a task starts and progresses, when the runtime changes task state, plan state, provider state, or terminal state, then it emits schema-validated runtime events with stable IDs, type, timestamps, session/task/correlation IDs, and payloads, and event names follow the architecture event naming pattern.
2. Given lifecycle events are emitted, when an adapter subscribes to events, then it can render or serialize the events without owning runtime state, and event contract tests verify the minimal first-task event sequence.

## Tasks / Subtasks

- [x] Establish a typed runtime event contract in `packages/core` (AC: 1, 2)
  - [x] Define a reusable `RuntimeEvent` schema/type that matches the architecture base shape with `schemaVersion`, IDs, `type`, `createdAt`, and typed payloads.
  - [x] Move the current minimal event record shape from Story 1.5 toward a single canonical event contract rather than ad hoc per-state records.
  - [x] Keep event naming aligned with the architecture pattern such as `task.started`, `task.waiting`, `task.completed`, `task.failed`, and related lifecycle events.
- [x] Add a runtime-owned event emission/subscription path (AC: 1, 2)
  - [x] Introduce a small event bus or subscription mechanism in `packages/core` so adapters can observe runtime events without mutating runtime state.
  - [x] Ensure `AgentRuntime` emits events when task state, plan state, provider-visible state, or terminal state changes during the first runnable task.
  - [x] Keep CLI/TUI/print/RPC concerns out of core state ownership; adapters subscribe and render only.
- [x] Align current task lifecycle transitions with emitted runtime events (AC: 1)
  - [x] Update task submission, waiting, steering, cancellation, completion, and failure transitions to emit canonical runtime events.
  - [x] Ensure event payloads remain truthful about what the first runtime loop did and did not execute.
  - [x] Preserve stable session/task/correlation IDs across emitted events for one task.
- [x] Make adapter-facing consumption possible without adapter-owned state truth (AC: 2)
  - [x] Expose the emitted events to the current CLI path in a form that later print/TUI/RPC adapters can reuse.
  - [x] Avoid text parsing as a source of task truth; adapters should render from runtime event objects or a deterministic event sequence.
  - [x] Keep the initial interface simple enough to expand into NDJSON and JSON-RPC streaming in later stories.
- [x] Add contract and sequence tests for the first event stream (AC: 1, 2)
  - [x] Add deterministic tests for event schema/base shape and required fields.
  - [x] Add sequence tests covering at least task start, waiting, steering, cancellation, and failure/completion paths for the first task loop.
  - [x] Re-run workspace build/typecheck/test validation after implementation.

## Dev Notes

### Story Intent

Story 1.5 introduced minimal runtime event records as part of task state, but the event model is still embedded inside task snapshots. Story 1.6 should make runtime events a first-class contract so adapters can observe the same task truth without deriving meaning from text output or hidden local state.

This story is where the event model stops being an implementation detail. The design needs to be stable enough that TUI, print mode, RPC, audit trails, and later persistence can all build on it without revisiting the core contract immediately.

### Previous Story Learnings

From Story 1.5:

- Runtime lifecycle ownership now sits in `AgentRuntime`, and adapters already submit intents rather than mutating state. Preserve that boundary when adding subscriptions or event emission.
- Minimal event records already exist for task start, waiting, steering, cancellation, completion, and failure. Reuse that truth, but centralize it into a canonical event contract instead of parallel shapes.
- Stable IDs matter. Review fixes already moved task/session/correlation/event IDs to UUID-backed values; the event contract should preserve that progress.
- Guarding terminal transitions matters. Event emission must reflect runtime truth and must not allow adapters or event consumers to revive terminal tasks indirectly.

### Scope Boundaries

In scope:

- canonical runtime event contract
- runtime-owned event emission/subscription for first task execution
- event sequence coverage for the current task lifecycle paths
- adapter-facing event consumption posture for CLI and future interfaces
- deterministic event contract and sequence tests

Out of scope for Story 1.6:

- full NDJSON output mode
- JSON-RPC event streaming transport
- persisted `events.ndjson` session storage
- tool lifecycle events beyond the current first-task runtime slice
- memory, skill, validation, or audit event families beyond what the current task paths require

### Technical Requirements

- Runtime events must include at least:
  - `schemaVersion`
  - `eventId`
  - `sessionId`
  - `taskId`
  - `correlationId`
  - `type`
  - `createdAt`
  - `payload`
- Event fields use camelCase and ISO 8601 UTC timestamps.
- Event naming follows the architecture dot-scoped lifecycle pattern.
- Adapters must be able to subscribe to or consume emitted events without owning canonical task state.
- Event sequence tests should be deterministic for the current minimal runtime task paths.

### Architecture Compliance

- Treat runtime events as a primary architecture contract, not presentation-layer logging.
- Core owns event emission and lifecycle truth.
- CLI/TUI/print/RPC consume the same event stream and differ only in presentation and control surfaces.
- Avoid hidden adapter state that cannot be reconstructed from emitted events plus runtime state.
- Preserve backward compatibility posture through `schemaVersion` and stable base fields.

### File Structure Guidance

Expected implementation direction:

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- new event-focused core files under `packages/core/src/`
- `packages/cli/src/index.ts`
- tests under `tests/`

### Testing Requirements

- Contract tests should cover:
  - event base shape and required fields
  - schema/version presence
  - stable ID/timestamp presence
- Sequence tests should cover:
  - submit -> started -> waiting
  - steering path
  - cancellation path
  - completion/failure path
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Epic 1 and Story 1.6 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.6)
- Runtime event requirements: `_bmad-output/planning-artifacts/prd.md` (FR9, NFR2, NFR44)
- Runtime event architecture: `_bmad-output/planning-artifacts/architecture.md` (runtime event stream, base event shape, naming rules, adapter/event ownership)
- Event compatibility posture: `_bmad-output/planning-artifacts/architecture.md` (`schemaVersion`, stable IDs, event-sequence testing, adapter reconstruction from runtime events)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`
- `./node_modules/.bin/tsc -b --pretty false`
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm test -- tests/runtime-events.test.ts`
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm run build`
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm test`
- `env PATH=/opt/homebrew/bin:$PATH npm_config_cache=/tmp/sprite-npm-cache /opt/homebrew/bin/npm pack --dry-run`
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm test -- tests/runtime-events.test.ts` (7 tests)
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm run typecheck`
- `env PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm test` (36 tests)

### Completion Notes List

- Added a canonical `runtime-events` module with schema-backed event creation and validation for the first runtime lifecycle event contract.
- Introduced a runtime-owned event bus and subscription API in `AgentRuntime` so adapters can observe emitted events without owning task state.
- Kept the existing first-task lifecycle truthful while aligning task start, waiting, steering, cancellation, completion, and failure transitions with canonical event payloads.
- Updated the CLI rendering path to subscribe to runtime events instead of treating task text output as the source of truth for lifecycle observation.
- Added deterministic contract and sequence tests for runtime event validation, adapter subscription, and first-task event history reconstruction.
- Verified `npm run build`, `npm run typecheck`, `npm test`, and `npm pack --dry-run`.
- Resolved review finding: event subscribers now receive isolated event copies, event history returns copies, and subscriber exceptions no longer abort runtime task transitions.
- Added regression tests proving subscriber mutation cannot corrupt canonical runtime event history and subscriber failures cannot stop first-task execution.
- Resolved review finding: runtime event validation now rejects missing or non-string base fields with `INVALID_RUNTIME_EVENT` instead of throwing.
- Added a regression test proving malformed base fields return schema errors through the Result contract.

### File List

- `_bmad-output/implementation-artifacts/1-6-emit-runtime-lifecycle-events-for-first-task-execution.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README.md`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/index.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `tests/runtime-events.test.ts`

### Change Log

- 2026-04-23: Created Story 1.6 with implementation context for canonical runtime lifecycle events and adapter-facing event consumption.
- 2026-04-23: Implemented canonical runtime lifecycle events, event subscription in core, contract/sequence tests, and CLI event-backed rendering; moved story to review.
- 2026-04-24: Addressed review findings by isolating subscriber event objects, protecting event history from adapter mutation, and preventing subscriber failures from aborting runtime transitions.
- 2026-04-24: Addressed review finding for malformed runtime event base fields and verified targeted/full test suites.
