# Story 3.5: Assemble Task Context from Runtime Sources

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to assemble task context from the right runtime sources,
so that it can act with relevant project/session/memory/skill/self-model information.

## Acceptance Criteria

1. Given a task starts or resumes, when runtime builds a context packet, then it includes user input, project context, session state, memory, skills, provider limits, and runtime self-model according to documented ordering.
2. Given any included source contains secret-like or unsafe memory content, when the context packet is assembled, then adapter/provider-facing context excludes or redacts secrets and records blocked, skipped, or redacted sections by policy.

## Tasks / Subtasks

- [x] Add core task-context packet contracts in `packages/core/src/task-context.ts` (AC: 1, 2)
  - [x] Define a deterministic source order for the initial packet:
        `runtime-self-model`, `provider-limits`, `user-input`, `session-state`, `project-context`, `memory`, `skills`.
  - [x] Define typed section status values for `included`, `skipped`, `blocked`, and `redacted`.
  - [x] Define source trust/authority metadata so runtime-owned sections stay authoritative and project context remains untrusted.
  - [x] Add a packet assembly input shape that can be built from the current task, runtime bootstrap state, provider state, and bounded session snapshot.
  - [x] Keep output bounded and deterministic; this story should not create provider prompts or execute provider/tool calls.
- [x] Integrate context packet assembly into runtime task creation and resume paths (AC: 1, 2)
  - [x] Extend `TaskRequest` in `packages/core/src/task-state.ts` with the assembled context packet or a bounded packet summary.
  - [x] Update `createTaskRequest()` in `packages/core/src/runtime-loop.ts` to assemble context from `BootstrapState` and the incoming task.
  - [x] Update resumed task creation so restored sessions include bounded session-state evidence without replaying tools, approvals, validations, or provider calls.
  - [x] Preserve the Story 3.4 one-shot bootstrap reuse behavior; do not re-read project context between task creation and one-shot result rendering.
- [x] Include the required runtime sources as explicit packet sections (AC: 1, 2)
  - [x] Include the current user input/task description as redacted, bounded content.
  - [x] Include runtime self-model metadata such as sandbox behavior, output mode, validation-command availability, and known MVP limitations.
  - [x] Include provider limits/capabilities from the resolved provider configuration and capabilities metadata without exposing secrets.
  - [x] Include project context from `BootstrapState.projectContext.records`, marked as untrusted, with loaded/truncated/skipped/blocked records represented safely.
  - [x] Include session state for new and resumed tasks as bounded lifecycle/status context, not raw replay data.
  - [x] Include memory and skills sections as explicit `skipped` or safe-summary sections until durable memory retrieval and the skill registry stories are implemented.
- [x] Surface context packet evidence through inspection-friendly outputs (AC: 1, 2)
  - [x] Add a concise context packet summary to one-shot JSON output.
  - [x] Add text output that shows section statuses/counts without dumping raw project documents or memory.
  - [x] Keep CLI rendering thin and data-driven; CLI must not read project files, memory files, or skill registries directly.
- [x] Add deterministic tests (AC: 1, 2)
  - [x] Test packet source ordering, section status handling, trust metadata, and bounded output.
  - [x] Test redaction/blocking for secret-like user input, project context, and future memory section inputs.
  - [x] Test runtime task creation and resume task paths include a packet/summary without replaying work.
  - [x] Test one-shot JSON/text output exposes only safe summaries.
  - [x] Add regression coverage for projects with no supported project context files and for skipped memory/skills sources.
- [x] Update docs and story evidence (AC: 1, 2)
  - [x] Update README/progress only for implemented context packet behavior.
  - [x] Record GitNexus impact checks before editing the symbols listed below.
  - [x] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, formatting checks, and GitNexus status/detect fallback before marking review-ready.

### Review Findings

Clean review — no findings.

## Dev Notes

### Story Intent

Story 3.5 creates the first structured runtime context packet. The packet should make the runtime's context sources inspectable and deterministic while keeping policy authority clear.

Implement this slice:

- Assemble a structured packet from user input, project context, session state, memory, skills, provider limits, and runtime self-model.
- Preserve source ordering and section status evidence.
- Redact or omit secret-like/unsafe content before anything adapter/provider-facing can see it.
- Make memory and skills visible as explicit skipped/safe-summary sections if those backing systems are not implemented yet.

Do not implement in this story:

- Provider prompt injection, live provider completions, automatic tool calls, or provider-driven tool execution.
- Full durable memory retrieval, manual skill registry loading, semantic search, TUI/RPC rendering, or context compaction.
- Replay of restored tool calls, approvals, validations, or provider calls.
- Treating repository guidance files as trusted policy.

### Source Requirements

