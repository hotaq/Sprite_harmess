# Story 6.1: Render Minimal TUI Startup and Runtime State

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the TUI to show startup and runtime state,
so that I can understand what environment the agent is operating in.

## Acceptance Criteria

1. Given the TUI starts in a project directory, when the runtime initializes, then the TUI shows cwd, session state, active provider/model, sandbox mode, loaded context files, loaded skills, and memory state without displaying provider credentials or secret values.
2. Given runtime state changes, when events are emitted, then the TUI updates visible state from runtime events or runtime state APIs and does not own or mutate task lifecycle state directly.
3. Given skill candidates and promoted manual skills exist, when the TUI renders skill state, then active manual skills and candidate/review artifacts are visually distinct and candidates are not displayed as active skills.
4. Given runtime data includes raw content, paths, warnings, provider auth metadata, memory snippets, skill metadata, candidate metadata, or tool/validation summaries, when the TUI renders startup/runtime state, then output is bounded and redacted consistently with existing CLI/runtime safety rules.
5. Given tests inspect the TUI state adapter, then they prove the visible state is derived from exported runtime events/state snapshots and not from a separate UI-owned task model.

## Tasks / Subtasks

- [ ] Confirm implementation function/package list before code edits (AC: 1-5)
  - [ ] Report exact exports/files to inspect or modify before implementation.
  - [ ] Run GitNexus impact analysis before editing existing exported symbols or CLI/runtime functions, especially `AgentRuntime.getBootstrapState()`, `createRuntimeSelfModelSnapshot()`, `listSkills()`, `createProgram()`, and any runtime event/state export touched.
  - [ ] Treat this story as a minimal adapter/read-model story, not a full interactive TUI loop.

- [ ] Define the TUI state contract before rendering (AC: 1, 2, 5)
  - [ ] Create or update `packages/tui/src/index.ts` to export a small startup/runtime state read model.
  - [ ] Prefer pure functions such as `createTuiStartupState()` / `createTuiRuntimeState()` before introducing renderer-heavy code.
  - [ ] Source runtime truth from `AgentRuntime.getBootstrapState()`, `PlannedExecutionFlow`, `RuntimeEventRecord[]`, `TaskContextPacket`, `createRuntimeSelfModelSnapshot()`, and/or existing exported session inspection APIs.
  - [ ] Do not create a second task lifecycle state machine inside `packages/tui`.

- [ ] Render minimal startup/runtime state safely (AC: 1, 4)
  - [ ] Show cwd as a safe label/preview, session/task status, provider name/model/auth status, sandbox mode, output format, validation command count, project context loaded/skipped counts, memory availability, loaded skill names/sources, and warnings count.
  - [ ] Represent provider auth as configured/missing/redacted only; never render API keys, token names, env values, or credential file content.
  - [ ] Bound lists and strings using existing preview/redaction helpers from `@sprite/shared` or established runtime patterns.
  - [ ] If full TUI rendering is introduced, keep display components thin over the state contract.

- [ ] Keep skill and candidate state separated in TUI output (AC: 1, 3)
  - [ ] Use `listSkills()` / runtime skill context data for active manual skills.
  - [ ] If candidate counts or lifecycle summaries are displayed, obtain them through explicit candidate review APIs and label them as candidates/drafts/rejected/promoted audit artifacts, not active skills.
  - [ ] Do not scan `.sprite/skill-candidates` as a manual skill root.
  - [ ] Do not render raw `SKILL.md` body, raw candidate body, raw paths, routing rules, activation grants, diffs, patches, or secrets in broad status panes.

- [ ] Add adapter-boundary and redaction tests (AC: 1-5)
  - [ ] Add `tests/tui-state.test.ts` or equivalent focused tests for the pure TUI state/read-model functions.
  - [ ] Cover provider configured/missing states, sandbox mode, context counts, memory availability, skills loaded/unloaded, warnings, and session/task identity.
  - [ ] Cover secret-like cwd/provider/config/skill/candidate text redaction or omission.
  - [ ] Cover candidate/promoted separation using fixtures from Epic 5 patterns.
  - [ ] Assert TUI state tests do not launch an interactive terminal renderer.

- [ ] Wire minimal CLI entry only if required for Story 6.1 acceptance (AC: 1, 2)
  - [ ] If adding a `sprite tui` or equivalent command, keep it a thin adapter that calls `@sprite/tui` and `AgentRuntime`.
  - [ ] Do not duplicate CLI print/interactive task logic.
  - [ ] Do not execute commands, apply edits, approve requests, or mutate runtime lifecycle directly from TUI code in this story.

