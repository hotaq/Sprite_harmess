# Story 7.3: Submit Tasks Through JSON-RPC

Status: done

## Story

As an external automation client,
I want to submit a task to Sprite Harness through JSON-RPC with scoped runtime preferences,
so that I can drive the same AgentRuntime loop used by the CLI/TUI without importing UI code or bypassing session safety.

## Acceptance Criteria

1. JSON-RPC method `task.start` accepts structured params for task text, cwd/session, provider/model preference, allowed tools, memory scope, output preferences, and optional public context.
2. Successful calls return `taskId`, `sessionId`, accepted scopes, initial lifecycle status, and correlation metadata suitable for later event/approval/final-summary stories.
3. Calls reuse the shared `AgentRuntime` task lifecycle and session persistence rather than implementing an RPC-only task runner.
4. Invalid cwd, task text, session, provider, tool, memory, and output params return structured JSON-RPC errors with safe `code`, `subsystem`, `recoverable`, `correlationId` when available, and `nextAction`.
5. Secret-like provider credentials are rejected or redacted and never echoed in stdout, persisted task state, or error payloads.
6. Notifications for `task.start` do not emit responses and do not create tasks.
7. Protocol stdout remains JSON-RPC-only and line-delimited, preserving Story 7.1 behavior.
8. Existing `rpc.ping`, `session.create`, and `session.resume` behavior remains backward-compatible.

## Tasks / Subtasks

- [x] Confirm Story 7.3 scope and implementation surfaces.
  - [x] Read this story, Epic 7, PRD Journey 4, architecture RPC/session sections, Story 7.1, Story 7.2, and the research artifact for this story.
  - [x] Inspect `packages/rpc/src/index.ts`, `packages/core/src/agent-runtime.ts`, `packages/core/src/runtime-loop.ts`, `packages/core/src/task-state.ts`, session persistence, provider override types, tool registry, and relevant tests.
  - [x] Run GitNexus impact analysis before editing any affected symbol; report blast radius and warn before editing any HIGH/CRITICAL risk symbol.
  - [x] Keep scope to `task.start`; do not implement event streaming, approvals, cancellation, final summary retrieval, learning reviews, or runtime state inspection.
- [x] Define and expose the `task.start` contract.
  - [x] Add `task.start` to protocol capability metadata.
  - [x] Validate object params only; reject positional/non-object params.
  - [x] Require `cwd` and canonicalize it to the runtime cwd.
  - [x] Require bounded non-empty `task` text and avoid echoing raw unsafe input in errors.
  - [x] Support optional `sessionId` only when it references a session in the current runtime scope.
  - [x] Accept non-secret provider/model/baseUrl preferences only; reject `apiKey`, token, password, or secret-like provider fields.
  - [x] Validate `allowedTools` against the known tool registry.
  - [x] Validate `memoryScope` against actual runtime behavior; reject unsupported scopes or return explicit warnings for deferred scopes.
  - [x] Validate output format against `text`, `json`, and `ndjson`.
- [x] Add shared runtime support for RPC task submission.
  - [x] Reuse `AgentRuntime.submitInteractiveTask()` / `createTaskRequest()` / active task persistence instead of creating an RPC-only loop.
  - [x] Add a core API or options path if needed so explicit/resumed `sessionId` is bound to the task's persisted session.
  - [x] Ensure a task started after `session.create` uses that created session when requested.
  - [x] Ensure a task started after `session.resume` does not accidentally use the constructor-generated private runtime session ID.
  - [x] Reject active task conflicts unless the existing runtime provides safe queueing semantics.
  - [x] Preserve provider/auth redaction and avoid persisting secret-like params.
  - [x] Truthfully report `toolExecutionEnabled: false` if the loop still disables actual tool execution.
- [x] Implement RPC handler behavior.
  - [x] Extend `JsonRpcRuntimeBridge` with a task-start method.
  - [x] Add `handleTaskStart` routing while preserving parse, method-not-found, and notification behavior.
  - [x] Return bounded result fields only: task/session identifiers, accepted scopes, initial lifecycle, runtime/provider metadata, warnings.
  - [x] Map runtime/session/provider validation failures to safe structured JSON-RPC errors.
