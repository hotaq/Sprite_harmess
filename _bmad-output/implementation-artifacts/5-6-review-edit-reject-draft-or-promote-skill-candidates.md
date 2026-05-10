# Story 5.6: Review, Edit, Reject, Draft, or Promote Skill Candidates

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to control the skill candidate lifecycle,
so that new procedural behavior is trusted before it becomes active.

## Acceptance Criteria

1. Given skill candidates exist, when the user reviews them, then each candidate shows trigger reason, supporting evidence, intended activation, workflow steps, required tools, risks, examples, counterexamples, confidence, and lifecycle state using bounded safe metadata only.
2. Given the user edits a skill candidate, when the edited candidate is saved, then the system reruns the same safety, boundedness, evidence, path, secret, and raw-content validation before persisting any lifecycle change.
3. Given the user rejects a skill candidate, when rejection is confirmed, then the candidate lifecycle is updated, a bounded rejection reason is retained for future learning, no active skill is created, and the decision is auditable.
4. Given the user saves a skill candidate as draft, when the draft action is confirmed, then the candidate remains separate from active skills, keeps all source evidence, and can be reviewed again later without affecting task behavior.
5. Given the user promotes a skill candidate, when promotion is explicitly confirmed, then a promoted skill is stored in the appropriate manual skill registry, the candidate remains auditable with promotion timestamp and source evidence, and active skill creation happens only after the candidate and emitted audit metadata pass validation.
6. Given candidate review events or artifacts are validated, when raw tool output, stdout/stderr, diffs, patches, raw skill content, raw filesystem paths, secrets, credentials, activation grants, autonomous routing rules, or unbounded content are present, then validation rejects them fail-closed before any unsafe persistence or event emission.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-6)
  - [x] Report exact functions/contracts to add or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `validateRuntimeEvent`, `AgentRuntime`, `LocalSkillCandidateStore`, `validateSkillCandidate`, `listAvailableSkills`, and `invokeManualSkill`.
  - [x] Treat this as a trust-boundary story: review/edit/reject/draft/promote must be explicit user-controlled actions, not autonomous routing.
  - [x] Keep candidate data untrusted until validated by the shared candidate contract and runtime event validators.

- [x] Extend skill candidate lifecycle contracts safely (AC: 1-6)
  - [x] Extend the shared candidate lifecycle beyond `proposed` to support at least `draft`, `rejected`, and `promoted`.
  - [x] Add a review action union for `edit`, `reject`, `draft`, and `promote`.
  - [x] Add safe review metadata such as `reviewedAt`, `reviewedBy`, `reviewReason`, `rejectionReason`, `draftSavedAt`, `promotedAt`, and a bounded `promotedSkillReference` or `promotedSkillId`.
  - [x] Do not use raw path fields such as `promotedSkillPath`, `skillPath`, or `candidatePath`; Story 5.5 explicitly forbids those names. If promotion needs a location reference, use a validated project/global registry reference and bounded project-relative metadata.
  - [x] Preserve all source evidence fields from Story 5.5: source skill signal IDs, source event IDs, source session IDs, source task IDs, source correlation IDs, supporting evidence, confidence, known risks, examples, and counterexamples.

- [x] Add pure candidate review helpers in `packages/skills` (AC: 1-6)
  - [x] Add `summarizeSkillCandidateForReview()` or equivalent to produce bounded review views without raw candidate body leakage.
  - [x] Add `reviewSkillCandidate()` or equivalent pure helper to apply edit/reject/draft/promote decisions to a candidate model.
  - [x] On edit, rerun `validateSkillCandidate()` after applying changes and reject raw paths, secrets, unbounded strings/arrays, raw output fields, activation grants, and unsafe promotion metadata.
  - [x] On reject, require a bounded safe rejection reason and ensure no promoted skill data is created.
  - [x] On draft, keep the candidate inert and reviewable.
  - [x] On promote, require an explicit confirmation flag and a safe target registry reference before any active skill artifact is written by runtime/storage orchestration.

