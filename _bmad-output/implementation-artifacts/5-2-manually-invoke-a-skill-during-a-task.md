# Story 5.2: Manually Invoke a Skill During a Task

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to manually invoke a skill,
so that I can reuse a known workflow when I decide it is relevant.

## Acceptance Criteria

1. Given a valid skill is available, when the user manually invokes it during a task, then the runtime loads the skill content into the task context according to the skill loading rules, and records that the skill was invoked by the user.
2. Given the requested skill is unavailable, invalid, ambiguous, unreadable, unsafe, or blocked by policy, when the user invokes it, then Sprite Harness returns a structured recoverable error, and the task can continue without that skill.

## Tasks / Subtasks

- [ ] Confirm implementation function list before code edits (AC: 1-2)
  - [ ] Report exact functions/contracts to add or modify before touching implementation files.
  - [ ] Run GitNexus impact analysis before editing existing symbols, especially `listAvailableSkills`, `validateSkillRegistryEntry`, `assembleTaskContextPacket`, `createProgram`, and runtime event validators.
  - [ ] Keep this story invocation-only: no automatic skill selection, no usage/influence analytics, no skill candidate generation, no promotion, and no hidden authority changes.
  - [ ] Preserve the Story 5.1 safety boundary: public registry listing remains sanitized and must not expose raw filesystem paths or full skill bodies.

- [ ] Define manual skill invocation contracts in `packages/skills` (AC: 1-2)
  - [ ] Add an invocation mode contract, initially `manual`.
  - [ ] Add structured status/error contracts for loaded and recoverable-failure outcomes.
  - [ ] Add a skill reference format that can resolve an exact unique skill by name or disambiguate by source, for example `project:<name>` and `global:<name>`.
  - [ ] Treat duplicate names without a source qualifier as ambiguous and recoverable, not as project-precedence magic.
  - [ ] Do not add candidate/promoted lifecycle behavior in this story.

- [ ] Implement safe skill content loading (AC: 1-2)
  - [ ] Resolve the skill from trusted registry roots, not from sanitized public listing paths.
  - [ ] Refactor or add internal descriptors if needed so raw manifest paths stay internal to the loader and never appear in public CLI/runtime output.
  - [ ] Load only a valid `SKILL.md` from `.sprite/skills/<skill-dir>/SKILL.md` under the project or global registry root.
  - [ ] Strip frontmatter from the context body or otherwise avoid duplicating metadata in task context.
  - [ ] Bound loaded content length and report truncation metadata if truncation occurs.
  - [ ] Block or redact secret-like/private-key/raw-output content before it can enter task context, logs, events, or CLI output.
  - [ ] Do not execute commands from the skill; skill content is procedural guidance only.

- [ ] Wire manual invocation into task context assembly (AC: 1)
  - [ ] Extend `TaskContextSkillInput` or add a focused invoked-skill input type that includes safe metadata, invocation mode, and bounded content.
  - [ ] Update the skills section so manually invoked skills are visible in task context with clear lower-priority procedural guidance.
  - [ ] Update task context metadata/self-model so it records loaded skill names and manual invocation mode without implying automatic influence analysis.
  - [ ] Ensure no skill section is injected when invocation fails or when no skill is requested.

- [ ] Add runtime/CLI surface for manual invocation (AC: 1-2)
  - [ ] Add a task-level CLI option such as repeatable `--skill <name-or-source-qualified-name>` that works for interactive tasks and `--print` tasks.
  - [ ] Route CLI invocation through the shared runtime/core boundary instead of duplicating skill loading in the CLI renderer.
  - [ ] On successful invocation, continue the task with the loaded skill in context.
  - [ ] On recoverable invocation failure, surface a structured warning/error and continue the task without that skill.
  - [ ] Keep `sprite skills list` behavior unchanged except for any shared contract additions needed by invocation.

- [ ] Record explicit user invocation in runtime events/audit output (AC: 1-2)
  - [ ] Add runtime event validation for a minimal manual invocation record, for example `skill.invoked`.
  - [ ] Add a recoverable failed-attempt event if the task event stream already has an appropriate place for recoverable failures, for example `skill.invocation.failed`; otherwise record the recoverable error in task output and document why no event is emitted.
  - [ ] Event payloads must include safe skill id/name/source, `invocationMode: "manual"`, `invokedBy: "user"`, and status/error code.
  - [ ] Event payloads must not include full skill content, raw paths, secrets, private keys, stdout/stderr, diffs, or patches.

