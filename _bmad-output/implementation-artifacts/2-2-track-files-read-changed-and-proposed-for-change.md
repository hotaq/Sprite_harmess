# Story 2.2: Track Files Read, Changed, and Proposed for Change

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to track file activity during a task,
so that I can audit what the agent inspected or modified.

## Acceptance Criteria

1. Given the agent reads, searches, proposes edits, or applies edits, when those tool calls complete, then the task history records files read, files changed, and files proposed for change, and those records are available for final summary and audit trail.
2. Given a task ends, when the audit view or task state is inspected, then file activity is grouped by task and correlated with tool events, and secret values are not included in audit output.

## Tasks / Subtasks

- [x] Define runtime-owned file activity contracts (AC: 1, 2)
  - [x] Add a typed file activity model in `packages/core` with task/session/correlation IDs, `toolCallId`, `toolName`, `kind`, project-relative `path`, status, timestamp, and bounded summary metadata.
  - [x] Represent at least `read`, `listed`, `searched`, `proposed_change`, and `changed` activity kinds, but do not implement patch editing in this story.
  - [x] Keep raw file content, search snippets, patch hunks, and secret-looking values out of file activity records.
  - [x] Preserve full per-tool-call activity records while exposing deduplicated grouped summaries for final summaries and audit views.
- [x] Extend canonical runtime events for file activity (AC: 1, 2)
  - [x] Add a schema-validated `file.activity.recorded` runtime event to `packages/core/src/runtime-events.ts`.
  - [x] Include stable base fields exactly like existing events: `schemaVersion`, `eventId`, `sessionId`, `taskId`, `correlationId`, `createdAt`, `type`, and `payload`.
  - [x] Include `toolCallId` and `toolName` when activity comes from a tool call so records can be correlated with `tool.call.*` events.
  - [x] Reject raw content fields in file activity event payloads just like tool lifecycle events reject raw content fields.
  - [x] Keep event payload paths project-relative or sanitized; never include outside-project absolute target paths from rejected requests.
- [x] Record file activity from current repository tools (AC: 1)
  - [x] In `AgentRuntime.executeToolCall()`, derive activity from successful `read_file`, `list_files`, and `search_files` results after `tool.call.completed`.
  - [x] `read_file` records the target file as read.
  - [x] `list_files` records the listed target directory and returned entries as listed/read activity without unbounded entry expansion when output is truncated.
  - [x] `search_files` records matched file paths as searched/read activity using bounded returned matches plus total match metadata; do not store search snippets or raw query text in file activity records.
  - [x] Failed or denied tool calls emit normal failed tool events but must not create successful read/change activity records.
- [x] Add an explicit future-edit activity recording path (AC: 1)
  - [x] Add a small runtime-owned helper or method that can record `proposed_change` and `changed` records for future patch/apply stories without applying edits now.
  - [x] Require callers to provide project-relative file paths and optional `toolCallId`; reject absolute paths, `..` traversal, empty paths, and raw diff/content metadata.
  - [x] Keep Story 2.3 behavior out of scope: no `apply_patch` tool, no write operation, no approval flow, and no command execution.
- [x] Surface grouped file activity in task state and final summaries (AC: 1, 2)
  - [x] Add file activity to `PlannedExecutionFlow` or an adjacent runtime-owned task state object so `getActiveTask()` and event history can reconstruct it.
  - [x] Extend `FinalTaskSummary` with grouped fields for `filesRead`, `filesChanged`, and `filesProposedForChange`.
  - [x] Ensure final summary grouping is deterministic by activity kind and project-relative path.
  - [x] Update text/JSON one-shot result rendering only for implemented summary fields; do not claim validation commands, patching, sessions, approvals, or audit persistence are complete.
- [x] Add deterministic tests for audit quality gates (AC: 1, 2)
  - [x] Extend runtime event tests to validate `file.activity.recorded` accepted and malformed/raw-content payloads rejected.
  - [x] Add runtime integration tests showing `read_file`, `list_files`, and `search_files` emit file activity events correlated to the same `toolCallId` as tool lifecycle events.
  - [x] Test activity records appear in active task state and final summaries grouped by task.
  - [x] Test large list/search outputs do not create unbounded file activity arrays.
  - [x] Test failed denied/missing file requests do not create successful file activity records.
  - [x] Test explicit future-edit activity helper records proposed/changed paths and rejects unsafe or raw-content metadata.
  - [x] Test secret-looking file contents, raw snippets, raw queries, and patch-like text do not appear in activity events, summaries, or test output.
- [x] Update documentation and validation records (AC: 1, 2)
  - [x] Update README only for implemented file activity behavior and current limitations.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and targeted Prettier check for touched files.
  - [x] Record validation commands and key implementation notes in the Dev Agent Record before moving the story to review.