- [x] Extend candidate storage APIs in `packages/storage` (AC: 1-6)
  - [x] Extend `LocalSkillCandidateStore` with safe atomic update support for existing candidate artifacts.
  - [x] Preserve path-boundary checks under `.sprite/skill-candidates/<candidate-id>.json`.
  - [x] Prevent duplicate or out-of-order lifecycle transitions, for example rejected candidates must not promote without a new explicit edit/review path.
  - [x] Keep candidate updates atomic with temp-file + rename.
  - [x] If promotion writes a manual skill artifact, use a dedicated storage/runtime helper and validate the target stays under the selected registry root before writing.
  - [x] Do not let CLI/TUI/RPC callers provide arbitrary filesystem paths for candidate or promoted skill artifacts.

- [x] Add runtime review orchestration in `packages/core` (AC: 1-6)
  - [x] Add `AgentRuntime.listSkillCandidates()` and `AgentRuntime.openSkillCandidate()` or equivalent safe read APIs.
  - [x] Add `AgentRuntime.reviewSkillCandidate()` or equivalent for `edit`, `reject`, `draft`, and `promote`.
  - [x] Keep adapters thin: CLI/TUI/RPC must call runtime/storage APIs and must not parse or mutate candidate files directly.
  - [x] Preserve audit ordering: validate request, validate candidate state, apply storage side effects, then emit runtime event; if promotion skill write fails, do not mark the candidate as promoted.
  - [x] Ensure resumed sessions do not replay review actions, duplicate promoted skill files, or re-emit review events.
  - [x] Promotion must not grant sandbox, command, file-edit, policy, or automatic activation authority beyond becoming a normal manual skill after explicit user-controlled promotion.

- [x] Add runtime event contract for candidate review decisions (AC: 1-6)
  - [x] Add one stable event type, preferably `skill.candidate.reviewed`, unless implementation evidence proves separate events safer.
  - [x] Event payload should include candidate ID, action, lifecycle status, source skill signal IDs, source session/task/event IDs, confidence, candidate artifact reference, optional promoted skill reference, bounded review reason, status, and summary.
  - [x] Event payload must not include raw skill content, full SKILL.md body, raw output, stdout/stderr, diffs, patches, secrets, credentials, activation grants, autonomous routing rules, or unbounded before/after edit data.
  - [x] Validator must enforce action/lifecycle consistency, for example `reject -> rejected`, `draft -> draft`, and `promote -> promoted`.
  - [x] Validator must reject promotion metadata unless the action is `promote`.

- [x] Add minimal user-facing review surface (AC: 1-5)
  - [x] Prefer a thin CLI surface if no existing interface satisfies list/open/review: for example `sprite skills candidates list|show|review`.
  - [x] Support safe text output and JSON output for list/open/review actions.
  - [x] For promotion, require explicit confirmation and target registry selection or safe default to the project registry.
  - [x] Do not add rich TUI, RPC protocol expansion, MemPalace integration, vector search, or autonomous candidate selection unless strictly required by existing architecture.

- [x] Preserve Story 5.7 boundaries while enabling Story 5.6 promotion (AC: 4-6)
  - [x] Candidates must remain outside active registry scans until promotion completes.
  - [x] Draft and rejected candidates must never influence task context or skill routing.
  - [x] Promoted skills become active only through existing manual skill registry behavior after a safe `SKILL.md` artifact is written.
  - [x] Do not implement automatic task-context loading from candidates; Story 5.7 owns the broader separation and runtime influence guarantees.

