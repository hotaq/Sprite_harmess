    # Story 7.5: Respond to Approval Requests Through JSON-RPC

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an external automation client,
I want to respond to approval requests through JSON-RPC,
so that external tools, editors, and scripts can safely mediate risky commands and broad file edits without importing CLI/TUI code or bypassing the shared runtime approval boundary.

## Acceptance Criteria

1. JSON-RPC method `approval.respond` accepts structured params with required `cwd`, `approvalRequestId`, `action`, and optional `reason`, `modifiedRequest`, or `modifiedToolCall` depending on action type; returns a structured result confirming the resolution outcome.
2. Successful `allow` or `alwaysAllowForSession` responses route through `AgentRuntime.respondToApproval()` and execute the originally-requested tool call, returning bounded execution metadata (tool name, status, affected files, duration) without raw stdout/stderr or secret-like values.
3. Successful `deny` responses record the denial through the runtime and return a structured denial confirmation with the approval request ID and optional reason.
4. Successful `edit` responses accept either a `modifiedRequest` (for command edits) or a `modifiedToolCall` (for `apply_patch` edits), validate the modified payload shape, and execute the modified request through the runtime approval path.
5. `timeout` responses record the timeout as a default-deny through the runtime and return a structured timeout confirmation.
6. Invalid or out-of-scope responses are rejected with structured JSON-RPC errors containing `code`, `subsystem`, `recoverable`, optional `correlationId`, and `nextAction`; secret-like values and local private paths are not echoed.
7. Approval request notifications delivered through `event.runtime` (Story 7.4) include `approvalRequestId`, `requestType`, `command`/`summary`, `cwd`, `affectedFiles` when known, `riskLevel`, `reason`, `envExposure`, `timeoutMs`, `allowedActions`, `correlationId`, and `taskId` so clients have all fields needed to present safe approve/deny/edit decisions.
8. Notifications for `approval.respond` (requests without `id`) produce no response and no approval side effects.
9. Protocol stdout remains JSON-RPC-only and line-delimited, preserving Story 7.1/7.3/7.4 behavior.
10. Existing `rpc.ping`, `session.create`, `session.resume`, `task.start`, and `event.subscribe`/`event.unsubscribe` behavior remains backward-compatible.
11. Contract tests cover request/response shape for all four actions, scope rejection, notification no-op, modified payload validation, redaction, stdout purity, and backward compatibility.

## Tasks / Subtasks

- [x] Confirm Story 7.5 scope and implementation surfaces. (AC: 1-11)
  - [x] Read this story, Epic 7, PRD Journey 4/RPC requirements, architecture runtime-event/RPC/approval sections, Story 7.1, Story 7.2, Story 7.3, Story 7.4, and any research artifact for this story.
  - [x] Inspect `packages/rpc/src/index.ts`, `packages/core/src/agent-runtime.ts`, `packages/sandbox/src/approval-service.ts`, `packages/sandbox/src/policy-engine.ts`, approval-related tests, RPC protocol tests, and CLI RPC tests.
  - [x] Run GitNexus impact analysis before editing affected symbols; at minimum check `handleJsonRpcRequest`, `runJsonRpcStdioServer`, `JsonRpcRuntimeBridge`, `AgentRuntime.respondToApproval`, `AgentRuntime.getPendingApprovals`, `ApprovalRequest`, `ApprovalResponse`, and `EventSubscriptionRegistry`.
  - [x] Report any HIGH/CRITICAL GitNexus blast radius before editing, per project rule.
  - [x] Keep scope to `approval.respond` only; do not implement cancellation, final summary retrieval, learning reviews, memory APIs, skill APIs, runtime state inspection, or HTTP/SSE transport.

