# Story 7.2: Create or Resume Sessions Through JSON-RPC

Status: review

<!-- Note: Created after Story 7.1 was completed and committed because Chinnaphat asked to move to Story 7.2. -->

## Story

As an external client,
I want to create or resume sessions through JSON-RPC,
so that automation can manage task continuity.

## Acceptance Criteria

1. Given an RPC client calls `session.create` with `cwd` and optional config/context parameters, when the request is authorized, then the runtime creates a session and returns session ID, cwd, provider/model state, and initial runtime state.
2. Given an RPC client calls `session.resume` with an existing session ID, when the session is readable and in scope, then the runtime restores the session state and returns resumable task/session metadata without exposing secrets.

## Tasks / Subtasks

- [x] Confirm Story 7.2 scope, context, and GitNexus blast radius before code edits (AC: 1-2)
  - [x] Re-read this story, Story 7.1, Epic 7, PRD RPC/session requirements, architecture RPC/session rules, and the Story 7.2 research artifact.
  - [x] Inspect the current RPC adapter, `AgentRuntime` session APIs, local session store, CLI RPC subprocess tests, and existing session persistence tests.
  - [x] Run GitNexus impact analysis before editing existing symbols such as `AgentRuntime`, `runJsonRpcStdioServer`, `handleJsonRpcMessage`, `createProtocolMetadata`, `createProgram`, and session-store helpers.
  - [x] Keep this story limited to session lifecycle RPC; do not implement `task.start`, event subscriptions, approval responses, final-summary retrieval, learning-review retrieval, session fork/clone/delete/update/list, or broad runtime inspection.

- [x] Define the Story 7.2 RPC contract and validation behavior (AC: 1-2)
  - [x] Add `session.create` request parsing with object params only and explicit `-32602 Invalid params` errors for missing/invalid `cwd`, unsupported param shapes, or out-of-scope cwd.
  - [x] Add `session.resume` request parsing with object params only and explicit `-32602 Invalid params` errors for invalid `sessionId`, invalid `cwd`, unreadable session, or cwd/session scope mismatch.
  - [x] Return JSON-RPC responses using the existing adapter style, with session data under `result`, bounded structured error data, and no raw secret-like input echoing.
  - [x] Update protocol/capability metadata so `rpc.ready` / `rpc.ping` advertise `session.create` and `session.resume` once available.
  - [x] Preserve Story 7.1 transport behavior: strict LF framing, startup `rpc.ready`, no response to notifications, batch behavior, and stdout protocol-only.

- [x] Add shared runtime session lifecycle support instead of duplicating session-store logic in RPC (AC: 1-2)
  - [x] Add a core `AgentRuntime` API for creating a durable session without starting a task, returning session ID, canonical cwd, provider/model state, initial runtime state, event count, created timestamp, and warnings.
  - [x] Reuse the existing local session store (`LocalSessionStore.ensureSession`) and persisted `state.json` shape for no-task sessions; do not create a separate RPC session store.
  - [x] Extend or wrap `AgentRuntime.resumeSession` so RPC can pass an explicit cwd/session scope while preserving existing CLI/TUI/session tests.
  - [x] Ensure `session.create` does not call `submitInteractiveTask`, does not create task events, and leaves `getActiveTask()` unavailable.
  - [x] Ensure `session.resume` uses existing persisted session artifacts/events and emits only the runtime resume behavior already defined by core.

- [x] Implement RPC adapter methods for `session.create` and `session.resume` (AC: 1-2)
  - [x] Map `session.create` to the shared runtime session-create API and include session ID, cwd, status, task ID `null`, provider/model state, runtime event count, active task state, capabilities, and warnings.
  - [x] Map `session.resume` to the shared runtime resume API and include session ID, task ID, correlation ID, status, current phase, redacted goal/next step metadata where available, latest plan, restored event count, resume event ID, inspection summary, and warnings.
  - [x] Canonicalize cwd and enforce the MVP scope rule: requested cwd must resolve to the RPC process runtime cwd for Story 7.2. Broader roots/scopes belong to later scoped-permission work.
  - [x] Convert runtime/session storage errors into safe JSON-RPC errors without exposing raw provider credentials, auth file contents, raw transcript/messages, or unbounded user input.
  - [x] Keep RPC independent from TUI, Ink, React, and TUI view models.

