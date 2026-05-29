# Deferred Work

## Deferred from: code review of 7-5-respond-to-approval-requests-through-json-rpc (2026-05-22)

- State inconsistency when `persistCurrentActiveTaskSnapshot` fails mid-`respondToApproval`. The pending approval is deleted and `waitingState` is cleared before the snapshot is persisted; if persistence fails the in-memory map and on-disk state diverge. Pre-existing in core (Story 2.6 design); not introduced by 7.5. Needs a snapshot-failure rollback path or retry semantics in `AgentRuntime.respondToApproval()`.

- Notification buffer grows unbounded during long-running approved tool execution. `runJsonRpcStdioServer`'s `beginNotificationBuffer` / `endNotificationBuffer` collects every emitted runtime event for the duration of the awaited handler. For an approved `run_command` that takes 30+ seconds, all `tool.call.*` notifications accumulate in memory and are flushed only after the response is written. Acknowledged in the 7.5 commit message under `Not-tested`. Needs a chunked or streaming flush design that coordinates with the Story 7.4 serialized write queue.

- Single long approval blocks all subsequent RPC messages on the stdin pipe. `runJsonRpcStdioServer` now `await`s every message handler; pings, unsubscribes, and other approval responses queue behind a long-running approved tool execution. Pre-existing once Story 7.4 introduced the per-message await, but exacerbated by the new async approval path. Needs concurrent dispatch or a backpressure model.

- String length checks use UTF-16 code units (`String#length`), inconsistent with grapheme or byte counts. `APPROVAL_REASON_MAX_LENGTH = 1000` admits ~500 emoji or ~1000 ASCII characters, producing surprising rejections for Unicode-aware clients. Same pattern in `task.start`, `event.subscribe`, and `session.resume` validators. Needs a project-wide decision on grapheme vs. byte vs. code-unit budgets.

- `correlationId` is never populated in `approval.respond` error responses. The active task's `correlationId` is available via `runtime.getActiveTask()` but is not threaded into any of the approval error helpers. The spec phrases it as "optional `correlationId` … when available", and the recommended error-data example shows `correlationId: "corr_xyz"`, suggesting the intent was to populate it whenever a task is active. Same omission pattern exists in Story 7.3 and Story 7.4 errors.

## Deferred from: code review of 7-5-respond-to-approval-requests-through-json-rpc (2026-05-30)

- No combined ARG_MAX guard across args+env payload. Individual field bounds (128 args × 4096 chars + 64 env entries × 4096 chars ≈ 768 KB) could approach OS `execve` limits on some BSD systems (~256 KB). Individual field bounds are sufficient for Linux; a combined guard is a defense-in-depth enhancement.

- Magic number rationale (16_000, 4_096, 65_536, etc.) is undocumented. Future maintainers cannot distinguish arbitrary limits from OS-constraint-driven values (PATH_MAX, ARG_MAX). Pre-existing pattern across the codebase.

- Missing boundary-at-limit tests. All bound tests probe one past the limit (e.g., 16_001, 65_537) but none test at exactly the limit value (e.g., 16_000, 65_536). This makes off-by-one errors in constants or operators undetectable by the test suite. Test enhancement, not a bug.

- `edit.path` in `readApprovalPatchToolCall` is not scoped to `cwd`. The RPC layer validates path as a non-empty bounded string with no normalization or cwd-scoping. Path traversal defense is the `apply_patch` tool's responsibility per existing architecture; adding it at the RPC layer would duplicate downstream enforcement.
