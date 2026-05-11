# Story 6.3: Support Multiline Input, Steering, Cancellation, and Approval Responses

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to interact with the running agent from the TUI,
so that I can steer, cancel, or approve work without leaving the terminal workbench.

## Acceptance Criteria

1. Given the user enters multiline input, when the input is submitted, then the TUI creates a typed user intent and sends it to `AgentRuntime` as either a new task submission or steering input, and the runtime records the input through existing task/steering events rather than adapter-local state.
2. Given a task is running or waiting for steering, when the user submits follow-up input from the TUI, then the TUI calls the runtime steering path and the resulting state/events are rendered from runtime truth.
3. Given the runtime emits or exposes an approval request, when the user chooses allow, deny, edit, or timeout from the TUI, then the TUI sends a typed `RuntimeApprovalResponse` through `AgentRuntime.respondToApproval()` and never executes commands or applies file edits directly.
4. Given an approval edit targets a command request, when the user submits the edited approval, then the TUI sends a bounded command `modifiedRequest`; given an approval edit targets a file edit, then the TUI sends a bounded `modifiedToolCall` for `apply_patch` and does not use `modifiedRequest` for file edits.
5. Given a task is running, when the user cancels or interrupts from the TUI, then the TUI calls `AgentRuntime.cancelActiveTask()` and renders the resulting task state/events without inventing a separate TUI lifecycle.
6. Given the interaction surface is tested, then tests prove multiline input, steering, cancellation, approval allow/deny/edit/timeout, and visible UI labels work through a runtime-control port or real `AgentRuntime` fixture without a live provider, network, command execution bypass, raw patch display, or secret leakage.

## Tasks / Subtasks

- [x] Confirm implementation contract before code edits (AC: 1-6)
  - [x] Report the exact new or changed exports before modifying implementation. Expected candidates: `TuiUserIntent`, `TuiRuntimeControlPort`, `TuiInputDraft`, `createTuiInputDraft()`, `updateTuiInputDraft()`, `createTuiSubmitIntent()`, `createTuiCancelIntent()`, `createTuiApprovalResponseIntent()`, `dispatchTuiUserIntent()`, and a minimal renderable `TuiWorkbench`/interaction component if Ink is added.
  - [x] Run GitNexus impact analysis before editing existing exported symbols or runtime contracts, especially `AgentRuntime`, `RuntimeApprovalResponse`, `ApprovalResponse`, `respondToApproval()`, `steerActiveTask()`, `cancelActiveTask()`, `createTuiRuntimeState()`, `createTuiMessageStream()`, and package/CLI entry exports.
  - [x] Decide explicitly whether this story adds Ink/React and `ink-testing-library`. If added, scope them to `packages/tui`, update lockfile intentionally, and keep `packages/core` free of TUI/Ink imports.
  - [x] Treat slash commands, final-summary panels, learning-review panels, output collapse expansion, JSON-RPC approval responses, and provider-level request cancellation as out of scope.

- [x] Define typed TUI control intents (AC: 1-5)
  - [x] Add small pure `.ts` contracts in `packages/tui/src/index.ts` or adjacent `packages/tui/src/*` modules for `submit-task`, `steer-task`, `cancel-task`, and `approval-response`.
  - [x] Keep user text bounded and redacted with existing safe-string helpers before exposing it in UI/debug output.
  - [x] Model multiline drafts as text plus cursor/line metadata only if needed; do not create a separate task lifecycle state machine.
  - [x] Keep the intent layer transport-neutral so a later CLI entrypoint or Ink component can reuse it.

- [x] Wire intents through a runtime-control port (AC: 1-5)
  - [x] Define a minimal `TuiRuntimeControlPort` around existing runtime methods: `submitInteractiveTask()`, `steerActiveTask()`, `cancelActiveTask()`, `respondToApproval()`, `getActiveTask()`, and `getPendingApprovals()` as needed.
  - [x] Implement `dispatchTuiUserIntent()` so `submit-task` calls `submitInteractiveTask()`, `steer-task` calls `steerActiveTask()`, `cancel-task` calls `cancelActiveTask()`, and `approval-response` calls `respondToApproval()`.
  - [x] Ensure approval deny/timeout errors are returned as runtime results/observations, not swallowed as UI-only failures.
  - [x] Ensure pending approval state is read from runtime APIs/events, not from a separate UI-owned approval cache.