- [x] Define the `approval.respond` contract. (AC: 1, 6-8, 10)
  - [x] Add `approval.respond` to protocol capability metadata.
  - [x] Validate object params only; reject positional/non-object params.
  - [x] Require `cwd` and canonicalize it to the runtime cwd using existing `readScopedCwd()`.
  - [x] Require `approvalRequestId` as a non-empty string.
  - [x] Require `action` as one of `allow`, `deny`, `edit`, `timeout`, `alwaysAllowForSession`.
  - [x] Accept optional `reason` (bounded string) for `deny` and `edit` actions.
  - [x] Accept optional `modifiedRequest` (CommandPolicyRequest shape) for `edit` action on command approvals.
  - [x] Accept optional `modifiedToolCall` (ApprovalApplyPatchToolCall shape) for `edit` action on file edit approvals.
  - [x] Reject `edit` action without exactly one modified payload.
  - [x] Reject unknown `approvalRequestId` values with safe structured error.
  - [x] Reject actions not in the approval request's `allowedActions` with safe structured error.
  - [x] Notifications for `approval.respond` must not resolve approvals or emit responses.

- [x] Extend `JsonRpcRuntimeBridge` for approval operations. (AC: 1-5)
  - [x] Add `respondToApproval(response: RuntimeApprovalResponse): Promise<Result<ToolExecutionResult>>` to the bridge interface. **CRITICAL:** Use `RuntimeApprovalResponse` from `@sprite/core`, NOT `ApprovalResponse` from `@sprite/sandbox`. The core type separates `edit` into two mutually-exclusive variants (`modifiedRequest` XOR `modifiedToolCall`) using TypeScript's `never` discriminator.
  - [x] Add `getPendingApprovals(taskId?: string): ApprovalRequest[]` to the bridge interface.
  - [x] Keep the bridge additive and backward-compatible for existing tests.

- [x] Implement RPC handler behavior. (AC: 1-6, 9)
  - [x] Add `handleApprovalRespond` routing in `handleJsonRpcRequest` while preserving parse, method-not-found, and notification behavior.
  - [x] Map validated RPC params to `RuntimeApprovalResponse` and call the bridge's `respondToApproval()`.
  - [x] **CRITICAL — deny/timeout error handling:** `AgentRuntime.respondToApproval()` returns `err(SpriteError("APPROVAL_DENIED"))` for deny and `err(SpriteError("APPROVAL_TIMED_OUT"))` for timeout. These are valid resolution outcomes, NOT protocol failures. The RPC handler MUST catch these specific error codes and return them as JSON-RPC **success** responses (not error responses). Pattern: `if (!result.ok && result.error.code === "APPROVAL_DENIED") → return success { action: "deny", ... }`.
  - [x] For `allow`/`alwaysAllowForSession`: return bounded tool execution result (tool name, status, affected files, duration, summary) without raw output content.
  - [x] For `deny`: return `{ approvalRequestId, action: "deny", reason }` as a success response.
  - [x] For `timeout`: return `{ approvalRequestId, action: "timeout" }` as a success response.
  - [x] For `edit`: validate modified payload shape, then return bounded tool execution result from the modified request.
  - [x] Map other runtime errors (`APPROVAL_NOT_FOUND`, `APPROVAL_SCOPE_MISMATCH`, `APPROVAL_EDIT_PAYLOAD_INVALID`) to safe structured JSON-RPC errors with appropriate codes and `nextAction` hints.
  - [x] Use the serialized write queue (from Story 7.4) for the response — `respondToApproval` is async and may trigger tool execution events that stream to subscribers concurrently.
  - [x] Do not echo secret-like values, raw stdout/stderr, patch bodies, or local private paths in responses or errors.

- [x] Verify approval request notification content. (AC: 7)
  - [x] Confirm that `approval.requested` runtime events (already emitted by the core runtime) include all NFR31-required fields: `approvalRequestId`, `requestType`, `command`/`summary`, `cwd`, `affectedFiles`, `riskLevel`, `reason`, `envExposure`, `timeoutMs`, `allowedActions`, `correlationId`, and `taskId`.
  - [x] If the existing `approval.requested` event payload is missing any NFR31 field, enrich it at the core level or add the missing fields to the RPC notification wrapper.
  - [x] Ensure approval notification payloads do not include raw command output, patch bodies, environment values, or secret-like content.
  - [x] Note: `alwaysAllowForSession` may not always be present in a request's `allowedActions` — the RPC handler must validate the client's action against the specific request's `allowedActions` array (this validation already exists in `AgentRuntime.validateApprovalResponseAction()`).

