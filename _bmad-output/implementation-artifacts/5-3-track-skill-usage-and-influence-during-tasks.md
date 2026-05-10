# Story 5.3: Track Skill Usage and Influence During Tasks

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to track when skills influence tasks,
so that I can audit whether a workflow helped or hurt.

## Acceptance Criteria

1. Given a skill is loaded, invoked, suggested, or materially affects a task plan/action, when the task history is inspected, then the skill usage record shows safe skill ID/name, source, invocation mode, task ID, event references, usage state, and an influence summary when applicable.
2. Given a skill influence exists, when the final summary or audit trail is rendered, then it can show the skill influence without exposing raw skill content, raw filesystem paths, secrets, stdout/stderr, diffs, patches, or unbounded content.
3. Given a skill was loaded but not used, when the task completes, then the usage record can distinguish `loaded`, `used`, `ignored`, and `contradicted` states, and this state remains available for later skill refinement.
4. Given skill usage tracking runs in Epic 5 before skill-signal and candidate stories, when a task records usage, then Sprite Harness does not auto-generate skill signals, candidates, promotions, or autonomous routing behavior in this story.

## Tasks / Subtasks

- [ ] Confirm implementation function list before code edits (AC: 1-4)
  - [ ] Report the exact functions/contracts to add or modify before touching implementation files.
  - [ ] Run GitNexus impact analysis before editing existing symbols, especially runtime event validators, `AgentRuntime`, final summary rendering, and skill registry contracts.
  - [ ] Keep this story usage/influence-only: no automatic skill selection, no skill-signal generation, no candidate creation, no promotion, and no hidden authority changes.
  - [ ] Preserve Story 5.1/5.2 safety boundaries: public skill listing and invocation outputs stay sanitized and do not expose raw paths or full skill bodies.

- [ ] Define a safe skill usage event contract (AC: 1-4)
  - [ ] Add a typed runtime event such as `skill.usage.recorded`.
  - [ ] Payload must include `skillId`, `name`, `source`, `invocationMode`, `trigger`, `status`, `sourceEventIds`, `evidenceEventIds`, `summary`, and optional `influenceSummary`/`reason`.
  - [ ] Trigger values must distinguish why the record exists, for example `loaded`, `invoked`, `suggested`, or `influenced`.
  - [ ] Status values must distinguish `loaded`, `used`, `ignored`, and `contradicted`.
  - [ ] Require `influenceSummary` for `used` records.
  - [ ] Require `reason` for `ignored` and `contradicted` records.
  - [ ] Require non-empty `sourceEventIds` and `evidenceEventIds` so the record is auditable.
  - [ ] Reject unsafe/raw fields and secret-looking values using the same policy style as `skill.invoked` and `memory.influence.recorded`.

- [ ] Wire tracking through the shared runtime boundary (AC: 1, 3-4)
  - [ ] Add a focused runtime request/result API, for example `RuntimeSkillUsageRequest` and `AgentRuntime.recordSkillUsage()`.
  - [ ] Validate that referenced event IDs belong to the active task before recording a usage event.
  - [ ] Validate that `loaded`, `used`, and `contradicted` records target a skill that was actually loaded/invoked in the task.
  - [ ] Allow `trigger: "suggested"` with `status: "ignored"` when the skill was suggested but not loaded, as long as the caller supplies safe skill metadata and auditable evidence event IDs.
  - [ ] When a manual skill is successfully invoked, emit an initial `skill.usage.recorded` record with `status: "loaded"` linked to the `skill.invoked` event.
  - [ ] Support explicit `trigger: "suggested"` usage records through the runtime API when a caller supplies auditable evidence, without adding automatic suggestion behavior.
  - [ ] Do not create usage records for `skill.invocation.failed` beyond the failed invocation event from Story 5.2.
  - [ ] Keep usage tracking deterministic; do not infer `used`/`ignored` from raw model text or skill body content.

