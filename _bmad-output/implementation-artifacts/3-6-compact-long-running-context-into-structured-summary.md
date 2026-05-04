# Story 3.6: Compact Long-Running Context into Structured Summary

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want long-running context to compact into a structured summary,
so that the agent can continue when the context grows too large.

## Acceptance Criteria

1. Given context approaches a configured threshold or the user requests compaction, when compaction runs, then it produces a structured summary preserving task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps, and the summary is saved under the session's compaction artifacts.
2. Given large tool outputs or logs exist in the session, when compaction summarizes the session, then it summarizes relevant information and preserves local log references instead of embedding large raw output.

## Tasks / Subtasks

- [x] Add core compaction summary contracts in `packages/core/src/compaction.ts` (AC: 1, 2)
  - [x] Define a deterministic `CompactionSummary` shape with a schema version, IDs, trigger reason, timestamps, status metadata, preserved fields, section summaries, source references, and safety/redaction metadata.
  - [x] Preserve these fields explicitly: task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps.
  - [x] Represent large outputs/logs as bounded summaries plus local artifact/log references; do not embed raw output beyond configured limits.
  - [x] Keep summary generation deterministic and extractive from runtime/session state; this story should not call a live provider or perform semantic/AI summarization.
  - [x] Reuse existing redaction and bounded-preview helpers where possible.
- [x] Add local compaction artifact persistence in `@sprite/storage` (AC: 1, 2)
  - [x] Extend session artifact path handling to include a session-local `compactions/` directory under `.sprite/sessions/<session-id>/`.
  - [x] Add storage helpers for writing and reading compaction artifacts, using kebab-case artifact filenames and camelCase JSON fields.
  - [x] Preserve existing session ID/path safety validation.
  - [x] If session state records the latest compaction pointer, update persisted schema ownership, normalization, versioning, and backward-compatibility tests deliberately.
  - [x] Do not introduce SQLite or any new storage dependency.
- [x] Integrate compaction at the runtime/session boundary (AC: 1, 2)
  - [x] Add a core/runtime API for compacting the active or persisted session context without replaying tools, approvals, validations, provider calls, or file edits.
  - [x] Build the compaction input from existing session artifacts, runtime events, optional current `TaskRequest.contextPacket`, file activity, and session inspection summaries.
  - [x] Emit or return structured compaction metadata that Story 3.7 can use for manual compaction UX.
  - [x] Keep CLI/TUI/RPC manual trigger work out of this story unless a minimal runtime return shape is needed for tests.
  - [x] Ensure the compaction primitive can later be consumed by Story 3.8 resume-from-compacted-context work.
- [x] Add deterministic compaction tests (AC: 1, 2)
  - [x] Unit test that compaction preserves every required continuity field.
  - [x] Unit test large output/log handling: summaries include bounded relevant text and local references, not raw outputs over the 32 KB / 500 line threshold.
  - [x] Storage test compaction directory/path/write/read behavior and path safety.
  - [x] Runtime/session test artifact creation from an active or resumable session without replaying work.
  - [x] Regression test existing sessions with no compaction artifacts still inspect/resume normally.
- [x] Surface minimal inspection evidence where needed (AC: 1)
  - [x] No latest-compaction metadata was added to session inspection in this story; compaction remains core/storage-owned.
  - [x] Keep adapter rendering thin; adapters must not assemble compaction summaries directly.
- [x] Update docs and story evidence (AC: 1, 2)
  - [x] README/progress update not required for this internal primitive slice; story evidence records the implemented behavior.
  - [x] Record GitNexus impact checks before editing symbols listed below.
  - [x] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, formatting checks, and GitNexus status/detect fallback before marking review-ready.

## Dev Notes

### Story Intent

Story 3.6 creates the core structured compaction primitive and stores compaction artifacts under each session. It should make long-running task state resumable by preserving the minimum continuity fields in a bounded, inspectable, deterministic artifact.

Implement this slice:

