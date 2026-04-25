# Story 2.6: Approve, Deny, or Modify Risky Actions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to approve, deny, or modify risky command and edit requests,
so that I remain in control of destructive or broad actions.

## Acceptance Criteria

1. Given policy requires approval for a command or file edit, when the approval request is created, then it includes action type, command or patch summary, cwd, affected files when known, risk level, reason, environment exposure, timeout, allowed actions, and correlation ID.
2. Given the user approves, denies, modifies, or times out an approval, when the runtime receives the decision, then it records the decision in task history and denial or timeout returns to the agent loop as a structured observation.

## Tasks / Subtasks

- [x] Add shared approval request and response contracts (AC: 1, 2)
  - [x] Define an `ApprovalRequest` model with request ID, request type, summary, cwd, affected files, risk level, reason, rule ID, environment exposure, timeout, allowed actions, task ID, tool call ID when available, and correlation ID.
  - [x] Generate stable approval IDs with the `appr_` prefix.
  - [x] Define approval response types for allow, deny, edit, timeout, and session-scoped allow if implemented in this slice.
  - [x] Keep approval request/event contracts metadata-only. Do not include raw patch bodies, `oldText`, `newText`, stdout, stderr, raw env values, repository instructions, or secret-looking values in emitted approval metadata; modified file-edit responses carry a bounded `apply_patch` tool call so the approved edit can be applied.
- [x] Add approval runtime events and validation (AC: 1, 2)
  - [x] Add `approval.requested` and `approval.resolved` to `packages/core/src/runtime-events.ts`.
  - [x] Validate approval event payloads with the same strict `Result<SpriteError>` pattern used by existing runtime events.
  - [x] Ensure approval events preserve base event fields: schema version, event ID, session ID, task ID, correlation ID, type, and UTC timestamp.
  - [x] Reject approval event payloads that include unsafe raw metadata fields.
- [x] Wire risky command approval through `AgentRuntime` (AC: 1, 2)
  - [x] When `run_command` policy returns `require_approval`, create and emit an approval request instead of returning only `COMMAND_REQUIRES_APPROVAL`.
  - [x] Keep denied commands non-executable and return a structured observation.
  - [x] On approval allow, execute the original command through `run_command` and `SandboxRunner`; preserve `policy.decision.recorded` before approval/tool execution.
  - [x] On approval edit, create a new auditable command intent, re-classify the modified request, and execute only if policy allows it or safely modifies it.
  - [x] On approval timeout, default to deny and return a structured observation.
- [x] Gate broad or risky `apply_patch` file edits through approval (AC: 1, 2)
  - [x] Derive a `FileEditPolicyRequest` from `apply_patch` metadata before applying edits.
  - [x] Allow low-risk targeted patch metadata to keep the existing `apply_patch` event ordering.
  - [x] For policy `require_approval`, emit an approval request and do not apply the patch until the approval is resolved.
  - [x] For policy `deny`, do not apply the patch and return a structured observation.
  - [x] On approval edit, create a new auditable file-edit intent and re-classify the modified request before applying it.
- [x] Record approval outcomes in task history (AC: 2)
  - [x] Emit `approval.resolved` for allow, deny, edit, timeout, and any session-scoped allow outcome implemented.
  - [x] Ensure denial and timeout observations have stable error codes and are visible to the agent loop.
  - [x] Preserve active task history and event bus clone semantics.
  - [x] Ensure unresolved approval state is represented as `task.waiting` with reason `approval-required` where the current runtime state model supports it.
- [x] Update tests and docs (AC: 1, 2)
  - [x] Add runtime event validation tests for `approval.requested` and `approval.resolved`.
  - [x] Add `AgentRuntime.executeToolCall()` tests for approval-required command requests, denied commands, allowed approval execution, edited approval re-classification, and timeout-as-deny.
  - [x] Add `apply_patch` tests proving broad/risky edits do not apply without approval while safe targeted patches still work.
  - [x] Add redaction tests proving approval events reject or omit raw patch bodies, stdout, stderr, raw env values, and secret-looking metadata.
  - [x] Update README or architecture-facing docs only where current limitations change.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and a targeted Prettier check for touched source, tests, docs, and story files.
  - [x] Run GitNexus impact before editing code symbols and `gitnexus_detect_changes()` before committing.

### Review Findings

