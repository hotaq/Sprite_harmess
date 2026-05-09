# Story 4.4: Generate Post-Task Learning Review

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want every non-trivial completed task to produce a learning review,
so that mistakes, lessons, test gaps, memory candidates, and skill signals are visible.

## Acceptance Criteria

1. Given a non-trivial task reaches completion, when the runtime generates a learning review, then the review distinguishes facts, lessons, mistakes, missed assumptions, test gaps, memory candidates, and skill signals, and it references evidence such as task ID, event IDs, files touched, commands run, validation results, or user corrections.
2. Given compact and full learning review modes are configured, when the review is produced, then the selected mode controls verbosity without removing required structured fields, and the review is saved as a local artifact.
3. Given a task is trivial, incomplete, failed, cancelled, or stopped at max iterations, when the normal post-task learning-review hook is evaluated, then no successful-task learning review is fabricated; failed/aborted retrospective behavior remains out of scope for Story 4.6.
4. Given review content, candidate previews, or artifact fields are serialized, when they contain raw tool output, raw logs, secrets, credentials, private keys, tokens, or large code chunks, then the review generator redacts or rejects unsafe material and persists only bounded safe evidence.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-4)
  - [x] Before touching implementation files, report exact functions/contracts to add or modify.
  - [x] Run GitNexus impact analysis before editing any existing function, class, or method symbol.
  - [x] Treat learning review generation as an audit and trust-boundary feature, not a decorative summary.

- [x] Add learning review contracts and generator in `packages/memory` (AC: 1-4)
  - [x] Add a `LearningReview` model with schema version, mode, task/session/correlation IDs, terminal status, created timestamp, evidence references, facts, lessons, mistakes, missed assumptions, test gaps, memory candidate references, and skill signals.
  - [x] Add `LearningReviewMode` support for `compact` and `full`; compact may shorten detail arrays/previews but must keep all required top-level fields.
  - [x] Add a deterministic generator that derives review sections from final task state/events/file activity/validation events instead of asking a provider to invent lessons.
  - [x] Use existing safety helpers to bound and redact review text; never serialize raw stdout/stderr, raw tool output, raw file content, secrets, credentials, tokens, private keys, or large code chunks.
  - [x] Keep procedural skill output as skill signals only; do not create active skills or skill candidates in this story.

- [x] Add local learning review artifact storage (AC: 2, 4)
  - [x] Add storage support for `.sprite/sessions/<session-id>/learning-review.json` or a clearly named per-task equivalent under the existing session artifact boundary.
  - [x] Validate task/session IDs and keep review artifact paths inside the session directory.
  - [x] Write learning review artifacts atomically with temp file + rename.
  - [x] Reject serialized unsafe fields or secret-looking review values before writing.
  - [x] Ensure session state/event persistence remains canonical; the artifact is derived evidence, not a replacement for `events.ndjson`.

- [x] Integrate review generation at successful task completion in `packages/core` (AC: 1-4)
  - [x] Generate the learning review only after a non-trivial task reaches `completed`.
  - [x] Use the runtime-owned task state and event history as inputs so evidence references align with persisted events.
  - [x] Persist the review artifact through storage after terminal state/event persistence succeeds.
  - [x] Emit a stable `learning.review.created` runtime event with safe bounded payload and artifact reference.
  - [x] Ensure resumed sessions do not regenerate or duplicate the same learning review for an already completed task.

- [x] Add runtime event validation for `learning.review.created` (AC: 1, 2, 4)
  - [x] Add the event type and payload contract in `packages/core/src/runtime-events.ts`.
  - [x] Payload must include task ID, mode, artifact path or artifact reference, section counts, evidence event IDs, memory candidate IDs, skill signal IDs/names, and safe summary.
  - [x] Payload must reject raw content, raw output, stdout/stderr, tokens, secrets, credentials, private keys, large code chunks, or secret-like field values.

