# Story 5.4: Record Skill Signals from Repeated Workflows

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to record skill signals from repeated workflows and corrections,
so that reusable procedures can be discovered without immediate promotion.

## Acceptance Criteria

1. Given a completed task includes repeated workflow steps, successful tool/validation sequences, recovery patterns, or explicit user corrections, when the learning review evaluates the task, then it records skill signals with safe signal ID, source session/task/correlation IDs, task evidence, workflow summary, trigger reason, tool sequence, outcome, confidence, and known risks.
2. Given a skill signal is recorded, when runtime history or the audit trail is inspected, then a typed `skill.signal.recorded` event exists and references only bounded safe metadata, source evidence event IDs, and the learning review artifact; it must not expose raw tool output, stdout/stderr, diffs, patches, raw skill content, raw filesystem paths, secrets, credentials, or unbounded content.
3. Given a skill signal is low-confidence, based on one weak example, or produced from correction/recovery evidence, when it is recorded, then it remains a signal-only artifact with an explicit candidate/promotion boundary and cannot become an active skill, candidate, promoted skill, or automatic routing rule in this story.
4. Given Story 5.3 skill usage records already exist, when learning review signal generation runs, then it may use `skill.usage.recorded` events as safe evidence but must not reinterpret `loaded` as `used`, must not infer hidden model intent, and must not create signals from unsafe or unauditable usage metadata.
5. Given skill signal recording is part of the shared runtime capability model, when CLI/print/session persistence consume the result, then signals are represented through shared runtime events and learning review artifacts rather than CLI-only formatting.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-5)
  - [x] Report the exact functions/contracts to add or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `generateLearningReview`, `normalizeLearningSkillSignals`, `validateLearningReview`, `LocalSessionStore.writeLearningReview`, `validateRuntimeEvent`, `AgentRuntime.createLearningReviewForCompletedTask()`, and `collectLearningReviewSkillSignals()`.
  - [x] Keep this story signal-only: no skill candidates, no candidate review/edit/promote lifecycle, no active skill file writes, no automatic skill selection, no autonomous routing, and no policy grants.
  - [x] Preserve Story 5.3 safety: `skill.usage.recorded` metadata is bounded/path-safe and cannot be used as raw skill content.

- [x] Define a richer safe skill signal artifact contract (AC: 1-4)
  - [x] Extend `LearningReviewSkillSignal` or add a compatible richer signal type with `id`, `evidenceEventIds`, `sourceSessionId`, `sourceTaskId`, `sourceCorrelationId`, `workflowSummary`, `triggerReason`, `toolSequence`, `outcome`, `confidence`, `knownRisks`, and signal-only lifecycle metadata.
  - [x] Keep ID prefix `skillsig_` and fail closed for invalid IDs, missing evidence, empty workflow/trigger/risk fields, unknown confidence/outcome values, or unsafe values.
  - [x] Add/extend `normalizeLearningSkillSignals()` so supplied and generated signals are bounded safe previews.
  - [x] Add a validator helper, for example `validateLearningReviewSkillSignal()`, and call it from `validateLearningReview()`.
  - [x] Ensure existing compact/full modes limit signal counts and text lengths deterministically.

- [x] Add `skill.signal.recorded` runtime event contract (AC: 1-5)
  - [x] Add `skill.signal.recorded` to `RUNTIME_EVENT_TYPES`.
  - [x] Add a typed payload that mirrors safe signal metadata: `skillSignalId`, `sourceSessionId`, `sourceTaskId`, `sourceCorrelationId`, `learningReviewArtifactPath`, `evidenceEventIds`, `workflowSummary`, `triggerReason`, `toolSequence`, `outcome`, `confidence`, `knownRisks`, `signalStatus: "signal_only"`, `status: "recorded"`, and `summary`.
  - [x] Validate artifact paths as safe project-relative paths.
  - [x] Require non-empty evidence event IDs, tool sequence, known risks, workflow summary, and trigger reason.
  - [x] Reject forbidden raw fields and secret-looking or raw-path values using the same fail-closed style as `skill.usage.recorded`, `learning.review.created`, and procedural output validators.
  - [x] Reject candidate/promotion/active-skill fields such as `candidateId`, `promotedSkillPath`, `activationRule`, `rawSkillContent`, or equivalent authority-changing metadata.

