# Story 2.1: Inspect and Search Project Files Safely

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want the agent to inspect, list, and search project files,  
so that it can understand a codebase before proposing changes.

## Acceptance Criteria

1. Given the runtime is operating inside a project directory, when the agent requests file inspection, file listing, or text search, then the tool registry executes the request within the project boundary and emits tool lifecycle events for requested, started, completed, or failed states.
2. Given a file or search result is too large, when the tool returns output above the configured threshold, then the runtime summarizes or truncates interactive output and preserves a local log reference when full output is stored.

## Tasks / Subtasks

- [x] Make `@sprite/tools` a real exported workspace package (AC: 1)
  - [x] Add package exports/types to `packages/tools/package.json`.
  - [x] Add `@sprite/tools` to `tsconfig.base.json` path aliases if core imports it.
  - [x] Add `@sprite/tools` as a `packages/core` dependency only if runtime integration imports the concrete tool registry from core.
  - [x] Update the root `package.json` `files` publish allowlist with `packages/tools` dist artifacts if runtime distribution depends on `@sprite/tools`.
  - [x] Keep package build/typecheck under the existing root TypeScript project references.
- [x] Define the repository tool contract and registry in `packages/tools` (AC: 1)
  - [x] Create `packages/tools/src/tool-registry.ts` with typed tool names, request/result shapes, and dispatch.
  - [x] Support initial Story 2.1 tools only: `read_file`, `list_files`, and `search_files`.
  - [x] Return `Result<T, SpriteError>` or equivalent typed failures; do not throw for expected filesystem, boundary, or search failures.
  - [x] Keep `apply_patch`, `run_command`, approval, sandbox execution, validation, and file activity audit tracking out of this story.
- [x] Implement safe project-boundary enforcement for read/list/search (AC: 1)
  - [x] Resolve the runtime project directory with `realpath`.
  - [x] Resolve requested paths against that project root and reject any path whose real path escapes the root.
  - [x] Reject absolute paths outside the project root, `..` traversal escapes, and symlink escapes.
  - [x] Return structured `SpriteError` codes for boundary violations and missing/inaccessible files without leaking unrelated filesystem content.
- [x] Implement file inspection, listing, and text search tools (AC: 1)
  - [x] `read_file`: read UTF-8 text files within the project boundary and return file path metadata plus content or summarized content.
  - [x] `list_files`: list direct project files/directories within a requested relative path by default, with deterministic sorting.
  - [x] `search_files`: perform literal text search by default, not regex search, within bounded project traversal and return deterministic matches with file path, line number, and bounded snippet.
  - [x] Apply bounded traversal defaults so list/search do not recursively walk `node_modules`, `.git`, or generated `dist` directories unless a later explicit configuration story supports that.
  - [x] Avoid adding third-party search/glob dependencies or shelling out to `rg`; Node `fs/promises`, `path`, and small local helpers are sufficient for this slice.
- [x] Add large-output summarization and local log reference behavior (AC: 2)
  - [x] Create `packages/tools/src/output-summarizer.ts`.
  - [x] Use the PRD thresholds: summarize/truncate outputs larger than 32 KB or 500 lines.
  - [x] Return metadata that clearly distinguishes full output from summarized output.
  - [x] Preserve a local log reference for full output when it is stored; if persistence is not implemented yet, return an explicit placeholder/reference contract without pretending durable session storage exists.
  - [x] Ensure interactive/runtime-facing summaries do not embed unbounded file contents.
- [x] Extend canonical runtime events for tool lifecycle events (AC: 1, 2)
  - [x] Add `tool.call.requested`, `tool.call.started`, `tool.call.completed`, and `tool.call.failed` to `packages/core/src/runtime-events.ts`.
  - [x] Add typed payload validation for each new event type.
  - [x] Include stable IDs, `schemaVersion`, `sessionId`, `taskId`, `correlationId`, `eventId`, `createdAt`, `type`, and `payload` exactly like existing task events.
  - [x] Include a tool call ID/correlation field in tool payloads so later audit/session work can connect requested/started/completed/failed events.
  - [x] Keep raw file contents, raw search result snippets, and secret-looking values out of lifecycle event payloads; events carry metadata and summaries only.
  - [x] Do not add ad hoc tool event shapes outside the canonical runtime event contract.
