# Story 2.5: Execute Commands Through the Sandbox Runner

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want command execution to go through a sandbox boundary,
so that local project work can run without uncontrolled shell access.

## Acceptance Criteria

1. Given the agent requests a command, when the request is allowed by policy, then `SandboxRunner` executes it within the configured working directory boundary and applies timeout and environment exposure controls.
2. Given a command fails, times out, or violates sandbox policy, when the sandbox returns the result, then the runtime records a structured observation instead of crashing and emits command/tool failure events.

## Tasks / Subtasks

- [x] Add a sandbox command runner in `@sprite/sandbox` (AC: 1, 2)
  - [x] Implement `packages/sandbox/src/sandbox-runner.ts` and export it from `packages/sandbox/src/index.ts`.
  - [x] Define explicit command execution request/result types that preserve command, args, cwd, timeout, exit status, duration, and output summaries without putting raw environment values in metadata.
  - [x] Execute commands with `child_process.spawn` or `execFile` using `shell: false`; do not execute shell strings or use shell interpreters to bypass structured args.
  - [x] Resolve and enforce the working directory boundary before execution, including symlink escapes and missing cwd handling.
  - [x] Enforce timeout for every command; timed-out commands must be terminated and returned as structured failures, not thrown exceptions.
  - [x] Apply environment controls: no custom env exposure for allowed commands, no raw env values in results/events, and a minimal deterministic inherited environment such as `PATH` only unless policy/approval later expands it.
- [x] Add the `run_command` tool wrapper (AC: 1, 2)
  - [x] Add `packages/tools/src/run-command.ts` that validates untrusted tool input and delegates execution to `SandboxRunner`.
  - [x] Extend `ToolName`, `ToolInputMap`, `ToolExecutionResult`, `ToolRegistry.execute()`, and `packages/tools/src/index.ts` for `run_command`.
  - [x] Keep command output bounded using the existing `summarizeToolOutput()` pattern in the tool wrapper; raw stdout/stderr may be returned through the tool result, but runtime events must only carry metadata and output references.
  - [x] Use existing `SpriteError`/`Result` patterns for invalid input, sandbox violations, command failure, timeout, and spawn errors.
- [x] Wire allowed command execution through `AgentRuntime` (AC: 1, 2)
  - [x] Extend `AgentRuntime.executeToolCall()` for `run_command`.
  - [x] Classify command requests with the Story 2.4 policy classifier before execution.
  - [x] Execute only `allow` decisions and mechanically safe `modify` decisions that provide a bounded modified request; do not execute `deny` or `require_approval` decisions in this story.
  - [x] Emit `policy.decision.recorded` before any command execution.
  - [x] Keep existing `apply_patch`, `read_file`, `list_files`, and `search_files` behavior and event ordering compatible.
- [x] Add command audit/event support (AC: 2)
  - [x] Add `run_command` to runtime tool lifecycle schemas and validation.
  - [x] Add command execution metadata events or command activity records if needed so audits can identify command, cwd, status, exit code, timeout, duration, and output reference without raw stdout/stderr/env.
  - [x] Ensure command failures, timeouts, spawn errors, policy denials, and sandbox violations are structured observations with stable error codes.
  - [x] Update final summary command-related data only if command activity is added; do not remove existing file activity summary behavior.
- [x] Add deterministic tests (AC: 1, 2)
  - [x] Add sandbox runner tests for successful bounded commands, non-zero exit, timeout, cwd outside boundary, symlink boundary escape, malformed input, and env redaction.
  - [x] Add tool registry tests proving `run_command` delegates to the sandbox runner and returns bounded output summaries.
  - [x] Add runtime integration tests proving allowed commands execute, policy decisions are recorded first, failures/timeouts emit failure events, and denied/approval-required commands do not execute.
  - [x] Add regression tests proving existing repository tools and `apply_patch` event ordering still pass.
- [x] Update docs and validation records (AC: 1, 2)
  - [x] Update README to remove "Sandbox runner" and "Sandboxed command execution" from the not-implemented list only after the runnable API exists.
  - [x] Document current limitations clearly: approval prompts remain Story 2.6, configured validation command orchestration remains Story 2.7, and provider-driven automatic command use remains future work unless already present.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and targeted Prettier check for touched source, tests, README, and story files.
  - [x] Run GitNexus impact before editing symbols and `gitnexus_detect_changes()` before committing.

