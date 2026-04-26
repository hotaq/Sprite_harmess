# Story 2.8: Recover from Failed Validation or Denied Actions

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the agent to recover from failed validation, denied commands, and sandbox violations,
so that it remains useful under safety constraints.

## Acceptance Criteria

1. Given validation fails, when the runtime returns failure output to the agent loop, then the agent updates its plan, proposes a follow-up action, or asks for user input, and the failed validation output is summarized when large.
2. Given a command is denied or violates sandbox policy, when the agent observes the denial or violation, then it either chooses a safer alternative, asks for clarification, or stops with a clear explanation, and the recovery path is recorded in task history.

## Tasks / Subtasks

- [x] Add a metadata-only recovery event and runtime contract (AC: 1, 2)
  - [x] Extend `packages/core/src/runtime-events.ts` with a `task.recovery.recorded` event type and validator.
  - [x] Model recovery triggers for validation failed/blocked, policy denial, approval denial/timeout, command failure/timeout, and sandbox violation.
  - [x] Model recovery decisions as a bounded enum such as `retry_with_fix`, `choose_safer_alternative`, `ask_user`, and `stop`.
  - [x] Reject raw stdout, stderr, command output, environment values, repository instructions, and secret-looking values in recovery event payloads.
- [x] Add `AgentRuntime` recovery recording APIs (AC: 1, 2)
  - [x] Add a runtime method that records a recovery path for the active task and refreshes task history.
  - [x] Allow the agent loop/adapters to record the chosen recovery decision without bypassing policy or approval gates.
  - [x] For `ask_user`, move the task into `waiting-for-input` with `user-input-required` using existing task waiting semantics.
  - [x] Preserve existing approval-required blocking behavior; do not execute a follow-up tool while approval is pending.
- [x] Connect validation failures and blocked validation to recovery observations (AC: 1)
  - [x] When configured validation returns `failed`, expose summarized output references and a follow-up action in the recovery record.
  - [x] When configured validation returns `blocked`, record that approval/policy handling is required rather than claiming validation completed.
  - [x] Keep large validation output summarized through existing `ToolOutputSummary.reference`; do not copy raw stdout/stderr into runtime events.
- [x] Connect denied/sandbox/failed command paths to recovery observations (AC: 2)
  - [x] Record a recovery path after `COMMAND_DENIED_BY_POLICY`, `FILE_EDIT_DENIED_BY_POLICY`, approval denial, approval timeout, command failure, command timeout, and sandbox violation results.
  - [x] Ensure denied or unsafe requests still do not emit tool started/completed events and do not mutate files.
  - [x] Include machine-readable fields (`errorCode`, `toolCallId`, `ruleId` or source event ID when available) so audit readers can trace the recovery path.
- [x] Update final summaries, docs, and tests (AC: 1, 2)
  - [x] Include recovery events in final summary important events without exposing raw output.
  - [x] Update unresolved-risk wording so a recorded recovery path is visible but does not falsely mark failed validation as passed.
  - [x] Add runtime event validator tests for valid and forbidden recovery payloads.
  - [x] Add runtime integration tests for failed validation recovery, policy-denied command recovery, approval-denied recovery, and ask-user recovery state.
  - [x] Update README to document recovery behavior and current adapter/provider-loop limitations.
  - [x] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, and targeted Prettier check for touched files.

## Dev Notes

### Story Intent

Story 2.8 turns the failure/denial outcomes from Stories 2.5, 2.6, and 2.7 into an explicit recovery trail. The current runtime already returns structured errors and events for command failures, approval denial/timeout, policy denial, and validation failure. This story should add the missing runtime-owned way to record what the agent decides next: retry with a fix, choose a safer alternative, ask the user, or stop clearly.

Implement this slice:

- A schema-validated recovery event in task history.
- Runtime APIs for recording recovery decisions after validation failure, denial, or sandbox/tool failure.
- Recovery metadata that links back to validation/tool/policy/approval events without exposing raw command output or secrets.
- Final summary/test/docs updates showing recovery happened while preserving failed/blocked validation risk.

Do not implement in this story:

- Autonomous model/provider planning if the provider loop cannot yet consume events and call recovery APIs directly.
- TUI/RPC-specific recovery UIs. Later adapter stories own those surfaces; this story should expose shared runtime primitives.
- Durable session persistence beyond current task history/event storage. Epic 3 owns session persistence.
- Secret/memory exclusion policy changes. Story 2.9 owns configurable safety and memory rules.
- Automatic execution of a safer follow-up command without passing through the existing policy and sandbox path.