- [x] Add tests. (AC: 1-11)
  - [x] Pure RPC success: `approval.respond` with `action: "allow"` after a pending approval returns bounded tool execution result.
  - [x] Pure RPC success: `approval.respond` with `action: "deny"` returns denial confirmation with reason.
  - [x] Pure RPC success: `approval.respond` with `action: "timeout"` returns timeout confirmation.
  - [x] Pure RPC success: `approval.respond` with `action: "edit"` and valid `modifiedRequest` returns bounded tool execution result.
  - [x] Pure RPC success: `approval.respond` with `action: "edit"` and valid `modifiedToolCall` returns bounded tool execution result.
  - [x] Pure RPC success: `approval.respond` with `action: "alwaysAllowForSession"` returns bounded tool execution result.
  - [x] Capabilities advertise `approval.respond`.
  - [x] Notifications produce no response and no approval side effects.
  - [x] Invalid params: missing cwd, bad cwd, missing approvalRequestId, unknown approvalRequestId, missing action, invalid action, edit without modified payload, edit with both modified payloads, action not in allowedActions.
  - [x] Redaction: no secret-like values, raw stdout/stderr, or local private paths in responses or errors.
  - [x] Stdout purity: CLI subprocess tests parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
  - [x] Backward compatibility: existing `rpc.ping`, `session.create`, `session.resume`, `task.start`, `event.subscribe`, `event.unsubscribe`, parse-error, and notification tests remain green.

- [x] Validate and update story status during implementation. (AC: 11)
  - [x] Before code edits, run the targeted GitNexus impact checks and record blast radius in the Dev Agent Record.
  - [x] Run targeted validation: `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'`.
  - [x] Run full validation: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run GitNexus detect/analyze/status before commit.
  - [x] Move story to `review` only after tests pass.
  - [x] During review phase, report issues found to Chinnaphat before fixing them, per standing instruction.

### Review Findings

