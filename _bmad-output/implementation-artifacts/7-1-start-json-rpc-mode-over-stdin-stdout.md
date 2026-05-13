# Story 7.1: Start JSON-RPC Mode over Stdin/Stdout

Status: done

<!-- Note: Created and moved directly into development because Chinnaphat asked to move to Story 7.1. -->

## Story

As an external tool developer,
I want to start Sprite Harness in JSON-RPC mode,
so that another process can call the same runtime without using the TUI.

## Acceptance Criteria

1. Given the user runs `sprite rpc`, when JSON-RPC mode starts, then Sprite Harness accepts JSON-RPC requests over stdin and writes responses/notifications over stdout, and stderr is reserved for process diagnostics that do not corrupt the JSON-RPC stream.
2. Given JSON-RPC mode starts, when runtime state initializes, then the RPC adapter connects to the shared `AgentRuntime` and does not create a separate task loop.

## Tasks / Subtasks

- [x] Create Story 7.1 context and mark the story in progress (AC: 1-2)
  - [x] Extract Epic 7 / Story 7.1 acceptance criteria from the epics artifact.
  - [x] Carry forward Epic 6 retrospective guardrails for adapter thinness, stdout protocol cleanliness, and review-before-done.
  - [x] Update sprint status so Epic 7 and Story 7.1 are in progress.

- [x] Confirm implementation surface and GitNexus blast radius before code edits (AC: 1-2)
  - [x] Inspect current CLI command setup, placeholder RPC package, package references, and CLI subprocess test style.
  - [x] Run GitNexus impact analysis before editing existing symbols such as `createProgram`, `runCli`, root/package manifests, and any existing runtime-facing symbols.
  - [x] Keep scope to the transport/bootstrap adapter only; do not implement session create/resume, task submission, event subscriptions, approval responses, final-summary retrieval, learning-review retrieval, or scoped runtime inspection beyond a minimal handshake.

- [x] Define the minimal Story 7.1 JSON-RPC transport contract before implementation (AC: 1)
  - [x] Use JSON-RPC 2.0 envelopes over stdin/stdout with one complete JSON message per line for deterministic MVP stdio operation.
  - [x] Add a startup notification such as `rpc.ready` on stdout as a JSON-RPC notification, not diagnostic text.
  - [x] Add a minimal request such as `rpc.ping` to prove request/response handling and runtime connection without starting a task.
  - [x] Return structured JSON-RPC errors for malformed JSON, invalid requests, and unknown methods without echoing raw secret-like input.
  - [x] Route process crashes/diagnostics to stderr only.

- [x] Add RPC adapter package implementation (AC: 1-2)
  - [x] Replace the `packages/rpc/src/index.ts` placeholder with typed JSON-RPC request/response/notification contracts and pure message handlers.
  - [x] Add a stdio runner that reads newline-delimited JSON-RPC from an input stream and writes newline-delimited JSON-RPC messages to an output stream.
  - [x] Inject or construct the shared `AgentRuntime` as the runtime bridge; do not add an independent task loop or duplicate session/runtime state.
  - [x] Keep RPC independent from TUI, Ink, React, and TUI view models.

- [x] Wire `sprite rpc` through the CLI adapter (AC: 1-2)
  - [x] Add `@sprite/rpc` as a CLI dependency/reference.
  - [x] Add a `rpc` subcommand to `createProgram()` that constructs `AgentRuntime` and delegates stdin/stdout handling to `packages/rpc`.
  - [x] Ensure `sprite rpc --help` uses normal help behavior but runtime protocol mode itself writes only JSON-RPC messages to stdout.
  - [x] Update development/package metadata as needed so `npm run build`, `npm run dev:rpc`, and workspace exports understand the RPC package.

- [x] Add deterministic protocol tests (AC: 1-2)
  - [x] Add pure RPC handler tests for `rpc.ready`, `rpc.ping`, invalid JSON/requests, unknown methods, and batch/no-response notification behavior if supported.
  - [x] Add CLI subprocess tests proving `node packages/cli/dist/index.js rpc` accepts stdin, emits parseable JSON-RPC lines on stdout, exits cleanly on stdin close, and keeps stderr free of protocol output.
  - [x] Add regression coverage proving startup/handshake output does not expose raw secret-like values or private diagnostic text.
  - [x] Assert `rpc.ping` does not submit a task or produce runtime lifecycle events.

- [x] Validate, review, and close the story (AC: 1-2)
  - [x] Run targeted RPC/CLI tests first.
  - [x] Run full validation: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run GitNexus analyze/status before commit according to project rules.
  - [x] Move the story and sprint status to `review` only after implementation validation passes.
  - [x] During code review, report issues found to Chinnaphat before applying fixes.
  - [x] Move the story and sprint status to `done` only after review fixes and validation pass.

## Dev Notes

### Story Intent

Story 7.1 opens the Epic 7 external-tool integration surface. The goal is not to implement full session/task/event/approval RPC behavior yet. The goal is to start `sprite rpc`, keep stdout as a valid JSON-RPC stream, prove request/response handling over stdin/stdout, and connect the adapter to the existing shared `AgentRuntime` without creating a second task loop.