- [ ] Validate and update story status (AC: 1-5)
  - [ ] Run targeted TUI tests first.
  - [ ] Run `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [ ] Run GitNexus analyze/status fallback before commit: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [ ] Move status to `in-progress` when development starts, `review` after implementation validation passes, and `done` only after review fixes pass.

## Dev Notes

### Story Intent

Story 6.1 opens Epic 6. The goal is to make runtime startup/state visible in a terminal workbench without moving runtime authority into the UI layer.

This story should produce the first TUI adapter state contract and, if necessary, the smallest possible renderer/CLI entrypoint. It should not implement multiline input, steering, approvals, slash commands, final summary panels, learning-review panels, or full message-stream rendering; those belong to Stories 6.2-6.5.

### Source Requirements

- Epic 6 objective: users can steer the runtime through a richer terminal workbench displaying messages, tool activity, approvals, changed files, validation, memory, skills, model, session, and slash-command controls. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 6]
- Story 6.1 requires cwd, session state, active provider/model, sandbox mode, loaded context files, loaded skills, and memory state, with no provider credentials or secrets displayed. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.1]
- Runtime state changes must update visible state from runtime events or runtime state APIs, and the TUI must not own or mutate task lifecycle state directly. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.1]
- FR60/FR61 require a minimal TUI and display of runtime state, tool activity, approvals, changed files, validation, context, memory, model, session, and learning-review outputs across Epic 6. [Source: `_bmad-output/planning-artifacts/prd.md` FR60-FR61]
- UX-DR1/UX-DR5 require startup context and state views that expose provider/model, sandbox, session, memory, skill, and effective config without secrets. [Source: `_bmad-output/planning-artifacts/epics.md` FR/UX mapping]
- Architecture states CLI, TUI, print mode, and JSON-RPC must share one `AgentRuntime`; adapters decide presentation only. [Source: `_bmad-output/planning-artifacts/architecture.md` Interface Adapter Pattern]
- Architecture states TUI responsibilities are rendering runtime events, collecting user input, showing approvals, and sending typed intents; the TUI must not own task lifecycle state. [Source: `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- Architecture says `packages/core` must not depend on CLI, TUI, RPC, Ink, Commander, or terminal rendering libraries. [Source: `_bmad-output/planning-artifacts/architecture.md` Dependency Direction Rules]
- Epic 5 retrospective requires Epic 6 work to stay adapter-thin, preserve skill candidate/promoted separation, and render memory/skill lifecycle state safely. [Source: `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-11.md`]

### Previous Epic Intelligence

Epic 5 completed the trusted skill lifecycle:

- Active manual skills are listed through `listSkills()` / `listAvailableSkills()`, not by scanning candidate storage.
- Manual skill invocation emits `skill.invoked` / `skill.invocation.failed` and may record `skill.usage.recorded`.
- Skill signals and skill candidates are evidence/review artifacts, not active behavior.
- Promotion writes a project-local manual skill only after explicit confirmation.
- Story 5.7 hardened candidate/promoted separation across registry listing, invocation, context packets, usage influence, final summaries, and session resume.

Carry this into TUI work:

- Display active manual skills separately from skill candidates.
- Never let candidate artifacts become active skill state through display-layer logic.
- Do not render raw skill or candidate body in broad status panes.
- Keep review findings as regression tests.

### Current Implementation Baseline

- `packages/tui` already exists as a placeholder workspace package with `src/index.ts` exporting nothing. [Source: `packages/tui/package.json`, `packages/tui/src/index.ts`]
- Root `tsconfig.json` already references `packages/tui`. [Source: `tsconfig.json`]
- Root `tsconfig.base.json` currently has path mappings for shared/core/config/memory/providers/sandbox/skills/tools/storage, but not `@sprite/tui`; add one only if another package imports `@sprite/tui` from source during tests/build. [Source: `tsconfig.base.json`]
- `package.json` workspaces already include `packages/*`; no root files need broad reorganization for the TUI package. [Source: `package.json`]
- `AgentRuntime.getBootstrapState()` returns startup cwd/config, project context load result, provider state, interfaces, and warnings; its `interfaces` currently contains `["cli"]`, so Story 6.1 may need to decide whether TUI display should derive supported interface labels externally or update bootstrap semantics carefully. [Source: `packages/core/src/agent-runtime.ts`]
- `createRuntimeSelfModelSnapshot()` exposes provider configured/model/auth-redacted state, sandbox mode/output format/validation count, memory availability, tool names, and loaded skill metadata from task context assembly. [Source: `packages/core/src/task-context.ts`]
- `TaskContextPacket` sections include project context, runtime self-model, session state, memory, and skills sections suitable for adapter-derived display. [Source: `packages/core/src/task-context.ts`]
- `listSkills()` in `packages/core/src/skill-registry.ts` wraps the safe manual skill registry list API from `@sprite/skills`. [Source: `packages/core/src/skill-registry.ts`]

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/tui/src/index.ts` — likely home for exported TUI state/read-model functions and optional renderer entry.
- `packages/tui/package.json` — add adapter-scoped dependencies only if implementation genuinely renders with Ink/React.
- `packages/tui/tsconfig.json` — if using TSX/React, add the minimal JSX compiler option and adjust includes to `src/**/*.tsx`; otherwise keep pure `.ts` state functions first.
- `packages/core/src/agent-runtime.ts` / `AgentRuntime.getBootstrapState()` — inspect for startup state source; avoid widening semantics unless necessary.
- `packages/core/src/task-context.ts` / `createRuntimeSelfModelSnapshot()` — inspect for safe provider/sandbox/memory/skill snapshot fields.
- `packages/core/src/skill-registry.ts` / `listSkills()` — inspect for active manual skill display.
- `packages/cli/src/index.ts` / `createProgram()` — only if adding a `sprite tui` command.
- `tests/tui-state.test.ts` — recommended new focused test file for TUI state contract.
- `tests/cli-smoke.test.ts` — only if adding CLI entrypoint output/command behavior.

### Library / Framework Notes

- Architecture recommends Ink/React terminal for the minimal TUI unless implementation discovery finds a stronger reason to change. [Source: `_bmad-output/planning-artifacts/prd.md` TUI requirements; `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- Current package registry check on 2026-05-11 via `npm view` returned:
  - `ink` version `7.0.2`
  - `react` version `19.2.6`
  - `@types/react` version `19.2.14`