### Review Findings

- [x] [Review][Patch] Timed-out commands that ignore `SIGTERM` can keep `SandboxRunner` unresolved indefinitely [packages/sandbox/src/sandbox-runner.ts:198]

## Dev Notes

### Story Intent

Story 2.5 is the first real command execution story. It should make command execution possible only through a reusable sandbox boundary and runtime/tool APIs. It is not the approval story and not the validation-command orchestration story.

Implement this slice:

- A deterministic sandbox command runner under `packages/sandbox`.
- A `run_command` tool that goes through policy and the sandbox runner.
- Runtime events/audit metadata for command execution and failures.
- Structured observations for failure, timeout, and sandbox violation paths.

Do not implement in this story:

- Approval request creation or approval response handling. That is Story 2.6.
- Configured validation orchestration. That is Story 2.7.
- Denial/failure recovery loops. That is Story 2.8.
- Provider-driven automatic tool calling if it is not already in the runtime loop.
- TUI or RPC approval surfaces.

### Source Requirements

- Epic 2 objective: users can inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 2]
- Story 2.5 requires `SandboxRunner` to execute allowed commands within the configured working directory boundary with timeout and environment controls. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.5]
- Story 2.5 requires command failure, timeout, and sandbox policy violation to return structured observations and emit command/tool failure events instead of crashing. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.5]
- PRD MVP scope says initial tools include `run_command`, and command execution must use a sandboxed runner with cwd boundary, timeout, environment control, and approval for risky commands. [Source: `_bmad-output/planning-artifacts/prd.md` MVP Scope]
- PRD NFR7 requires command execution constrained to the configured sandbox boundary by default. [Source: `_bmad-output/planning-artifacts/prd.md` Security and Privacy]
- PRD NFR8 requires risky or destructive commands not to execute without explicit approval. In Story 2.5, approval-required commands should not execute; approval handling arrives in Story 2.6. [Source: `_bmad-output/planning-artifacts/prd.md` Security and Privacy]
- PRD NFR17 requires every command execution to have a timeout. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR18 requires denied commands, failed commands, sandbox violations, and validation failures to return to the agent as structured observations. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR23/NFR24 require audit trails and final summaries to identify commands run and unresolved risks when available. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture mandates that CLI, TUI, print mode, and JSON-RPC are adapters over one `AgentRuntime`; sandbox and policy must be below every interface. [Source: `_bmad-output/planning-artifacts/architecture.md` Core Architectural Principles]
- Architecture places sandbox and policy logic in `packages/sandbox`, tool implementations in `packages/tools`, and runtime lifecycle/event emission in `packages/core`. [Source: `_bmad-output/planning-artifacts/architecture.md` Component Boundaries]

### Previous Story Intelligence

Story 2.4 established the policy classification layer that Story 2.5 must reuse:

- `packages/sandbox/src/policy-engine.ts` exports `classifyPolicyRequest()` and policy request/decision types.
- `AgentRuntime.classifyPolicyRequest()` emits `policy.decision.recorded` with the active task correlation ID and does not execute anything.
- Command policy requests use structured metadata: `{ type: "command", command, args?, cwd, timeoutMs?, env?, configuredValidation? }`.
- Safe read-only commands and explicitly configured validation commands can be `allow` or `modify`; risky commands are `require_approval` or `deny`.
- Review fixes in commit `719a069` tightened configured validation flags, shell download execution through interpreters, broad edit path detection, and `.github/workflows` config paths.

Use these patterns directly:

- Public runtime/tool boundaries accept untrusted input and return `Result<..., SpriteError>` failures instead of throwing.
- Policy decisions and runtime events must be metadata-only; do not include raw stdout, stderr, env values, command output bodies, repository instructions, patch bodies, or secrets in events.
- Event bus clone semantics must stay intact.
- `executeToolCall(apply_patch)` remains ungated by approval until Story 2.6.

