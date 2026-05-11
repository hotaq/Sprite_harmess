# Story 5.7: Keep Skill Candidates Separate from Promoted Skills

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want skill candidates to stay separate from active skills,
so that proposed behavior cannot silently change future tasks.

## Acceptance Criteria

1. Given skill candidate artifacts exist under `.sprite/skill-candidates`, when the runtime or registry loads available skills, then those candidates are not treated as active manual skills and cannot be invoked by candidate name, candidate ID, or source-qualified skill reference.
2. Given a task starts with manual skill references configured, when a reference only matches a proposed/draft/rejected skill candidate, then task context contains no candidate guidance, emits no `skill.invoked` event for that candidate, and records only a safe failed manual-skill load if applicable.
3. Given a candidate is rejected or saved as draft, when future tasks run, then the candidate does not activate, does not appear in the skills context packet, and does not create `skill.usage.recorded` influence as `loaded` or `used`.
4. Given a rejected or draft candidate remains in storage, when the user or learning analysis opens/list candidates explicitly, then bounded review metadata, reason, lifecycle state, and source evidence remain available without exposing raw output, raw skill content, raw filesystem paths, secrets, activation grants, or routing rules.
5. Given a candidate is explicitly promoted through Story 5.6 review flow, when future tasks list/invoke skills, then only the promoted manual `SKILL.md` artifact is active and the original candidate artifact remains excluded from registry scans and task context by candidate ID.
6. Given validation or regression tests inspect candidate/skill separation, then they prove the separation across registry listing, manual invocation, task context assembly, skill usage influence, runtime candidate review APIs, and session resume.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-6)
  - [x] Report exact functions/contracts to inspect or modify before touching implementation files.
  - [x] Run GitNexus impact analysis before editing existing symbols, especially `listAvailableSkills`, `invokeManualSkill`, `AgentRuntime.loadManualSkillContextEntries`, `createTaskRequest`, `createRuntimeSelfModelSnapshot`, `createSkillsSection`, `AgentRuntime.recordSkillUsage`, `LocalSkillCandidateStore`, and `validateSkillCandidate`.
  - [x] Treat this as a separation/influence guardrail story: preferred implementation is regression tests plus minimal code hardening, not new feature surface.
  - [x] Preserve Story 5.6 explicit promotion flow; do not add a second promotion path.

- [x] Lock registry and invocation separation (AC: 1, 5)
  - [x] Extend registry tests to cover proposed, draft, rejected, and promoted candidate scenarios.
  - [x] Assert `.sprite/skill-candidates/<candidate-id>.json` is never scanned as a skill registry root or active skill entry.
  - [x] Assert `invokeManualSkill()` fails safely for candidate `name`, `candidateId`, and `project:<candidate-name>` while a matching active promoted `SKILL.md` remains invokable.
  - [x] Assert serialized list/invocation failures do not leak raw candidate body, raw paths, secrets, or forbidden candidate fields.

- [x] Lock task-context separation for future tasks (AC: 2, 3, 5)
  - [x] Add runtime tests where `AgentRuntime` starts with `skillReferences` pointing at candidate names/IDs for proposed, draft, and rejected candidates.
  - [x] Assert task request skills section is skipped or empty: no candidate content, no candidate name in `skillEntries`, no candidate source in runtime self-model, and no procedural guidance from candidate artifacts.
  - [x] Assert failed references emit at most safe `skill.invocation.failed` events and never `skill.invoked` for candidates.
  - [x] Assert promoted skill references load only from `.sprite/skills/<skill>/SKILL.md`, not from candidate artifacts.

- [x] Lock skill influence and usage attribution boundaries (AC: 3, 6)
  - [x] Add tests proving `AgentRuntime.recordSkillUsage()` cannot record `loaded` or `used` influence for a candidate artifact that was never loaded via `skill.invoked`.
  - [x] Assert `ignored` suggestions may mention only bounded safe text if existing API allows suggestions, but must not create active influence or imply candidate activation.
  - [x] Assert final summaries and runtime event histories do not include candidate artifacts as `skillInfluences` unless a real promoted manual skill was invoked.

- [x] Preserve explicit review access for learning analysis (AC: 4)
  - [x] Add runtime/storage tests that rejected and draft candidates remain listable/openable through `AgentRuntime.listSkillCandidates()` and `AgentRuntime.openSkillCandidate()`.
  - [x] Assert review metadata survives: `reviewReason`, `rejectionReason` or `draftSavedAt`, lifecycle state, source event IDs, source session/task IDs, source skill signal IDs, examples/counterexamples, known risks, confidence, and trigger reason.
  - [x] Assert list/open review views remain bounded and free from raw output, raw skill content, raw paths, secrets, activation grants, autonomous routing rules, diffs, and patches.

