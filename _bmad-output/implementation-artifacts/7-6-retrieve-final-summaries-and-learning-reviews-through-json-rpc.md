# Story 7.6: Retrieve Final Summaries and Learning Reviews Through JSON-RPC

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an external automation client,
I want to retrieve final summaries and learning reviews through JSON-RPC,
so that editors, scripts, and other agents can consume structured task outcomes and learning artifacts after completion without scraping stdout or reading disk.

## Acceptance Criteria

1. JSON-RPC method `task.getResult` accepts structured params with required `cwd` and optional `taskId` (defaults to the currently-active task when omitted); returns a bounded final summary containing status, changed files, commands run, validation results, unresolved risks, memory influences, skill influences, and correlation IDs — **without** raw stdout/stderr or secret-like values.
2. JSON-RPC method `task.getResult` returns `NO_ACTIVE_TASK` when no task is active and no `taskId` is provided; returns `TASK_NOT_FOUND` when a specific `taskId` is provided but not found in the session.
3. JSON-RPC method `task.learningReview` accepts structured params with required `cwd` and optional `taskId` (defaults to the currently-active task); returns structured facts, lessons, mistakes, test gaps, memory candidates, skill signals, and reuse evidence within the caller's scope.
4. `task.learningReview` returns `NO_ACTIVE_TASK` when no task is active and no `taskId` is provided; returns `LEARNING_REVIEW_NOT_FOUND` with `nextAction` hint when no learning review exists for the specified task.
5. Both methods reject unknown or out-of-scope `cwd` with structured `INVALID_CWD` errors following the established pattern from Story 7.3/7.5.
6. Both methods reject notifications (requests without `id`) — produce no response and no side effects.
7. Out-of-scope memory or skill data is omitted from learning review responses; only data tied to the caller's cwd-scoped session is included.
8. Secret-like values, raw output content, local private paths, patch bodies, and environment variables are not echoed in either method's responses or errors.
9. Protocol stdout remains JSON-RPC-only and line-delimited, preserving Story 7.1/7.3/7.4/7.5 behavior.
10. Existing `rpc.ping`, `session.create`, `session.resume`, `task.start`, `event.subscribe`/`event.unsubscribe`, and `approval.respond` behavior remains backward-compatible.
11. Contract tests cover: final summary retrieval (active task + specific taskId), learning review retrieval (active task + specific taskId), no-active-task, task-not-found, learning-review-not-found, cwd scope rejection, notification no-op, redaction, stdout purity, and backward compatibility.

## Tasks / Subtasks

- [x] Confirm Story 7.6 scope and implementation surfaces. (AC: 1-11)
  - [x] Read this story, Epic 7, PRD Journey 4/RPC requirements, architecture runtime-event/RPC/learning-review sections, Stories 7.1–7.5, and any research artifact for this story.
  - [x] Inspect `packages/rpc/src/index.ts`, `packages/core/src/agent-runtime.ts`, `packages/core/src/final-task-summary.ts`, `packages/core/src/runtime-events.ts:learning.review.created`, existing RPC/bridge/CLI RPC tests, and `packages/storage/src/session-store.ts`/learning review storage.
  - [x] Run GitNexus impact analysis before editing affected symbols; checked `handleJsonRpcRequest`, `JsonRpcRuntimeBridge`, `AgentRuntime.getActiveTask`, `createFinalTaskSummary`, `readLearningReviewArtifacts`.
  - [x] LOW blast radius — all changes additive, bridge extended, no core modifications.
  - [x] Keep scope to `task.getResult` and `task.learningReview` only; did not implement `runtime.getState`, cancellation, memory APIs, skill APIs, or HTTP/SSE transport.

