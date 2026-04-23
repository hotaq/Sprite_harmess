# Story 1.4: Submit an Interactive Task to the Runtime

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want to submit a task in an interactive terminal session,  
so that Sprite Harness can produce an initial plan and begin working through the runtime.

## Acceptance Criteria

1. Given Sprite Harness starts from a project directory with provider configuration available, when the user submits a development task interactively, then the runtime creates a task request with cwd, provider/model state, allowed defaults, and stop conditions, and the user receives a planned execution flow before tool work begins.
2. Given the runtime starts a task, when the task enters the agent loop, then the loop follows plan-act-observe structure, and the CLI remains an adapter over `AgentRuntime`, not the owner of task lifecycle state.

## Tasks / Subtasks

- [x] Establish a minimal task request and runtime-loop contract in `packages/core` (AC: 1, 2)
  - [x] Define a typed task request that includes task text, cwd, active provider/model state, allowed defaults, and stop conditions.
  - [x] Add a first-pass runtime loop contract that models plan, act, and observe stages without moving tool execution logic into CLI.
  - [x] Keep the loop implementation small and truthful: it should plan and emit/return the first execution flow, not pretend tool work has already happened.
- [x] Wire interactive CLI task submission into `AgentRuntime` (AC: 1, 2)
  - [x] Update `sprite "<task>"` or equivalent default interactive CLI path so the adapter submits a typed task request to `AgentRuntime`.
  - [x] Preserve bootstrap/help/version behavior from earlier stories.
  - [x] Keep Commander and CLI argument handling adapter-thin; runtime owns task lifecycle state.
- [x] Produce an initial planned execution flow before tool work (AC: 1)
  - [x] Return or expose a structured initial plan that references the user goal, active provider/model state, cwd, and the next intended runtime phase.
  - [x] Make the first runnable loop clearly say that repository inspection/tool execution is deferred to later stories where those capabilities become real.
  - [x] Keep output honest about missing sandbox/tool/session/event-stream pieces.
- [x] Add deterministic tests for interactive task submission and loop state (AC: 1, 2)
  - [x] Add core tests for task request creation and minimal plan-act-observe loop progression.
  - [x] Add CLI tests proving a submitted task routes through `AgentRuntime` and returns a planned execution flow.
  - [x] Re-run workspace build/typecheck/test validation after implementation.
- [x] Document the first interactive task behavior (AC: 1, 2)
  - [x] Extend the README with how to submit the first task through the CLI.
  - [x] Describe what the initial planned execution flow means at this stage and what still arrives in later stories.

## Dev Notes

### Story Intent

This story is the first point where Sprite Harness should feel like a live agent rather than only a bootstrap shell. The target is not full task execution yet. The target is one real task submission path that goes through the shared runtime, constructs a task request, and returns a truthful initial execution plan using the provider/config/runtime state already established.

The architecture risk here is accidental CLI ownership. Do not let Commander handlers become the runtime loop. The CLI should only collect the task input and display the runtime result.

### Previous Story Learnings

From Story 1.3:

- Keep provider state normalized and runtime-owned. Story 1.4 should consume active provider/model/auth metadata from runtime state, not rebuild it inside CLI handlers.
- Redaction rules matter even in bootstrap paths. Task request and initial plan output must not leak secrets or provider internals.
- Deterministic tests with temp project directories work well for CLI startup behavior. Keep using them for the first interactive task path.
- Provider/bootstrap truthfulness matters. If the runtime only plans but does not inspect files or run tools yet, say that explicitly.

### Scope Boundaries

In scope:

- typed task request contract
- minimal plan-act-observe runtime-loop shell
- interactive CLI task submission path through `AgentRuntime`
- initial planned execution flow output
- deterministic tests for core and CLI task submission behavior
- README updates for first task usage

Out of scope for Story 1.4:

- real repository search/read/edit tool execution
- sandbox command execution
- approvals, cancellation, or steering state transitions
- lifecycle event stream contract
- print/json/ndjson output modes
- final task summaries or learning review outputs
- session persistence

### Technical Requirements

- The interactive task path must start from the default `sprite <task>` CLI surface.
- `AgentRuntime` must own task request construction and loop state.
- The task request should include at least:
  - task text
  - cwd
  - active provider/model state
  - stop conditions / iteration guardrails
  - allowed defaults or placeholders for later tool/sandbox policies
- The first loop should expose distinct plan/act/observe structure, even if act/observe are still placeholder phases.
- Output must show the planned execution flow before any future tool work.

### Architecture Compliance

- CLI/TUI/print/RPC must remain adapters over one shared `AgentRuntime`.
- `AgentLoop` or equivalent runtime-loop logic belongs in `packages/core`.
- Do not leak provider-specific request formats into runtime-loop contracts.
- Do not introduce fake tool results or fake file changes just to make the loop look richer.
- Keep event-stream concerns minimal until Story 1.6, but avoid painting the runtime into a corner.

### File Structure Guidance

Expected implementation direction:

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `packages/core/src/index.ts`
- `packages/cli/src/index.ts`
- tests under `tests/`

### Testing Requirements

- Core tests should cover:
  - task request assembly from runtime/bootstrap state
  - initial plan-act-observe loop shape
  - stop condition/max-iteration placeholder values in the first task request
- CLI tests should cover:
  - `sprite "<task>"` returns a planned execution flow
  - task submission still works with provider/config startup state present
  - help/version/default bootstrap paths do not regress
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Epic 1 and Story 1.4 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.4)
- Interactive task requirements: `_bmad-output/planning-artifacts/prd.md` (FR1, FR2, FR3, NFR16)
- Runtime-first ownership and task primitive: `_bmad-output/planning-artifacts/architecture.md` (`AgentRuntime`, `Task`, dependency graph, plan-act-observe loop)
- CLI/runtime interaction model: `_bmad-output/planning-artifacts/prd.md` and `_bmad-output/planning-artifacts/architecture.md` (interactive CLI over shared runtime)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`

### Completion Notes List

- Added typed task request, stop-condition, and initial plan-act-observe loop contracts in `packages/core` for the first interactive runtime slice.
- Kept `AgentRuntime` as the owner of task submission and loop planning so CLI remains an adapter over shared runtime state.
- Replaced the old placeholder `sprite "<task>"` message with a real runtime-backed planned execution flow that includes cwd, provider/model state, defaults, loop phases, and truthful warnings about deferred tool work.
- Added core tests for task request assembly and minimal loop progression, plus CLI tests proving interactive task submission routes through `AgentRuntime`.
- Extended the README with first interactive task usage and clarified what this story does and does not execute yet.
- Verified `npm run build`, `npm run typecheck`, `npm test`, and `npm pack --dry-run`.

### File List

- `_bmad-output/implementation-artifacts/1-4-submit-an-interactive-task-to-the-runtime.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README.md`
- `packages/cli/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/index.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `tests/cli-smoke.test.ts`
- `tests/runtime-loop.test.ts`

### Change Log

- 2026-04-23: Created Story 1.4 with implementation context for first interactive task submission through the shared runtime.
- 2026-04-23: Implemented the first runtime-backed interactive task submission path, initial plan-act-observe loop shell, tests, and docs; moved story to review.
- 2026-04-23: Closed review findings, aligned interactive task messaging with the shipped runtime behavior, and marked story done.
