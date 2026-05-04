# Story 3.7: Trigger Manual Compaction

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to trigger manual compaction,
so that I can control context cleanup during long work.

## Acceptance Criteria

1. Given an active or resumable session exists, when the user invokes manual compaction, then Sprite Harness compacts the current session context and records a compaction event, and the user can inspect the resulting summary.
2. Given compaction cannot run because required session fields are missing, when the user requests compaction, then Sprite Harness returns a structured recoverable error and explains which minimum fields are unavailable.

## Tasks / Subtasks

- [ ] Add a runtime-owned manual compaction event contract (AC: 1, 2)
  - [ ] Add a new runtime event type for manual/session compaction, likely `session.compacted` or `context.compaction.recorded`, in `packages/core/src/runtime-events.ts`.
  - [ ] Include bounded payload fields only: `artifactId`, `triggerReason`, `status`, source event range/count, `firstRetainedEventId`, optional `previousCompactionArtifactId`, and a short summary.
  - [ ] Do not include raw compaction summary content, raw logs, raw tool outputs, approval payloads, or file content in the event payload.
  - [ ] Validate payload fields with the existing `Result<SpriteError>` and redaction/secret checks.
  - [ ] Add runtime-event tests for valid event shape, missing required fields, bad artifact IDs, and secret-looking payload rejection.
- [ ] Add a core manual compaction API at the session/runtime boundary (AC: 1, 2)
  - [ ] Add a core API that compacts a persisted/resumable session and appends the compaction event exactly once after the compaction artifact is written.
  - [ ] Reuse `compactSessionArtifacts(cwd, sessionId, options)` from Story 3.6; do not duplicate compaction summary assembly.
  - [ ] Ensure manual compaction does not replay tools, approvals, validations, provider calls, file edits, or resume events.
  - [ ] Return structured metadata that adapters can render: session ID, artifact ID/path, created timestamp, event ID, source event range/count, first retained event ID, and compacted continuity summary.
  - [ ] If an active runtime task is compacted, include the active task's current `TaskRequest.contextPacket` when safe and session-matched.
  - [ ] If a persisted/resumable session is compacted without an active runtime, compact from stored session artifacts only.
- [ ] Add structured recoverable error behavior for missing minimum fields (AC: 2)
  - [ ] Fail with a stable `SpriteError.code` when `state.json` lacks a latest task snapshot / task goal.
  - [ ] Fail with a stable `SpriteError.code` when `events.ndjson` is empty, invalid, or cannot establish a source event range.
  - [ ] Fail with a stable `SpriteError.code` when the session ID/path is invalid or missing.
  - [ ] Error messages must name the missing minimum fields and state whether the user can retry after creating/resuming a valid session.
  - [ ] Keep failures non-destructive: no partial event append if artifact creation fails; no raw history mutation except the compaction artifact/event on success.
- [ ] Add CLI manual compaction command and inspection output (AC: 1, 2)
  - [ ] Add a thin CLI command under the existing session command surface, likely `sprite session compact <sessionId>`.
  - [ ] Support text output by default and JSON output with the existing output option pattern where appropriate.
  - [ ] Text output should show artifact ID/path, compaction event ID, trigger reason, source event range, first retained event ID, preserved continuity counts, and clear next-step guidance.
  - [ ] JSON output should return the core-owned metadata shape directly; CLI must not assemble compaction summaries or read raw artifacts directly.
  - [ ] If compaction fails, surface the structured recoverable error without dumping raw session artifacts.
- [ ] Make resulting summaries inspectable without adapter-owned assembly (AC: 1)
  - [ ] Reuse `readSessionCompactionArtifact()` or a core wrapper to read a specific compaction artifact for tests/CLI output.
  - [ ] Prefer returning bounded summary metadata from the compaction command instead of making CLI parse arbitrary local JSON.
  - [ ] If adding a `session inspect` view of latest compaction metadata, keep it data-driven and core/storage-owned.
  - [ ] Do not implement resume-from-compacted-context in this story; Story 3.8 owns consumption of the summary.
- [ ] Add deterministic tests (AC: 1, 2)
  - [ ] Runtime/core test: manual compaction writes a compaction artifact and appends one compaction event after existing events.
  - [ ] Runtime/core test: manual compaction preserves event order, source event range, `firstRetainedEventId`, and no replayed tool/provider/approval/validation side effects.
  - [ ] CLI smoke test: `session compact <sessionId>` text output includes the artifact/event/summary metadata.
  - [ ] CLI smoke test: JSON output is machine-readable and does not include raw large logs or secret-looking values.
  - [ ] Error tests: missing latest task snapshot, empty event log, invalid session ID, invalid session artifact shape, and context packet session mismatch.
  - [ ] Regression test: sessions without existing compaction artifacts can still compact successfully and create `compactions/` as needed.