Story 2.3 and 2.4 established repository tool/event patterns:

- Tool implementations live in `packages/tools/src/*` and are exported from `packages/tools/src/index.ts`.
- `ToolRegistry.execute()` is the central registry for runtime tool execution.
- Runtime tool lifecycle events use `tool.call.requested`, `tool.call.started`, `tool.call.completed`, and `tool.call.failed`.
- `outputReference` is already available on completed tool events and should be reused for command output metadata.
- `summarizeToolOutput()` bounds large returned output and currently does not persist full output durably.

### Current Codebase State

Relevant files:

- `packages/sandbox/src/policy-engine.ts`: existing policy classifier and command request types.
- `packages/sandbox/src/index.ts`: package export point; add sandbox runner exports here.
- `packages/sandbox/package.json`: currently depends on `@sprite/shared`; add dependencies only if necessary.
- `packages/tools/src/tool-registry.ts`: currently registers `apply_patch`, `read_file`, `list_files`, and `search_files`; add `run_command`.
- `packages/tools/src/output-summarizer.ts`: use this for command stdout/stderr/result summaries.
- `packages/tools/src/path-boundary.ts`: existing project boundary helper for filesystem paths. Do not import this file from `packages/sandbox` if `packages/tools` imports `@sprite/sandbox`; either implement the needed cwd boundary logic locally in sandbox or extract shared boundary primitives into `@sprite/shared` without creating a package cycle.
- `packages/core/src/agent-runtime.ts`: owns active task state, tool lifecycle event emission, policy decision event emission, and tool execution.
- `packages/core/src/runtime-events.ts`: owns event type names, payload schemas, validation, clone behavior, and tool name allowlists.
- `packages/core/src/final-task-summary.ts`: currently reports file activity and "validation not attempted"; update only if command activity becomes available.
- `tests/tool-registry.test.ts`: current cross-tool tests and temp project helpers.
- `tests/runtime-events.test.ts`: runtime event and `AgentRuntime.executeToolCall()` integration tests.
- `tests/policy-engine.test.ts`: policy classifier regression tests.

No `project-context.md` or UX design file was found during story creation.

### Suggested Contracts

Keep contract names local to the owning package unless exporting is useful for tests or runtime integration.

Recommended sandbox runner input:

```ts
export interface SandboxCommandRequest {
  args?: string[];
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
}
```

Recommended sandbox runner result:

```ts
export interface SandboxCommandResult {
  args: string[];
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  status: "completed" | "failed" | "timed_out";
  timedOut: boolean;
  timeoutMs: number;
}
```

Tool-level result may wrap this with:

```ts
{
  command: string; // sanitized command summary, not shell text
  cwd: string;
  exitCode: number | null;
  output: ToolOutputSummary;
  status: "completed";
  summary: string;
  timedOut: boolean;
  toolName: "run_command";
}
```

Use `Result` failures for malformed input, sandbox boundary violation, spawn errors, and policy non-execution. Use successful results for completed commands and, if the local pattern is clearer, for non-zero exit commands with `exitCode !== 0`. Either approach is acceptable if runtime tests prove failed commands become structured observations and failure events.

### Execution Rules

The sandbox runner must:

- Resolve the execution cwd and enforce it remains inside the configured project boundary.
- Avoid importing `@sprite/tools`; `packages/tools` may import `@sprite/sandbox` for `run_command`, so sandbox-to-tools imports would create a cycle.
- Execute with `shell: false`.
- Treat `command` as an executable name/path and `args` as structured args.
- Reject command strings requiring shell parsing, even if policy already denies them, as defense in depth.
- Always enforce `timeoutMs`; no command may run without a bounded timeout.
- Kill timed-out child processes and return a structured timeout result or `SpriteError`.
- Return raw stdout/stderr only to the tool wrapper; the tool wrapper should bound output using `summarizeToolOutput()`.
- Never write stdout/stderr/env/raw command output into runtime event payloads.
- Avoid adding third-party dependencies.

Runtime/tool integration must:

- Classify before executing a command.
- Emit the policy decision event before execution.
- Execute `allow`.
- Execute `modify` only by using `decision.modifiedRequest` when it is a command request with a bounded timeout.
- Do not execute `deny` or `require_approval`; return a structured non-execution result/error and leave approval creation for Story 2.6.
- Preserve existing tool lifecycle event ordering for non-command tools.

### Architecture Compliance

- `packages/sandbox` owns command execution boundary and policy-related safety checks.
- `packages/tools` owns the `run_command` tool wrapper and registry integration.
- `packages/core` owns runtime state, policy-event emission, command/tool lifecycle events, and structured observations.
- CLI/TUI/RPC must not receive adapter-local command execution logic.
- No direct shell command execution should be added to `packages/cli`, `packages/tui`, or `packages/rpc`.
- No approval service, approval prompt, or approval response API should be introduced in this story.
- No configured validation runner should be introduced in this story.

### Security and Redaction Requirements

- Repository content and model/tool suggestions are untrusted.
- Runtime/system policy wins over repository instructions.
- Command requests with raw stdout, stderr, env values, repository instructions, or other unsafe metadata must not create unsafe runtime events.
- Runtime events should include metadata such as command summary, cwd, exit code, timeout, status, duration, and output reference, but not raw stdout/stderr/env values.
- Spawn errors may include OS messages, but summaries/events must not echo secret-looking command output or environment values.
- Environment exposure should be summarized as `"none"` or `"custom"`; custom env should not execute before Story 2.6 approval support unless a narrow approved path already exists.

### Testing Requirements

Minimum coverage:

- `SandboxRunner` succeeds for a low-risk command inside a temp project, such as `pwd` or an equivalent cross-platform Node-safe command.
- `SandboxRunner` rejects cwd outside the project boundary and symlink escapes.
- `SandboxRunner` returns structured timeout behavior for a long-running child process.
- `SandboxRunner` returns structured non-zero exit behavior without crashing the test process.
- `run_command` validates malformed input and returns `TOOL_INVALID_INPUT` or a similarly stable code.
- `AgentRuntime.executeToolCall({ toolName: "run_command", ... })` records `policy.decision.recorded` before tool execution.
- Denied and approval-required policy decisions do not spawn a child process.
- Failed/timed-out/sandbox-violation command paths emit tool or command failure events without raw stdout/stderr/env.
- Existing tests for `apply_patch`, file activity, policy classification, runtime events, and CLI smoke continue to pass.

### Latest Technical Information

No external dependency research is required for this story. Use the repository's current stack and avoid adding dependencies:

- Node.js standard library child process APIs.
- TypeScript `5.9.2` from `package.json`.
- Vitest `3.2.4` from `package.json`.
- Existing `Result`, `ok`, `err`, and `SpriteError` primitives from `@sprite/shared`.
- Existing `summarizeToolOutput()` inside `packages/tools` for the `run_command` wrapper. Do not import it from `packages/sandbox`.

### Git Intelligence

Recent relevant commits:

- `719a069 fix: address policy classifier review findings`
- `e8bb502 feat: add policy risk classification`
- `ac9867d feat: add patch-based file edits`
- `119ce3e feat: track runtime file activity`
- `aa9e206 feat: add safe repository inspection tools`

Actionable patterns:

- Add failing tests first for sandbox runner, runtime command events, and non-execution of denied/approval-required commands.
- Keep command output out of runtime events, using `outputReference`/summaries instead.
- Follow existing package export and TypeScript project reference patterns.
- Use temp project directories in tests and clean them in `afterEach`.

### Project Context Reference