- [x] Wire runtime-owned tool execution without adapter-owned task truth (AC: 1)
  - [x] Add a small runtime method or runtime-loop helper that executes a registered tool through the tool registry and emits lifecycle events through `RuntimeEventBus`.
  - [x] Keep CLI, print mode, TUI, and RPC as future adapters over runtime events; do not make Commander handlers execute repository tools directly.
  - [x] Keep provider/model calls out of this story; tool tests must not require provider credentials.
  - [x] Keep task final summaries truthful if tool execution is still not reached by the current one-shot path.
- [x] Add deterministic tests for quality gates (AC: 1, 2)
  - [x] Add `tests/tool-registry.test.ts` or equivalent unit/integration tests for read/list/search with a temporary project filesystem.
  - [x] Test allowed in-boundary reads, lists, and searches.
  - [x] Test rejected `..` traversal, outside absolute paths, and symlink escapes.
  - [x] Test directory symlinks are not followed during traversal.
  - [x] Test large file/search output over 32 KB or 500 lines triggers summarization/truncation and returns a full-output reference contract.
  - [x] Test tool lifecycle event validation for requested/started/completed/failed events.
  - [x] Test subscriber/event-history immutability still holds after adding tool events.
  - [x] Test tool lifecycle event payloads do not contain raw file contents or raw search snippets.
  - [x] Test output/error paths do not expose provider auth secrets.
