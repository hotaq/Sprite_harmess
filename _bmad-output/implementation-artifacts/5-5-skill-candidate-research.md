# Story 5.5 Research: Skill Candidate Proposal Design

Date: 2026-05-10

Status: completed for pre-development planning

## Research Scope

Research focused on how Story 5.5 should turn safe `skill.signal.recorded` evidence into inert skill candidate artifacts without creating active skills, routing rules, tool grants, or prompt influence.

This research inspected:

- current Epic 5 planning artifacts;
- existing learning review, skill signal, memory candidate, runtime event, storage, and manual skill registry patterns;
- GitNexus advisory code-map output;
- official skill-system documentation for Codex and Claude as external design references.

No production code was edited.

## Executive Recommendation

Implement Story 5.5 as a proposal-only pipeline:

1. Add a skill-candidate domain module in `packages/skills/src/skill-candidates.ts`.
2. Store candidate artifacts through a focused storage helper in `packages/storage/src/skill-candidate-store.ts`.
3. Persist candidates under `.sprite/skill-candidates/<candidate-id>.json`, never under `.sprite/skills`, `.agents/skills`, `.codex/skills`, or user/global skill roots.
4. Add `skill.candidate.created` and `skill.candidate.skipped` runtime events in `packages/core/src/runtime-events.ts`.
5. Wire runtime generation after learning review creation, but only run candidate generation when safe skill signals exist. Emit no skip event for zero signals; emit a bounded skip event when candidate generation runs and evidence is insufficient.
6. Keep evidence threshold conservative:
   - create a candidate when two or more compatible safe signals share a normalized workflow identity; or
   - create a candidate from one correction/recovery signal only when it has strong supporting evidence, multiple safe event IDs, and non-empty tool sequence.
7. Keep all candidates `lifecycleStatus: "proposed"` and confidence at `low | medium`; do not produce `high` in this story.

## Internal Evidence

### Learning review and signal source

`packages/memory/src/index.ts` already owns the safe signal boundary:

- `LearningReviewSkillSignal`
- `SkillSignalOutcome`
- `SkillSignalLifecycleStatus`
- `generateLearningReview()`
- `validateLearningReviewSkillSignal()`

The existing contract uses `skillsig_` IDs and `signal_only` status. Story 5.5 should consume only these validated signal-only artifacts, not raw tool output or raw skill contents.

### Runtime integration point

`packages/core/src/agent-runtime.ts` already creates a learning review for eligible completed tasks, writes the review artifact, emits one `skill.signal.recorded` event per skill signal, and then emits `learning.review.created`.

Best integration point:

- after the learning review artifact path is known;
- after skill signal events are constructed;
- after or alongside `learning.review.created`, but before the completed task is returned with refreshed events.

Candidate generation needs the learning review artifact path and event/source IDs, so integrating before artifact write is too early.

### Runtime event validator pattern

`packages/core/src/runtime-events.ts` already centralizes event type validation and rejects unsafe payload fields for policy/skill-signal-like events. Story 5.5 should follow this pattern with candidate-specific forbidden fields:

- raw command output;
- `stdout` / `stderr`;
- diffs / patches / snippets;
- raw skill content;
- activation/routing grants;
- promoted skill paths;
- absolute filesystem paths;
- secrets/tokens/credentials.

### Storage pattern

`packages/storage/src/memory-store.ts` is the closest safe artifact pattern:

- resolves project-local artifact paths;
- validates before write;
- rejects path escape;
- uses temp-file write then rename;
- rejects duplicate candidate IDs.

Story 5.5 should mirror this with a new skill-candidate store instead of bloating session-store with another artifact family.

Recommended storage surface:

- `SkillCandidateArtifactPaths`
- `StoredSkillCandidate`
- `SkillCandidateStore`
- `LocalSkillCandidateStore`
- `createLocalSkillCandidateStore()`
- `resolveSkillCandidateArtifactPaths()`
- `resolveSkillCandidateArtifactPath()`
- `writeCandidate()`
- `readCandidate()` and `listCandidates()` if needed by tests.