- [x] Generate signal records from learning review evidence (AC: 1, 3-4)
  - [x] Expand `collectLearningReviewSkillSignals()` so it captures safe signals from successful validation/tool sequences, recovery patterns, explicit `task.steering.received` corrections, and relevant `skill.usage.recorded` evidence.
  - [x] Do not create a signal from `skill.usage.recorded` with `status: "loaded"` alone.
  - [x] Treat `used`, `ignored`, and `contradicted` usage records as possible evidence only when they include safe influence/reason metadata and source/evidence event references.
  - [x] Assign conservative confidence: weak single-example or correction/recovery evidence should be `low`; repeated/multiple supporting events may be `medium`; do not invent `high` confidence unless the implementation has explicit deterministic evidence.
  - [x] Include known risks that explain candidate-first limitations and validation requirements.
  - [x] Deduplicate repeated signals by stable `skillsig_` IDs or equivalent deterministic grouping.

- [x] Emit runtime signal events through the shared runtime boundary (AC: 2, 5)
  - [x] In `AgentRuntime.createLearningReviewForCompletedTask()`, emit one `skill.signal.recorded` event for each learning-review skill signal.
  - [x] Emit signal events in the same completion flow as `learning.review.created`, after the learning review artifact path is known.
  - [x] Ensure all emitted `skill.signal.recorded` events reference task-local evidence event IDs and the safe learning-review artifact path.
  - [x] Preserve idempotency: if a learning review already exists for the task, do not duplicate signal events.
  - [x] Keep `learning.review.created.skillSignalIds` as ID summary metadata; do not stuff full signal details into the learning-review-created event.

- [x] Preserve later Epic 5 boundaries (AC: 3)
  - [x] Do not emit `skill.candidate.created`; Story 5.5 owns candidate generation.
  - [x] Do not add candidate review/edit/reject/draft/promote behavior; Story 5.6 owns that.
  - [x] Do not write `.sprite/skills`, `.codex/skills`, `.agents/skills`, global skill registry files, or promoted skill artifacts.
  - [x] Do not make signals available as active skills in listing/invocation behavior.
  - [x] Do not alter command/file approval policy or grant new authority based on a signal.

- [x] Harden persistence and artifact validation (AC: 1-3)
  - [x] Update session-store learning-review artifact validation so `skillSignals` have safe required fields, `skillsig_` IDs, bounded safe values, and no raw/secret-bearing fields.
  - [x] Ensure stored learning review artifacts keep skill signals distinct from procedural outputs and memory candidates.
  - [x] Ensure generated procedural outputs still derive from skill signals but remain candidate-first and `not_promoted`.
  - [x] Preserve backward-compatible migration behavior only if old test fixtures require it; otherwise fail closed for malformed new signals.

- [x] Add regression tests (AC: 1-5)
  - [x] Memory tests: generated skill signals include workflow summary, trigger reason, tool sequence, outcome, confidence, known risks, source session/task/correlation IDs, and evidence event IDs.
  - [x] Memory tests: low-confidence/weak-example signals stay signal-only and do not become procedural outputs with promoted/active status.
  - [x] Runtime event tests: `skill.signal.recorded` accepts safe payloads and rejects invalid IDs, missing evidence, empty tool sequence/known risks, raw paths, secrets, raw output fields, diffs, patches, stdout/stderr, and candidate/promotion fields.
  - [x] Runtime/session tests: completed tasks with successful validation/tool evidence emit `skill.signal.recorded` and `learning.review.created`.
  - [x] Runtime/session tests: task steering/correction and recovery patterns can produce low-confidence signal events with known risks.
  - [x] Runtime/session tests: `skill.usage.recorded` with `used`, `ignored`, or `contradicted` can feed safe signal evidence; `loaded` alone cannot.
  - [x] Storage tests: learning review artifacts reject malformed or unsafe `skillSignals`.
  - [x] Scope guard tests: no `skill.candidate.created`, no skill candidate artifact, no promoted skill file, and no active skill registry change is created by this story.