- [x] Verify resume/replay cannot turn candidates into active skills (AC: 2, 3, 5, 6)
  - [x] Add or extend resume tests where proposed/draft/rejected candidates exist before session resume and task start.
  - [x] Assert resume does not replay candidate review/promotion side effects and does not auto-load candidates into task context.
  - [x] Assert promoted skills remain stable after resume and duplicate promotion or candidate ID invocation still fails safely.

- [x] Keep scope boundaries tight (AC: 1-6)
  - [x] Do not implement autonomous candidate suggestion/loading.
  - [x] Do not add candidate entries to `TASK_CONTEXT_SOURCE_ORDER` or the skills context packet.
  - [x] Do not add TUI, RPC, MemPalace, vector search, cross-session candidate scoring, or global skill promotion.
  - [x] Do not add new dependencies.
  - [x] Prefer deleting/centralizing duplicated guard checks over adding parallel registry/candidate abstractions.

- [x] Run validation and update story status (AC: 1-6)
  - [x] Run targeted tests first: skill registry, skill candidates, skill candidate store, runtime loop/session resume, final summary if touched, and CLI smoke if any CLI output changes.
  - [x] Run full validation before review: `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [x] Run GitNexus detect fallback before commit: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [x] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes pass.

### Review Follow-ups (AI)

- [x] [AI-Review][Medium] Reject ignored/suggested skill usage records that point at skill candidate artifacts.
- [x] [AI-Review][Medium] Assert failed candidate invocation results do not leak raw candidate fields, secrets, routing rules, or candidate paths.
- [x] [AI-Review][Medium] Add candidate content sentinel assertions so candidate procedural guidance cannot enter task context, runtime self-model, failed events, or final summary skill influences.
- [x] [AI-Review][Medium] Strengthen draft/rejected candidate list/open tests for bounded metadata, source evidence, examples, counterexamples, known risks, confidence, and trigger reason.
- [x] [AI-Review][Medium] Cover future-task behavior after resume and after promotion, including `candidateId` and `project:<candidateId>` safe failures while promoted manual skill references still load.
- [x] [AI-Review][Low] Cover source-qualified candidate IDs in direct registry invocation tests.

## Dev Notes

### Story Intent

Story 5.7 is the final Epic 5 separation guardrail. Stories 5.5 and 5.6 already create, review, draft, reject, and promote candidate artifacts. This story must prove that unpromoted candidates remain inert across every path that can affect future task behavior.

The expected implementation may be mostly tests. Only change production code if tests reveal a real leak.

### Source Requirements

- Story 5.7 requires skill candidates to stay separate from active skills so proposed behavior cannot silently change future tasks. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.7]
- A candidate must not influence task behavior unless explicitly loaded for review or promoted. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.7]
- Rejected or draft candidates must not activate in future tasks, while their reason remains available for future learning analysis. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.7]
- FR59 states the system can keep skill candidates separate from promoted skills. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- NFR27 requires skill candidates to include trigger reason, supporting evidence, intended activation conditions, and current lifecycle state. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture says skill candidates are draft artifacts, not active behavior; user approval is required before promotion; rejected candidates retain rejection reason for future learning. [Source: `_bmad-output/planning-artifacts/architecture.md` Skill Evolution Patterns]
- Architecture says skill promotion is separate from candidate creation: `skill.candidate.created` does not imply installed skill behavior. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Events]
- Architecture says memory and skill candidate promotion must use optimistic conflict checks or explicit review state transitions. [Source: `_bmad-output/planning-artifacts/architecture.md` Concurrency and Locking Pattern]

### Previous Story Intelligence

Story 5.6 created the current candidate lifecycle and promotion path:

- Shared candidate primitives live in `packages/shared/src/skill-candidate-contract.ts`.
- Domain logic lives in `packages/skills/src/skill-candidates.ts`, including `validateSkillCandidate()`, `summarizeSkillCandidateForReview()`, and `reviewSkillCandidate()`.
- Candidate storage lives in `packages/storage/src/skill-candidate-store.ts` under `.sprite/skill-candidates/<candidate-id>.json`.
- Runtime APIs live in `packages/core/src/agent-runtime.ts`: `listSkillCandidates()`, `openSkillCandidate()`, and `reviewSkillCandidate()`.
- Candidate review audit event is `skill.candidate.reviewed` in `packages/core/src/runtime-events.ts`.
- Thin CLI surface is `sprite skills candidates list|show|review` in `packages/cli/src/index.ts`.
- Promotion writes a project-local manual skill manifest under `.sprite/skills/<slug>/SKILL.md`; global promotion is intentionally unsupported.
- Review fixes already added symlink protection, lifecycle-specific metadata validation, `skill.candidate.created` proposed-only validation, CLI edit flags, and source-evidence sections in promoted `SKILL.md`.

Important Story 5.6 remaining risk:

- Promotion writer prevalidates the review event and rolls back the promoted skill file if candidate update fails, but it does not introduce a general cross-file transaction layer for every possible event-store failure after candidate update. Do not solve this with a broad transaction framework in Story 5.7 unless a separation leak directly requires it.

### Current Implementation Baseline

- `listAvailableSkills()` and `invokeManualSkill()` scan manual project/global skill registries, not `.sprite/skill-candidates`. [Source: `packages/skills/src/index.ts`]
- `AgentRuntime.loadManualSkillContextEntries()` loads only `this.options.skillReferences` through `invokeSkill()` / manual skill registry APIs. [Source: `packages/core/src/agent-runtime.ts`]
- `createTaskRequest()` receives `skillEntries` and task context assembly builds the skills context from those manual entries only. [Source: `packages/core/src/task-context.ts`]
- `createSkillsSection()` returns a skipped skills section when no manual skills were invoked. [Source: `packages/core/src/task-context.ts`]
- `AgentRuntime.recordSkillUsage()` already requires a matching `skill.invoked` event for non-ignored usage. This is the key guard against candidate-only influence records. [Source: `packages/core/src/agent-runtime.ts`]
- Existing tests cover proposed candidate registry exclusion and Story 5.6 review/promote flows, but Story 5.7 should broaden coverage to draft/rejected candidates, future task context, usage influence, and resume boundaries. [Source: `tests/skill-registry.test.ts`, `tests/runtime-loop.test.ts`]

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `listAvailableSkills()` — ensure only active manual skill roots are scanned.
- `invokeManualSkill()` — ensure candidate names/IDs/source-qualified candidate references fail safely.
- `AgentRuntime.loadManualSkillContextEntries()` — ensure only manual registry results enter task context.
- `createTaskRequest()` / task context assembly — ensure candidates never enter `skillEntries`.
- `createRuntimeSelfModelSnapshot()` — ensure skills loaded/source metadata reflects manual skills only.
- `createSkillsSection()` — ensure candidate artifacts cannot populate procedural guidance.
- `AgentRuntime.recordSkillUsage()` — ensure candidate IDs cannot become `loaded`/`used` influences without `skill.invoked`.
- `AgentRuntime.listSkillCandidates()` / `openSkillCandidate()` — preserve explicit review access for rejected/draft candidates.
- `LocalSkillCandidateStore.listCandidates()` / `readCandidate()` — preserve bounded review metadata while keeping artifacts inert.

### File Structure Expectations

Likely files to modify:

- `tests/skill-registry.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/skill-candidates.test.ts`
- `tests/skill-candidate-store.test.ts`
- `tests/session-persistence.test.ts` only if resume behavior needs a narrower fixture than runtime-loop.
- `tests/final-task-summary.test.ts` or `tests/runtime-loop.test.ts` if final summary influence assertions need expansion.
- `packages/skills/src/index.ts` only if a registry leak is found.
- `packages/core/src/agent-runtime.ts` only if task context or skill usage influence leak is found.
- `packages/core/src/task-context.ts` only if candidate artifacts can enter context assembly.
- `packages/storage/src/skill-candidate-store.ts` only if review metadata is not preserved safely.

Avoid:

- Creating new candidate storage roots.
- Treating `.sprite/skill-candidates` as a skill registry root.
- Letting candidate review views enter task context automatically.
- Adding a runtime option like `candidateReferences` or `autoSkillCandidates`.
- Writing global skill files.
- Implementing TUI/RPC candidate review in this story.

### Testing Requirements

- Use Vitest and existing temp-project helpers/patterns.
- Prefer red tests that prove the candidate cannot become active from multiple directions:
  - registry list,
  - manual invocation,
  - runtime task startup with `skillReferences`,
  - task context skills section,
  - runtime self-model skills metadata,
  - `skill.invoked` / `skill.usage.recorded` event history,
  - final summary `skillInfluences`,
  - session resume.
- For draft/rejected fixtures, prefer using Story 5.6 helpers (`reviewSkillCandidate()` / `AgentRuntime.reviewSkillCandidate()`) instead of hand-writing invalid candidate JSON.
- Every unsafe fixture must assert serialized outputs do not contain raw secrets, raw paths, raw skill content, stdout/stderr, diffs, patches, activation grants, or routing rules.
- Keep tests deterministic: temp dirs under `tmpdir()`, fixed timestamps where already used, no network, no new dependencies.

### Project Structure Notes

- This story stays inside the current TypeScript workspace structure: shared constants in `packages/shared`, domain skills in `packages/skills`, storage in `packages/storage`, runtime orchestration/context in `packages/core`, and CLI only for already-existing candidate review surfaces.
- No `project-context.md` was present when creating this story; AGENTS.md, planning artifacts, and previous Story 5.6 are the active guide.
- Git history immediately before this story:
  - `94ea652 Require human-trusted skill promotion boundaries`
  - `b808a55 Prepare skill candidate proposal story from Hermes research`
  - `66f2d34 Keep skill evolution signal-only until review can promote it`
  - `39a51ab Prepare skill signal recording with promotion guardrails`
  - `515e13a Keep skill usage audit text bounded`

### Open Questions for Implementation

- Is the existing production code already sufficient and only missing regression coverage? Start by proving with red/green tests before adding code.
- Should `ignored` skill suggestions be allowed to reference candidate names as non-active suggestions, or should candidate IDs/names be fully rejected in `recordSkillUsage()`? Safer default: reject candidate IDs/names unless there is an explicit future story for suggested-but-inert candidate surfacing.
- Should future learning analysis have a dedicated API for rejected/draft candidate summaries, or is `listSkillCandidates()` / `openSkillCandidate()` sufficient for MVP? Safer default: keep existing explicit review APIs only unless tests show a missing requirement.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Story created from sprint backlog after Story 5.6 was committed at `94ea652`.
- Loaded BMad create-story workflow, sprint status, Epic 5 planning, PRD FR59/NFR27, architecture skill evolution and context boundaries, previous Story 5.6 notes, current implementation surfaces, and recent git history.
- No external web research was required because Story 5.7 introduces no new external SDK, package, or version-sensitive API.
- 2026-05-11T10:18:03+0700: Development phase started; story and sprint status moved to `in-progress` after story artifact commit `c75c1f6`.
- 2026-05-11T10:27:02+0700: Added candidate/manual skill separation regression coverage and moved story to `review` after full validation.
- 2026-05-11T10:46:30+0700: Addressed 3-agent review findings with a candidate ignored-suggestion guard and broader leak/resume/promotion regression coverage.

### Completion Notes List

- Created ready-for-dev story context for Story 5.7.
- Scoped this story as separation regression/hardening work rather than new feature surface.
- Captured Story 5.6 implementation boundaries and remaining transaction risk.
- Identified target functions and tests likely to prove candidate/skill separation.
- Added registry regression coverage for proposed, draft, rejected, and promoted candidate artifacts staying outside active manual skill listing/invocation.
- Added runtime regression coverage proving candidate references do not populate task context, self-model skill metadata, `skill.invoked`, `skill.usage.recorded`, or final summary skill influences.
- Added explicit review-access coverage proving draft/rejected candidates remain listable/openable with bounded metadata.
- Added resume coverage proving draft candidates stay inert and do not load into resumed task context.
- Added production validation so ignored/suggested skill usage records cannot cite stored skill candidate artifacts as skill influence without promotion.
- Strengthened review follow-up tests for candidate ID source-qualified failures, serialized failure leak checks, candidate context sentinels, explicit review metadata, promoted future-task behavior, and post-resume future-task loading.

### File List

- `_bmad-output/implementation-artifacts/5-7-keep-skill-candidates-separate-from-promoted-skills.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `tests/runtime-loop.test.ts`
- `tests/skill-registry.test.ts`

### Change Log

- 2026-05-11: Created ready-for-dev Story 5.7 context for candidate/promoted-skill separation.
- 2026-05-11: Moved Story 5.7 into development phase.
- 2026-05-11: Added candidate/promoted-skill separation regression tests and moved story to review.
- 2026-05-11: Addressed code review findings for candidate influence bypass and regression coverage gaps.