### Source Requirements

- Epic 7 requires external clients to connect over JSON-RPC, submit tasks, receive lifecycle events, answer approvals, retrieve summaries/reviews, and operate under scoped permissions. Story 7.1 only starts the stdio JSON-RPC mode. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 7]
- Story 7.1 acceptance criteria require `sprite rpc` to accept JSON-RPC requests over stdin, write responses/notifications over stdout, reserve stderr for diagnostics, connect to shared `AgentRuntime`, and avoid a separate task loop. [Source: `_bmad-output/planning-artifacts/epics.md` Story 7.1]
- FR63 requires external clients to connect through JSON-RPC over stdin/stdout. [Source: `_bmad-output/planning-artifacts/prd.md` FR63]
- NFR30 requires JSON-RPC lifecycle events to use stable event names and structured payloads. Story 7.1 should establish naming and envelope discipline without implementing lifecycle subscription yet. [Source: `_bmad-output/planning-artifacts/prd.md` NFR30]
- NFR49 requires JSON-RPC request/response/event schemas to be covered by contract tests. [Source: `_bmad-output/planning-artifacts/prd.md` NFR49]
- Architecture requires CLI, TUI, print mode, and JSON-RPC to share one `AgentRuntime`; adapters decide presentation/control only. [Source: `_bmad-output/planning-artifacts/architecture.md`]
- Architecture explicitly calls for a JSON-RPC adapter built directly over stdin/stdout and a runtime package independent from terminal UI. [Source: `_bmad-output/planning-artifacts/architecture.md` Selected Starter]

### Previous Epic / Story Intelligence

- Story 6.6 completed the live TUI outcome surface and kept TUI as an adapter over runtime events, final summaries, learning reviews, and storage/core bridge helpers.
- Epic 6 retrospective says the critical path before Story 7.1 is: confirm `sprite rpc` command placement, keep `packages/rpc` responsible for protocol parsing/formatting rather than lifecycle ownership, keep stdout protocol-clean, keep the first method scope minimal, add subprocess stdio tests, preserve redaction, and record GitNexus evidence.
- Review practice for Story 7.1 must report code-review issues to Chinnaphat before fixes are applied.
- Current baseline: `packages/rpc/src/index.ts` is a placeholder, the root script `dev:rpc` points to `scripts/dev-rpc-placeholder.mjs`, and the CLI does not expose `sprite rpc` yet.

### Minimal Contract for This Story

The implementation should define a small, explicit MVP contract:

- Transport: newline-delimited JSON-RPC 2.0 messages over stdin/stdout.
- Startup notification: `rpc.ready` emitted as a JSON-RPC notification on stdout after the RPC adapter initializes.
- Handshake request: `rpc.ping` returns protocol/server metadata and confirms that the shared runtime bridge was initialized.
- Error responses: malformed JSON uses `-32700`, invalid JSON-RPC requests use `-32600`, unknown methods use `-32601`, and internal runtime/bootstrap failures use an implementation-defined server error code in the `-32000` range.
- Safety: error data should include bounded structured metadata such as `subsystem`, `recoverable`, and `nextAction`; it must not echo raw secret-like input or raw provider credentials.
- Scope limit: do not implement `session.create`, `session.resume`, `task.start`, event subscriptions, `approval.respond`, final-summary retrieval, learning-review retrieval, or `runtime.getState` in this story.

### Suggested Files to Inspect / Modify

Expected implementation surface:

- `packages/rpc/src/index.ts` — new JSON-RPC contracts, message handlers, and stdio runner.
- `packages/rpc/package.json` and `packages/rpc/tsconfig.json` — exports, types, and references to shared/core if needed.
- `packages/cli/src/index.ts` — add the `rpc` subcommand and delegate to the RPC package.
- `packages/cli/package.json` and `packages/cli/tsconfig.json` — add RPC dependency/reference.
- `tsconfig.base.json`, `tsconfig.json`, and root `package.json` — add RPC path/files/dev script adjustments if needed.
- `tests/cli-smoke.test.ts` or a new `tests/cli-rpc.test.ts` — subprocess stdio coverage.
- New `tests/rpc-protocol.test.ts` if pure package-level protocol tests are useful.

Avoid:

- Importing from `@sprite/tui` in `@sprite/rpc`.
- Adding new dependencies.
- Starting runtime tasks or session mutation from `rpc.ping`.
- Writing non-protocol logs to stdout in RPC mode.
- Returning raw private paths, provider secrets, or unbounded user input in bootstrap/handshake responses.

### Testing Requirements