- [x] Update story evidence and lifecycle status (AC: 1-5)
  - [x] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [x] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [x] Run targeted validation before review: memory-safety tests, session-store tests, runtime-events tests, runtime-loop tests, CLI smoke tests if output changes.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if the CLI lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.4 turns learning-review skill signals into first-class runtime/audit events. Stories 4.7 and 5.3 already created the safe precursor layers:

1. Story 4.7: learning reviews can create candidate-first procedural outputs from skill signals.
2. Story 5.3: tasks can record when an invoked skill was loaded, used, ignored, or contradicted.
3. Story 5.4: learning review should now emit explicit `skill.signal.recorded` events and richer signal metadata.

This story must not make Sprite Harness create, promote, or activate a skill. A signal is evidence only.

### Source Requirements

- Story 5.4 requires recording skill signals from repeated workflows and corrections so reusable procedures can be discovered without immediate promotion. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.4]
- Story 5.4 requires task evidence, workflow summary, trigger reason, tool sequence, outcome, known risks, and `skill.signal.recorded`. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.4]
- Story 5.4 requires low-confidence or weak-example signals to remain signals only, not active skills or candidates. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.4]
- FR55 requires the system to record skill signals from repeated workflows, successful tool sequences, or user corrections. [Source: `_bmad-output/planning-artifacts/prd.md` Skills and Skill Evolution]
- FR44 requires learning reviews to identify mistakes, missed assumptions, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR58 requires the agent to show when a skill or skill signal influenced a task. Story 5.4 records the signal evidence; later stories can surface influence. [Source: `_bmad-output/planning-artifacts/prd.md` Skills and Skill Evolution]
- NFR23 requires task audit trails to contain memory changes, skill signals, and final status. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR25 requires learning reviews to distinguish facts, lessons, mistakes, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR27 requires skill candidates to include trigger reason, supporting evidence, intended activation conditions, and lifecycle state; Story 5.4 should provide precursor signal evidence but not create candidates. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR29 requires CLI, TUI, and JSON-RPC to use one shared runtime capability model. Put signal recording in core/runtime contracts, not CLI-only formatting. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture treats the runtime event stream as the spine for audit, replay, UI, RPC, learning reviews, and tests. [Source: `_bmad-output/planning-artifacts/architecture.md` Event Stream Architecture]
- Architecture says repeated workflow signals create skill signals first; skill signals can aggregate into candidates; candidates are drafts; user approval is required before promotion. [Source: `_bmad-output/planning-artifacts/architecture.md` Skill Evolution Patterns]
- Architecture requires memory and skill systems to consume event history and learning reviews, not raw adapter state. [Source: `_bmad-output/planning-artifacts/architecture.md` Dependency Direction]
- Architecture requires secrets and credentials not to enter logs, summaries, memory, RPC state, or learning reviews. Apply the same rule to signal events and artifacts. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/memory/src/index.ts` already defines:
  - `LearningReviewSkillSignal` with `id`, `signal`, `triggerReason`, and `evidenceEventIds`.
  - `ProceduralLearningOutput` with `sourceSkillSignalId`, `workflowSummary`, `toolSequence`, `knownRisks`, `promotionStatus: "not_promoted"`, and `status: "candidate"`.
  - `generateLearningReview()` which normalizes supplied skill signals and generates procedural outputs from them.
  - `normalizeLearningSkillSignals()` which currently bounds `id`, `signal`, and `triggerReason` but does not yet enforce richer signal fields.
  - `generateProceduralLearningOutputs()` which maps skill signals into candidate-first procedural outputs.
- `packages/core/src/agent-runtime.ts` already:
  - Calls `generateLearningReview()` from `AgentRuntime.createLearningReviewForCompletedTask()`.
  - Passes `collectLearningReviewSkillSignals(events)` into learning-review generation.
  - Emits `learning.review.created` with safe `skillSignalIds` and `proceduralOutputIds`.
  - Currently does not emit `skill.signal.recorded`.
  - Currently creates skill signals only from passed validation events and recovery events.
- `packages/core/src/runtime-events.ts` currently:
  - Supports `learning.review.created`, `retrospective.review.created`, `skill.invoked`, `skill.usage.recorded`, and `skill.invocation.failed`.
  - Has no `skill.signal.recorded` event type yet.
  - Validates `learning.review.created.skillSignalIds` as IDs but not full signal details.
- `packages/storage/src/session-store.ts` currently:
  - Persists learning reviews under `.sprite/sessions/<session-id>/learning-reviews/<task-id>.json`.
  - Validates procedural outputs strictly.
  - Treats `skillSignals` as `readonly object[]` and should be hardened for this story.
- Tests already covering adjacent behavior:
  - `tests/memory-safety.test.ts` covers skill signals inside learning reviews and procedural output generation.
  - `tests/runtime-loop.test.ts` covers completed-task learning reviews and no auto-generation from skill usage in Story 5.3.
  - `tests/runtime-events.test.ts` covers runtime event validation.
  - `tests/session-store.test.ts` covers learning-review artifact persistence.

### Previous Story Intelligence

- Story 5.3 intentionally did not emit `skill.signal.recorded`; that belongs to Story 5.4.
- Story 5.3 added `skill.usage.recorded` and `AgentRuntime.recordSkillUsage()` with bounded/path-safe text metadata. Use it as safe evidence only; do not treat a loaded skill as proof of influence.
- Story 5.3 review fixed an AC2 gap: skill usage text must reject raw filesystem paths and unbounded content. Apply the same pattern to skill signal text.
- Story 4.7 established candidate-first procedural learning outputs linked to skill signals and explicitly prohibited active skill promotion.
- Story 4.7 review tightened procedural influence references to require `procout_` IDs and source session/task references. Apply the same evidence-reference discipline to `skillsig_` signals.
- The GitNexus CLI may still lack `detect_changes`; use analyze/status fallback before commits until detect-change parity exists.

### Suggested Contracts and Functions

Before implementation, report and adjust this function list based on direct code inspection:

- `SkillSignalOutcome` — deterministic values such as `successful_workflow | corrected_workflow | recovered_workflow | contradicted_guidance`.
- `SkillSignalLifecycleStatus` — `signal_only` or `recorded`; do not add `candidate`, `promoted`, or `active`.
- `RuntimeSkillSignalRecordedPayload` / event payload for `skill.signal.recorded`.
- `validateSkillSignalRecordedEvent()` in `packages/core/src/runtime-events.ts`.
- `validateLearningReviewSkillSignal()` in `packages/memory/src/index.ts`.
- `normalizeLearningSkillSignals()` extension for richer signal fields.
- `createLearningReviewSkillSignal()` or local helper to keep signal construction deterministic and bounded.
- `collectLearningReviewSkillSignals()` expansion in `packages/core/src/agent-runtime.ts`.
- `createSkillSignalRecordedEvent()` or `createSkillSignalRecordedEvents()` in `AgentRuntime`.
- `validateStoredSkillSignalArtifact()` in `packages/storage/src/session-store.ts`.
- Optional helper: `summarizeLearningSkillSignalsForEvent()` if `summarizeLearningReviewForEvent()` needs a safe full-signal-to-event adapter.

### Event Contract Recommendation

Prefer a dedicated event instead of overloading `learning.review.created`:

```ts
type SkillSignalOutcome =
  | "successful_workflow"
  | "corrected_workflow"
  | "recovered_workflow"
  | "contradicted_guidance";

