# Story 3.8: Continue Work from Compacted Context

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to continue from compacted context,
so that I do not need to restate prior work after compaction or restart.

## Acceptance Criteria

1. Given a session has a compacted summary, when the user resumes or continues the task, then the runtime uses the compacted summary with recent events to reconstruct the working context.
2. Given the runtime reconstructs working context from compaction, then the agent can continue without requiring the user to restate goal, constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, or next steps.
3. Given compacted context conflicts with newer events, when the runtime reconstructs context, then newer event history takes precedence.
4. Given compacted context conflicts with newer events, when precedence is applied, then the conflict is recorded as a recoverable context assembly note.

## Tasks / Subtasks

- [x] Add a compacted-context restoration contract in core (AC: 1, 2, 3, 4)
  - [x] Identify the latest valid `session.compacted` event in a session event log.
  - [x] Resolve its `artifactId` through storage-owned compaction artifact helpers; do not make adapters read arbitrary local JSON directly.
  - [x] Return a bounded restoration result containing the compaction summary, the compaction event metadata, recent events after that compaction event, and recoverable assembly notes.
  - [x] Treat missing compaction as a normal no-op path so sessions without compaction still resume exactly as before.
  - [x] Treat invalid/missing referenced artifact, scope mismatch, or invalid runtime event shape as structured `SpriteError` failures or explicit recoverable notes; do not silently proceed with corrupt continuity.
- [x] Feed compacted summary plus recent events into resume/continue context assembly (AC: 1, 2)
  - [x] Extend the context assembly input with a compacted-context field, or add a dedicated source section such as `compacted-context` and a bounded recent-events section.
  - [x] Preserve existing source ordering expectations deliberately; if source order changes, update all tests that assert `TASK_CONTEXT_SOURCE_ORDER`.
  - [x] Include continuity fields from `CompactionSummary.continuity`: `taskGoal`, `activeConstraints`, `decisions`, `currentPlan`, `progress`, `filesTouched`, `commandsRun`, `failures`, `pendingApprovals`, and `nextSteps`.
  - [x] Include only bounded event summaries for recent events; never embed raw large logs, raw tool output, approval payloads, file contents, secrets, or credentials.
  - [x] Keep project-context files untrusted and compacted session continuity trusted only as persisted runtime state, not as policy override.
- [x] Implement precedence and recoverable conflict notes (AC: 3, 4)
  - [x] Compare compacted continuity against newer event-derived/session-state fields that can supersede it, at minimum current task goal, latest plan/current phase, progress/next step, file activity, commands, failures, and pending approval count.
  - [x] Prefer newer event history and the latest `state.json` snapshot over stale compacted summary values when they disagree.
  - [x] Record recoverable context assembly notes with stable codes, human-readable messages, and enough provenance to explain which compacted field was superseded.
  - [x] Surface notes in the returned resume/context result without treating normal precedence handling as a hard failure.
- [x] Wire the behavior through `AgentRuntime.resumeSession()` without replaying effects (AC: 1, 2, 3, 4)
  - [x] Resume must still emit exactly one `session.resumed` event for the resume action.
  - [x] Resume must not replay tools, provider calls, validations, approvals, file edits, memory writes, or compaction events as side effects.
  - [x] Resumed task state should expose the compacted continuity in `request.contextPacket` so later provider/tool work can consume it.
  - [x] Preserve existing conservative waiting behavior: resumed sessions wait for explicit steering before further risky work.
- [x] Keep CLI behavior thin and data-driven (AC: 1, 2, 4)
  - [x] If `sprite resume <sessionId>` text/JSON output changes, render only core-owned bounded metadata and warnings/notes.
  - [x] Do not make CLI duplicate conflict resolution, read compaction artifacts directly, or assemble summaries.
  - [x] Existing `session inspect` and `session compact` output must continue to pass smoke tests.
- [x] Add deterministic tests before implementation (AC: 1, 2, 3, 4)
  - [x] RED test: a session compacted by `compactSessionManually()` and then resumed includes compacted continuity in the resumed task context.
  - [x] RED test: events after the latest `session.compacted` event appear as bounded recent-event context and take precedence over stale summary fields.
  - [x] RED test: conflict between compacted `nextSteps`/plan and newer `state.json`/event history records a recoverable context assembly note.
  - [x] Regression test: a session with no compaction still resumes with the same session-state context as Story 3.3.
  - [x] Regression test: multiple compactions use the latest compaction event/artifact, while preserving previous-compaction metadata as provenance.
  - [x] Regression test: missing/invalid referenced artifact returns a structured failure or note without replaying effects.
  - [x] Security test: secret-looking values and raw large outputs are redacted or represented only by existing `largeOutputReferences`.
