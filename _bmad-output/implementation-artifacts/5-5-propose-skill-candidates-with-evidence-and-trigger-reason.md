# Story 5.5: Propose Skill Candidates with Evidence and Trigger Reason

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to propose skill candidates from strong workflow evidence,
so that repeated procedures can become reusable drafts.

## Acceptance Criteria

1. Given enough skill signals or explicit user correction evidence exists, when the skill candidate generator runs, then it creates a candidate with safe candidate ID, name, intended activation conditions, trigger reason, workflow steps, required tools, supporting evidence, examples, counterexamples, known risks, confidence, and lifecycle state.
2. Given a candidate is created, when runtime history, session artifacts, or audit output are inspected, then a typed `skill.candidate.created` event exists and references only bounded safe metadata, source skill signals, source sessions/tasks/events, and the stored candidate artifact path.
3. Given insufficient evidence exists, when candidate generation runs, then no candidate artifact is created and the system records a bounded safe reason explaining why the signal evidence was not advanced to a candidate.
4. Given a candidate is only a proposal, when skills are listed, invoked, or loaded into task context, then the candidate is not treated as an active skill, cannot influence task behavior, and cannot become a promoted skill in this story.
5. Given candidate data is derived from skill signals and learning reviews, when validation or storage runs, then raw tool output, stdout/stderr, diffs, patches, raw skill content, raw filesystem paths, secrets, credentials, activation grants, or unbounded content are rejected fail-closed.

## Tasks / Subtasks

- [ ] Confirm implementation function list before code edits (AC: 1-5)
  - [ ] Report exact functions/contracts to add or modify before touching implementation files.
  - [ ] Run GitNexus impact analysis before editing existing symbols, especially `validateRuntimeEvent`, `AgentRuntime.createLearningReviewForCompletedTask()`, `collectLearningReviewSkillSignals()`, `generateLearningReview()`, session-store artifact writers, and skill registry listing/invocation code.
  - [ ] Keep this story candidate-proposal-only: no edit/reject/draft/promote lifecycle, no active skill file writes, no `.sprite/skills/<name>/SKILL.md` writes, no autonomous routing, and no policy grants.
  - [ ] Preserve Story 5.4 boundary: only `skillSignals` with `signalStatus: "signal_only"` may feed candidate generation; never consume raw skill content or raw tool output.

- [ ] Define the safe skill candidate domain contract (AC: 1, 4-5)
  - [ ] Add skill candidate schema version and lifecycle/status constants, initially `proposed` only.
  - [ ] Add `SkillCandidate` with `candidateId`, `name`, `summary`, `triggerReason`, `intendedActivationConditions`, `workflowSteps`, `requiredTools`, `supportingEvidence`, `examples`, `counterexamples`, `knownRisks`, `confidence`, `lifecycleStatus`, `createdAt`, and source session/task/correlation metadata.
  - [ ] Use ID prefix `skillcand_`; reject invalid IDs or unsafe names.
  - [ ] Keep candidate text and arrays bounded deterministically.
  - [ ] Add `validateSkillCandidate()` and reject forbidden fields such as `rawSkillContent`, `promotedSkillPath`, `activationRule`, `routingRule`, `stdout`, `stderr`, `diff`, `patch`, `secret`, and `token`.

- [ ] Define deterministic candidate generation from skill signals (AC: 1, 3, 5)
  - [ ] Add `SkillCandidateGenerationRequest` that consumes safe `LearningReviewSkillSignal[]`, learning review/session context, and optional existing candidate summaries for dedupe.
  - [ ] Add `generateSkillCandidatesFromSignals()` or equivalent in the skills domain.
  - [ ] Treat evidence as sufficient only when either:
    - [ ] two or more compatible skill signals share a normalized workflow identity, or
    - [ ] one explicit correction/recovery signal has strong supporting evidence, for example `corrected_workflow`/`recovered_workflow`, multiple evidence event IDs, and a non-empty tool sequence.
  - [ ] Do not create candidates from `loaded` skill usage alone, low-information single successful validation signals, unsafe signals, or signals lacking source session/task/correlation IDs.
  - [ ] Record skipped signal groups with reason codes such as `insufficient_evidence`, `unsafe_signal`, `conflicting_evidence`, `duplicate_candidate`, or `unsupported_signal_status`.
  - [ ] Keep confidence conservative; do not produce `high` confidence in this story unless the implementation has explicit deterministic multi-session evidence.

