# Story 3.2: Inspect Basic Session State

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to inspect basic session state,
so that I know what task is active, what happened, and what can be resumed.

## Acceptance Criteria

1. Given a session exists, when the user requests session state, then Sprite Harness shows session ID, cwd, task goal, latest plan, terminal/waiting state, recent events, files touched, commands run, pending approvals, last error, and next step when available.
2. Given session state includes sensitive or secret-like content, when the state is displayed through CLI or future adapters, then secrets are redacted and project-local portability warnings are preserved where relevant.

## Tasks / Subtasks

- [ ] Add read-only session inspection primitives to `@sprite/storage` (AC: 1, 2)
  - [ ] Add APIs that read existing `.sprite/sessions/<session-id>/state.json` and `events.ndjson` without creating or mutating session artifacts.
  - [ ] Reuse `resolveSessionArtifactPaths()` and `isValidSessionId()` so inspection cannot escape the project-local `.sprite/sessions` root.
  - [ ] Return structured `SpriteError` values for missing sessions, unreadable `state.json`, unreadable `events.ndjson`, invalid JSON, malformed NDJSON lines, and unsupported snapshot schema.
  - [ ] Keep `SessionStateSnapshot` as a persisted schema contract; do not deserialize into `PlannedExecutionFlow` or imply resume support.
  - [ ] Add bounded recent-event reading options: default to the latest 20 events, reject negative limits, and cap user-provided limits to a safe maximum such as 100.
- [ ] Extend bounded session snapshots only as needed for inspection (AC: 1)
  - [ ] Add a safe latest-plan snapshot field if needed to satisfy “latest plan”; use bounded summaries from `PlannedExecutionFlow.steps` instead of serializing the full flow.
  - [ ] Preserve current snapshot fields: `sessionId`, `cwd`, `latestTask`, `eventCount`, `lastEventId`, `lastEventType`, `filesRead`, `filesChanged`, `filesProposedForChange`, `pendingApprovalCount`, `lastError`, and `nextStep`.
  - [ ] Keep `state.json` recoverable but not authoritative: inspection should include enough event-log evidence to show when `state.eventCount` and `events.ndjson` line count disagree.
  - [ ] Maintain the storage-owned snapshot status/phase literal contracts introduced in Story 3.1; do not import core task-state types into storage.
- [ ] Build a core-level session inspection view for adapters (AC: 1, 2)
  - [ ] Add an adapter-friendly inspection result shape in `packages/core` that combines snapshot metadata with recent safe event summaries.
  - [ ] Derive commands run from safe runtime event metadata only (`tool.call.*`, `validation.*`, policy/approval summaries where applicable); never read or expose raw command output, patch bodies, env values, or full tool results.
  - [ ] Derive terminal/waiting state from `latestTask.status`, `lastEventType`, and safe event payload summaries; do not restore active runtime state.
  - [ ] Include project-local portability warnings: session artifacts are local private state under the current cwd and are not safe to commit/share.
  - [ ] Redact all user-facing strings with existing shared redaction helpers before rendering or returning adapter-facing display strings.
- [ ] Add CLI session inspection command while keeping the adapter thin (AC: 1, 2)
  - [ ] Add a minimal command such as `sprite session inspect <session-id>` that calls the core inspection API.
  - [ ] Support `--output text|json` for the inspect command; keep NDJSON streaming scoped to task execution unless explicitly needed.
  - [ ] Support `--recent-events <n>` for bounded recent event display.
  - [ ] Text output must be scannable and include session ID, cwd, goal, status, current phase/latest plan, waiting/terminal information, recent events, files read/changed/proposed, commands run, pending approvals, last error, next step, and warnings when available.
  - [ ] JSON output must expose the same bounded/redacted view with camelCase fields and no raw event payload dumps.
  - [ ] Missing or invalid sessions should exit non-zero with a structured, human-readable error; do not create a new session while inspecting.
