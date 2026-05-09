# Story 4.7: Store Procedural Memory Through Skill-Linked Learning Outputs

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want learning reviews to identify reusable workflow patterns,
so that repeated procedures can become skill candidates later.

## Acceptance Criteria

1. Given a learning review identifies a repeated workflow or reusable procedure, when procedural memory output is created, then it records the procedure as a skill signal or skill-linked memory candidate without promoting it to an active skill.
2. Given procedural memory output is created, when it is persisted, emitted, summarized, or inspected, then it includes evidence, trigger reason, known risks, and source task references.
3. Given procedural memory influences a later task, when the task history is inspected, then the influence is visible separately from semantic or episodic memory.
4. Given procedural memory is stored or reused, when skill promotion has not been explicitly approved, then it remains candidate-first and does not become an active skill or promoted skill artifact.
5. Given procedural memory output or influence contains memory candidates, skill signals, command evidence, file evidence, task history, trigger reasons, or known risks, when those outputs are persisted or emitted, then they contain only bounded safe previews and source references; never raw secrets, raw tool output, large patches, credentials, or provider-invented claims.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-5)
  - [x] Report exact functions/contracts to add or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `generateLearningReview`, `validateLearningReview`, `summarizeLearningReviewForEvent`, `AgentRuntime`, `validateRuntimeEvent`, `validateMemoryInfluenceRecord`, and session-store learning-review writers.
  - [x] Treat procedural output as candidate-first skill-linked learning, not active skill promotion.
  - [x] Preserve the Story 4.4/4.6 boundaries: learning reviews and retrospectives may produce skill signals, but they must not create active skills.

- [x] Add procedural learning contracts in `packages/memory` (AC: 1-5)
  - [x] Add a skill-linked procedural output contract that records source session/task/correlation IDs, source skill signal ID, evidence event IDs, trigger reason, workflow summary, tool/command sequence, known risks, candidate lifecycle state, and created timestamp.
  - [x] Add a canonical candidate-first lifecycle/state for procedural learning output, e.g. draft/proposed signal, and do not add promoted/active skill state in this story.
  - [x] Extend or supplement `LearningReviewSkillSignal` so procedural outputs can be traced back to skill signals without relying on free-text.
  - [x] Add deterministic generation from retained evidence: validation successes, repeated command/tool sequence evidence, recovery/user-correction evidence, file activity, and task outcome.
  - [x] Add safe normalizers and validators that reject raw fields (`content`, `rawOutput`, `stdout`, `stderr`, `diff`, `patch`, `token`, `secret`, credentials, private keys, etc.) and secret-like values.
  - [x] Add a safe summary helper for learning-review events and/or procedural output inspection.

- [x] Store skill-linked procedural outputs with learning reviews (AC: 1-5)
  - [x] Persist procedural outputs inside the existing learning review artifact rather than introducing active skill registry files.
  - [x] Update session-store learning-review validation to fail closed if procedural outputs lack evidence, trigger reason, known risks, source task reference, or safe bounded previews.
  - [x] Ensure procedural outputs cannot be converted into durable `MemoryEntry` records unless a later skill-candidate/promotion story explicitly approves it.
  - [x] Keep storage path and artifact schema backward-compatible enough for existing learning-review tests to update intentionally.

- [x] Make procedural influence visible in task history (AC: 3-5)
  - [x] Extend memory influence source typing to distinguish procedural/skill signal sources from semantic memory entries and episodic/semantic learning-review lessons.
  - [x] Update `recordMemoryInfluence()` and `memory.influence.recorded` validation so a later task can record `used`, `ignored`, or `contradicted` procedural influence with source references.
  - [x] Ensure task history/event payloads expose procedural influence separately through `sourceType` or equivalent safe discriminant.
  - [x] Ensure retrospectives from Story 4.6 can retain procedural influence evidence without converting it into an active skill.

