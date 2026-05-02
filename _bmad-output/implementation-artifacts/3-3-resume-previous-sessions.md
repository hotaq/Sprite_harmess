# Story 3.3: Resume Previous Sessions

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to resume a previous session,
so that I can continue work without manually reconstructing the task.

## Acceptance Criteria

1. Given a readable session store exists, when the user resumes a session, then the runtime restores task goal, latest plan, compacted summary if present, recent event history, files touched, commands run, pending approvals, last error, and next step, and it emits a session resume event.
2. Given the requested session is missing or unreadable, when the user attempts to resume, then Sprite Harness returns a structured recoverable error with subsystem, cause, and next action, and it does not crash the process.

## Tasks / Subtasks

- [ ] Add a safe storage-level resume read contract (AC: 1, 2)
  - [ ] Reuse `readSessionArtifacts()` so resume reads existing `.sprite/sessions/<session-id>/state.json` and `events.ndjson` without creating or mutating artifacts during validation.
  - [ ] Add or reuse a result shape that exposes the full parsed event history needed for runtime rehydration while keeping recent-event limits for display-only APIs separate.
  - [ ] Return structured `SpriteError` values for invalid session IDs, missing sessions, missing/unreadable state or event files, invalid JSON, malformed NDJSON, unsupported schema, state/event session ID mismatch, and invalid runtime events.
  - [ ] Do not deserialize persisted state into a full `PlannedExecutionFlow` inside `@sprite/storage`; storage must remain core-agnostic.
  - [ ] Keep `.sprite/sessions` project-local path escape protection intact.
- [ ] Add a runtime session resume API in `packages/core` (AC: 1, 2)
  - [ ] Add a method/function such as `AgentRuntime.resumeSession(sessionId)` or `resumeSessionState(cwd, sessionId, options)` that reads the session and constructs a minimal runtime-owned active task from persisted safe state.
  - [ ] Restore task goal, latest plan, recent event history, files read/changed/proposed, command summaries, pending approval count, last error, and next step from `state.json` plus `events.ndjson` evidence.
  - [ ] Keep restored runtime state explicit and conservative: resume should continue from a waiting state by default and must not automatically execute tools, provider calls, validations, or approvals.
  - [ ] Preserve pending approval visibility without silently re-executing the original tool call; if approval payloads are not safely reconstructable, surface a warning and require a fresh user decision.
  - [ ] Preserve compacted summary fields only if a prior story or fixture already stored them; do not implement compaction in this story.
- [ ] Emit and validate a session resume runtime event (AC: 1)
  - [ ] Add a metadata-only runtime event type such as `session.resumed` with schema version, session/task/correlation IDs, status, restored event count, restored current phase/status, and summary/next step.
  - [ ] Validate the event through `validateRuntimeEvent()` and reject raw output/content fields or secret-looking values just like tool, policy, approval, and validation events.
  - [ ] Append the resume event to `events.ndjson` before notifying subscribers, preserving Story 3.1 disk-before-bus ordering.
  - [ ] Update `state.json` after the resume event so `eventCount`, `lastEventId`, and `lastEventType` reflect the resumed state.
- [ ] Add CLI resume command while keeping adapters thin (AC: 1, 2)
  - [ ] Add `sprite resume <session-id>` or equivalent that calls the core resume API.
  - [ ] Support `--output text|json` for resume results; do not add NDJSON resume streaming unless it is a shared runtime event stream and explicitly needed.
  - [ ] Text output should clearly show resumed session ID, task goal, current status/phase, latest plan, restored event count, files touched, commands run, pending approvals, last error, next step, warnings, and the emitted resume event ID.
  - [ ] JSON output should expose the same bounded/redacted view with camelCase fields and no raw event payload dumps.
  - [ ] Missing/unreadable sessions should exit non-zero with a structured, recoverable error message and should not create a new session.
- [ ] Preserve privacy and local-first safety (AC: 1, 2)
  - [ ] Apply existing shared redaction helpers to task goal, plan summaries, event summaries, command summaries, errors, next steps, warnings, and resume result strings.
  - [ ] Never expose raw command output, raw file content, patch bodies, repository instructions, custom env values, provider credentials, or full event payload dumps in CLI/core adapter-facing output.
  - [ ] Preserve project-local portability warnings for `.sprite/sessions` artifacts.
  - [ ] Do not add a database, cloud sync, vector search, memory persistence, project-context loading, or compaction implementation.
