# Story 4.5: Show Prior Memory or Lesson Influence During a Later Task

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to show when prior memory or lessons influenced a task,
so that learning reuse is visible instead of hidden.

## Acceptance Criteria

1. Given a later task retrieves relevant memory or lesson candidates, when the agent uses one to shape its plan or action, then the task history records the memory/lesson as `used` with a source reference and influence summary, and the user can see which prior memory or lesson influenced the task.
2. Given retrieved memory is not used or contradicts current evidence, when the task proceeds, then the task history can mark it as `ignored` or `contradicted` with a reason, and this state is available for retrospective analysis.
3. Given memory entries, learning-review lessons, or influence records are included in context, events, summaries, or artifacts, when they contain raw content, raw tool output, secrets, credentials, private keys, tokens, or large code chunks, then only bounded safe previews and source IDs are persisted or displayed.
4. Given the MVP has no vector search or provider-driven tool execution yet, when influence candidates are retrieved, then retrieval is deterministic, local-first, bounded, and testable without adding dependencies or letting the provider invent influence.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-4)
  - [x] Report exact functions/contracts to add or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `AgentRuntime`, `createTaskRequest`, `assembleTaskContextPacket`, `createFinalTaskSummary`, `validateRuntimeEvent`, and storage readers.
  - [x] Treat influence tracking as an audit feature: runtime-owned, evidence-backed, and safe by default.

- [x] Add memory/lesson influence contracts in `packages/memory` (AC: 1-4)
  - [x] Add `MemoryInfluenceStatus` with `used | ignored | contradicted`.
  - [x] Add `MemoryInfluenceSourceType` with at least `memory_entry | learning_review_lesson`.
  - [x] Add `MemoryInfluenceCandidate` with source ID, source task/session IDs, source event IDs, type, confidence/mode if available, safe preview, and retrieval reason.
  - [x] Add `MemoryInfluenceRecord` with source reference, status, influence summary or ignore/contradiction reason, current task/session/correlation IDs, evidence event IDs, and created timestamp.
  - [x] Add safe validators/normalizers that reject raw fields (`content`, `rawOutput`, `stdout`, `stderr`, `diff`, `patch`, `token`, `secret`, etc.) and secret-like values.
  - [x] Add deterministic bounded candidate selection from durable memory entries and learning-review lessons; use simple local heuristics such as safe keyword overlap, confidence/type weighting, and recency limits. Do not add embeddings/vector search.

- [x] Add safe lesson retrieval from prior learning review artifacts (AC: 1, 3, 4)
  - [x] Add storage reader support for prior per-task learning review artifacts under `.sprite/sessions/*/learning-reviews/*.json`.
  - [x] Return only bounded lesson/fact/test-gap previews plus source IDs; do not expose full raw review JSON as task context.
  - [x] Tolerate missing legacy learning-review directories and malformed/unreadable artifacts with structured recoverable errors or skipped notes.
  - [x] Keep `events.ndjson` canonical; learning-review artifacts are derived source evidence for influence candidates.

- [x] Inject retrieved memory/lesson candidates into task context with provenance (AC: 1, 3, 4)
  - [x] Extend `TaskContextMemoryInput` or add a dedicated influence context input so entries include source IDs and source event IDs, not only text/provenance.
  - [x] Update task request assembly so a new task can load safe durable memory entries and prior lesson candidates from the current project before planning.
  - [x] Update the memory context section metadata to expose included/blocked candidate counts, source IDs, source types, and retrieval reasons.
  - [x] Keep memory context governed and bounded; unsafe candidates must be blocked/redacted using existing safety rules.
  - [x] Do not mark candidates as `used` merely because they were retrieved or injected; use/ignore/contradiction is explicit audit state.

- [x] Record influence decisions in runtime history (AC: 1-4)
  - [x] Add a stable runtime event, suggested name `memory.influence.recorded`, with payload: source type, source ID, source task/session IDs when known, status, influence summary or reason, evidence event IDs, safe preview, and `recorded` state.
  - [x] Add `AgentRuntime.recordMemoryInfluence()` or equivalent runtime-owned API for adapters/agent loop code to mark retrieved candidates as `used`, `ignored`, or `contradicted`.
  - [x] Enforce status-specific validation: `used` requires influence summary; `ignored` and `contradicted` require reason; `contradicted` should reference current evidence when available.
  - [x] Ensure the final summary or task history view surfaces influence records so the user can inspect which memory/lesson affected the task.
  - [x] Ensure influence records are available to future retrospective work without implementing Story 4.6 retrospectives here.