- [x] Define the `task.getResult` and `task.learningReview` contracts. (AC: 1-7, 10)
  - [x] Added both method names to `RPC_CAPABILITIES` array.
  - [x] Validate object params only; reject positional/non-object params.
  - [x] Require `cwd` and canonicalize it to the runtime cwd using existing `readScopedCwd()`.
  - [x] Accept optional `taskId` as a non-empty string matching the existing `TASK_ID_PATTERN` (`/^task_[A-Za-z0-9_-]+$/u`).
  - [x] Reject unknown or malformed params with safe structured errors (follow the established `-32602` pattern).
  - [x] Notifications for both methods must not execute handlers or emit responses.

- [x] Extend `JsonRpcRuntimeBridge` for summary/learning review retrieval. (AC: 1-4)
  - [x] `getActiveTask()` already in bridge interface.
  - [x] Added `getLearningReviewArtifacts` to the bridge interface wrapping `readLearningReviewArtifacts` from `@sprite/core`.
  - [x] Bridge additive and backward-compatible — CLI and test wrappers updated.

- [x] Implement `handleTaskGetResult` handler. (AC: 1, 2, 5, 6, 8, 9)
  - [x] Added routing in `handleJsonRpcRequest` while preserving parse, method-not-found, and notification behavior.
  - [x] Validate params: `cwd` (required, scoped), `taskId` (optional, pattern-match).
  - [x] When `taskId` is omitted: use `runtime.getActiveTask()` → build `FinalTaskSummary` via `createFinalTaskSummary(task)` → return bounded result.
  - [x] When `taskId` is provided: validate matches active task; if not found, return `TASK_NOT_FOUND` with `nextAction` hint.
  - [x] Return bounded summary: status, result, provider, filesChanged, filesProposedForChange, filesRead, unresolvedRisks, notAttempted, importantEvents (capped at 100), memoryInfluences (capped at 50), skillInfluences (capped at 50), sessionId, taskId, correlationId.
  - [x] Capped `importantEvents` to 100 and influences to 50.
  - [x] No raw stdout/stderr, patch bodies, env values, or local private paths echoed.
  - [x] Async handler returns through `handleJsonRpcMessage` → serialized write queue.

- [x] Implement `handleTaskLearningReview` handler. (AC: 3, 4, 7, 8, 9)
  - [x] Added routing in `handleJsonRpcRequest`.
  - [x] Validate params: `cwd` (required, scoped), `taskId` (optional, pattern-match).
  - [x] When `taskId` is omitted: derive from `runtime.getActiveTask()`.
  - [x] Read learning review artifacts for the task via bridge `getLearningReviewArtifacts`.
  - [x] If no learning review exists: return `LEARNING_REVIEW_NOT_FOUND` with descriptive `nextAction`.
  - [x] Return bounded learning review: facts, lessons, mistakes, testGaps, memoryCandidates, skillSignals, summary, createdAt, artifactPath (each array capped at 50).
  - [x] Out-of-scope memory/skill data naturally filtered by session-limited artifact scan.
  - [x] No raw stdout/stderr, patch bodies, env values, or local private paths.

- [x] Map runtime errors to safe structured JSON-RPC errors. (AC: 2, 4, 5)
  - [x] `NO_ACTIVE_TASK` → `-32603`, subsystem `"rpc"`, recoverable `false`, nextAction "Start or resume a task..."
  - [x] `TASK_NOT_FOUND` → `-32602`, subsystem `"rpc"`, recoverable `true`, nextAction "Provide a valid taskId..."
  - [x] `LEARNING_REVIEW_NOT_FOUND` → `-32602`, subsystem `"rpc"`, recoverable `true`, nextAction "Learning reviews are generated for non-trivial completed tasks."
  - [x] `INVALID_CWD` → `-32602` (existing pattern from Story 7.5).
  - [x] All data codes pass `SAFE_ERROR_CODE_PATTERN` check.

