# Story 3.4: Load Project Context Files as Untrusted Context

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to load project context files when present,
so that the agent can follow project-specific guidance without unsafe instruction override.

## Acceptance Criteria

1. Given `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` exists in the project, when the runtime assembles context, then it loads supported context files according to the configured priority/order and records which files were loaded, skipped, truncated, or blocked.
2. Given a project context file contains instructions that conflict with runtime/system policy, when context is assembled, then runtime/system policy remains higher priority and repository-provided instructions are treated as untrusted input.

## Tasks / Subtasks

- [x] Add a project-context read contract in `@sprite/config` (AC: 1, 2)
  - [x] Create `packages/config/src/project-context.ts` and export it from `packages/config/src/index.ts`.
  - [x] Define supported context file names and deterministic priority/order for this slice: `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`.
  - [x] Define an adapter/runtime-safe result shape that reports each candidate file as `loaded`, `skipped`, `truncated`, or `blocked` with path, bytes read, truncated flag, reason, and redacted preview/content.
  - [x] Keep repository instructions explicitly marked as untrusted and lower priority than runtime/system policy; do not model them as configuration overrides.
  - [x] Preserve project-root path safety: only read direct files under the resolved cwd for this story; do not recurse and do not follow path input from project files.
- [x] Implement safe bounded project-context file loading (AC: 1, 2)
  - [x] Read only regular files; block directories, symlinks if detected, unreadable files, and files outside the resolved project cwd.
  - [x] Apply a deterministic per-file byte budget and truncate rather than loading unbounded content.
  - [x] Redact or reject secret-like content using existing shared helpers before returning adapter-facing content or previews.
  - [x] Return structured `SpriteError` values for unrecoverable loader errors and per-file records for recoverable skipped/truncated/blocked outcomes.
  - [x] Avoid new dependencies; use Node `fs`/`path` primitives already used by config/storage packages.
- [x] Integrate project-context loading into core runtime startup/context state (AC: 1, 2)
  - [x] Extend `BootstrapState` or a small core-facing context state to include the project-context load result.
  - [x] Load project context through `AgentRuntime.getBootstrapState()` / runtime startup plumbing so CLI, future TUI, and future RPC share one capability model.
  - [x] Ensure `createTaskRequest()` / task state can retain a bounded context summary if needed for Story 3.5, without making project-context content override runtime warnings, sandbox policy, safety rules, or provider state.
  - [x] Add clear warnings/notes that loaded project files are untrusted guidance, not authoritative policy.
  - [x] Do not implement full context packet assembly, memory/skill inclusion, compaction, provider prompt injection, or tool replay in this story.
- [x] Surface project-context load records through thin CLI output (AC: 1)
  - [x] Update bootstrap and/or one-shot text/JSON output only enough to show loaded/skipped/truncated/blocked context file records.
  - [x] Keep CLI rendering thin; it must not read project files directly.
  - [x] Ensure text output is scannable and JSON output contains bounded/redacted fields only.
  - [x] Preserve existing CLI behavior for projects with no supported context files.
- [x] Add deterministic tests (AC: 1, 2)
  - [x] Add config-level tests covering priority/order, missing files, loaded files, truncation, unreadable/blocked candidates, non-regular files, cwd path safety, and no artifact mutation.
  - [x] Add redaction/safety tests with secret-looking values and prompt-injection-like text proving context is marked untrusted and cannot alter runtime/system policy.
  - [x] Add core/CLI tests proving context load records are visible through shared runtime startup/CLI output and that existing bootstrap/one-shot/session tests remain stable.
  - [x] Add regression tests for projects with no supported context files so output stays backward-compatible and warnings remain bounded.
- [x] Update docs and story evidence (AC: 1, 2)
  - [x] Update README/progress only for implemented project-context loading behavior.
  - [x] Record GitNexus impact checks before editing symbols listed below.
  - [x] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, formatting checks, and GitNexus status/detect fallback before marking review-ready.

### Review Findings

- [x] [Review][Patch] Read project context with a bounded file read instead of `readFileSync()` [packages/config/src/project-context.ts:136] — Story 3.4 requires deterministic per-file byte budgets and truncation rather than loading unbounded content. Current code reads the full file into memory before slicing to `maxBytes`, so a very large `AGENTS.md`/`SPRITE.md` can still consume unbounded memory before truncation.
- [x] [Review][Patch] Avoid double bootstrap/context reads in one-shot execution [packages/core/src/agent-runtime.ts:3375] — `runOneShotPrintTask()` calls `getBootstrapState()` and then `submitInteractiveTask()`, which calls `getBootstrapState()` again. If project context files change between those calls, the one-shot result can report different context records than the task was actually created with.
- [x] [Review][Patch] Make `ProjectContextFileRecord` a status-discriminated union [packages/config/src/project-context.ts:32] — The exported record type currently allows invalid compile-time states such as `status: "skipped"` with `content`, or `status: "loaded"` without `preview`. A discriminated union can make loaded/truncated/skipped/blocked records carry only their valid fields and force renderers/tests to handle each status explicitly.