- [x] [Review][Patch] AC11 — Add `alwaysAllowForSession` success test [tests/rpc-protocol.test.ts]
- [x] [Review][Patch] AC11 — Add `bad cwd` and `missing action` cases to invalid-params matrix [tests/rpc-protocol.test.ts]
- [x] [Review][Patch] AC7/NFR31 — Add RPC-level test asserting `approval.requested` notification carries all NFR31 fields [tests/rpc-protocol.test.ts]
- [x] [Review][Patch] Bound `modifiedRequest.env` value length and count; reject malformed keys [packages/rpc/src/index.ts:1819]
- [x] [Review][Patch] Reject non-positive `modifiedRequest.timeoutMs` [packages/rpc/src/index.ts:1808]
- [x] [Review][Patch] Add max-length bounds on `command`, `oldText`, `newText`, `args.length`, `edits.length`, `summary` [packages/rpc/src/index.ts]
- [x] [Review][Defer] State inconsistency when `persistCurrentActiveTaskSnapshot` fails mid-`respondToApproval` — deferred, pre-existing core/2-6 behavior
- [x] [Review][Defer] Notification buffer grows unbounded during long-running approved tool execution — deferred, acknowledged in 7.5 commit Not-tested; needs cross-story design with 7.4
- [x] [Review][Defer] Stdin liveness — long approved tool execution blocks subsequent RPC messages on the same pipe — deferred, pre-existing 7.4 design
- [x] [Review][Defer] String length checks use UTF-16 code units, inconsistent with grapheme/byte limits across stories — deferred, cross-cutting 7.3/7.4/7.5 concern
- [x] [Review][Defer] `correlationId` never populated in `approval.respond` error responses — deferred, same omission pattern in 7.3/7.4 errors
- [x] [Review][Patch] Add granular sub-codes for edit validation failures (command too long, too many args, invalid env key, etc.) — currently all collapse into single `APPROVAL_EDIT_PAYLOAD_INVALID` [packages/rpc/src/index.ts]
- [x] [Review][Patch] Reject empty `oldText` in patch edits — semantically ambiguous, should require at least 1 character [packages/rpc/src/index.ts]
- [x] [Review][Patch] Add `APPROVAL_MAX_TIMEOUT_MS` cap and reject sub-millisecond `timeoutMs` values — `MAX_SAFE_INTEGER` overflows setTimeout, fractional values are practically zero [packages/rpc/src/index.ts]
- [x] [Review][Patch] Add `APPROVAL_CWD_MAX_LENGTH` bound — every other string field has a max-length constant but `cwd` does not [packages/rpc/src/index.ts]
- [x] [Review][Patch] Tighten env key pattern to reject underscore-only names (`_`, `__`) — these are reserved POSIX shell variables [packages/rpc/src/index.ts]
- [x] [Review][Patch] Reject duplicate env keys — `Object.entries()` silently drops first occurrence, enabling override attacks [packages/rpc/src/index.ts]
- [x] [Review][Patch] Add test for individual arg length exceeding `APPROVAL_COMMAND_ARG_MAX_LENGTH` (4096) — code path exists but has no coverage [tests/rpc-protocol.test.ts]
- [x] [Review][Patch] Include actual bound values in "bounded" error messages — `APPROVAL_REASON_INVALID` handler already does this; extend the pattern [packages/rpc/src/index.ts]
- [x] [Review][Patch] Reject whitespace-only command strings — passes current length check but fails at OS level with confusing error [packages/rpc/src/index.ts]
- [x] [Review][Defer] No combined ARG_MAX guard across args+env — deferred, individual field bounds are sufficient
- [x] [Review][Defer] Magic number rationale undocumented — deferred, pre-existing pattern
- [x] [Review][Defer] Missing boundary-at-limit tests (only over-limit cases tested) — deferred, test enhancement
- [x] [Review][Defer] `edit.path` not scoped to `cwd` in `readApprovalPatchToolCall` — deferred, path scoping is the `apply_patch` tool's responsibility per architecture

## Dev Notes

### Story Intent

Story 7.5 closes the approval round-trip for JSON-RPC clients. After Story 7.4 delivers approval-waiting notifications through event streaming, this story lets external clients respond to those approval requests through the same protocol. The implementation must route through `AgentRuntime.respondToApproval()` — the same path used by CLI/TUI — so that policy, sandbox, and audit guarantees are preserved.

### Source Requirements

- Epic 7 requires JSON-RPC automation over stdin/stdout with approval responses as a dedicated story.
- PRD FR66 requires external clients to respond to approval requests through JSON-RPC.
- PRD FR68 requires JSON-RPC clients to operate under scoped permissions.
- NFR31 requires JSON-RPC approval requests to include request ID, request type, command or edit summary, working directory, affected files when known, risk level, reason, environment exposure summary, timeout, allowed actions, and correlation ID.
- NFR8 requires risky commands to not execute without explicit approval.
- NFR9 requires broad file edits to not apply without explicit approval.
- Architecture defines approval as a runtime-owned gate that blocks tool execution until resolved.
- Architecture naming guidance uses dot-scoped lower-camel JSON-RPC method names and camelCase params/results.

### Previous Story Intelligence