- [x] Update story evidence and lifecycle status (AC: 1, 2, 3, 4)
  - [x] Report the exact contracts/functions to be changed before code edits.
  - [x] Run GitNexus impact checks before editing each target symbol.
  - [x] Record implementation notes, changed files, and validation evidence in this story file.
  - [x] Run `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` before marking review-ready.

## Dev Notes

### Story Intent

Story 3.8 consumes the compacted context produced by Stories 3.6 and 3.7. The implementation should make resume/continue context assembly compact-aware: the compacted summary supplies older continuity, while recent event history and the latest session snapshot override stale compacted values.

Implement this slice:

- Discover the latest persisted compaction for a session from append-only `events.ndjson`.
- Read its storage-owned compaction artifact safely.
- Add compacted continuity and bounded recent-event context to resumed task context.
- Detect conflicts where newer events/state supersede compacted summary fields.
- Surface those conflicts as recoverable context assembly notes.

Do not implement in this story:

- Automatic threshold-triggered compaction.
- New TUI slash commands or JSON-RPC compaction/resume methods.
- Provider/LLM summarization, semantic/vector memory, or durable learning review.
- Deleting, truncating, or rewriting historical `events.ndjson`.
- Replaying tools, provider calls, approvals, validations, file edits, memory writes, or compaction events.
- Broad UI redesign; CLI can render bounded core-owned metadata only if needed for tests.

### Source Requirements

- Story 3.8 requires the agent to continue from compacted context so the developer does not restate prior work after compaction or restart. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.8]
- AC1 requires resumed/continued runtime context to combine the compacted summary with recent events. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.8]
- AC2 requires continuity for goal, constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.8; `_bmad-output/planning-artifacts/prd.md` FR37/NFR5]
- AC3 requires newer event history to take precedence over compacted context when conflicts exist. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.8]
- AC4 requires conflicts to be recorded as recoverable context assembly notes. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.8]
- PRD FR37 requires the agent to use compacted context to continue a task. [Source: `_bmad-output/planning-artifacts/prd.md` Sessions, Context, and Compaction]
- PRD NFR19 requires persisted task goal, latest plan, compacted summary, recent event history, files touched, commands run, pending approvals, last error, and next step to support resume after restart/interruption. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture assigns task lifecycle, event emission, context assembly, compaction, and terminal state to core/runtime; adapters own parsing/rendering only. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]
- Architecture defines `.sprite/sessions/<session-id>/events.ndjson`, `state.json`, and `compactions/` as local artifact storage; event history is append-only and `state.json` is recoverable snapshot, not sole source of truth. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Architecture]

### Architecture Guardrails

- Core owns compaction-aware resume/context assembly; CLI should call core and render returned metadata only.
- Storage owns file layout and compaction artifact path validation. Do not bypass `readSessionArtifacts()` or `readSessionCompactionArtifact()` with adapter-owned JSON parsing.
- Append-only `events.ndjson` remains canonical. `state.json` can help with latest snapshot precedence but must not be treated as the only source of truth.
- Newer events/state win over compacted summary for conflicts because the summary represents an older bounded view.
- Conflict notes must be recoverable and non-fatal unless the artifact/event evidence is corrupt enough that safe context assembly is impossible.
- Secrets, credentials, private keys, tokens, `.env` values, raw logs, raw tool outputs, approval payloads, and file content must not be embedded in context notes or CLI output.
- Reuse existing `Result<SpriteError>`, runtime event validation, redaction helpers, `CompactionSummary`, `readSessionArtifacts()`, `readSessionCompactionArtifact()`, `inspectSessionState()`, and `assembleTaskContextPacket()` patterns.
- Do not add dependencies. Use the pinned project stack: Node `>=22`, TypeScript `^5.9.2`, Vitest `^3.2.4`.

### Current Codebase State