- [ ] Surface skill influence in final summaries and audit output (AC: 1-3)
  - [ ] Extend `FinalTaskSummary` with a safe `skillInfluences` or equivalent collection.
  - [ ] Update `summarizeEvent()` so `skill.usage.recorded` important events include status/reason/influence summary.
  - [ ] Update final summary rendering to show a `Skill influences:` section, matching the existing `Memory influences:` pattern.
  - [ ] Ensure summaries include task/session/event linkage but never full skill content or raw paths.
  - [ ] Ensure JSON output exposes structured skill usage records through the shared runtime summary, not CLI-only formatting.

- [ ] Preserve later Epic 5 boundaries (AC: 3-4)
  - [ ] Leave `collectLearningReviewSkillSignals()` behavior unchanged except for tests/docs needed to prove usage records do not become skill signals automatically.
  - [ ] Do not emit `skill.signal.recorded`; that belongs to Story 5.4.
  - [ ] Do not create or review skill candidates; that belongs to Stories 5.5-5.7.
  - [ ] Treat the runtime event stream/final summary as the feed for later refinement.

- [ ] Add regression tests (AC: 1-4)
  - [ ] Runtime event tests: `skill.usage.recorded` validates safe `loaded`, `used`, `ignored`, and `contradicted` payloads.
  - [ ] Runtime event tests: `trigger` accepts `loaded`, `invoked`, `suggested`, and `influenced` values and rejects unknown values.
  - [ ] Runtime event tests: `used` requires `influenceSummary`; `ignored`/`contradicted` require `reason`; empty event references are rejected.
  - [ ] Runtime event tests: raw skill content, raw paths, secrets, stdout/stderr, diffs, patches, and unsafe metadata fields are rejected.
  - [ ] Runtime tests: manual `--skill` task invocation emits `skill.invoked` followed by `skill.usage.recorded` with `status: "loaded"`.
  - [ ] Runtime tests: explicit skill usage records for `used`, `ignored`, and `contradicted` appear in the active task event history and final summary.
  - [ ] Runtime tests: usage recording rejects missing skill evidence, missing event IDs, or event IDs from another task.
  - [ ] Final summary tests: `Skill influences:`/structured summary output includes safe influence details and does not leak skill content or secret-like values.
  - [ ] Scope guard tests: usage records do not automatically create learning review skill signals or skill candidates.

- [ ] Update story evidence and lifecycle status (AC: 1-4)
  - [ ] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [ ] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [ ] Run targeted validation before review: runtime-events tests, runtime-loop tests, CLI smoke tests, task-context/final-summary tests as touched, and typecheck/lint if contracts changed.
  - [ ] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [ ] Run GitNexus detect-changes before committing implementation changes when available; if the CLI lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.3 turns manual skill invocation from Story 5.2 into an auditable usage/influence trail. The system should answer:

1. Which skill entered the task context?
2. Which event loaded or referenced that skill?
3. Was the skill merely loaded, actually used, ignored, or contradicted?
4. If it influenced the task, what safe summary explains the influence?

This story must not make Sprite Harness choose skills autonomously. It records evidence after a skill is explicitly loaded or explicitly marked influential through runtime APIs.

### Source Requirements