- Story 7.1 established strict LF-delimited JSON-RPC stdout, parse/method error handling, notifications without responses, and no TUI output leaks.
- Story 7.2 added `session.create` and `session.resume`, created durable no-task sessions, reused core session storage, added safe runtime error mapping.
- Story 7.3 added `task.start` with scoped params, provider secret rejection, active task conflict handling, and bounded result payloads.
- Story 7.4 added `event.subscribe`/`event.unsubscribe` with connection-scoped subscriptions, filtered event streaming, terminal/actionable state hints, bounded replay, and serialized write queue.
- Story 7.3 review findings: semantic error codes, strict memory scope rejection, persisted allowed-tool scope, and terminal-task restart semantics.
- Story 7.4 review findings: (check 7-4 file for any review findings before implementation).

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts`: extend method routing, metadata capabilities, params validation, safe error helpers, bridge interface, and `handleJsonRpcRequest`.
- `packages/core/src/agent-runtime.ts`: reuse `respondToApproval()` (already implemented in Story 2.6), `getPendingApprovals()`, and `waitForInput()`. **Import `RuntimeApprovalResponse` from here, not `ApprovalResponse` from sandbox.**
- `packages/sandbox/src/approval-service.ts`: source of `ApprovalRequest`, `ApprovalAction`, `ApprovalResolutionAction`, `ApprovalApplyPatchToolCall`, and `CommandPolicyRequest` types. **Do NOT use `ApprovalResponse` from here for the bridge — use `RuntimeApprovalResponse` from core instead.**
- `packages/sandbox/src/policy-engine.ts`: source of `CommandPolicyRequest`, `PolicyRequestType`, and `RiskLevel` types.
- `tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, and `tests/session-persistence.test.ts`: primary regression surfaces.
- `tests/runtime-events.test.ts`: contains the existing approval flow tests (search for `respondToApproval` — there is no separate `tests/approval-flow.test.ts` file).

### Critical Implementation Hazards

1. **`respondToApproval()` returns `err` for deny/timeout:** The runtime treats deny and timeout as errors (`APPROVAL_DENIED`, `APPROVAL_TIMED_OUT`). The RPC handler must intercept these and return JSON-RPC success responses, since they are valid resolution outcomes from the client's perspective.

2. **Type mismatch risk:** `ApprovalResponse` (from `@sprite/sandbox`) and `RuntimeApprovalResponse` (from `@sprite/core`) are different types. The core type uses TypeScript `never` discriminators to enforce mutual exclusivity of `modifiedRequest` vs `modifiedToolCall`. Always use `RuntimeApprovalResponse`.

3. **Async + write queue:** `respondToApproval()` is async and may trigger tool execution that emits runtime events. Those events will be streamed to subscribers via the serialized write queue (Story 7.4). The response to `approval.respond` must also go through the same queue to prevent byte interleaving.

4. **Test fixture setup:** To create a pending approval in tests, you must: (a) create a runtime, (b) start a task, (c) call `runtime.executeToolCall()` with a request that triggers `require_approval` from the policy classifier. See `tests/runtime-events.test.ts` for the pattern.

### Error Code Mapping

| Runtime Error Code | JSON-RPC Treatment | Response Shape |
|---|---|---|
| `APPROVAL_DENIED` | **Success** response | `{ approvalRequestId, action: "deny", reason }` |
| `APPROVAL_TIMED_OUT` | **Success** response | `{ approvalRequestId, action: "timeout" }` |
| `APPROVAL_NOT_FOUND` | Error `-32602` | `{ code: "APPROVAL_NOT_FOUND", subsystem: "rpc", recoverable: true, nextAction: "..." }` |
| `APPROVAL_SCOPE_MISMATCH` | Error `-32602` | `{ code: "APPROVAL_SCOPE_MISMATCH", subsystem: "rpc", recoverable: false, nextAction: "..." }` |
| `APPROVAL_EDIT_PAYLOAD_INVALID` | Error `-32602` | `{ code: "APPROVAL_EDIT_PAYLOAD_INVALID", subsystem: "rpc", recoverable: true, nextAction: "..." }` |
| `NO_ACTIVE_TASK` | Error `-32603` | `{ code: "NO_ACTIVE_TASK", subsystem: "rpc", recoverable: false, nextAction: "Start a task first." }` |

### Contract Details

Use method name `approval.respond`.

Recommended params:

```json
{
  "cwd": "/absolute/project/path",
  "approvalRequestId": "approval_abc123",
  "action": "allow"
}
```

Deny example:

```json
{
  "cwd": "/absolute/project/path",
  "approvalRequestId": "approval_abc123",
  "action": "deny",
  "reason": "Command modifies production database."
}
```