- [ ] Preserve safety and privacy boundaries (AC: 2)
  - [ ] Apply `redactSecretLikeValues()` / `createRedactedPreview()` to displayed strings such as task goal, plan summaries, event summaries, command summaries, last error, next step, and warning text.
  - [ ] Add tests with secret-looking task goals or event summaries (`OPENAI_API_KEY=...`, `sk-...`, private-key-looking text) proving inspect output redacts them.
  - [ ] Do not display raw `events.ndjson` lines or full payload objects; render only an allowlisted summary per event type.
  - [ ] Do not add persistence dependencies or a database.
- [ ] Update tests and documentation (AC: 1, 2)
  - [ ] Add storage tests for read-only inspection from temp directories, missing sessions, invalid state JSON, invalid NDJSON, event ordering, recent-event limits, and state/event-count drift warnings.
  - [ ] Add core/CLI tests proving `sprite session inspect <session-id>` can inspect a session created by a previous CLI one-shot run in a temp cwd.
  - [ ] Add text and JSON output tests for redaction and for all required display fields.
  - [ ] Update README/progress only for implemented inspection behavior; do not claim resume, compaction, TUI, JSON-RPC, or project-context loading.
  - [ ] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, targeted Prettier check, and `rtk gitnexus status`/`rtk gitnexus analyze` fallback before marking review-ready.

## Dev Notes

### Story Intent

Story 3.2 is the read-only inspection slice that sits on top of Story 3.1 durable session artifacts. It must let a developer inspect a persisted session without resuming it, mutating it, or trusting `state.json` as the only source of truth.

Implement this slice:

- Read existing project-local session artifacts from `.sprite/sessions/<session-id>/`.
- Build a bounded, redacted session inspection view from `state.json` plus recent `events.ndjson` entries.
- Expose that view through a thin CLI command.
- Keep storage, core, and CLI boundaries explicit so future TUI/RPC adapters can reuse the core view.

Do not implement in this story:

- `sprite resume`, session restore, active runtime rehydration, or a resume event. Story 3.3 owns resume behavior.
- Project context loading from `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`. Story 3.4 owns that.
- Context assembly, compaction, manual compaction, or compacted-context continuation. Stories 3.5-3.8 own those.
- TUI or JSON-RPC session-state screens. Later interface stories own those adapters; this story should provide reusable core data.
- Database/SQLite indexing, semantic search, or cloud sync.

### Source Requirements

- Story 3.2 requires users to inspect basic session state including session ID, cwd, task goal, latest plan, terminal/waiting state, recent events, files touched, commands run, pending approvals, last error, and next step. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.2]
- Story 3.2 requires sensitive or secret-like display content to be redacted and project-local portability warnings to be preserved. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.2]
- PRD FR32 requires users to inspect basic session state. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements > Sessions, Context, and Compaction]
- PRD NFR19 requires persisted task goal, recent event history, files touched, commands run, pending approvals, last error, and next step to be readable for future resume. This story should display that data without implementing resume. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR23 requires every task to have an inspectable audit trail. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- PRD NFR35 requires sessions and related artifacts to be local by default. [Source: `_bmad-output/planning-artifacts/prd.md` Local-First Portability]
- Architecture requires runtime events to remain append-only in `events.ndjson` and derived UI state to rebuild from events plus `state.json`. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Event Format]
- Architecture maps persisted storage abstractions to `packages/storage`, core runtime lifecycle to `packages/core`, and CLI rendering to `packages/cli`; adapters must not own task/session lifecycle state. [Source: `_bmad-output/planning-artifacts/architecture.md` Structure Patterns]
- Epic 2 retrospective warns that session state display can re-expose sensitive context and every displayed field should be treated as potentially sensitive until safety filters prove otherwise. [Source: `_bmad-output/implementation-artifacts/epic-2-retro-2026-04-26.md` Session State Can Re-Expose Sensitive Context]

### Previous Story Intelligence

Story 3.1 created the persistence foundation:

- `@sprite/storage` owns project-local session artifact paths, `SessionStateSnapshot`, `SessionEventRecord`, `createSessionId()`, and `LocalSessionStore`.
- Session IDs use the canonical `ses_` prefix.
- Session artifacts are under `path.resolve(cwd, ".sprite", "sessions", sessionId)`.
- `events.ndjson` is append-only at the storage/runtime boundary.
- `state.json` is atomically replaced and is a recoverable snapshot, not the sole source of truth.
- `AgentRuntime` persists runtime events before publishing them to the in-memory event bus.
- `state.json.eventCount` counts all events in the runtime session, while `latestTask` remains scoped to the latest active task.
- `state.json.cwd` is normalized to an absolute project path.
- `latestTask.status` and `latestTask.currentPhase` use storage-owned literal unions; keep those literals aligned with core runtime states before adding new task statuses or phases.
- `.sprite/` is ignored and must remain uncommitted runtime state.

Recent review lessons to preserve:

- Do not import `@sprite/core` from `@sprite/storage`; core already depends on storage.
- Validation should fail before atomic state replacement or event append.
- Tests must typecheck fixtures, not rely only on Vitest transpilation.
- GitNexus `detect_changes` is unavailable in this install; use `rtk gitnexus status`, analyze fallback, scoped diffs, and full validation as fallback evidence.

### Current Codebase State

Relevant files and symbols:

- `packages/storage/src/session-store.ts`: current write-only session store primitives; add read/inspect helpers here or a small sibling file exported by `packages/storage/src/index.ts`.
- `packages/core/src/agent-runtime.ts`: currently writes session snapshots and task events; extend snapshot contents here only if the inspection view needs extra bounded data such as latest plan summaries.
- `packages/core/src/runtime-events.ts`: owns `RuntimeEventRecord` validation and safe event payload schemas; reuse validation rather than inventing untyped event parsing.
- `packages/core/src/final-task-summary.ts`: already groups files read/changed/proposed and unresolved risks for final summaries; reuse concepts but do not make inspection depend on a live `PlannedExecutionFlow`.
- `packages/cli/src/index.ts`: Commander CLI root; add a thin session inspection command here.
- `tests/session-store.test.ts`: storage tests for session artifacts; extend with read-only inspection tests.
- `tests/session-persistence.test.ts`: runtime integration tests for persisted session artifacts; extend if snapshot shape changes.
- `tests/cli-smoke.test.ts`: CLI smoke tests; add inspect command tests using temp workspaces.

No external web research is required for implementation. This story uses existing Node.js, TypeScript, Commander, Vitest, and local workspace packages only; do not add dependencies.

### Suggested Inspection Contracts

Final names can differ, but preserve the behavior:

```ts
export interface SessionInspectionEventSummary {
  createdAt: string;
  eventId: string;
  taskId: string;
  type: string;
  summary: string;
}

export interface SessionInspectionView {
  sessionId: string;
  cwd: string;
  schemaVersion: 1;
  latestTask?: {
    taskId: string;
    correlationId: string;
    status: SessionSnapshotTaskStatus;
    currentPhase: SessionSnapshotRuntimePhase;
    goal: string;
    latestPlan?: Array<{
      phase: SessionSnapshotRuntimePhase;
      status: "completed" | "pending";
      summary: string;
    }>;
  };
  eventCount: number;
  persistedEventCount: number;
  recentEvents: SessionInspectionEventSummary[];
  filesRead: string[];
  filesChanged: string[];
  filesProposedForChange: string[];
  commandsRun: string[];
  pendingApprovalCount: number;
  lastError?: string;
  nextStep?: string;
  warnings: string[];
}
```

Guidance:

- `eventCount` may come from `state.json`; `persistedEventCount` should come from counting parsed event log entries.
- Include a warning if these counts disagree.
- Event summaries should be allowlisted by event type and redacted; do not return raw payload objects in the adapter-facing view.
- Command summaries should come only from already-safe command metadata in runtime events.

### CLI Behavior Requirements

Recommended command:

```bash
sprite session inspect <session-id> [--output text|json] [--recent-events <n>]
```