- [x] Add regression tests (AC: 1-6)
  - [x] Skills tests: review view includes trigger reason, evidence, activation conditions, workflow steps, required tools, risks, examples, counterexamples, confidence, and lifecycle state.
  - [x] Skills tests: edit reruns safety validation and rejects secrets, raw paths, raw output fields, activation/routing fields, and unbounded content.
  - [x] Skills tests: reject and draft produce expected lifecycle metadata and preserve source evidence.
  - [x] Storage tests: candidate read/update is atomic, path-safe, duplicate-safe, and rejects unsafe serialized artifacts.
  - [x] Runtime event tests: valid `skill.candidate.reviewed`; reject raw fields, secret-like values, invalid IDs, invalid action/lifecycle combinations, promotion metadata on non-promotion actions, and unbounded arrays.
  - [x] Runtime tests: list/open candidate views are safe; reject creates no active skill; draft stays inert; edit blocks unsafe content; promote writes exactly one active manual skill and emits one review event after persistence succeeds.
  - [x] Registry tests: promoted skills are listed/invokable through existing manual registry; unpromoted, draft, and rejected candidates are not listed/invokable.
  - [x] Session/resume tests: candidate review side effects are not replayed on resume.
  - [x] CLI smoke tests if CLI commands are added.

- [x] Update story evidence and lifecycle status (AC: 1-6)
  - [x] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [x] Record changed files, validation evidence, GitNexus impact/detect fallback, and remaining transaction limitations in this story file.
  - [x] Run targeted validation before review: skill candidates, skill candidate storage, runtime-events, runtime-loop/session persistence, skill registry, and CLI smoke tests if CLI is touched.
  - [x] Run full validation before marking done: `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if the CLI lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.6 turns Story 5.5 inert skill candidate artifacts into a human-controlled lifecycle. It is the trust boundary between "the runtime has evidence for a reusable workflow" and "the user approved an active procedural skill."

Implement this slice:

- Safe candidate list/open/review views.
- Explicit edit, reject, draft, and promote decisions.
- Candidate artifact lifecycle updates.
- Promotion to a manual skill registry only after explicit confirmation.
- Runtime audit event for each lifecycle decision.
- Regression tests proving unsafe edits/promotions fail closed and unpromoted candidates remain inert.

Do not implement in this story:

- Autonomous skill selection.
- Automatic task-context loading from candidates.
- Rich TUI review workflow unless a minimal CLI/runtime surface is insufficient.
- Cross-session candidate scoring or retrieval.
- MemPalace/GitNexus-backed skill curation.
- Policy/sandbox/file-edit grants based on a candidate.
- General cross-file transaction infrastructure beyond the targeted candidate + promoted skill write ordering needed here.

### Source Requirements

- Story 5.6 requires users to review candidates showing trigger reason, evidence, intended activation, workflow steps, required tools, risks, examples, and lifecycle state; users can edit, reject, save as draft, or promote. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.6]
- Story 5.6 requires promoted candidates to be stored in the appropriate skill registry while the candidate remains auditable with promotion timestamp and source evidence. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.6]
- FR57 requires users to review, edit, reject, save as draft, or promote a skill candidate. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR59 requires the system to keep skill candidates separate from promoted skills. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- The PRD states skill evolution drift is mitigated by trigger reasons and user approval before promotion. [Source: `_bmad-output/planning-artifacts/prd.md` Risks]
- Architecture says skill candidates are draft artifacts, not active behavior; user approval is required before skill promotion; promoted skills must include trigger rules, scope, constraints, and examples; rejected candidates retain rejection reason for future learning. [Source: `_bmad-output/planning-artifacts/architecture.md` Skill Evolution Patterns]
- Architecture ID prefixes include `skillcand_` for skill candidates. [Source: `_bmad-output/planning-artifacts/architecture.md` ID Prefixes]

### Previous Story Intelligence

- Story 5.5 added `packages/shared/src/skill-candidate-contract.ts` as the shared primitive contract surface for candidate schema version, lifecycle values, confidence values, skipped reasons, source outcomes/statuses, ID regexes, safe text bounds, raw path detection, and forbidden candidate fields. Extend this rather than duplicating constants in runtime/storage/skills.
- Story 5.5 added `packages/skills/src/skill-candidates.ts` with `SkillCandidate`, `validateSkillCandidate()`, candidate event summaries, deterministic generation, and fail-closed unsafe signal handling. Reuse this model and validator for lifecycle edits.
- Story 5.5 added `packages/storage/src/skill-candidate-store.ts` with `LocalSkillCandidateStore`, safe path resolution, atomic candidate writes, reads, listing, duplicate rejection, and artifact validation. Extend it with update/review operations instead of creating a second store.
- Story 5.5 added `skill.candidate.created` and `skill.candidate.skipped` runtime event validation in `packages/core/src/runtime-events.ts`; add review validation near those functions and reuse shared candidate ID/source validation patterns.
- Story 5.5 wired candidate generation through `AgentRuntime.createLearningReviewForCompletedTask()` as best-effort after learning review and skill signal events are durable. Do not make review/promotion best-effort: user review actions should return explicit success/failure.
- Story 5.5 intentionally kept candidates out of `listAvailableSkills()` and `invokeManualSkill()`; this must remain true for proposed/draft/rejected candidates. Promotion is the only path that may produce an active manual skill artifact.
- Story 4.3 memory candidate review is a useful analogue: pure domain review helper, storage update, runtime API, action/lifecycle consistency in event validation, and tests ensuring unsafe edit/review fields fail before persistence.

### Current Implementation Baseline

- `packages/shared/src/skill-candidate-contract.ts` owns shared candidate primitives and forbidden field sets.
- `packages/skills/src/skill-candidates.ts` owns candidate generation, validation, event summaries, safe text/path checks, and source evidence validation.
- `packages/storage/src/skill-candidate-store.ts` owns `.sprite/skill-candidates/<candidate-id>.json` path resolution, validation, write, list, and read.
- `packages/core/src/agent-runtime.ts` owns learning review integration, candidate side-channel generation, event emission, and existing manual skill invocation boundaries.
- `packages/core/src/runtime-events.ts` validates candidate created/skipped event payloads.
- `packages/skills/src/index.ts` lists and invokes manual project/global skills and intentionally ignores `.sprite/skill-candidates`.
- `tests/skill-candidates.test.ts`, `tests/skill-candidate-store.test.ts`, `tests/runtime-events.test.ts`, `tests/runtime-loop.test.ts`, and `tests/skill-registry.test.ts` are the closest regression surfaces.

### Suggested Contracts and Functions

Review and adjust this list before implementation:

- `SKILL_CANDIDATE_LIFECYCLE_STATUSES` — extend to include `draft`, `rejected`, and `promoted`.
- `SKILL_CANDIDATE_REVIEW_ACTIONS` — add shared action literals for `edit`, `reject`, `draft`, and `promote`.
- `SkillCandidateReviewRequest` — candidate ID, action, bounded reason, optional edited candidate fields, optional target registry, explicit promotion confirmation, reviewer metadata.
- `SkillCandidateReviewResult` — reviewed candidate, action, lifecycle status, optional promoted skill reference, review summary.
- `SkillCandidateReviewView` — bounded list/open representation for humans and JSON output.
- `summarizeSkillCandidateForReview()` — safe candidate review view helper.
- `reviewSkillCandidate()` or `applySkillCandidateReview()` — pure lifecycle/action helper in `packages/skills`.
- `validateSkillCandidateReviewRequest()` — fail-closed review request validation.
- `LocalSkillCandidateStore.updateCandidate()` — atomic candidate lifecycle update.
- `AgentRuntime.listSkillCandidates()` / `AgentRuntime.openSkillCandidate()` — safe runtime read APIs.
- `AgentRuntime.reviewSkillCandidate()` — runtime orchestration for edit/reject/draft/promote.
- `createSkillCandidateReviewedEvent()` or inline event factory.
- `validateSkillCandidateReviewedEvent()` — runtime event validator.

### File Structure Expectations

Likely files to modify:

- `packages/shared/src/skill-candidate-contract.ts`
- `packages/skills/src/skill-candidates.ts`
- `packages/skills/src/index.ts` only if promoted skill write helpers belong beside registry listing/invocation.
- `packages/storage/src/skill-candidate-store.ts`
- `packages/storage/src/index.ts` only if new exports are required.
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/cli/src/index.ts` only if adding a thin user-facing CLI.
- `tests/skill-candidates.test.ts`
- `tests/skill-candidate-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/skill-registry.test.ts`
- `tests/session-persistence.test.ts` if resume/replay behavior is implemented separately from runtime-loop tests.
- `tests/cli-smoke.test.ts` if CLI is touched.