- Story 5.3 requires tracking when a skill is loaded, invoked, suggested, or materially affects a task plan/action, with skill ID/name, source, invocation mode, task ID, event references, and influence summary. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.3]
- Story 5.3 requires distinguishing `loaded`, `used`, `ignored`, or `contradicted` states for later refinement. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.3]
- FR54 requires the system to track skill usage during tasks. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR58 requires the agent to show when a skill or skill signal influenced a task. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR9 requires task lifecycle, tool activity, approvals, validation, memory, skills, and learning to be available through the runtime event stream. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR10 requires task context to be assembled from user input, project context, session state, memory, skills, and self-model. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- NFR23 requires audit trails to include skill signals when relevant; in this story, use safe usage/influence records without creating future skill signal artifacts. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR24 requires final summaries to identify validation, changed files, unresolved risks, and relevant task evidence. Skill influence belongs in the same summary/audit surface. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR28 requires explaining which memory, lesson, skill signal, or self-model state influenced a task when applicable. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR29 requires CLI, TUI, and RPC to share one runtime capability model. Put usage tracking in core/runtime contracts, not CLI-only code. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture treats the runtime event stream as the spine for audit, replay, UI, RPC, learning, and tests. [Source: `_bmad-output/planning-artifacts/architecture.md` Cross-Cutting Architecture]
- Architecture says memory and skill systems consume events and learning reviews but should not directly control the agent loop. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Skill Systems]
- Architecture requires secrets not to enter logs, summaries, memory, RPC state, or learning reviews. Apply the same rule to skill usage events and summaries. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/skills/src/index.ts` currently owns skill registry and manual invocation contracts:
  - `SKILL_INVOCATION_MODES = ["manual"]`
  - `SKILL_INVOCATION_STATUSES = ["loaded", "failed"]`
  - `InvokedSkillContext`
  - `ManualSkillInvocationResult`
  - `invokeManualSkill()`
- `packages/core/src/skill-registry.ts` re-exports skill registry/invocation contracts and provides the shared `invokeSkill()` wrapper.
- `packages/core/src/agent-runtime.ts` currently loads manual skill references in `loadManualSkillContextEntries()` and emits:
  - `skill.invoked` for successful manual loads.
  - `skill.invocation.failed` for recoverable failures.
- `packages/core/src/runtime-events.ts` currently validates `skill.invoked` and `skill.invocation.failed`, but has no usage/influence event yet.
- `packages/core/src/final-task-summary.ts` currently collects `memoryInfluences` and summarizes `memory.influence.recorded`; it does not yet collect skill influence records.
- `packages/core/src/agent-runtime.ts` currently renders final summary lines with a `Memory influences:` section only. Story 5.3 should add the parallel skill section through the shared final summary object.
- `packages/core/src/task-context.ts` currently includes loaded skill names/source/modes in task context and self-model metadata; this story should not need to inject additional skill body content beyond Story 5.2.
- `collectLearningReviewSkillSignals()` currently creates learning-review skill signals from successful validation and recovery events. Story 5.3 should not turn usage records into generated skill signals.

### Previous Story Intelligence

- Story 5.2 intentionally left full skill usage/influence tracking to Story 5.3.
- Story 5.2 established the safe manual invocation boundary:
  - successful load event: `skill.invoked`
  - recoverable failure event: `skill.invocation.failed`
  - no raw skill body, raw path, stdout/stderr, diffs, patches, or secret-like values in events/output
- Story 5.2 review resolved policy-blocked behavior by mapping unsafe manifest/body content to `SKILL_BLOCKED_BY_POLICY`.
- Story 4.5 established the pattern for influence tracking via `memory.influence.recorded`, `AgentRuntime.recordMemoryInfluence()`, `FinalTaskSummary.memoryInfluences`, and final summary rendering.
- Story 4.7 established that procedural learning outputs and skill-linked signals are evidence, not active promoted skills.
- The GitNexus CLI may still lack `detect_changes`; use analyze/status fallback before commits until detect-change parity exists.

### Suggested Contracts and Functions

Before implementation, report and adjust this function list based on direct code inspection:

- `SkillUsageStatus` or `RuntimeSkillUsageStatus` — `loaded | used | ignored | contradicted`.
- `SkillUsageTrigger` or `RuntimeSkillUsageTrigger` — `loaded | invoked | suggested | influenced`.
- `RuntimeSkillUsageRequest` — safe request for recording usage/influence against an already loaded skill.
- `RuntimeSkillUsageResult` — event result or structured recoverable error.
- `validateSkillUsageRecordedEvent()` — runtime event validator for `skill.usage.recorded`.
- `AgentRuntime.recordSkillUsage()` — shared runtime API for CLI/TUI/RPC and tests.
- `findLoadedSkillInvocationEvent()` or equivalent helper — verifies skill usage references a loaded skill event in the current task.
- `collectSkillInfluences()` — final summary collector analogous to `collectMemoryInfluences()`.
- `FinalTaskSummarySkillInfluence` — safe final summary view of skill usage/influence.
- `formatFinalSummaryLines()` update — render `Skill influences:` without leaking content.
- Optional helper: `createLoadedSkillUsageEvent()` inside `loadManualSkillContextEntries()` if it keeps initial `loaded` usage emission simple and testable.

### Event Contract Recommendation

Prefer a new runtime event over overloading `skill.invoked`:

```ts
type SkillUsageStatus = "loaded" | "used" | "ignored" | "contradicted";
type SkillUsageTrigger = "loaded" | "invoked" | "suggested" | "influenced";

