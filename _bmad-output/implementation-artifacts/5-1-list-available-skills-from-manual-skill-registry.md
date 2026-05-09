# Story 5.1: List Available Skills from Manual Skill Registry

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to list available skills,
so that I know what reusable workflows the agent can use.

## Acceptance Criteria

1. Given global or project skill directories exist, when the user lists skills, then Sprite Harness shows available skills with name, description, source, lifecycle state, and activation/manual invocation hint.
2. Given global or project skill directories exist, when the user lists skills, then local project skills and global skills are distinguishable.
3. Given a skill is malformed or unreadable, when skills are listed, then Sprite Harness reports the skill as unavailable with a structured warning.
4. Given a skill is malformed or unreadable, when skills are listed, then Sprite Harness does not crash the runtime.
5. Given skill listing reads registry artifacts, when those artifacts contain unsafe metadata, path escapes, raw output fields, secrets, credentials, or private keys, then listing excludes or redacts unsafe material and reports a structured warning instead of exposing it.

## Tasks / Subtasks

- [ ] Confirm implementation function list before code edits (AC: 1-5)
  - [ ] Report exact functions/contracts to add or modify before touching implementation files.
  - [ ] Run GitNexus impact analysis before editing existing symbols, especially `createProgram`, any core wrapper that exposes skill listing, and task-context/self-model helpers if they are updated.
  - [ ] Keep this story list-only: no skill invocation, no skill candidate aggregation, no promotion, no active behavior change.
  - [ ] Preserve the Epic 4 guardrail: skill signals and procedural outputs remain candidate evidence, not active skills.

- [ ] Define manual skill registry contracts in `packages/skills` (AC: 1-5)
  - [ ] Add exported registry/listing types such as `SkillRegistrySource`, `SkillLifecycleState`, `SkillRegistryEntry`, `UnavailableSkillRegistryEntry`, `SkillRegistryWarning`, and `ListSkillsResult`.
  - [ ] Add registry root resolution for project `.sprite/skills` and global `$HOME/.sprite/skills`.
  - [ ] Define manual skill artifacts as directories containing `SKILL.md` with bounded frontmatter metadata: `name`, `description`, optional `activationHint`.
  - [ ] Compute `source` from the registry root (`project` or `global`); do not trust the artifact to self-declare its source.
  - [ ] Use a candidate-safe lifecycle for usable manual registry skills, e.g. `manual`; use `unavailable` only for malformed/unreadable entries.
  - [ ] Do not scan `.codex/skills`, `.agents/skills`, BMAD skills, or Codex-native agent skills as product runtime skills in this story.

- [ ] Add safe registry loading and validation (AC: 1-5)
  - [ ] Implement deterministic directory scanning with stable sort order.
  - [ ] Validate registry paths stay inside their expected root and do not escape through relative paths.
  - [ ] Treat malformed, missing, unsafe, unreadable, or invalid `SKILL.md` entries as unavailable warnings, not thrown crashes.
  - [ ] Reject or redact secret-like values and forbidden raw fields (`content`, `rawOutput`, `stdout`, `stderr`, `diff`, `patch`, `token`, `secret`, credentials, private keys, etc.).
  - [ ] Return bounded safe previews only; listing must not dump full skill bodies.
  - [ ] Define duplicate-name behavior explicitly. Recommended: project and global entries are both distinguishable in list output; future invocation may choose project precedence.

- [ ] Expose skill listing through the runtime/core boundary (AC: 1-4)
  - [ ] Add a thin core-facing function or runtime method that calls `@sprite/skills` and returns a safe list result.
  - [ ] Keep CLI and future UI/RPC as renderers over the shared runtime/core result; do not duplicate registry scanning in CLI.
  - [ ] Ensure listing can run without a configured provider and without starting/resuming a task.
  - [ ] Do not emit task runtime events for a plain list command unless a later story explicitly defines skill usage/influence audit semantics.

