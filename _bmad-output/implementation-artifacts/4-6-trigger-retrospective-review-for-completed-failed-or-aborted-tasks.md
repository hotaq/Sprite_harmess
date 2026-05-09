# Story 4.6: Trigger Retrospective Review for Completed, Failed, or Aborted Tasks

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to run retrospectives on completed, failed, or aborted tasks,
so that failed work still produces useful learning when enough context exists.

## Acceptance Criteria

1. Given a completed, failed, or aborted task has sufficient retained context, when the user triggers a retrospective, then Sprite Harness produces a retrospective with failure reason or outcome, missed assumptions, memory candidates, skill signals, and next-time improvement recommendations.
2. Given a completed, failed, or aborted task has sufficient retained context, when Sprite Harness persists or reports the retrospective, then the retrospective records source task, event history reference, terminal state, files touched, commands run, and final status.
3. Given a task lacks the minimum retrospective context, when the user requests a retrospective, then Sprite Harness returns a structured explanation of missing fields and does not fabricate learning outputs.
4. Given retrospective outputs include memory candidates, skill signals, missed assumptions, command evidence, file evidence, or task history, when those outputs are persisted, emitted, summarized, or displayed, then they contain only bounded safe previews and source references and never raw secrets, raw tool output, large patches, credentials, or provider-invented claims.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-4)
  - [x] Report exact functions/contracts to add or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `AgentRuntime`, `createFinalTaskSummary`, `validateRuntimeEvent`, `writeSessionEvent`, `readSessionState`, and session-store artifact writers.
  - [x] Treat retrospectives as user-triggered audit artifacts, not automatic successful-task learning reviews.
  - [x] Preserve the Story 4.4 boundary: completed-task learning reviews remain separate from retrospective reviews.

- [x] Add retrospective review contracts in `packages/memory` (AC: 1-4)
  - [x] Add `RetrospectiveTerminalStatus` for supported terminal states: `completed | failed | cancelled | max-iterations`; treat `cancelled` and `max-iterations` as aborted-style retrospective inputs.
  - [x] Add `RetrospectiveContextField` / `RetrospectiveMissingContextField` for NFR20 minimum context fields: task goal, event history reference, terminal state, files touched, commands run, failure reason or outcome, and final status.
  - [x] Add `RetrospectiveEligibilityReport` with `eligible`, `missingFields`, `availableFields`, `sourceTaskId`, `sourceSessionId`, and `terminalStatus`.
  - [x] Add `RetrospectiveReview` with schema version, source task/session/correlation IDs, terminal status, final status, outcome or failure reason, missed assumptions, memory candidates, skill signals, next-time improvements, files touched, commands run, evidence event IDs, context completeness, and `createdAt`.
  - [x] Add `RetrospectiveGenerationRequest` built from task/session evidence, not provider free-text.
  - [x] Add `generateRetrospectiveReview()` that produces deterministic bounded output from retained evidence.
  - [x] Add `validateRetrospectiveReview()` and safe normalizers that reject raw fields (`content`, `rawOutput`, `stdout`, `stderr`, `diff`, `patch`, `token`, `secret`, credentials, private keys, etc.) and secret-like values.
  - [x] Add `summarizeRetrospectiveReviewForEvent()` or equivalent safe event-summary helper.

- [x] Add retrospective artifact persistence in storage (AC: 1-4)
  - [x] Persist reviews under the existing session artifact tree, suggested path `.sprite/sessions/<session-id>/retrospectives/<task-id>.json`.
  - [x] Add `writeRetrospectiveReview()` with path traversal guards, schema validation before write, and atomic write behavior consistent with existing session artifacts.
  - [x] Add a bounded reader only if needed for inspection/tests; do not expose raw retrospective internals where a safe summary is enough.
  - [x] Ensure malformed or unsafe retrospective artifacts fail closed with structured errors.

- [x] Add runtime trigger API and event emission (AC: 1-4)
  - [x] Add `AgentRuntime.createRetrospectiveReview()` or equivalent user-triggered API that accepts a task ID/session reference and returns either a created retrospective or structured missing-context report.
  - [x] Reconstruct evidence from existing session state, task terminal events, file activity, command/validation events, memory influence records, and final task summary inputs.
  - [x] Support completed, failed, cancelled, and max-iterations terminal states; reject active/nonterminal tasks with a structured missing-context or invalid-state report.
  - [x] Add stable runtime event `retrospective.review.created` with safe payload: source task/session IDs, artifact path, terminal status, final status, evidence event IDs, missing-context count if relevant, and safe summary.
  - [x] Add `createRetrospectiveReviewCreatedEvent()` / `validateRetrospectiveReviewCreatedEvent()` or equivalent validation path in `validateRuntimeEvent`.
  - [x] Do not emit a fabricated review event when eligibility fails; return a structured explanation instead. If an audit event for skipped retrospectives is added, keep it minimal and safe.