- [x] Update documentation and validation records (AC: 1, 2)
  - [x] Update README only for implemented behavior; do not claim patching, validation command execution, sandbox command execution, or approvals are available yet.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test`.
  - [x] Record validation commands and key implementation notes in the Dev Agent Record before moving the story to review.

### Review Findings

- [x] [Review][Patch] Filesystem race/inaccessible paths can throw instead of returning structured `SpriteError` results [packages/tools/src/search.ts:157] — fixed 2026-04-24
- [x] [Review][Patch] Large search/list structured results remain unbounded even when `output.content` is truncated [packages/tools/src/search.ts:101] — fixed 2026-04-24
- [x] [Review][Patch] Recursive default exclusions skip files named `.git`, `dist`, or `node_modules`, not only directories [packages/tools/src/list-files.ts:124] — fixed 2026-04-24
- [x] [Review][Patch] Runtime task warning still says repository tools start in later stories [packages/core/src/agent-runtime.ts:141] — fixed 2026-04-24
- [x] [Review][Patch] Byte preview truncation uses UTF-16 string slicing, so multibyte output can exceed the intended byte preview cap [packages/tools/src/output-summarizer.ts:61] — fixed 2026-04-24
- [x] [Review][Patch] Failed lifecycle test uses a non-existent cwd, so it does not prove missing/denied in-project tool failures [tests/runtime-events.test.ts:373] — fixed 2026-04-24

## Dev Notes

### Story Intent

This story starts Epic 2 by making repository inspection real and safe. The goal is not editing or command execution. The goal is a reusable tool registry path that can read, list, and search files inside the configured project boundary while emitting canonical runtime lifecycle events.

The implementation must preserve the Epic 1 architecture: runtime owns task/tool truth, adapters render or submit intents, and all lifecycle observations use the runtime event stream.

### Source Requirements

- Epic 2 objective: users can let the agent inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.
- Story 2.1 covers FR12, FR13, and FR14: inspect files, search project files, and list project files/directories.
- PRD tool protocol requires tools to be registered through a `ToolRegistry`; initial tools include `read_file`, `search_files`, and `list_files`.
- PRD NFR6 requires outputs larger than 32 KB or 500 lines to be summarized/collapsible/truncated while preserving a full local log reference when the full output is stored.
- Architecture requires tool lifecycle events to appear in the event stream within 500ms under normal local conditions.
- Architecture requires repository files, logs, tool output, context files, and model responses to be treated as untrusted input that cannot override runtime/system policy.

### Previous Epic Intelligence

There is no previous story in Epic 2. Use Epic 1 and the Epic 1 retrospective as the continuity source.

Relevant Epic 1 outcomes:

- `AgentRuntime` owns task lifecycle and event emission in `packages/core/src/agent-runtime.ts`.
- Runtime events are canonical records in `packages/core/src/runtime-events.ts`.
- Event subscribers receive cloned records, event history is protected from mutation, and subscriber failures must not abort runtime transitions.
- CLI and one-shot print paths render runtime truth rather than owning lifecycle state.
- Final summaries are runtime-owned in `packages/core/src/final-task-summary.ts`.

Retrospective quality concerns that must be addressed in this story:

- Quality is the main risk entering Epic 2.
- Story 2.1 must explicitly cover project-boundary tests, large-output handling, event contract tests, and redaction/no-secret-leak behavior.
- Code style and package boundaries were a strength in Epic 1 and should remain explicit review criteria.
- `npm run lint` currently aliases `typecheck`, so tests and code review must carry more quality weight.

### Current Codebase State

Existing implementation areas:

- `packages/core/src/agent-runtime.ts`: runtime startup, active task state, event bus, final summary, one-shot print flow.
- `packages/core/src/runtime-loop.ts`: task request creation and initial plan/act/observe flow.
- `packages/core/src/runtime-events.ts`: canonical runtime event types and validation, currently task-only.
- `packages/core/src/task-state.ts`: task request/state contracts.
- `packages/tools/src/index.ts`: placeholder only; Story 2.1 should make this package real.
- `packages/shared/src/result.ts` and `packages/shared/src/errors.ts`: existing `Result` and `SpriteError` primitives to reuse.
- `tests/runtime-events.test.ts`: event contract, event history, subscriber mutation, and subscriber failure patterns to extend.
- `tests/runtime-loop.test.ts`: runtime-owned state transition tests to use as style reference.
- `tests/cli-smoke.test.ts`: CLI adapter tests; only update if the story exposes a user-facing CLI path.

### Architecture Compliance

- `packages/tools` owns read/list/search implementations and tool registry mechanics.
- `packages/core` may call a tool registry through a narrow runtime-owned integration point.
- Adapters must not call filesystem tools directly as the canonical task truth.
- Tool lifecycle events must be added to the existing runtime event contract rather than separate log objects.
- Repository content is untrusted. Do not parse repository text as instructions that can change runtime/system policy.
- Do not add patch editing, command execution, approval, validation command execution, session persistence, memory writes, or skill signals in this story.
- Do not store secrets or provider auth values in events, summaries, logs, or tests.

### File Structure Guidance

Expected files to add or update:

- `packages/tools/package.json`
- `packages/tools/src/index.ts`
- `packages/tools/src/tool-registry.ts`
- `packages/tools/src/read-file.ts`
- `packages/tools/src/list-files.ts`
- `packages/tools/src/search.ts`
- `packages/tools/src/output-summarizer.ts`
- `packages/core/package.json` if core imports `@sprite/tools`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/index.ts`
- `tests/tool-registry.test.ts` or equivalent
- `tests/runtime-events.test.ts`
- `README.md` if user-facing behavior changes
- `tsconfig.base.json` if adding `@sprite/tools` as a path alias
- Root `package.json` publish allowlist if `@sprite/tools` is needed by packaged runtime code

Avoid changing:

- `packages/cli/src/index.ts` unless there is a deliberate user-facing path for read/list/search in this story.
- `packages/sandbox` beyond placeholder imports; sandbox command execution starts in later Epic 2 stories.
- `packages/storage` unless creating a minimal explicit full-output reference contract requires a local artifact placeholder. Prefer returning a placeholder contract over implementing session storage in this story.

### Tool Contract Requirements

Use explicit request/result contracts. Suggested shape:

- `ToolName = "read_file" | "list_files" | "search_files"`.
- Each tool request includes `cwd`, tool-specific relative path or query, and optional output limits.
- Each tool result includes `toolName`, `status`, normalized project-relative paths, output summary metadata, and structured failure information when applicable.
- Tool calls should have a stable `toolCallId` generated by runtime/core integration or the registry caller.
- Use camelCase fields to match existing runtime/event conventions.

For boundary checks:

- Normalize path input against the runtime cwd.
- Resolve existing targets with `realpath` before allowing access.
- For missing targets, resolve the nearest existing parent and still reject outside-root paths before returning a structured not-found error.
- Allow the project root itself and descendants only.
- Reject path escapes before reading/listing/searching content.
- Do not follow directory symlinks during traversal. File symlinks are allowed only when the final real path remains inside the project root.
- Return a structured failure event and error result for denied access.

For search:

- Keep search deterministic.
- Use literal substring matching for this story. Do not implement regex search yet.
- Search text files only for this story.
- Include line numbers and short bounded snippets, with snippets capped to a documented length.
- Avoid binary file handling complexity; skip binary-looking files with explicit metadata or return a structured unsupported-file result.
- Use bounded traversal with stable defaults. Do not scan `node_modules`, `.git`, or generated `dist` directories by default.
- Keep result ordering stable by project-relative path, then line number.

### Runtime Event Requirements

Extend `RuntimeEventPayloadMap` and `validateRuntimeEvent` with tool event types. Suggested payload fields:

- `toolCallId`
- `toolName`
- `status`
- `cwd`
- `targetPath` or `query` when applicable, sanitized and project-relative when possible
- `summary`
- `outputReference` for completed large-output results when available
- `errorCode` and `message` for failed tool calls

Do not put raw file content or raw search snippets into lifecycle events. Tool results can carry bounded content for the immediate runtime response; event payloads must stay metadata-only so logs/audit streams do not become accidental secret stores.

Required event sequence for successful tool calls:

1. `tool.call.requested`
2. `tool.call.started`
3. `tool.call.completed`

Required event sequence for failed tool calls:

1. `tool.call.requested`
2. `tool.call.started`
3. `tool.call.failed`

All events must validate through `validateRuntimeEvent` and be emitted through `RuntimeEventBus`.

### Large Output Requirements

Use PRD thresholds exactly:

- Character threshold: larger than 32 KB.
- Line threshold: larger than 500 lines.

When output exceeds either threshold:

- Return a bounded summary/truncated representation for interactive consumers.
- Include original size metadata.
- Include a full-output reference when full output is stored.
- If full storage is not implemented in this story, return an explicit non-persistent reference/status such as `fullOutputStored: false` with a clear reason. Do not pretend session artifact storage exists.

### Testing Requirements

Minimum required tests:

- `read_file` succeeds for a normal UTF-8 file inside cwd.
- `list_files` returns deterministic sorted project-relative paths.
- `search_files` returns deterministic path/line/snippet matches.
- `read_file`, `list_files`, and `search_files` reject path traversal outside cwd.
- Symlink escape is rejected.
- Directory symlinks are not followed during traversal.
- Missing files and unsupported file types return structured failures rather than thrown crashes.
- Large file output over 32 KB is summarized.
- Large output over 500 lines is summarized.
- Runtime emits valid `tool.call.requested`, `tool.call.started`, and `tool.call.completed` events for successful tool calls.
- Runtime emits valid `tool.call.failed` for denied or missing file requests.
- Tool lifecycle event payloads do not contain raw file contents or raw search snippets.
- Existing runtime task event tests still pass.
- Provider auth secrets do not appear in tool lifecycle events, tool summaries, or test output.

Run these commands before moving to review:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`

### Latest Technical Information

No external dependency research is required for this story. The implementation should use the current repository stack:

- Node.js standard library for filesystem/path operations.
- TypeScript `5.9.2` from `package.json`.
- Vitest `3.2.4` from `package.json`.
- Existing `Result` and `SpriteError` primitives from `@sprite/shared`.

Do not add a glob/search dependency unless a concrete implementation blocker is documented in the Dev Agent Record.

### Git Intelligence

Recent relevant commits:

- `acccc48 feat: add final task summaries`
- `0c1d504 feat: add one-shot print output modes`
- `2cbdffe fix: harden runtime event type contract`
- `8b29c3b fix: harden runtime event validation`
- `727fa95 feat: emit runtime lifecycle events`

Actionable pattern:

- Add failing tests first for contract changes.
- Keep core logic typed and runtime-owned.
- Add regression tests when review finds event or boundary bugs.
- Preserve output truthfulness; do not claim future capabilities are implemented.

### Project Context Reference

No `project-context.md` file was found in the repository during story creation. Use these source artifacts instead:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/epic-1-retro-2026-04-24.md`
- Existing source files under `packages/` and tests under `tests/`