- [ ] Add regression tests (AC: 1-2)
  - [ ] Skills package tests: valid manual invocation resolves a project skill and loads bounded content.
  - [ ] Skills package tests: source-qualified lookup disambiguates project/global duplicate names.
  - [ ] Skills package tests: duplicate unqualified names return structured ambiguous recoverable error.
  - [ ] Skills package tests: missing, malformed, unreadable, path-escaping, unsafe, or policy-blocked skill returns structured recoverable error and no context body.
  - [ ] Task-context tests: invoked skill content appears in the skills section and metadata/self-model records manual invocation.
  - [ ] Runtime event tests: `skill.invoked` and any failed-attempt event validate safe payloads and reject raw content/unsafe fields.
  - [ ] CLI smoke tests: `sprite --skill <name> --print "<task>"` loads the skill, while invalid `--skill` continues without crashing and emits a structured recoverable warning/error.

- [ ] Update story evidence and lifecycle status (AC: 1-2)
  - [ ] Record implementation notes, changed files, validation evidence, and remaining limitations in this story file.
  - [ ] Move status to `in-progress` when development starts, `review` when implementation validation passes, and `done` only after review fixes are complete.
  - [ ] Run targeted validation before review: skills package tests, task-context tests, runtime-events tests, CLI smoke tests, and typecheck.
  - [ ] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [ ] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 5.2 turns the read-only manual skill registry from Story 5.1 into an explicit user-controlled invocation path. A user should be able to name a known skill for a task and have Sprite Harness load that skill as bounded procedural context.

This is not automatic skill routing. The system must not decide that a skill applies on its own, must not mark the skill as influential beyond the fact that it was manually loaded, and must not promote or generate skills.

The implementation should answer four audit questions:

1. Which exact skill did the user request?
2. Was the skill available and safe to load?
3. If loaded, what bounded safe skill context entered the task packet?
4. If not loaded, did the task continue with a structured recoverable error?

### Source Requirements

- Story 5.2 requires a valid available skill to load into task context when manually invoked, and to record that the invocation was user-initiated. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.2]
- Story 5.2 requires unavailable, invalid, or policy-blocked skills to return a structured recoverable error while the task continues without that skill. [Source: `_bmad-output/planning-artifacts/epics.md` Story 5.2]
- FR53 requires users to manually invoke a skill. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- FR54 and FR58 are intentionally deferred to Story 5.3; do not implement full skill usage/influence tracking here. [Source: `_bmad-output/planning-artifacts/epics.md` Stories 5.3 and 5.2 sequencing]
- NFR23 requires task audit trails to include skill signals when relevant. For Story 5.2, record the manual invocation itself, but leave influence summary/usage state to Story 5.3. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR28 requires the agent to explain which memory, lesson, skill signal, or self-model state influenced a task when applicable. Story 5.2 should only state the skill was manually loaded; it should not infer influence. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR29 requires CLI, TUI, and RPC to share one runtime capability model. Implement the CLI over shared core/runtime invocation APIs so TUI/RPC can reuse the same behavior later. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- NFR35 requires local-first sessions, memory, skills, and learned procedures. Manual invocation should read local `.sprite/skills` registries only. [Source: `_bmad-output/planning-artifacts/prd.md` Packaging and Local-First]
- Architecture treats `Skill` as reviewed procedural guidance and `TaskContext` as assembled prompt input from user task, project context, session state, memory, skills, provider limits, and self-model. [Source: `_bmad-output/planning-artifacts/architecture.md` Core Domain Objects]
- Architecture says memory and skill systems consume events and learning reviews but should not directly control the agent loop. Manual invocation should be an explicit input to context assembly, not an autonomous controller. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Skill Systems]
- Architecture requires secrets and credentials not to be saved to memory, logs, summaries, RPC state, or learning reviews; apply the same safety rule to loaded skill content and invocation events. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Implementation Baseline

- `packages/skills/src/index.ts` already exposes the Story 5.1 manual registry listing surface:
  - `SKILL_REGISTRY_SCHEMA_VERSION`
  - `SKILL_REGISTRY_SOURCES`
  - `SKILL_LIFECYCLE_STATES`
  - `resolveSkillRegistryRoots`
  - `listAvailableSkills`
  - `parseSkillFrontmatter`
  - `validateSkillRegistryEntry`