### Skill registry separation

`packages/skills/src/index.ts` currently lists/invokes manual skills from `.sprite/skills` and user/global skill roots. `tests/skill-registry.test.ts` already asserts procedural/candidate-like artifacts are not listed and candidate/runtime artifacts are not created during listing.

Story 5.5 must extend that protection:

- if `.sprite/skill-candidates/<id>.json` exists, `listAvailableSkills()` must not list it;
- `invokeManualSkill()` must not invoke it;
- no candidate should be converted to `SKILL.md` in this story.

### Existing test hooks

Useful existing or adjacent tests:

- `tests/runtime-loop.test.ts`: already asserts signal-only flows do not create `skill.candidate.created` in Story 5.4 scenarios.
- `tests/runtime-events.test.ts`: should gain safe/unsafe payload tests for candidate events.
- `tests/skill-registry.test.ts`: should gain candidate-not-listed/cannot-invoke guard cases.
- `tests/session-store.test.ts` or a new storage-focused test can cover artifact path/write/read behavior.
- A new `tests/skill-candidates.test.ts` should own pure generation/validation logic.

### GitNexus note

GitNexus status showed the index is stale:

- indexed commit: `39a51ab`
- current commit: `66f2d34`

GitNexus query still identified the relevant code surfaces (`AgentRuntime`, `runtime-events.ts`, `LocalSessionStore`, `LocalMemoryStore`, `packages/memory/src/index.ts`), but impact analysis must be re-run after `npx gitnexus analyze . --force --skip-agents-md --no-stats` before production code edits.

## External Design References

External references support the separation between a proposed workflow and an active skill:

- NousResearch Hermes Agent positions itself as a self-improving agent with a closed learning loop: it creates skills from experience, improves them during use, nudges memory writes, searches past conversations, and uses skills as procedural memory. Source: <https://github.com/NousResearch/hermes-agent>
- Hermes `skill_manager_tool.py` writes real active `SKILL.md` files to `~/.hermes/skills`, validates frontmatter/name/content, supports supporting files, uses atomic writes, and optionally scans agent-created skills. This is useful as a later-promotion reference, but Story 5.5 should not write active `SKILL.md` files yet. Source: <https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_manager_tool.py>
- Hermes separates operational skill telemetry/provenance into a sidecar `.usage.json`, including explicit agent-created markers and lifecycle states. Sprite should copy the sidecar/audit idea, but keep candidates under `.sprite/skill-candidates` until review. Source: <https://github.com/NousResearch/hermes-agent/blob/main/tools/skill_usage.py>
- Hermes has a background skill curator that consolidates agent-created skills into broader "umbrella" skills and archives narrow siblings. This supports a key Sprite design choice: generate candidate evidence first, then let later review/promotion stories decide whether to merge, archive, or promote. Source: <https://github.com/NousResearch/hermes-agent/blob/main/agent/curator.py>
- OpenAI Codex skills documentation says a skill is a directory with `SKILL.md`, metadata, and optional scripts/references; Codex uses name/description first and reads full `SKILL.md` only when selected. This means Story 5.5 candidates must not be stored in scanned skill directories until a later promotion story. Source: <https://developers.openai.com/codex/skills>
- OpenAI's "Save workflows as skills" use case frames skills as reusable workflows created from repeatable work after gathering information and validating the result. Story 5.5 should stop at the gathered proposal artifact, not activate it. Source: <https://developers.openai.com/codex/use-cases/reusable-codex-skills>
- Claude Code skills documentation similarly treats `SKILL.md` as the active skill entrypoint and uses descriptions to decide loading. This reinforces candidate separation from active `SKILL.md` locations. Source: <https://code.claude.com/docs/en/skills>
- Claude Agent SDK documentation notes skills are filesystem artifacts discovered from configured skill locations, not programmatically registered. That supports keeping candidate artifacts outside discovery paths until promotion. Source: <https://code.claude.com/docs/en/agent-sdk/skills>