- [x] Add contract tests. (AC: 1-11)
  - [x] `task.getResult` with active completed task returns bounded final summary with all required fields.
  - [x] `NO_ACTIVE_TASK` when no task is active.
  - [x] `TASK_NOT_FOUND` for non-matching taskId.
  - [x] `INVALID_CWD` for out-of-scope cwd.
  - [x] `task.learningReview` returns `LEARNING_REVIEW_NOT_FOUND` when no learning review exists.
  - [x] `task.learningReview` returns `NO_ACTIVE_TASK` when no task is active.
  - [x] `task.learningReview` returns `INVALID_CWD` for out-of-scope cwd.
  - [x] Capabilities advertise `task.getResult` and `task.learningReview`.
  - [x] Notifications produce no response and no side effects.
  - [x] Redaction: no secret-like values or local private paths in responses/errors.
  - [x] Backward compatibility: all 444 existing tests remain green.

- [x] Validate and update story status during implementation. (AC: 11)
  - [x] GitNexus impact: LOW blast radius — bridge extended additively, CLI wired up.
  - [x] Targeted validation: 4 files / 159 tests passed → 4 files / 170 tests passed after additions.
  - [x] Full validation: `npm run lint && npm test` → typecheck + 28 files / 444 tests passed.
  - [x] GitNexus detect_changes confirms LOW risk, expected files only.
  - [x] Moving story to `review`.

## Dev Notes

### Story Intent

Story 7.6 exposes post-task artifacts — final summaries and learning reviews — through JSON-RPC. After Stories 7.1–7.5 established session management, task submission, event streaming, and approval responses, this story gives external clients read access to completed-task outcomes. The implementation must add two read-only RPC methods that route through the existing bridge pattern and produce bounded, secret-free payloads.

### Source Requirements

- Epic 7 requires JSON-RPC automation over stdin/stdout with final summary and learning review retrieval as a dedicated story.
- PRD FR67 requires external clients to retrieve final summaries and learning reviews through JSON-RPC.
- PRD FR68 requires JSON-RPC clients to operate under scoped permissions.
- PRD Journey 4 requires "Final summary and learning review result schema" for RPC clients.
- Architecture defines `getActiveTask()` → `createFinalTaskSummary()` as the summary path already used by TUI.
- Architecture event model: `learning.review.created` event payload carries facts, lessons, mistakes, test gaps, memory candidates, skill signals, and artifact path.
- NFR-* bounds: responses must not expose raw stdout/stderr, secret values, private paths, or out-of-scope memory.

### Previous Story Intelligence

- Story 7.1 established strict LF-delimited JSON-RPC stdout, parse/method error handling, notifications without responses, and no TUI output leaks.
- Story 7.2 added `session.create` and `session.resume`, created durable no-task sessions, reused core session storage, added safe runtime error mapping.
- Story 7.3 added `task.start` with scoped params, provider secret rejection, active task conflict handling, and bounded result payloads.
- Story 7.4 added `event.subscribe`/`event.unsubscribe` with connection-scoped subscriptions, filtered event streaming, terminal/actionable state hints, bounded replay, and serialized write queue.
- Story 7.5 added `approval.respond` with granular validation sub-codes (APPROVAL_COMMAND_TOO_LONG, APPROVAL_ARGS_TOO_MANY, APPROVAL_ARG_TOO_LONG, APPROVAL_TIMEOUT_INVALID, APPROVAL_ENV_TOO_MANY_ENTRIES, APPROVAL_ENV_KEY_INVALID, APPROVAL_ENV_VALUE_TOO_LONG, APPROVAL_PATCH_EDITS_TOO_MANY, APPROVAL_PATCH_TEXT_EMPTY, APPROVAL_PATCH_TEXT_TOO_LONG, APPROVAL_PATCH_SUMMARY_TOO_LONG), cwd max-length bound, timeoutMs cap, duplicate env key detection, whitespace-only command rejection, and bound values in all error messages.
- Story 7.5 review also deferred: combined ARG_MAX guard, magic number rationale, boundary-at-limit tests, and edit.path cwd scoping.
- Key patterns to REUSE from 7.5:
  - `readScopedCwd()` for cwd canonicalization and scope enforcement.
  - `readSafeErrorCode()` for extracting safe error codes from SpriteError.
  - `createJsonRpcSuccessResponse()`, `createJsonRpcErrorResponse()` for response construction.
  - Async-aware `handleJsonRpcMessage` + write queue pattern from Story 7.4.
  - Bounded response payloads (no unbounded arrays, include actual limit values in nextAction).
  - Granular error codes per distinct failure mode (not one generic code).

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts`: extend method routing, metadata capabilities, params validation, safe error helpers, bridge interface, and `handleJsonRpcRequest`. Add `handleTaskGetResult` and `handleTaskLearningReview` handlers.
- `packages/core/src/agent-runtime.ts`: reuse `getActiveTask()` (returns `Result<PlannedExecutionFlow>`), `getBootstrapState()`, and learning review storage/retrieval paths.
- `packages/core/src/final-task-summary.ts`: reuse `createFinalTaskSummary(state: PlannedExecutionFlow): FinalTaskSummary` — this is the same function used by TUI to render final summaries. The RPC handler mirrors the TUI path.
- `packages/core/src/runtime-events.ts`: the `learning.review.created` event schema defines the shape of learning review data. Its payload includes `facts`, `lessons`, `mistakes`, `testGaps`, `memoryCandidates`, `skillSignals`, `reuseEvidence`, `artifactPath`, and `mode`.
- `packages/core/src/index.ts`: exports `readLearningReviewArtifacts`, `readLearningReviewLessonCandidates`, `StoredLearningReviewArtifact`, `StoredLearningReviewLessonCandidate` — these are the disk-level retrieval functions.
- `tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, and `tests/session-persistence.test.ts`: primary regression surfaces.
- `tests/runtime-events.test.ts`: contains existing learning review event tests for fixture patterns.