- [x] Add minimal user-facing output wiring if needed (AC: 2)
  - [x] Include a safe learning-review artifact reference in one-shot print results and/or final summary output if the existing output path needs it to make the saved artifact discoverable. Not needed: the persisted `learning.review.created` event carries the safe artifact reference, and no CLI/print output shape changed.
  - [x] Keep CLI thin; do not let CLI generate or mutate learning reviews directly.
  - [x] Do not implement TUI rendering, JSON-RPC retrieval, failed-task retrospective trigger, memory reuse attribution, or skill promotion in this story.

- [x] Add regression tests (AC: 1-4)
  - [x] Memory tests: generator produces all required sections, compact/full preserve required fields, bounded redaction blocks unsafe material.
  - [x] Storage tests: artifact path boundary, atomic write shape, serialization validation, secret-like field rejection.
  - [x] Runtime event tests: valid `learning.review.created`, reject raw/secret fields, reject missing required section/evidence metadata.
  - [x] Runtime/session tests: completed non-trivial task writes one artifact and event; trivial/incomplete/failed/cancelled/max-iterations tasks do not fabricate successful-task reviews; resume does not duplicate review artifacts/events.
  - [x] CLI/print tests if output shape is touched. Not touched; full suite includes existing CLI smoke coverage.

- [x] Update story evidence and lifecycle status (AC: 1-4)
  - [x] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [x] Run targeted validation before review: memory, storage, runtime-events, runtime-loop/session persistence, and CLI tests if touched.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`. Not committed per user instruction; GitNexus status is up to date at HEAD.

## Dev Notes

### Story Intent

Story 4.4 turns terminal successful task evidence into a local learning review artifact. The review must make learning visible without silently promoting memory or skills. It should be deterministic, evidence-backed, locally persisted, and safe to show in CLI/JSON contexts.

Implement this slice:

- A typed learning review model and generator.
- Compact/full learning review modes that keep the same required structure.
- Safe local artifact persistence for completed non-trivial tasks.
- A `learning.review.created` runtime event.
- Tests proving no unsafe content is persisted and no duplicate review is created on resume.

Do not implement in this story:

- Story 4.5 memory/lesson reuse attribution.
- Story 4.6 retrospective review for failed, aborted, or incomplete tasks.
- Story 4.7 procedural memory promotion or skill candidate lifecycle.
- Vector search, embeddings, MemPalace integration, SQLite indexing, or external learning providers.
- Rich TUI or JSON-RPC retrieval surfaces.

### Source Requirements

- Story 4.4 requires a learning review after non-trivial completed tasks that distinguishes facts, lessons, mistakes, missed assumptions, test gaps, memory candidates, and skill signals with evidence references. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.4]
- Story 4.4 requires compact and full modes where mode changes verbosity without removing required structured fields, and the review is saved as a local artifact. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.4]
- FR43 and FR44 cover learning review generation and procedural skill signals. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.4]
- Architecture defines learning reviews as structured post-task reviews that produce mistakes, lessons, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/architecture.md` Key Concepts]
- Architecture requires local-first storage under `.sprite/`, with session artifacts including `learning-review.json` and JSON records for typed learning reviews. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Architecture]
- Architecture requires learning reviews, memory entries, and skill candidates to include evidence references such as task ID, event IDs, files touched, commands run, or validation results. [Source: `_bmad-output/planning-artifacts/architecture.md` Learning Feedback Control Pattern]
- Architecture requires secrets and credentials not to be saved to long-term memory or displayed in CLI, TUI, logs, RPC state, summaries, or learning reviews. [Source: `_bmad-output/planning-artifacts/architecture.md` Requirements Overview]
- NFR50 requires deterministic fixtures for at least one successful task learning review, one failed-task retrospective, and one repeated-workflow skill candidate scenario; this story should cover the successful task learning review slice only. [Source: `_bmad-output/planning-artifacts/prd.md` NFR50]

### Architecture Guardrails

