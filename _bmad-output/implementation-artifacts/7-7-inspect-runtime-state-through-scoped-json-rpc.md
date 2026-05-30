# Story 7.7: Inspect Runtime State Through Scoped JSON-RPC

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an external automation client,
I want to inspect runtime state through scoped JSON-RPC,
so that integrations can display status without overreaching into local data.

## Acceptance Criteria

1. JSON-RPC method `runtime.getState` accepts structured params with required `cwd`; returns active session/task state, provider/model metadata, sandbox state, allowed tools, memory scope, and capability metadata — **without** provider secrets, raw stdout/stderr, local private paths, or unauthorized session/memory data.
2. `runtime.getState` returns `NO_ACTIVE_SESSION` when no session is established for the scoped `cwd` — not an internal error; a structured, recoverable response.
3. Provider state includes provider name and model only — never API keys, tokens, base URLs with embedded credentials, or raw configuration secrets.
4. Out-of-scope `cwd` is rejected with `INVALID_CWD` following the established pattern from Story 7.3/7.5/7.6.
5. Notifications for `runtime.getState` (requests without `id`) produce no response and no side effects.
6. Protocol stdout remains JSON-RPC-only and line-delimited, preserving Story 7.1–7.6 behavior.
7. Existing `rpc.ping`, `session.create`, `session.resume`, `task.start`, `event.subscribe`/`event.unsubscribe`, `approval.respond`, `task.getResult`, and `task.learningReview` behavior remains backward-compatible.
8. Contract tests cover: full state retrieval with active session, full state with active session + task, no-active-session, cwd scope rejection, notification no-op, provider secret redaction, capabilities advertisement, stdout purity, and backward compatibility.

## Tasks / Subtasks

- [ ] Confirm Story 7.7 scope and implementation surfaces. (AC: 1-8)
  - [ ] Read this story, Epic 7, PRD Journey 4/RPC requirements, architecture runtime/RPC sections, Stories 7.1–7.6, and any research artifact.
  - [ ] Inspect `packages/rpc/src/index.ts`, `packages/core/src/agent-runtime.ts` (`getBootstrapState`, `getActiveTask`, `getEventHistory`), existing `BootstrapState` interface, RPC bridge/CLI RPC tests, and the `rpc.ping` handler (which already returns partial state via `createProtocolMetadata`).
  - [ ] Run GitNexus impact analysis before editing; check `handleJsonRpcRequest`, `JsonRpcRuntimeBridge`, `getBootstrapState`, `getActiveTask`, `createProtocolMetadata`, `readBootstrapMetadata`.
  - [ ] Report any HIGH/CRITICAL blast radius before editing, per project rule.
  - [ ] Keep scope to `runtime.getState` only; do not implement configuration editing, task cancellation, session deletion, or HTTP/SSE transport.

- [ ] Define the `runtime.getState` contract. (AC: 1-7)
  - [ ] Add `runtime.getState` to `RPC_CAPABILITIES` array.
  - [ ] Validate object params only; reject positional/non-object params.
  - [ ] Require `cwd` and canonicalize it using existing `readScopedCwd()`.
  - [ ] Reject unknown params with safe structured errors (follow `-32602` pattern).
  - [ ] Notifications must short-circuit before any state access.

- [ ] Implement `handleRuntimeGetState` handler. (AC: 1-4)
  - [ ] Add routing in `handleJsonRpcRequest` while preserving parse, method-not-found, and notification behavior.
  - [ ] Read scoped `cwd` via `readScopedCwd()`.
  - [ ] Build the state response from `runtime.getBootstrapState()`, `runtime.getActiveTask()`, `runtime.getEventHistory()`, and `runtime.getPendingApprovals()`.
  - [ ] Include: session (`sessionId`, `cwd`, `status`, `createdAt` if available), task (`taskId`, `status`, `correlationId` if active), provider (`providerName`, `model` — no secrets), capabilities list, activeTask (null or bounded summary), pendingApprovals (count only), eventCount, sandbox (bounded state), memory scope, and protocol metadata.
  - [ ] **Critical:** Strip `provider` fields to only `providerName` and `model`. Never echo `baseUrl`, `apiKey`, `token`, or any secret-like field.
  - [ ] Return `NO_ACTIVE_SESSION` when `getActiveTask().ok === false` AND no session state is established (i.e., bootstrap reports no active session). Use `-32603`, subsystem `"rpc"`, recoverable `false`.
  - [ ] Cap event count and pending approvals count to safe integers — no unbounded arrays.
  - [ ] Use the serialized write queue (Story 7.4) for the response.

- [ ] Map runtime errors to safe structured JSON-RPC errors. (AC: 2, 4)
  - [ ] `NO_ACTIVE_SESSION` → `-32603`, subsystem `"rpc"`, recoverable `false`, nextAction "Create a session or resume an existing session first."
  - [ ] `INVALID_CWD` → `-32602` (existing pattern from Story 7.5/7.6).
  - [ ] `INVALID_PARAMS` → `-32602` for malformed params.
  - [ ] Use `SAFE_ERROR_CODE_PATTERN` for all data codes.