- [x] Preserve explicit scope boundaries (AC: 1-4)
  - [x] Do not auto-promote memories or skills.
  - [x] Do not implement semantic vector search, embeddings, MemPalace integration, SQLite indexing, or background memory consolidation.
  - [x] Do not infer invisible provider reasoning; influence is recorded only from deterministic selection plus explicit runtime/agent decision.
  - [x] Do not implement failed/aborted retrospective generation; Story 4.6 owns retrospective outputs.

- [x] Add regression tests (AC: 1-4)
  - [x] Memory tests: candidate selection is deterministic and bounded; influence records validate status-specific fields; unsafe fields/secret-like values are redacted or rejected.
  - [x] Storage tests: prior learning reviews can be read as safe lesson candidates; missing/malformed artifacts are handled safely; raw unsafe review material is not returned.
  - [x] Task-context tests: safe memory/lesson candidates appear with provenance/source metadata; unsafe candidates are blocked/redacted; retrieval alone does not mark `used`.
  - [x] Runtime event tests: valid `memory.influence.recorded` events pass; invalid statuses, missing summaries/reasons, raw fields, and secret-like values fail.
  - [x] Runtime/session tests: later task records `used`, `ignored`, and `contradicted` influence states; final summary/history exposes them; persisted sessions can be inspected or resumed without losing influence events.
  - [x] CLI/print/session inspection tests only if output shape is changed.

- [x] Update story evidence and lifecycle status (AC: 1-4)
  - [x] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [x] Run targeted validation before review: memory, storage, task-context, runtime-events, runtime-loop/session persistence, and CLI/session inspection tests if touched.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

### Review Findings

- [x] [Review][Patch] Influence selection can inject unrelated memory or lesson candidates when keyword overlap is zero [packages/memory/src/index.ts:1654]
  - Detail: `selectMemoryInfluenceCandidates()` adds confidence and lesson-type boosts to the score, then accepts any source with `score > 0`. A high-confidence memory entry or any learning-review lesson can therefore be included even when it matches zero task terms, violating the "relevant" and deterministic local retrieval intent in AC1/AC4. Require keyword overlap before boosts can make a candidate eligible, and add a no-overlap regression test.
- [x] [Review][Patch] Memory influence retrieval is unbounded before applying the candidate limit [packages/core/src/agent-runtime.ts:511]
  - Detail: task submission calls `readMemoryEntries(cwd)` and `readLearningReviewLessonCandidates(cwd)` before `selectMemoryInfluenceCandidates({ limit: 5 })`; the storage readers load the full memory entries file and scan every `.sprite/sessions/*/learning-reviews/*.json` artifact. This violates AC4's bounded retrieval requirement and the story's recency-limit guidance. Add bounded reader/selection options with deterministic recency/source caps and tests over a large prior-history fixture.
- [x] [Review][Patch] Prior learning-review retrieval ignores fact and test-gap previews despite the checked story task [packages/storage/src/session-store.ts:791]
  - Detail: `extractLearningReviewLessonCandidates()` only returns `review.lessons`, while the story task requires safe lesson/fact/test-gap previews plus source IDs. Either extend the reader/context candidate shape to include sectioned fact and test-gap previews safely, or narrow the story checklist if this was intentionally lesson-only.

## Dev Notes

### Story Intent

Story 4.5 proves that learning is reusable, not decorative. Story 4.4 can now generate local learning review artifacts, and Stories 4.2-4.3 can create/review durable memory entries. This story connects those outputs to a later task by making retrieval and influence visible in runtime history.

The implementation should answer three audit questions:

1. What prior memory or lesson was retrieved?
2. Was it used, ignored, or contradicted?
3. What source evidence proves that influence state?

### Source Requirements