- `packages/core/src/compaction.ts` exposes `CompactionSummary`, `CompactionSummaryContinuity`, `compactSessionArtifacts()`, and `compactSessionManually()`.
- `compactSessionManually()` writes a compaction artifact, appends one `session.compacted` event, and returns warnings if the post-append snapshot update fails.
- `packages/core/src/runtime-events.ts` validates `session.compacted` payloads with bounded artifact/source metadata.
- `packages/storage/src/session-store.ts` supports `compactionsDir`, compaction artifact ID/path validation, duplicate artifact rejection, `writeSessionCompactionArtifact()`, and `readSessionCompactionArtifact()`.
- `packages/core/src/agent-runtime.ts` implements `resumeSession(sessionId)` and private `createResumedTask()`. Resume currently restores persisted events, emits one `session.resumed` event, creates a conservative resumed task, and waits for steering.
- `packages/core/src/runtime-loop.ts` builds task requests with `createTaskRequest()`, which calls `assembleTaskContextPacket()`.
- `packages/core/src/task-context.ts` currently has source order: `runtime-self-model`, `provider-limits`, `user-input`, `session-state`, `project-context`, `memory`, `skills`.
- Tests assert `TASK_CONTEXT_SOURCE_ORDER` and indexed section positions in `tests/task-context.test.ts` and `tests/runtime-loop.test.ts`; update these deliberately if adding a new context source.
- `.gitignore` may have local out-of-scope modifications in the working tree; do not stage it unless explicitly requested.

### Previous Story Intelligence

- Story 3.6 created deterministic compaction artifacts while preserving continuity fields and avoiding raw large output embedding.
- Story 3.6 review fixed gaps around decisions, active constraints, context-packet session mismatch, and source/inspection read mismatch. Do not regress those protections.
- Story 3.7 created the manual trigger and `session.compacted` event but intentionally deferred compacted-summary consumption to Story 3.8.
- Story 3.7 review fixed audit durability: duplicate artifact IDs now fail with `SESSION_COMPACTION_ARTIFACT_EXISTS`, and snapshot update failure after event append returns a warning instead of a misleading hard failure.
- Story 3.3 established conservative resume behavior: restore state/evidence but never replay tools, approvals, validations, provider calls, or unsafe authority.
- Latest relevant commits:
  - `4b35cbe` — protects manual compaction audit history from persistence ambiguity.
  - `f48c097` — exposes manual session compaction without runtime replay.
  - `179c852` — prepares manual compaction trigger story.
  - `b5be263` — closes completed compaction story.
  - `4600a67` — preserves compacted session continuity for resume handoff.

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact contracts/functions you will touch. Likely candidates:

- `packages/core/src/compaction.ts`
  - add a read/restore helper such as `restoreCompactedSessionContext()` / `readLatestCompactedContext()` / `buildCompactedResumeContext()`
  - add types such as `CompactedSessionContext`, `CompactedContextRecentEvent`, and `ContextAssemblyNote`
  - reuse `CompactionSummary` and `CompactionSummaryContinuity`; do not create duplicate summary schemas
- `packages/core/src/task-context.ts`
  - extend `TaskContextAssemblyInput` with compacted context, or add source kind(s) such as `compacted-context` / `recent-session-events`
  - add recoverable notes to `TaskContextPacket` or section metadata if needed
  - update `summarizeTaskContextPacket()` if notes/source counts change
- `packages/core/src/runtime-loop.ts`
  - extend `TaskRequestContextOptions` so `createTaskRequest()` can pass compacted context into `assembleTaskContextPacket()`
- `packages/core/src/agent-runtime.ts`
  - update `resumeSession()` and private `createResumedTask()` to obtain and pass compacted context while preserving no-replay semantics
  - expose notes/warnings through `SessionResumeResult` if needed
- `packages/cli/src/index.ts`
  - update `renderSessionResumeText()` / JSON output only if core exposes compacted context notes that users should see
- Tests
  - `tests/compaction.test.ts` for compacted context restore helper
  - `tests/task-context.test.ts` for packet section/note shape
  - `tests/runtime-loop.test.ts` for task request assembly
  - `tests/session-persistence.test.ts` for resume behavior
  - `tests/cli-smoke.test.ts` only if CLI output changes

These names are guidance, not mandatory. Prefer the smallest typed core API that reuses existing compaction/session contracts.

### File Structure Requirements

