# Story 2.3: Propose and Apply Patch-Based File Edits

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to propose patch-based edits,
so that code changes are reviewable and auditable before they affect files.

## Acceptance Criteria

1. Given the agent identifies a targeted file change, when it creates an edit request, then the request is represented as a patch with affected files and summary, and direct broad file writes are not used for MVP default editing.
2. Given a targeted patch is approved or allowed by policy, when the edit is applied, then the file is updated through the patch tool, and the runtime emits file-edit lifecycle and audit events.

## Tasks / Subtasks

- [x] Add a deterministic `apply_patch` repository tool (AC: 1, 2)
  - [x] Add `packages/tools/src/apply-patch.ts` and export/register it through `packages/tools/src/index.ts` and `packages/tools/src/tool-registry.ts`.
  - [x] Use a structured patch request instead of direct full-file writes. Recommended MVP shape: `edits: [{ path, oldText, newText }]` plus optional bounded `summary`; each edit must be a targeted replacement in one project-relative file.
  - [x] Generate affected file metadata and bounded summaries from the structured patch request; do not store or emit raw patch bodies in runtime events.
  - [x] Reuse `resolveProjectPath()` and existing filesystem error patterns to enforce project boundary, symlink escape protection, missing file errors, binary-file rejection, and deterministic `SpriteError` failures.
  - [x] Write changes atomically enough for MVP using Node stdlib only: read current file, verify each `oldText` occurs exactly once unless a future explicit option is introduced, compute the new file content in memory, then write the target file.
  - [x] Return a typed `ApplyPatchResult` with `toolName: "apply_patch"`, `status: "completed"`, affected files, changed file count, summary, and `ToolOutputSummary` metadata without returning raw new file content.
- [x] Extend tool registry and runtime tool contracts (AC: 1, 2)
  - [x] Add `"apply_patch"` to `ToolName`, `ToolInputMap`, `ToolExecutionRequest`, and `ToolExecutionResult`.
  - [x] Extend `AgentRuntime.executeToolCall()` dispatch so `apply_patch` follows the same `tool.call.requested`, `tool.call.started`, `tool.call.completed` or `tool.call.failed` lifecycle as existing tools.
  - [x] Keep provider-driven automatic tool use out of scope. This story exposes runtime/package API behavior only.
- [x] Add file-edit lifecycle audit events (AC: 2)
  - [x] Add schema-validated file edit runtime events in `packages/core/src/runtime-events.ts`. Suggested event names: `file.edit.requested`, `file.edit.applied`, and `file.edit.failed`.
  - [x] Include stable base fields exactly like existing events: `schemaVersion`, `eventId`, `sessionId`, `taskId`, `correlationId`, `createdAt`, `type`, and `payload`.
  - [x] Payloads should include `toolCallId`, affected project-relative files, status, bounded summary, and failure metadata when applicable.
  - [x] Reject unsafe paths, raw file content, raw patch/diff/hunk fields, and secret-looking summary values in file edit event validation.
  - [x] Preserve event ordering for success: `tool.call.requested`, `tool.call.started`, `file.edit.requested`, `tool.call.completed`, `file.edit.applied`, `file.activity.recorded` changed records.
  - [x] Preserve failure ordering: `tool.call.requested`, `tool.call.started`, `file.edit.requested` when request metadata is valid, then `tool.call.failed` and `file.edit.failed`; failed applies must not create `changed` activity.
- [x] Connect patch application to file activity and final summaries (AC: 2)
  - [x] When `apply_patch` succeeds, record `changed` file activity through the existing runtime-owned file activity path.
  - [x] When a patch proposal is recorded but not applied, use the existing `proposed_change` path; do not apply edits from proposal-only calls.
  - [x] Ensure `createFinalTaskSummary()` continues to report deterministic `filesChanged` and `filesProposedForChange`.
  - [x] Keep raw diff bodies, old text, new text, and snippets out of file activity records, final summaries, and runtime event payloads.
- [x] Add safety boundaries and explicit scope limitations (AC: 1, 2)
  - [x] Reject empty edit lists, absolute paths, `..` traversal, paths outside cwd, directory targets, binary files, missing `oldText`, ambiguous multiple matches, and no-op replacements.
  - [x] Reject broad/direct write APIs for this story. Do not add arbitrary `write_file`, full directory mutation, glob mutation, command execution, or approval UI.
  - [x] Do not implement Story 2.4 risk classification or Story 2.6 approval flow. Treat this slice as a strict targeted patch tool plus runtime audit events.
  - [x] Keep output truthful in README and CLI text; do not claim provider-driven editing, broad-edit approval, sandboxed commands, sessions, durable audit persistence, or validation recovery is complete.
