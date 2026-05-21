# Story 7.4: Stream Runtime Lifecycle Events to RPC Clients

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an external client,
I want to subscribe to Sprite Harness runtime lifecycle events over JSON-RPC,
so that I can render progress, tool activity, approvals, validation, memory, skills, and terminal task state without scraping text output or reading local session files.

## Acceptance Criteria

1. `event.subscribe` accepts object params with required `cwd` and optional `sessionId`, `taskId`, `eventTypes`, and bounded replay preferences, then returns a connection-scoped `subscriptionId`, accepted filters (use `null` for `sessionId`/`taskId` filters that were not supplied), replay metadata, and capability metadata.
2. Runtime events emitted after a successful subscription are sent to stdout as JSON-RPC 2.0 notifications using method `event.runtime` and params containing `subscriptionId`, the validated `RuntimeEventRecord`, and terminal/actionable state hints.
3. Notifications preserve stable runtime event names through `event.type` and schema-validated payloads through the existing core runtime event schema.
4. Events are filtered by authorized runtime cwd, session scope, optional task scope, and optional event type filters before being written to stdout.
5. `task.completed`, `task.failed`, and `task.cancelled` are delivered as explicit terminal notifications; `task.waiting` with `reason: "approval-required"` is delivered as an explicit actionable waiting state so clients do not infer state from text or stream closure.
6. Optional replay is bounded and uses `AgentRuntime.getEventHistory()` only; when `replay.mode` is `recent`, matching replayed events are emitted as `event.runtime` notifications after the subscribe response in history order with `replay: true`; live notifications use `replay: false`; the RPC adapter must not read `.sprite/sessions` or rebuild state directly from storage files.
7. `event.unsubscribe` releases a subscription and cleans up runtime listeners; all active subscriptions are cleaned up on input EOF/server completion.
8. Side-effecting notifications for `event.subscribe` or `event.unsubscribe` produce no response and no subscription side effects.
9. JSON-RPC stdout remains protocol-clean: every response/notification is one complete LF-delimited JSON object, stderr contains only process diagnostics, and no TUI/Ink/React output reaches stdout.
10. Existing `rpc.ping`, `session.create`, `session.resume`, and `task.start` behavior remains backward-compatible, with capabilities expanded to include event subscription methods.
11. Invalid params, out-of-scope subscriptions, unknown event filters, and runtime failures return safe structured JSON-RPC errors with `code`, `subsystem`, `recoverable`, optional `correlationId`, and `nextAction`; secret-like values and local private paths are not echoed.
12. Contract tests cover request/response shape, streamed notification shape, filtering, terminal/actionable states, replay bounds, cleanup, notification no-op behavior, stdout parsing, and backward compatibility.

## Tasks / Subtasks

- [x] Confirm Story 7.4 scope and implementation surfaces. (AC: 1-12)
  - [x] Read this story, Epic 7, PRD Journey 4/RPC requirements, architecture runtime-event/RPC sections, Story 7.1, Story 7.2, Story 7.3, and the research artifact for this story.
  - [x] Inspect `packages/rpc/src/index.ts`, `packages/core/src/agent-runtime.ts`, `packages/core/src/runtime-events.ts`, session persistence tests, RPC protocol tests, and CLI RPC tests.
  - [x] Run GitNexus impact analysis before editing affected symbols; at minimum check `handleJsonRpcRequest`, `runJsonRpcStdioServer`, `writeJsonRpcPayload`, `JsonRpcRuntimeBridge`, `AgentRuntime.subscribeToEvents`, `AgentRuntime.getEventHistory`, `RuntimeEventBus`, and any exported runtime-event type helper/list.
  - [x] Report any HIGH/CRITICAL GitNexus blast radius before editing, per project rule.
  - [x] Keep scope to event subscription/streaming only; do not implement approval responses, cancellation, final summaries, learning reviews, memory APIs, skill APIs, runtime state inspection, HTTP/SSE transport, or external SDK code.