### References

- Story 2.1 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.1)
- PRD tool protocol: `_bmad-output/planning-artifacts/prd.md` (Tool Protocol)
- PRD requirements: `_bmad-output/planning-artifacts/prd.md` (FR9, FR12, FR13, FR14, FR29, NFR2, NFR6, NFR10, NFR13)
- Architecture event stream: `_bmad-output/planning-artifacts/architecture.md` (API & Communication Patterns)
- Architecture file/tool package mapping: `_bmad-output/planning-artifacts/architecture.md` (Requirements to Structure Mapping)
- Architecture implementation sequence and enforcement: `_bmad-output/planning-artifacts/architecture.md` (Implementation Sequence, Enforcement Guidelines)
- Epic 1 retrospective: `_bmad-output/implementation-artifacts/epic-1-retro-2026-04-24.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm test -- tests/tool-registry.test.ts tests/runtime-events.test.ts` (red phase: expected failures for missing `@sprite/tools`, missing `tool.call.*` validation, and missing `AgentRuntime.executeToolCall`)
- `npm test -- tests/tool-registry.test.ts tests/runtime-events.test.ts` (19 tests)
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test` (54 tests)
- `git diff --check`
- `npm exec -- prettier --check packages/tools/src/filesystem-error.ts packages/tools/src/path-boundary.ts packages/tools/src/output-summarizer.ts packages/tools/src/list-files.ts packages/tools/src/search.ts packages/tools/src/read-file.ts packages/core/src/agent-runtime.ts packages/core/src/runtime-loop.ts packages/core/src/final-task-summary.ts tests/tool-registry.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts tests/cli-smoke.test.ts _bmad-output/implementation-artifacts/2-1-inspect-and-search-project-files-safely.md`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test` (55 tests)
- `git diff --check`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented `@sprite/tools` as a real exported workspace package with read/list/search tool contracts and registry dispatch.
- Added project-boundary enforcement with realpath checks, outside-path rejection, symlink escape rejection, and nearest-existing-parent handling for missing targets.
- Implemented UTF-8 `read_file`, deterministic `list_files`, and literal `search_files` with bounded traversal and default skips for `.git`, `node_modules`, and generated `dist`.
- Added large-output summarization over 32 KB or 500 lines with explicit non-persistent full-output reference metadata.
- Extended canonical runtime events with `tool.call.requested`, `tool.call.started`, `tool.call.completed`, and `tool.call.failed`, including payload validation and raw-content rejection.
- Added `AgentRuntime.executeToolCall()` so tool execution emits runtime-owned lifecycle events instead of adapter-owned task truth.
- Added deterministic tool and runtime event tests for boundary safety, symlink handling, large output, event validation, event immutability, and no raw content in lifecycle events.
- Updated README to document implemented repository inspection tool behavior without claiming patching, command execution, approvals, validation commands, sessions, memory, or skills.
- Resolved code review findings by converting filesystem races/inaccessible paths into structured errors, bounding large structured previews, preserving files named like excluded directories, making runtime wording truthful, safely truncating multibyte previews, and strengthening failed lifecycle coverage.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-1-inspect-and-search-project-files-safely.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/tsconfig.json`
- `packages/tools/package.json`
- `packages/tools/src/filesystem-error.ts`
- `packages/tools/src/index.ts`
- `packages/tools/src/list-files.ts`
- `packages/tools/src/output-summarizer.ts`
- `packages/tools/src/path-boundary.ts`
- `packages/tools/src/read-file.ts`
- `packages/tools/src/search.ts`
- `packages/tools/src/tool-registry.ts`
- `packages/tools/tsconfig.json`
- `tests/cli-smoke.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/tool-registry.test.ts`
- `tsconfig.base.json`
- `tsconfig.json`

### Change Log

- 2026-04-24: Implemented safe repository inspection and search tools with runtime-owned tool lifecycle events; moved story to review.
- 2026-04-24: Fixed code review findings, revalidated quality gates, and moved story to done.