## Hermes Agent Follow-up Inspection

The Hermes repository was cloned read-only to `/tmp/hermes-agent-inspect` at commit `d4b26df` for local inspection. No installer was run and no persistent Hermes state was created.

Attempted command:

```bash
python3 cli.py --help
```

Result:

- failed because local dependencies were not installed (`ModuleNotFoundError: No module named 'prompt_toolkit'`);
- this confirms only static/read-only inspection was performed.

### Hermes patterns worth adapting

1. **Procedural memory split from declarative memory**
   - Hermes prompt guidance distinguishes memory facts from procedural skills.
   - Sprite already has learning reviews and signal-only events; Story 5.5 should keep candidates as procedural drafts, not general memory.

2. **Active skill writes are powerful and should be later-story gated**
   - Hermes `skill_manage(create)` writes active `SKILL.md` under `~/.hermes/skills`.
   - Sprite Story 5.5 must stop before this point: no active skill writes, no discovery path writes, no invocation changes.

3. **Skill validation before persistence**
   - Hermes validates name, category, required frontmatter, size limits, path traversal, allowed supporting-file subdirectories, and uses atomic writes.
   - Sprite should mirror the validation style for candidate artifacts, but with stricter no-raw-output/no-secret/no-active-skill fields.

4. **Sidecar telemetry and provenance**
   - Hermes keeps usage/provenance outside `SKILL.md` in `.usage.json`.
   - Sprite should keep candidate evidence/provenance in the candidate artifact and runtime event payloads, not inside active skill text.

5. **Curator separation**
   - Hermes curator is a second-stage maintenance process that reviews agent-created skills, consolidates narrow skills into umbrella skills, archives recoverably, and respects pinned/off-limits sources.
   - Sprite should not collapse 5.5 candidate generation and 5.6/5.7 review/promotion into one implementation. Candidate generation should produce reviewable evidence; later stories own edit/reject/promote/separation.

### Hermes patterns not to copy into Story 5.5

- Do not write active `SKILL.md` files in candidate generation.
- Do not automatically patch existing skills when a candidate is created.
- Do not allow candidate artifacts to influence prompt context.
- Do not rely on usage counters alone as evidence of candidate value.
- Do not make safety scanning optional for candidate artifacts; fail closed.

### Updated design implication

Hermes validates that "self-improving skills" is a real target architecture, but its implementation is already at the active-skill layer. Sprite Story 5.5 should intentionally sit one step earlier:

```text
skill.signal.recorded
  -> skill candidate artifact under .sprite/skill-candidates
  -> skill.candidate.created/skipped event
  -> later review/promote stories decide active SKILL.md writes
```

## Proposed Function and Contract List Before Development

Report this list before production code edits and run GitNexus impact analysis on existing symbols that will be modified.

### `packages/skills/src/skill-candidates.ts`

- `SKILL_CANDIDATE_SCHEMA_VERSION`
- `SKILL_CANDIDATE_LIFECYCLE_STATUSES`
- `SKILL_CANDIDATE_CONFIDENCE_VALUES`
- `SKILL_CANDIDATE_SKIPPED_REASONS`
- `SkillCandidateLifecycleStatus`
- `SkillCandidateConfidence`
- `SkillCandidateGenerationSkippedReason`
- `SkillCandidateSupportingEvidence`
- `SkillCandidate`
- `SkillCandidateGenerationRequest`
- `SkillCandidateGenerationResult`
- `validateSkillCandidate()`
- `generateSkillCandidatesFromSignals()`
- `summarizeSkillCandidateForEvent()`

### `packages/storage/src/skill-candidate-store.ts`

- `SkillCandidateArtifactPaths`
- `StoredSkillCandidate`
- `SkillCandidateStore`
- `LocalSkillCandidateStore`
- `createLocalSkillCandidateStore()`
- `resolveSkillCandidateArtifactPaths()`
- `resolveSkillCandidateArtifactPath()`
- `writeCandidate()`
- optional `readCandidate()` / `listCandidates()` for tests and future review story.