### Review Findings

- [x] [Review][Patch] Reject secret-looking file activity summaries during runtime event validation [packages/core/src/runtime-events.ts:518]
- [x] [Review][Patch] Do not embed untrusted paths in file activity summaries [packages/core/src/file-activity.ts:78]

## Dev Notes

### Story Intent

This story makes file activity auditable before patch editing arrives. Story 2.1 created safe repository inspection tools and tool lifecycle events; Story 2.2 must add runtime-owned file activity tracking for those tools and a narrow future-edit recording contract for later `apply_patch` work.

The implementation must not apply edits, run commands, trigger approvals, persist sessions, or create a TUI/RPC audit screen. It should make runtime task state, runtime events, and final summaries contain enough structured file activity for later audit persistence and UI adapters.

### Source Requirements

- Epic 2 objective: users can inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.
- Story 2.2 covers FR18 and FR29: track files read, changed, or proposed for change, and expose an inspectable task audit trail.
- PRD observability requires every task to have an inspectable audit trail containing tool calls, file changes, validation attempts, memory changes, skill signals, and final status.
- PRD final summaries must identify changed files, commands run, validation results, and unresolved risks when available.
- Architecture treats the runtime event stream as the spine. Audit views, session storage, NDJSON, JSON-RPC, TUI, learning review, and tests must derive from runtime events rather than adapter-owned state.
- Architecture storage is local artifact first, but session persistence starts later. This story should keep event and summary contracts compatible with future `.sprite/sessions/<session-id>/events.ndjson` persistence without implementing storage.
- Repository files, logs, tool output, context files, and model responses are untrusted input. File activity records must not let repository content alter runtime/system policy.

### Previous Story Intelligence

Story 2.1 established these implementation patterns:

- `@sprite/tools` is a real workspace package with `read_file`, `list_files`, and `search_files`.
- `AgentRuntime.executeToolCall()` owns tool execution and emits `tool.call.requested`, `tool.call.started`, and `tool.call.completed` or `tool.call.failed`.
- Tool lifecycle event payloads intentionally carry metadata and summaries only; they do not carry raw file content, raw search snippets, or secret-looking values.
- Tool outputs over 32 KB or 500 lines are summarized, and large structured list/search preview arrays are bounded.
- Expected filesystem, boundary, missing file, binary file, and symlink cases return structured `SpriteError` results instead of thrown crashes.
- Runtime event history is cloned, subscriber mutations are isolated, and subscriber failures must not abort runtime transitions.
- Code review found and fixed stale/runtime-truth wording; preserve truthful capability messaging. Repository inspection tools are available through runtime/package APIs, but provider-driven tool use and patch editing remain future work.

### Current Codebase State

Relevant implementation areas:

- `packages/core/src/agent-runtime.ts`: `AgentRuntime`, active task state, runtime event emission, `executeToolCall()`, event history refresh, final summary creation, one-shot print result wiring.
- `packages/core/src/runtime-events.ts`: canonical runtime event union and payload validation. Current tool event validation rejects raw content fields.
- `packages/core/src/final-task-summary.ts`: final summary shape and risk/not-attempted derivation. This story should add grouped file activity summary fields here.
- `packages/core/src/task-state.ts`: `PlannedExecutionFlow` task state. This is the likely place for runtime-owned file activity in task state unless a small adjacent module is cleaner.
- `packages/tools/src/tool-registry.ts`: typed tool dispatch and `ToolExecutionResult` union.
- `packages/tools/src/read-file.ts`, `list-files.ts`, `search.ts`: current result shapes already expose normalized project-relative paths and bounded preview metadata needed to derive read/list/search activity.
- `packages/storage/src/index.ts`: placeholder only. Do not implement session persistence in this story.
- `tests/runtime-events.test.ts`, `tests/runtime-loop.test.ts`, `tests/tool-registry.test.ts`, `tests/cli-smoke.test.ts`: established test patterns to extend.

### Architecture Compliance

- Runtime owns file activity truth. CLI, print mode, future TUI, and future RPC must render or expose runtime state; adapters must not infer file activity by parsing text output.
- File activity must be represented as schema-validated runtime events and/or deterministic runtime state derived from those events.
- Use project-relative file paths. Never expose outside-project absolute paths from rejected requests.
- Use stable IDs generated by runtime utilities; do not hand-assemble IDs inside adapters.
- Preserve existing tool lifecycle event ordering. Recommended successful sequence is:
  1. `tool.call.requested`
  2. `tool.call.started`
  3. `tool.call.completed`
  4. one or more `file.activity.recorded` events