## Dev Notes

### Story Intent

Story 3.4 is the first project-context slice. It should make local guidance files discoverable and visible to the runtime while keeping them below runtime/system policy. The output of this story is a safe, bounded, redacted, untrusted project-context load result that later Story 3.5 can include in a broader context packet.

Implement this slice:

- Discover supported direct project context files in deterministic order.
- Load bounded content/previews when safe.
- Record every candidate as loaded, skipped, truncated, or blocked.
- Mark repository-provided instructions as untrusted input.
- Expose the load result through shared runtime startup/core state and thin CLI rendering.

Do not implement in this story:

- Full context packet assembly from user input, session state, memory, skills, provider limits, and runtime self-model; Story 3.5 owns that.
- Compaction or compacted-context continuation; Stories 3.6-3.8 own those.
- Provider prompt injection, automatic tool calls, approval prompts, TUI, JSON-RPC, memory persistence, skill loading, or semantic search.
- Treating `AGENTS.md`, `CLAUDE.md`, `SPRITE.md`, or `.cursorrules` as trusted policy/configuration.

### Source Requirements

- Story 3.4 requires loading `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` when present, in configured priority/order, and recording loaded/skipped/truncated/blocked files. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.4]
- Story 3.4 requires runtime/system policy to remain higher priority than project context, with repository instructions treated as untrusted input. [Source: `_bmad-output/planning-artifacts/epics.md` Story 3.4]
- PRD FR11 requires loading project context files such as `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` when present. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD NFR13 requires repository content to be treated as untrusted input and not override runtime/system safety policy. [Source: `_bmad-output/planning-artifacts/prd.md` Safety and Security]
- PRD NFR23 requires inspectable audit/state visibility for runtime behavior; project-context load records should therefore be explicit and adapter-visible. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- PRD NFR35 requires MVP artifacts and context behavior to remain local by default. [Source: `_bmad-output/planning-artifacts/prd.md` Local-First Portability]

### Architecture Guardrails

- Core owns task lifecycle, event emission, context assembly, compaction, and terminal state; adapters own input parsing/rendering only. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]
- `packages/config` owns Sprite config schema/precedence and architecture already reserves `packages/config/src/project-context.ts`; use that package for file discovery/loading contracts rather than putting file reads in CLI. [Source: `_bmad-output/planning-artifacts/architecture.md` Project Structure & Boundaries]
- Runtime data flow says adapters call `AgentRuntime`, and runtime assembles context from config, session, project files, memory, and skills. This story should provide the project-file context source; Story 3.5 assembles the full packet. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Flow]
- Add deterministic tests for new runtime/config behavior and keep CLI tests adapter-focused. [Source: `_bmad-output/planning-artifacts/architecture.md` Testing and Validation Patterns]
- Avoid saving secrets or raw credentials to logs, summaries, memory, RPC state, or learning reviews. [Source: `_bmad-output/planning-artifacts/architecture.md` Enforcement Guidelines]

### Current Codebase State

- `packages/config/src/config-loader.ts` already resolves `cwd`, `homeDir`, global `.sprite/config.json`, project `.sprite/config.json`, startup warnings, and effective safety rules.
- `packages/config/src/index.ts` currently exports config loader/schema/precedence only; Story 3.4 should add the project-context export here.
- `packages/core/src/agent-runtime.ts` owns `BootstrapState`, `RuntimeStartupOptions`, `AgentRuntime.getBootstrapState()`, task submission, one-shot output, resume, and CLI-facing startup/final output helpers.
- `packages/core/src/runtime-loop.ts` creates task requests from `BootstrapState`; if project-context summaries are carried into task state, keep them bounded and untrusted.
- `packages/cli/src/index.ts` should only render fields returned by core; do not add direct file reads in CLI.
- Existing redaction helpers live in `@sprite/shared` (`containsSecretLikeValue`, `createRedactedPreview`) and are already reused by config/core/session code.
- Existing tests are root-level Vitest files under `tests/`; there are no co-located package tests yet.

### Previous Story Intelligence