- [x] Define the event subscription contract. (AC: 1-5, 10-11)
  - [x] Add `event.subscribe` and `event.unsubscribe` to protocol capability metadata.
  - [x] Use notification method `event.runtime`; keep stable event names in `params.event.type`.
  - [x] Define subscription result fields: `subscriptionId`, accepted `sessionId` filter or `null`, accepted `taskId` filter or `null`, accepted `eventTypes`, `createdAt`, `replayedEventCount`, `lastEventId`, and runtime capability/event-count metadata.
  - [x] Define notification fields: `subscriptionId`, `event`, `replay`, and state hints such as `terminal` and `actionable`/`waitingReason` where useful.
  - [x] Avoid `rpc.*` method names for this feature; JSON-RPC reserves `rpc.` names.

- [x] Add validation and filtering. (AC: 1, 4, 6, 8, 11)
  - [x] Reuse existing `readScopedCwd()` style validation so `cwd` must canonicalize to the RPC runtime cwd.
  - [x] Validate `sessionId` as a non-empty `ses_`-style string and `taskId` as a non-empty `task_`-style string when supplied; reject malformed IDs safely.
  - [x] Validate `eventTypes` against core-owned runtime event type knowledge. Prefer exporting a small core helper/list instead of duplicating `RUNTIME_EVENT_TYPES` in RPC.
  - [x] Bound replay mode and replay limit; default to no replay or a small safe recent-history limit.
  - [x] Filter every event by session/task/eventTypes before writing.
  - [x] `event.subscribe` and `event.unsubscribe` JSON-RPC notifications must not create/release subscriptions.

- [x] Implement connection-scoped subscription streaming. (AC: 2-7, 9)
  - [x] Extend `JsonRpcRuntimeBridge` with `subscribeToEvents` and keep the bridge additive/backward-compatible for tests.
  - [x] Add a small connection-scoped subscription manager in `packages/rpc/src/index.ts` or `packages/rpc/src/event-subscriptions.ts` if `index.ts` becomes too large.
  - [x] Register runtime listeners through `AgentRuntime.subscribeToEvents()` only; never poll or tail session files from RPC.
  - [x] Use a serialized write queue shared by normal responses, parse errors, ready notifications, and event notifications so concurrent runtime events cannot interleave bytes with responses.
  - [x] Ensure listener/write errors do not mutate runtime state and do not crash the task loop; surface process diagnostics on stderr only if the CLI layer already has a safe diagnostics path.
  - [x] Clean up listeners when unsubscribed, when input closes, or when `runJsonRpcStdioServer()` exits.

- [x] Preserve protocol behavior and safety. (AC: 5, 8-11)
  - [x] Keep `rpc.ready` as the first message by default.
  - [x] Keep batch, parse error, method-not-found, and request notification behavior compatible with Story 7.1/7.3.
  - [x] Make response/notification ordering deterministic enough for clients: each record is parseable; event notifications preserve runtime event order per subscription even if they appear before/after related request responses.
  - [x] Do not add raw provider auth, env values, command stdout/stderr, diff content, or home directory paths to RPC wrappers.
  - [x] Do not import from `@sprite/tui`, Ink, React, or CLI display/rendering helpers in `@sprite/rpc`.

- [x] Add tests. (AC: 1-12)
  - [x] Pure/stdin-stdout RPC: subscribe before `task.start`, then assert `event.runtime` notifications include `task.started` and `task.waiting` with `subscriptionId`, `sessionId`, `taskId`, `correlationId`, `eventId`, `schemaVersion`, `createdAt`, `type`, and `payload`.
  - [x] Filtering: a subscription with `taskId` or `eventTypes` receives only matching events.
  - [x] Terminal/actionable: completed/failed/cancelled task events set `terminal: true`; approval-required waiting events are emitted with explicit waiting/actionable metadata.
  - [x] Replay: bounded current-runtime history is emitted as `event.runtime` notifications after the subscribe response with `replay: true`, in history order, and never exceeds the requested/default limit.
  - [x] Unsubscribe: `event.unsubscribe` prevents later notifications and releases the runtime listener.
  - [x] Notification no-op: `event.subscribe` and `event.unsubscribe` requests without `id` produce no response and no subscription side effects.
  - [x] Invalid params: bad cwd, bad session/task ID, unknown event type, invalid replay object/limit, and unknown subscription ID return safe structured errors.
  - [x] Stdout purity: CLI subprocess tests parse every stdout line as JSON and prove stderr remains empty for normal protocol operation.
  - [x] Backward compatibility: existing `rpc.ping`, `session.create`, `session.resume`, `task.start`, parse-error, and notification tests remain green.