- [x] Add deterministic tests (AC: 1, 2)
  - [x] Add tool tests for successful targeted replacement, multi-file patch, missing file, outside path, directory path, binary file, no match, multiple ambiguous matches, and no-op replacement.
  - [x] Add runtime event tests for `file.edit.*` event validation and rejection of raw `patch`, `diff`, `hunk`, `content`, `oldText`, `newText`, unsafe paths, and secret-looking summaries.
  - [x] Add runtime integration tests showing `apply_patch` emits tool lifecycle events, file edit lifecycle events, changed file activity, and grouped final summary changed files.
  - [x] Add failure tests proving failed patch attempts emit failure events but do not record successful `changed` file activity.
  - [x] Extend CLI smoke tests only if final summary text output changes.
- [x] Update docs and validation records (AC: 1, 2)
  - [x] Update README only for implemented patch tool behavior and current limitations.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and targeted Prettier check for touched source, tests, and story files.
  - [x] Record validation commands and key implementation notes in the Dev Agent Record before moving the story to review.

### Review Findings

- [x] [Review][Patch] Guard runtime `apply_patch` metadata against malformed input [`packages/core/src/agent-runtime.ts`] — Fixed by validating the edits array and edit path shape before emitting file edit metadata; malformed input now returns `TOOL_INVALID_INPUT` through the tool failure lifecycle instead of throwing.

## Dev Notes

### Story Intent

Story 2.3 adds the first real repository write capability. It must keep Sprite Harness patch-first, auditable, deterministic, and bounded. The goal is not a full edit approval system; it is a safe targeted patch tool and runtime audit path that later policy/approval stories can gate.

This story covers FR15 and FR17: propose patch-based file edits and apply approved or allowed edits. Story 2.4 will classify broad/risky edits. Story 2.6 will implement approval response flows. Do not pull those responsibilities into this slice.

### Source Requirements

- Epic 2 objective: users can inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.
- PRD Tool Protocol lists `apply_patch` as an initial tool and states file edits should be patch-based by default for auditability.
- PRD Sandbox and Approval Protocol says broad or risky file edits must trigger approval, but approval flow is later work. For this story, enforce a strict targeted patch contract and avoid broad direct writes.
- Architecture says runtime events are the spine for UI, NDJSON, RPC, session storage, audit views, learning review, and tests.
- Architecture enforcement guidance says agents must emit runtime events for lifecycle changes, keep adapters thin, use patch-based file edits, route broad/risky edits through policy/approval, avoid secrets in logs/summaries, and add deterministic tests.
- Repository files, tool output, patch text, and model-proposed edits are untrusted input. Runtime/system policy and path boundaries must win over repository content.

### Previous Story Intelligence

Story 2.1 established safe repository inspection tools:

- `@sprite/tools` owns `read_file`, `list_files`, and `search_files` under a typed `ToolRegistry`.
- `packages/tools/src/path-boundary.ts` provides `resolveProjectPath()`, `isInsidePath()`, and project-relative path normalization.
- Tools return `Result<..., SpriteError>` instead of throwing expected filesystem failures.
- Tool outputs use `summarizeToolOutput()` and avoid pretending full output persistence exists.
- Tests under `tests/tool-registry.test.ts` use temp projects and assert path traversal, absolute path, symlink escape, binary, missing file, deterministic ordering, and bounded output behavior.

Story 2.2 established runtime file activity and audit patterns:

- `AgentRuntime.executeToolCall()` owns tool lifecycle events and emits audit activity after successful tools.
- `packages/core/src/file-activity.ts` owns file activity contracts, grouping, safe path validation, raw metadata key rejection, and secret-looking summary detection.
- `file.activity.recorded` is schema-validated in `runtime-events.ts`.
- `AgentRuntime.recordFileActivity()` records future `proposed_change` and `changed` paths without applying edits.
- Code review fixed two audit risks: event validation rejects secret-looking file activity summaries, and generated file activity summaries do not embed untrusted paths.

### Current Codebase State

Relevant implementation areas:

- `packages/tools/src/tool-registry.ts`: add `apply_patch` to `ToolName`, `ToolInputMap`, `ToolExecutionRequest`, and dispatch overloads.
- `packages/tools/src/path-boundary.ts`: reuse project boundary and symlink escape protections. Do not duplicate boundary logic.
- `packages/tools/src/read-file.ts`: follow binary detection and filesystem error style.
- `packages/tools/src/output-summarizer.ts`: use for bounded tool output summaries; do not invent persistence.
- `packages/core/src/agent-runtime.ts`: extend `RuntimeToolCallRequest`, `executeRegisteredTool()`, file edit event emission, and changed/proposed file activity wiring.
- `packages/core/src/runtime-events.ts`: extend event union and validation for file edit events.
- `packages/core/src/file-activity.ts`: reuse `validateFileActivityPath()`, `findForbiddenFileActivityField()`, and `containsSecretLikeValue()` patterns or extract shared helpers if needed.
- `packages/core/src/final-task-summary.ts`: should already group changed/proposed files from file activity; avoid duplicating grouping logic.
- `tests/tool-registry.test.ts`, `tests/runtime-events.test.ts`, and `tests/runtime-loop.test.ts`: extend these first with failing tests.