Avoid:

- Creating a new candidate storage root outside `.sprite/skill-candidates`.
- Letting adapters parse or mutate candidate JSON directly.
- Using unsafe field names already forbidden by Story 5.5, especially `rawSkillContent`, `promotedSkillPath`, `skillPath`, `candidatePath`, `activationRule`, and `routingRule`.
- Writing global user skill files without explicit target and confirmation.
- Marking a candidate as promoted before the promoted skill artifact write succeeds.
- Emitting audit events before storage side effects succeed.

### Testing Requirements

- Use Vitest and existing temp-project patterns.
- For storage tests, create temp projects under `tmpdir()` and clean with `rmSync(..., { recursive: true, force: true })`.
- For runtime tests, use `AgentRuntime` and submit an interactive task before review actions when event/session context is required.
- For event tests, use `createRuntimeEventRecord()` and `validateRuntimeEvent()` like existing candidate and memory event tests.
- For registry tests, assert proposed/draft/rejected candidates are absent from manual skill listing and invocation; assert promoted skill appears only after promotion.
- Every test touching unsafe text must assert serialized artifacts/events do not contain raw secrets, raw command output, raw paths, or SKILL.md body content.

### Project Structure Notes

- This story extends Epic 5 skill evolution. It should reuse the current TypeScript monorepo package boundaries: shared constants in `packages/shared`, domain logic in `packages/skills`, storage in `packages/storage`, runtime orchestration/events in `packages/core`, and thin CLI adapters only when necessary.
- No new dependencies are required.
- The project uses Node `>=22`, TypeScript project references, and Vitest.
- Runtime events are the audit spine; candidate review/promotion decisions should be reconstructable from event history plus candidate artifacts.