### Source Requirements

- Story 2.8 requires the agent to recover from failed validation, denied commands, and sandbox violations. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.8]
- Failed validation must lead to an updated plan, follow-up action, or user input request, with large output summarized. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.8]
- Denied commands and sandbox violations must lead to a safer alternative, clarification request, or clear stop explanation, with the recovery path recorded in task history. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.8]
- PRD FR20 requires the agent to respond to failed validation by updating its plan or asking for user input. [Source: `_bmad-output/planning-artifacts/prd.md` Tools and Repository Work]
- PRD FR26 requires recovery from denied commands, failed commands, or sandbox violations. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD Journey 5 requires denial/failure to become part of the agent observation and the agent to recover with a safer command, clarification, or clear stop. [Source: `_bmad-output/planning-artifacts/prd.md` Journey 5]
- Architecture requires structured errors with `code`, `message`, `subsystem`, `recoverable`, `correlationId`, and optional `nextAction`; validation failures and sandbox violations must not crash the runtime loop by default. [Source: `_bmad-output/planning-artifacts/architecture.md` Error Handling Decision]
- Runtime events are append-only, schema-validated, and metadata-only at process/persistence boundaries. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Event Schema Decision]

### Previous Story Intelligence

Story 2.7 established validation execution and its current recovery gap:

- `AgentRuntime.runConfiguredValidationCommands()` emits `validation.started` and `validation.completed`.
- Validation command results use `status: "passed" | "failed" | "blocked" | "skipped"`.
- Failed or blocked validation stops the validation sequence and returns a structured `RuntimeValidationRunSummary`.
- Validation output is already summarized via `ToolOutputSummary.reference`; runtime validation events must not contain raw stdout/stderr.
- Final summaries already list failed/blocked validation as unresolved risk. Story 2.8 must add recovery path visibility without pretending validation passed.

Story 2.6 established approval and denial behavior:

- `AgentRuntime.executeToolCall()` blocks new tool execution while approval is pending.
- `respondToApproval()` returns structured `SpriteError` results for denial and timeout.
- Pending approval state is cleared after deny/timeout so recovery can ask the user, stop, or choose a safer path.
- File-edit approvals use the official modified `apply_patch` tool-call contract; do not revive `modifiedRequest` for file edits.
- Denied broad/risky edits do not apply and denied/risky commands do not execute.

Story 2.5 established command failure behavior:

- `packages/tools/src/run-command.ts` returns `RunCommandError` metadata for failed and timed-out commands.
- Tool lifecycle failure events include `errorCode`, `message`, and bounded command output references where available.
- Failed command results must remain structured observations rather than thrown runtime crashes.

### Current Codebase State

Relevant files:

- `packages/core/src/agent-runtime.ts`: active task state, `executeToolCall()`, `runConfiguredValidationCommands()`, `respondToApproval()`, policy-checked tool execution, waiting state, final result APIs, and runtime event emission.
- `packages/core/src/runtime-events.ts`: canonical runtime event names, payload map, validators, event bus, and metadata-only field rejection helpers.
- `packages/core/src/task-state.ts`: task status, terminal state, waiting state, event history, and file activity state.
- `packages/core/src/final-task-summary.ts`: derives final summary important events, unresolved risks, and not-attempted notes from task state/events.
- `packages/sandbox/src/policy-engine.ts`: returns `allow`, `deny`, `modify`, or `require_approval` decisions and policy metadata.
- `packages/tools/src/run-command.ts`: returns bounded command output summaries and `RunCommandError` metadata.
- `tests/runtime-events.test.ts`: primary integration coverage for validation, policy denial, approval denial/timeout/edit, command lifecycle, and event validation.
- `tests/runtime-loop.test.ts`: task waiting/final summary coverage.
- `tests/policy-engine.test.ts`: policy classification coverage.

No `project-context.md` or UX design artifact was found during story creation.

### Suggested Contracts

Keep final names aligned with owning packages, but preserve this behavior:

```ts
export type RuntimeRecoveryTrigger =
  | "validation_failed"
  | "validation_blocked"
  | "policy_denied"
  | "approval_denied"
  | "approval_timed_out"
  | "command_failed"
  | "command_timed_out"
  | "sandbox_violation";

export type RuntimeRecoveryDecision =
  | "retry_with_fix"
  | "choose_safer_alternative"
  | "ask_user"
  | "stop";

export interface RuntimeRecoveryActionRequest {
  trigger: RuntimeRecoveryTrigger;
  decision: RuntimeRecoveryDecision;
  summary: string;
  nextAction: string;
  errorCode?: string;
  message?: string;
  sourceEventId?: string;
  validationId?: string;
  toolCallId?: string;
  ruleId?: string;
}
```