- [x] Add runtime integration without over-scoping Epic 5 (AC: 1-5)
  - [x] Feed generated procedural outputs from learning reviews through the existing completed-task learning review flow.
  - [x] Emit only safe IDs/counts/summaries in runtime events; avoid raw procedural artifact content in event payloads.
  - [x] Do not add manual skill listing, invocation, usage tracking UI, skill candidate review UI, draft/promote lifecycle, or registry writes; those belong to Epic 5.
  - [x] Do not add MemPalace, vector search, SQLite, embeddings, or new dependencies.

- [x] Add regression tests (AC: 1-5)
  - [x] Memory tests: procedural outputs are generated deterministically from skill signals and retained command/validation evidence.
  - [x] Memory tests: missing evidence, missing trigger reason, missing known risks, unsafe fields, and secret-like values are rejected.
  - [x] Storage tests: learning-review artifacts with procedural outputs persist safely and unsafe/malformed procedural outputs fail before write.
  - [x] Runtime event tests: `learning.review.created` summaries and `memory.influence.recorded` procedural sources validate; invalid source types, missing evidence, raw fields, and secrets fail.
  - [x] Runtime/session tests: completed tasks with successful validation or recovery evidence produce skill-linked procedural outputs in the learning review artifact.
  - [x] Runtime/session tests: later-task procedural influence is visible separately from semantic/episodic memory influence.
  - [x] Regression tests: no active skill file/registry entry is created and no procedural output is auto-promoted.

- [x] Update story evidence and lifecycle status (AC: 1-5)
  - [x] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [x] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [x] Run targeted validation before review: memory, storage/session-store, runtime-events, runtime-loop/session persistence, and any skill/procedural tests touched.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 4.7 is the bridge between Epic 4 learning reviews and Epic 5 skill lifecycle. The system should identify reusable procedures as skill-linked learning outputs, keep them evidence-backed and reviewable, and make later procedural influence visible. It must not create active skills, promoted skill files, or autonomous behavior changes.

The implementation should answer four audit questions:

1. Which source task and skill signal produced the procedural output?
2. What evidence supports the workflow pattern, trigger reason, known risks, and source references?
3. How does a later task show that procedural learning influenced it?
4. How is the output kept candidate-first until explicit skill lifecycle approval?

### Source Requirements