- [x] Integrate user-visible output without over-scoping CLI/TUI/RPC (AC: 1-4)
  - [x] Surface created retrospective status, artifact reference, terminal status, and safe summary through the runtime API return value.
  - [x] Surface missing context as structured data with exact field names rather than prose-only errors.
  - [x] Update CLI/session inspection only if the current public API already exposes learning-review artifacts there; otherwise keep the story at runtime/storage level and document the limitation.
  - [x] Keep JSON-RPC, TUI, and skill-promotion workflows out of scope unless tests prove a small compatibility update is required.

- [x] Preserve explicit scope boundaries (AC: 1-4)
  - [x] Do not create procedural memory or promoted skills; Story 4.7 owns skill-linked learning outputs.
  - [x] Do not add MemPalace integration, vector search, embeddings, SQLite indexing, background memory consolidation, or new dependencies.
  - [x] Do not infer invisible provider reasoning; missed assumptions and recommendations must be traceable to retained events, terminal state, files, commands, validation, or explicit memory influence records.
  - [x] Do not auto-run retrospectives on every terminal task unless an existing runtime hook already requires a minimal safe call; this story's primary behavior is user-triggered.

- [x] Add regression tests (AC: 1-4)
  - [x] Memory tests: deterministic review generation for failed, cancelled/max-iterations, and completed tasks; missing-context eligibility reports; unsafe/raw content rejection.
  - [x] Storage tests: retrospective artifact path guards, atomic writes, schema validation, and unsafe artifact rejection.
  - [x] Runtime event tests: valid `retrospective.review.created` events pass; missing IDs, invalid terminal statuses, raw fields, secret-like values, and fabricated evidence fail.
  - [x] Runtime/session tests: user-triggered retrospective succeeds for failed, cancelled/aborted, and completed task histories with sufficient context.
  - [x] Runtime/session tests: missing task goal, missing terminal event, missing file/command evidence, or missing failure/outcome reason returns structured missing fields and writes no fabricated artifact.
  - [x] Regression tests: retrospective can reference prior `memory.influence.recorded` events from Story 4.5 without turning retrieved-only candidates into used memories.
  - [x] CLI/print/session inspection tests only if output shape changes.

- [x] Update story evidence and lifecycle status (AC: 1-4)
  - [x] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [x] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [x] Run targeted validation before review: memory, storage/session-store, runtime-events, runtime-loop/session persistence, and CLI/session inspection tests if touched.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

- [x] Resolve review findings before commit (AC: 2-4)
  - [x] Require a matching terminal runtime event before retrospective eligibility can satisfy `terminalState`; no fallback to the last nonterminal event.
  - [x] Strengthen session-store retrospective artifact validation so persisted artifacts must include eligible context plus event, file, command, and terminal-event evidence.
  - [x] Add regression coverage for missing terminal-event evidence.

## Dev Notes

### Story Intent

Story 4.6 closes the failure-learning gap. Story 4.4 creates successful-task learning reviews, and Story 4.5 records whether prior memories or lessons influenced later work. This story lets a user explicitly request a retrospective after a task reaches a terminal state, including failed or aborted work, while refusing to invent learning when the required evidence is missing.

The implementation should answer four audit questions:

1. Which terminal task is the retrospective about?
2. What retained evidence is sufficient or missing?
3. What missed assumptions, memory candidates, skill signals, and next-time improvements are evidence-backed?
4. Where can a future session find the source task, terminal event, files, commands, and final status?

### Source Requirements

