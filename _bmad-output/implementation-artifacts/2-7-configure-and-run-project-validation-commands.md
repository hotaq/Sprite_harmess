# Story 2.7: Configure and Run Project Validation Commands

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to run configured validation commands,
so that edits can be checked by tests, typecheck, lint, or build steps.

## Acceptance Criteria

1. Given project configuration defines validation commands, when the agent reaches a validation step, then the runtime requests the configured command through policy and sandbox and records validation started/completed events.
2. Given no validation command is configured, when the task reaches finalization, then the final summary states that no relevant validation was available and the learning/audit record preserves that validation was skipped for a known reason.

## Tasks / Subtasks

- [x] Add validation command configuration contracts (AC: 1, 2)
  - [x] Extend `.sprite/config.json` schema with structured `validation.commands`.
  - [x] Keep validation commands shell-free: command plus args array, optional cwd, timeout, and display name.
  - [x] Resolve validation commands through existing global/project config precedence.
  - [x] Expose resolved validation commands on startup/runtime state without secret-bearing fields.
- [x] Add validation runtime events (AC: 1, 2)
  - [x] Add `validation.started` and `validation.completed` to `packages/core/src/runtime-events.ts`.
  - [x] Validate event payloads with the existing `Result<SpriteError>` event pattern.
  - [x] Keep validation events metadata-only: no stdout, stderr, raw command output, env values, or secret-like metadata.
  - [x] Support explicit skipped validation status for the no-config case.
- [x] Run configured validation through policy and sandbox (AC: 1)
  - [x] Add an `AgentRuntime` validation orchestration API for the current active task.
  - [x] For each configured command, emit `validation.started`, then request a `run_command` tool call with `configuredValidation: true`.
  - [x] Preserve existing policy, approval, sandbox, and tool lifecycle event ordering.
  - [x] Emit `validation.completed` with passed, failed, or blocked status based on the sandbox/policy result.
  - [x] Stop running later validation commands after the first failed or approval-blocked validation result; recovery belongs to Story 2.8.
- [x] Update final summary behavior (AC: 2)
  - [x] If no validation command is configured and validation is requested, emit a skipped validation audit event.
  - [x] Ensure `createFinalTaskSummary()` reports that no relevant validation was available only when validation was skipped or never attempted.
  - [x] Avoid claiming validation ran when no `validation.started`/`validation.completed` events exist.
- [x] Update tests and docs (AC: 1, 2)
  - [x] Add config parser and precedence tests for validation commands.
  - [x] Add runtime event validation tests for validation events and raw output rejection.
  - [x] Add `AgentRuntime` tests for configured validation pass, no-config skip, and failed/blocked outcomes where practical.
  - [x] Update README to describe validation command configuration and current limitations.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and Prettier check for touched files.

## Dev Notes

### Story Intent

Story 2.7 turns the validation placeholder from previous stories into a runtime-owned validation step. The implementation should add a structured configuration surface for validation commands and a runtime API that runs those commands through the existing policy and sandbox path.

Implement this slice:

- Structured validation command configuration in `.sprite/config.json`.
- Runtime validation lifecycle events.
- Runtime orchestration that marks configured validation commands as `configuredValidation: true` and executes them through the existing `run_command` tool path.
- A skipped validation audit trail when no validation command is configured.
- Final summary wording that reflects validation pass/fail/skip truthfully.

Do not implement in this story:

- Automatic provider-driven decisions about when to validate if the current provider loop cannot reach that phase yet.
- Recovery planning or iterative fixes after failed validation. That is Story 2.8.
- TUI/RPC-specific validation controls beyond the shared runtime API. Those belong to later adapter stories.
- Shell string parsing for arbitrary validation commands. Keep the contract structured to preserve sandbox guarantees.

### Source Requirements

- Story 2.7 requires configured validation commands to run when the agent reaches a validation step and to record validation started/completed events. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.7]
- Story 2.7 requires the final summary and audit record to explain when no validation command is configured. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.7]
- PRD FR19 requires the agent to run project validation commands when available. [Source: `_bmad-output/planning-artifacts/prd.md` Tools and Repository Work]
- PRD FR87 requires users to configure validation commands for a project. [Source: `_bmad-output/planning-artifacts/prd.md` Configuration and Packaging]
- Architecture names validation events `validation.started` and `validation.completed`. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Event Schema Decision]
- Architecture requires validation failures to be recorded with command, cwd, summarized output, and suggested next step. [Source: `_bmad-output/planning-artifacts/architecture.md` Error Handling Patterns]
- Architecture requires runtime state to be canonical in core and adapters to derive rendering state from events. [Source: `_bmad-output/planning-artifacts/architecture.md` State Management Patterns]

### Previous Story Intelligence

Story 2.6 established the approval-gated command execution path that validation must reuse:

- `AgentRuntime.executeToolCall()` blocks additional tool calls while approval is pending.
- `run_command` policy requests support `configuredValidation?: boolean`.
- Policy decisions emit `policy.decision.recorded` before tool execution or approval.
- Approval-required commands emit `approval.requested` and set the task waiting state to `approval-required`.
- Approval denial/timeout returns structured `SpriteError` observations.
- File/edit and approval events must remain metadata-only.

Story 2.5 established command sandbox execution:

- `packages/tools/src/run-command.ts` executes `run_command` through `SandboxRunner`.
- Command results already summarize stdout/stderr via output references and avoid raw output in runtime events.
- Command failure metadata is available through `getRunCommandErrorMetadata()`.

Story 2.4 established policy support for configured validation:

- `CommandPolicyRequest.configuredValidation` exists and is parsed.
- Bounded configured package-manager validation commands are allowed.
- Configured validation commands with unsafe force/write arguments require approval.
- Current validation script allowlist includes check, lint, test, and typecheck; this story should include build because the story explicitly names build validation.

### Current Codebase State

Relevant files:

- `packages/config/src/config-schema.ts`: parses `.sprite/config.json` startup configuration.
- `packages/config/src/config-loader.ts`: resolves global/project config files and startup state.
- `packages/config/src/precedence.ts`: merges global and project config.
- `packages/core/src/agent-runtime.ts`: active task state, event emission, policy checked tool execution, approval handling, and final task result APIs.
- `packages/core/src/runtime-events.ts`: canonical runtime event types and validators.
- `packages/core/src/final-task-summary.ts`: final summary derivation from task state and event history.
- `packages/sandbox/src/policy-engine.ts`: command policy classification, including configured validation handling.
- `packages/tools/src/run-command.ts`: sandbox command execution and summarized command output.
- `tests/config-loader.test.ts`, `tests/policy-engine.test.ts`, `tests/runtime-events.test.ts`, and `tests/runtime-loop.test.ts`: current regression coverage.

No `project-context.md` or UX design file was found during story creation.

### Suggested Contracts

Keep final names aligned with owning packages, but preserve this shape:

```ts
export interface SpriteValidationCommand {
  name?: string;
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface SpriteConfig {
  validation?: {
    commands?: SpriteValidationCommand[];
  };
}
```

Runtime validation result summary should be metadata-only:

```ts
export interface RuntimeValidationCommandResult {
  validationId: string;
  name?: string;
  command: string;
  cwd: string;
  status: "passed" | "failed" | "blocked";
  exitCode?: number | null;
  errorCode?: string;
  outputReference?: RuntimeEventOutputReference;
}

export interface RuntimeValidationRunSummary {
  status: "passed" | "failed" | "blocked" | "skipped";
  reason?: string;
  results: RuntimeValidationCommandResult[];
}
```

Validation events should include:

- `validationId`
- `status`
- `summary`
- `command` summary when a command exists
- `cwd`
- `timeoutMs`
- `toolCallId` when a command tool call exists
- `exitCode`, `durationMs`, `errorCode`, `message`, and `outputReference` when available

Validation events must not include:

- stdout or stderr bodies
- raw command output
- environment variable values
- secret-looking values
- unstructured shell command strings that bypass command/args separation

### Runtime Behavior Requirements

- Validation command execution must use the same policy and sandbox path as other `run_command` calls.
- Validation commands must set `configuredValidation: true` before policy classification.
- `validation.started` must be emitted before the corresponding validation command is requested.
- `validation.completed` must be emitted after command pass/fail, policy denial, or approval-required blocking is known.
- A skipped `validation.completed` event is enough for the no-config audit record; do not emit `validation.started` when no command exists.
- A failed or blocked validation stops the validation sequence; Story 2.8 owns recovery/retry behavior.
- Validation events should not mark the task terminal by themselves.

### Testing Requirements

- Config tests must prove project config overrides global validation commands and malformed command shapes create config warnings.
- Runtime event tests must prove validation event validation accepts metadata-only payloads and rejects raw output fields.
- Runtime integration tests must prove configured validation emits validation events and tool/policy events in order.
- No-config tests must prove skipped validation is visible in both event history and final summary.
- Failure/blocking tests should use existing command/policy behavior rather than introducing a new sandbox path.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-04-26: Ran GitNexus impact for `AgentRuntime` and `RuntimeEventPayloadMap` before core runtime/event edits.
- 2026-04-26: Targeted verification passed: `rtk npm test -- tests/config-loader.test.ts tests/policy-engine.test.ts tests/runtime-events.test.ts tests/runtime-loop.test.ts` (72 tests).
- 2026-04-26: Full verification passed: `rtk npm run build && rtk npm run typecheck && rtk npm run lint && rtk npm test` (110 tests).

### Completion Notes

- Added structured `validation.commands` config with global/project precedence and startup exposure.
- Added metadata-only `validation.started` and `validation.completed` runtime events with schema validation and skipped/pass/fail/block statuses.
- Added `AgentRuntime.runConfiguredValidationCommands()` to run configured commands through existing policy, approval, sandbox, and tool lifecycle paths.
- Updated final summaries so skipped/no-attempted validation is reported truthfully and failed/blocked validation appears as unresolved risk.
- Documented validation command configuration in README and covered config, policy, event, runtime pass, skip, and failure behavior with tests.
- BMAD review is complete; recovery from failed validation remains Story 2.8 by design.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-7-configure-and-run-project-validation-commands.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/config/src/config-loader.ts`
- `packages/config/src/config-schema.ts`
- `packages/config/src/precedence.ts`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/runtime-events.ts`
- `packages/sandbox/src/policy-engine.ts`
- `tests/config-loader.test.ts`
- `tests/policy-engine.test.ts`
- `tests/runtime-events.test.ts`

## Change Log

| Date       | Version | Description                                     | Author |
| ---------- | ------- | ----------------------------------------------- | ------ |
| 2026-04-26 | 1.1     | Marked BMAD review complete.                    | Codex  |
| 2026-04-26 | 1.0     | Implemented configured validation command flow. | Codex  |
| 2026-04-26 | 0.1     | Created Story 2.7 implementation context.       | Codex  |

## QA Results

- 2026-04-26 BMAD code review complete for configured validation command flow.
- Verification passed: build, typecheck, lint, targeted tests, and full test suite.