### Critical Implementation Hazards

1. **`createFinalTaskSummary` takes `PlannedExecutionFlow`, not a task ID.** The handler must call `runtime.getActiveTask()` to get the `PlannedExecutionFlow` state, then pass it to `createFinalTaskSummary()`. For specific taskId lookups, the runtime or session store must expose a `getTaskById()` method or equivalent.

2. **Learning reviews are stored on disk, not in memory.** `writeLearningReview()` writes JSON artifacts to `.sprite/sessions/<sessionId>/learning-reviews/`. The handler must read from disk via the bridge, not from in-memory state. Use `readLearningReviewArtifacts()` from `@sprite/core`.

3. **Bounded response payloads.** The `FinalTaskSummary` type includes arrays (`importantEvents`, `memoryInfluences`, `skillInfluences`, `filesChanged`, etc.) that could be large for long-running tasks. Cap `importantEvents` to a bounded number (e.g., 100 most recent) in the response. The full list is available on disk if needed.

4. **Scope enforcement.** Both methods must validate `cwd` through `readScopedCwd()` and reject out-of-scope directories. Learning review responses must filter memory/skill data to the caller's cwd scope.

5. **No new dependencies.** Do not add npm packages. Reuse existing types from `@sprite/core`, `@sprite/sandbox`, and the existing `readLearningReview*` exports.

### Recommended Method Contracts

#### `task.getResult`

Params:
```json
{
  "cwd": "/absolute/project/path",
  "taskId": "task_abc123"  // optional, defaults to active task
}
```

Success result:
```json
{
  "taskId": "task_abc123",
  "sessionId": "ses_xyz",
  "correlationId": "corr_def456",
  "status": "completed",
  "result": "Fixed the type error in config.ts and validated with tsc.",
  "provider": { "providerName": "openai", "model": "gpt-4o" },
  "filesChanged": ["src/config.ts"],
  "filesProposedForChange": [],
  "filesRead": ["src/config.ts", "package.json"],
  "unresolvedRisks": [],
  "notAttempted": [],
  "importantEvents": [ /* bounded recent events */ ],
  "memoryInfluences": [ /* bounded scoped influences */ ],
  "skillInfluences": [ /* bounded scoped influences */ ]
}
```

#### `task.learningReview`

Params:
```json
{
  "cwd": "/absolute/project/path",
  "taskId": "task_abc123"
}
```