### Suggested Patch Contract

Use a narrow structured patch format to avoid writing a fragile general unified-diff parser in this slice:

```ts
export interface ApplyPatchInput {
  edits: Array<{
    path: string;
    oldText: string;
    newText: string;
  }>;
  summary?: string;
}
```

Recommended result shape:

```ts
export interface ApplyPatchResult {
  affectedFiles: string[];
  changedFileCount: number;
  output: ToolOutputSummary;
  status: "completed";
  summary: string;
  toolName: "apply_patch";
}
```

Implementation guidance:

- `oldText` and `newText` exist only in tool input/local computation. Do not copy them into runtime events, file activity records, final summaries, README examples, or test output assertions containing secrets.
- Require `oldText.length > 0`.
- Reject `oldText === newText`.
- Reject when `oldText` occurs zero times or more than once in a target file.
- For multiple edits to the same file, apply sequentially in memory after all target paths are validated. If any edit fails validation, do not write partial changes.
- If implementing atomic rollback is too large for this story, validate all files and all replacements before writing any file, then write only after validation succeeds.
- Use project-relative paths in results and events.

### File Edit Event Contract

Use bounded, metadata-only event payloads. A practical shape:

```ts
{
  editId: string;
  affectedFiles: string[];
  status: "requested" | "applied" | "failed";
  summary: string;
  toolCallId: string;
  toolName: "apply_patch";
  errorCode?: string;
  message?: string;
}
```

Validation requirements:

- `affectedFiles` must be a non-empty array of safe project-relative paths.
- Reject forbidden raw patch/content fields recursively: `content`, `rawContent`, `oldText`, `newText`, `patch`, `diff`, `hunk`, `snippet`, `snippets`, `rawSnippet`, and `query`.
- Reject secret-looking `summary` values.
- Do not include absolute paths from rejected requests.
- Clone event payloads through existing event bus behavior; subscriber mutations must not affect canonical history.

### Architecture Compliance

- Runtime owns task state, event emission, tool execution, and audit truth. CLI, print mode, future TUI, and future RPC must remain adapters.
- No adapter may infer changed files by parsing text output. Changed files must come from runtime file activity and/or file edit events.
- Use stable IDs generated by runtime utilities. Do not hand-assemble IDs inside adapters.
- Keep approval/policy boundaries explicit. This story may use strict targeted patch validation as an "allowed" path, but must not implement broad edit approval, risk matrices, approval UI, or RPC approval responses.
- Do not add third-party diff, glob, logging, database, or schema libraries.
- Keep storage local-audit persistence out of scope. Runtime events should be compatible with future persistence but not persisted in this story.

### Security and Redaction Requirements

- Never store raw file contents, old text, new text, patch hunks, unified diffs, search snippets, auth values, tokens, private keys, or `.env` values in runtime events, file activity records, final summaries, or docs.
- Test fixtures may contain secret-looking strings only when asserting they are excluded from event/audit output.
- Patch summaries should be generic or caller-provided after validation; generated summaries must not embed untrusted path text if that can trip secret-like validators.
- Path fields may contain project-relative filenames, including filenames that look token-like; summary fields must not duplicate them.
- Treat repository files and model-generated patch requests as untrusted input.

### File Structure Guidance

Expected files to add or update:

- `packages/tools/src/apply-patch.ts`
- `packages/tools/src/index.ts`
- `packages/tools/src/tool-registry.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/file-activity.ts` only if shared validation helpers need extension
- `packages/core/src/index.ts` if new public types should be exported
- `tests/tool-registry.test.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/cli-smoke.test.ts` only if output rendering changes
- `README.md`

Avoid changing:

- `packages/storage`: durable audit/session persistence is later work.
- `packages/sandbox`: policy classification and approval flows are Story 2.4/2.6.
- `packages/providers`: provider-driven tool use is not connected yet.
- `packages/cli/src/index.ts` unless final summary output changes.

### Testing Requirements

Minimum test coverage:

- `apply_patch` changes one text file with a targeted replacement.
- `apply_patch` can update multiple project-relative files without partial writes when validation fails.
- Reject outside paths, absolute paths, directory targets, binary files, missing files, no match, multiple matches, empty edit list, empty `oldText`, and no-op replacement.
- `ToolRegistry.execute({ toolName: "apply_patch" })` returns typed results and structured `SpriteError` failures.
- `validateRuntimeEvent()` accepts valid `file.edit.*` events and rejects raw content/patch fields, unsafe paths, invalid statuses, and secret-looking summaries.
- `AgentRuntime.executeToolCall(apply_patch)` emits tool lifecycle events, file edit lifecycle events, `file.activity.recorded` changed events, and final summary changed files.
- Failed patch attempts emit failed lifecycle events and do not record successful changed file activity.
- Existing config/provider/runtime/tool/CLI smoke tests continue to pass.

Run before moving to review:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `git diff --check`
- Targeted `npm exec -- prettier --check ...` for touched source, tests, README, and story files.

### Latest Technical Information

No external dependency research is required for this story. Use the repository's current stack and avoid adding dependencies:

- Node.js standard library for filesystem work.
- TypeScript `5.9.2` from `package.json`.
- Vitest `3.2.4` from `package.json`.
- Existing `Result`, `ok`, `err`, and `SpriteError` primitives from `@sprite/shared`.

### Git Intelligence

Recent relevant commits:

- `119ce3e feat: track runtime file activity`
- `aa9e206 feat: add safe repository inspection tools`
- `acccc48 feat: add final task summaries`
- `0c1d504 feat: add one-shot print output modes`
- `2cbdffe fix: harden runtime event type contract`

Actionable patterns:

- Add failing tests first for tool registry behavior, runtime event validation, and final summary changed-file grouping.
- Reuse existing path-boundary and output-summarizer helpers.
- Keep event payloads metadata-only.
- Preserve truthful README wording about what is implemented and what remains future work.

### Project Context Reference

No `project-context.md` or UX design file was found during story creation. Use these source artifacts:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/2-2-track-files-read-changed-and-proposed-for-change.md`
- Existing source files under `packages/` and tests under `tests/`

### References

- Story 2.3 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.3)
- PRD tool protocol: `_bmad-output/planning-artifacts/prd.md` (Tool Protocol)
- PRD sandbox and approval protocol: `_bmad-output/planning-artifacts/prd.md` (Sandbox and Approval Protocol)
- PRD MVP scope: `_bmad-output/planning-artifacts/prd.md` (MVP Scope Summary)
- Architecture event stream: `_bmad-output/planning-artifacts/architecture.md` (Runtime event stream is the spine)
- Architecture policy boundary: `_bmad-output/planning-artifacts/architecture.md` (Authorization / Policy Decision)
- Architecture approval patterns: `_bmad-output/planning-artifacts/architecture.md` (Approval Patterns)
- Architecture enforcement guidance: `_bmad-output/planning-artifacts/architecture.md` (Enforcement Guidelines)
- Previous story: `_bmad-output/implementation-artifacts/2-2-track-files-read-changed-and-proposed-for-change.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm test -- tests/tool-registry.test.ts tests/runtime-events.test.ts` (red phase: expected failures for missing `apply_patch` and `file.edit.*` support)
- `npm test -- tests/tool-registry.test.ts tests/runtime-events.test.ts` (31 tests)
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test` (68 tests)
- `git diff --check`
- `npm exec -- prettier --check README.md _bmad-output/implementation-artifacts/2-3-propose-and-apply-patch-based-file-edits.md _bmad-output/implementation-artifacts/sprint-status.yaml packages/tools/src/apply-patch.ts packages/tools/src/index.ts packages/tools/src/tool-registry.ts packages/core/src/agent-runtime.ts packages/core/src/file-activity.ts packages/core/src/runtime-events.ts tests/tool-registry.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented `apply_patch` as a structured targeted replacement tool under `@sprite/tools`.
- Registered `apply_patch` through the tool registry and runtime tool dispatch.
- Added canonical `file.edit.requested`, `file.edit.applied`, and `file.edit.failed` runtime events with metadata-only validation.
- Wired successful patch application into `file.activity.recorded` changed records and final summary changed-file grouping.
- Preserved Story 2.4/2.6 boundaries: no risk classifier, approval UI, command execution, provider-driven automatic tool use, or durable audit persistence.
- Added deterministic tool/runtime tests for successful patches, invalid inputs, boundary failures, ambiguous/no-op replacements, file edit event validation, success/failure event ordering, and no changed activity on failed patches.
- Updated README with implemented patch behavior and current limitations.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-3-propose-and-apply-patch-based-file-edits.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/file-activity.ts`
- `packages/core/src/runtime-events.ts`
- `packages/tools/src/apply-patch.ts`
- `packages/tools/src/index.ts`
- `packages/tools/src/tool-registry.ts`
- `tests/runtime-events.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/tool-registry.test.ts`

### Change Log

- 2026-04-24: Created comprehensive Story 2.3 context and moved story to ready-for-dev.
- 2026-04-24: Implemented patch-based file edits and moved story to review.