- Story 5.1 listing returns sanitized/redacted path previews. Do not use those public path strings as filesystem authority for invocation. The invocation loader needs trusted internal root-relative resolution.
- `packages/core/src/skill-registry.ts` currently provides a thin `listSkills()` wrapper over `@sprite/skills`.
- `packages/core/src/task-context.ts` already supports a `skills` source and `TaskContextSkillInput` with `name`, `description`, and `source`, but it does not load manual registry content yet.
- `assembleTaskContextPacket()` currently marks `skillRegistryLoaded` and `skillNames` metadata based on provided `skillEntries`; Story 5.2 can extend this path for invoked skills.
- `packages/cli/src/index.ts` currently supports `sprite skills list --output text|json`; Story 5.2 should preserve that command and add a task-level invocation option.
- `packages/core/src/runtime-events.ts` has no skill invocation event type yet. It already validates task, learning, memory, policy, approval, validation, file, and tool events; Story 5.2 likely needs a small skill invocation validator.

### Previous Story Intelligence

- Story 5.1 created the safe registry/listing boundary and committed:
  - `c61079c` — exposes the manual skill registry safely.
  - `53f8a1a` — closes skill registry safety gaps.
- Story 5.1 review found two important safety lessons:
  - Compound sensitive metadata keys such as `apiToken`, `clientSecret`, `credentialFile`, `privateKeyPem`, and `rawOutputFile` must be rejected or redacted.
  - Registry path previews can contain secret-like substrings and must be redacted before output.
- Story 5.1 explicitly avoided loading full skill bodies, invoking skills, emitting task runtime events, and creating skill candidates. Story 5.2 may load a full bounded body only because the user explicitly invokes a skill during a task.
- Story 4.7 and the Epic 4 retrospective established that procedural learning outputs are candidate evidence, not active skills. Do not read `procout_` records as manually invokable skills.
- The GitNexus CLI still may not expose `detect_changes`; use analyze/status fallback before commits until the CLI supports detect-change parity.

### Suggested Contracts and Functions

Before implementation, report and adjust this function list based on direct code inspection:

- `SkillInvocationMode` — initially `"manual"`.
- `SkillInvocationStatus` — for example `"loaded"` and `"failed"`.
- `SkillInvocationErrorCode` — structured recoverable codes, likely:
  - `SKILL_NOT_FOUND`
  - `SKILL_AMBIGUOUS`
  - `SKILL_UNAVAILABLE`
  - `SKILL_BLOCKED_BY_POLICY`
  - `SKILL_CONTENT_UNREADABLE`
  - `SKILL_CONTENT_UNSAFE`
  - `SKILL_PATH_ESCAPE`
  - `SKILL_CONTENT_TRUNCATED` as warning metadata rather than failure if truncation is safe.
- `SkillInvocationRequest` — requested skill reference, cwd/home overrides, optional max content length, and invocation mode.
- `ManualSkillInvocationResult` or `InvokeSkillResult` — discriminated result with safe loaded skill metadata or structured recoverable error.
- `InvokedSkillContext` — safe metadata plus bounded content intended for task context assembly.
- `parseSkillReference()` — parse `<name>` and `<source>:<name>` references without allowing path traversal.
- `resolveSkillForInvocation()` — select exactly one valid available skill from trusted roots.
- `loadSkillContent()` — internal raw-path read bounded by registry root checks.
- `invokeManualSkill()` — high-level skills package entry point combining reference resolution, validation, content loading, and recoverable errors.
- `invokeSkill()` or `loadManualSkillsForTask()` in core/runtime — shared boundary for CLI/TUI/RPC.
- `TaskContextSkillInput` extension — include safe `id`, `invocationMode`, `content`, truncation metadata, and source.
- `createSkillsSection()` update — render invoked skill content as procedural guidance, not as system/developer authority.
- `validateSkillInvokedEvent()` and optional `validateSkillInvocationFailedEvent()` — runtime event validators.
- `createProgram()` update — add repeatable task-level `--skill` option and pass it into task execution.

### Loading Rules