Edit (command) example:

```json
{
  "cwd": "/absolute/project/path",
  "approvalRequestId": "approval_abc123",
  "action": "edit",
  "reason": "Restricting to read-only mode.",
  "modifiedRequest": {
    "type": "command",
    "command": "psql",
    "args": ["--readonly", "-d", "mydb"],
    "cwd": "/absolute/project/path"
  }
}
```

Edit (file patch) example:

```json
{
  "cwd": "/absolute/project/path",
  "approvalRequestId": "approval_abc123",
  "action": "edit",
  "modifiedToolCall": {
    "toolName": "apply_patch",
    "input": {
      "edits": [
        {
          "path": "src/config.ts",
          "oldText": "const debug = true;",
          "newText": "const debug = false;"
        }
      ],
      "summary": "Disable debug mode"
    }
  }
}
```

Recommended success result (allow/edit):

```json
{
  "approvalRequestId": "approval_abc123",
  "action": "allow",
  "execution": {
    "toolName": "run_command",
    "status": "completed",
    "affectedFiles": [],
    "durationMs": 1234,
    "summary": "Command completed successfully."
  }
}
```

Recommended denial result:

```json
{
  "approvalRequestId": "approval_abc123",
  "action": "deny",
  "reason": "Command modifies production database."
}
```

Recommended error data:

```json
{
  "code": "APPROVAL_NOT_FOUND",
  "subsystem": "rpc",
  "recoverable": true,
  "correlationId": "corr_xyz",
  "nextAction": "Check pending approvals via event stream or retry with a valid approvalRequestId."
}
```

### Scope Boundaries / Anti-Patterns

- Do not implement task cancellation, final summary retrieval, learning review retrieval, memory APIs, skill APIs, runtime.getState, session list/delete/update, or external SDK code in this story.
- Do not import from `@sprite/tui`, Ink, React, or CLI display helpers in `@sprite/rpc`.
- Do not read/write `.sprite/sessions` directly from `packages/rpc`; go through `AgentRuntime` and storage APIs already used by core.
- Do not echo raw stdout/stderr, patch bodies, environment values, or secret-like content in RPC responses or errors.
- Do not add dependencies.
- Do not create a new approval path — reuse `AgentRuntime.respondToApproval()` which already handles allow/deny/edit/timeout routing, event emission, and session persistence.

### Testing Requirements

- Use Vitest.
- Add tests before implementation where practical, and keep red/green evidence in the Dev Agent Record.
- Protocol tests must parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
- Tests must prove approval responses route through the runtime and produce expected tool execution or denial outcomes.
- Tests must prove deny/timeout are returned as JSON-RPC success responses (not errors).
- Tests must prove notifications do not resolve approvals or emit responses.
- Tests must prove invalid params return safe `-32602` or bounded runtime errors as appropriate.
- Tests must prove no secret-like values are echoed or persisted.
- CLI subprocess tests must build first and run against `packages/cli/dist/index.js`.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.
- **Approval test fixture pattern:** Use `runtime.executeToolCall({ toolName: "run_command", input: { command: "rm", args: ["-rf", "/"] } })` or similar risky command to trigger `require_approval` policy, then call `runtime.getPendingApprovals()` to get the `approvalRequestId`.

### Project Structure Notes