No `project-context.md` or UX design file was found. Use these source artifacts:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md`
- Existing source files under `packages/` and tests under `tests/`

### References

- Story 2.5 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.5)
- PRD sandbox protocol: `_bmad-output/planning-artifacts/prd.md` (Sandbox and Approval Protocol)
- PRD MVP scope: `_bmad-output/planning-artifacts/prd.md` (MVP Scope)
- PRD NFR7-NFR8: `_bmad-output/planning-artifacts/prd.md` (Security and Privacy)
- PRD NFR17-NFR18: `_bmad-output/planning-artifacts/prd.md` (Reliability and Recovery)
- PRD NFR23-NFR24: `_bmad-output/planning-artifacts/prd.md` (Observability and Auditability)
- Architecture module boundaries: `_bmad-output/planning-artifacts/architecture.md` (Module Boundary Rules)
- Architecture runtime event format: `_bmad-output/planning-artifacts/architecture.md` (Runtime Event Format)
- Architecture sandbox boundaries: `_bmad-output/planning-artifacts/architecture.md` (Component Boundaries; Service Boundaries)
- Previous story: `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- 2026-04-25T12:56:54+0700 - Story 2.5 moved to in-progress; GitNexus impacts checked before symbol edits (`ToolRegistry` LOW, `AgentRuntime` CRITICAL, `validateRuntimeEvent` LOW, `createFinalTaskSummary` LOW, `deriveFileActivityDrafts` LOW).
- 2026-04-25T13:07:29+0700 - Initial Story 2.5 targeted tests failed as expected before implementation (`runSandboxCommand` and `run_command` unavailable; runtime schema rejected command lifecycle metadata).
- 2026-04-25T13:10:43+0700 - Targeted validation passed: `rtk npm test -- tests/sandbox-runner.test.ts tests/tool-registry.test.ts tests/runtime-events.test.ts` (46 tests).
- 2026-04-25T13:16:40+0700 - Full regression validation passed after implementation and review fix: `rtk npm test` (95 tests).
- 2026-04-25T13:10:53+0700 - `gitnexus_detect_changes(scope: all)` completed; GitNexus reported critical risk due expected runtime/tool lifecycle blast radius around `AgentRuntime.executeToolCall`, runtime event validation, and `ToolRegistry`.
- 2026-04-25T13:14:25+0700 - Final DoD validation passed: `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, and targeted `rtk npm exec prettier -- --check ...`.
- 2026-04-25T13:17:12+0700 - Code review patch completed: added SIGKILL fallback for timeout paths and regression coverage for commands that ignore SIGTERM.

### Implementation Plan

- Add a sandbox-owned `SandboxRunner` that executes structured command/args with `shell: false`, cwd realpath boundary enforcement, timeout termination, and PATH-only inherited environment.
- Add a tools-owned `run_command` wrapper that validates untrusted input, delegates to `SandboxRunner`, bounds returned output with `summarizeToolOutput()`, and maps command failures to stable `SpriteError` codes.
- Add runtime policy gating before command execution so only `allow` and safe `modify` decisions execute; `deny` and `require_approval` return structured non-execution errors after recording policy events.
- Extend runtime event schemas with command metadata while keeping stdout, stderr, env values, and output bodies out of event payloads.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented sandboxed command execution through `packages/sandbox`, `packages/tools`, and `AgentRuntime` without adding adapter-local shell execution.
- Added metadata-only command audit support for policy decisions, tool lifecycle events, success, non-zero exit, timeout, and sandbox violation paths.
- Added deterministic sandbox runner, tool registry, and runtime integration tests; existing repository tool and `apply_patch` event behavior remains covered.
- Updated README to describe `run_command`, `SandboxRunner`, metadata limits, and remaining Story 2.6/2.7/future-work boundaries.
- Addressed code review timeout termination finding and revalidated the full suite.

### File List

- README.md
- package-lock.json
- packages/core/src/agent-runtime.ts
- packages/core/src/file-activity.ts
- packages/core/src/runtime-events.ts
- packages/sandbox/src/index.ts
- packages/sandbox/src/sandbox-runner.ts
- packages/tools/package.json
- packages/tools/src/index.ts
- packages/tools/src/run-command.ts
- packages/tools/src/tool-registry.ts
- packages/tools/tsconfig.json
- tests/runtime-events.test.ts
- tests/sandbox-runner.test.ts
- tests/tool-registry.test.ts
- \_bmad-output/implementation-artifacts/2-5-execute-commands-through-the-sandbox-runner.md
- \_bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-04-25: Added sandbox command runner, `run_command` tool integration, runtime policy-gated execution, command audit metadata, tests, and README updates for Story 2.5.
- 2026-04-25: Addressed code review timeout termination finding and moved Story 2.5 to done.