### Open Questions for Implementation

- Should MVP promotion target only the project registry `.sprite/skills`, or should it expose an explicit `project | global` target? Safer default: project only unless implementation evidence shows global support is already required.
- Should the promoted `SKILL.md` body be generated directly from candidate fields in Story 5.6, or should Story 5.6 save a draft and leave richer skill-authoring to a later story? The acceptance criteria require promotion, so at minimum generate a bounded, review-derived SKILL.md with trigger reason, scope, constraints, examples, and source evidence summary.
- Should edited candidates retain previous versions? If no versioning exists, preserve a bounded review reason and source evidence; do not implement a general version-history store unless needed to satisfy auditability.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Story created after Story 5.5 final review passed.
- Context loaded from `_bmad/bmm/config.yaml`, `sprint-status.yaml`, Epic 5 planning, PRD FR57/FR59, architecture skill evolution patterns, Story 5.5 completion notes, and analogous Story 4.3 memory candidate review patterns.
- Development started 2026-05-10; project context file was not present, so Story 5.6 Dev Notes and AGENTS.md are the active implementation guide.
- Red-first tests added for domain review helpers, storage updates, runtime event validation, runtime reject/promote flows, CLI candidate list/show/review, and resume replay protection.
- GitNexus impact checked before modifying existing symbols: `validateRuntimeEvent` and `AgentRuntime` were CRITICAL blast-radius surfaces, so implementation stayed additive and preserved prior event semantics; `createProgram` was LOW risk.
- GitNexus detect fallback completed via `npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status` because local GitNexus CLI exposes analyze/status but not a detect-changes subcommand.

### Completion Notes List