- [x] Validate and update story status during implementation. (AC: 12)
  - [x] Before code edits, run the targeted GitNexus impact checks and record blast radius in the Dev Agent Record.
  - [x] Run targeted validation: `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts tests/session-persistence.test.ts tests/runtime-events.test.ts'`.
  - [x] Run full validation before review: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run `gitnexus_detect_changes` if MCP is available; otherwise run `npx gitnexus analyze/status` and document that detect was unavailable before commit.
  - [x] Move story to `review` only after tests pass.
  - [x] During review phase, report issues found to Chinnaphat before fixing them, per standing instruction.

## Dev Notes

### Story Intent

Story 7.4 turns the existing runtime event bus into the first external-observability surface for RPC clients. The implementation should make external clients first-class event consumers while keeping the shared `AgentRuntime` as the only source of lifecycle truth.

### Source Requirements

- Epic 7 requires external clients to receive lifecycle events and operate under scoped permissions. [Source: `_bmad-output/planning-artifacts/epics.md` lines 1611-1691]
- PRD Journey 4 says tool events, progress updates, approval requests, final summaries, and learning review outputs stream back through RPC, and the value moment is receiving the same lifecycle events as the TUI. [Source: `_bmad-output/planning-artifacts/prd.md` lines 332-350]
- PRD integration requirements require RPC clients to declare cwd/session/tool/memory scope and receive structured task lifecycle events through the same `AgentRuntime` used by CLI/TUI. [Source: `_bmad-output/planning-artifacts/prd.md` lines 438-445]
- PRD RPC requirements list streaming lifecycle events as an MVP RPC capability and require event preferences to be included or resolved. [Source: `_bmad-output/planning-artifacts/prd.md` lines 671-692]
- FR65 requires lifecycle events through JSON-RPC; FR68 requires scoped JSON-RPC permissions. [Source: `_bmad-output/planning-artifacts/prd.md` lines 946-951]
- NFR30 requires stable event names and structured payloads; NFR49 requires JSON-RPC request/response/event schemas to be covered by contract tests. [Source: `_bmad-output/planning-artifacts/prd.md` lines 1021-1052]

### Architecture Guardrails

- Runtime events are typed facts emitted by the runtime and are a first-principles primitive alongside tasks, policy decisions, and session state. [Source: `_bmad-output/planning-artifacts/architecture.md` lines 207-223]
- JSON-RPC, TUI, print, and CLI must consume the same runtime event stream; the session store persists events and tests assert events. [Source: `_bmad-output/planning-artifacts/architecture.md` around lines 600-610]
- Runtime event names are discriminated unions validated at process boundaries and include task, tool, approval, validation, memory, skill, learning, and terminal task families; current code implements this intent through `validateRuntimeEvent()`/core runtime-event helpers, so do not add a new validation dependency just to satisfy architecture wording. [Source: `_bmad-output/planning-artifacts/architecture.md` lines 610-632]
- JSON-RPC is an adapter over `AgentRuntime`, not a separate runtime. [Source: `_bmad-output/planning-artifacts/architecture.md` lines 634-647]
- Event records require stable `type`, ISO `createdAt`, `correlationId`, schema-validated payloads, append-only persistence, and adapter state that can be rebuilt from events plus `state.json`. [Source: `_bmad-output/planning-artifacts/architecture.md` around lines 930-944]
- JSON fields use camelCase; dates use ISO 8601 UTC; secrets are redacted; large outputs use summaries/log references. [Source: `_bmad-output/planning-artifacts/architecture.md` around lines 946-990]
- Anti-patterns include adding RPC methods without schema validation and creating hidden adapter state that cannot be reconstructed from runtime events. [Source: `_bmad-output/planning-artifacts/architecture.md` lines 1174-1183]
- Good examples call out `packages/core/src/agent-runtime.ts` for task orchestration, runtime event reducers for derived UI state, and `.sprite/sessions/*/events.ndjson` for append-only lifecycle events. [Source: `_bmad-output/planning-artifacts/architecture.md` lines 1164-1172]