- [x] Add deterministic protocol and runtime tests (AC: 1-2)
  - [x] Add pure RPC tests for successful `session.create`, successful `session.resume`, advertised capabilities, no task side effects on create, and no raw secret/cwd leakage beyond the intentional scoped `cwd` result field.
  - [x] Add invalid-param tests for malformed params, missing cwd/session ID, bad session ID format, missing session, and out-of-scope cwd.
  - [x] Add core/runtime tests for no-task session creation and explicit-cwd resume behavior if new core APIs are introduced.
  - [x] Add CLI subprocess tests proving `sprite rpc` can create/resume sessions over stdin/stdout, emits parseable JSON-RPC lines only on stdout, and keeps stderr clean for successful cases.
  - [x] Preserve all Story 7.1 regression tests for `rpc.ping`, parse errors, unknown methods, notification behavior, custom CLI writer completion, CRLF, and Unicode separator framing.

- [x] Validate, review, and mark Story 7.2 ready for review (AC: 1-2)
  - [x] Run targeted RPC/session tests first.
  - [x] Run full validation: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run GitNexus analyze/status and required pre-commit scope checks according to project rules.
  - [x] Update this story's Dev Agent Record, File List, Completion Notes, Change Log, and status only after validation passes.
  - [x] Move sprint status for Story 7.2 to `review` only after implementation validation passes.
  - [x] During code review, report issues found to Chinnaphat before applying fixes.

- [x] Review Follow-ups (AI)
  - [x] [AI-Review][High] Sanitize RPC session runtime/storage error `nextAction` values so raw filesystem error messages cannot leak local paths or session artifact filenames.
  - [x] [AI-Review][Medium] Make repeated `session.create` calls on one RPC runtime deterministic by rejecting duplicate creates with a safe structured error.

## Dev Notes

### Story Intent

Story 7.2 adds the first durable session lifecycle methods to the JSON-RPC adapter. `session.create` creates a local, inspectable session without starting a task. `session.resume` restores an existing persisted session and returns safe metadata so external tools can manage continuity. Task submission remains Story 7.3.

### Source Requirements

- Epic 7 requires external clients to connect over JSON-RPC, manage sessions, submit tasks, receive lifecycle events, answer approvals, retrieve summaries/reviews, and operate under scoped permissions. Story 7.2 covers only session creation/resume. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 7 / Story 7.2]
- Story 7.2 acceptance criteria require `session.create` to accept `cwd` plus optional config/context params, create a session when authorized, and return session ID, cwd, provider/model state, and initial runtime state. [Source: `_bmad-output/planning-artifacts/epics.md` Story 7.2]
- Story 7.2 acceptance criteria require `session.resume` to restore readable, in-scope sessions and return resumable metadata without exposing secrets. [Source: `_bmad-output/planning-artifacts/epics.md` Story 7.2]
- FR63 requires JSON-RPC connectivity over stdin/stdout. FR68 requires scoped permissions for working directory, tools, session, and memory access. [Source: `_bmad-output/planning-artifacts/prd.md` FR63, FR68]
- NFR11 requires provider credentials not to be displayed in CLI, TUI, logs, RPC state, summaries, or learning reviews. [Source: `_bmad-output/planning-artifacts/prd.md` NFR11]
- NFR15 requires RPC clients to operate within declared permission scopes. [Source: `_bmad-output/planning-artifacts/prd.md` NFR15]
- NFR19 requires persisted task goal, plan, compacted summary, recent event history, files touched, commands run, approvals, last error, and next step so tasks can resume after restart/interruption when the session store is readable. [Source: `_bmad-output/planning-artifacts/prd.md` NFR19]
- NFR49 requires JSON-RPC request/response/event schemas to be covered by contract tests. [Source: `_bmad-output/planning-artifacts/prd.md` NFR49]
- Architecture requires CLI, TUI, print mode, and JSON-RPC to share one `AgentRuntime`; adapters decide presentation/control only. [Source: `_bmad-output/planning-artifacts/architecture.md` Interface/Runtime ownership]
- Architecture uses project-local file storage under `.sprite/sessions/<session-id>/events.ndjson` and `state.json`; append-only events and snapshots are the MVP session source of truth. [Source: `_bmad-output/planning-artifacts/architecture.md` Storage Decision]
- Architecture says RPC behavior lives in `packages/rpc`, core behavior lives in `packages/core`, persisted storage abstractions live in `packages/storage`, and adapters must not own task lifecycle state. [Source: `_bmad-output/planning-artifacts/architecture.md` Module Boundary Rules]