- Story 4.5 requires prior memory or lesson influence to be visible during a later task. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.5]
- FR47 requires showing which prior memory or lesson influenced a task; FR48 requires reusing a prior memory or lesson in a later task. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- Learning success requires a later task to visibly reuse a memory, lesson, or skill signal generated from earlier work. [Source: `_bmad-output/planning-artifacts/prd.md` Learning Success]
- Architecture requires memory reuse to be visible in task history or summary when it materially influenced behavior. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Learning Patterns]
- Architecture requires reused memory to be marked as `used`, `ignored`, or `contradicted` in task history when relevant. [Source: `_bmad-output/planning-artifacts/architecture.md` Learning Feedback Control Pattern]
- Architecture requires learning artifacts to carry evidence references such as task ID, event IDs, files touched, commands run, or validation results. [Source: `_bmad-output/planning-artifacts/architecture.md` Learning Feedback Control Pattern]
- Architecture requires secrets and credentials not to be saved to memory, logs, summaries, RPC state, or learning reviews. Apply the same rule to influence records and context previews. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/storage/src/memory-store.ts` already persists memory candidates and appends durable memory entries to `.sprite/memory/entries.ndjson`; `readMemoryEntries(cwd)` returns durable entries.
- `packages/core/src/task-context.ts` already has a governed memory section, but `TaskContextMemoryInput` currently carries only `content`, optional `path`, `provenance`, and `type`; it lacks durable source IDs and influence status.
- `packages/core/src/runtime-loop.ts` creates task context packets but currently does not pass durable memory entries or prior learning-review lessons into `assembleTaskContextPacket`.
- `packages/core/src/agent-runtime.ts` owns task lifecycle, memory candidate review APIs, event emission, final summary creation, and Story 4.4 learning review generation.
- `packages/core/src/runtime-events.ts` validates memory and learning events. New influence events must follow the same strict unsafe-field rejection pattern.
- `packages/core/src/final-task-summary.ts` summarizes terminal task evidence. If influence visibility is not already sufficient through raw events, extend the final summary with safe influence lines.
- Story 4.4 added per-task learning review artifacts under `.sprite/sessions/<session-id>/learning-reviews/<task-id>.json`; this story may read those artifacts as lesson sources but must not rewrite them.

### Previous Story Intelligence

- Story 4.4 intentionally kept learning reviews deterministic and evidence-based. Reuse that approach: influence must not be fabricated from provider prose.
- Story 4.4 made `learning.review.created` events carry artifact paths and evidence event IDs. Use those IDs as source references for lesson candidates.
- Story 4.4 review added runtime mode configuration and stricter evidence validation after discovering missing full-mode and empty-evidence coverage. For this story, add tests for every influence status, not just the happy path.
- Story 4.3 fixed unsafe reviewer metadata side effects before candidate persistence. For influence records, validate/redact before event emission or persistence.
- Story 4.2 and 4.3 kept durable memory candidate-first and user-controlled. This story must not auto-save, auto-accept, or promote anything; it only records influence state.

### Suggested Contracts and Functions

Review and report this list before implementation:

- `MemoryInfluenceStatus` — `used | ignored | contradicted`.
- `MemoryInfluenceSourceType` — `memory_entry | learning_review_lesson`.
- `MemoryInfluenceCandidate` — bounded retrieval candidate with source IDs, safe preview, source type, confidence/mode, source event IDs, and retrieval reason.
- `MemoryInfluenceRecord` — runtime audit record with status, source reference, influence summary or reason, current task/session/correlation IDs, evidence event IDs, and created timestamp.
- `MemoryInfluenceSelectionRequest` — input from current task goal, durable memory entries, prior learning reviews, safety rules, and limits.
- `selectMemoryInfluenceCandidates()` — deterministic local selector; no provider calls, no embeddings, no new dependencies.
- `validateMemoryInfluenceRecord()` — schema and safety guard before event emission.
- `readLearningReviewLessonCandidates()` or storage equivalent — read safe lesson previews from prior Story 4.4 artifacts.
- `AgentRuntime.recordMemoryInfluence()` — explicit runtime API to mark a retrieved candidate `used`, `ignored`, or `contradicted`.
- `createMemoryInfluenceRecordedEvent()` / `validateMemoryInfluenceRecordedEvent()` — event factory/validator for `memory.influence.recorded`.
- `formatMemoryInfluenceSummary()` or final-summary equivalent — safe user-visible influence summary.

### File Structure Expectations

Likely files to modify:

- `packages/memory/src/index.ts`
- `packages/storage/src/memory-store.ts`
- `packages/storage/src/session-store.ts`
- `packages/storage/src/index.ts` if new readers need exports
- `packages/core/src/task-context.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/final-task-summary.ts` if final summaries need explicit influence visibility
- `packages/cli/src/index.ts` only if one-shot/session text or JSON output shape changes
- `tests/memory-safety.test.ts`
- `tests/session-store.test.ts` and/or `tests/memory-store.test.ts`
- `tests/task-context.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/cli-smoke.test.ts` only if CLI output changes

Avoid:

- Creating a second memory store or learning-review store when existing storage packages can be extended.
- Recording influence automatically just because a candidate was retrieved.
- Saving raw memory content or full learning review JSON into runtime events.
- Adding vector search, embeddings, external memory providers, or MemPalace integration.
- Coupling CLI/TUI/RPC directly to memory logic; keep runtime as owner.

### Testing Requirements

- Use Vitest and existing temp-workspace helpers.
- Add deterministic fixtures with at least one prior durable memory entry and one prior learning-review lesson.
- Assert `used`, `ignored`, and `contradicted` are each persisted as runtime history events with safe source references.
- Assert retrieved-but-not-used candidates do not become `used` until `recordMemoryInfluence()` or the runtime-owned equivalent is called.
- Assert unsafe content is rejected or redacted before context injection, event emission, or final-summary rendering.
- Assert no raw secret string appears in serialized event history, final summary output, or any new artifact.

### Project Structure Notes

- This story extends the Epic 4 learning loop after Story 4.4. It should make reuse visible but not implement retrospective generation (Story 4.6) or procedural skill-linked memory promotion (Story 4.7/Epic 5).
- Keep all local artifacts under `.sprite/` and reuse `schemaVersion` patterns for persisted/read artifact shapes.
- Runtime events remain the audit spine; session replay and retrospectives should be able to reconstruct influence state from events.
- No new dependencies.

### Research Notes

- No external web research is required for Story 4.5 because the implementation is local TypeScript/runtime/storage work with no new SDK or dependency decision.
- Git history shows the recent Epic 4 pattern: create story artifact, implement in runtime/memory/storage, add strict runtime event validation, cover with targeted tests, then run full validation.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- 2026-05-09: Development started. Confirmed planned function/contract surface before edits: memory influence contracts/selector, safe learning-review lesson reader, task-context provenance metadata, `memory.influence.recorded` runtime event, `AgentRuntime.recordMemoryInfluence()`, and final-summary visibility.
- 2026-05-09: GitNexus impact analysis before edits: `AgentRuntime`, `createTaskRequest`, `createFinalTaskSummary`, and `validateRuntimeEvent` reported CRITICAL risk; `readMemoryEntries` reported HIGH; `assembleTaskContextPacket` reported LOW. Implementation must stay backward-compatible and covered by targeted tests.
- 2026-05-09: Test-first checkpoint: baseline typecheck and targeted Story 4.4/4.5-adjacent tests passed before writing Story 4.5 regression tests.
- 2026-05-09: Red phase confirmed: new typecheck failed on missing `AgentRuntime.recordMemoryInfluence()` and `FinalTaskSummary.memoryInfluences`; runtime-events valid influence test failed until `memory.influence.recorded` validation was implemented.
- 2026-05-09: Green phase completed: targeted typecheck plus memory/storage/task-context/runtime-events/runtime-loop/session-persistence tests passed; full validation passed with lint/typecheck, all tests, and `git diff --check`.
- 2026-05-09: Code-review fixes completed after GitNexus impact checks: `AgentRuntime` CRITICAL and `readMemoryEntries` HIGH; changes stayed backward-compatible and were covered with targeted regression tests.

### Completion Notes List

- Added memory influence contracts, deterministic local candidate selection, and strict status-specific record validation for `used`, `ignored`, and `contradicted`.
- Added safe local lesson retrieval from prior `.sprite/sessions/*/learning-reviews/*.json` artifacts, returning only bounded previews and source references.
- Injected selected durable memory and learning-review lesson candidates into new task context packets with source IDs, source event IDs, source types, and retrieval reasons.
- Added explicit `AgentRuntime.recordMemoryInfluence()` and `memory.influence.recorded` runtime events; retrieval alone does not mark a candidate as used.
- Extended final task summaries and one-shot final-summary text with safe influence visibility for later user inspection and retrospective inputs.
- Fixed review findings by requiring task-term overlap before influence candidate boosts, bounding runtime memory/learning-review retrieval with deterministic source caps, and returning sectioned lesson/fact/test-gap learning-review previews.
- Preserved scope: no embeddings, vector search, external memory provider, MemPalace integration, auto-promotion, or failed/aborted retrospective generation.
- Validation evidence:
  - `rtk run 'npm run typecheck -- --pretty false'` passed after implementation.
  - `rtk run 'npm run typecheck -- --pretty false && npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/task-context.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'` passed: 6 files, 165 tests.
  - `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` passed: 16 files, 259 tests.
  - `rtk run 'npm test -- --run tests/memory-safety.test.ts tests/memory-store.test.ts tests/session-store.test.ts tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'` passed after review fixes: 7 files, 170 tests.
  - `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` passed after review fixes: 16 files, 262 tests.
  - `rtk run 'npx gitnexus status'` reported indexed/current commit `755f143`, status up-to-date.

### File List

- `_bmad-output/implementation-artifacts/4-5-show-prior-memory-or-lesson-influence-during-a-later-task.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-context.ts`
- `packages/memory/src/index.ts`
- `packages/storage/src/memory-store.ts`
- `packages/storage/src/session-store.ts`
- `tests/memory-safety.test.ts`
- `tests/memory-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/session-store.test.ts`
- `tests/task-context.test.ts`

## Change Log

- 2026-05-09: Created story context for visible prior memory/lesson influence.
- 2026-05-09: Implemented visible memory/lesson influence retrieval, explicit influence recording, final-summary surfacing, and regression tests; moved story to review.
- 2026-05-09: Resolved code-review findings for relevance gating, bounded retrieval, and sectioned learning-review previews; moved story to done.
