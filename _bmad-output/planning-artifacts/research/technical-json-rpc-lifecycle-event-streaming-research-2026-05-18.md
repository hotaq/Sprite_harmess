# Technical Research: JSON-RPC Runtime Lifecycle Event Streaming for Story 7.4

Date: 2026-05-18
Project: Sprite Harness
Story: 7.4 Stream Runtime Lifecycle Events to RPC Clients

## Objective

Define a safe event subscription contract for RPC clients that reuses Sprite Harness runtime events, preserves stdio JSON-RPC cleanliness, and gives external tools explicit task/session state without scraping text output.

## Public Reference Findings

- JSON-RPC 2.0 notifications are request objects without an `id`; servers must not send responses to notifications. Responses must contain exactly one of `result` or `error`. Source: https://www.jsonrpc.org/specification
- MCP 2025 task utilities model long-running work with explicit task IDs, terminal statuses, optional task status notifications, and task-related metadata. This supports Sprite's choice to include `taskId`, `sessionId`, `correlationId`, and terminal runtime event types in every streamed lifecycle event. Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
- MCP progress notifications use JSON-RPC notifications with correlation tokens and monotonically increasing progress values. Sprite does not need to implement MCP progress tokens in Story 7.4, but the pattern confirms that out-of-band progress belongs in notifications rather than RPC responses. Sources: https://modelcontextprotocol.io/specification/2025-11-25/schema and https://modelcontextprotocol.io/specification/2024-11-05/basic/utilities/progress
- MCP transports use JSON-RPC over stdio and require UTF-8 JSON-RPC messages. For Sprite's existing stdin/stdout transport, keep one complete JSON object per LF-delimited line and avoid non-protocol stdout. Source: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Pi RPC mode streams agent events to stdout as JSON lines while command responses carry request IDs. Its docs explicitly warn to split on LF only and not rely on generic line readers that split on Unicode separators. Source: https://pi.dev/docs/latest/rpc
- OpenCode's public SDK exposes `event.subscribe()` as a real-time event stream whose records include `event.type` and `event.properties`; this supports a named subscription method with typed event payloads rather than text scraping. Source: https://opencode.ai/docs/sdk/
- Claude Code's public Agent SDK documents a message lifecycle with session metadata, assistant/tool turns, stream events, and result messages; its hooks surface tool, permission, stop, session, and notification lifecycle points. Sprite should expose the same categories through its own stable `RuntimeEventRecord` union, not by copying any private implementation. Sources: https://code.claude.com/docs/en/agent-sdk/agent-loop and https://code.claude.com/docs/en/agent-sdk/hooks
- Only official/public documentation was used. Do not copy, inspect, or derive implementation details from leaked/proprietary Claude Code source.

## Local Code Findings

- `packages/rpc/src/index.ts` currently owns JSON-RPC parsing, capabilities, safe errors, `rpc.ready`, `rpc.ping`, `session.create`, `session.resume`, `task.start`, strict LF framing, and `runJsonRpcStdioServer()`.
- `JsonRpcRuntimeBridge` currently exposes `createSession`, `getBootstrapState`, `getEventHistory`, `resumeSession`, and `startTask`. Story 7.4 should extend this bridge with `subscribeToEvents` instead of importing TUI/CLI code.
- `AgentRuntime.subscribeToEvents(listener)` and `AgentRuntime.getEventHistory(taskId?)` already provide the core event stream surface.
- `RuntimeEventBus` validates every emitted event through `validateRuntimeEvent()`, stores clone-safe history, filters history by `taskId`, and isolates subscriber failures from runtime state transitions.
- `RuntimeEventRecord` already includes `schemaVersion`, `eventId`, `sessionId`, `taskId`, `correlationId`, `type`, `createdAt`, and a typed `payload`.
- Current runtime event types include task lifecycle, session resume/compaction, tool calls, approvals, validation, file activity, memory, skill, learning review, and retrospective events.
- Story 7.3 already returns `lifecycle.initialEvents` for `task.start`, but clients still need an asynchronous stream for later lifecycle changes and terminal states.
- Current protocol handler is mostly request/response pure. Event streaming requires connection-scoped subscription state in the stdio server layer and a serialized write queue so runtime event notifications cannot interleave bytes with request responses.

