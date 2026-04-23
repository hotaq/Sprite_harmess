# Story 1.5: Stop, Cancel, and Steer a Running Task

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want to stop, cancel, or steer an in-progress task,  
so that I remain in control when the agent needs correction or reaches a limit.

## Acceptance Criteria

1. Given a task is running, when the runtime reaches completion, requires user input, hits max iterations, or encounters an unrecoverable error, then it transitions to an explicit terminal or waiting state, and the state is emitted as a runtime event.
2. Given a task is running, when the user cancels or provides steering input, then the runtime records the user action and updates or stops the task through `AgentRuntime`, and the adapter does not mutate task state directly.

## Tasks / Subtasks

- [x] Establish runtime-owned task state transitions for terminal and waiting conditions in `packages/core` (AC: 1, 2)
  - [x] Extend the task/runtime state contract to represent at least completed, cancelled, waiting-for-input, max-iterations, and unrecoverable-error outcomes.
  - [x] Keep state ownership in `AgentRuntime` or runtime-loop helpers; adapters can submit intents but must not mutate task lifecycle state directly.
  - [x] Preserve the current Story 1.4 task-planning path while making the next state after planning explicit and testable.
- [x] Add runtime intents for cancel and steering input (AC: 2)
  - [x] Introduce a typed cancel intent and a typed steering-input intent that the CLI can submit to runtime-owned task state.
  - [x] Record the user action in task state/history without requiring adapter-local reducers to invent task truth.
  - [x] Keep the contract narrow enough that TUI and RPC can reuse it later without redesign.
- [x] Stop or update a running task through `AgentRuntime` (AC: 1, 2)
  - [x] Add the first runtime methods needed to cancel a task or apply steering input to the active task flow.
  - [x] Ensure max-iteration and unrecoverable-error exits produce explicit runtime state rather than implicit text-only failure.
  - [x] Keep task state/result truthful about what did and did not execute in the current MVP loop.
- [x] Emit the minimal runtime-event hooks needed for state transitions in this story (AC: 1)
  - [x] Emit or surface a stable event record for terminal or waiting transitions without overbuilding the full event system before Story 1.6.
  - [x] Use naming and payload posture that stays aligned with the architecture event model.
  - [x] Avoid adapter-owned event synthesis.
- [x] Add deterministic tests for cancellation, steering, and terminal/waiting transitions (AC: 1, 2)
  - [x] Add core tests for cancel, steering, max-iteration, approval-required, and unrecoverable-error transition behavior.
  - [x] Add adapter-facing tests proving CLI submits intents through runtime rather than mutating task state itself.
  - [x] Re-run workspace build/typecheck/test validation after implementation.

## Dev Notes

### Story Intent

Story 1.4 proved that interactive task submission flows through the shared runtime. Story 1.5 now makes the runtime controllable while work is in flight. The goal is not rich UI control yet. The goal is explicit runtime-owned task transitions and user intents for cancel/steer so later CLI, TUI, print, and RPC layers can all reuse one task truth.

The main architectural risk here is accidental adapter ownership. Commander handlers, future Ink components, and RPC request handlers must not invent or mutate task lifecycle state on their own. They should only submit intents into the runtime.

### Previous Story Learnings

From Story 1.4:

- Keep `AgentRuntime` as the owner of task submission and loop planning. Extend that same ownership model for cancellation and steering rather than introducing adapter-specific state machines.
- Be explicit about what has and has not executed. If a task stops for input, max iterations, or cancellation before tool work exists, the runtime state should say that directly.
- Keep state contracts typed and small. The first loop model in `packages/core` should grow by adding clear lifecycle signals, not by burying meaning in text output.
- Deterministic runtime and CLI tests with temp directories already work well for this repo. Reuse them for steering/cancel flows.

### Scope Boundaries

In scope:

- explicit terminal and waiting task states
- runtime-owned cancel and steering intents
- task-state updates through `AgentRuntime`
- minimal runtime-event emission or records for state transitions
- deterministic tests for lifecycle transitions and adapter-thin control paths

Out of scope for Story 1.5:

- full runtime event schema coverage beyond the first state-transition hooks
- TUI controls or multiline steering UX
- JSON-RPC control endpoints
- provider-level request cancellation plumbing
- real tool execution, approvals UI, or validation recovery
- final summary generation

### Technical Requirements

- Runtime must distinguish at least:
  - running/planned state
  - waiting-for-input or approval-required state
  - completed state
  - cancelled state
  - max-iterations stop
  - unrecoverable-error stop
- User cancel/steer actions must enter through `AgentRuntime`, not adapter-local mutation.
- Runtime should retain the user action or steering note in task state/history so later summaries, events, and persistence can reuse it.
- State transitions should be representable in machine-readable form, not only text output.
- Event naming/payload posture should stay compatible with the architecture event model and Story 1.6 follow-up work.

### Architecture Compliance

- Core owns task lifecycle, event emission, and task-intent handling.
- CLI/TUI/print/RPC remain adapters that submit intents and render runtime truth.
- Avoid hidden adapter state that cannot be reconstructed from runtime state/events.
- Do not couple the cancel/steer contract to Commander, Ink, or transport-specific request shapes.
- Keep the first event hooks small and aligned with later runtime-event expansion.

### File Structure Guidance

Expected implementation direction:

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- event-related additions under `packages/core/src/`
- `packages/cli/src/index.ts`
- tests under `tests/`

### Testing Requirements

- Core tests should cover:
  - explicit terminal/waiting transitions
  - cancel intent handling
  - steering intent handling
  - max-iteration and unrecoverable-error stop behavior
- Adapter-facing tests should cover:
  - CLI submits cancel/steer through runtime-owned methods
  - adapters do not mutate task lifecycle state directly
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Epic 1 and Story 1.5 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.5)
- Runtime execution requirements: `_bmad-output/planning-artifacts/prd.md` (FR4, FR5, FR9, NFR3, NFR22, NFR44)
- Runtime/event ownership: `_bmad-output/planning-artifacts/architecture.md` (`AgentRuntime`, task lifecycle, runtime events, adapter responsibilities)
- CLI/TUI control posture: `_bmad-output/planning-artifacts/architecture.md` (adapters submit cancel/steer/approval responses; runtime owns lifecycle state)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`

### Completion Notes List

- Extended the task-state contract with explicit waiting and terminal states, runtime-owned intent history, and minimal runtime event records that align with the architecture naming posture.
- Kept `AgentRuntime` as the owner of active-task lifecycle so cancel, steer, completion, approval-required waiting, max-iterations, and unrecoverable-error transitions all happen in core.
- Updated the CLI adapter to submit `--steer` and `--cancel` intents through the runtime instead of mutating task state inside Commander handlers.
- Added deterministic runtime tests for steering, cancellation, approval-required waiting, max-iteration stops, and unrecoverable errors, plus CLI smoke tests for steering/cancel control paths.
- Updated the README to reflect the new waiting/terminal state behavior and minimal event output now available in the interactive path.
- Verified `npm run build`, `npm run typecheck`, `npm test`, and `npm pack --dry-run`.

### File List

- `_bmad-output/implementation-artifacts/1-5-stop-cancel-and-steer-a-running-task.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README.md`
- `packages/cli/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `tests/cli-smoke.test.ts`
- `tests/runtime-loop.test.ts`

### Change Log

- 2026-04-23: Created Story 1.5 with implementation context for runtime-owned cancel, steer, and explicit task stop-state handling.
- 2026-04-23: Implemented runtime-owned cancel and steer intents, explicit waiting/terminal task states, minimal runtime event records, tests, and docs; moved story to review.