- Keep compaction artifact discovery/restore logic in `packages/core/src/compaction.ts` unless a smaller dedicated core module is clearly justified.
- Keep task-context section creation in `packages/core/src/task-context.ts`.
- Keep runtime resume orchestration in `packages/core/src/agent-runtime.ts`.
- Keep adapter rendering in `packages/cli/src/index.ts` thin and optional.
- Keep storage path validation in `packages/storage/src/session-store.ts`; only extend storage if core cannot safely identify latest artifacts with existing APIs.
- Add/update root tests under `tests/`; do not introduce `tests/scenarios/` unless the repository has already adopted that structure.
- Update this story file and `sprint-status.yaml` as lifecycle evidence only.

### Safety and Security Requirements

- Compacted context is persisted runtime state, not an instruction authority that can override system/developer policy, sandbox policy, approval requirements, or current user instructions.
- Recent events and latest state take precedence over older compacted summary values.
- Pending approvals must remain metadata only. Resume must not resurrect stale approval payloads or apply previous approval decisions.
- Large output references must stay as references/previews; do not expand raw tool logs into context.
- Conflict notes must not leak raw secret-looking values; use bounded previews/redaction.
- If the latest compaction artifact cannot be read or validated, fail or note recoverably before creating misleading context.

### Testing Requirements

Minimum targeted validation for implementation:

- `rtk run 'npm test -- --run tests/compaction.test.ts tests/task-context.test.ts tests/session-persistence.test.ts tests/runtime-loop.test.ts'`
- Add CLI smoke coverage only if resume text/JSON output changes.
- Full suite before review: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`

Specific assertions to include:

- Resume after manual compaction includes compacted continuity in `activeTask.request.contextPacket`.
- Recent events after the latest `session.compacted` event are represented as bounded context.
- Newer event/state values override stale summary values and produce recoverable notes.
- Sessions without compaction preserve existing resume behavior.
- Multiple compactions choose the latest `session.compacted` event/artifact.
- Invalid artifact references do not replay side effects and return structured evidence.
- Secret-looking values are redacted from compacted context sections/notes.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "npx gitnexus status"` and `rtk run "npx gitnexus analyze"` if stale.
- `rtk run "npx gitnexus impact --repo Sprite_harmess resumeSession"` before editing resume behavior.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createResumedTask"` before editing resumed task construction, if GitNexus indexes the private method.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createTaskRequest"` before changing task request context options.
- `rtk run "npx gitnexus impact --repo Sprite_harmess assembleTaskContextPacket"` before changing task context assembly.
- `rtk run "npx gitnexus impact --repo Sprite_harmess TASK_CONTEXT_SOURCE_ORDER"` before changing context sources.
- `rtk run "npx gitnexus impact --repo Sprite_harmess compactSessionManually"` and `rtk run "npx gitnexus impact --repo Sprite_harmess readSessionArtifacts"` before changing compaction/session artifact flow.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createProgram"` before changing CLI output.
- If `detect_changes` is unavailable before commit, record the GitNexus CLI limitation and use `gitnexus status`, scoped diffs, and full validation as fallback evidence.

## Dev Agent Record

### Agent Model Used

GPT-5.4 Codex (session default)

### Debug Log References