- [x] [Review][Dismiss] Define the structured observation contract for denied/timed-out approvals — resolved by user decision: `Result.err(SpriteError)` is the intended structured observation shape for this slice.
- [x] [Review][Patch] Align file-edit approval edit contract with runtime behavior [packages/core/src/agent-runtime.ts:124] — resolved by user decision: make `modifiedToolCall` the official runtime/shared contract for file edit approvals, then update shared contract/docs/tests to match.
- [x] [Review][Patch] File-edit approval requests can omit the required timeout [packages/core/src/agent-runtime.ts:1240]
- [x] [Review][Patch] `respondToApproval()` accepts valid-but-not-offered actions such as `alwaysAllowForSession` and treats them as allow [packages/core/src/agent-runtime.ts:384]
- [x] [Review][Patch] Edited approval responses can switch request/tool type instead of staying within the approved request type [packages/core/src/agent-runtime.ts:450]
- [x] [Review][Patch] Pending approval lifecycle allows additional tool calls while waiting and leaves stale approvals after task transitions [packages/core/src/agent-runtime.ts:357]

## Dev Notes

### Story Intent

Story 2.6 turns policy `require_approval` decisions into real runtime approval requests and resolved approval outcomes. It covers risky command requests and broad or risky file edit requests.

Implement this slice:

- Runtime approval request creation for command and file-edit policy decisions.
- Approval resolution handling for allow, deny, edit, and timeout.
- Metadata-only approval events in task history.
- Structured non-execution observations for denial and timeout.
- Approval gating for broad or risky `apply_patch` requests.

Do not implement in this story:

- Configured validation command orchestration. That is Story 2.7.
- Denial/failure recovery loops. That is Story 2.8.
- Session persistence of pending approvals beyond the current runtime model. Durable sessions start in Epic 3.
- Full TUI or JSON-RPC approval response surfaces unless an existing adapter hook is already present and cheap to expose. Stories 6.3 and 7.5 own those richer adapter flows.
- Provider-driven automatic tool-calling if it is not already in the runtime loop.

### Source Requirements

- Story 2.6 requires users to approve, deny, or modify risky command and edit requests. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.6]
- Approval requests must include action type, command or patch summary, cwd, affected files when known, risk level, reason, environment exposure, timeout, allowed actions, and correlation ID. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.6]
- Approval decisions must be recorded in task history, and denial or timeout must return to the agent loop as a structured observation. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.6]
- PRD FR22 requires approve, deny, or modify risky command requests. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD FR23 requires approve, deny, or modify broad or risky file edit requests. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD FR25 requires approval, denial, timeout, and sandbox violation events in task history. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD NFR8 requires risky or destructive commands not to execute without explicit user or scoped RPC approval. [Source: `_bmad-output/planning-artifacts/prd.md` Security and Privacy]
- PRD NFR9 requires broad or risky file edits not to apply without explicit user or scoped RPC approval. [Source: `_bmad-output/planning-artifacts/prd.md` Security and Privacy]
- PRD NFR18 requires denied commands, failed commands, sandbox violations, and validation failures to return structured observations. [Source: `_bmad-output/planning-artifacts/prd.md` Reliability and Recovery]
- PRD NFR23 requires an inspectable audit trail containing approvals, tool calls, file changes, and final status. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- Architecture requires risky command execution and broad edits to go through the policy engine; approval timeout defaults to deny; approved commands still emit tool lifecycle events; edited approvals create a new auditable command/edit intent. [Source: `_bmad-output/planning-artifacts/architecture.md` Approval Patterns]
- Architecture names approval events `approval.requested` and `approval.resolved`. [Source: `_bmad-output/planning-artifacts/architecture.md` Event System Patterns]
- Architecture says approval actions use lowercase verbs: `allow`, `deny`, `edit`, `alwaysAllowForSession`. [Source: `_bmad-output/planning-artifacts/architecture.md` Code Naming Conventions]

### Previous Story Intelligence

Story 2.5 established the command execution path that Story 2.6 must extend:

- `packages/sandbox/src/sandbox-runner.ts` executes allowed commands through a sandbox boundary.
- `packages/tools/src/run-command.ts` exposes `run_command`.
- `AgentRuntime.executeToolCall()` classifies `run_command` requests before execution.
- Policy `deny` currently returns `COMMAND_DENIED_BY_POLICY`.
- Policy `require_approval` currently returns `COMMAND_REQUIRES_APPROVAL` and does not execute.
- `apply_patch` remains ungated by approval and must be covered in this story.
- Runtime events are metadata-only and must not include raw stdout, stderr, env values, raw patch text, repository instructions, or secret-like values.

Story 2.4 established the policy classification layer:

- `packages/sandbox/src/policy-engine.ts` exports `classifyPolicyRequest()`, `summarizePolicyRequestForEvent()`, `CommandPolicyRequest`, `FileEditPolicyRequest`, `PolicyDecision`, and related policy types.
- Command policy requests use `{ type: "command", command, args?, cwd, timeoutMs?, env?, configuredValidation? }`.
- File edit policy requests use `{ type: "file_edit", affectedFiles, editKind, summary? }`.
- Existing policy actions are `"allow"`, `"deny"`, `"modify"`, and `"require_approval"`.
- Broad or risky file edit rules already return `require_approval`; the runtime must now apply those decisions before executing `apply_patch`.