- [x] Add a minimal TUI interaction surface (AC: 1-6)
  - [x] Provide at least one testable renderable interaction surface in `packages/tui` that exposes multiline input affordance, submit/steer action, cancel action, and approval action labels.
  - [x] If using Ink, keep component state presentation-only: input draft, focus, selected approval action, and latest dispatch result are allowed; task truth remains derived from runtime events/state.
  - [x] Display non-color-only labels such as `SUBMIT`, `STEER`, `CANCEL`, `APPROVE`, `DENY`, `EDIT`, `TIMEOUT`, `PENDING`, and `ERROR`.
  - [x] Do not display raw command output, raw patches, raw env values, snippets, credentials, or full unbounded user input in the UI.
  - [x] If a live CLI command is added, make it a thin adapter that constructs runtime + TUI component only; do not duplicate runtime logic in Commander handlers.

- [x] Implement approval-response helpers safely (AC: 3, 4, 6)
  - [x] Render approval requests from safe metadata already available in `ApprovalRequest`/`approval.requested` events: request type, risk, reason, summary, allowed actions, timeout, affected files, and tool/correlation IDs.
  - [x] For command approval edits, map user edits to `RuntimeApprovalResponse` with `modifiedRequest: CommandPolicyRequest`.
  - [x] For file-edit approval edits, map user edits to `RuntimeApprovalResponse` with `modifiedToolCall: { toolName: "apply_patch", input: { edits, summary? } }`.
  - [x] Do not put raw patch bodies into runtime events or stream metadata. Edited patch bodies may exist only in the bounded approval response sent to runtime.
  - [x] Ensure timeout action maps to `{ action: "timeout", approvalRequestId }` and lets runtime default-deny.

- [x] Add red tests first, then implementation tests (AC: 1-6)
  - [x] Add `tests/tui-control-intents.test.ts` or equivalent focused tests for multiline draft submission, steering dispatch, cancellation dispatch, and approval response dispatch.
  - [x] Add runtime-fixture tests proving `dispatchTuiUserIntent()` records `task.steering.received`, `task.cancelled`, `approval.resolved`, and pending approval cleanup through runtime APIs.
  - [x] Add renderer tests with `ink-testing-library` only if Ink is added; otherwise use pure formatter/control tests and clearly record why live renderer is deferred.
  - [x] Add regression tests proving file-edit approval edit uses `modifiedToolCall`, not `modifiedRequest`.
  - [x] Add safety tests proving UI-visible strings redact secret-looking multiline input, command text, approval reasons, and path labels where applicable.