- [ ] Update tests and documentation (AC: 1, 2)
  - [ ] Add storage/core tests proving resume reads existing temp sessions, validates runtime events, and does not create artifacts for missing sessions.
  - [ ] Add runtime tests proving resume emits a `session.resumed` event, appends it to `events.ndjson`, updates `state.json`, and restores active task state conservatively.
  - [ ] Add CLI tests proving `sprite resume <session-id>` can resume a session created by a previous one-shot or interactive CLI run in the same temp cwd.
  - [ ] Add error-path tests for invalid IDs, missing sessions, invalid `state.json`, malformed `events.ndjson`, and invalid runtime events.
  - [ ] Add redaction tests with secret-looking task goals, latest plan summaries, last errors, next steps, and event summaries.
  - [ ] Update README/progress only for implemented resume behavior; do not claim project context loading, context assembly, compaction, TUI/RPC resume, or continued provider-driven automatic execution.
  - [ ] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, targeted Prettier check, and `rtk gitnexus status`/`rtk gitnexus analyze` fallback before marking review-ready.

## Dev Notes

### Story Intent

Story 3.3 is the first resume slice. It should make an existing local session usable again after process restart or interruption, but it must stay conservative: resume restores enough runtime state and audit context to continue intentionally, not to replay tools or silently complete work.

Implement this slice:

- Read an existing project-local session from `.sprite/sessions/<session-id>/`.
- Rehydrate a runtime-owned active task from safe persisted snapshot/event history.
- Emit and persist a `session.resumed`-style event.
- Expose resume through a thin CLI command.
- Return structured recoverable errors for missing/unreadable sessions.

Do not implement in this story:

- Project context loading from `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules`. Story 3.4 owns that.
- Context assembly from memory, skills, project context, or runtime self-model. Story 3.5 owns that.
- Compaction, manual compaction, or compacted-context continuation. Stories 3.6-3.8 own those; only preserve existing compacted summary fields if already present.
- TUI or JSON-RPC resume flows. Later interface stories own those adapters.
- Provider-driven automatic continuation, tool replay, approval replay, or validation replay.
- Database/SQLite indexing, semantic search, or cloud sync.

### Source Requirements

- Story 3.3 requires resuming a readable session store and restoring task goal, latest plan, compacted summary if present, recent event history, files touched, commands run, pending approvals, last error, and next step. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.3]
- Story 3.3 requires a session resume event. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.3]
- Story 3.3 requires missing or unreadable sessions to return structured recoverable errors with subsystem, cause, and next action, without crashing the process. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.3]
- PRD FR31 requires users to resume previous sessions. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements > Sessions, Context, and Compaction]
- PRD NFR19 requires persisted task goal, latest plan, compacted summary, recent event history, files touched, commands run, pending approvals, last error, and next step so a task can resume when the session store is readable. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR21 requires provider errors to surface as structured runtime errors rather than crashing the process. Resume errors should follow the same structured-error posture. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR23 requires every task to have an inspectable audit trail containing tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- PRD NFR35 requires sessions and related artifacts to remain local by default. [Source: `_bmad-output/planning-artifacts/prd.md` Local-First Portability]
- Architecture requires append-only `events.ndjson`, recoverable `state.json`, and derived UI state rebuilt from events plus `state.json`. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Event Format]
- Architecture identifies resume/recovery as event log plus snapshot state and says session writes must be serialized per session. [Source: `_bmad-output/planning-artifacts/architecture.md` Persistence and Recovery]

### Previous Story Intelligence

Story 3.1 created durable local sessions:

- `@sprite/storage` owns `createSessionId()`, `isValidSessionId()`, `resolveSessionArtifactPaths()`, `LocalSessionStore`, `SessionEventRecord`, and `SessionStateSnapshot`.
- Session artifacts live under `path.resolve(cwd, ".sprite", "sessions", sessionId)` and session IDs use `ses_`.
- `events.ndjson` is append-only and should be treated as audit evidence.
- `state.json` is atomically replaced and recoverable, not the only source of truth.
- `AgentRuntime` appends runtime events before publishing them to subscribers.
- `state.json.eventCount` counts all session events, while `latestTask` is scoped to the latest task.
- `state.json.cwd` is normalized to an absolute project path.
- `.sprite/` is ignored and should remain uncommitted runtime state.