### Current Codebase State

Relevant files:

- `packages/sandbox/src/policy-engine.ts`: policy request parsing, command and file-edit classification, event metadata summarization, and raw metadata rejection.
- `packages/sandbox/src/sandbox-runner.ts`: command execution boundary used by `run_command`.
- `packages/tools/src/run-command.ts`: tool wrapper for command execution.
- `packages/tools/src/apply-patch.ts`: targeted patch implementation; currently validates and writes files after preparing edits.
- `packages/tools/src/tool-registry.ts`: central tool registry for `apply_patch`, `read_file`, `list_files`, `run_command`, and `search_files`.
- `packages/core/src/agent-runtime.ts`: active task state, policy decision event emission, tool lifecycle events, command policy gating, file edit event metadata, and tool execution.
- `packages/core/src/runtime-events.ts`: event type list, payload map, validation, clone behavior, and tool name allowlists.
- `packages/core/src/runtime-loop.ts`: task waiting state helpers, including `approval-required`.
- `tests/runtime-events.test.ts`: runtime event and `AgentRuntime.executeToolCall()` integration tests.
- `tests/policy-engine.test.ts`: policy classifier regression tests.
- `tests/tool-registry.test.ts`: tool registry behavior.

No `project-context.md` or UX design file was found during story creation.

### Suggested Contracts

Keep the final contract names aligned with the owning package, but the shape should preserve these fields:

```ts
export interface ApprovalRequest {
  affectedFiles?: string[];
  allowedActions: ApprovalAction[];
  approvalRequestId: string; // appr_*
  command?: string;
  cwd?: string;
  envExposure?: "custom" | "none";
  reason: string;
  requestType: "command" | "file_edit";
  riskLevel: "low" | "medium" | "high" | "critical";
  ruleId: string;
  summary: string;
  taskId: string;
  timeoutMs: number;
  toolCallId?: string;
  correlationId: string;
}

export type ApprovalAction =
  | "allow"
  | "deny"
  | "edit"
  | "alwaysAllowForSession";
```

Recommended approval response shape:

```ts
export type ApprovalResponse =
  | { action: "allow"; approvalRequestId: string }
  | { action: "deny"; approvalRequestId: string; reason?: string }
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedRequest: CommandPolicyRequest;
      reason?: string;
    }
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedToolCall: {
        toolName: "apply_patch";
        input: {
          edits: Array<{ path: string; oldText: string; newText: string }>;
          summary?: string;
        };
      };
      reason?: string;
    }
  | { action: "timeout"; approvalRequestId: string };
```

Command approval edits keep using `modifiedRequest`. File-edit approval edits use `modifiedToolCall` because runtime application happens through the `apply_patch` tool call, not through a `FileEditPolicyRequest` alone.

If `timeout` is implemented as a resolved status instead of a response action, keep the event and structured observation stable and explicit.

### Runtime Behavior Requirements

- Policy decisions must be emitted before approval requests.
- `approval.requested` must be emitted before any risky command executes or broad/risky file edit applies.
- `approval.resolved` must be emitted before the approved or edited tool execution continues.
- `deny` and `timeout` must not emit tool started/completed events for the denied request.
- `allow` must run through the existing tool path, not a special adapter bypass.
- `edit` must create a new auditable command or file-edit intent and go through policy classification again.
- If the edited request still requires approval, create a new approval request rather than executing it.
- Timeout defaults to deny.
- Approval state should use the existing `task.waiting` `approval-required` reason where possible.

### Event and Redaction Requirements

Approval event payloads may contain:

- `approvalRequestId`
- `requestType`
- `status`
- `summary`
- `command` summary
- `cwd`
- `affectedFiles`
- `riskLevel`
- `reason`
- `ruleId`
- `envExposure`
- `timeoutMs`
- `allowedActions`
- `decision`
- `toolCallId`

Approval event payloads must not contain:

- raw patch bodies
- `oldText` or `newText`
- stdout or stderr bodies
- raw environment variable values
- repository instructions or model prompt content
- secret-looking tokens or credentials

### Testing Requirements

Minimum coverage:

- `validateRuntimeEvent()` accepts valid `approval.requested` and `approval.resolved` events.
- `validateRuntimeEvent()` rejects approval events with raw metadata fields.
- Runtime command policy `require_approval` emits `policy.decision.recorded` followed by `approval.requested` and no tool execution.
- Runtime command approval allow emits `approval.resolved` and then executes through `run_command`.
- Runtime command approval deny and timeout return structured observations and do not execute.
- Runtime command approval edit re-classifies the modified command request and records a new auditable intent.
- Broad/risky `apply_patch` requests emit approval requests and do not write files before approval.
- Safe targeted `apply_patch` requests keep existing file edit event ordering.
- Approval event history survives event bus cloning and subscriber mutation attempts.
- Existing `run_command`, policy engine, file activity, and patch tests continue to pass.

### Git Intelligence

Recent relevant commits:

- `6ac142d feat: execute commands through sandbox runner`
- `719a069 fix: address policy classifier review findings`
- `e8bb502 feat: add policy risk classification`
- `ac9867d feat: add patch-based file edits`
- `119ce3e feat: track runtime file activity`

GitNexus may be stale after the Story 2.5 commit. Before editing code for this story, refresh the index if needed and run impact analysis for each modified symbol. Before committing implementation work, run `gitnexus_detect_changes()`.

## Change Log

| Date       | Version | Description                                                    | Author     |
| ---------- | ------- | -------------------------------------------------------------- | ---------- |
| 2026-04-26 | 1.1     | Addressed BMAD code review approval contract findings.         | Codex      |
| 2026-04-25 | 1.0     | Implemented runtime approval flow for commands and file edits. | Chinnaphat |
| 2026-04-25 | 0.1     | Initial ready-for-dev story draft for 2.6.                     | Chinnaphat |

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `rtk npm test -- tests/runtime-events.test.ts` red phase: 6 expected failures before approval implementation.
- `rtk npm test -- tests/runtime-events.test.ts`: 34 tests passed.
- `rtk npm run build`: passed.
- `rtk npm run typecheck`: passed.
- `rtk npm run lint`: passed.
- `rtk npm test`: 101 tests passed.
- `rtk npm exec prettier -- --check packages/sandbox/src/approval-service.ts packages/sandbox/src/index.ts packages/core/src/runtime-events.ts packages/core/src/agent-runtime.ts tests/runtime-events.test.ts README.md _bmad-output/implementation-artifacts/2-6-approve-deny-or-modify-risky-actions.md _bmad-output/implementation-artifacts/sprint-status.yaml`: passed.
- `rtk git diff --check`: passed.
- `rtk npm test -- tests/runtime-events.test.ts`: 37 tests passed after code review fixes.
- `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, and targeted Prettier check: passed after code review fixes.
- GitNexus impact: `AgentRuntime` CRITICAL blast radius; `validateRuntimeEvent` LOW; `waitForTaskInput` LOW.
- GitNexus detect changes: critical affected scope due shared `AgentRuntime` and runtime event contract changes.

### Completion Notes List

- Added shared approval request/response contracts in `@sprite/sandbox`, including `appr_` request IDs, allow/deny/edit/timeout response modeling, and metadata-only approval request fields.
- Added `approval.requested` and `approval.resolved` runtime events with strict validation and raw metadata rejection.
- Added pending approval tracking and `respondToApproval()` in `AgentRuntime`.
- Routed `run_command` `require_approval` decisions into pending approval requests, with allow/edit/deny/timeout resolution behavior and structured denial/timeout errors.
- Cleared active approval waiting state after approval resolution so a resolved deny/timeout does not leave stale `approval-required` task state.
- Added policy gating for `apply_patch` metadata before file writes; broad/risky edits wait for approval, denied edits do not apply, and safe targeted patches keep the existing tool/file edit lifecycle after the policy event.
- Updated README to document runtime/package approval behavior and remaining adapter limitations.
- Addressed BMAD code review findings: file-edit approvals now use an official modified `apply_patch` tool-call contract, approval requests always include a timeout, unsupported approval actions are rejected, edited approvals cannot switch request type, and pending approvals block further tool execution until resolved.

### File List

- README.md
- \_bmad-output/implementation-artifacts/2-6-approve-deny-or-modify-risky-actions.md
- \_bmad-output/implementation-artifacts/sprint-status.yaml
- packages/core/src/agent-runtime.ts
- packages/core/src/runtime-events.ts
- packages/sandbox/src/approval-service.ts
- packages/sandbox/src/index.ts
- tests/runtime-events.test.ts

## QA Results

- 2026-04-26 BMAD code review complete. Decision on denial/timeout observation shape resolved as intentional `Result.err(SpriteError)` behavior for this slice.
- All non-deferred patch findings were fixed and checked off in the Review Findings section.
- Verification passed: targeted runtime-events tests, full build, typecheck, lint, full test suite, `git diff --check`, and targeted Prettier check.