Behavior:

- Resolve the session under the command cwd, not a global session registry.
- Do not create `.sprite/sessions/<session-id>` if it does not exist.
- Text output should be human-scannable and truthful about missing optional fields.
- JSON output should be stable, redacted, camelCase, and bounded.
- Invalid `session-id` should fail before path construction.
- Missing session artifacts should return a structured error and non-zero exit.

### Safety and Privacy Requirements

- Treat every displayed field as sensitive until redacted.
- Apply shared redaction helpers to task goals, plan summaries, event summaries, command summaries, last errors, next steps, warning text, and any future adapter-facing strings.
- Never display raw command output, raw file contents, raw patch bodies, environment values, repository instructions, provider credentials, or full event payload objects.
- If a future field cannot be safely summarized, omit it and add a warning rather than exposing raw data.
- Preserve project-local portability warnings: `.sprite/sessions` artifacts are local private state and should not be committed or treated as portable across machines.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in story debug log:

- `rtk gitnexus impact -r Sprite_harmess SessionStateSnapshot --direction upstream` before changing persisted snapshot shape.
- `rtk gitnexus impact -r Sprite_harmess LocalSessionStore --direction upstream` before adding or modifying storage methods.
- `rtk gitnexus impact -r Sprite_harmess AgentRuntime --direction upstream` before changing snapshot-writing logic in `packages/core/src/agent-runtime.ts`; expect high/critical risk and warn before editing if so.
- `rtk gitnexus impact -r Sprite_harmess createProgram --direction upstream` before changing CLI command registration.
- If GitNexus reports stale index, run `rtk gitnexus analyze` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `rtk gitnexus status`, scoped diffs, and full validation as fallback evidence.

### Testing Requirements

Minimum coverage:

- Storage read APIs inspect an existing temp session without mutating files.
- Missing session IDs and invalid session IDs return structured errors.
- Invalid `state.json` and malformed `events.ndjson` lines return structured errors.
- Recent events are returned in chronological order after applying a bounded limit.
- `state.eventCount` vs parsed event log count mismatch produces a warning.
- CLI can inspect a session created by a previous one-shot CLI run in the same temp cwd.
- Text output includes session ID, cwd, task goal, current status/phase/latest plan, recent events, files touched, commands run, pending approvals, last error, next step, and warnings when present.
- JSON output exposes the same redacted/bounded view.
- Secret-looking values in task goals, plan summaries, last errors, next steps, event summaries, or command summaries are redacted.
- Existing config, runtime-events, runtime-loop, sandbox, tool-registry, memory-safety, provider, session persistence, and CLI smoke tests remain green.

## Project Structure Notes

- Put artifact reading and validation in `packages/storage`, not in CLI.
- Put adapter-facing inspection view composition in `packages/core`, not in CLI.
- Keep CLI rendering thin in `packages/cli`.
- Do not create `packages/rpc` or TUI work in this story.
- Keep tests in `tests/session-store.test.ts`, `tests/session-persistence.test.ts`, and `tests/cli-smoke.test.ts` unless a new cross-package scenario file is clearly cleaner.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-05-03: Created Story 3.2 context after Story 3.1 was marked done and pushed.
- 2026-05-03: Loaded BMAD create-story workflow, sprint status, Epic 3 requirements, PRD FR/NFR session requirements, architecture storage/event/structure sections, Epic 2 retrospective safety notes, Story 3.1 implementation learnings, and recent commits.
- 2026-05-03: Live temp-workspace validation before story creation passed for one-shot JSON and NDJSON session persistence (`task.started`, `task.waiting`, `task.failed`) with canonical `ses_` ID and persisted `state.json`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story 3.2 is ready for dev-story implementation and should be treated as read-only inspection work, not resume.

### File List

- `_bmad-output/implementation-artifacts/3-2-inspect-basic-session-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Version | Description                               | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-05-03 | 0.1     | Created Story 3.2 implementation context. | Codex  |

## QA Results

Story context created and ready for dev-story implementation.