- Keep learning review section classification, safety filtering, and compact/full shaping in `packages/memory`.
- Keep artifact path resolution and atomic writes in `packages/storage`.
- Keep terminal-task orchestration and event emission in `packages/core`.
- Keep CLI/print/RPC adapters thin over runtime-owned results.
- No new dependencies.
- Use existing stack: Node `>=22`, TypeScript `^5.9.2`, Vitest `^3.2.4`, Commander already present in CLI.
- Runtime events are the audit spine. The learning review event must reference persisted task evidence; it must not become a parallel log format.
- Project files, tool output, validation output, and user corrections are untrusted inputs. Treat review generation as bounded evidence extraction and redaction.

### Current Implementation Baseline

- `packages/core/src/final-task-summary.ts` creates a terminal task summary from `PlannedExecutionFlow`, grouped file activity, validation events, and important terminal/recovery events.
- `packages/core/src/agent-runtime.ts` owns task lifecycle transitions, session persistence, event emission, memory candidate review APIs, and one-shot print results.
- `packages/core/src/runtime-events.ts` defines and validates runtime event contracts, including memory candidate/entry/review events with unsafe-field rejection.
- `packages/storage/src/session-store.ts` owns `.sprite/sessions/<session-id>/events.ndjson`, `state.json`, and compaction artifacts.
- `packages/storage/src/memory-store.ts` demonstrates local artifact path guards, atomic writes, candidate serialization validation, and secret-like field rejection.
- `packages/memory/src/index.ts` owns memory safety evaluation, candidate generation, review summaries, lifecycle review helpers, and durable entry conversion.
- `packages/skills/src/index.ts` is currently empty; story 4.4 should represent skill learning as bounded signal records, not as active skill implementation.

### Previous Story Intelligence

- Story 4.3 review fixed unsafe reviewer metadata causing durable side effects before candidate audit persistence. For Story 4.4, validate/redact review content before artifact writes or event emission.
- Story 4.3 strengthened runtime event action/status validation for memory review events. Reuse the same strict validator discipline for `learning.review.created`.
- Story 4.3 derived legacy `auto_saved` memory candidate views without rewriting candidate artifacts. Story 4.4 should avoid rewriting historical events or legacy sessions while producing new derived learning-review artifacts for current completed tasks.
- Story 4.2 and 4.3 kept durable memory promotion candidate-first and user-controlled. Story 4.4 may reference memory candidates but must not auto-accept, auto-promote, or create active skills.

### Suggested Contracts and Functions

Review and report this list before implementation:

- `LearningReviewMode` — `compact | full`.
- `LearningReviewEvidenceReference` — references task ID, event IDs, files, commands, validation results, and user corrections.
- `LearningReviewMemoryCandidateReference` — bounded candidate ID/type/confidence/source reference.
- `LearningReviewSkillSignal` — bounded procedural signal with evidence and trigger reason.
- `LearningReview` — persisted artifact contract with required structured sections.
- `LearningReviewGenerationRequest` — generator input from task state/events/final summary/mode.
- `createLearningReview()` or `generateLearningReview()` — deterministic pure generator.
- `summarizeLearningReviewForEvent()` — safe bounded event payload summary.
- `validateLearningReview()` — schema/safety guard before persistence.
- `LocalSessionStore.writeLearningReview()` or dedicated `LocalLearningStore.writeTaskLearningReview()` — atomic artifact write under the session boundary.
- `AgentRuntime.generateLearningReviewForTask()` or equivalent private integration after completed terminal state persistence.
- `createLearningReviewCreatedEvent()` — event factory for `learning.review.created`.
- `validateLearningReviewCreatedEvent()` — runtime event validator.

### File Structure Expectations

Likely files to modify:

- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `packages/storage/src/index.ts` only if new exports are needed
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts` only if final summary needs a discoverable artifact reference
- `packages/core/src/runtime-events.ts`
- `packages/cli/src/index.ts` only if print output needs to expose the artifact reference
- `tests/memory-safety.test.ts`
- `tests/session-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts` and/or `tests/session-persistence.test.ts`
- `tests/cli-smoke.test.ts` only if CLI output changes

Avoid:

- Creating reviews from provider prose without deterministic evidence.
- Writing learning review artifacts outside `.sprite/sessions/<session-id>/`.
- Letting CLI or adapters generate learning review state.
- Saving raw stdout/stderr, raw logs, raw file contents, prompts, or secret-looking values.
- Creating or promoting skill candidates; that belongs to later Epic 5/Story 4.7 lifecycle work.

### Testing Requirements

- Use Vitest and existing test helper patterns.
- For storage tests, create temp projects under `tmpdir()` and clean them with `rmSync(..., { recursive: true, force: true })`.
- For runtime tests, use `AgentRuntime`, submit a task, record enough evidence, then complete the task.
- Use existing runtime event helpers such as `createRuntimeEventRecord()` and `validateRuntimeEvent()` for contract tests.
- Every test touching secret-like content must assert the serialized review/event does not contain the raw secret.
- Ensure compact and full modes are tested for structure preservation, not just snapshot length.

### Project Structure Notes

- This story extends the Epic 4 memory/learning pipeline after candidate review.
- The learning review artifact is local derived evidence. `events.ndjson` remains canonical for replay.
- Story 4.5 will make prior memory/lesson influence visible later; keep enough source IDs now to support that without implementing reuse tracking.
- Story 4.6 will handle failed/aborted retrospectives; do not blur successful-task learning reviews with failure retrospective output.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- 2026-05-09: Confirmed implementation surface before edits: learning review contracts/generator in `packages/memory`, artifact writer in `packages/storage`, runtime completion hook and `learning.review.created` validator in `packages/core`, regression tests across memory/storage/runtime/session persistence.
- 2026-05-09: GitNexus impact analysis before core edits reported CRITICAL blast radius for `AgentRuntime` and `validateRuntimeEvent`; changes were kept narrow and covered by targeted plus full validation.
- 2026-05-09: GitNexus status after validation: repository index up to date at commit `755f143`; implementation remains uncommitted by user instruction.

### Completion Notes List

- Implemented deterministic `LearningReview` generation with required sections: facts, lessons, mistakes, missed assumptions, test gaps, memory candidate references, and skill signals.
- Added compact/full learning review modes; runtime defaults to compact and can be configured with `RuntimeStartupOptions.learningReviewMode`.
- Persisted per-task review artifacts under `.sprite/sessions/<session-id>/learning-reviews/<task-id>.json` using atomic temp-file writes and session-bound path validation.
- Integrated successful-task-only review generation after completed task persistence; trivial, failed, cancelled, and max-iteration tasks do not fabricate successful learning reviews.
- Added `learning.review.created` runtime event validation with bounded artifact/evidence metadata and unsafe raw/secret field rejection.
- Kept CLI/TUI/RPC surfaces unchanged; artifact discoverability is through the persisted event payload in this story.
- Remaining limitation: failed/aborted retrospectives remain intentionally out of scope for Story 4.6, and memory/lesson reuse attribution remains out of scope for Story 4.5.

### File List

- `_bmad-output/implementation-artifacts/4-4-generate-post-task-learning-review.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/memory/src/index.ts`
- `packages/storage/src/session-store.ts`
- `tests/memory-safety.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/session-store.test.ts`

### Validation Evidence

- `rtk run 'npm run typecheck -- --pretty false'` — passed.
- `rtk run 'npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'` — passed, 5 files / 142 tests.
- `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` — passed, 16 files / 250 tests, diff whitespace check clean.
- `rtk run 'npx gitnexus status --repo Sprite_harmess 2>/dev/null || npx gitnexus status'` — passed, indexed/current commit both `755f143`.

### Review Findings

✅ Clean review after patching two concrete review gaps:

- Runtime full-mode selection is now represented by `RuntimeStartupOptions.learningReviewMode` and covered by regression test.
- `learning.review.created` validation now rejects empty evidence metadata / zero fact count and is covered by regression test.

## Change Log

- 2026-05-09: Created story context for post-task learning review generation.
- 2026-05-09: Implemented, reviewed, and validated post-task learning review generation; marked story done without committing per user instruction.