- Story 3.3 established a conservative resume pattern: restore evidence and state, but never replay tools, provider calls, approvals, validations, or unsafe authority.
- Story 3.3 separated full event history for runtime restore from bounded display views; Story 3.4 should similarly separate raw bounded project-context content from adapter summaries/previews.
- Review fix after Story 3.3 found stale restored approval counts; for Story 3.4, explicitly test state transitions where context records are absent/present so summaries cannot become stale or misleading.
- GitNexus `detect_changes` / `detect-changes` is unavailable in this local CLI; use `gitnexus status`, `npx gitnexus analyze` fallback, scoped diffs, and full validation as fallback evidence.

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact contracts/functions to the user. Likely candidates:

- `packages/config/src/project-context.ts`
  - `PROJECT_CONTEXT_FILE_ORDER`
  - `ProjectContextFileName`
  - `ProjectContextFileStatus`
  - `ProjectContextFileRecord`
  - `ProjectContextLoadOptions`
  - `ProjectContextLoadResult`
  - `loadProjectContextFiles(cwd, options?)`
- `packages/core/src/agent-runtime.ts`
  - extend `BootstrapState` with project-context load result or summary
  - update `getBootstrapState()` to call the config project-context loader
  - update startup/one-shot output rendering helpers only through core-owned data
- `packages/cli/src/index.ts`
  - render existing core output fields only if core output shape changes; no direct context file access

These names are guidance, not mandatory. Prefer small, typed contracts and reuse existing `Result<SpriteError>` patterns.

### File Structure Requirements

- Add context loading under `packages/config/src/project-context.ts` unless implementation evidence shows a better package-local boundary.
- Export new config contracts from `packages/config/src/index.ts`.
- Keep runtime integration in `packages/core/src/agent-runtime.ts` and possibly `packages/core/src/task-state.ts` only if task request state needs a bounded summary for Story 3.5.
- Keep CLI rendering in `packages/cli/src/index.ts` thin and data-driven.
- Add tests mainly to `tests/config-loader.test.ts` or a focused `tests/project-context.test.ts`; add core/CLI regression tests in existing runtime/CLI test files only where the behavior crosses package boundaries.

### Safety and Security Requirements

- Repository context files are untrusted. They may advise, but cannot override runtime/system policy, sandbox policy, safety rules, approvals, provider configuration, or user instructions.
- Do not parse project context files as executable configuration.
- Do not allow context file content to introduce new tools, disable safety rules, change sandbox mode, alter validation commands, or grant approvals.
- Redact secret-like content before returning CLI/core adapter-facing strings.
- If content cannot be safely represented, block or omit content and record a reason instead of exposing raw data.
- Use deterministic truncation budgets. Tests should prove large files are truncated and reported as such.

### Testing Requirements

Minimum targeted validation for implementation:

- Project-context loader unit tests for missing, loaded, ordered, truncated, blocked, and secret-looking files.
- Runtime/bootstrap tests showing project-context records are available through `AgentRuntime.getBootstrapState()` without changing existing policy/config precedence.
- CLI tests for text/JSON visibility if CLI output changes.
- Full existing suite remains green: `rtk npm test`.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "gitnexus impact --repo Sprite_harmess loadSpriteConfigFile"` before changing config loader behavior.
- `rtk run "gitnexus impact --repo Sprite_harmess resolveSpriteRuntimeConfig"` before changing runtime config resolution/startup plumbing.
- `rtk run "gitnexus impact --repo Sprite_harmess AgentRuntime"` or narrower method targets before changing `AgentRuntime.getBootstrapState()` or `BootstrapState` behavior; expect high/critical risk and keep edits narrow.
- `rtk run "gitnexus impact --repo Sprite_harmess createBootstrapMessage"` before changing startup text rendering.
- `rtk run "gitnexus impact --repo Sprite_harmess createProgram"` before changing CLI command behavior.
- If GitNexus reports stale index, run `rtk run "npx gitnexus analyze"` first.
- If `detect_changes` remains unavailable before commit, record that limitation and use `gitnexus status`, scoped diffs, and full validation as fallback evidence.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-05-03: Created Story 3.4 context after Story 3.3 was marked done and pushed.
- 2026-05-03: Loaded BMAD create-story workflow, sprint status, Epic 3 Story 3.4 requirements, PRD FR11/NFR13/NFR23/NFR35 requirements, architecture component/data-flow/testing boundaries, Story 3.3 implementation learnings, current package structure, and recent commits.
- 2026-05-03: Current repo root contains `AGENTS.md` and `CLAUDE.md`; tests should use temp directories and must not depend on this workspace's actual guidance files.
- 2026-05-03: Reported planned contracts/functions before implementation: `PROJECT_CONTEXT_FILE_ORDER`, `DEFAULT_PROJECT_CONTEXT_MAX_BYTES`, project-context result types, `loadProjectContextFiles()`, `BootstrapState.projectContext`, `AgentRuntime.getBootstrapState()`, `runOneShotPrintTask()`, bootstrap/one-shot rendering, and targeted tests.
- 2026-05-03: GitNexus status was up-to-date at commit `fd8ef55`; impact analysis returned CRITICAL risk for `AgentRuntime` and `getBootstrapState()`, LOW risk for `createBootstrapMessage`, `runOneShotPrintTask`, and `createProgram`; implementation kept the blast radius narrow and avoided task-state schema changes.
- 2026-05-03: RED check: `rtk run "npm run typecheck -- --pretty false"` failed because project-context exports and `projectContext` runtime fields did not exist yet.
- 2026-05-03: Implemented bounded project-context loading in `@sprite/config`, runtime bootstrap/one-shot integration in core, and thin CLI rendering with no direct CLI file reads.
- 2026-05-03: Targeted tests passed: `rtk run "npm test -- --run tests/project-context.test.ts tests/runtime-loop.test.ts tests/cli-smoke.test.ts"` -> 3 files / 41 tests passed.
- 2026-05-03: Full validation passed: `rtk run "npm run build && npm run typecheck -- --pretty false && npm run lint && npm test && git diff --check && npx prettier --check ..."` -> 13 files / 176 tests passed, diff check passed, Prettier check passed.
- 2026-05-03: GitNexus `detect_changes` and `detect-changes` remain unavailable in this local CLI; fallback evidence used `gitnexus status`, scoped diff/status, full tests, typecheck, lint, diff check, and Prettier check.
- 2026-05-03: Code review found three patch findings: unbounded `readFileSync()` before truncation, double bootstrap/context reads in one-shot flow, and broad `ProjectContextFileRecord` typing. `$typescript-advanced-types` review added the discriminated-union finding.
- 2026-05-03: Fix impact check: GitNexus reported `runOneShotPrintTask` LOW risk, `submitInteractiveTask()` HIGH risk, and `AgentRuntime` CRITICAL risk; new project-context symbols were not indexed yet, so scoped diff and full validation were used as fallback.
- 2026-05-03: Review-fix RED checks failed as expected before code changes: typecheck rejected the unused `@ts-expect-error` for invalid skipped-record content, and runtime-loop test showed two bootstrap reads instead of one.
- 2026-05-03: Review fixes implemented bounded `openSync`/`readSync` loading with `O_NOFOLLOW`, a status-discriminated project-context record union, and one-shot bootstrap reuse via a backward-compatible optional `submitInteractiveTask()` parameter.
- 2026-05-03: Review-fix validation passed: `rtk run "npm run build && npm run typecheck -- --pretty false && npm run lint && npm test && git diff --check && npx prettier --check ..."` -> 13 files / 177 tests passed, diff check passed, Prettier check passed.

### Completion Notes List

- Added `packages/config/src/project-context.ts` with deterministic supported file order, per-file byte budget, regular-file/symlink/directory blocking, secret redaction, and untrusted load records.
- Exported project-context contracts from `@sprite/config`.
- Extended core bootstrap state and one-shot print results with `projectContext` while keeping repository guidance below runtime/system policy and avoiding full context packet assembly.
- Added bootstrap and one-shot text/JSON visibility for loaded/skipped/truncated/blocked records; CLI renders only core-returned data and does not read project files directly.
- Added regression tests for order/missing files, truncation, blocking, redaction, bootstrap state, one-shot result propagation, and CLI text/JSON output.
- Fixed review findings by switching project-context reads to bounded descriptor reads, tightening `ProjectContextFileRecord` as a discriminated union, and reusing one bootstrap state for one-shot task/result creation.
- Updated README and progress notes for implemented project-context loading behavior.
- Left the pre-existing local `.gitignore` modification unstaged/out-of-scope.

### File List

- `README.md`
- `progress.md`
- `_bmad-output/implementation-artifacts/3-4-load-project-context-files-as-untrusted-context.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/config/src/project-context.ts`
- `packages/config/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/cli/src/index.ts`
- `tests/project-context.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/cli-smoke.test.ts`

## Change Log

| Date       | Version | Description                                            | Author |
| ---------- | ------- | ------------------------------------------------------ | ------ |
| 2026-05-03 | 0.3     | Fixed code-review findings and marked story done.      | Codex  |
| 2026-05-03 | 0.2     | Implemented bounded untrusted project context loading. | Codex  |
| 2026-05-03 | 0.1     | Created Story 3.4 implementation context.              | Codex  |