- Created ready-for-dev story context for Story 5.6.
- Scoped lifecycle review actions as explicit user-controlled trust-boundary operations.
- Preserved Story 5.5 candidate-proposal boundary and Story 5.7 separation boundary.
- Identified core implementation surfaces, tests, and unsafe field pitfalls before development.
- Extended shared skill candidate contract with draft/rejected/promoted lifecycle states, review actions, project promotion target, and safe review metadata.
- Added pure candidate review domain helpers: safe review views, edit/draft/reject/promote lifecycle transitions, post-edit validation, terminal-state blocking, explicit promotion confirmation, and bounded promoted manual-skill manifest generation.
- Added candidate store update support with existing `.sprite/skill-candidates/<id>.json` path safety and temp-file rename behavior.
- Added runtime list/open/review APIs, project-registry promotion writer, `skill.candidate.reviewed` audit event, action/lifecycle validator, and resume replay regression coverage.
- Added thin CLI surface: `sprite skills candidates list|show|review`, with text/JSON output and required `--session` for audited review actions.
- Closed heavy review findings by rejecting symlinked promotion/storage directories, tightening candidate lifecycle metadata invariants, requiring created events to stay `proposed`, exposing bounded CLI edit flags, and adding promoted skill trigger/examples/source-evidence sections.

### File List

- `_bmad-output/implementation-artifacts/5-6-review-edit-reject-draft-or-promote-skill-candidates.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/skill-candidate-contract.ts`
- `packages/skills/src/skill-candidates.ts`
- `packages/storage/src/skill-candidate-store.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/cli/src/index.ts`
- `tests/skill-candidates.test.ts`
- `tests/skill-candidate-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/skill-registry.test.ts`
- `tests/cli-smoke.test.ts`

### Change Log

- 2026-05-10: Created ready-for-dev Story 5.6 context for review/edit/reject/draft/promote lifecycle.
- 2026-05-10: Started Story 5.6 development.
- 2026-05-10: Implemented skill candidate review lifecycle, promotion to project manual registry, audit event validation, CLI review surface, and regression tests; moved story to review after validation.
- 2026-05-10: Fixed review blockers around symlink path safety, lifecycle/event invariants, CLI edit reachability, and promoted skill evidence content; moved story to done after full validation.

### Validation Evidence

- Red tests initially failed as expected for missing `reviewSkillCandidate`, `updateCandidate`, `skill.candidate.reviewed`, and runtime candidate review APIs.
- Targeted after core implementation: `rtk run 'npm test -- --run tests/skill-candidates.test.ts tests/skill-candidate-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts'` — 4 files passed, 127 tests passed.
- Targeted after CLI implementation: `rtk run 'npm test -- --run tests/cli-smoke.test.ts tests/skill-candidates.test.ts tests/skill-candidate-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts'` — 5 files passed, 158 tests passed.
- Targeted resume/CLI rerun: `rtk run 'npm run typecheck -- --pretty false && npm test -- --run tests/runtime-loop.test.ts tests/cli-smoke.test.ts'` — 2 files passed, 68 tests passed.
- Full validation: `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'` — 19 files passed, 323 tests passed.
- GitNexus fallback detect: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` — repository indexed successfully, current commit `b808a55`, status up-to-date.
- Review-fix targeted validation: `rtk run 'npm test -- --run tests/skill-candidates.test.ts tests/skill-candidate-store.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/cli-smoke.test.ts tests/skill-registry.test.ts'` — 6 files passed, 174 tests passed.
- Review-fix full validation: `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'` — 19 files passed, 327 tests passed.

### Remaining Risks / Follow-ups

- MVP promotion target is project registry only (`.sprite/skills`); global promotion remains intentionally unsupported until explicitly required.
- Promotion writer prevalidates the review event and rolls back the promoted skill file if candidate update fails, but it does not introduce a general cross-file transaction layer for every possible event-store failure after candidate update.
- CLI review requires `--session <sessionId>` because review events need runtime audit context; list/show work without a session.
- Story 5.7 still owns broader candidate/active-skill separation and task-context influence guarantees beyond direct manual promotion.