- [ ] Add runtime event contracts for candidate creation and skipped generation (AC: 2-3, 5)
  - [ ] Add `skill.candidate.created` to `RUNTIME_EVENT_TYPES`.
  - [ ] Add typed payload with `candidateId`, `name`, `lifecycleStatus: "proposed"`, `candidateArtifactPath`, `sourceSkillSignalIds`, `sourceSessionIds`, `sourceTaskIds`, `sourceEventIds`, `triggerReason`, `intendedActivationSummary`, `workflowStepCount`, `requiredTools`, `confidence`, `knownRisks`, `status: "created"`, and `summary`.
  - [ ] Add a bounded no-artifact record for skipped generation. Prefer a typed `skill.candidate.skipped` event unless implementation evidence shows a better existing audit surface.
  - [ ] Validate candidate artifact paths as project-relative safe paths.
  - [ ] Reject raw paths, secrets, raw output fields, candidate promotion fields, and unbounded strings/arrays.

- [ ] Persist candidate artifacts separately from promoted/manual skills (AC: 2, 4-5)
  - [ ] Store project skill candidate artifacts under a candidate-only location such as `.sprite/skill-candidates/<candidate-id>.json`.
  - [ ] Do not place candidates under `.sprite/skills`, `~/.sprite/skills`, `.codex/skills`, or `.agents/skills`.
  - [ ] Add storage helpers for candidate path resolution, safe writes, reads if needed by tests, and validation before write.
  - [ ] Use atomic writes like existing session artifacts.
  - [ ] Ensure candidate artifacts are not scanned by `listAvailableSkills()` and cannot be invoked by `invokeManualSkill()`.

- [ ] Wire candidate generation through the shared runtime boundary (AC: 1-4)
  - [ ] Add a focused runtime method such as `AgentRuntime.createSkillCandidatesForCompletedTask()` or integrate candidate generation after learning review creation.
  - [ ] Run candidate generation only after the learning review artifact and `skill.signal.recorded` events exist.
  - [ ] Emit `skill.candidate.created` after the candidate artifact path is known.
  - [ ] Emit skipped-generation audit records when candidate generation runs but evidence is insufficient.
  - [ ] Preserve idempotency: if a candidate already exists for the same normalized evidence group, do not duplicate artifacts or events.
  - [ ] Keep adapters thin; CLI/print/TUI/RPC should consume shared runtime events and artifacts, not duplicate candidate generation logic.

- [ ] Preserve later Epic 5 boundaries (AC: 4)
  - [ ] Do not implement review/edit/reject/draft/promote actions; Story 5.6 owns lifecycle transitions.
  - [ ] Do not implement candidate-active-skill separation behavior beyond this story's direct scope guards; Story 5.7 owns the full separation story.
  - [ ] Do not write promoted `SKILL.md` files.
  - [ ] Do not add automatic skill selection or task-context loading from candidates.
  - [ ] Do not grant sandbox, command, file-edit, or policy authority based on a candidate.

- [ ] Add regression tests (AC: 1-5)
  - [ ] Skills tests: candidate generation creates a proposed candidate from repeated compatible safe signals.
  - [ ] Skills tests: explicit correction/recovery signal with strong support can produce a proposed candidate.
  - [ ] Skills tests: insufficient single weak signal creates no candidate and records a skipped reason.
  - [ ] Skills tests: unsafe raw fields, secrets, raw paths, stdout/stderr, diffs, patches, raw skill content, and unbounded values are rejected.
  - [ ] Runtime event tests: `skill.candidate.created` accepts a safe payload and rejects invalid IDs, missing evidence, raw paths, secrets, raw output fields, promotion fields, and unbounded content.
  - [ ] Runtime/session tests: completed tasks with enough skill signal evidence emit `skill.candidate.created` and write a candidate artifact.
  - [ ] Runtime/session tests: insufficient evidence emits or records a skipped reason without writing a candidate artifact.
  - [ ] Storage tests: candidate artifacts are validated before write and stored separately from active skill registries.
  - [ ] Skill registry tests: candidates are not listed as available skills and cannot be invoked manually.
  - [ ] Scope guard tests: no `SKILL.md` is written, no promoted skill appears, and no candidate influences task context.

- [ ] Update story evidence and lifecycle status (AC: 1-5)
  - [ ] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [ ] Record implementation notes, changed files, validation evidence, GitNexus impact/detect fallback, and remaining limitations in this story file.
  - [ ] Run targeted validation before review: skill candidate tests, runtime-events tests, runtime-loop tests, session-store tests, skill-registry tests.
  - [ ] Run full validation before marking done: `rtk run 'npm run typecheck -- --pretty false && npm test -- --run && git diff --check'`.
  - [ ] Run GitNexus detect-changes before committing implementation changes when available; if the CLI lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.5 is the bridge between signal capture and human-controlled skill evolution.