- [x] Validate and update story status (AC: 1-6)
  - [x] Run targeted TUI control/renderer tests first.
  - [x] Run `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [x] Run GitNexus analyze/status before commit: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [x] Move status to `in-progress` when development starts, `review` after implementation validation passes, and `done` only after review fixes pass.

## Dev Notes

### Story Intent

Story 6.3 is the first Epic 6 slice that must support user interaction, not only read-model display. Story 6.1 created startup/runtime state display contracts, and Story 6.2 created message-stream display contracts. This story adds the control path: multiline input, steering, cancellation, and approval responses must flow into the shared runtime.

The key design rule is adapter thinness. The TUI may collect draft input and selected approval actions, but `AgentRuntime` remains the owner of task submission, steering, cancellation, approval resolution, pending approvals, task state, and runtime events.

### Source Requirements

- Story 6.3 requires the TUI to support multiline input, steering, cancellation, and approval responses during an active task. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.3]
- UX-DR3 requires minimal TUI multiline input plus user steering, cancellation, and approval responses during an active task. [Source: `_bmad-output/planning-artifacts/epics.md` UX-DR3]
- PRD TUI requirements include an editor/input area with multiline support, interrupt/steer behavior while a task is running, and approval prompts for risky commands and broad edits. [Source: `_bmad-output/planning-artifacts/prd.md` Interface Modes]
- Architecture states the TUI may render runtime events, maintain presentation state, collect user input, send steering/cancel/approval responses to runtime, and display memory/skill/session/model state. [Source: `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- Architecture states the core runtime has no dependency on Commander, Ink, React, JSON-RPC server libraries, or terminal rendering. [Source: `_bmad-output/planning-artifacts/architecture.md` Interface Adapter Pattern]
- Architecture requires no adapter-owned task lifecycle state; adapters submit intents and render runtime truth. [Source: `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]

### Previous Story Intelligence

Story 6.2 completed the display/read-model side:

- `packages/tui/src/index.ts` exports `createTuiStartupState()`, `createTuiRuntimeState()`, `formatTuiStateSummary()`, `createTuiMessageStream()`, `createTuiEventStreamItem()`, `formatTuiMessageStream()`, `TuiMessageStreamItem`, `TuiMessageStreamKind`, `TuiMessageStreamSeverity`, and `TuiOutputPreview`.
- Message-stream rendering now shows order/timestamp, safe metadata, collapsed output references, and secret-safe bounded previews.
- Story 6.2 explicitly deferred live multiline input, steering, cancellation, and approval response UI to this story.
- No Ink/React dependency or CLI TUI entrypoint exists yet.

Story 1.5 and Story 1.6 established runtime-owned steering/cancellation behavior:

- `AgentRuntime.submitInteractiveTask()` starts runtime-owned task state.
- `AgentRuntime.steerActiveTask(note)` records `task.steering.received` and a follow-up `task.waiting` event.
- `AgentRuntime.cancelActiveTask(note?)` records a cancellation through runtime state/events.
- `runtime-loop.applyTaskSteering()` is the pure steering transition helper.

Story 2.6 established approval behavior:

- `AgentRuntime.getPendingApprovals(taskId?)` returns safe approval request metadata.
- `AgentRuntime.respondToApproval(response)` accepts allow, deny, edit, timeout, and session-scoped allow response shapes through `RuntimeApprovalResponse`.
- Command approval edits use `modifiedRequest: CommandPolicyRequest`.
- File-edit approval edits must use `modifiedToolCall` for `apply_patch`; do not use `modifiedRequest` for file-edit approvals.
- Denial and timeout return structured runtime errors/observations and should not be hidden by UI code.

### Current Implementation Baseline

- `packages/tui` currently contains pure TypeScript display contracts only and depends on `@sprite/core` and `@sprite/shared`.
- `packages/core/src/index.ts` exports `AgentRuntime`, `RuntimeApprovalResponse`, runtime events, task state, and runtime loop contracts.
- `packages/sandbox/src/approval-service.ts` defines `ApprovalRequest`, `ApprovalResponse`, `ApprovalAction`, and the shared approval response shapes.
- `tests/tui-state.test.ts` and `tests/tui-message-stream.test.ts` provide deterministic fixture patterns for TUI state/stream tests.
- `tests/runtime-loop.test.ts` and `tests/runtime-events.test.ts` contain existing runtime fixtures for steering, cancellation, pending approval, and approval response behavior.

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/tui/src/index.ts` — current home for TUI state and message stream contracts; may remain the export barrel.
- `packages/tui/src/*` — add separate modules if `index.ts` becomes too large.
- `packages/tui/package.json`, root `package-lock.json`, and `packages/tui/tsconfig.json` — touch only if adding Ink/React/JSX renderer tests.
- `packages/core/src/agent-runtime.ts` — inspect `submitInteractiveTask()`, `steerActiveTask()`, `cancelActiveTask()`, `getPendingApprovals()`, and `respondToApproval()`; avoid changing runtime contracts unless a missing adapter-safe API is proven.
- `packages/core/src/runtime-loop.ts` — inspect `applyTaskSteering()` and task waiting/cancellation helpers.
- `packages/sandbox/src/approval-service.ts` — inspect approval request/response contracts.
- `tests/tui-control-intents.test.ts` — recommended new focused pure adapter test file.
- `tests/tui-workbench.test.tsx` — recommended only if Ink renderer is added.

Expected new contracts before implementation:

- `TuiInputDraft`
- `TuiInputDraftAction`
- `TuiUserIntent`
- `TuiRuntimeControlPort`
- `TuiApprovalActionSelection`
- `createTuiInputDraft(initialText?)`
- `updateTuiInputDraft(draft, action)`
- `createTuiSubmitIntent(draft, options?)`
- `createTuiCancelIntent(note?)`
- `createTuiApprovalResponseIntent(approvalRequest, selection)`
- `dispatchTuiUserIntent(port, intent)`
- `TuiWorkbench` or equivalent minimal renderable component if Ink is added

### Library / Framework Notes

- Architecture recommends Ink/React terminal for the minimal TUI unless implementation discovery finds a stronger reason to change.
- Current package registry check on 2026-05-11 via `npm view` returned:
  - `ink` version `7.0.2`
  - `react` version `19.2.6`
  - `ink-testing-library` version `4.0.0`
- Do not add a new dependency casually. For this story, adding Ink/React is acceptable if needed to honestly implement/test multiline terminal interaction, but keep it scoped to `packages/tui` and do not import Ink/React from `packages/core`.
- If JSX/TSX is introduced, update `packages/tui/tsconfig.json` deliberately and keep build/typecheck green.

### UX / UI Guardrails

- The input area must communicate whether submission will start a task, steer an existing task, answer an approval, or cancel.
- Multiline input must preserve line breaks in the runtime intent, but UI previews should be bounded/redacted.
- Approval prompts must show safe metadata only: request type, risk, reason, summary, timeout, allowed actions, affected-file labels, and IDs. Never show raw patch bodies or raw command output.
- Cancellation must be explicit and visible; avoid accidental cancel on ordinary text editing keys in tests.
- State and stream display should reuse Story 6.1/6.2 read models rather than inventing a new UI state truth.
- Labels must be perceivable without color. Use text labels such as `SUBMIT`, `STEER`, `CANCEL`, `APPROVE`, `DENY`, `EDIT`, `TIMEOUT`, `PENDING`, and `ERROR`.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`, Ink, React, or renderer code.
- TUI code may depend on exported core runtime contracts but must not bypass runtime APIs.
- TUI code must not execute commands, apply patches, approve policy requests internally, mutate memory, promote skills, or write session state directly.
- Adapter-local UI state is allowed only for draft input, focus/selection, display preferences, and latest dispatch result; losing it must not change runtime truth.
- Approval response construction must preserve the Story 2.6 contract: command edit = `modifiedRequest`; file-edit edit = `modifiedToolCall`.
- Do not weaken runtime event raw-field safety to make UI display easier.

### Testing Requirements

- Use Vitest and existing test style.
- Write red tests before implementation.
- Prefer pure control-port unit tests for dispatch semantics.
- Use real `AgentRuntime` fixtures only where necessary to prove event/state recording.
- If Ink is added, use `ink-testing-library` for bounded renderer tests; no live terminal is required for automated tests.
- Keep tests deterministic: no network, no live provider calls, no real risky command execution, and no shell command execution bypassing runtime policy.
- Include tests for multiline input preserving line breaks, steering event emission, cancellation state, approval allow/deny/edit/timeout dispatch, file-edit `modifiedToolCall`, and secret redaction in visible UI strings.

### Project Structure Notes

- Expected implementation stays inside:
  - `packages/tui` for control intents, optional renderer component, and package-local exports.
  - `tests/` for TUI control/renderer/runtime-fixture tests.
- Touch `packages/core` only if a missing adapter-safe runtime method is proven.
- Touch `packages/cli` only if adding a thin `sprite tui` entrypoint is explicitly included during development; do not mix slash-command work into this story.
- Do not add standalone frontend state libraries, global UI stores, or duplicated runtime loops.

### Open Questions for Implementation

- Should Story 6.3 add the first `sprite tui` CLI entrypoint, or only the renderable `packages/tui` component plus tests?
- Is a pure control-port dispatch layer enough for the first implementation slice, or should Ink be added immediately now that Story 6.2 established the event stream contract?
- How should multiline key bindings be represented in non-interactive tests without overfitting to Ink internals?
- Should approval timeout be user-triggered in the TUI as an explicit action only, or should a timer-driven UI path be added later?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created after Story 6.2 was closed by commit `3374141`.
- Loaded BMad create-story workflow, sprint status, Epic 6 planning, PRD TUI requirements, architecture TUI adapter decision, Story 6.2 review notes, Story 1.5 steering/cancel notes, Story 2.6 approval notes, current TUI package, and runtime approval APIs.
- Used `omx explore` / repository search to map existing runtime control methods and TUI package state.
- Confirmed current package registry versions with `npm view ink version`, `npm view react version`, and `npm view ink-testing-library version` on 2026-05-11.
- Started BMad dev-story implementation on 2026-05-11; marked Story 6.3 in-progress.
- Confirmed implementation contracts before code edits: `TuiInputDraft`, `TuiInputDraftAction`, `TuiUserIntent`, `TuiRuntimeControlPort`, `TuiApprovalRequestSummary`, `TuiApprovalResponseSelection`, `TuiWorkbenchView`, `createTuiInputDraft()`, `updateTuiInputDraft()`, `createTuiSubmitIntent()`, `createTuiCancelIntent()`, `createTuiApprovalResponseIntent()`, `dispatchTuiUserIntent()`, `createTuiWorkbenchView()`, and `formatTuiWorkbenchView()`.
- GitNexus impact checks before code edits: `createTuiRuntimeState` LOW, `createTuiMessageStream` LOW, `respondToApproval` LOW, `steerActiveTask` LOW, `cancelActiveTask` LOW, `RuntimeApprovalResponse` not indexed, and `AgentRuntime` HIGH. Implementation will not edit `AgentRuntime` or runtime contracts.
- Red test confirmed missing Story 6.3 TUI control exports: `npm test -- --run tests/tui-control-intents.test.ts` failed with `createTuiInputDraft is not a function` and `createTuiApprovalResponseIntent is not a function`.
- Implemented pure TUI control intents, runtime-control dispatch, approval response construction, and safe workbench view/formatter in `packages/tui/src/index.ts`; no runtime contract, CLI entrypoint, Ink/React dependency, or package lockfile change was added.
- Validation passed: targeted TUI control tests, TUI state/message regression tests, typecheck, full Vitest suite, `git diff --check`, GitNexus analyze, and GitNexus status.

### Implementation Plan

- Start with red tests around a pure TUI intent/control-port layer.
- Add minimal runtime dispatch helpers that call `AgentRuntime`-shaped methods and never mutate task state directly.
- Add a minimal testable UI interaction surface if Ink is adopted in this slice; otherwise record why renderer work remains deferred.
- Reuse Story 6.1/6.2 state and stream display contracts for rendering runtime truth.
- Defer Ink/React in this slice because the acceptance criteria can be proven with a pure runtime-control port and safe renderable workbench view; adding a live terminal renderer remains a later adapter step.

### Completion Notes List

- Created ready-for-dev Story 6.3 context for multiline TUI input, steering, cancellation, and approval responses.
- Captured the critical Story 2.6 approval edit distinction: command edits use `modifiedRequest`; file-edit approvals use `modifiedToolCall`.
- Scoped slash commands, final summaries, learning-review panels, JSON-RPC approval responses, and provider-level cancellation out of this story.
- Added typed TUI interaction contracts for multiline drafts, submit/steer/cancel intents, approval response intents, runtime-control dispatch, and safe workbench view formatting.
- `dispatchTuiUserIntent()` now routes submit/steer/cancel/approval-response intents through an `AgentRuntime`-shaped port without mutating task lifecycle state in TUI code.
- Approval helpers preserve the Story 2.6 contract: command approval edits use `modifiedRequest`; file-edit approval edits use `modifiedToolCall` for `apply_patch`; timeout maps to runtime default-deny response shape.
- Workbench view formatting exposes non-color-only `SUBMIT`, `STEER`, `CANCEL`, `APPROVE`, `DENY`, `EDIT`, and `TIMEOUT` labels while redacting secret-looking input and approval text.
- No Ink/React dependency was added; this story is satisfied through pure TUI interaction contracts, runtime fixture tests, and a deterministic safe formatter.

### File List

- `_bmad-output/implementation-artifacts/6-3-support-multiline-input-steering-cancellation-and-approval-responses.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/tui/src/index.ts`
- `tests/tui-control-intents.test.ts`

### Change Log

- 2026-05-11: Created Story 6.3 with implementation context for TUI control intents, runtime dispatch, multiline input, cancellation, and approval responses.
- 2026-05-11: Implemented Story 6.3 TUI control intents, runtime dispatch, approval response helpers, safe workbench view, and validation tests; marked story ready for review.