- [ ] Update story evidence and sprint status (AC: 1, 2)
  - [ ] Record GitNexus impact checks before editing high-risk symbols.
  - [ ] Update this story's Dev Agent Record with debug logs, completion notes, changed files, and validation evidence.
  - [ ] Run `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` before marking review-ready.

## Dev Notes

### Story Intent

Story 3.7 adds the user-facing/manual trigger for the deterministic compaction primitive created in Story 3.6. The goal is to let a developer explicitly compact an active or persisted session and receive inspectable metadata about the resulting summary.

Implement this slice:

- Add a runtime-owned compaction event for auditability.
- Add a core/runtime manual compaction API that calls the Story 3.6 primitive and records the event.
- Add a thin CLI command to trigger compaction for a session and render core-owned metadata.
- Return structured recoverable errors for invalid/missing session fields.

Do not implement in this story:

- Automatic threshold-triggered compaction.
- Resume behavior that consumes compacted summaries as task input; Story 3.8 owns continuation from compacted context.
- TUI slash commands or RPC compaction methods unless a minimal shared core shape is needed for CLI tests.
- Provider/LLM-based summarization, semantic compression, vector search, durable memory retrieval, or skill behavior.
- Replaying tool calls, provider calls, approvals, validations, resume actions, or file edits.

### Source Requirements

- Story 3.7 requires users to trigger manual compaction so they can control context cleanup during long work. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.7]
- AC1 requires an active or resumable session to compact current session context, record a compaction event, and make the resulting summary inspectable. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.7]
- AC2 requires a structured recoverable error explaining unavailable minimum fields when compaction cannot run. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.7]
- PRD FR35 requires users to trigger manual compaction. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD FR36 and NFR5 require compaction continuity to preserve task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps. [Source: `_bmad-output/planning-artifacts/prd.md` Functional and Non-Functional Requirements]
- Architecture assigns task lifecycle, event emission, context assembly, compaction, and terminal state to core/runtime; adapters own input parsing/rendering only. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]
- Architecture storage model includes `.sprite/sessions/<session-id>/compactions/` and append-only session event history. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Architecture]

### Architecture Guardrails

- Core owns manual compaction behavior and event emission; CLI only invokes core and renders returned metadata.
- Storage owns file layout and artifact persistence; do not make CLI assemble or mutate compaction artifacts directly.
- Session event history remains canonical and append-only. Manual compaction may append a compaction event only after artifact write succeeds.
- `state.json` remains a recoverable snapshot, not the sole source of truth.
- Secrets, credentials, private keys, tokens, `.env` values, raw logs, and raw tool outputs must not enter compaction event payloads or CLI summaries.
- Reuse existing `Result<SpriteError>` patterns, runtime event validation, `compactSessionArtifacts()`, `writeSessionCompactionArtifact()`, `readSessionCompactionArtifact()`, and CLI output-format patterns.
- Do not add dependencies.
- Keep behavior deterministic with explicit timestamps/IDs injectable in tests if needed.

### Current Codebase State

- Story 3.6 added `packages/core/src/compaction.ts` and exported it from `packages/core/src/index.ts`.
- `compactSessionArtifacts(cwd, sessionId, options)` reads persisted session artifacts, validates session inspection evidence, optionally uses a live `TaskRequest.contextPacket`, writes a compaction artifact, and returns `{ artifact, artifactPath, summary }`.
- Story 3.6 deliberately does not append a runtime event or expose a manual CLI/RPC/TUI trigger.
- `packages/storage/src/session-store.ts` supports `compactionsDir`, `SessionCompactionArtifact`, `resolveSessionCompactionArtifactPath()`, `writeSessionCompactionArtifact()`, and `readSessionCompactionArtifact()`.
- `packages/core/src/runtime-events.ts` currently has task, policy, approval, validation, file, tool, memory, and `session.resumed` event types, but no compaction event type.
- `packages/core/src/agent-runtime.ts` has `resumeSession(sessionId)` and appends `session.resumed`; it also has private event/snapshot persistence helpers.
- `packages/cli/src/index.ts` currently exposes `session inspect <sessionId>` and `resume <sessionId>` command surfaces; there is no `session compact` command.
- Tests currently live under root `tests/`; use the existing root test style rather than introducing `tests/scenarios/` unless the repo already moves there.
- `.gitignore` may have local out-of-scope modifications in the working tree; do not stage it unless explicitly requested.

### Previous Story Intelligence

- Story 3.6 final commits:
  - `4600a67` — implemented deterministic compaction artifact creation and runtime-boundary preservation.
  - `b5be263` — closed Story 3.6 and updated sprint status.