Story 5.4 intentionally stopped at `skill.signal.recorded`: safe evidence only, no candidate, no promotion, no registry changes. Story 5.5 may now advance strong signal groups into **proposed skill candidates**, but candidates are still inert drafts. They must be stored separately, audited, and blocked from task behavior until later review/promotion stories.

The central question this story answers is:

> "Do we have enough safe evidence to propose a reusable workflow draft?"

It must not answer:

> "Should this workflow become an active skill?"

That belongs to Stories 5.6 and 5.7.

### Source Requirements

- Story 5.5 requires proposing skill candidates from strong workflow evidence with name, intended activation conditions, trigger reason, workflow steps, required tools, supporting evidence, examples, counterexamples, known risks, lifecycle state, and `skill.candidate.created`. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.5]
- Story 5.5 requires insufficient evidence to create no candidate and record why the signal was not advanced to candidate. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.5]
- FR41 says procedural memory may be stored through skills and skill candidates. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR56 says the agent can propose a skill candidate with a stated trigger reason. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR57 and FR59 are adjacent but not owned here: review/edit/reject/draft/promote and separation from promoted skills must be preserved but not fully implemented in this story. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- NFR27 requires skill candidates to include trigger reason, supporting evidence, intended activation conditions, and current lifecycle state. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR50 requires deterministic fixtures for at least one repeated-workflow skill candidate scenario. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture defines a Skill Candidate as a proposed reusable workflow with trigger reason, supporting evidence, activation conditions, required tools, risks, and lifecycle state. [Source: `_bmad-output/planning-artifacts/architecture.md` Domain Model]
- Architecture states skill signals can aggregate into skill candidates, candidates are draft artifacts, and user approval is required before promotion. [Source: `_bmad-output/planning-artifacts/architecture.md` Skill Evolution Patterns]
- Architecture requires runtime events to be the spine for audit, replay, UI, RPC, learning, and tests. [Source: `_bmad-output/planning-artifacts/architecture.md` Event Stream Architecture]
- Architecture requires candidate storage to remain local-first and auditable, and warns that risky command execution, broad edits, memory saves, skill promotion, and scoped RPC actions go through policy/approval. [Source: `_bmad-output/planning-artifacts/architecture.md` Policy and Storage Patterns]

### Current Implementation Baseline

- `packages/memory/src/index.ts` currently owns learning review contracts:
  - `LearningReviewSkillSignal`
  - `SkillSignalOutcome`
  - `SkillSignalLifecycleStatus`
  - `validateLearningReviewSkillSignal()`
  - `generateLearningReview()`
  - retrospective skill signal validation parity
- `packages/core/src/runtime-events.ts` currently validates:
  - `skill.invoked`
  - `skill.usage.recorded`
  - `skill.signal.recorded`
  - `learning.review.created`
  - `retrospective.review.created`
- `packages/core/src/agent-runtime.ts` currently:
  - creates learning reviews for non-trivial completed tasks
  - writes learning review artifacts
  - emits one `skill.signal.recorded` event per learning-review skill signal
  - emits `learning.review.created`
  - does not emit `skill.candidate.created`
- `packages/storage/src/session-store.ts` currently:
  - stores sessions, learning reviews, retrospectives, and compactions
  - validates stored learning review skill signals fail-closed
  - does not yet store skill candidate artifacts
- `packages/skills/src/index.ts` currently:
  - lists manual project/global skills from `.sprite/skills` and `~/.sprite/skills`
  - invokes manual skills only
  - does not yet expose skill candidate generation APIs
- `tests/skill-registry.test.ts` already asserts manual skill listing does not create candidate/runtime artifacts.

### Previous Story Intelligence