## Recommended JSON-RPC Contract

### Methods

- `event.subscribe`: create a connection-scoped event subscription.
- `event.unsubscribe`: release a subscription by `subscriptionId`.
- Notification method: `event.runtime`.

Avoid `rpc.*` for this feature because JSON-RPC reserves `rpc.` method names for internal methods/extensions.

### `event.subscribe` params

```json
{
  "cwd": "/absolute/project/path",
  "sessionId": "optional-ses_...",
  "taskId": "optional-task_...",
  "eventTypes": ["task.started", "task.waiting", "tool.call.completed"],
  "replay": {
    "mode": "none-or-recent",
    "limit": 50
  }
}
```

Validation guidance:

- `cwd` is required and must canonicalize to the current RPC runtime cwd.
- `sessionId`, when supplied, must match the runtime/session scope available to this RPC process.
- `taskId`, when supplied, filters events for that task only.
- `eventTypes`, when supplied, must use known runtime event types from core. Prefer exporting a core type guard/list over duplicating a stale list in RPC.
- `replay.limit` must be bounded. Replay may use current runtime history only; RPC must not read `.sprite/sessions` directly. For `replay.mode: "recent"`, emit matching replay events as `event.runtime` notifications after the subscribe response in history order with `replay: true`; live events use `replay: false`.
- `event.subscribe` notifications (requests without `id`) should produce no response and no subscription side effect, matching the existing safety posture for side-effecting methods.

### Success result

```json
{
  "subscription": {
    "subscriptionId": "sub_...",
    "sessionId": null,
    "taskId": null,
    "eventTypes": ["task.started", "task.waiting"],
    "createdAt": "2026-05-18T00:00:00.000Z",
    "replayedEventCount": 2,
    "lastEventId": "evt_... or null"
  },
  "runtime": {
    "eventCount": 2,
    "capabilities": ["rpc.ping", "session.create", "session.resume", "task.start", "event.subscribe", "event.unsubscribe"]
  }
}
```

### Event notification

```json
{
  "jsonrpc": "2.0",
  "method": "event.runtime",
  "params": {
    "subscriptionId": "sub_...",
    "event": {
      "schemaVersion": 1,
      "eventId": "evt_...",
      "sessionId": "ses_...",
      "taskId": "task_...",
      "correlationId": "corr_...",
      "type": "task.started",
      "createdAt": "2026-05-18T00:00:00.000Z",
      "payload": {}
    },
    "replay": false,
    "terminal": false
  }
}
```

Terminal/actionable guidance:

- `terminal: true` for `task.completed`, `task.failed`, and `task.cancelled`.
- `task.waiting` with `payload.reason: "approval-required"` is not final completion, but must be explicit enough for clients to stop waiting for normal progress and render an approval-needed state.
- Do not require clients to infer status from text output, stream closure, or missing messages.

## Implementation Risks

1. **Output interleaving risk.** Runtime events can fire while request handlers are preparing responses. All response and notification writes must go through a single promise/queue to preserve one complete JSON object per LF-delimited stdout record.
2. **Subscription ownership risk.** Subscriptions are connection-scoped. They must be cleaned up on `event.unsubscribe`, input EOF, stream error, or server completion.
3. **Scope leakage risk.** Events must be filtered by cwd/session/task/eventTypes before writing. Never stream events for another cwd/session.
4. **Schema drift risk.** Event type filters must be derived from core runtime event schema ownership, not duplicated manually in RPC without tests.
5. **Replay overreach risk.** Replay should use `AgentRuntime.getEventHistory()` only. Do not read or parse `.sprite/sessions` directly from the RPC adapter.
6. **Secret/output leakage risk.** Stream validated runtime events only; do not add raw provider credentials, environment variables, command stdout/stderr, or local home directory paths to notification wrappers.
7. **Scope creep risk.** Story 7.4 is event streaming only. Do not implement approval responses, task cancellation, final summary retrieval, learning review retrieval, memory APIs, skill APIs, runtime state inspection, HTTP/SSE transport, or SDK packages.