Success result:
```json
{
  "taskId": "task_abc123",
  "sessionId": "ses_xyz",
  "correlationId": "corr_def456",
  "mode": "full",
  "artifactPath": ".sprite/sessions/ses_xyz/learning-reviews/task_abc123.json",
  "facts": [ /* bounded */ ],
  "lessons": [ /* bounded */ ],
  "mistakes": [ /* bounded */ ],
  "testGaps": [ /* bounded */ ],
  "memoryCandidates": [ /* bounded, scoped */ ],
  "skillSignals": [ /* bounded, scoped */ ],
  "reuseEvidence": [ /* bounded */ ]
}
```

### Error Code Mapping

| Condition | JSON-RPC Code | data.code | recoverable | nextAction |
|---|---|---|---|---|
| No active task, no taskId | `-32603` | `NO_ACTIVE_TASK` | false | "Start or resume a task first." |
| Specific taskId not found | `-32602` | `TASK_NOT_FOUND` | true | "Provide a valid taskId or omit taskId for the active task." |
| No learning review exists | `-32602` | `LEARNING_REVIEW_NOT_FOUND` | true | "Learning reviews are generated for non-trivial completed tasks." |
| Out-of-scope cwd | `-32602` | `INVALID_CWD` | true | "Set cwd to the session's working directory." |
| Invalid params | `-32602` | `INVALID_PARAMS` | true | (specific hint) |

### Scope Boundaries / Anti-Patterns

- Do not implement `runtime.getState`, task cancellation, memory APIs, skill APIs, session list/delete/update, or external SDK code in this story.
- Do not import from `@sprite/tui`, Ink, React, or CLI display helpers in `@sprite/rpc`.
- Do not read/write `.sprite/sessions` directly from `packages/rpc`; go through `AgentRuntime` and the bridge interface.
- Do not echo raw stdout/stderr, patch bodies, environment values, or secret-like content in RPC responses or errors.
- Do not add dependencies.
- Do not create new summary or learning review generation logic — reuse `createFinalTaskSummary()` and existing learning review artifacts.
- This is a **read-only** story — neither method modifies runtime state.

### Testing Requirements

- Use Vitest.
- Add tests before implementation where practical, and keep red/green evidence in the Dev Agent Record.
- Protocol tests must parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
- Tests must prove both methods work with the active task (no taskId) and with an explicit taskId.
- Tests must prove `NO_ACTIVE_TASK`, `TASK_NOT_FOUND`, `LEARNING_REVIEW_NOT_FOUND`, and `INVALID_CWD` error responses.
- Tests must prove notifications do not execute handlers or emit responses.
- Tests must prove redaction of secret-like values, raw stdout/stderr, and local private paths.
- CLI subprocess tests must build first and run against `packages/cli/dist/index.js`.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.
- **Test fixture pattern:** Create a runtime, submit and complete a task (or mock a completed `PlannedExecutionFlow`), then call `task.getResult` / `task.learningReview` against the handler.

### Project Structure Notes