- `packages/rpc/src/index.ts` — primary implementation surface; add `handleApprovalRespond` handler and extend bridge interface.
- `packages/core/src/agent-runtime.ts` — no changes expected; `respondToApproval()` and `getPendingApprovals()` already exist. Import `RuntimeApprovalResponse` type from here.
- `packages/sandbox/src/approval-service.ts` — type imports only (`ApprovalRequest`, `CommandPolicyRequest`, `ApprovalApplyPatchToolCall`); no changes expected.
- `tests/rpc-protocol.test.ts` — primary RPC contract test surface.
- `tests/cli-rpc.test.ts` — CLI subprocess integration tests.
- `tests/runtime-events.test.ts` — contains existing approval flow tests for regression (no separate `approval-flow.test.ts` exists).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.5]
- [Source: _bmad-output/planning-artifacts/prd.md#FR66, FR68, NFR31]
- [Source: _bmad-output/planning-artifacts/architecture.md#RPC/Approval sections]
- [Source: _bmad-output/implementation-artifacts/7-4-stream-runtime-lifecycle-events-to-rpc-clients.md]
- [Source: packages/sandbox/src/approval-service.ts]
- [Source: packages/core/src/agent-runtime.ts#respondToApproval]

## Dev Agent Record

### Agent Model Used

Claude (Sonnet 4.5) via Kiro autonomous coding agent on 2026-05-22.

### Debug Log References

- Targeted vitest run: `npx vitest run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts` → 4 files / 157 tests passed.
- Full vitest + build run: `npm test` → 28 files / 431 tests passed.
- Lint/typecheck: `npm run lint` → exit 0.
- Red phase confirmed by adding `approval.respond` contract tests prior to implementation; initial run showed missing capability advertisement, missing handler routing, and method-not-found responses. Green phase reached after implementing the bridge surface, async-aware `handleJsonRpcRequest`/`handleJsonRpcServerMessage`, and the `handleApprovalRespond` flow described below.
- Review fix pass (2026-05-23): GitNexus impact checks for `readApprovalCommandRequest`, `readApprovalPatchToolCall`, `readApprovalRespondParams`, `handleApprovalRespond`, and `buildRuntimeApprovalResponse` all reported LOW blast radius before editing.
- Review fix pass (2026-05-23): Added regression coverage for `alwaysAllowForSession`, bad `cwd`, missing `action`, RPC-level `approval.requested` NFR31 payload fields, and modified approval payload bounds.
- Low review cleanup (2026-05-23): GitNexus impact checks for `createPendingCommandApproval` and `handleJsonRpcMessage` reported LOW blast radius before editing.
- Low review cleanup (2026-05-23): Removed private `pendingApprovals` mutation from the `alwaysAllowForSession` RPC test by using a scoped `JsonRpcRuntimeBridge` test double around a real active runtime.
- Low review cleanup validation (2026-05-23): `rtk proxy sh -lc 'npm test -- --run tests/rpc-protocol.test.ts && npm run lint'` → 1 file / 39 tests passed and typecheck exit 0.
- Low review cleanup validation (2026-05-23): `rtk proxy sh -lc 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'` → 4 files / 159 tests passed.
- Review fix pass validation (2026-05-23): `rtk proxy sh -lc 'npm test -- --run tests/rpc-protocol.test.ts'` → 1 file / 39 tests passed.
- Review fix pass validation (2026-05-23): `rtk proxy sh -lc 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'` → 4 files / 159 tests passed.
- Review fix pass validation (2026-05-23): `rtk proxy sh -lc 'npm run lint'` → exit 0.
- Review fix pass validation (2026-05-23): `rtk proxy sh -lc 'npm test'` → 28 files / 433 tests passed.
- Review fix pass validation (2026-05-23): `rtk proxy sh -lc 'git diff --check -- packages/rpc/src/index.ts tests/rpc-protocol.test.ts _bmad-output/implementation-artifacts/7-5-respond-to-approval-requests-through-json-rpc.md'` → exit 0.
- GitNexus status (2026-05-23): `rtk proxy sh -lc 'npx gitnexus status'` initially reported stale index; `rtk proxy sh -lc 'npx gitnexus analyze'` refreshed the index, then status reported up-to-date.

### Completion Notes List

- Extended `JsonRpcRuntimeBridge` additively with `getActiveTask`, `getPendingApprovals`, and `respondToApproval`; existing handler call sites continue to work unchanged.
- Added `approval.respond` to `RPC_CAPABILITIES`; the method-not-found `nextAction` hint now mentions it.
- Implemented `handleApprovalRespond` in `packages/rpc/src/index.ts`. The handler:
  - Reuses `readScopedCwd()` for cwd canonicalization and scope enforcement.
  - Parses `approvalRequestId`, `action`, `reason`, `modifiedRequest`, and `modifiedToolCall` with strict bounded validation. `modifiedRequest.cwd` is canonicalized to the runtime cwd before forwarding.
  - Builds `RuntimeApprovalResponse` (from `@sprite/core`) and routes through `AgentRuntime.respondToApproval()`.
  - Returns JSON-RPC **success** responses for `APPROVAL_DENIED`/`APPROVAL_TIMED_OUT` runtime errors; maps `APPROVAL_NOT_FOUND`, `APPROVAL_SCOPE_MISMATCH`, `APPROVAL_EDIT_PAYLOAD_INVALID`, `APPROVAL_TYPE_MISMATCH`, and `APPROVAL_ACTION_NOT_ALLOWED` to bounded `-32602` errors with `code`, `subsystem: "rpc"`, `recoverable`, and `nextAction`.
  - Returns `-32603` `NO_ACTIVE_TASK` when there is no live task, before reaching the runtime, so error codes stay structured.
  - Returns bounded `execution` payloads (`toolName`, `status`, `affectedFiles`, `durationMs`, `summary`) for allow/edit/alwaysAllowForSession; raw stdout/stderr and patch bodies are never propagated.
  - Returns `{ approvalRequestId, action: "deny", reason? }` for deny and `{ approvalRequestId, action: "timeout" }` for timeout.
- Made `handleJsonRpcMessage` and `handleJsonRpcServerMessage` async-aware so `approval.respond` can use the existing serialized stdout write queue from Story 7.4 without byte interleaving against streamed runtime events. Notifications continue to short-circuit synchronously and never resolve approvals.
- Verified `approval.requested` runtime event payload already exposes every NFR31-required field through the existing event envelope (`approvalRequestId`, `requestType`, `command`, `summary`, `cwd`, `affectedFiles`, `riskLevel`, `reason`, `envExposure`, `timeoutMs`, `allowedActions`) plus the envelope-level `taskId` and `correlationId`. No core changes were necessary.
- Added 11 new RPC contract tests in `tests/rpc-protocol.test.ts` (allow, deny, timeout, edit-command, edit-patch, capability advertisement, notification no-op, invalid-params matrix, no-active-task, redaction, write-queue streaming) and 1 CLI subprocess regression in `tests/cli-rpc.test.ts` covering structured `NO_ACTIVE_TASK` errors and capability advertisement on stdout-only output.
- Addressed all review patch findings for Story 7.5: added `alwaysAllowForSession` success coverage, expanded invalid-param coverage, added RPC-level `approval.requested` NFR31 field coverage, and bounded modified command/patch payload dimensions. Deferred review items remain intentionally deferred as cross-story/pre-existing follow-ups.

### File List

- `packages/rpc/src/index.ts` — extended bridge, capability metadata, async message handlers, and added `handleApprovalRespond` plus its parameter/error helpers.
- `tests/rpc-protocol.test.ts` — added the `approval.respond` test suite covering all four resolution actions, capabilities, notification no-op, invalid params, redaction, no-active-task, and serialized write-queue behavior.
- `tests/cli-rpc.test.ts` — added a subprocess regression that validates capability advertisement and the structured `NO_ACTIVE_TASK` error stays bounded over stdio.
- `_bmad-output/implementation-artifacts/7-5-respond-to-approval-requests-through-json-rpc.md` — task checklist, status, change log, and dev record updates.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status moved from `in-progress` to `review`.

### Change Log

- 2026-05-21: Created Story 7.5 implementation artifact following BMAD create-story workflow.
- 2026-05-22: Implemented `approval.respond` JSON-RPC method end-to-end (bridge extension, handler, validation, runtime error mapping, write-queue integration), added contract and CLI subprocess tests, and moved story to `review`.
- 2026-05-23: Addressed Story 7.5 review patch findings for approval.respond validation and contract coverage.
- 2026-05-23: Cleaned up low review finding by removing private runtime-state mutation from the `alwaysAllowForSession` test.