- Story 4.6 requires retrospectives for completed, failed, or aborted tasks with sufficient retained context. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.6]
- FR49 requires users to trigger a retrospective review for a completed, failed, or aborted task. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR50 requires retrospective reviews to produce memory candidates, skill signals, missed-assumption notes, and next-time improvement recommendations. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR51 requires learning outputs for failed or aborted tasks when enough task context exists. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- NFR20 defines the minimum failed/aborted retrospective context: task goal, event history, terminal state, files touched, commands run, failure reason, and final status. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- NFR50 requires deterministic fixtures for at least one failed-task retrospective. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture requires failures crossing package boundaries to produce structured records with command/cwd/summarized output/suggested next step where relevant. Retrospectives should reuse that structured evidence, not raw logs. [Source: `_bmad-output/planning-artifacts/architecture.md` Error Handling Strategy]
- Architecture requires memory and learning outputs to preserve provenance, confidence, evidence references, and safety filtering. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Learning Patterns]
- Architecture requires reused memory to be marked as used, ignored, or contradicted and available to retrospectives. [Source: `_bmad-output/planning-artifacts/architecture.md` Learning Feedback Control Pattern]
- Architecture requires secrets and credentials not to be saved to memory, logs, summaries, RPC state, or learning reviews. Apply the same rule to retrospectives. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/core/src/agent-runtime.ts` owns task lifecycle APIs, terminal events, memory review APIs, influence recording, final summary creation, and Story 4.4 learning review generation.
- `packages/core/src/final-task-summary.ts` already collects terminal events, file activity, command evidence, validation evidence, and memory influence records into safe final summaries.
- `packages/core/src/runtime-events.ts` validates terminal task events, memory events, learning review events, and `memory.influence.recorded` events. Retrospective events must follow the same strict validation and unsafe-field rejection style.
- `packages/memory/src/index.ts` already defines memory candidates, learning reviews, influence candidates, influence records, bounded safe previews, and secret/raw-field guards. Retrospective contracts should reuse these patterns instead of creating a parallel safety system.
- `packages/storage/src/session-store.ts` persists session state/events and Story 4.4 learning review artifacts under `.sprite/sessions/<session-id>/learning-reviews/<task-id>.json`.
- `tests/runtime-loop.test.ts`, `tests/session-persistence.test.ts`, `tests/session-inspection.test.ts`, and `tests/runtime-events.test.ts` already contain terminal-event and learning-review coverage that can be extended for retrospective behavior.

### Previous Story Intelligence

- Story 4.4 intentionally does not create learning reviews for failed, cancelled, or max-iteration tasks. This story should not change that successful-task hook; it adds an explicit retrospective path.
- Story 4.4 review tightened evidence validation after finding empty-evidence gaps. Retrospective generation should require explicit evidence event IDs and structured missing-context reports.
- Story 4.5 added deterministic bounded memory/lesson influence retrieval and `memory.influence.recorded`. Retrospectives may reference these events as evidence but must not claim influence just because a candidate was retrieved.
- Story 4.5 review fixed no-overlap candidate injection and unbounded prior-artifact scans. Keep retrospective evidence collection bounded and relevance-gated.
- Recent GitNexus impact checks marked `AgentRuntime` and `validateRuntimeEvent` as CRITICAL and storage readers as HIGH in adjacent stories. Keep changes backward-compatible, localized, and heavily tested.

### Suggested Contracts and Functions

Report this list before implementation and revise it if code inspection shows a better existing seam:

- `RetrospectiveTerminalStatus` — `completed | failed | cancelled | max-iterations`.
- `RetrospectiveContextField` / `RetrospectiveMissingContextField` — canonical NFR20 field names used in structured missing-context reports.
- `RetrospectiveEligibilityReport` — deterministic eligibility result with missing and available fields.
- `RetrospectiveEvidenceReference` — safe reference to event IDs, artifact paths, file paths, command summaries, validation summaries, and memory influence IDs.
- `RetrospectiveReview` — persisted review artifact with source IDs, terminal state, final status, outcome/failure reason, missed assumptions, memory candidates, skill signals, next-time recommendations, evidence references, and created timestamp.
- `RetrospectiveGenerationRequest` — normalized task evidence input used by the generator.
- `evaluateRetrospectiveEligibility()` — checks minimum retained context and returns exact missing fields.
- `generateRetrospectiveReview()` — deterministic evidence-to-review generator; no provider calls, no embeddings, no new dependencies.
- `validateRetrospectiveReview()` — schema and safety guard before event emission or artifact persistence.
- `summarizeRetrospectiveReviewForEvent()` — bounded safe summary for runtime events and user-facing output.
- `writeRetrospectiveReview()` — session-store artifact writer with path guards and validation.
- `AgentRuntime.createRetrospectiveReview()` — user-triggered runtime API for completed/failed/aborted terminal tasks.
- `createRetrospectiveReviewCreatedEvent()` / `validateRetrospectiveReviewCreatedEvent()` — stable event factory/validator for `retrospective.review.created`.

### File Structure Expectations

Likely files to modify:

- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `packages/storage/src/index.ts` if new session-store helpers need exports
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/final-task-summary.ts` only if existing summary evidence is insufficient
- `packages/cli/src/index.ts` only if a public trigger command or output shape is required by existing architecture
- `tests/memory-safety.test.ts`
- `tests/session-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/session-inspection.test.ts` or `tests/cli-smoke.test.ts` only if inspection/CLI output changes

Avoid:

- Replacing Story 4.4 learning-review generation.
- Saving raw command output, raw diffs, raw patches, or provider text in retrospective artifacts.
- Adding new dependencies, vector search, MemPalace integration, or background indexing.
- Auto-promoting memory entries or skills from retrospective output.
- Coupling TUI/RPC/CLI surfaces directly to memory generation if runtime/storage APIs are enough for this story.