- Story 5.4 added rich signal-only `LearningReviewSkillSignal` artifacts and `skill.signal.recorded` runtime events.
- Story 5.4 heavy review found and fixed a critical safety issue: raw `skillSignals` must be validated before normalization so forbidden fields are not silently stripped into safe-looking artifacts. Carry that fail-closed pattern into candidate generation.
- Story 5.4 added explicit runtime `signalStatus: "signal_only"` separate from event `status: "recorded"`. Story 5.5 should only consume signal-only signals.
- Story 5.4 kept confidence conservative (`low`) and deferred deterministic medium/high aggregation policy. Story 5.5 may define a minimal deterministic threshold but should stay conservative.
- Story 5.3 established safe `skill.usage.recorded` metadata. Story 5.5 must not consume `loaded` as proof of candidate-worthy workflow evidence.
- Story 5.2 established that manual skill registry roots are `.sprite/skills` and `~/.sprite/skills`. Candidate artifacts must not be placed under those roots in a way that makes them active skills.
- The GitNexus CLI may still lack `detect_changes`; use analyze/status fallback before commits until detect-change parity exists.

### Suggested Contracts and Functions

Before implementation, report and adjust this function list based on direct code inspection:

- `SkillCandidateLifecycleStatus` — initially `proposed` only.
- `SkillCandidateGenerationSkippedReason` — `insufficient_evidence | unsafe_signal | conflicting_evidence | duplicate_candidate | unsupported_signal_status`.
- `SkillCandidateSupportingEvidence` — source signal IDs, source sessions, source tasks, source events, learning review artifact paths.
- `SkillCandidate` — proposed workflow draft artifact.
- `validateSkillCandidate()` — fail-closed candidate artifact validation.
- `generateSkillCandidatesFromSignals()` — deterministic signal-to-candidate generator.
- `normalizeSkillCandidateName()` or similar helper — safe candidate name/ID derivation.
- `summarizeSkillCandidateForEvent()` — safe event payload adapter.
- `validateSkillCandidateCreatedEvent()` — runtime event validator.
- `validateSkillCandidateSkippedEvent()` or equivalent skipped-audit validator.
- `LocalSessionStore.writeSkillCandidate()` or project-level storage helper — atomic candidate artifact write.
- `resolveSkillCandidateArtifactPath()` — safe project-relative candidate path resolver.
- `AgentRuntime.createSkillCandidatesForCompletedTask()` — runtime integration after learning review creation.

### Event Contract Recommendation

Prefer a dedicated candidate creation event instead of overloading `learning.review.created` or `skill.signal.recorded`:

```ts
type SkillCandidateLifecycleStatus = "proposed";

interface SkillCandidateCreatedPayload {
  candidateArtifactPath: string;
  candidateId: string;
  confidence: "low" | "medium";
  intendedActivationSummary: string;
  knownRisks: string[];
  lifecycleStatus: SkillCandidateLifecycleStatus;
  name: string;
  requiredTools: string[];
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  status: "created";
  summary: string;
  triggerReason: string;
  workflowStepCount: number;
}
```

Also prefer a bounded skipped audit record:

```ts
interface SkillCandidateSkippedPayload {
  consideredSignalIds: string[];
  reason: SkillCandidateGenerationSkippedReason;
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceTaskIds: string[];
  status: "skipped";
  summary: string;
}
```

Rationale:

- `skill.signal.recorded` remains the signal evidence event.
- `skill.candidate.created` is the durable proposed-draft audit event.
- Skipped generation is auditable and prevents silent "why didn't it create a candidate?" ambiguity.
- Multiple candidates may be generated from one learning review only if evidence groups are clearly distinct.
- Candidate events should summarize and link; full candidate details belong in the candidate artifact.

### Candidate Artifact Recommendation

```ts
interface SkillCandidate {
  candidateId: string;
  confidence: "low" | "medium";
  counterexamples: string[];
  createdAt: string;
  examples: string[];
  intendedActivationConditions: string[];
  knownRisks: string[];
  lifecycleStatus: "proposed";
  name: string;
  requiredTools: string[];
  schemaVersion: 1;
  sourceCorrelationIds: string[];
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  summary: string;
  triggerReason: string;
  workflowSteps: string[];
}
```

Storage recommendation:

- Project-local: `.sprite/skill-candidates/<candidate-id>.json`
- Not under `.sprite/skills`
- Not under `~/.sprite/skills`
- Not under `.codex/skills` or `.agents/skills`

This avoids accidental listing/invocation by the existing manual skill registry scanner.

### Safety and Authority Rules

- Skill candidates are draft artifacts, not executable skills.
- Candidate creation is not skill promotion.
- Candidate creation must not write `SKILL.md`.
- Candidate creation must not load candidate steps into task context.
- Candidate creation must not alter policy decisions or sandbox permissions.
- Candidate generation must not infer hidden model intent from raw prose.
- Candidate generation must reject or skip unsafe signals rather than redact them into ambiguous candidate evidence.
- Candidate artifacts and events must not include:
  - raw command output
  - stdout or stderr
  - diffs, patches, raw snippets, full file contents
  - raw skill content
  - raw filesystem paths
  - secrets, API keys, private keys, tokens, credentials
  - unbounded model text
  - activation grants, routing rules, promoted skill paths, or active registry paths