- Story 4.7 requires learning reviews to identify reusable workflow patterns so repeated procedures can become skill candidates later. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.7]
- FR41 requires procedural memory through skills and skill candidates. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR44 requires learning reviews to identify mistakes, missed assumptions, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR55 says skill signals come from repeated workflows, successful tool sequences, or user corrections. Although FR55 is mapped to Epic 5, this story should produce the safe precursor output only. [Source: `_bmad-output/planning-artifacts/prd.md` Skills and Skill Evolution]
- NFR23 requires task audit trails to contain memory changes, skill signals, and final status. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR25 requires learning reviews to distinguish facts, lessons, mistakes, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR27 requires skill candidates to include trigger reason, supporting evidence, intended activation conditions, and current lifecycle state. This story should provide the precursor data but not the full Epic 5 lifecycle. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR28 requires the agent to explain which prior memory, lesson, skill signal, or self-model state influenced a task. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture treats skills as reviewed procedural memory and requires user approval before promotion. [Source: `_bmad-output/planning-artifacts/architecture.md` Decision Pressure Points]
- Architecture says repeated workflow signals create skill signals first; skill signals can aggregate into skill candidates; skill candidates are draft artifacts, not active behavior; user approval is required before promotion. [Source: `_bmad-output/planning-artifacts/architecture.md` Skill Evolution Patterns]
- Architecture requires memory and learning outputs to preserve provenance, confidence, evidence references, and safety filtering. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Learning Patterns]
- Architecture requires secrets and credentials not to be saved to memory, logs, summaries, RPC state, or learning reviews. Apply the same rule to procedural outputs. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/memory/src/index.ts` already has `MemoryType` including `procedural`, but `DURABLE_MEMORY_TYPES` is currently `episodic | semantic`; this is a useful guardrail because procedural learning should remain candidate-first.
- `LearningReviewSkillSignal` currently contains `id`, `signal`, `triggerReason`, and `evidenceEventIds`; it does not yet require known risks, source task references, workflow summaries, or a candidate lifecycle state.
- `generateLearningReview()` currently normalizes memory candidates and skill signals and adds a lesson when skill signals exist.
- `AgentRuntime.createLearningReviewForCompletedTask()` builds learning reviews from final summary evidence, memory candidates, validation events, and `collectLearningReviewSkillSignals()`.
- `collectLearningReviewSkillSignals()` currently creates signals from passed validation events and recovery events.
- `memory.influence.recorded` currently supports `sourceType` values `memory_entry` and `learning_review_lesson`; procedural or skill-signal influence is not yet distinguishable.
- `runtime-events.ts` validates learning review and memory influence events with safe bounded payloads. Extend this style; do not weaken validators.
- `packages/storage/src/session-store.ts` persists learning review artifacts and now has precedent for stricter artifact validation from Story 4.6 retrospective storage hardening.

### Previous Story Intelligence

- Story 4.4 intentionally kept skill output as skill signals only and did not create active skills or skill candidates.
- Story 4.5 added visible `memory.influence.recorded` records and made reused memory/lessons inspectable as `used`, `ignored`, or `contradicted`.
- Story 4.6 added retrospective outputs and explicitly deferred procedural memory and promoted skills to Story 4.7/Epic 5.
- Story 4.6 review found an evidence-boundary bug where a nonterminal event could be treated as terminal evidence. Apply the same lesson here: procedural outputs must not be created from weak, missing, or mismatched evidence.
- Recent GitNexus impact checks marked `AgentRuntime` and `validateRuntimeEvent` as CRITICAL. Keep changes additive, localized, and heavily tested.

### Suggested Contracts and Functions

Report this list before implementation and revise it if code inspection shows a better existing seam:

- `PROCEDURAL_LEARNING_OUTPUT_SCHEMA_VERSION` — schema version for skill-linked procedural outputs.
- `ProceduralLearningOutputStatus` — candidate-first status such as `skill_signal` or `candidate`; do not include active/promoted states here.
- `ProceduralLearningOutput` / `SkillLinkedProceduralCandidate` — safe artifact shape with source IDs, skill signal ID, evidence event IDs, workflow summary, trigger reason, tool/command sequence, known risks, lifecycle state, and timestamps.
- `ProceduralLearningGenerationRequest` — normalized evidence input for procedural output generation.
- `generateProceduralLearningOutputs()` — deterministic evidence-to-output generator used by `generateLearningReview()`.
- `validateProceduralLearningOutput()` — schema and safety gate before persistence or event emission.
- `summarizeProceduralLearningOutputsForEvent()` — safe IDs/counts/summary helper for learning review events.
- `normalizeProceduralLearningOutputs()` — bounded safe normalizer for externally supplied procedural outputs if needed.
- `MemoryInfluenceSourceType` extension — add a procedural/skill-signal source type such as `skill_signal` or `procedural_learning_output`.
- `validateMemoryInfluenceRecord()` and `validateMemoryInfluenceRecordedEvent()` — ensure procedural influence has source events, evidence events, safe source IDs, and source type separation.
- `collectLearningReviewSkillSignals()` — may need to produce richer skill signals from validation, recovery, and command/tool sequence evidence.

### File Structure Expectations

Likely files to modify:

- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `tests/memory-safety.test.ts`
- `tests/session-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts` only if persisted inspection shape changes

Avoid:

- Adding `.codex/skills`, `.agents/skills`, or active skill registry writes.
- Adding skill candidate review/edit/reject/promote lifecycle; Epic 5 owns that.
- Adding new dependencies, vector search, embeddings, SQLite, MemPalace integration, or background indexing.
- Creating durable procedural `MemoryEntry` records from procedural outputs without explicit later approval.
- Persisting raw command output, raw diffs, raw patches, raw provider text, or credentials.

### Testing Requirements

- Use Vitest and existing temp-workspace/session helpers.
- Start with red tests for procedural output generation and procedural influence source separation.
- Assert generated procedural outputs include evidence IDs, trigger reason, workflow summary, known risks, source task/session IDs, and a candidate-first status.
- Assert procedural outputs remain distinct from `memoryCandidates` and from durable `MemoryEntry` writes.
- Assert later-task `memory.influence.recorded` can show procedural/skill-signal influence separately from semantic or episodic memory influence.
- Assert unsafe strings and raw fields are rejected or redacted before persistence, event emission, and summaries.
- Assert no active skill file or promoted skill registry artifact is created by Story 4.7.

### Project Structure Notes

- Keep procedural outputs inside `.sprite/sessions/<session-id>/learning-reviews/<task-id>.json` as learning-review evidence, not in promoted skill directories.
- Runtime events remain the audit spine; future Epic 5 workflows should be able to discover candidate-first procedural outputs from learning review events and artifacts.
- Completed-task learning reviews are the primary source; retrospectives may reference procedural influence but should not promote it.

### Research Notes

- No web research is required for Story 4.7 because implementation is local TypeScript/runtime/storage work with no new SDK or dependency choice.
- The relevant architecture pattern is already captured locally: repeated workflow signals create skill signals first, skill candidates are draft artifacts, and user approval is required before promotion.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- 2026-05-09: Story created from Epic 4 backlog using BMAD create-story flow. Implementation has not started yet.
- 2026-05-09: Development started. First task is confirming the implementation function/contract surface before code edits.
- 2026-05-09: Confirmed Story 4.7 function/contract surface before edits, including procedural output schema, generator, validator, event summary IDs, storage validation, runtime event validation, and procedural memory influence source typing.
- 2026-05-09: GitNexus impact analysis completed before existing-symbol edits. `AgentRuntime` and `validateRuntimeEvent` were CRITICAL, so changes were kept additive and covered by targeted runtime/session regressions.
- 2026-05-09: Red tests first confirmed missing procedural learning exports, learning-review event IDs, procedural influence source typing, and storage artifact validation.
- 2026-05-09: Green implementation added candidate-first procedural outputs linked to skill signals and learning reviews, without creating active skills or promoted skill artifacts.
- 2026-05-09: Review fix tightened procedural influence references so `procedural_learning_output` records/events must use `procout_` source IDs and include source session/task references.
- 2026-05-09: Targeted validation passed: `rtk run 'npm run typecheck -- --pretty false && npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'` — 5 files / 167 tests passed.
- 2026-05-09: Full validation passed: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` — 16 files / 276 tests passed.