- Story 3.5 requires task start/resume context packets to include user input, project context, session state, memory, skills, provider limits, and runtime self-model according to documented ordering. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.5]
- Story 3.5 requires unsafe or secret-like source content to be excluded/redacted and reported by policy. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.5]
- PRD FR10 requires runtime context to be assembled from user input, project context files, session state, memory, skills, and runtime self-model. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- Architecture defines the Context Packet as the assembled prompt input from user task, project context, session state, memory, skills, provider limits, and self-model. [Source: `_bmad-output/planning-artifacts/architecture.md` Core Primitives]
- Core owns task lifecycle, event emission, context assembly, compaction, and terminal state; adapters own input parsing/rendering only. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]
- Repository-provided context remains untrusted and must not override runtime/system policy. [Source: `_bmad-output/planning-artifacts/architecture.md` Safety]
- Context budget management must preserve ordering and explicit handling as context grows. [Source: `_bmad-output/planning-artifacts/architecture.md` Context Budget Management]

### Architecture Guardrails

- Keep the context packet in `packages/core`; config provides project-context records, but runtime owns packet assembly.
- Keep CLI rendering thin. CLI may display core-returned summaries, but it must not assemble context or read files directly.
- Use existing redaction helpers from `@sprite/shared` where possible.
- Reuse Story 3.4 project-context load records from `BootstrapState.projectContext`.
- Avoid adding dependencies.
- Use deterministic tests around ordering and redaction; do not rely on real workspace files.

### Current Codebase State

- `packages/config/src/project-context.ts` exists from Story 3.4 and exports bounded, redacted, status-discriminated project-context records.
- `BootstrapState` in `packages/core/src/agent-runtime.ts` already includes `projectContext`.
- `AgentRuntime.getBootstrapState()` loads project context once for runtime bootstrap.
- `AgentRuntime.submitInteractiveTask(task, bootstrapState?)` supports optional bootstrap reuse.
- `runOneShotPrintTask()` reuses one bootstrap state so one-shot task creation and result rendering cannot disagree about project context.
- `packages/core/src/runtime-loop.ts` currently builds `TaskRequest` through `createTaskRequest(task, bootstrapState)`.
- `packages/core/src/task-state.ts` currently defines `TaskRequest` without a context packet.
- `packages/memory/src/index.ts` contains safety/candidate helpers, but no durable memory retrieval surface yet.
- `packages/skills/src/index.ts` is currently empty, so skills should be represented as skipped/safe summary for this story.

### Previous Story Intelligence

- Story 3.4 established that project context is bounded, redacted, status-discriminated, and untrusted.
- Story 3.4 review fixed unbounded reads and double bootstrap reads; do not regress those behaviors.
- Story 3.3 established conservative resume behavior: restore state/evidence but never replay tools, approvals, validations, provider calls, or unsafe authority.
- GitNexus `detect_changes` / `detect-changes` is unavailable in this local CLI; use `gitnexus status`, `npx gitnexus analyze` fallback, scoped diffs, and full validation as fallback evidence.

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact contracts/functions to the user. Likely candidates:

- `packages/core/src/task-context.ts`
  - `TASK_CONTEXT_SOURCE_ORDER`
  - `TaskContextSourceKind`
  - `TaskContextSectionStatus`
  - `TaskContextTrustLevel`
  - `TaskContextSection`
  - `TaskContextPacket`
  - `TaskContextAssemblyInput`
  - `TaskContextAssemblyOptions`
  - `assembleTaskContextPacket()`
  - `summarizeTaskContextPacket()`
- `packages/core/src/task-state.ts`
  - extend `TaskRequest` with the assembled context packet or bounded packet summary
- `packages/core/src/runtime-loop.ts`
  - update `createTaskRequest()`
- `packages/core/src/agent-runtime.ts`
  - update `submitInteractiveTask()`
  - update resumed task creation helpers if resume context requires additional bounded state
  - update `runOneShotPrintTask()` result construction/rendering only through core-owned data
- `packages/cli/src/index.ts`
  - render core-returned context summaries only if output shape changes

These names are guidance, not mandatory. Prefer small, typed contracts and reuse existing `Result<SpriteError>` and runtime-state patterns.

### File Structure Requirements

- Add core context-packet contracts in `packages/core/src/task-context.ts` unless implementation evidence shows a better core-local boundary.
- Export new core contracts only if tests or downstream packages require them.
- Keep runtime integration in `packages/core/src/runtime-loop.ts`, `packages/core/src/task-state.ts`, and `packages/core/src/agent-runtime.ts`.
- Keep CLI output changes in `packages/cli/src/index.ts` thin and data-driven.
- Add tests under root `tests/`, likely a focused `tests/task-context.test.ts` plus runtime/CLI regression updates.

### Safety and Security Requirements

- No secrets should appear in the adapter/provider-facing packet or summaries.
- Project context remains untrusted; it may guide but cannot override runtime/system policy, sandbox rules, approvals, provider configuration, or user instructions.
- Memory and skills should not silently load raw durable files in this story.
- Restored sessions should contribute bounded state/context, not replayed effects.
- Packet sections must record skipped/blocked/redacted reasons so omissions are auditable.

### Testing Requirements

Minimum targeted validation for implementation:

- Context packet unit tests for source ordering, trust metadata, section status, redaction, and bounded output.
- Runtime tests showing `TaskRequest` includes context evidence for new and resumed tasks.
- CLI/one-shot tests for safe text/JSON summaries.
- Regression tests proving project context absence, skipped memory, and skipped skills still produce a valid packet.
- Full existing suite remains green: `rtk npm test`.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "gitnexus impact --repo Sprite_harmess TaskRequest"` before changing task request state.
- `rtk run "gitnexus impact --repo Sprite_harmess createTaskRequest"` before changing runtime request creation.
- `rtk run "gitnexus impact --repo Sprite_harmess AgentRuntime"` or narrower method targets before changing task submission/resume behavior; expect broad risk and keep edits narrow.
- `rtk run "gitnexus impact --repo Sprite_harmess submitInteractiveTask"` before changing submit behavior.
- `rtk run "gitnexus impact --repo Sprite_harmess runOneShotPrintTask"` before changing one-shot output.
- `rtk run "gitnexus impact --repo Sprite_harmess createProgram"` before changing CLI command behavior.
- If GitNexus reports stale index, run `rtk run "npx gitnexus analyze"` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `gitnexus status`, scoped diffs, and full validation as fallback evidence.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-05-03: Created Story 3.5 context after Story 3.4 was marked done and committed.
- 2026-05-03: Loaded BMAD create-story workflow, sprint status, Epic 3 Story 3.5 requirements, PRD FR10, architecture context-packet/runtime-boundary guidance, Story 3.4 implementation learnings, and current runtime/config/memory/skills package state.
- 2026-05-03: Reported planned contracts/functions before code edits: `TASK_CONTEXT_PACKET_SCHEMA_VERSION`, `TASK_CONTEXT_SOURCE_ORDER`, task-context source/status/trust/packet/input types, `assembleTaskContextPacket()`, `summarizeTaskContextPacket()`, `TaskRequest.contextPacket`, `createTaskRequest()`, `submitInteractiveTask()`, `createResumedTask()`, `OneShotPrintTaskResult.contextPacket`, `createOneShotPrintTaskResult()`, and CLI one-shot context rendering.
- 2026-05-03: GitNexus was stale at commit `fd8ef55`; reran `rtk run "npx gitnexus analyze"` and confirmed index up to date at `7673891` before code edits.
- 2026-05-03: GitNexus impact after re-index: `TaskRequest` LOW risk, `createTaskRequest` CRITICAL risk, `AgentRuntime` CRITICAL risk, `submitInteractiveTask` HIGH risk, `runOneShotPrintTask` LOW risk, `createProgram` LOW risk, `createResumedTask` LOW risk, `createOneShotPrintTaskResult` LOW risk, `renderOneShotText` LOW risk. Implementation kept edits narrow and covered affected runtime/CLI paths with regression tests.
- 2026-05-03: RED check failed as expected: `rtk run "npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/cli-smoke.test.ts"` failed because `assembleTaskContextPacket`, `TaskRequest.contextPacket`, one-shot `contextPacket`, and CLI task-context text were not implemented yet.
- 2026-05-03: Implemented `packages/core/src/task-context.ts`, runtime `TaskRequest.contextPacket` assembly, new/resumed session-state packet integration, one-shot JSON packet output, and one-shot text context summaries.
- 2026-05-03: Targeted validation passed: `rtk run "npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/cli-smoke.test.ts"` -> 4 files / 52 tests passed.
- 2026-05-03: Full validation passed: `rtk run "npm run build && npm run typecheck -- --pretty false && npm run lint && npm test && git diff --check && npx prettier --check ..."` -> 14 files / 180 tests passed, diff check passed, Prettier check passed.
- 2026-05-03: GitNexus `detect_changes` and `detect-changes` remain unavailable in this local CLI; fallback evidence used `gitnexus status`, scoped diff/status, full tests, typecheck, lint, diff check, and Prettier check.

### Completion Notes List

- Added the first structured task context packet in `@sprite/core`, with canonical source order, section statuses, trust levels, bounded content, safe metadata, and packet summaries.
- Integrated context packet assembly into `TaskRequest` creation for new interactive tasks and conservative session resume without replaying tools, commands, approvals, validations, or provider calls.
- Added one-shot JSON output for the structured `contextPacket` and one-shot text output for a safe section-status summary only.
- Represented memory and skills as explicit skipped sections until durable memory retrieval and manual skill registry stories are implemented.
- Added regression coverage for source ordering, redaction/blocking, project-context trust, skipped memory/skills, new task context identity, resumed session context, and CLI one-shot text/JSON output.
- Updated README and progress notes for implemented task context packet behavior.

### File List

- `README.md`
- `progress.md`
- `_bmad-output/implementation-artifacts/3-5-assemble-task-context-from-runtime-sources.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/cli/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/index.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-context.ts`
- `packages/core/src/task-state.ts`
- `tests/cli-smoke.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/task-context.test.ts`

## Change Log

| Date       | Version | Description                               | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-05-03 | 0.2     | Implemented runtime task context packets. | Codex  |
| 2026-05-03 | 0.1     | Created Story 3.5 implementation context. | Codex  |