- [ ] Add CLI list command (AC: 1-4)
  - [ ] Add `sprite skills list` with `--output text|json`.
  - [ ] Text output should clearly separate project skills, global skills, and unavailable skills/warnings.
  - [ ] JSON output should include `skills`, `unavailableSkills` or `warnings`, source metadata, lifecycle state, activation/manual invocation hint, and safe project/global registry roots.
  - [ ] Invalid output format should return a structured CLI error consistent with existing session commands.

- [ ] Update package wiring without introducing new dependencies (AC: 1-5)
  - [ ] Add `exports` and `types` to `packages/skills/package.json` if `@sprite/skills` is imported by other packages.
  - [ ] Add `@sprite/skills` dependency to `packages/core/package.json` if the core owns the shared listing API.
  - [ ] Add `packages/skills/dist` and package metadata to root `package.json` `files` if package distribution now includes the skills package.
  - [ ] Keep implementation in TypeScript/Vitest only; do not add YAML, frontmatter, glob, or filesystem dependencies.

- [ ] Add regression tests (AC: 1-5)
  - [ ] Skills package tests: project/global registry discovery, valid `SKILL.md` parsing, stable ordering, duplicate visibility, and missing directory behavior.
  - [ ] Skills package tests: malformed/unreadable/unsafe skill entries produce unavailable warnings and do not throw.
  - [ ] CLI tests: `sprite skills list` text output distinguishes project/global/unavailable entries.
  - [ ] CLI tests: `sprite skills list --output json` returns structured safe data and warnings.
  - [ ] Safety tests: unsafe metadata and secret-looking values are redacted or rejected and never appear in output.
  - [ ] Regression test: listing skills does not create `.sprite/skill-candidates`, does not read learning-review procedural outputs as active skills, and does not create runtime task events.

- [ ] Update story evidence and lifecycle status (AC: 1-5)
  - [ ] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [ ] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [ ] Run targeted validation before review: skills package tests, CLI smoke tests, task-context tests if self-model/skills context changes, and typecheck.
  - [ ] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [ ] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.1 starts Epic 5 by creating the read-only manual skill registry surface. The system should list manually installed skills from project/global runtime registry directories, show safe metadata, and report malformed entries without crashing.

This story must not invoke skills, track skill usage, generate skill candidates, review candidates, or promote anything. It only establishes the trusted list/read boundary that later Epic 5 stories will build on.

The implementation should answer five audit questions:

1. Which registry roots were scanned?
2. Which skills are available, and are they project or global?
3. Which skills are unavailable, and why?
4. Is every displayed value bounded and safe?
5. Did listing remain read-only with no task/runtime side effects?

### Source Requirements