### Testing Requirements

- Use Vitest and existing temp-workspace/session helpers.
- Start with failing tests for a failed-task retrospective, a completed-task retrospective, an aborted/cancelled retrospective, and a missing-context retrospective.
- Assert the missing-context path returns exact field names and writes no retrospective artifact or created event.
- Assert generated reviews include terminal status, final status, task/session IDs, evidence event IDs, files touched, commands run, and failure reason or outcome.
- Assert unsafe strings and raw fields are rejected or redacted before persistence, event emission, and any final/user-visible summary.
- Assert no raw secret string appears in serialized event history, final summary output, or retrospective artifact.

### Project Structure Notes

- Keep retrospective artifacts under `.sprite/sessions/<session-id>/retrospectives/`.
- Runtime events remain the audit spine; a future session should be able to discover that a retrospective exists from events without reading unsafe raw artifacts.
- Completed-task retrospectives and Story 4.4 successful-task learning reviews can coexist, but they are different artifact types and event types.
- Story 4.7 will handle procedural memory and skill-linked learning outputs. For this story, skill signals are only candidate-like retrospective observations with evidence and confidence.

### Research Notes

- No external web research is required for Story 4.6 because implementation is local TypeScript/runtime/storage work with no new SDK or dependency choice.
- The relevant external-style research already captured for Epic 4 points toward explicit provenance, candidate-first learning, and bounded memory reuse. Apply those principles locally without adding integrations.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- 2026-05-09: Story created from Epic 4 backlog using BMAD create-story flow. Implementation has not started yet.
- 2026-05-09: Development started. First task is confirming the implementation function/contract surface before code edits.
- 2026-05-09: GitNexus impact analysis before edits: `AgentRuntime`, `validateRuntimeEvent`, and `createFinalTaskSummary` reported CRITICAL risk; `LocalSessionStore`, `SessionStore`, `resolveSessionArtifactPaths`, `generateLearningReview`, and `validateLearningReview` reported LOW. Implementation stayed additive and avoided changing `createFinalTaskSummary`.
- 2026-05-09: Red phase confirmed by new tests failing on missing retrospective exports, runtime event type, session-store writer/path, and `AgentRuntime.createRetrospectiveReview()`.
- 2026-05-09: Green phase completed with retrospective memory contracts, storage persistence, runtime trigger API, event validation, and regression tests.
- 2026-05-09: Review found and fixed two evidence-boundary gaps: terminal-state eligibility now requires a matching terminal event, and storage validation re-checks context/evidence completeness before artifact writes.

### Completion Notes List

- Added deterministic retrospective contracts in `@sprite/memory`, including eligibility reports, review artifacts, safe event summaries, and raw/secret rejection.
- Added project-local retrospective artifacts under `.sprite/sessions/<session-id>/retrospectives/<task-id>.json` with path guards, schema checks, atomic writes, and unsafe-write rejection.
- Added user-triggered `AgentRuntime.createRetrospectiveReview()` for completed, failed, cancelled, and max-iterations terminal tasks.
- Added `retrospective.review.created` runtime event validation with safe artifact/evidence/count payloads.
- Missing context now returns structured `missingFields` and writes no artifact/event; it does not fabricate learning.
- Review hardening prevents retrospectives from using the last nonterminal event as terminal evidence.
- Storage now fails closed if a retrospective artifact lacks eligible context, files, commands, event IDs, or a terminal event ID.
- Preserved Story 4.4 separation: successful-task learning reviews remain unchanged, and failed/cancelled/max-iteration tasks still do not auto-create successful-task learning reviews.
- Scope kept local: no CLI/TUI/RPC surface, no MemPalace/vector search/SQLite/new dependency, no auto-promotion of memories or skills.
- Validation evidence:
  - `rtk run 'npm run typecheck -- --pretty false && npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'` passed before review fixes: 5 files, 163 tests.
  - `rtk run 'npm run typecheck -- --pretty false && npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'` passed after review fixes: 5 files, 164 tests.
  - `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` passed after review fixes: 16 files, 273 tests.

### File List

- `_bmad-output/implementation-artifacts/4-6-trigger-retrospective-review-for-completed-failed-or-aborted-tasks.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `tests/memory-safety.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-store.test.ts`

## Change Log

- 2026-05-09: Created story context for user-triggered retrospectives on completed, failed, cancelled, or max-iteration tasks.
- 2026-05-09: Started development and moved story to in-progress.
- 2026-05-09: Implemented retrospective generation, persistence, runtime trigger, event validation, and regression tests; moved story to review.
- 2026-05-09: Resolved review findings, strengthened evidence gates, and moved story to done.