### Public Research Inputs

Research artifact: `_bmad-output/planning-artifacts/research/technical-json-rpc-lifecycle-event-streaming-research-2026-05-18.md`

- JSON-RPC notifications have no `id` and no responses; request responses must be `result` or `error`, not both. Source: https://www.jsonrpc.org/specification
- MCP 2025 tasks/status/progress patterns support explicit task IDs, task status notifications, progress notifications, and terminal state handling. Sources: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks and https://modelcontextprotocol.io/specification/2025-11-25/schema
- Pi RPC uses strict JSONL over stdin/stdout, response IDs for commands, and separate event records on stdout. Source: https://pi.dev/docs/latest/rpc
- OpenCode exposes `event.subscribe()` for real-time typed events. Source: https://opencode.ai/docs/sdk/
- Claude Code public Agent SDK exposes lifecycle/message/hook observability for session, tool, permission, stop, and result events. Sources: https://code.claude.com/docs/en/agent-sdk/agent-loop and https://code.claude.com/docs/en/agent-sdk/hooks
- Do not use leaked/proprietary Claude Code source; public documentation only.

### Previous Story Intelligence

- Story 7.1 established protocol-clean stdio, `rpc.ready`, parse errors on stdout, LF-only framing, and no TUI output leaks.
- Story 7.2 established safe `session.create`/`session.resume`, durable no-task sessions, safe session error mapping, and no hidden duplicate sessions.
- Story 7.3 established `task.start`, accepted scopes, session binding, initial lifecycle metadata, secret rejection, and side-effecting notification no-op behavior.
- Story 7.3 review fixes matter here:
  - JSON-RPC validation errors should include semantic `error.data.code`.
  - Unsupported/unknown scope keys must be rejected, not silently accepted.
  - Claimed accepted scopes must be reflected in core runtime state, not only RPC responses.
  - Terminal task handling must not block future safe task starts.
- Latest completed code commit before this story: `cf09023` (`Let JSON-RPC clients start scoped tasks safely`).
- Current GitNexus status during story creation: index up-to-date at commit `cf09023`.

### Existing Code and Reuse Targets

- `packages/rpc/src/index.ts`
  - `JsonRpcRuntimeBridge` is currently at line 53 and should be extended additively.
  - `createProtocolMetadata()` currently advertises `rpc.ping`, `session.create`, `session.resume`, and `task.start`; add event capabilities there.
  - `handleTaskStart()` begins around line 1001 and is the model for safe scoped method handling.
  - `handleJsonRpcRequest()` begins around line 1077 and owns method routing.
  - `writeJsonRpcPayload()` begins around line 1151 and should be adapted into or wrapped by a serialized write queue.
  - `runJsonRpcStdioServer()` begins around line 1189 and should own connection-scoped subscription state.
- `packages/core/src/agent-runtime.ts`
  - `startTask()` begins around line 621 and emits initial task lifecycle events through core.
  - `subscribeToEvents()` begins around line 1150 and should be the only live event subscription path.
  - `getEventHistory()` begins around line 1154 and should be the only replay/history path used by RPC.
  - `createSession()` and `resumeSession()` remain the session lifecycle APIs.
- `packages/core/src/runtime-events.ts`
  - `RUNTIME_EVENT_TYPES` begins around line 242 and is the source of event type truth.
  - `RuntimeEventRecord` / `createRuntimeEventRecord()` / `validateRuntimeEvent()` define the event envelope and schema validation.
  - `RuntimeEventBus` begins around line 5818 and already clones, validates, records history, filters by task ID, and swallows subscriber failures so subscribers cannot control runtime state.
- `tests/rpc-protocol.test.ts`
  - Extend the pure/stream tests around task start, strict stdout parsing, and notification no-response behavior.
- `tests/cli-rpc.test.ts`
  - Extend CLI subprocess tests around stdout-only protocol and task start.
- `tests/session-persistence.test.ts` and `tests/runtime-events.test.ts`
  - Use for core runtime event/history/validation coverage when exporting type guards or adding event semantics.