- Create a typed, deterministic compaction summary model in core.
- Save compaction artifacts under the session's `compactions/` directory.
- Summarize long-running context from existing runtime/session evidence without replaying work.
- Preserve local references to full logs or artifacts when large outputs exist.

Do not implement in this story:

- User-facing manual compaction commands, slash commands, TUI controls, or RPC methods; Story 3.7 owns manual trigger and inspection UX.
- Resume behavior that consumes compacted summaries as task input; Story 3.8 owns continuation from compacted context.
- Provider/LLM-based summarization, semantic compression, vector search, durable memory retrieval, or skill registry behavior.
- Replaying tool calls, provider calls, approvals, validations, or file edits.
- Storing secrets, raw credentials, or large raw logs in summaries.

### Source Requirements

- Story 3.6 requires long-running context to compact into a structured summary so the agent can continue when context grows too large. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.6]
- AC1 requires compaction to run when context approaches a configured threshold or the user requests it, preserve task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps, and save the summary under session compaction artifacts. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.6]
- AC2 requires large tool outputs or logs to be summarized with local log references instead of embedding large raw output. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.6]
- PRD FR34 requires the system to compact long-running context into a structured summary. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD FR36 requires preserving task goal, decisions, progress, files touched, commands run, failures, and next steps during compaction. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD NFR5 requires preserving task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps so a compacted session can resume without the user restating those fields. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- PRD NFR6 requires outputs larger than 32 KB or 500 lines to be summarized/collapsible/truncated while preserving a full local log reference when stored. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture assigns task lifecycle, event emission, context assembly, compaction, and terminal state to core/runtime; adapters own input parsing/rendering only. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]
- Architecture storage model includes `.sprite/sessions/<session-id>/compactions/` and a persisted `CompactionSummary` JSON artifact model. [Source: `_bmad-output/planning-artifacts/architecture.md` Storage Model]

### Architecture Guardrails

- Keep compaction logic in `packages/core`; keep persisted artifact mechanics in `packages/storage`.
- Treat the runtime event stream and session artifacts as the canonical source of compaction evidence.
- Keep the compaction primitive deterministic and testable with fixtures. Avoid time/order nondeterminism except explicit timestamps passed by options or generated in one place.
- Use existing `Result<SpriteError>` patterns and runtime/session error handling style.
- Do not add new dependencies.
- Do not mutate or replay session history while compacting. Compaction may write a new artifact and, if explicitly designed, a metadata pointer/event only.
- Do not duplicate CLI/TUI/RPC logic; later adapters should consume runtime-owned compaction metadata.
- Keep file/path conventions aligned with architecture: collection directory `compactions/`, artifact filenames in kebab-case, JSON fields in camelCase.

### Current Codebase State

- `packages/core/src/task-context.ts` exists from Story 3.5 and provides structured task context packets and summaries.
- `TaskRequest` includes `contextPacket`, and new/resumed task creation already includes bounded context evidence.
- `packages/core/src/final-task-summary.ts` exposes `createFinalTaskSummary(state)`, which already extracts important events, file activity, unresolved risks, and task IDs.
- `packages/core/src/session-inspection.ts` exposes `inspectSessionState()`, which already summarizes commands run, files, latest task, next step, last error, pending approval count, recent events, and warnings.
- `packages/tools/src/output-summarizer.ts` already defines output-size thresholds and `summarizeToolOutput()` behavior for large command/tool outputs; reuse or mirror this contract rather than inventing another large-output policy.
- `packages/core/src/task-context.ts` has `ProviderCapabilities.contextWindowTokens` and bounded section logic, but no compaction threshold policy exists yet.
- `packages/storage/src/session-store.ts` currently persists `.sprite/sessions/<session-id>/events.ndjson` and `state.json`.
- `SessionArtifactPaths` currently contains `rootDir`, `eventsPath`, and `statePath`; compaction artifact path support is not implemented yet.
- `SessionStateSnapshot` is schema-versioned and normalized. Any added persisted state fields must update schema/version/default handling and compatibility tests.
- There is currently no `packages/core/src/compaction.ts`.
- No existing config schema field for compaction thresholds was found during story creation. Prefer a small core option/default first; only add config schema if needed to satisfy AC evidence, and then test provider/default/backward compatibility.
- Root tests currently live under `tests/`; architecture mentions `tests/scenarios/`, but this repo has been using root-level tests for current stories.