### Project Structure Notes

- Put candidate generation domain logic in `packages/skills/src/skill-candidates.ts` if possible, then export from `packages/skills/src/index.ts`.
- Keep runtime event contracts in `packages/core/src/runtime-events.ts`.
- Keep runtime orchestration in `packages/core/src/agent-runtime.ts`.
- Keep artifact path resolution and atomic writes in `packages/storage/src/session-store.ts` or a focused storage module if the existing store becomes too large.
- Keep manual skill listing/invocation behavior unchanged in `packages/skills/src/index.ts` except for exports needed by tests/runtime.
- Prefer new tests:
  - `tests/skill-candidates.test.ts`
  - `tests/runtime-events.test.ts`
  - `tests/runtime-loop.test.ts`
  - `tests/session-store.test.ts`
  - `tests/skill-registry.test.ts`
- Do not add new dependencies.

### Testing Guidance

Minimum targeted validations:

```bash
rtk run 'npm run build --silent && npx vitest run tests/skill-candidates.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/session-store.test.ts tests/skill-registry.test.ts'
rtk run 'npm run typecheck -- --pretty false'
rtk run 'git diff --check'
```

Before done:

```bash
rtk run 'npm test -- --run'
rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'
```

### Open Questions for Implementation

- Should candidate generation run automatically during completed-task learning review creation, or should it be exposed as an explicit runtime method first? The story allows either, but runtime auditability is required.
- Should skipped generation always emit `skill.candidate.skipped`, or only when candidate generation is explicitly invoked? Prefer explicit invocation to avoid noisy events unless implementation evidence says automatic generation is expected after every learning review.
- Should cross-session aggregation wait for Story 5.7 or a later retrieval story? For MVP Story 5.5, deterministic same-learning-review evidence is enough if tests cover it.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Story creation context loaded from `_bmad/bmm/config.yaml`, sprint status, Epic 5 planning, PRD skill candidate requirements, architecture skill evolution patterns, and Story 5.4 completion notes.
- Current branch was synchronized with `origin/main` before story creation.
- Pre-development research inspected current learning review, skill signal, runtime event, storage, memory candidate, and manual skill registry patterns; `omx explore` produced no useful output and the fallback used bounded read-only `rtk run` commands plus GitNexus query.
- GitNexus status was stale during research (`39a51ab` indexed, `66f2d34` current); rerun analyze/status plus symbol impact before implementation edits.
- Follow-up Hermes Agent research cloned `https://github.com/NousResearch/hermes-agent` read-only to `/tmp/hermes-agent-inspect` at commit `d4b26df`, inspected skill manager, skill usage telemetry, curator, and prompt guidance, and did not install Hermes.

### Completion Notes List

- Created ready-for-dev story context for Story 5.5.
- Explicitly scoped candidate generation as proposed-draft only, with no review/edit/reject/draft/promote implementation and no active skill writes.
- Recommended `.sprite/skill-candidates/<candidate-id>.json` to keep candidates away from manual skill registry roots.
- Added implementation guardrails for fail-closed raw signal validation, evidence thresholds, skipped generation audit, and candidate/active-skill separation.
- Completed pre-development research and recommended a candidate-only pipeline: `packages/skills/src/skill-candidates.ts`, focused storage helper under `.sprite/skill-candidates`, runtime candidate created/skipped events, and gated generation after learning review creation.
- Incorporated Hermes Agent lessons: active skill writes and skill curation should remain later-story behavior; Story 5.5 should only produce reviewable candidate artifacts plus audit events.

### File List

- `_bmad-output/implementation-artifacts/5-5-propose-skill-candidates-with-evidence-and-trigger-reason.md`
- `_bmad-output/implementation-artifacts/5-5-skill-candidate-research.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-10: Created ready-for-dev Story 5.5 context for proposed skill candidates with evidence, trigger reason, storage/event boundaries, and safety guardrails.
- 2026-05-10: Added pre-development research artifact for skill candidate proposal design, storage separation, event contracts, and implementation stop conditions.
- 2026-05-10: Added Hermes Agent follow-up research and updated design implications for candidate-before-active-skill separation.

### Validation Evidence

- Story creation and pre-development research only; implementation validation not run yet.