### Public Research Inputs

- JSON-RPC 2.0 requires exact `"jsonrpc": "2.0"`, a string `method`, structured `params` when present, no response for notifications, and `-32602` for invalid method parameters. [Source: https://www.jsonrpc.org/specification]
- Pi RPC demonstrates headless stdin/stdout usage, session/state commands, session IDs, model state, and session statistics; Story 7.1 already applied its strict-LF framing lesson. [Source: https://pi.dev/docs/latest/rpc]
- OpenCode separates session lifecycle APIs (`session.create`, `session.get`, etc.) from prompt/task APIs (`session.prompt`, `session.command`, `session.shell`), matching the Story 7.2 / 7.3 boundary. [Source: https://opencode.ai/docs/sdk/]
- Claude Code session docs emphasize capturing a session ID, resuming by ID, and ensuring cwd matches the local session storage location; mismatch should be treated as an explicit resume/scope error. [Source: https://code.claude.com/docs/en/agent-sdk/sessions]
- MCP lifecycle emphasizes capability negotiation/advertisement and structured JSON-RPC initialization; Sprite does not need MCP compatibility in this story, but `rpc.ready` / `rpc.ping` should advertise stable capabilities. [Source: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle]
- Local research artifact recommends adding `session.create`, `session.resume`, `-32602` invalid params coverage, cwd/session scope tests, secret redaction tests, and subprocess tests; it explicitly excludes fork/continue/task submission. [Source: `_bmad-output/planning-artifacts/research/technical-json-rpc-session-create-resume-research-2026-05-14.md`]

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts` currently owns JSON-RPC request parsing, `rpc.ready`, `rpc.ping`, strict LF stdio framing, structured parse/invalid/method errors, and batch/notification behavior. Extend this file instead of creating a parallel protocol stack.
- `JsonRpcRuntimeBridge` currently exposes `getBootstrapState` and `getEventHistory`; extend the bridge with session lifecycle methods rather than importing storage directly into RPC.
- `AgentRuntime` already has `getBootstrapState()`, `getEventHistory()`, `getActiveTask()`, and `resumeSession(sessionId)`. Add/extend core APIs here so RPC remains an adapter.
- `AgentRuntime.resumeSession()` currently reads persisted session artifacts from the bootstrap cwd, validates runtime events, appends/emits `session.resumed`, reconstructs active task state, persists a snapshot, and returns `SessionResumeResult`.
- `LocalSessionStore.ensureSession()` already creates `.sprite/sessions/<session-id>/`, `events.ndjson`, `state.json`, compaction/review directories, and an initial zero-event state snapshot. Reuse this behavior for no-task session creation.
- `readSessionForResume(cwd, sessionId)` already handles session path resolution, missing state/events files, state/session ID mismatch, and event log reads. Use this path via core/runtime, not direct RPC file reads.
- `tests/rpc-protocol.test.ts` and `tests/cli-rpc.test.ts` are the main Story 7.1 guardrail tests to extend.
- `tests/session-persistence.test.ts` already proves session persistence/resume behavior and is the likely location for core no-task/create/resume additions.

### Contract Details for This Story

#### `session.create`

Example request:

```json
{"jsonrpc":"2.0","id":"create-1","method":"session.create","params":{"cwd":"/project/path","config":{},"context":{}}}
```

Expected result shape:

```json
{
  "session": {
    "sessionId": "ses_...",
    "cwd": "/project/path",
    "status": "created",
    "taskId": null,
    "createdAt": "2026-05-14T00:00:00.000Z"
  },
  "runtime": {
    "provider": {
      "providerName": "openai-compatible",
      "model": "gpt-...",
      "auth": {"authenticated": true, "source": "environment", "secretRedacted": true}
    },
    "eventCount": 0,
    "activeTask": null,
    "capabilities": ["rpc.ping", "session.create", "session.resume"]
  },
  "warnings": []
}
```

Rules:

- `cwd` is required for RPC calls, must be a string, and must canonicalize to the RPC process runtime cwd for MVP scope safety.
- `config` and `context` may be accepted as optional objects but must not be interpreted as task input or persisted raw in Story 7.2 unless a later story defines their schema.
- `session.create` must not start a task, submit a prompt, create `task.started`, or emit task lifecycle events.
- The persisted state for a created-but-empty session should have `eventCount: 0` and no `latestTask`.
- Provider auth state must remain redacted; no API keys, env values, auth file contents, or private config file contents should appear.

#### `session.resume`

Example request:

```json
{"jsonrpc":"2.0","id":"resume-1","method":"session.resume","params":{"sessionId":"ses_...","cwd":"/project/path"}}
```

Expected result shape:

```json
{
  "session": {
    "sessionId": "ses_...",
    "taskId": "task_...",
    "correlationId": "corr_...",
    "status": "waiting-for-input",
    "currentPhase": "plan",
    "latestPlan": [],
    "restoredEventCount": 3,
    "resumeEventId": "evt_..."
  },
  "inspection": {
    "pendingApprovalCount": 0
  },
  "warnings": []
}
```

Rules:

- `sessionId` is required and must use the existing safe `ses_` identifier format.
- `cwd` is required for RPC calls and must canonicalize to the runtime cwd for Story 7.2.
- Missing, unreadable, invalid, or out-of-scope sessions must produce safe JSON-RPC errors; do not expose raw filesystem contents or session transcript text.
- If the session has no latest task snapshot, report a safe resume-unavailable error rather than inventing task metadata.
- Resume may emit/persist the existing core `session.resumed` runtime event; do not add an RPC-only event log.

### Scope Boundaries / Anti-Patterns

- Do not implement `task.start`, `task.cancel`, event subscriptions, approval responses, final summary retrieval, learning review retrieval, memory APIs, skill APIs, runtime.getState, session list/delete/update/fork/clone, or external SDK code in this story.
- Do not import from `@sprite/tui`, Ink, React, or CLI display helpers in `@sprite/rpc`.
- Do not read/write `.sprite/sessions` directly from `packages/rpc`; go through `AgentRuntime` / storage APIs already used by core.
- Do not duplicate session ID generation or session artifact path logic in RPC.
- Do not change Story 7.1 protocol semantics except for capability metadata expanding to include the new methods.
- Do not add dependencies.

### Testing Requirements

- Use Vitest.
- Add tests before implementation where practical, and keep red/green evidence in the Dev Agent Record.
- Protocol tests must parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
- Tests must prove `session.create` creates `.sprite/sessions/<session-id>/state.json` with no latest task and no task events.
- Tests must prove `session.resume` returns metadata from an existing persisted session created by the shared runtime.
- Tests must prove invalid `session.create` / `session.resume` params return `-32602`.
- Tests must prove `session.create` and `session.resume` do not leak secret-like params or provider credentials.
- CLI subprocess tests must build first and run against `packages/cli/dist/index.js`.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created on 2026-05-14 after Story 7.1 was committed (`d95edc7`) and sprint status showed Story 7.2 as backlog.
- Loaded BMad `bmad-create-story`, `bmad-dev-story`, and `gitnexus-cli` guidance, project config, full sprint status, Epic 7 requirements, PRD RPC/session requirements, architecture RPC/session/storage boundaries, Story 7.1 learnings, Story 7.2 technical research, public JSON-RPC/Pi/OpenCode/Claude/MCP references, and current RPC/runtime/session test surfaces.
- `omx explore` was attempted first for repository mapping but did not return within a useful window; continued with bounded RTK-wrapped repository, GitNexus, and source inspection commands.
- Started fresh implementation on 2026-05-14; sprint status moved from ready-for-dev to in-progress.
- GitNexus pre-edit impact checks completed. `AgentRuntime` and `LocalSessionStore` reported HIGH risk, so storage internals were left unchanged and the core change was additive. `handleJsonRpcMessage`, `runJsonRpcStdioServer`, and `createProgram` reported LOW risk.
- Red phase confirmed with `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'`: `AgentRuntime.createSession()` was missing, RPC session methods returned method-not-found, and new CLI session lifecycle tests failed as expected.
- Added `AgentRuntime.createSession()` as an additive no-task session API that reuses `LocalSessionStore.ensureSession()` and returns redacted provider/runtime metadata without task side effects.
- Extended RPC protocol capabilities to advertise `session.create` and `session.resume`.
- Added RPC param validation for session lifecycle methods, including object params, required cwd/session ID, existing/readable cwd, current-runtime cwd scope, optional object `config`/`context`, missing sessions, and safe `-32602` errors.
- Added cwd canonicalization with `realpathSync.native()` so macOS `/var` and `/private/var` temp paths compare correctly in CLI subprocess tests.
- Added session lifecycle mapping in RPC: `session.create` creates a durable no-task session; `session.resume` delegates to `AgentRuntime.resumeSession()` and returns safe resumable metadata plus bounded inspection state.
- Targeted validation passed after implementation: `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (3 files, 41 tests).
- Full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 395 tests).
- GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,145 nodes, 11,001 edges, status up-to-date).
- Code review findings were reported to Chinnaphat before fixes, per standing instruction. Follow-up GitNexus impacts for `AgentRuntime.createSession`, `createSessionRuntimeErrorResponse`, `handleSessionCreate`, and `readSafeErrorCode` were LOW.
- Resolved review follow-up HIGH: `createSessionRuntimeErrorResponse()` now maps internal session/runtime error codes to bounded operator guidance instead of exposing raw exception messages.
- Resolved review follow-up MEDIUM: `AgentRuntime.createSession()` now rejects repeated no-task session creation on the same runtime with `SESSION_ALREADY_CREATED`.
- Targeted validation passed after review fixes: `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (3 files, 43 tests).
- Full validation passed after review fixes: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 397 tests).
- GitNexus re-index/status passed after review fixes: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,155 nodes, 11,005 edges, status up-to-date).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added RPC `session.create` and `session.resume` methods without changing task submission or event subscription behavior.
- Added additive core `AgentRuntime.createSession()` that creates `.sprite/sessions/<session-id>/state.json` with zero events and no latest task.
- Preserved Story 7.1 protocol cleanliness: stdout JSON-RPC only, strict LF framing, notifications without responses, parse/method errors, and no TUI imports.
- Added core, pure-RPC, and CLI subprocess tests covering session create/resume success, invalid params, cwd scope enforcement, missing sessions, no task side effects, capability advertisement, and secret redaction.
- Kept `LocalSessionStore` internals unchanged despite HIGH GitNexus risk; the new behavior reuses existing storage APIs.
- Addressed review findings by replacing raw RPC runtime error messages with safe next-action mappings and adding regression coverage for corrupted session artifact sanitization.
- Addressed duplicate `session.create` semantics by rejecting repeated create requests on the same runtime with `SESSION_ALREADY_CREATED` and regression coverage.

### File List

- `_bmad-output/implementation-artifacts/7-2-create-or-resume-sessions-through-json-rpc.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/rpc/src/index.ts`
- `tests/cli-rpc.test.ts`
- `tests/rpc-protocol.test.ts`
- `tests/session-persistence.test.ts`

### Change Log

- 2026-05-14: Created Story 7.2 implementation artifact and marked it ready for development.
- 2026-05-14: Started Story 7.2 implementation.
- 2026-05-14: Implemented and validated JSON-RPC session create/resume lifecycle; moved Story 7.2 to review.
- 2026-05-14: Addressed code review findings - 2 items resolved.