### Previous Story Intelligence

- Story 3.5 added a structured runtime context packet and made context source evidence visible without dumping raw project documents or memory.
- Story 3.5 explicitly skipped context compaction; Story 3.6 should reuse, not duplicate, the context packet contracts.
- Story 3.4 established project context as bounded, redacted, status-discriminated, and untrusted.
- Story 3.3 established conservative resume behavior: restore state/evidence but never replay tools, approvals, validations, provider calls, or unsafe authority.
- Story 3.2 established session inspection views with bounded recent events and warnings.
- GitNexus `detect_changes` / `detect-changes` has been unavailable in this local CLI; use `gitnexus status`, scoped diffs, `npx gitnexus analyze` when stale, and full validation as fallback evidence.

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact contracts/functions to the user. Likely candidates:

- `packages/core/src/compaction.ts`
  - `COMPACTION_SUMMARY_SCHEMA_VERSION`
  - `DEFAULT_COMPACTION_MAX_SECTION_LENGTH`
  - `CompactionTriggerReason`
  - `CompactionSummaryStatus`
  - `CompactionSummarySection`
  - `CompactionSummary`
  - `CompactionSummaryInput`
  - `CompactionSummaryOptions`
  - `CompactionArtifactRecord`
  - `createCompactionSummary()`
  - `summarizeCompactionSourceEvents()`
  - `summarizeLargeOutputReference()`
- `packages/tools/src/output-summarizer.ts`
  - `DEFAULT_MAX_OUTPUT_BYTES`
  - `DEFAULT_MAX_OUTPUT_LINES`
  - `summarizeToolOutput()`
- `packages/storage/src/session-store.ts`
  - `SessionCompactionArtifact`
  - extend `SessionArtifactPaths` with `compactionsDir`
  - `resolveSessionCompactionArtifactPath()` or `resolveSessionCompactionArtifactPaths()`
  - `writeSessionCompactionArtifact()`
  - `readSessionCompactionArtifact()`
- `packages/core/src/agent-runtime.ts`
  - `AgentRuntime.compactActiveTaskContext()` or a narrower runtime helper with the same responsibility
  - optional `compactSessionContext()` if implementation needs persisted-session compaction without an active task
- `packages/core/src/index.ts`
  - export compaction contracts only as needed by tests or downstream packages.

These names are guidance, not mandatory. Prefer small typed contracts, deterministic pure helpers, and reuse existing session inspection/final summary primitives before adding new parsing code.

### File Structure Requirements

- Add core compaction contracts in `packages/core/src/compaction.ts`.
- Keep runtime integration in `packages/core/src/agent-runtime.ts` and existing session/runtime helper files only where needed.
- Keep session artifact persistence in `packages/storage/src/session-store.ts`.
- Add or update tests under root `tests/`, likely `tests/compaction.test.ts`, `tests/session-persistence.test.ts`, and a focused runtime/session test.
- Only update CLI files if a core-owned return shape must be rendered; Story 3.7 is the normal place for user-facing manual compaction controls.

### Safety and Security Requirements

- Do not store secrets, credentials, private keys, tokens, `.env` values, or raw sensitive logs in compaction summaries.
- Summaries should include bounded previews, redaction metadata, omission reasons, and local references where full data is stored.
- Project context remains untrusted and cannot override runtime/system policy.
- Pending approvals must be represented as state/metadata only; compaction must not approve, deny, modify, or apply anything.
- Commands run and files touched must be summarized from existing audit/state data, not shell history.
- Large output handling must respect at least the PRD thresholds: 32 KB or 500 lines.

### Testing Requirements

Minimum targeted validation for implementation:

- Unit tests for `createCompactionSummary()` preserving every required continuity field.
- Unit tests for deterministic ordering, bounded sections, redaction/omission metadata, and large-output reference behavior.
- Storage tests for compaction artifact path resolution, write/read round trip, invalid session IDs, and sessions without compaction artifacts.
- Runtime/session tests showing compaction writes a session-local artifact without replaying provider calls, tools, commands, validations, approvals, or file edits.
- Regression tests that old session state snapshots without compaction metadata still normalize and inspect successfully.
- Full existing suite remains green: `rtk npm test`.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "gitnexus impact --repo Sprite_harmess AgentRuntime"` before adding runtime compaction APIs.
- `rtk run "gitnexus impact --repo Sprite_harmess SessionArtifactPaths"` before changing session artifact paths.
- `rtk run "gitnexus impact --repo Sprite_harmess resolveSessionArtifactPaths"` before changing session path resolution.
- `rtk run "gitnexus impact --repo Sprite_harmess LocalSessionStore"` before changing storage behavior.
- `rtk run "gitnexus impact --repo Sprite_harmess SessionStateSnapshot"` before changing persisted state shape.
- `rtk run "gitnexus impact --repo Sprite_harmess createFinalTaskSummary"` before relying on or changing final summary extraction.
- `rtk run "gitnexus impact --repo Sprite_harmess inspectSessionState"` before relying on or changing session inspection extraction.
- If GitNexus reports a stale index, run `rtk run "npx gitnexus analyze"` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `gitnexus status`, scoped diffs, and full validation as fallback evidence.

## Dev Agent Record

### Agent Model Used

GPT-5.4 Codex (session default)

### Debug Log References

- 2026-05-03: Created Story 3.6 context after Story 3.5 was marked done, committed, and pushed.
- 2026-05-03: Loaded BMAD create-story workflow, sprint status, Epic 3 Story 3.6 requirements, PRD FR34/FR36/NFR5/NFR6, architecture compaction/storage guidance, Story 3.5 implementation learnings, and current core/storage session code state.
- 2026-05-03: Started BMAD dev-story workflow. Loaded story context, mapped implementation surface with `omx explore`, inspected core/storage/session/task-context/output summarizer files, and re-indexed GitNexus from stale commit `7673891` to current commit `b470d38`.
- 2026-05-03: GitNexus impact after re-index: `AgentRuntime` CRITICAL risk, `createFinalTaskSummary` CRITICAL risk, `SessionArtifactPaths` LOW risk, `resolveSessionArtifactPaths` LOW risk, `LocalSessionStore` LOW risk, `SessionStateSnapshot` LOW risk, `inspectSessionState` LOW risk. Implementation must keep runtime/final-summary edits narrow and regression-tested.
- 2026-05-04: Researched compaction patterns from `yasasbanukaofficial/claude-code` (`src/services/compact/*`), `anomalyco/opencode` (`packages/opencode/src/session/compaction.ts`), and `badlogic/pi-mono` (`packages/coding-agent/docs/compaction.md`, `src/core/compaction/*`). Decision for Story 3.6: implement a deterministic/extractive structured compaction artifact, not provider/LLM summarization; preserve `firstRetainedEventId`/tail boundary, source event range, previous compaction reference, token/byte metrics, explicit continuity sections, and large-output references with bounded previews.
- 2026-05-04: Research guardrails: keep full session history intact; store compacted continuity under session `compactions/`; do not embed raw large logs/tool output; represent media/logs as markers or local references; include repeated-compaction metadata for Story 3.8 resume; defer manual trigger UI/CLI/RPC to Story 3.7 and compacted-summary consumption to Story 3.8.
- 2026-05-04: Added RED tests in `tests/compaction.test.ts` and `tests/session-store.test.ts`. Targeted run `rtk run 'npx vitest run tests/compaction.test.ts tests/session-store.test.ts'` fails as expected: missing `@sprite/core.createCompactionSummary`, missing storage compaction artifact exports, and missing `SessionArtifactPaths.compactionsDir`.
- 2026-05-04: Implemented GREEN core/storage slice: `createCompactionSummary`, large-output references, safety metadata, session `compactions/` path creation, kebab-case compaction artifact write/read helpers. GitNexus impact before edits: `SessionArtifactPaths` LOW, `resolveSessionArtifactPaths` LOW, `LocalSessionStore` LOW. Validation: `rtk run 'npm run typecheck -- --pretty false && npm run build -- --pretty false && npx vitest run tests/compaction.test.ts tests/session-store.test.ts'` passed.
- 2026-05-04: Full validation after GREEN slice passed with `rtk run 'npm test -- --run && git diff --check'`: 15 test files, 183 tests, and whitespace check clean.
- 2026-05-04: Added RED runtime-boundary compaction test in `tests/compaction.test.ts`; targeted run `rtk run 'npx vitest run tests/compaction.test.ts'` failed as expected because `@sprite/core.compactSessionArtifacts` was not exported.
- 2026-05-04: Implemented `compactSessionArtifacts(cwd, sessionId, options)` as the persisted-session compaction primitive. It reads existing session artifacts, validates/session-inspects the event stream, optionally incorporates the active `TaskRequest.contextPacket`, writes a session-local compaction artifact, and does not rewrite `events.ndjson`. GitNexus impact before relying on `inspectSessionState`: LOW. Validation: `rtk run 'npm run typecheck -- --pretty false && npm run build -- --pretty false && npx vitest run tests/compaction.test.ts tests/session-store.test.ts tests/session-persistence.test.ts'` passed.
- 2026-05-04: Full validation after runtime-boundary slice passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: 15 test files, 184 tests, and whitespace check clean. GitNexus status fallback passed with indexed commit/current commit `1797507`; local unstaged changes are the expected Story 3.6 files plus pre-existing out-of-scope `.gitignore`.
- 2026-05-04: Addressed heavy review findings before commit: runtime compaction now extracts decisions from `task.recovery.recorded`, `policy.decision.recorded`, and `approval.resolved`; derives active constraints from trusted context packet sections; validates context packet session identity; and rejects evidence if persisted event counts change between artifact and inspection reads. Targeted validation `rtk run 'npm run typecheck -- --pretty false && npm run build -- --pretty false && npx vitest run tests/compaction.test.ts tests/session-persistence.test.ts'` passed with 16 tests.

### Completion Notes List

- Added `compactSessionArtifacts(cwd, sessionId, options)` as a core persisted-session compaction primitive.
- The primitive reads session artifacts, validates/uses session inspection evidence, optionally incorporates a live `TaskRequest.contextPacket`, and writes a session-local compaction artifact under `compactions/`.
- The primitive preserves runtime decisions and trusted active constraints for downstream manual compaction UX and Story 3.8 resume consumption.
- Runtime-boundary regression proves compaction does not rewrite `events.ndjson`.
- Existing sessions with no `compactions/` directory continue to resume/inspect through the existing conservative resume path.
- No CLI/TUI/RPC manual trigger or resume-from-compaction consumption was added; those remain owned by Stories 3.7 and 3.8.

### File List

- `packages/core/src/compaction.ts`
- `packages/core/src/index.ts`
- `packages/storage/src/session-store.ts`
- `tests/compaction.test.ts`
- `tests/session-persistence.test.ts`
- `tests/session-store.test.ts`
- `_bmad-output/implementation-artifacts/3-6-compact-long-running-context-into-structured-summary.md`

## Change Log

| Date       | Version | Description                                                       | Author |
| ---------- | ------- | ----------------------------------------------------------------- | ------ |
| 2026-05-04 | 0.3     | Added runtime-boundary compaction primitive and regression tests. | Codex  |
| 2026-05-03 | 0.2     | Started Story 3.6 implementation workflow.                        | Codex  |
| 2026-05-03 | 0.1     | Created Story 3.6 implementation context.                         | Codex  |