- [x] Add tests.
  - [x] Pure RPC success: `task.start` after `session.create` returns task/session/correlation/status/phase/accepted scopes and persists latest task.
  - [x] Pure RPC success: `task.start` without explicit session follows the documented default behavior.
  - [x] Pure RPC success: `task.start` against a resumable existing session binds to that session.
  - [x] Capabilities advertise `task.start`.
  - [x] Notifications produce no response and no persisted task side effect.
  - [x] Invalid params cover missing task, empty task, bad cwd, wrong session, unsupported tool, unsupported memory scope, unsupported output format, provider secret fields, and active task conflict.
  - [x] Redaction tests prove secrets do not appear in stdout, errors, or persisted session state.
  - [x] CLI subprocess tests prove stdout remains one JSON object per LF-delimited line.
- [x] Validate and update story status.
  - [x] Run targeted validation: `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'`.
  - [x] Run full validation: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run GitNexus detect/analyze/status before commit.
  - [x] Move story to `review` only after tests pass.
  - [x] During review phase, report issues found to Chinnaphat before fixing them, per standing instruction.

### Review Findings

- [x] [Review][Patch] Add semantic `error.data.code` for RPC-side task.start validation failures [packages/rpc/src/index.ts:164]
- [x] [Review][Patch] Reject unknown `memoryScope` keys instead of silently accepting unsupported scopes [packages/rpc/src/index.ts:624]
- [x] [Review][Patch] Persist/apply accepted `allowedTools` to the core task request/context, not only the RPC response [packages/core/src/agent-runtime.ts:673]
- [x] [Review][Patch] Allow a new `task.start` after the previous active task is terminal [packages/core/src/agent-runtime.ts:625]

## Dev Notes

### Story Intent

Story 7.3 is the bridge from session lifecycle to actual work submission. The implementation should let external JSON-RPC clients start a task through the same core loop used by local runtime surfaces while keeping protocol output clean, scopes explicit, and credentials private.

### Source Requirements

- Epic 7 requires JSON-RPC automation over stdin/stdout with task submission, lifecycle events, approvals, final summaries, and scoped inspection split across separate stories.
- PRD Journey 4 requires an RPC task request to include working directory, session ID, model preference, allowed tools, optional context, and to return lifecycle/status information.
- PRD integration requirements state RPC clients must declare cwd, session, allowed tools, and memory access scope, and RPC must use the same `AgentRuntime` as CLI/TUI.
- Architecture defines a task as a user goal plus cwd, session, provider/model preference, allowed tools, permissions, and stop conditions.
- Architecture naming guidance uses dot-scoped lower-camel JSON-RPC method names and camelCase params/results.
- NFRs require local-first storage, explicit permissions, deterministic testability, bounded auditability, and no UI dependency leaks into protocol code.

### Public Research Inputs

Research artifact: `_bmad-output/planning-artifacts/research/technical-json-rpc-task-start-research-2026-05-15.md`

- JSON-RPC 2.0: structured params, result/error exclusivity, notifications without responses. Source: https://www.jsonrpc.org/specification
- Pi RPC: headless process/client request separation and request/event correlation. Source: https://pi.dev/docs/latest/rpc
- OpenCode SDK: session and prompt separation. Source: https://opencode.ai/docs/sdk/
- Claude Code public Agent SDK: session resume and loop status concepts. Sources: https://code.claude.com/docs/en/agent-sdk/sessions and https://code.claude.com/docs/en/agent-sdk/agent-loop
- Do not use leaked/proprietary Claude Code source. Public documentation only.

### Previous Story Intelligence

