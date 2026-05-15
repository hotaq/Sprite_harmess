# Technical Research: JSON-RPC Task Start Contract for Story 7.3

Date: 2026-05-15
Project: Sprite Harness
Story: 7.3 Submit Tasks Through JSON-RPC

## Objective

Define the safest implementation shape for a JSON-RPC task submission method that reuses the existing AgentRuntime task loop, preserves Story 7.1 protocol cleanliness, and composes with Story 7.2 session create/resume semantics.

## Public Reference Findings

- JSON-RPC 2.0 methods should accept structured params, return either `result` or `error`, and treat notifications as requests without responses. Source: https://www.jsonrpc.org/specification
- Pi's RPC flow separates headless process startup from client requests and uses request identifiers to correlate command responses/events. Its provider/model options are process configuration, not inline secret transport. Source: https://pi.dev/docs/latest/rpc
- OpenCode's SDK separates session creation from prompting, and prompts may carry model/output preferences without exposing provider credentials. Source: https://opencode.ai/docs/sdk/
- Claude Code's public Agent SDK documents resumable sessions and loop termination states; Sprite should expose explicit `sessionId`, `taskId`, `correlationId`, and lifecycle fields rather than asking clients to infer them from text. Sources: https://code.claude.com/docs/en/agent-sdk/sessions and https://code.claude.com/docs/en/agent-sdk/agent-loop
- Only official/public documentation was used. Do not copy, inspect, or derive implementation details from leaked/proprietary Claude Code source.

## Local Code Findings

- `packages/rpc/src/index.ts` owns JSON-RPC parsing, strict stdout purity, capability metadata, and handlers for `rpc.ping`, `session.create`, and `session.resume`.
- `JsonRpcRuntimeBridge` currently exposes `createSession`, `resumeSession`, `getBootstrapState`, and `getEventHistory`. Story 7.3 should extend this bridge rather than importing CLI/TUI behavior.
- `AgentRuntime.submitInteractiveTask()` in `packages/core/src/agent-runtime.ts` already creates `taskId`, `correlationId`, memory/task context, `task.started`, `task.waiting`, and active task state through the shared runtime loop.
- `AgentRuntime.createSession()` creates a durable no-task session and rejects duplicate no-task creation on the same runtime with `SESSION_ALREADY_CREATED`.
- `AgentRuntime.resumeSession(sessionId)` can hydrate a persisted session into active runtime state, but the constructor-generated private `sessionId` remains a critical risk for later task submission. Story 7.3 must bind an explicit/resumed session intentionally in core rather than relying on the constructor default.
- `createTaskRequest()` currently sets `toolExecutionEnabled: false`; if RPC accepts `allowedTools`, the result must truthfully report the accepted/deferred scope and not imply tools execute until the core loop supports them.
- Current registered tool names are `apply_patch`, `list_files`, `read_file`, `run_command`, and `search_files`.
- Existing tests to extend: `tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, and `tests/session-persistence.test.ts`.

## Recommended JSON-RPC Contract

Method: `task.start`

Notification behavior: no response and no task side effect. This matches the existing protocol's safety posture for side-effecting methods.

Params should be an object:

```json
{
  "cwd": "/absolute/project/path",
  "task": "Implement Story 7.3",
  "sessionId": "optional-existing-session-id",
  "provider": {
    "providerName": "optional-provider",
    "model": "optional-model",
    "baseUrl": "optional-base-url"
  },
  "allowedTools": ["read_file", "search_files"],
  "memoryScope": {
    "working": true,
    "manual": true,
    "procedural": false
  },
  "output": {
    "format": "json"
  },
  "context": {
    "client": "optional-public-client-label"
  }
}
```

Validation guidance:

- `cwd` is required and must canonicalize to the runtime cwd.
- `task` is required, non-empty after trim, and bounded.
- `sessionId`, when present, must reference a readable session in the current runtime scope.
- `provider.apiKey`, tokens, and secret-like fields must be rejected; auth stays in env/config/auth store.
- `allowedTools` must be an array of known tool names. Unsupported tools return `-32602`.
- `memoryScope` must map to actual runtime behavior. If partial memory scoping is not supported yet, either reject unsupported fields or return warnings that scope is deferred.
- `output.format` must match existing config formats: `text`, `json`, or `ndjson`.

Success result should be bounded and machine-safe:

```json
{
  "task": {
    "taskId": "task_...",
    "correlationId": "corr_...",
    "status": "waiting-for-input",
    "currentPhase": "act",
    "createdAt": "2026-05-15T00:00:00.000Z"
  },
  "session": {
    "sessionId": "session_...",
    "createdAt": "2026-05-15T00:00:00.000Z",
    "resumed": false
  },
  "acceptedScopes": {
    "cwd": "/absolute/project/path",
    "provider": { "providerName": "mock", "model": "test-model" },
    "allowedTools": ["read_file"],
    "memoryScope": { "working": true, "manual": true, "procedural": false },
    "outputFormat": "json",
    "toolExecutionEnabled": false
  },
  "lifecycle": {
    "waitingReason": "steering-required",
    "initialEvents": [
      { "type": "task.started", "eventId": "evt_..." },
      { "type": "task.waiting", "eventId": "evt_..." }
    ]
  },
  "warnings": []
}
```

Error shape should reuse existing safe error data:

```json
{
  "code": -32602,
  "message": "Invalid params",
  "data": {
    "code": "INVALID_CWD",
    "subsystem": "rpc",
    "recoverable": true,
    "correlationId": "optional-correlation-id",
    "nextAction": "Retry with cwd matching the runtime working directory."
  }
}
```

## Implementation Risks

1. **Session binding risk is highest.** A task started against an explicit or resumed session must persist under that exact session ID. Do not let `submitInteractiveTask()` accidentally create/use the constructor-generated runtime session.
2. **Provider overrides are currently startup-oriented.** If per-request model/provider is accepted, core should intentionally merge it into task startup state and tests must prove auth redaction.
3. **Memory scope must be real or rejected.** Do not claim a scope is applied if the current task context loader still reads all configured memory.
4. **Active task conflicts need explicit semantics.** Reject a second `task.start` while a runtime has an active waiting/in-progress task unless the existing core loop supports queueing.
5. **Keep 7.3 narrow.** Do not implement streaming lifecycle events, approvals, cancellation, final summaries, learning review retrieval, or runtime state inspection in this story.