- Story 5.1 requires listing available skills with name, description, source, lifecycle state, activation/manual invocation hint, and project/global distinction. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.1]
- Story 5.1 requires malformed or unreadable skills to be reported as unavailable with a structured warning and no runtime crash. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.1]
- FR52 requires users to list available skills. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- NFR23 requires task audit trails to contain skill signals when relevant; for this story, listing is not task execution and should not create usage events. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR28 requires the agent to explain which memory, lesson, skill signal, or self-model state influenced a task. Story 5.1 should not claim influence from a listed skill. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR50 requires deterministic fixtures for skill candidate generation later; Story 5.1 should begin deterministic registry fixtures without implementing candidates. [Source: `_bmad-output/planning-artifacts/prd.md` Testing and Quality]
- Architecture treats skills as reviewed procedural memory and requires user approval before promotion. [Source: `_bmad-output/planning-artifacts/architecture.md` Decision Pressure Points]
- Architecture says skill candidates are generated from repeated workflows and reviews, but promoted skills remain user-approved artifacts. [Source: `_bmad-output/planning-artifacts/architecture.md` Skills as Reviewed Procedural Memory]
- Architecture places skill logic in `packages/skills` and lists future skill registry/candidate files under that package. [Source: `_bmad-output/planning-artifacts/architecture.md` Package/Source Tree Guidance]
- Architecture requires secrets and credentials not to be saved to memory, logs, summaries, RPC state, or learning reviews; apply the same safety rule to skill listing output. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/skills/src/index.ts` currently exports nothing. Story 5.1 should create the first real `@sprite/skills` registry/listing surface here.
- `packages/skills/package.json` currently lacks `exports` and `types`; add them if `@sprite/skills` becomes an imported workspace package.
- Root `tsconfig.json` already references `packages/skills`, so the package participates in project builds.
- Root `package.json` `files` currently does not include `packages/skills` distribution artifacts. Add them if this package becomes part of the CLI distribution surface.
- `packages/core/src/task-context.ts` already has a `skills` context source and `TaskContextSkillInput`, but the section is skipped with the reason: "Manual skill registry integration is not implemented yet; no skills were loaded."
- `packages/core/src/task-context.ts` can render provided skill entries in task context, but Story 5.1 should not auto-inject listed skills into task context. Invocation/loading belongs to Story 5.2.
- `packages/cli/src/index.ts` already uses Commander with text/json output patterns for `session inspect`, `session compact`, and `resume`. Reuse those output conventions for `sprite skills list`.
- Existing CLI smoke tests use temp project and HOME directories; reuse that pattern to create project/global `.sprite/skills` fixtures.

### Previous Story Intelligence

- Story 4.7 added candidate-first `ProceduralLearningOutput` records linked to skill signals and learning reviews, but explicitly avoided active skills or promoted skill artifacts.
- Story 4.7 added a regression that completed-task procedural outputs do not create `.sprite/skills`. Preserve that boundary.
- Story 4.7 tightened procedural influence references so `procedural_learning_output` records/events must use `procout_` IDs and include source session/task references. Do not treat `procout_` procedural outputs as manual registry skills.
- Epic 4 retrospective says Story 5.1 must define manual skill registry path, metadata fields, safe validation rules, invalid artifact behavior, and trust boundaries.
- Epic 4 retrospective also says active skills, skill signals, skill candidates, and promoted skills must remain separate concepts.
- The team still lacks GitNexus `detect_changes`; use analyze/status fallback before commits until the CLI supports detect-change parity.

### Git Intelligence

- Recent commit `32177ed` added procedural learning outputs under learning review artifacts and confirmed no active skill registry writes.
- Recent commit `24db782` closed Epic 4 and recorded Epic 5 guardrails: candidate-first, no hidden authority, explicit user approval before promotion, safe artifact validation, and visible skill influence.
- GitNexus context for `createProgram` shows the CLI command registration function at `packages/cli/src/index.ts:395-569` with `runCli` as its direct caller.
- GitNexus impact for `createProgram` before story creation was LOW at depth 1, but implementation must rerun impact before editing because the working tree and index can change.
- GitNexus context/impact for `assembleTaskContextPacket` was LOW at depth 1. If implementation updates task-context skills behavior, rerun impact before editing that symbol.

### Suggested Contracts and Functions

Report this list before implementation and revise it if code inspection shows a better existing seam:

- `SKILL_REGISTRY_SCHEMA_VERSION` — schema/version marker for listing result contracts if needed.
- `SKILL_REGISTRY_SOURCES` — allowed sources, likely `project` and `global`.
- `SKILL_LIFECYCLE_STATES` — initial states, likely `manual` and `unavailable`; do not add candidate/promoted lifecycle behavior in this story.
- `SkillRegistrySource` — source discriminant for project/global.
- `SkillLifecycleState` — safe listing lifecycle state.
- `SkillRegistryEntry` — available skill list item with `id`, `name`, `description`, `source`, `lifecycleState`, `activationHint`, and safe relative path/source metadata.
- `UnavailableSkillRegistryEntry` — unavailable item with source/path/warning references but no unsafe raw content.
- `SkillRegistryWarning` — structured warning with code, message, source, path/id if safe, and severity.
- `ListSkillsResult` — aggregate result with registry roots, skills, unavailable skills or warnings.
- `resolveSkillRegistryRoots()` — determine project/global registry roots from cwd/HOME or explicit options.
- `listAvailableSkills()` — read-only registry scanner and safe result generator.
- `readSkillManifest()` / `parseSkillFrontmatter()` — minimal no-dependency `SKILL.md` metadata parser.
- `validateSkillRegistryEntry()` — reject malformed/unsafe fields and path escapes.
- `renderSkillsListText()` / `renderSkillsListJson()` — CLI rendering helpers if the CLI owns rendering.
- `createProgram()` update — add `skills list` command only; do not alter task execution behavior.

### File Structure Expectations

Likely files to modify:

- `packages/skills/src/index.ts`
- `packages/skills/package.json`
- `packages/core/src/index.ts` and/or a small core wrapper file if the shared runtime/core API owns skill listing
- `packages/core/package.json` if core imports `@sprite/skills`
- `packages/cli/src/index.ts`
- `packages/cli/package.json` only if CLI directly imports `@sprite/skills`; prefer core wrapper to keep CLI thin
- `package.json` root `files` if distribution includes `@sprite/skills`
- `tests/skill-registry.test.ts` or equivalent
- `tests/cli-smoke.test.ts`
- `tests/task-context.test.ts` only if task-context or runtime self-model output changes

Avoid:

- Scanning `.codex/skills`, `.agents/skills`, BMAD skill directories, or native Codex agent prompts as Sprite runtime skills.
- Loading full skill bodies into task context.
- Invoking skills.
- Creating `skill.signal.recorded`, `skill.candidate.created`, or skill usage events.
- Creating `.sprite/skill-candidates` or promoted skill artifacts.
- Reading Story 4.7 procedural outputs as active/manual skills.
- Adding new dependencies.

### Testing Requirements

- Use Vitest and existing temp workspace patterns from `tests/cli-smoke.test.ts`.
- Start with red tests before implementation.
- Test missing project/global registry roots produce an empty success result, not an error.
- Test a valid project `SKILL.md` and global `SKILL.md` are both listed with source distinction and safe manual invocation hint.
- Test malformed entries are represented as unavailable warnings and do not crash `sprite skills list`.
- Test secret-looking metadata is redacted or rejected and does not appear in text/json output.
- Test stable ordering for deterministic output.
- Test no task/session artifacts, no skill candidate artifacts, and no active promotion files are created by listing.
- Run full validation before done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.

### Project Structure Notes

- Manual runtime skill registry roots for this story should be product/runtime paths: project `.sprite/skills` and global `$HOME/.sprite/skills`.
- Codex orchestration skills in `.codex/skills`, `.agents/skills`, and installed BMAD skill directories are not Sprite runtime skills.
- The `skills` task-context source already exists as a placeholder. Story 5.1 can leave task context skipped until Story 5.2 unless the implementation intentionally exposes listed registry summaries.
- If `@sprite/skills` becomes a real imported package, package exports and root distribution file lists must be updated intentionally.

### Research Notes

- No web research is required for Story 5.1 because this is local TypeScript filesystem/CLI work with no new SDK, package, or external API adoption.
- Do not add frontmatter/YAML dependencies. A bounded parser for simple `key: value` frontmatter is enough for this story.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- 2026-05-09: Story created from Epic 5 backlog using BMAD create-story flow after Epic 4 retrospective closeout.
- 2026-05-09: Loaded Epic 5 Story 5.1 requirements, PRD FR52 and skill lifecycle NFRs, architecture skill evolution guidance, Epic 4 retrospective guardrails, current `packages/skills` placeholder, CLI command patterns, task-context skills placeholder, and recent GitNexus context/impact for `createProgram` and `assembleTaskContextPacket`.
- 2026-05-09: No web research needed; implementation should use existing TypeScript/Vitest/Node filesystem APIs and no new dependencies.

### Completion Notes List

- Story context created with manual skill registry scope, product/runtime skill path boundaries, no-invocation/no-promotion guardrails, likely contracts/functions, and test expectations.

### File List

- `_bmad-output/implementation-artifacts/5-1-list-available-skills-from-manual-skill-registry.md`

## Change Log

- 2026-05-09: Created story context for listing available skills from the manual skill registry.