- [ ] Add contract tests. (AC: 1-8)
  - [ ] Full state retrieval with active session (no task) — verify all sections present, no secrets.
  - [ ] Full state retrieval with active session + running task — verify taskId, status, correlationId present.
  - [ ] Error: `NO_ACTIVE_SESSION` when no session established.
  - [ ] Error: `INVALID_CWD` for out-of-scope cwd.
  - [ ] Capabilities advertise `runtime.getState`.
  - [ ] Notifications produce no response and no side effects.
  - [ ] Redaction: no provider secrets (apiKey, baseUrl, token) in response or serialized output.
  - [ ] Stdout purity: CLI subprocess tests parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
  - [ ] Backward compatibility: existing test suites remain green.

- [ ] Validate and update story status during implementation. (AC: 8)
  - [ ] Before code edits, run the targeted GitNexus impact checks and record blast radius in the Dev Agent Record.
  - [ ] Run targeted validation: `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'`.
  - [ ] Run full validation: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [ ] Run GitNexus detect/analyze/status before commit.
  - [ ] Move story to `review` only after tests pass.

## Dev Notes

### Story Intent

Story 7.7 completes Epic 7 by giving external clients read access to the runtime's current state. After Stories 7.1–7.6 established session management, task submission, event streaming, approval responses, and post-task artifact retrieval, this story exposes a single `runtime.getState` method that returns a comprehensive, bounded snapshot of the runtime — enabling editor panels, dashboards, and automation scripts to display status without overreaching.

### Source Requirements

- Epic 7 final story: "Inspect Runtime State Through Scoped JSON-RPC."
- PRD FR68: JSON-RPC clients operate under scoped permissions.
- Architecture lists `runtime.getState` as an RPC method alongside `session.create`, `task.start`, etc.
- Architecture NFR: secrets and credentials must not be exposed in RPC state responses.
- Architecture event model: `BootstrapState` already provides startup, provider, and project context data.

### Previous Story Intelligence