- Use Vitest and existing subprocess patterns from `tests/cli-smoke.test.ts`.
- Tests must build before subprocess checks because CLI tests run `packages/cli/dist/index.js`.
- Tests should parse every stdout line as JSON and verify each protocol message has `jsonrpc: "2.0"`.
- Tests should assert `stderr` is empty or contains only non-protocol diagnostic text for expected clean cases.
- Tests should assert `rpc.ping` has no side effect on `AgentRuntime` task/event history.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created on 2026-05-13 after Epic 6 retrospective was completed and sprint status showed Epic 7 backlog.
- Loaded BMad `bmad-dev-story` and `bmad-create-story` workflow guidance, project config, sprint status, Epic 7 requirements, PRD JSON-RPC requirements, architecture RPC/runtime boundaries, Story 6.6 notes, and Epic 6 retrospective guardrails.
- `omx explore` was attempted first for repository mapping but failed because the spark model is unavailable for this account; continued with bounded RTK-wrapped repository inspection commands.
- A first shell heredoc attempt was truncated by nested quote content; the story artifact was immediately rewritten with `apply_patch` before development continued.
- GitNexus pre-edit impact checks completed: `createProgram` risk LOW with direct caller `runCli` and 0 affected processes; `runCli` risk LOW with direct file caller only and 0 affected processes. `AgentRuntime` context was inspected and not edited.
- Red phase confirmed with `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'`: CLI `rpc` command missing, `@sprite/rpc` package export missing, and `sprite rpc` was treated as a task.
- Implemented `packages/rpc` newline-delimited JSON-RPC 2.0 contracts, `rpc.ready`, `rpc.ping`, parse/invalid/method-not-found errors, batch handling, and stdio server.
- Wired `sprite rpc` through the CLI adapter and updated package/tsconfig metadata plus `npm run dev:rpc`.
- Targeted validation passed: `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (9 tests).
- Broader CLI/RPC validation passed: `rtk run 'npm test -- --run tests/cli-smoke.test.ts tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (42 tests before review fix).
- Full pre-review validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 387 tests).
- Review issue was reported to Chinnaphat before fixing: the CLI RPC bridge cast `io.stdout` directly to `Writable`, which could hang custom `CliIO` writers that do not call Node write callbacks.
- Review fix added `createCliOutputWritable()` plus regression coverage for custom writer callback completion.
- Full post-review validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 388 tests).
- GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,068 nodes, 10,856 edges, status up-to-date).
- Follow-up technical research for Story 7.2 found Pi RPC framing guidance: strict LF-only framing is safer than generic line readers for JSON strings containing Unicode line/paragraph separators.
- GitNexus follow-up impact check for `runJsonRpcStdioServer` was LOW risk with one direct affected test file and 0 affected processes.
- Hardened `runJsonRpcStdioServer()` to use a strict LF-only async splitter, strip trailing `\r` for CRLF compatibility, and avoid Node `readline` for protocol framing.
- Added regression coverage proving CRLF input is accepted and `U+2028` / `U+2029` inside JSON strings do not split RPC frames.
- Follow-up targeted validation passed: `rtk run 'npm test -- --run tests/rpc-protocol.test.ts tests/cli-rpc.test.ts'` (10 tests).
- Follow-up full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (28 test files, 389 tests).
- Follow-up GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (6,090 nodes, 10,874 edges, status up-to-date).

### Review Findings

- [x] [Review][Patch] CLI RPC bridge passed `io.stdout` to the RPC stdio server via a raw `Writable` cast. Custom `CliIO` writers can ignore Node write callbacks, causing RPC writes to wait forever in tests or embedded use. Reported to Chinnaphat before applying the fix. Fixed with `createCliOutputWritable()` and regression coverage in `tests/cli-rpc.test.ts`.

### Completion Notes List

- Added `@sprite/rpc` as the RPC adapter package with JSON-RPC 2.0 message contracts, newline-delimited stdio transport, startup `rpc.ready` notification, minimal `rpc.ping` handshake, structured parse/invalid/method-not-found errors, and batch request support.
- Kept the adapter connected to the shared `AgentRuntime` through a small runtime bridge using bootstrap/event-history methods only; `rpc.ping` does not start tasks or emit runtime lifecycle events.
- Added `sprite rpc` CLI subcommand that delegates protocol handling to `packages/rpc` and keeps protocol-mode stdout limited to JSON-RPC messages.
- Updated package metadata, TypeScript project references, workspace path aliases, package-lock, and `npm run dev:rpc` for the real RPC adapter.
- Added pure protocol and CLI subprocess tests for stdout/stderr separation, parseable protocol lines, secret/private-path non-disclosure, parse errors, unknown methods, notification behavior, no task side effects, and custom CLI writer completion.
- Hardened stdio framing before Story 7.2 so protocol input splits only on LF, accepts CRLF, and preserves valid Unicode line/paragraph separator characters inside JSON strings.

### File List

- `_bmad-output/implementation-artifacts/7-1-start-json-rpc-mode-over-stdin-stdout.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/tsconfig.json`
- `packages/rpc/package.json`
- `packages/rpc/src/index.ts`
- `packages/rpc/tsconfig.json`
- `tests/cli-rpc.test.ts`
- `tests/rpc-protocol.test.ts`
- `tsconfig.base.json`
- `tsconfig.json`

### Change Log

- 2026-05-13: Created Story 7.1 implementation artifact and moved it into progress.
- 2026-05-14: Implemented and validated `sprite rpc` JSON-RPC stdio bootstrap mode; moved Story 7.1 to done.
- 2026-05-14: Applied research-driven strict LF framing hardening before Story 7.2.