interface SkillUsageRecordedPayload {
  evidenceEventIds: string[];
  influenceSummary?: string;
  invocationMode: "manual";
  name: string;
  reason?: string;
  skillId: string;
  source: "project" | "global";
  sourceEventIds: string[];
  status: SkillUsageStatus;
  summary: string;
  trigger: SkillUsageTrigger;
}
```

Rationale:

- `skill.invoked` records the loading action from Story 5.2.
- `skill.usage.recorded` records post-load audit state and influence.
- Multiple usage records can exist for one skill over a task lifecycle.
- `trigger` lets later callers record a suggestion or material influence without pretending it was a manual invocation.
- Later stories can consume usage events as evidence without changing the invocation contract.

### Safety and Authority Rules

- Skill usage records are audit metadata, not permission grants.
- Do not execute commands from skill content.
- Do not treat `loaded` as proof that the skill influenced the task.
- Do not infer `used`, `ignored`, or `contradicted` from raw model prose.
- `used` must carry a safe influence summary.
- `ignored`/`contradicted` must carry a safe reason.
- Usage events and summaries must not contain:
  - full skill content
  - raw filesystem paths
  - secrets, API keys, private keys, tokens, credentials
  - stdout/stderr/raw command output
  - diffs or patches
  - unbounded snippets
- If usage recording receives unsafe metadata, reject the event instead of redacting into an ambiguous audit record.

### Project Structure Notes

- Keep runtime events in `packages/core/src/runtime-events.ts`.
- Keep shared runtime orchestration in `packages/core/src/agent-runtime.ts`.
- Keep final summary structure in `packages/core/src/final-task-summary.ts`.
- Keep skill registry/invocation behavior in `packages/skills/src/index.ts` unless a domain type must be exported for reuse.
- Prefer extending existing tests:
  - `tests/runtime-events.test.ts`
  - `tests/runtime-loop.test.ts`
  - `tests/cli-smoke.test.ts`
  - `tests/task-context.test.ts` only if task context behavior changes
- Do not add dependencies.

### Testing Guidance

Use temp directories for cwd/HOME so tests do not read real user skills.

Minimum targeted validations:

```bash
rtk run 'npm test -- --run tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/cli-smoke.test.ts'
rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'
```

Add narrower test commands during development as needed.

### References

- `_bmad-output/planning-artifacts/epics.md` — Epic 5 and Story 5.3 source requirements.
- `_bmad-output/planning-artifacts/prd.md` — FR54, FR58, FR9, FR10, NFR23, NFR24, NFR28, NFR29.
- `_bmad-output/planning-artifacts/architecture.md` — runtime event stream, memory/skill systems, local-first storage, audit/security constraints.
- `_bmad-output/implementation-artifacts/5-2-manually-invoke-a-skill-during-a-task.md` — previous story implementation baseline and safety findings.
- `packages/core/src/runtime-events.ts` — current event types and validators.
- `packages/core/src/agent-runtime.ts` — current manual skill loading and final summary rendering.
- `packages/core/src/final-task-summary.ts` — current memory influence summary pattern.
- `packages/skills/src/index.ts` — current manual skill invocation contracts.

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

TBD

### Completion Notes List

TBD

### File List

TBD