Suggested event shape:

```ts
"task.recovery.recorded": {
  trigger: RuntimeRecoveryTrigger;
  decision: RuntimeRecoveryDecision;
  status: "recorded";
  summary: string;
  nextAction: string;
  errorCode?: string;
  message?: string;
  sourceEventId?: string;
  validationId?: string;
  toolCallId?: string;
  ruleId?: string;
}
```

Recovery event payloads must not include:

- stdout or stderr bodies
- raw command output
- raw environment variable values
- raw patch text, `oldText`, or `newText`
- repository instructions or prompt content
- secret-looking tokens or credentials

### Runtime Behavior Requirements

- Recovery recording must be append-only and schema validated through `validateRuntimeEvent()`.
- Recovery recording must refresh active task history so final summary and adapters can see the event immediately.
- A recovery record must link to the relevant validation/tool/policy/approval event when the source event ID is available.
- `ask_user` recovery should use existing `task.waiting`/`user-input-required` state; do not invent adapter-specific prompt state.
- `stop` recovery should be a clear explanation path; it must not hide the original failed/denied event.
- Follow-up tool execution must still call `executeToolCall()` and therefore go through policy, approval, sandbox, and tool lifecycle events.
- Recovery from failed validation must not re-run later configured validation commands automatically; Story 2.7 intentionally stopped after first failed/blocked validation.
- Final summary should show recovery path evidence while keeping unresolved risks for failed/blocked validation unless a later validation passes.

### Testing Requirements

Minimum coverage:

- `validateRuntimeEvent()` accepts valid `task.recovery.recorded` events for validation failure and policy denial.
- `validateRuntimeEvent()` rejects recovery events containing raw output, stdout/stderr, environment values, patch text, repository instructions, or secret-looking values.
- `AgentRuntime.recordRecoveryAction()` appends a recovery event and exposes it through active task history.
- `ask_user` recovery places the active task in `waiting-for-input` with `user-input-required`.
- Failed validation can be followed by a recovery record with summarized output reference/source event linkage and the final summary includes the recovery event.
- Policy-denied command/file-edit paths can be followed by recovery records and still do not emit tool started/completed events or mutate files.
- Approval deny and timeout can be followed by recovery records after pending approval is cleared.
- Full regression suite remains green.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-04-26: Created Story 2.8 context after Story 2.7 was marked done.
- 2026-04-26: Used `rtk omx explore` to map recovery-related runtime files and current gaps.
- 2026-04-26: GitNexus impact before runtime edits: `AgentRuntime` CRITICAL, `createFinalTaskSummary` HIGH, `validateRuntimeEvent` LOW.
- 2026-04-26: Targeted verification passed: `rtk npm test -- tests/runtime-events.test.ts tests/runtime-loop.test.ts` (61 tests).
- 2026-04-26: Full verification passed: `rtk npm run build && rtk npm run typecheck && rtk npm run lint && rtk npm test` (117 tests).
- 2026-04-26: Formatting/static checks passed: `rtk git diff --check` and targeted Prettier check.

### Completion Notes List

- Added schema-validated `task.recovery.recorded` runtime events with bounded recovery triggers and decisions.
- Added `AgentRuntime.recordRecoveryAction()` so the runtime can record recovery paths for validation failures, policy denials, approval denials/timeouts, command failures/timeouts, and sandbox violations.
- `ask_user` recovery now reuses existing `task.waiting` / `user-input-required` state, preserving adapter-neutral input handling.
- Final summaries include recovery event details while failed or blocked validation remains an unresolved risk until a later validation passes.
- Added regression coverage for recovery event validation, failed validation recovery, policy-denied command recovery, approval-denied ask-user recovery, and command-failure recovery.
- Documented recovery behavior and limitations in README.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-8-recover-from-failed-validation-or-denied-actions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/final-task-summary.ts`
- `packages/core/src/runtime-events.ts`
- `tests/runtime-events.test.ts`

## Change Log

| Date       | Version | Description                                 | Author |
| ---------- | ------- | ------------------------------------------- | ------ |
| 2026-04-26 | 1.0     | Implemented recovery event and runtime API. | Codex  |
| 2026-04-26 | 0.1     | Created Story 2.8 implementation context.   | Codex  |

## QA Results

Ready for BMAD code review. Implementation self-check passed build, typecheck, lint, targeted tests, full test suite, diff check, and targeted Prettier check.