Story 3.2 added read-only inspection:

- `readSessionArtifacts(cwd, sessionId, options)` validates safe session paths, reads `state.json` and `events.ndjson`, returns bounded recent events, and does not mutate artifacts.
- `inspectSessionState(cwd, sessionId, options)` validates recent runtime events and returns a redacted adapter-facing view with session/task metadata, latest plan, execution state, files, command summaries, last error, next step, event-count drift warnings, and local-private-state warnings.
- `AgentRuntime.persistSessionSnapshot()` now stores `latestTask.latestPlan` as bounded redacted summaries from `PlannedExecutionFlow.steps`.
- `sprite session inspect <session-id>` supports `--output text|json` and `--recent-events <n>`.
- Inspection intentionally does not resume, replay tools, load project context, compact context, or expose raw event payloads.

Recent review lessons to preserve:

- Do not import `@sprite/core` from `@sprite/storage`; core already depends on storage.
- Keep adapters thin. CLI should call core APIs, not parse session files or own task state.
- Validation should fail before atomic state replacement or event append.
- Disk persistence should occur before subscriber notification for newly emitted events.
- Test fixtures must typecheck through `tests/tsconfig.json`.
- GitNexus `detect_changes` CLI is unavailable in this install; use `rtk gitnexus status`, analyze fallback, scoped diffs, and full validation as fallback evidence.

### Current Codebase State

Relevant files and symbols:

- `packages/storage/src/session-store.ts`: owns session paths, state/event schemas, `readSessionArtifacts()`, and `LocalSessionStore` append/write operations.
- `packages/core/src/session-inspection.ts`: current read-only adapter-facing inspection view; reuse summarization/redaction concepts for resume output where possible.
- `packages/core/src/agent-runtime.ts`: owns runtime session ID, active task, event bus, persistence ordering, `persistSessionSnapshot()`, and task state transitions. Resume work here has high blast radius.
- `packages/core/src/runtime-events.ts`: owns canonical runtime event types and validation. Add any `session.resumed` event here with metadata-only validation.
- `packages/core/src/task-state.ts`: owns `PlannedExecutionFlow`, statuses, phases, waiting/terminal state, and plan step types.
- `packages/cli/src/index.ts`: Commander CLI root; add a thin resume command here.
- `tests/session-store.test.ts`: storage read/write artifact tests.
- `tests/session-inspection.test.ts`: core inspection redaction/view test.
- `tests/session-persistence.test.ts`: runtime durable session persistence tests.
- `tests/cli-smoke.test.ts`: CLI smoke tests, including session inspect coverage.

No external web research is required for implementation. This story uses existing Node.js, TypeScript, Commander, Vitest, and local workspace packages only; do not add dependencies.

### Suggested Resume Contracts

Final names can differ, but preserve the behavior:

```ts
export interface SessionResumeResult {
  sessionId: string;
  taskId: string;
  correlationId: string;
  status: TaskExecutionStatus;
  currentPhase: RuntimeLoopPhase;
  goal: string;
  latestPlan: SessionSnapshotPlanStep[];
  restoredEventCount: number;
  resumeEventId: string;
  inspection: SessionInspectionView;
  warnings: string[];
}
```

Guidance:

- Resume should rebuild a minimal `PlannedExecutionFlow` from persisted safe state and validated events.
- If no latest task exists, return a recoverable error instead of inventing a task.
- If event log count and `state.json.eventCount` disagree, preserve the warning and resume from the event log plus bounded snapshot fields.
- If pending approvals exist but original approval payloads are not fully reconstructable, keep visibility and warn that a fresh approval decision is required.
- The resume event should be safe metadata only and should not include raw event payloads or command outputs.

### CLI Behavior Requirements

Recommended command:

```bash
sprite resume <session-id> [--output text|json]
```

Behavior:

- Resolve the session under the command cwd, not a global registry.
- Do not create missing session artifacts.
- Do not automatically execute pending work, commands, tools, validations, provider calls, or approvals after resume.
- Text output should make it obvious that the session has resumed into a conservative waiting/continuation state.
- JSON output should expose the same bounded/redacted data with camelCase fields.
- Missing/unreadable sessions should exit non-zero with a structured recoverable error and no crash stack.

### Safety and Privacy Requirements

- Treat every resumed/displayed field as sensitive until redacted.
- Apply shared redaction helpers to task goals, plan summaries, event summaries, command summaries, last errors, next steps, warning text, and resume summaries.
- Never display raw command output, raw file contents, raw patch bodies, environment values, repository instructions, provider credentials, or full event payload objects.
- If a field cannot be safely summarized, omit it and add a warning rather than exposing raw data.
- Preserve local-private-state warnings for `.sprite/sessions` artifacts.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in story debug log:

- `rtk gitnexus impact -r Sprite_harmess readSessionArtifacts --direction upstream` before changing storage read behavior.
- `rtk gitnexus impact -r Sprite_harmess SessionStateSnapshot --direction upstream` before changing persisted snapshot shape.
- `rtk gitnexus impact -r Sprite_harmess AgentRuntime --direction upstream` before changing resume/runtime persistence logic; expect high/critical risk and keep edits narrow.
- `rtk gitnexus impact -r Sprite_harmess RuntimeEventRecord --direction upstream` and/or `rtk gitnexus impact -r Sprite_harmess validateRuntimeEvent --direction upstream` before adding a resume event type.
- `rtk gitnexus impact -r Sprite_harmess createProgram --direction upstream` before changing CLI command registration.
- If GitNexus reports stale index, run `rtk gitnexus analyze` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `rtk gitnexus status`, scoped diffs, and full validation as fallback evidence.

### Testing Requirements

Minimum coverage:

- Storage/core resume reads an existing temp session without creating missing artifacts.
- Invalid and missing session IDs return structured recoverable errors.
- Invalid `state.json`, malformed `events.ndjson`, and invalid runtime events fail safely.
- Runtime resume emits a `session.resumed` event, appends it to `events.ndjson`, updates `state.json`, and preserves disk-before-bus ordering.
- Runtime resume restores task goal, latest plan, recent event history, files touched, commands run, pending approval visibility, last error, and next step.
- CLI can resume a session created by a previous one-shot or interactive CLI run in the same temp cwd.
- Text output includes resumed session ID, task goal, current status/phase, latest plan, restored event count, files touched, commands run, pending approvals, last error, next step, warnings, and resume event ID.
- JSON output exposes the same redacted/bounded view.
- Secret-looking values in task goals, plan summaries, last errors, next steps, event summaries, or command summaries are redacted.
- Existing config, runtime-events, runtime-loop, sandbox, tool-registry, memory-safety, provider, session persistence, session inspection, and CLI smoke tests remain green.

## Project Structure Notes

- Keep session artifact reading and validation in `packages/storage`.
- Keep resume state composition and runtime event emission in `packages/core`.
- Keep CLI rendering thin in `packages/cli`.
- Do not create `packages/rpc`, TUI work, project-context loaders, or compaction modules in this story.
- Prefer extending existing session tests over adding broad new scenario infrastructure unless the new coverage becomes clearer as a focused scenario test.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-05-03: Created Story 3.3 context after Story 3.2 implementation was committed locally and left in `review` for later review pass.
- 2026-05-03: Loaded BMAD create-story workflow, sprint status, Epic 3 Story 3.3 requirements, PRD FR31/NFR19/NFR23/NFR35 requirements, architecture resume/session storage guidance, Story 3.1 persistence learnings, and Story 3.2 inspection implementation notes.
- 2026-05-03: Story 3.2 commit available locally as `2fee2a6 Make persisted sessions inspectable before resume work`; branch was ahead of `origin/main` by one commit at story context creation time.

### Completion Notes List

- Story 3.3 is ready for dev-story implementation and should be treated as conservative resume work, not automatic replay or context assembly.
- Story 3.2 remains in review and should be revisited after the next story per user direction.

### File List

- `_bmad-output/implementation-artifacts/3-3-resume-previous-sessions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Version | Description                               | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-05-03 | 0.1     | Created Story 3.3 implementation context. | Codex  |

## QA Results

Story context created and ready for dev-story implementation.