- Story 7.1 established strict LF-delimited JSON-RPC stdout, parse/method error handling, notifications without responses, and no TUI output leaks.
- Story 7.2 added `session.create` and `session.resume`, created durable no-task sessions, reused core session storage, added safe runtime error mapping, and rejected duplicate no-task session creation on the same runtime.
- Story 7.2 validation passed before close: targeted session/RPC/CLI tests and full lint/test suite.
- Story 7.2 review finding pattern: raw runtime errors and ambiguous duplicate semantics must be made explicit and regression-tested.

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts`: extend method routing, metadata capabilities, params validation, safe error helpers, and bridge interface.
- `packages/core/src/agent-runtime.ts`: reuse or extend `submitInteractiveTask()`, `createSession()`, `resumeSession()`, active task state, and session persistence.
- `packages/core/src/runtime-loop.ts`: `createTaskRequest()` and `runInitialPlanActObserveLoop()` already produce initial task lifecycle.
- `packages/core/src/task-state.ts`: use existing task status/current phase types rather than creating RPC-specific status strings.
- `packages/tools/src/tool-registry.ts`: source of currently known tool names.
- `tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, and `tests/session-persistence.test.ts`: primary regression surfaces.

### Contract Details

Use method name `task.start`.

Recommended params:

```json
{
  "cwd": "/absolute/project/path",
  "task": "User-facing goal text",
  "sessionId": "optional-session-id",
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
    "client": "public-client-label"
  }
}
```

Recommended result:

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
    "provider": {
      "providerName": "mock",
      "model": "test-model"
    },
    "allowedTools": ["read_file"],
    "memoryScope": {
      "working": true,
      "manual": true,
      "procedural": false
    },
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

Recommended invalid-param error data:

```json
{
  "code": "INVALID_CWD",
  "subsystem": "rpc",
  "recoverable": true,
  "correlationId": "optional-correlation-id",
  "nextAction": "Retry with cwd matching the runtime working directory."
}
```

### Session Binding Warning

The most important implementation hazard is session identity. `AgentRuntime` currently has a constructor-generated private session ID while `resumeSession(sessionId)` can hydrate a different persisted session. Story 7.3 must prove with tests that `task.start` persists under the requested/resumed session ID, not a newly generated runtime ID.

### Scope Boundaries / Anti-Patterns

- Do not implement `event.subscribe`, task cancellation, approval responses, final summary retrieval, learning review retrieval, memory APIs, skill APIs, runtime.getState, session list/delete/update/fork/clone, or external SDK code in this story.
- Do not import from `@sprite/tui`, Ink, React, or CLI display helpers in `@sprite/rpc`.
- Do not read/write `.sprite/sessions` directly from `packages/rpc`; go through `AgentRuntime` and storage APIs already used by core.
- Do not claim `allowedTools` or `memoryScope` was applied unless the core task request actually applies it.
- Do not transport provider API keys, OAuth tokens, or credentials through JSON-RPC params.
- Do not add dependencies.

### Testing Requirements