### Completion Notes List

- Story context created with procedural-memory scope boundaries, previous-story intelligence, likely function list, and test expectations.
- Added candidate-first `ProceduralLearningOutput` contracts, schema/version/status constants, deterministic generation from skill signals and command/validation evidence, safe normalization, safe summary IDs, and fail-closed validators.
- Integrated procedural outputs into completed-task learning reviews and `learning.review.created` events via safe `proceduralOutputIds`; event payloads do not include raw procedural content.
- Persisted procedural outputs inside learning-review artifacts only; no `.sprite/skills`, active skill registry, promoted skill file, new dependency, vector index, or durable procedural `MemoryEntry` write was added.
- Extended memory influence source typing with `procedural_learning_output` so later tasks can show procedural influence separately from memory entries and learning-review lessons.
- Added storage/runtime/session regressions for safe persistence, unsafe-field rejection, procedural influence visibility, and no auto-promotion.
- Remaining limitation: this story only creates candidate-first procedural learning evidence. Skill candidate aggregation, review UI, activation, promotion, and registry writes remain Epic 5 work.

### File List

- `_bmad-output/implementation-artifacts/4-7-store-procedural-memory-through-skill-linked-learning-outputs.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/runtime-events.ts`
- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `tests/memory-safety.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-store.test.ts`

## Change Log

- 2026-05-09: Created story context for candidate-first procedural memory through skill-linked learning outputs.
- 2026-05-09: Started development and moved story to in-progress.
- 2026-05-09: Implemented candidate-first procedural learning outputs, persistence/event summaries, procedural influence separation, storage/runtime safety gates, and regression coverage.
- 2026-05-09: Reviewed, tightened procedural influence references, completed validation, and marked Story 4.7 done.