- `packages/rpc/src/index.ts` — primary implementation surface; add `handleTaskGetResult` and `handleTaskLearningReview` handlers, extend bridge interface and capabilities.
- `packages/core/src/agent-runtime.ts` — `getActiveTask()` already exposed; no changes expected. May need to expose `getTaskById()` or use session store for completed task lookup.
- `packages/core/src/final-task-summary.ts` — `createFinalTaskSummary()` already implemented and exported; no changes expected.
- `tests/rpc-protocol.test.ts` — primary RPC contract test surface for new methods.
- `tests/cli-rpc.test.ts` — CLI subprocess integration tests (capability advertisement regression).
- `tests/runtime-events.test.ts` — existing learning review event tests for regression.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.6]
- [Source: _bmad-output/planning-artifacts/prd.md#FR67, FR68, Journey 4]
- [Source: _bmad-output/planning-artifacts/architecture.md#RPC/Event/Learning Review sections]
- [Source: _bmad-output/implementation-artifacts/7-5-respond-to-approval-requests-through-json-rpc.md]
- [Source: _bmad-output/implementation-artifacts/7-4-stream-runtime-lifecycle-events-to-rpc-clients.md]
- [Source: packages/core/src/final-task-summary.ts]
- [Source: packages/core/src/runtime-events.ts#learning.review.created]
- [Source: packages/rpc/src/index.ts]

## Dev Agent Record

### Agent Model Used

Claude (Opus 4.7) via Claude Code on 2026-05-30.

### Debug Log References

- Targeted vitest run: `npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts` → 4 files / 170 tests passed.
- Full vitest run: `npm test` → 28 files / 444 tests passed.
- Lint/typecheck: `npm run lint` → exit 0.
- GitNexus detect_changes: LOW risk, expected files only (rpc/src/index.ts, cli/src/index.ts, rpc-protocol.test.ts, story/sprint files).
- Bridge extended additively with `getLearningReviewArtifacts`; existing handler call sites continue to work unchanged.
- CLI bridge wrapper created to satisfy the new bridge member without modifying AgentRuntime core.

### Completion Notes List

- Added `task.getResult` and `task.learningReview` to `RPC_CAPABILITIES`; method-not-found `nextAction` hint updated.
- Implemented `handleTaskGetResult` in `packages/rpc/src/index.ts`. The handler:
  - Reuses `readScopedCwd()` for cwd canonicalization and scope enforcement.
  - Validates optional `taskId` against `TASK_ID_PATTERN`.
  - Calls `runtime.getActiveTask()` → `createFinalTaskSummary()`.
  - When taskId provided but doesn't match active task, returns `TASK_NOT_FOUND`.
  - Returns bounded final summary with `importantEvents` capped at 100 and influences at 50.
  - No raw stdout/stderr, patch bodies, or local private paths in responses/errors.
- Implemented `handleTaskLearningReview` in `packages/rpc/src/index.ts`. The handler:
  - Reads learning review artifacts via bridge's `getLearningReviewArtifacts`.
  - Filters by taskId; returns `LEARNING_REVIEW_NOT_FOUND` when no match.
  - Returns bounded arrays (50 items max each) for facts, lessons, mistakes, testGaps, memoryCandidates, skillSignals.
  - No raw output or secret-like values in responses/errors.
- Extended `JsonRpcRuntimeBridge` with `getLearningReviewArtifacts` using `readLearningReviewArtifacts` from `@sprite/core`.
- Wired up CLI (`packages/cli/src/index.ts`) with explicit bridge wrapper providing `getLearningReviewArtifacts`.
- Added 11 new RPC contract tests in `tests/rpc-protocol.test.ts` covering both methods: active task success, NO_ACTIVE_TASK, TASK_NOT_FOUND, INVALID_CWD, LEARNING_REVIEW_NOT_FOUND, capability advertisement, notification no-op, and backward compatibility.

### File List

- `packages/rpc/src/index.ts` — extended bridge interface, capability metadata, added `readTaskGetResultParams`, `readTaskLearningReviewParams`, `summarizeTaskGetResult`, `summarizeLearningReviewArtifact`, `handleTaskGetResult`, `handleTaskLearningReview` handlers, and routing.
- `packages/cli/src/index.ts` — wired `getLearningReviewArtifacts` through explicit bridge wrapper.
- `tests/rpc-protocol.test.ts` — added `toBridge` helper, `bridge` to `createTempRuntime`, updated all call sites, and added `task.getResult` (6 tests) + `task.learningReview` (5 tests) suites.
- `_bmad-output/implementation-artifacts/7-6-retrieve-final-summaries-and-learning-reviews-through-json-rpc.md` — this file.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updates.

### Change Log

- 2026-05-30: Created Story 7.6 implementation artifact following BMAD create-story workflow.
- 2026-05-30: Implemented `task.getResult` and `task.learningReview` JSON-RPC methods end-to-end (bridge extension, handlers, validation, error mapping), added 11 contract tests, and moved story to `review`.