- Story 3.6 review found and fixed gaps around `decisions`, `activeConstraints`, context-packet session mismatch, and source/inspection read mismatch. Do not regress those protections.
- Story 3.6 runtime compaction currently preserves decisions from `task.recovery.recorded`, `policy.decision.recorded`, and `approval.resolved`, and derives trusted active constraints from context packet sections.
- Story 3.6 validation evidence: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` passed with 15 test files / 185 tests.
- Story 3.5 created `TaskRequest.contextPacket`; pass it into manual compaction only when compacting the active runtime task and only after session identity validation.
- Story 3.3 established conservative resume behavior: restore state/evidence but never replay tools, approvals, validations, provider calls, or unsafe authority.

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact contracts/functions to the user. Likely candidates:

- `packages/core/src/runtime-events.ts`
  - add event type: `session.compacted` or `context.compaction.recorded`
  - add payload type with artifact/source metadata only
  - add validator such as `validateSessionCompactedEvent()`
- `packages/core/src/compaction.ts`
  - `ManualCompactionOptions`
  - `ManualCompactionResult`
  - `manualCompactSession()` / `compactSessionManually()` / `compactPersistedSessionManually()`
  - optional `readCompactionSummaryMetadata()` if CLI needs bounded metadata
- `packages/core/src/agent-runtime.ts`
  - `compactActiveSessionContext()` if active runtime compaction needs context packet access
  - `compactSession(sessionId, options?)` if runtime should own event append for persisted sessions
- `packages/cli/src/index.ts`
  - add `session compact <sessionId>` command
  - `renderSessionCompactionText()`
  - `renderSessionCompactionJson()`
- `tests/runtime-events.test.ts`
  - compaction event validation tests
- `tests/compaction.test.ts` or `tests/session-persistence.test.ts`
  - manual compaction event append and artifact tests
- `tests/cli-smoke.test.ts`
  - CLI text/JSON smoke tests

These names are guidance, not mandatory. Prefer a small, typed core API and reuse Story 3.6 contracts.

### File Structure Requirements

- Keep compaction event contracts in `packages/core/src/runtime-events.ts`.
- Keep manual compaction orchestration in `packages/core`, preferably near `compaction.ts` or `agent-runtime.ts` depending on whether private runtime event append helpers are required.
- Keep CLI rendering in `packages/cli/src/index.ts` thin and data-driven.
- Add or update root tests: `tests/runtime-events.test.ts`, `tests/compaction.test.ts`, `tests/session-persistence.test.ts`, and `tests/cli-smoke.test.ts` as needed.
- Update this story file and `sprint-status.yaml` as lifecycle evidence only.

### Safety and Security Requirements

- Manual compaction must be non-destructive except for writing the compaction artifact and appending the compaction event on success.
- Do not store raw large outputs in events or adapter output.
- Do not expose secret-looking values in compaction event payloads, CLI text output, JSON output, or errors.
- Pending approvals must remain metadata only; manual compaction must not approve, deny, modify, or apply anything.
- If compaction cannot establish minimum continuity fields, return a structured recoverable error instead of producing a misleading summary.
- Context packet session identity must match the session being compacted.

### Testing Requirements

Minimum targeted validation for implementation:

- Runtime event tests for the new compaction event validator.
- Core tests for successful manual compaction artifact creation + event append.
- Core tests proving no event append occurs when artifact creation or minimum field validation fails.
- CLI smoke tests for text and JSON manual compaction output.
- Error tests for missing latest task, empty events, invalid session ID, invalid artifact ID, and mismatched context packet.
- Regression tests that existing `session inspect`, `resume`, and Story 3.6 compaction artifact creation still pass.
- Full suite remains green: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "npx gitnexus impact --repo Sprite_harmess validateRuntimeEvent"` before changing runtime event validation.
- `rtk run "npx gitnexus impact --repo Sprite_harmess RuntimeEventPayloadMap"` or fallback `runtime-events.ts` context before changing event payload contracts.
- `rtk run "npx gitnexus impact --repo Sprite_harmess compactSessionArtifacts"` after re-indexing, or record that GitNexus does not see the newly added symbol yet.
- `rtk run "npx gitnexus impact --repo Sprite_harmess AgentRuntime"` before adding runtime methods; expect broad risk and keep edits narrow.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createProgram"` before changing CLI commands.
- `rtk run "npx gitnexus impact --repo Sprite_harmess inspectSessionState"` before extending inspection output.
- If GitNexus reports stale index, run `rtk run "npx gitnexus analyze"` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `gitnexus status`, scoped diffs, and full validation as fallback evidence.

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

- 2026-05-04: Created Story 3.7 context after Story 3.6 was marked done and pushed. Confirmed local `HEAD` and `origin/main` both at `b5be263` after closing Story 3.6.
- 2026-05-04: Loaded BMAD create-story workflow, sprint status, Epic 3 Story 3.7 requirements, PRD FR35/FR36/NFR5/NFR6, architecture compaction/session/event boundaries, Story 3.6 implementation learnings, and current CLI/core/runtime-event code state.

### Completion Notes List

TBD

### File List

- `_bmad-output/implementation-artifacts/3-7-trigger-manual-compaction.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Version | Description                               | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-05-04 | 0.1     | Created Story 3.7 implementation context. | Codex  |