- Official package/reference links to check again before adding dependencies:
  - `https://www.npmjs.com/package/ink`
  - `https://github.com/vadimdemedes/ink`
- Do not add any new dependency casually. If Story 6.1 can satisfy acceptance with pure state functions plus tests, defer Ink renderer dependency to the first story that truly needs terminal rendering. If adding Ink now, keep it scoped to `@sprite/tui` and update lockfile intentionally.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`.
- `packages/tui` may import exported contracts from `@sprite/core`, `@sprite/config`, `@sprite/providers`, `@sprite/skills`, and `@sprite/shared` as needed.
- TUI code must not directly read/write session artifacts, memory stores, skill candidate JSON, or provider credential files unless it is calling an exported safe runtime/core API intended for that purpose.
- TUI state should be reconstructable from runtime events plus safe state snapshots.
- Adapter-local reducer state is allowed only as derived display state; losing it must not change runtime truth.
- No TUI code should execute shell commands, apply patches, approve policy requests, or promote skills directly in this story.

### Testing Requirements

- Use Vitest and existing test style.
- Prefer pure unit tests for TUI read-model functions before terminal renderer tests.
- Use temp-project fixtures when testing cwd/project config/skill state.
- Include secret-like values in fixtures and assert they do not appear in serialized TUI state.
- Include candidate and promoted skill fixtures from Epic 5 patterns and assert candidates are not active skills.
- Keep tests deterministic: no network, no real terminal interaction, no live provider calls.
- If adding CLI entrypoint, extend CLI smoke tests with bounded text/json assertions.

### Project Structure Notes

- Expected implementation stays inside the existing workspace:
  - `packages/tui` for adapter/read-model/rendering.
  - `packages/core` only for exported runtime-safe state if truly missing.
  - `packages/cli` only for a thin TUI entrypoint if required.
  - `tests/` for adapter-state and optional CLI smoke tests.
- Avoid introducing a global frontend state library, separate TUI session store, or duplicated runtime loop.
- Avoid moving runtime-event definitions into the TUI package.

### Open Questions for Implementation

- Can Story 6.1 satisfy acceptance with pure TUI state/read-model functions and tests before adding Ink/React rendering?
- Should `AgentRuntime.getBootstrapState().interfaces` be expanded to include `tui`, or should TUI display supported adapter names from adapter-local metadata?
- Should the first visible TUI command be `sprite tui`, `sprite --tui`, or a package-only API until Story 6.2/6.3 needs interactive terminal behavior?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Story created after Epic 5 retrospective commit `2efb53d`.
- Loaded BMad create-story workflow, sprint status, Epic 6 planning, PRD TUI requirements, architecture adapter/runtime boundaries, Epic 5 retrospective, current package layout, TUI placeholder package, core bootstrap/self-model exports, and recent git history.
- Confirmed current package registry versions with `npm view ink version`, `npm view react version`, and `npm view @types/react version` on 2026-05-11.

### Completion Notes List

- Created ready-for-dev story context for Story 6.1.
- Scoped Story 6.1 as minimal TUI startup/runtime state visibility, not full interactive steering or slash-command behavior.
- Captured adapter-thin guardrails from architecture and Epic 5 retrospective.
- Identified current implementation surfaces, TUI package baseline, suggested contracts, dependency caution, and testing expectations.

### File List

- `_bmad-output/implementation-artifacts/6-1-render-minimal-tui-startup-and-runtime-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-11: Created ready-for-dev Story 6.1 context for minimal TUI startup/runtime state.