interface SkillSignalRecordedPayload {
  confidence: "low" | "medium" | "high";
  evidenceEventIds: string[];
  knownRisks: string[];
  learningReviewArtifactPath: string;
  outcome: SkillSignalOutcome;
  signalStatus: "signal_only";
  skillSignalId: string;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceTaskId: string;
  status: "recorded";
  summary: string;
  toolSequence: string[];
  triggerReason: string;
  workflowSummary: string;
}
```

Rationale:

- `learning.review.created` stays a compact artifact summary.
- `skill.signal.recorded` is the audit event for the signal itself.
- Multiple signals can exist for one learning review.
- The payload is evidence-rich enough for Story 5.5 candidate generation without implementing candidate generation early.
- `signalStatus: "signal_only"` is an explicit guard against accidental promotion semantics.

### Safety and Authority Rules

- Skill signals are audit evidence, not permission grants.
- A signal must not execute commands, load skill content, or change the agent loop.
- A signal must not create a skill candidate, active skill, registry entry, or promoted skill artifact in this story.
- Do not infer user intent from raw model prose or raw skill body content.
- Do not turn `skill.usage.recorded` `status: "loaded"` into a skill signal by itself.
- Signal events and artifacts must not contain:
  - raw command output, stdout, stderr, or full tool output
  - diffs, patches, raw snippets, or raw skill content
  - raw filesystem paths or non-portable absolute paths
  - secrets, API keys, private keys, tokens, credentials
  - unbounded text
  - activation rules, promotion paths, or candidate lifecycle fields
- If signal input is unsafe or lacks evidence, reject it instead of redacting into an ambiguous audit record.

### Project Structure Notes

- Keep learning-review signal artifact contracts in `packages/memory/src/index.ts`.
- Keep runtime event contracts and validators in `packages/core/src/runtime-events.ts`.
- Keep runtime orchestration and event emission in `packages/core/src/agent-runtime.ts`.
- Keep learning-review persistence validation in `packages/storage/src/session-store.ts`.
- Do not add a new package or dependency.
- Do not create `packages/skills/src/skill-signals.ts` unless implementation evidence shows a clear boundary benefit; the current learning-review signal flow already lives in memory/core.
- Keep generated artifacts under existing session learning-review storage, not skill registries.

### Testing Guidance

Use temp directories for cwd/HOME so tests do not read real user skills.

Minimum targeted validations:

```bash
rtk run 'npm test -- --run tests/memory-safety.test.ts tests/session-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts'
rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'
```

Add `tests/cli-smoke.test.ts` if print/JSON output shape changes.

### Latest Technical Context

No external SDK or dependency change is required. The relevant stack is already pinned locally:

- TypeScript workspace, `typescript` `^5.9.2`.
- Vitest `^3.2.4`.
- Node `>=22`.
- No new dependencies should be added.

### References

- `_bmad-output/planning-artifacts/epics.md` — Epic 5 and Story 5.4 source requirements.
- `_bmad-output/planning-artifacts/prd.md` — FR44, FR55, FR58, NFR23, NFR25, NFR27, NFR29, NFR50.
- `_bmad-output/planning-artifacts/architecture.md` — runtime event stream, learning review, skill evolution patterns, local-first storage, audit/security constraints.
- `_bmad-output/implementation-artifacts/4-7-store-procedural-memory-through-skill-linked-learning-outputs.md` — candidate-first procedural output precedent.
- `_bmad-output/implementation-artifacts/5-3-track-skill-usage-and-influence-during-tasks.md` — skill usage/influence event and safety boundary.
- `packages/memory/src/index.ts` — learning review, skill signal, procedural output contracts.
- `packages/core/src/agent-runtime.ts` — completed-task learning review flow and current signal collector.
- `packages/core/src/runtime-events.ts` — runtime event contract and validator patterns.
- `packages/storage/src/session-store.ts` — learning review artifact persistence validation.
- `tests/memory-safety.test.ts`, `tests/runtime-loop.test.ts`, `tests/runtime-events.test.ts`, `tests/session-store.test.ts` — existing adjacent regression coverage.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- GitNexus impact before implementation: `generateLearningReview`, `normalizeLearningSkillSignals`, `validateLearningReview`, `validateRuntimeEvent`, `collectLearningReviewSkillSignals`, `createLearningReviewForCompletedTask`, `validateStoredLearningReviewArtifact`; `validateRuntimeEvent` reported CRITICAL blast radius, so the implementation stayed additive and validator-focused.
- Red test phase: targeted suite failed on missing rich skill-signal metadata, missing `skill.signal.recorded`, missing runtime emission, and missing storage rejection for promotion fields.
- Green validation: targeted and full validation passed after implementation.
- GitNexus fallback before commit/review: `npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status` reported repository status up-to-date at commit `39a51ab`.
- Heavy review fix phase: addressed fail-closed raw `skillSignals` input validation, explicit event `signalStatus: "signal_only"`, bounded event summaries/arrays, storage/memory signal bounds, retrospective signal-shape drift, and missing ignored/contradicted/order regressions.

### Completion Notes List

- Story context created for signal-only skill signal recording from learning review evidence.
- Developer guardrails emphasize no candidate generation, no promotion, no active skill writes, and no autonomous routing.
- Added a richer `LearningReviewSkillSignal` contract with source session/task/correlation IDs, workflow summary, tool sequence, outcome, conservative confidence, known risks, and `signal_only` lifecycle status.
- Added fail-closed learning-review and session-store skill-signal validation for `skillsig_` IDs, safe bounded text, required evidence/tool/risk arrays, raw-path/secret rejection, and candidate/promotion field rejection.
- Added typed `skill.signal.recorded` runtime events and emit them from completed-task learning review creation after the learning review artifact path is known.
- Expanded learning review signal collection from passed validation, recovery events, task steering corrections, and audited non-loaded skill usage; `loaded` alone remains non-signal evidence.
- Preserved candidate/promotion boundary: no `skill.candidate.created`, no promoted skill file writes, no skill registry/listing/invocation changes, and procedural outputs remain `candidate` + `not_promoted`.
- Review fixes now validate raw `skillSignals` before normalization so forbidden fields such as `candidateId`, `rawSkillContent`, stdout/stderr, diffs, patches, raw paths, secrets, or unbounded text cannot be silently stripped into safe-looking artifacts.
- Added explicit runtime `signalStatus: "signal_only"` separate from event `status: "recorded"` and bounded emitted signal summaries before event validation.
- Retrospective skill signals now use the same rich, validated signal shape as learning reviews instead of retaining a minimal legacy shape.
- Remaining limitation: repeated/multiple evidence is deduplicated and bounded, but confidence is intentionally conservative (`low`) until a later story defines deterministic medium/high aggregation policy.

### File List

- `_bmad-output/implementation-artifacts/5-4-record-skill-signals-from-repeated-workflows.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/memory/src/index.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/storage/src/session-store.ts`
- `tests/memory-safety.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-store.test.ts`

### Change Log

- 2026-05-10: Created Story 5.4 context with implementation guardrails, event contract recommendation, safety boundaries, and test expectations.
- 2026-05-10: Implemented signal-only skill signal artifact contract, runtime event validation/emission, learning-review signal collection, storage hardening, and regression coverage; moved story to review after full validation.
- 2026-05-10: Fixed heavy-review findings for fail-closed raw signal inputs, explicit signal-only event status, bounded summaries/arrays, retrospective parity, and missing ignored/contradicted/order regressions; moved story to done after full validation.

### Validation Evidence

- `rtk run 'npm run build --silent && npx vitest run tests/memory-safety.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-store.test.ts'` — 4 files passed, 150 tests passed.
- `rtk run 'npm test -- --run'` — 17 files passed, 301 tests passed.
- `rtk run 'npm run typecheck -- --pretty false'` — TypeScript build and tests typecheck passed.
- `rtk run 'git diff --check'` — passed.
- `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` — indexed successfully, status up-to-date.