- Failed tool sequence remains `tool.call.requested`, `tool.call.started`, `tool.call.failed` with no successful file activity record.
- Do not add third-party audit, glob, logging, database, or schema libraries. The current project uses TypeScript, Node.js stdlib, and Vitest; runtime validation currently uses local functions rather than Zod.
- Keep output truthful. Do not claim durable audit persistence, a full audit CLI command, patching, command execution, approvals, validation commands, sessions, memory, or skills are implemented.

### Suggested File Activity Contract

Use explicit, bounded contracts. A practical shape:

```ts
export type FileActivityKind =
  | "changed"
  | "listed"
  | "proposed_change"
  | "read"
  | "searched";

export interface FileActivityRecord {
  activityId: string;
  createdAt: string;
  kind: FileActivityKind;
  path: string;
  status: "recorded";
  summary: string;
  toolCallId?: string;
  toolName?: "list_files" | "read_file" | "search_files";
}
```

Implementation details may differ, but the contract must include task/session/correlation context in event records through the runtime event base fields.

For summaries, keep two levels:

- Full bounded record history for audit/replay.
- Deduplicated grouped summary arrays for final summaries: `filesRead`, `filesChanged`, `filesProposedForChange`.

Mapping guidance:

- `read_file`: one `read` record for `result.path`.
- `list_files`: one `listed` record for `result.path`; if entries are included, only record bounded returned entries and retain total/returned counts in metadata.
- `search_files`: `searched` records for unique returned match paths; retain total/returned match counts but not snippets or raw query text.
- Future `proposed_change`: project-relative target file paths only, no patch hunk text.
- Future `changed`: project-relative target file paths only, no raw new file content.

### Security and Redaction Requirements

- Do not store file contents in activity records.
- Do not store search snippets in activity records.
- Do not store raw search query text in activity records; queries can contain secrets.
- Do not store patch hunks or diff bodies in activity records.
- Do not store provider auth values, API keys, `.env` values, private keys, tokens, or secret-looking strings in events, summaries, or tests.
- Reject forbidden raw-content metadata keys in file activity payload validation, including at least `content`, `rawContent`, `snippet`, `snippets`, `rawSnippet`, `patch`, `diff`, `hunk`, and `query`.

### File Structure Guidance

Expected files to add or update:

- `packages/core/src/file-activity.ts` or equivalent small module for activity contracts, derivation, grouping, and validation helpers.
- `packages/core/src/runtime-events.ts` for `file.activity.recorded` event type and validation.
- `packages/core/src/agent-runtime.ts` for tool-result-to-file-activity emission and future proposed/changed recording helper.
- `packages/core/src/task-state.ts` if task state stores activity records directly.
- `packages/core/src/final-task-summary.ts` for grouped file activity fields.
- `packages/core/src/index.ts` if new public types/functions should be exported.
- `tests/runtime-events.test.ts` for event contract tests.
- `tests/runtime-loop.test.ts` or a new focused runtime test for file activity state/final summary behavior.
- `tests/cli-smoke.test.ts` only if text/JSON output rendering changes.
- `README.md` for implemented behavior and current limitations.

Avoid changing:

- `packages/cli/src/index.ts` unless final summary output formatting genuinely needs adapter rendering changes.
- `packages/tools` unless adding optional activity metadata to result types is clearly simpler than deriving from existing result shapes.
- `packages/storage` beyond placeholder exports. Durable session/audit persistence belongs to later session stories.
- `packages/sandbox`, `packages/memory`, `packages/skills`, or provider packages.

### Testing Requirements

Minimum required tests:

- `validateRuntimeEvent()` accepts a valid `file.activity.recorded` event.
- `validateRuntimeEvent()` rejects file activity payloads containing raw content, snippets, query text, patch hunks, diff bodies, or unsafe paths.
- `AgentRuntime.executeToolCall(read_file)` emits a `file.activity.recorded` event after `tool.call.completed`, correlated by `toolCallId`.
- `AgentRuntime.executeToolCall(search_files)` records deterministic searched/read file paths without snippets or raw query text.
- `AgentRuntime.executeToolCall(list_files)` records deterministic listed/read activity and respects bounded output metadata.
- Failed or denied read/search/list tool calls do not create successful file activity records.
- `getActiveTask()` or equivalent task state inspection exposes file activity grouped by the current task.
- `createFinalTaskSummary()` includes deterministic `filesRead`, `filesChanged`, and `filesProposedForChange` groups.
- Explicit proposed/changed helper records safe project-relative paths and rejects absolute paths, `..`, empty paths, raw diff/content metadata, and secret-looking values.
- Existing task event, tool event, event immutability, CLI smoke, and tool registry tests still pass.