- 2026-05-05: Created Story 3.8 context after Story 3.7 was closed. Loaded BMad create-story workflow, sprint status, Epic 3 Story 3.8 acceptance criteria, PRD FR37/NFR5/NFR19, architecture session/context/compaction boundaries, current `compaction.ts`, `task-context.ts`, `runtime-loop.ts`, `agent-runtime.ts`, storage compaction helpers, and Story 3.7 learnings.
- 2026-05-05: Latest technical research decision: no external web dependency research was needed for this story because it should use existing pinned project stack only (`typescript`, `vitest`, Node >=22) and must not add dependencies.
- 2026-05-05: Development phase started. GitNexus status up-to-date at `4b35cbe`. Pre-code impact checks: `AgentRuntime` CRITICAL, `createTaskRequest` CRITICAL, `assembleTaskContextPacket` LOW, `TASK_CONTEXT_SOURCE_ORDER` LOW, `compactSessionManually` LOW. `resumeSession` direct target was ambiguous in GitNexus; fallback context identified the intended symbol as `packages/core/src/agent-runtime.ts:AgentRuntime.resumeSession`.
- 2026-05-05: RED tests added for compacted-context restoration, context packet injection, resume precedence notes, no-compaction regression, latest-compaction selection, missing-artifact failure, and secret redaction. Initial targeted run failed as expected for missing `readLatestCompactedSessionContext`, missing `compacted-context` source, and resume context wiring.
- 2026-05-05: Implemented compacted-context restoration in `compaction.ts`, added `compacted-context` task context source, threaded compacted context through `createTaskRequest()` and `AgentRuntime.resumeSession()`, and kept resume side effects limited to one `session.resumed` event.
- 2026-05-05: Targeted validation passed with `rtk run 'npm test -- --run tests/compaction.test.ts tests/task-context.test.ts tests/session-persistence.test.ts tests/runtime-loop.test.ts'`: 4 files / 48 tests.
- 2026-05-05: Full validation passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: 15 files / 201 tests, typecheck/lint passed, whitespace check clean.
- 2026-05-05: Heavy review spawned two read-only agents. Code-review lane returned REQUEST CHANGES for newer event-history precedence gaps, unbounded post-compaction recent events, and artifact wrapper session-scope mismatch. Test-review lane returned coverage gaps for no-replay resume, end-to-end newer recent events, missing artifact through resume, bounded event counts, and helper-level redaction.
- 2026-05-05: GitNexus was force re-indexed with `rtk run 'npx gitnexus analyze --force --skip-agents-md --no-stats'` so newly added Story 3.8 symbols were visible. Follow-up impact checks: `readLatestCompactedSessionContext` LOW, `createCompactedContextNotes` HIGH, `createCompactedContextRecentEvent` LOW, `createTaskRequest` CRITICAL, `assembleTaskContextPacket` LOW. Edits were kept narrow to compaction restoration/context assembly and tests.
- 2026-05-05: Review fixes added bounded post-compaction recent-event restoration (`DEFAULT_COMPACTED_CONTEXT_RECENT_EVENT_LIMIT`), `SESSION_COMPACTION_ARTIFACT_SCOPE_MISMATCH`, event-history-derived `commandsRun`/`progress` recoverable notes, omitted-event metadata, and no-replay/missing-artifact/resume recent-event regression coverage.
- 2026-05-05: Post-review targeted validation passed with `rtk run 'npm test -- --run tests/compaction.test.ts tests/task-context.test.ts tests/session-persistence.test.ts'`: 3 files / 37 tests.
- 2026-05-05: Post-review full validation passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: 15 files / 207 tests, typecheck/lint passed, whitespace check clean. GitNexus CLI has no `detect_changes`/`detect-changes` command in this install; fallback evidence is GitNexus status, scoped diffs, impact checks, and full validation.

### Completion Notes List

- Added `readLatestCompactedSessionContext()` to resolve the latest `session.compacted` event, read its storage-owned artifact, return bounded recent events after compaction, and produce recoverable precedence notes.
- Added `compacted-context` to task context assembly so resumed tasks receive compacted continuity fields plus bounded recent event summaries.
- Wired `AgentRuntime.resumeSession()` to load compacted context before emitting the resume event, preserving no-replay semantics and surfacing notes as warnings.
- Added conflict precedence handling where newer `state.json`/event-derived fields supersede stale compacted continuity for task goal, plan, next steps, failures, files touched, and pending approvals.
- Added bounded post-compaction event count handling and omitted-event metadata so restore results cannot grow with unbounded event history.
- Added artifact wrapper session-scope validation before using compaction summary contents.
- Added event-history precedence notes for newer commands/progress and redaction coverage for helper-level recoverable notes.
- Added deterministic tests for no-compaction resume, latest-compaction selection, missing artifact failure, compacted context redaction, and resume context injection.
- Added resume integration tests proving newer post-compaction events flow into active task context, missing compaction artifacts fail before `session.resumed`, and persisted validation/file-edit events are restored without replaying side effects.
- Kept CLI behavior adapter-thin; only JSON source-order expectations changed for the new core-owned context source.

### File List

- `packages/core/src/compaction.ts`
- `packages/core/src/task-context.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/agent-runtime.ts`
- `tests/compaction.test.ts`
- `tests/task-context.test.ts`
- `tests/session-persistence.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/cli-smoke.test.ts`
- `_bmad-output/implementation-artifacts/3-8-continue-work-from-compacted-context.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Version | Description                               | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-05-05 | 0.3     | Addressed heavy-review findings for bounded event restore, scope validation, event-history precedence notes, and no-replay coverage. | Codex  |
| 2026-05-05 | 0.2     | Implemented compacted-context restoration and resume context consumption. | Codex  |
| 2026-05-05 | 0.1     | Created Story 3.8 implementation context and moved story to ready-for-dev. | Codex  |