- Story 7.1: LF-delimited JSON-RPC stdout, parse/method error handling, notifications without responses.
- Story 7.2: `session.create`/`session.resume` with safe runtime error mapping.
- Story 7.3: `task.start` with scoped params, provider secret rejection, structured errors.
- Story 7.4: `event.subscribe`/`event.unsubscribe` with filtered streaming and serialized write queue.
- Story 7.5: `approval.respond` with granular validation sub-codes, cwd max-length, env hardening.
- Story 7.6: `task.getResult` + `task.learningReview` — read-only methods following the same `readScopedCwd()` → validate → build response pattern. Added `TASK_NOT_TERMINAL` gate, `taskId` validation, `sessionId` filter, null-safety on arrays, error code mapping.
- **Key pattern to REUSE from 7.6:** Single read-only handler with `readScopedCwd()`, bounded response, no secrets in output. `runtime.getState` is structurally simpler than `task.getResult` — it reads current state rather than post-task artifacts.

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts`: extend method routing, metadata capabilities, and `handleJsonRpcRequest`. Add `handleRuntimeGetState` handler.
- `packages/rpc/src/index.ts`: existing `readBootstrapMetadata()` and `createProtocolMetadata()` functions already extract safe provider metadata from `BootstrapState` — reuse these to avoid reinventing secret stripping.
- `packages/core/src/agent-runtime.ts`: `getBootstrapState()` returns `BootstrapState` with `startup`, `provider`, `projectContext`, `warnings`. `getActiveTask()` returns the current task or an error. `getEventHistory()` returns events. `getPendingApprovals()` returns pending approvals.
- `packages/rpc/src/index.ts`: `rpc.ping` handler already demonstrates how to build a state response from `getBootstrapState()` — follow this pattern and extend it.
- `tests/rpc-protocol.test.ts`: primary test surface. Use `toBridge()` and `createTempRuntime()` patterns from Story 7.6.
- `tests/cli-rpc.test.ts`: CLI subprocess integration tests.

### Critical Implementation Hazards

1. **Provider secret leakage.** `BootstrapState.provider` includes `baseUrl` which may contain embedded credentials. `ResolvedProviderState` may include `apiKey`. The handler MUST strip all provider fields except `providerName` and `model`. Use explicit field selection — never spread the provider object.

2. **`runtime.getState` without an active session.** When no `session.create` or `session.resume` has been called, `getActiveTask()` returns an error. This should return `NO_ACTIVE_SESSION` (a structured state response indicating no session), not a generic `-32603` error.

3. **The `rpc.ping` handler already returns partial state.** It uses `readBootstrapMetadata()` to build a `params` object with `protocolVersion`, `runtimeConnected`, `server`, `transport`, and `capabilities`. `runtime.getState` should extend this with task/session/sandbox/memory state rather than duplicating.

4. **Bounded response.** Don't return full event histories, full approval lists, or full memory/skill data. Return counts and bounded summaries only.

5. **No new dependencies.** Do not add npm packages. Everything needed is already in the bridge or available from `@sprite/core`.

### Recommended Method Contract

#### `runtime.getState`

Params:
```json
{
  "cwd": "/absolute/project/path"
}
```

Success result (with active session + task):
```json
{
  "protocol": {
    "protocolVersion": "2.0",
    "runtimeConnected": true,
    "server": "sprite-rpc",
    "transport": "stdio",
    "capabilities": ["rpc.ping", "session.create", "..."]
  },
  "session": {
    "sessionId": "ses_abc123",
    "cwd": "/absolute/project/path",
    "status": "active",
    "createdAt": "2026-05-30T..."
  },
  "task": {
    "taskId": "task_def456",
    "status": "waiting-for-input",
    "correlationId": "corr_ghi789"
  },
  "provider": {
    "providerName": "openai",
    "model": "gpt-4o"
  },
  "sandbox": {
    "pendingApprovals": 1,
    "eventCount": 42
  },
  "warnings": []
}
```

Success result (no active session):
```json
{
  "protocol": {
    "protocolVersion": "2.0",
    "runtimeConnected": true,
    "server": "sprite-rpc",
    "transport": "stdio",
    "capabilities": ["rpc.ping", "..."]
  },
  "session": null,
  "task": null,
  "provider": null,
  "sandbox": {
    "pendingApprovals": 0,
    "eventCount": 0
  },
  "warnings": ["No active session. Create a session or resume an existing one."]
}
```

### Error Code Mapping

| Condition | JSON-RPC Code | data.code | recoverable | nextAction |
|---|---|---|---|---|
| Out-of-scope cwd | `-32602` | `INVALID_CWD` | true | "Set cwd to the session's working directory." |
| Invalid params | `-32602` | `INVALID_PARAMS` | true | (specific hint) |

### Scope Boundaries / Anti-Patterns

- Do not implement configuration editing, task cancellation, session deletion, memory APIs, skill APIs, or HTTP/SSE transport.
- Do not return raw `BootstrapState` — always filter through a safe summarizer.
- Do not import from `@sprite/tui`, Ink, React, or CLI display helpers.
- Do not read/write `.sprite/sessions` directly from `packages/rpc`.
- Do not echo provider secrets, baseUrls with credentials, local private paths, or raw configuration data.
- This is a **read-only** method — no runtime state is modified.

### Testing Requirements

- Use Vitest.
- Protocol tests must parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
- Tests must use `toBridge()` and `createTempRuntime()` patterns from Story 7.6.
- Tests must prove provider secrets (apiKey, baseUrl, token) are not in response.
- Tests must prove state retrieval works with and without an active task.
- Tests must prove `INVALID_CWD` rejection.
- Tests must prove notification no-op.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

### Project Structure Notes

- `packages/rpc/src/index.ts` — primary implementation surface; add `handleRuntimeGetState` handler, extend capabilities.
- `packages/core/src/agent-runtime.ts` — no changes expected; reuse `getBootstrapState()`, `getActiveTask()`, `getEventHistory()`, `getPendingApprovals()`.
- `tests/rpc-protocol.test.ts` — primary RPC contract test surface for the new method.
- `tests/cli-rpc.test.ts` — CLI subprocess integration tests (capability advertisement regression).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.7]
- [Source: _bmad-output/planning-artifacts/prd.md#FR68]
- [Source: _bmad-output/planning-artifacts/architecture.md#RPC section]
- [Source: _bmad-output/implementation-artifacts/7-6-retrieve-final-summaries-and-learning-reviews-through-json-rpc.md]
- [Source: _bmad-output/implementation-artifacts/7-5-respond-to-approval-requests-through-json-rpc.md]
- [Source: packages/core/src/agent-runtime.ts#BootstrapState, getBootstrapState]
- [Source: packages/rpc/src/index.ts#createProtocolMetadata, readBootstrapMetadata]

## Dev Agent Record

### Agent Model Used

(To be filled by dev agent)

### Debug Log References

(To be filled by dev agent)

### Completion Notes List

(To be filled by dev agent)

### File List

- `packages/rpc/src/index.ts` — added `handleRuntimeGetState` handler, extended capabilities, updated method-not-found hint.
- `tests/rpc-protocol.test.ts` — added `runtime.getState` test suite.
- `tests/cli-rpc.test.ts` — added capability advertisement regression.
- `_bmad-output/implementation-artifacts/7-7-inspect-runtime-state-through-scoped-json-rpc.md` — this file.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updates.

### Change Log

- 2026-05-30: Created Story 7.7 implementation artifact following BMAD create-story workflow.