### Recommended Contract Details

Use method names:

- Request: `event.subscribe`
- Request: `event.unsubscribe`
- Server notification: `event.runtime`

Recommended `event.subscribe` params:

```json
{
  "cwd": "/absolute/project/path",
  "sessionId": "ses_optional",
  "taskId": "task_optional",
  "eventTypes": ["task.started", "task.waiting", "task.completed"],
  "replay": {
    "mode": "recent",
    "limit": 50
  }
}
```

Recommended `event.subscribe` result:

```json
{
  "subscription": {
    "subscriptionId": "sub_...",
    "sessionId": null,
    "taskId": null,
    "eventTypes": ["task.started", "task.waiting", "task.completed"],
    "createdAt": "2026-05-18T00:00:00.000Z",
    "replayedEventCount": 0,
    "lastEventId": null
  },
  "runtime": {
    "eventCount": 0,
    "capabilities": [
      "rpc.ping",
      "session.create",
      "session.resume",
      "task.start",
      "event.subscribe",
      "event.unsubscribe"
    ]
  }
}
```

Recommended notification:

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
      "type": "task.waiting",
      "createdAt": "2026-05-18T00:00:00.000Z",
      "payload": {
        "reason": "approval-required",
        "message": "Approval is required before continuing."
      }
    },
    "replay": false,
    "terminal": false,
    "actionable": true,
    "waitingReason": "approval-required"
  }
}
```

Recommended `event.unsubscribe` params/result:

```json
{
  "subscriptionId": "sub_..."
}
```

```json
{
  "subscription": {
    "subscriptionId": "sub_...",
    "status": "unsubscribed"
  }
}
```

### Implementation Hazards to Prevent

- Do not write from the runtime event listener directly to stdout without a queue; byte interleaving would corrupt JSON-RPC.
- Do not store subscription state in core runtime; subscriptions are connection-level adapter state derived from runtime events.
- Do not read session files from RPC to replay; use `getEventHistory()` or extend core if replay needs more data.
- Do not duplicate the runtime event type list in RPC without a drift test.
- Do not mutate or enrich event payloads with unvalidated fields. Put RPC-only metadata in the notification wrapper.
- Do not treat `approval-required` as completed/failed/cancelled. It is actionable waiting and Story 7.5 will respond to it.
- Do not add dependencies or new transports.

### Testing Requirements

- Use Vitest.
- Start with failing tests where practical.
- Every stdout line in protocol/CLI tests must parse as JSON and include `jsonrpc: "2.0"`.
- Tests must prove event notifications include the original validated runtime event envelope, not a text summary.
- Tests must prove secret-like strings are absent from responses, notifications, and persisted session artifacts.
- Tests must prove subscriptions clean up by observing no later notifications after unsubscribe/EOF.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

### Project Structure Notes

- Current `packages/rpc/src` contains only `index.ts`. Adding `packages/rpc/src/event-subscriptions.ts` is acceptable if it reduces `index.ts` complexity, but keep the public package exports stable.
- The architecture document shows a future `packages/rpc/src/event-subscriptions.ts`; use that path if extracting a helper.
- There is no project-context.md discovered during story creation.
- Existing unrelated working-tree changes under `.codex/*` and `_bmad/*` were present before this story; do not stage or modify them as part of Story 7.4 unless explicitly requested.
- Current global `git diff --check` is blocked by pre-existing trailing whitespace in `.codex/skills/deep-interview/SKILL.md`; if unchanged, use scoped diff-checks for Story 7.4 files and record the blocker instead of fixing unrelated `.codex` files.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` lines 1611-1691]
- [Source: `_bmad-output/planning-artifacts/prd.md` lines 332-350, 438-445, 671-692, 946-951, 1021-1052]
- [Source: `_bmad-output/planning-artifacts/architecture.md` lines 207-223, 610-647, 930-990, 1164-1183]
- [Source: `_bmad-output/implementation-artifacts/7-1-start-json-rpc-mode-over-stdin-stdout.md`]
- [Source: `_bmad-output/implementation-artifacts/7-2-create-or-resume-sessions-through-json-rpc.md`]
- [Source: `_bmad-output/implementation-artifacts/7-3-submit-tasks-through-json-rpc.md`]
- [Source: `_bmad-output/planning-artifacts/research/technical-json-rpc-lifecycle-event-streaming-research-2026-05-18.md`]
- [Source: JSON-RPC 2.0 specification, https://www.jsonrpc.org/specification]
- [Source: MCP Tasks 2025-11-25, https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks]
- [Source: MCP Schema 2025-11-25, https://modelcontextprotocol.io/specification/2025-11-25/schema]
- [Source: Pi RPC Mode, https://pi.dev/docs/latest/rpc]
- [Source: OpenCode SDK, https://opencode.ai/docs/sdk/]
- [Source: Claude Code Agent SDK loop, https://code.claude.com/docs/en/agent-sdk/agent-loop]
- [Source: Claude Code Agent SDK hooks, https://code.claude.com/docs/en/agent-sdk/hooks]

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- GitNexus impact gate before code edits: `handleJsonRpcRequest`, `runJsonRpcStdioServer`, `writeJsonRpcPayload`, `JsonRpcRuntimeBridge`, `RuntimeEventBus`, `RUNTIME_EVENT_TYPES`, and `createProtocolMetadata` reported LOW risk; `validateRuntimeEvent`/`isRuntimeEventType` reported CRITICAL blast radius, so implementation avoided changing validator behavior and reused the existing runtime-event schema/list.
- Implemented Story 7.4 in `packages/rpc/src/index.ts` by adding connection-scoped `event.subscribe`/`event.unsubscribe`, a serialized JSON-RPC write queue, replay delivery, live event notifications, filters, and cleanup on unsubscribe/EOF.
- Exported core `RUNTIME_EVENT_TYPES` from `packages/core/src/runtime-events.ts` so RPC validates filters against core-owned event type knowledge without duplicating the list.
- Added protocol and CLI tests for lifecycle event streaming, replay, invalid params, unsubscribe cleanup, stdout JSON parsing, and backward compatibility.
- Validation: targeted Story 7.4 tests passed (`tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, `tests/session-persistence.test.ts`, `tests/runtime-events.test.ts`: 140 tests).
- Validation: full `npm run lint` and full `npm test` passed (28 test files, 414 tests).
- Validation note: global `git diff --check` remains blocked by pre-existing unrelated `.codex/skills/deep-interview/SKILL.md:313`; scoped diff-check for Story 7.4 files passed.
- GitNexus detect note: MCP `gitnexus_detect_changes` was unavailable in this session; ran `npx gitnexus status`/query fallback and confirmed index status at commit `cf09023` before review.
- Review fix pass on 2026-05-21: re-indexed GitNexus for the working tree; `EventSubscriptionRegistry`, `runJsonRpcStdioServer`, `handleJsonRpcServerMessage`, `eventMatchesSubscription`, and `createRuntimeEventNotification` reported LOW impact before edits.
- Review fix pass on 2026-05-21: buffered live subscription notifications during each JSON-RPC request/batch handling window so response payloads are written before live `event.runtime` notifications from that request.
- Review fix pass on 2026-05-21: added regression coverage for batch subscribe/start ordering, `task.failed` and `task.cancelled` terminal notifications, and taskId-only replay filtering with valid unmatched IDs treated as empty filters.
- Validation after review fixes: targeted Story 7.4 tests passed (`tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, `tests/session-persistence.test.ts`, `tests/runtime-events.test.ts`: 144 tests).
- Validation after review fixes: full `npm run lint` passed and full `npm test` passed (28 test files, 418 tests).
- Validation after review fixes: scoped Story 7.4 `git diff --check` passed; global diff-check still has the unrelated pre-existing `.codex/skills/deep-interview/SKILL.md:313` whitespace blocker.
- Medium review fix on 2026-05-21: added direct `event.subscribe` contract coverage for out-of-scope `cwd`, malformed `sessionId`, and sessionId-only replay filtering with valid unmatched session filters returning zero replay events.
- Validation after medium review fix: targeted Story 7.4 tests passed (`tests/rpc-protocol.test.ts`, `tests/cli-rpc.test.ts`, `tests/session-persistence.test.ts`, `tests/runtime-events.test.ts`: 145 tests).
- Validation after medium review fix: full `npm run lint` passed and full `npm test` passed (28 test files, 419 tests); scoped Story 7.4 `git diff --check` passed.
- Created on 2026-05-18 after Story 7.3 commit `cf09023` was completed and GitNexus reported the index up-to-date.
- Loaded BMad create-story workflow, project config, sprint status, Epic 7, PRD JSON-RPC requirements, architecture runtime-event/RPC guidance, Story 7.3 learnings, current RPC/runtime event code surfaces, GitNexus status/context, and public JSON-RPC/MCP/Pi/OpenCode/Claude Agent SDK documentation.
- Created technical research artifact for lifecycle event streaming and explicitly excluded leaked/proprietary Claude Code source.
- Marked Story 7.4 ready-for-dev in sprint status.
- Ran BMad story validation on 2026-05-18 and patched ambiguity around pre-session subscriptions, replay delivery, current runtime-event validator usage, GitNexus detect fallback, and the unrelated global diff-check blocker.
- Started Story 7.4 development on 2026-05-18; moving from ready-for-dev to in-progress and beginning with GitNexus impact analysis before code edits.

### Completion Notes List

- Implemented `event.subscribe` and `event.unsubscribe` for JSON-RPC stdio clients.
- Added `event.runtime` notifications containing the validated runtime event envelope plus `replay`, `terminal`, `actionable`, and `waitingReason` hints.
- Added cwd/session/task/event-type validation and filtering; side-effecting subscribe/unsubscribe notifications remain no-ops.
- Added bounded replay using `AgentRuntime.getEventHistory()` only, emitted after subscribe responses with `replay: true`.
- Added connection cleanup on explicit unsubscribe and server EOF/completion.
- Preserved existing `rpc.ping`, `session.create`, `session.resume`, and `task.start` behavior; capabilities now include event subscription methods.
- Full validation passed except global diff-check is still blocked by unrelated pre-existing `.codex` trailing whitespace; scoped Story 7.4 diff-check passed.
- Resolved review blocker: batch `event.subscribe` + `task.start` now returns the batch response before streaming the task lifecycle notifications emitted by the batch.
- Resolved terminal coverage gap: RPC contract tests now assert `task.failed` and `task.cancelled` are delivered as `terminal: true` notifications.
- Resolved filter coverage gap: RPC contract tests now assert direct taskId-only replay filtering and document valid unmatched task IDs as accepted filter-only values that replay zero events.
- Resolved medium review issue: RPC contract tests now directly cover subscription cwd validation, malformed sessionId rejection, and sessionId-scoped replay filtering.
- Ultimate context engine analysis completed for Story 7.4 planning.
- Story 7.4 created as a ready-for-dev implementation guide focused on connection-scoped JSON-RPC event subscriptions.
- Scope boundaries captured to prevent accidental implementation of approval responses, cancellation, final summary retrieval, runtime inspection, SDKs, or alternate transports.
- Highest-risk implementation issue identified: serialized stdout write queue for concurrent event notifications and request responses.
- Story validation completed; critical ambiguities resolved before development.

### File List

- `packages/core/src/runtime-events.ts`
- `packages/rpc/src/index.ts`
- `tests/rpc-protocol.test.ts`
- `tests/cli-rpc.test.ts`
- `_bmad-output/implementation-artifacts/7-4-stream-runtime-lifecycle-events-to-rpc-clients.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/research/technical-json-rpc-lifecycle-event-streaming-research-2026-05-18.md`

### Change Log

- 2026-05-21: Added Story 7.4 subscription scope contract tests after code review.
- 2026-05-21: Addressed Story 7.4 code review findings for batch response ordering, terminal event coverage, and taskId filter coverage.
- 2026-05-18: Implemented Story 7.4 JSON-RPC runtime lifecycle event subscriptions and moved story to review.
- 2026-05-18: Created Story 7.4 implementation artifact and marked it ready for development.
- 2026-05-18: Validated Story 7.4 context and clarified subscription filters, replay notifications, validator reuse, GitNexus fallback, and unrelated diff-check blocker.