Run these commands before moving to review:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `git diff --check`
- Targeted `npm exec -- prettier --check ...` for touched source, tests, and story files.

### Latest Technical Information

No external dependency research is required for this story. Use the repository's current stack:

- Node.js standard library only for any local helpers.
- TypeScript `5.9.2` from `package.json`.
- Vitest `3.2.4` from `package.json`.
- Existing `Result` and `SpriteError` primitives from `@sprite/shared`.

Do not introduce new dependencies for validation, logging, audit storage, or schema handling in this slice.

### Git Intelligence

Recent relevant commits:

- `aa9e206 feat: add safe repository inspection tools`
- `acccc48 feat: add final task summaries`
- `0c1d504 feat: add one-shot print output modes`
- `2cbdffe fix: harden runtime event type contract`
- `8b29c3b fix: harden runtime event validation`

Actionable pattern:

- Add failing tests first for runtime event contract and final summary shape changes.
- Keep runtime truth in `AgentRuntime`, `PlannedExecutionFlow`, and runtime events.
- Keep adapters thin and truthful.
- Add regression tests for every redaction and bounded-output review risk.

### Project Context Reference

No `project-context.md` or UX design file was found during story creation. Use these source artifacts:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/2-1-inspect-and-search-project-files-safely.md`
- Existing source files under `packages/` and tests under `tests/`

### References

- Story 2.2 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.2)
- Epic 2 objective: `_bmad-output/planning-artifacts/epics.md` (Epic 2: Safe Codebase Editing and Verification)
- PRD tool protocol: `_bmad-output/planning-artifacts/prd.md` (Tool Protocol)
- PRD requirements: `_bmad-output/planning-artifacts/prd.md` (FR18, FR29, NFR19, NFR20, NFR23, NFR24)
- Architecture storage decision: `_bmad-output/planning-artifacts/architecture.md` (Local Artifact Storage)
- Architecture event stream: `_bmad-output/planning-artifacts/architecture.md` (Runtime event stream is the spine)
- Architecture event schema rules: `_bmad-output/planning-artifacts/architecture.md` (Runtime Event Schema Decision)
- Architecture audit/log rules: `_bmad-output/planning-artifacts/architecture.md` (Auditability and Process Patterns)
- Previous story: `_bmad-output/implementation-artifacts/2-1-inspect-and-search-project-files-safely.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm test -- tests/runtime-events.test.ts tests/runtime-loop.test.ts` (red phase: expected failures for missing `file.activity.recorded`, missing `AgentRuntime.recordFileActivity`, and missing final summary file groups; test syntax typo fixed before green phase)
- `npm test -- tests/runtime-events.test.ts tests/runtime-loop.test.ts` (30 tests)
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test` (61 tests)
- `git diff --check`
- `npm exec -- prettier --check README.md packages/core/src/file-activity.ts packages/core/src/runtime-events.ts packages/core/src/agent-runtime.ts packages/core/src/final-task-summary.ts packages/core/src/runtime-loop.ts packages/core/src/task-state.ts packages/core/src/index.ts packages/cli/src/index.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts _bmad-output/implementation-artifacts/2-2-track-files-read-changed-and-proposed-for-change.md`
- Review fix validation: `npm test -- tests/runtime-events.test.ts` (18 tests), `npm run typecheck`, `npm run build`, `npm run lint`, `npm test` (62 tests), `git diff --check`, and targeted Prettier check.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented runtime-owned file activity contracts in `packages/core/src/file-activity.ts`.
- Added `file.activity.recorded` as a schema-validated runtime event with project-relative safe path validation and raw metadata rejection.
- Extended `AgentRuntime.executeToolCall()` to emit file activity after successful `read_file`, `list_files`, and `search_files` calls while preserving failed tool behavior with no successful activity records.
- Added `AgentRuntime.recordFileActivity()` for future `proposed_change` and `changed` activity recording without implementing patching or file writes.
- Added `fileActivity` to runtime task state and grouped `filesRead`, `filesChanged`, and `filesProposedForChange` in final summaries and text renderers.
- Updated README with implemented runtime-local file activity audit behavior and current persistence/patching limitations.
- Added deterministic tests for file activity event validation, tool correlation by `toolCallId`, bounded list activity, no raw query/snippet/secret leakage, future edit helper safety, and final summary grouping.
- Code review fixes now reject secret-looking file activity summaries at runtime event validation and keep untrusted paths out of file activity summary text.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-2-track-files-read-changed-and-proposed-for-change.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/cli/src/index.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/file-activity.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/index.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/task-state.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`

### Change Log

- 2026-04-24: Implemented runtime-local file activity tracking and moved story to review.
- 2026-04-24: Resolved code review findings and moved story to done.
