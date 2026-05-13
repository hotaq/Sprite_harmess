---
stepsCompleted: [1]
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
workflowType: research
lastStep: 1
research_type: technical
research_topic: JSON-RPC session create/resume patterns for Story 7.2
research_goals: Compare public Pi, OpenCode, Claude Code, JSON-RPC, and MCP patterns before implementing Sprite Harness Story 7.2.
user_name: Chinnaphat
date: 2026-05-14
web_research_enabled: true
source_verification: true
---

# Technical Research: JSON-RPC Session Create/Resume for Story 7.2

**Date:** 2026-05-14  
**Author:** Chinnaphat / Amelia  
**Research Type:** Technical  

## Source Boundary

This research intentionally uses public/official documentation and open-source/public APIs only. It does **not** inspect or copy leaked Claude Code source. Claude Code is used only through official/public documentation behavior.

## Sources

- JSON-RPC 2.0 specification: https://www.jsonrpc.org/specification
- Pi Coding Agent RPC docs: https://pi.dev/docs/latest/rpc
- OpenCode SDK docs: https://opencode.ai/docs/sdk/
- Claude Code session docs: https://code.claude.com/docs/en/agent-sdk/sessions
- MCP lifecycle spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle

## Findings

### 1. JSON-RPC Contract Discipline

JSON-RPC 2.0 requires:

- `jsonrpc: "2.0"` on requests/responses.
- request `method` string.
- optional `params` structured value.
- optional `id`; requests without `id` are notifications and must not receive responses.
- success responses use `result`; error responses use `error`; never both.
- standard errors: parse `-32700`, invalid request `-32600`, method not found `-32601`, invalid params `-32602`, internal error `-32603`, server-defined `-32000..-32099`.

Story 7.2 should add `-32602` coverage for invalid `session.create` / `session.resume` params.

### 2. Pi RPC Lessons

Pi’s RPC mode is headless over stdin/stdout with one JSON object per line, request correlation IDs, responses, and streamed events. Its session surface includes fresh session, session state, session stats, switching sessions, forking, cloning, and session naming.

Important Pi framing lesson: strict LF framing matters. The Pi docs warn that generic line readers can split on Unicode separators that are valid inside JSON strings. Sprite’s current Story 7.1 implementation uses Node `readline`, so before building more RPC surface we should consider replacing it with an LF-only splitter.

Useful fields for Sprite session responses:

- `sessionId`
- current session path or safe relative path if exposed
- message/event counts
- model/provider state
- pending/streaming flags
- display title/name later, if supported

Fields to avoid exposing raw:

- absolute private session paths unless redacted or scoped
- raw conversation/message contents
- provider secrets

### 3. OpenCode Session API Lessons

OpenCode exposes a type-safe SDK generated from an API spec. It has explicit session APIs:

- list sessions
- get session
- children
- create session
- delete session
- update session
- prompt within a session

Story 7.2 should mirror the separation: session lifecycle is distinct from task/prompt submission. `session.create` should not start a task; `task.start` remains Story 7.3.

Useful response shape:

- session object with stable ID
- session metadata separate from messages
- prompt/task calls require a session ID but are separate methods

### 4. Claude Code Session Lessons

Claude Code docs emphasize:

- session ID capture for resume
- resume depends on matching current working directory because local session files are under a cwd-derived project path
- session files are local to the machine
- fork/resume semantics are distinct
- robust integrations should capture key app state rather than assuming transcript portability

Sprite implication:

- `session.resume` must verify the requested session is readable and scoped to the current/requested cwd.
- resume errors should be explicit about missing session, cwd mismatch/out-of-scope, or unreadable state.
- return metadata, not raw transcript content.
- do not implement fork in Story 7.2.

### 5. MCP Lifecycle Lessons

MCP uses JSON-RPC with an explicit initialize lifecycle:

- client sends supported protocol version and capabilities
- server returns protocol version, capabilities, and server info
- client sends initialized notification
- operation proceeds only after capability negotiation

Sprite already added `rpc.ready` and `rpc.ping` in Story 7.1. For Story 7.2, we do not need full MCP compatibility, but capability metadata should be stable and should list newly available methods such as `session.create` and `session.resume`.

## Recommended Story 7.2 Contract

### `session.create`

Request:

```json
{
  "jsonrpc": "2.0",
  "id": "create-1",
  "method": "session.create",
  "params": {
    "cwd": "/project/path",
    "config": {},
    "context": {},
    "scope": {
      "allowedTools": [],
      "memoryAccess": "none"
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "create-1",
  "result": {
    "session": {
      "sessionId": "session_x",
      "cwd": "/project/path",
      "status": "created",
      "taskId": null
    },
    "runtime": {
      "provider": {
        "providerName": "openai-compatible",
        "model": "gpt-...",
        "auth": "configured-redacted"
      },
      "eventCount": 0,
      "capabilities": ["rpc.ping", "session.create", "session.resume"]
    },
    "warnings": []
  }
}
```

Notes:

- `session.create` should initialize shared runtime/session state but not start a task.
- if current `AgentRuntime` lacks a no-task session-create API, add one in core with tests rather than duplicating session-store logic in RPC.
- cwd must be canonicalized and scope-checked before use.

### `session.resume`

Request:

```json
{
  "jsonrpc": "2.0",
  "id": "resume-1",
  "method": "session.resume",
  "params": {
    "sessionId": "session_x",
    "cwd": "/project/path"
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "resume-1",
  "result": {
    "session": {
      "sessionId": "session_x",
      "taskId": "task_x",
      "status": "planned",
      "currentPhase": "plan",
      "latestPlan": [],
      "restoredEventCount": 3
    },
    "warnings": []
  }
}
```

Notes:

- use shared `AgentRuntime.resumeSession()` where possible.
- do not expose raw transcript, raw memory, or raw provider credentials.
- do not implement `continue`, `fork`, `prompt`, or `task.start` here.

## Recommended Pre-7.2 Fix from Research

Before Story 7.2 implementation, consider fixing Story 7.1 stdio framing:

- replace Node `readline` in `runJsonRpcStdioServer()` with a strict LF-only splitter.
- keep `\r\n` compatibility by stripping a trailing `\r`.
- add regression test with `U+2028` / `U+2029` inside a JSON string to prove it remains one JSON message.

This is directly relevant to Pi’s documented RPC framing warning and prevents protocol bugs from multiplying as session methods are added.

**Applied on 2026-05-14:** Story 7.1 RPC stdio now uses strict LF-only framing, strips trailing `\r` for CRLF compatibility, and has regression coverage for `U+2028` / `U+2029` inside JSON strings.

## Story 7.2 Implementation Guardrails

- Keep RPC as an adapter over shared runtime/session APIs.
- No direct TUI import.
- No raw transcript/session-file exposure.
- No task submission in `session.create` or `session.resume`.
- Add `-32602` invalid params errors.
- Add cwd/session scope tests.
- Add secret/private-path redaction tests.
- Add subprocess tests proving stdout remains JSON-RPC only.