- Only explicit user invocation loads a skill into task context.
- Valid roots are project `.sprite/skills` and global `$HOME/.sprite/skills`, matching Story 5.1.
- A valid invokable skill is a directory under a trusted root containing `SKILL.md`.
- Lookup by unqualified name must resolve exactly one available skill. If both project and global skills share the same name, return `SKILL_AMBIGUOUS` unless the user qualifies the source.
- Lookup by source-qualified reference must only search that source.
- The loader must check that the resolved manifest path is still inside the expected registry root before reading.
- Skill body content must be bounded, deterministic, and safe. If a max length is exceeded, prefer safe truncation with metadata over unbounded context growth.
- If unsafe content is detected, block loading and return a recoverable error rather than injecting unsafe text.
- The context should identify the skill name/source and then include the bounded procedural body. It should not include raw filesystem paths.

### Safety and Authority Rules

- Skill content is untrusted procedural guidance below system, developer, and current user instructions.
- Manual invocation is not permission to execute arbitrary commands from the skill.
- Manual invocation is not approval for risky tools, broad file edits, memory writes, candidate promotion, or external side effects.
- Events, logs, summaries, CLI output, and task context must not include secrets, private keys, raw stdout/stderr blobs, diffs, patches, or unbounded file content from skill artifacts.
- Failed invocation must not fail the whole task unless the task itself cannot otherwise run. The user-facing result should say the task continued without the skill.

### CLI Interface Recommendation

Prefer a task-level option over a separate command:

```bash
sprite --skill project:testing-workflow --print "write tests for the new loader"
sprite --skill code-review "review this change"
```

Rationale:

- The story says invocation happens during a task.
- The option can be reused later by TUI/RPC through a shared runtime input contract.
- `sprite skills list` remains a discovery command from Story 5.1.

If implementation discovers the current CLI parser cannot support a top-level task option cleanly, use the smallest equivalent task-level surface and document it in this story before coding.

### Testing Guidance

Use temp directories for cwd and HOME so tests do not read real user skills.

Minimum targeted tests:

- `tests/skill-registry.test.ts`
  - Valid skill invocation reads safe body content.
  - Unqualified duplicate name returns `SKILL_AMBIGUOUS`.
  - `project:<name>` and `global:<name>` resolve deterministically.
  - Missing skill returns `SKILL_NOT_FOUND`.
  - Unsafe body/frontmatter returns `SKILL_CONTENT_UNSAFE` or equivalent.
  - Path escape returns `SKILL_PATH_ESCAPE` or equivalent.
- `tests/task-context.test.ts`
  - Manual invoked skill content appears in the skills section.
  - Context metadata records skill names, source, and manual invocation mode.
  - No failed/unloaded skill content appears in the packet.
- `tests/runtime-events.test.ts`
  - Skill invocation event validates a safe manual payload.
  - Event validation rejects raw content/path/secret-like payload fields.
- `tests/cli-smoke.test.ts`
  - Valid `--skill` works with `--print`.
  - Invalid `--skill` reports recoverable error and does not crash.

### Project Structure Notes

Likely files to modify:

- `packages/skills/src/index.ts`
- `packages/core/src/skill-registry.ts`
- `packages/core/src/task-context.ts`
- `packages/core/src/agent-runtime.ts` or the current task submission boundary if skill inputs are wired there
- `packages/core/src/runtime-events.ts`
- `packages/cli/src/index.ts`
- `tests/skill-registry.test.ts`
- `tests/task-context.test.ts`
- `tests/runtime-events.test.ts`
- `tests/cli-smoke.test.ts`

Avoid:

- New runtime dependencies.
- Reading `.codex/skills`, `.agents/skills`, BMAD skills, or native Codex agent prompts as product runtime skills.
- Reusing sanitized listing paths as filesystem authority.
- Full skill usage/influence tracking, which belongs to Story 5.3.
- Skill signal recording, candidate generation, candidate review, or promotion, which belong to Stories 5.4-5.7.

### Research Notes

No external web research is required for this story. The implementation is local TypeScript/runtime work based on existing Story 5.1 registry behavior, the Epic 5 acceptance criteria, and the architecture guardrails.

## Dev Agent Record

### Agent Model Used

TBD during implementation.

### Debug Log References

TBD during implementation.

### Completion Notes List

TBD during implementation.

### File List

TBD during implementation.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-05-09 | 0.1 | Created ready-for-dev story for manual skill invocation during tasks. | Codex |