- Use Vitest.
- Add tests before implementation where practical, and keep red/green evidence in the Dev Agent Record.
- Protocol tests must parse every stdout line as JSON and verify `jsonrpc: "2.0"`.
- Tests must prove task events and latest task metadata are persisted in the expected session.
- Tests must prove task notifications do not create sessions/tasks or emit responses.
- Tests must prove invalid params return safe `-32602` or bounded runtime errors as appropriate.
- Tests must prove no secret-like provider values are echoed or persisted.
- CLI subprocess tests must build first and run against `packages/cli/dist/index.js`.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created on 2026-05-15 after Story 7.2 commit `32b716e` was pushed and Story 7.2 was closed.
- Loaded BMad story/sprint workflow, project config, sprint status, Epic 7 requirements, PRD RPC task/session requirements, architecture task/RPC/session guidance, Story 7.1 and Story 7.2 learnings, current RPC/runtime/session test surfaces, GitNexus context, and public JSON-RPC/Pi/OpenCode/Claude Agent SDK documentation.
- `omx explore` was attempted first for repository mapping, but the configured spark model was unsupported in this account and fallback exploration timed out; continued with RTK-wrapped repository inspection and GitNexus.
- Created technical research artifact for `task.start` contract and implementation risks.
- Started fresh implementation on 2026-05-15; sprint status moved from ready-for-dev to in-progress.
- GitNexus pre-edit impact checks completed. `AgentRuntime`, `getBootstrapState`, `loadManualSkillContextEntries`, and `createInitialWorkingMemorySnapshot` reported HIGH/CRITICAL risk, so core changes were kept additive and existing `submitInteractiveTask()` behavior was preserved. RPC routing/scoping symbols reported LOW risk.
- Red phase confirmed with `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'`: targeted tests failed because `AgentRuntime.startTask()` and `task.start` RPC were missing, capabilities did not advertise `task.start`, and CLI task start returned method-not-found.
- Added additive `AgentRuntime.startTask()` for scoped task submission with explicit session binding, persisted-session event hydration, active task conflict rejection, memory scope application, provider/model/output preferences, allowed tool scope validation, and no provider credential transport.
- Extended RPC protocol capabilities and added `task.start` handler with object params, cwd/session/task/provider/tool/memory/output validation, notification no-op behavior, bounded success payloads, and safe task/session error mapping.
- Added core, pure-RPC, and CLI subprocess regression tests for task start success paths, persisted session binding, notifications, invalid scopes, active task conflicts, redaction, and stdout JSON-RPC purity.
- Targeted validation passed: `rtk run 'npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (3 files, 53 tests).
- Full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 407 tests).
- Follow-up provider validation tightening kept targeted validation green: `rtk run 'git diff --check && npm run lint && npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (3 files, 53 tests).
- Final full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 407 tests).
- GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,265 nodes, 11,222 edges, status up-to-date).
- Code review fixes completed for semantic task-start error codes, unsupported memory scope rejection, persisted allowed-tool scope, and terminal-task restart semantics.
- Review-fix targeted validation passed: `rtk run 'git diff --check && npm test -- --run tests/session-persistence.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/task-context.test.ts tests/tui-state.test.ts'` (5 files, 74 tests).
- Review-fix full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 files, 409 tests).
- Review-fix GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,267 nodes, 11,229 edges, status up-to-date).

### Completion Notes List

- Ultimate context engine analysis completed for Story 7.3 planning.
- Closed Story 7.2 after review fixes, commit, and push.
- Created Story 7.3 implementation artifact and marked it ready for development.
- Captured public-doc-only research and explicit warning not to use leaked/proprietary Claude Code source.
- Identified highest-risk implementation issue: explicit/resumed session binding for task persistence.
- Defined validation and review expectations, including reporting code review findings before fixes.
- Implemented JSON-RPC `task.start` without adding event streaming, approvals, cancellation, final summaries, learning reviews, or runtime state inspection.
- Reused shared core task lifecycle and session persistence through additive `AgentRuntime.startTask()` and existing `createTaskRequest()` / `runInitialPlanActObserveLoop()` / `setActiveTask()` flow.
- Preserved Story 7.1 stdout protocol guarantees: line-delimited JSON-RPC only, parseable stdout, notification no responses, and no TUI imports.
- Preserved Story 7.2 session lifecycle behavior while allowing task start in created/default/existing persisted sessions.
- Added safe structured task-start errors and regression coverage for invalid task text, session ID, provider secret fields, unsupported tools, unsupported memory scope, invalid output format, and active task conflicts.
- Fixed code review findings for semantic JSON-RPC validation codes, strict memory scopes, accepted allowed-tool persistence, and terminal task restart behavior.

### File List

- `_bmad-output/implementation-artifacts/7-2-create-or-resume-sessions-through-json-rpc.md`
- `_bmad-output/implementation-artifacts/7-3-submit-tasks-through-json-rpc.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/research/technical-json-rpc-task-start-research-2026-05-15.md`
- `packages/core/src/agent-runtime.ts`
- `packages/rpc/src/index.ts`
- `tests/cli-rpc.test.ts`
- `tests/rpc-protocol.test.ts`
- `tests/session-persistence.test.ts`

### Change Log

- 2026-05-15: Created Story 7.3 implementation artifact and marked it ready for development.
- 2026-05-15: Started Story 7.3 implementation.
- 2026-05-15: Implemented and validated JSON-RPC task start; moved Story 7.3 to review.
- 2026-05-15: Fixed code review findings and moved Story 7.3 to done after full validation.