### `packages/core/src/runtime-events.ts`

- add runtime types:
  - `skill.candidate.created`
  - `skill.candidate.skipped`
- add typed payloads:
  - `SkillCandidateCreatedPayload`
  - `SkillCandidateSkippedPayload`
- add validators:
  - `validateSkillCandidateCreatedEvent()`
  - `validateSkillCandidateSkippedEvent()`

### `packages/core/src/agent-runtime.ts`

- `AgentRuntime.createSkillCandidatesForCompletedTask()` or equivalent private helper.
- small integration in `createLearningReviewForCompletedTask()` after learning review creation.

## Key Design Decisions

### Hermes adaptation decisions

Use these Hermes-inspired patterns in Sprite, but keep them behind Sprite's candidate-first safety boundary.

Will adapt in Story 5.5:

- **Procedural memory separation:** treat skill candidates as reusable procedure drafts, not declarative memory facts.
- **Candidate-before-active-skill boundary:** generate `.sprite/skill-candidates/<candidate-id>.json` and runtime audit events only; do not write active `SKILL.md`.
- **Validation before persistence:** validate candidate ID, name, bounded strings/arrays, lifecycle state, source IDs, artifact path, and forbidden fields before storage.
- **Atomic artifact writes:** use temp-file then rename pattern for candidate JSON artifacts.
- **Evidence/provenance sidecar style:** keep source signal/session/task/event IDs and lifecycle metadata in candidate artifacts and events, not in active skill text.
- **Separated curation lifecycle:** design output so later stories can review, merge, reject, archive, or promote candidates without rerunning evidence extraction.

Will defer to Story 5.6+ / 5.7+:

- Human review/edit/reject/promote flow.
- Active `SKILL.md` creation.
- Skill self-improvement or patch proposals after active skill use.
- Curator-style umbrella consolidation of narrow candidates/skills.
- Archive/restore lifecycle for promoted or rejected skill drafts.

Will not copy:

- Direct signal-to-active-skill creation.
- Automatic patching of active skills during candidate generation.
- Candidate prompt/context influence before promotion.
- Usage-count-only evidence scoring.
- Optional safety validation for generated candidates.

### Automatic vs explicit generation

Recommended MVP: automatic generation after learning review creation, but gated.

Rules:

- zero skill signals: no candidate generation and no skipped event;
- one weak signal: generation runs only if signal collection is non-empty, then emits `skill.candidate.skipped` with `insufficient_evidence`;
- strong or repeated signal group: write artifact, then emit `skill.candidate.created`;
- duplicate normalized candidate: do not rewrite artifact; emit bounded duplicate skip if generation was attempted.

This gives auditability without flooding every task completion.

### Same-review first, cross-session later

Story 5.5 should support source arrays for multiple sessions/tasks/correlations, but actual aggregation can be same-learning-review first.

Reason:

- no dedicated cross-session skill-signal retrieval layer exists yet;
- cross-session promotion/review is closer to Stories 5.6/5.7 or a later retrieval story;
- deterministic same-review fixtures satisfy NFR50 while keeping scope small.

### Candidate ID

Use `skillcand_` and derive deterministic IDs from normalized workflow identity plus safe source signal IDs. This supports idempotency and duplicate detection.

### Candidate confidence

Use:

- `low`: single strong correction/recovery evidence;
- `medium`: repeated compatible safe signals;
- never `high` in this story.

## Development Stop Conditions

Do not start implementation until:

1. GitNexus analyze/status is refreshed.
2. Impact analysis is run for every existing symbol that will be edited.
3. The exact function/contract list is reported to the user.

Do not mark done until:

1. targeted candidate/runtime/storage/registry tests pass;
2. full typecheck and test suite pass;
3. `git diff --check` passes;
4. GitNexus detect fallback is run before commit.
