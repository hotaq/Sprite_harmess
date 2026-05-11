# Story 6.2: Display Message Stream, Tool Activity, and Validation Results

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the TUI to display the agent's work as it happens,
so that I can inspect messages, tool calls, validation, and outcomes.

## Acceptance Criteria

1. Given the runtime emits task, assistant/message-like, tool, validation, file, policy, approval, warning/error, memory, skill, session, compaction, retrospective, or learning events, when the TUI receives those `RuntimeEventRecord[]` values, then it renders them as ordered message-stream items with clear event type, status, timestamp/order, and bounded summary.
2. Given event payloads contain `status`, `reason`, `toolName`, `toolCallId`, `validationId`, `approvalRequestId`, affected-file summaries, or `outputReference`, when the TUI maps events into stream items, then those fields are surfaced as safe metadata without displaying raw command output, raw file contents, credentials, patches, snippets, env values, or other forbidden raw payload fields.
3. Given the TUI displays warnings and errors, when it classifies event severity, then failed/cancelled/denied/blocked events are visually distinct using text labels/tokens and not color alone, and normal event `summary` text is not counted as a warning.
4. Given tool or validation output exceeds 32 KB or 500 lines, or the event includes `outputReference`, when the TUI renders the result, then it shows summarized/truncated/collapsible display state and a local log reference when one is provided; it must not inline the full output.
5. Given the stream adapter is tested, then tests prove message-stream rendering is derived from runtime event type/status metadata and not from parsing final summary text or from a separate UI-owned task lifecycle model.

## Tasks / Subtasks

- [ ] Confirm implementation contract before code edits (AC: 1-5)
  - [ ] Report the exact new or changed exports before modifying implementation. Expected candidates: `createTuiMessageStream()`, `createTuiEventStreamItem()`, `formatTuiMessageStream()`, `TuiMessageStreamItem`, `TuiMessageStreamSeverity`, and output-preview constants.
  - [ ] Run GitNexus impact analysis before editing existing exported symbols or runtime contracts, especially `createTuiRuntimeState()`, `formatTuiStateSummary()`, `RuntimeEventRecord`, `validateRuntimeEvent()`, `AgentRuntime`, and CLI entry exports if touched.
  - [ ] Treat this story as stream/read-model rendering first. Do not implement multiline input, steering, cancellation, slash commands, final-summary panels, or full approval-response UI.

- [ ] Define runtime-event-to-stream mapping (AC: 1, 2, 3, 5)
  - [ ] Extend `packages/tui/src/index.ts` with pure stream/read-model functions that accept `RuntimeEventRecord[]`.
  - [ ] Group event kinds by explicit `event.type` prefix or exact event type: task, tool, validation, file, policy, approval, memory, skill, learning, retrospective, session, and unknown/fallback only if the core type union expands.
  - [ ] Derive stream status from typed payload fields such as `status`, `reason`, `decision`, and `riskLevel`; do not infer task truth from formatted text, final summaries, or render order.
  - [ ] Include stable identifiers when present: `eventId`, `correlationId`, `toolCallId`, `validationId`, `approvalRequestId`, `editId`, candidate/skill/memory IDs, and artifact references.
  - [ ] Keep `createTuiRuntimeState()` as state summary only; do not overload its warning count with message-stream summaries.

- [ ] Add bounded and secret-safe output handling (AC: 2, 4)
  - [ ] Add a stream item output-preview model with `isTruncated`, `hiddenLineCount`/`hiddenByteCount` when knowable, `outputReference`, and `fullOutputStored`.
  - [ ] Apply the Story 6.2 large-output threshold: 32 KB or 500 lines.
  - [ ] Use existing redaction/bounding helpers such as `createRedactedPreview()` and `containsSecretLikeValue()` from `@sprite/shared` before inventing new masking logic.
  - [ ] Never read `outputReference.path` from the TUI mapper; display a bounded local reference label only.
  - [ ] Do not render forbidden raw fields already blocked by runtime events (`rawOutput`, `stdout`, `stderr`, `rawContent`, `patch`, `diff`, `env`, `snippets`, credentials).

- [ ] Render stream output in a deterministic formatter (AC: 1, 3, 4, 5)
  - [ ] Add a text formatter such as `formatTuiMessageStream()` or extend an equivalent deterministic formatter for tests/manual review.
  - [ ] Use explicit labels/tokens like `TASK`, `TOOL`, `VALIDATION`, `FILE`, `APPROVAL`, `POLICY`, `MEMORY`, `SKILL`, `LEARNING`, `SESSION`, `WARN`, and `ERROR`.
  - [ ] Ensure severity is perceivable without color; color may be added later by Ink components but cannot be the only signal.
  - [ ] Keep formatter output bounded and deterministic so it can be tested without an interactive terminal.

- [ ] Add stream adapter tests (AC: 1-5)
  - [ ] Add `tests/tui-message-stream.test.ts` or equivalent focused coverage.
  - [ ] Cover task started/waiting/completed/failed/cancelled classification and status labels.
  - [ ] Cover `tool.call.requested|started|completed|failed` and `validation.started|completed`, including success, failed, blocked, skipped, and `outputReference`.
  - [ ] Cover file activity/edit, policy decision, approval requested/resolved, memory, skill, session, compaction, retrospective, and learning events as safe display items.
  - [ ] Add a regression test that normal `validation.completed.payload.summary` does not become a warning.
  - [ ] Add large-output tests for 32 KB and 500-line boundaries using synthetic payload preview input or safe formatter fixtures; assert full output is not inlined.
  - [ ] Assert no interactive terminal renderer, live provider, network, or shell command is required by the tests.

- [ ] Add renderer dependency only if necessary (AC: 1, 4, 5)
  - [ ] Prefer pure `.ts` stream contracts first. Do not add Ink/React unless implementation cannot satisfy this story without live terminal rendering.
  - [ ] If Ink is added, scope dependencies to `packages/tui`, update lockfile intentionally, keep `packages/core` free of TUI/Ink imports, and add renderer tests with `ink-testing-library`.
  - [ ] If Ink is deferred, record that the story satisfies acceptance through the adapter contract and deterministic formatter, leaving interactive layout for Story 6.3+.

- [ ] Validate and update story status (AC: 1-5)
  - [ ] Run targeted stream tests first.
  - [ ] Run `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [ ] Run GitNexus analyze/status before commit: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [ ] Move status to `in-progress` when development starts, `review` after implementation validation passes, and `done` only after review fixes pass.

## Dev Notes

### Story Intent

Story 6.2 builds the main activity stream on top of Story 6.1's TUI state/read-model foundation. The user should be able to see what the agent is doing without trusting final prose summaries or a separate UI lifecycle model.

This story should deliver a typed, safe, deterministic stream adapter and formatter. It should not implement multiline input, steering, cancellation, slash-command parsing, final-summary panels, or learning-review detail panels; those belong to Stories 6.3-6.5.

### Source Requirements

- Epic 6 objective: users can steer the runtime through a richer terminal workbench displaying messages, tool activity, approvals, changed files, validation, memory, skills, model, session, and slash-command controls. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 6]
- Story 6.2 requires runtime events to render as a message stream with clear event type/status and no dependency on final summary parsing. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.2]
- Story 6.2 requires tool output above 32 KB or 500 lines to be summarized/collapsible/truncated and to display a local log reference when stored. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.2]
- FR61 requires the TUI to display messages, tool activity, approvals, changed files, validation results, context state, memory state, model state, session state, and learning-review outputs. [Source: `_bmad-output/planning-artifacts/prd.md` FR61]
- UX-DR2 requires assistant responses, tool calls/results, warnings, errors, approvals, validation results, memory events, skill events, and learning events in the message stream. [Source: `_bmad-output/planning-artifacts/epics.md` UX-DR2]
- UX-DR4 requires large tool output summarization/collapse/truncation with full local log references when stored. [Source: `_bmad-output/planning-artifacts/epics.md` UX-DR4]
- Architecture states CLI, TUI, print mode, and JSON-RPC must be thin clients over one runtime; the runtime owns task state, event emission, tools, approvals, memory, and learning outputs. [Source: `_bmad-output/planning-artifacts/architecture.md` Interface Adapter Pattern]
- Architecture states the runtime event stream is the system spine for TUI rendering, NDJSON output, JSON-RPC streaming, session persistence, audit views, learning review, and tests. [Source: `_bmad-output/planning-artifacts/epics.md` AR8]
- Architecture states TUI rendering state must be derived from runtime events; UI components must not infer runtime truth from text output or rendering order. [Source: `_bmad-output/planning-artifacts/epics.md` AR26]
- Architecture requires core runtime logic to be testable without launching the TUI. [Source: `_bmad-output/planning-artifacts/epics.md` NFR44]

### Previous Story Intelligence

Story 6.1 completed the first pure TUI state/read-model layer:

- `packages/tui/src/index.ts` now exports `createTuiStartupState()`, `createTuiRuntimeState()`, and `formatTuiStateSummary()`.
- `tests/tui-state.test.ts` proves startup/runtime state can be derived without launching an interactive terminal renderer.
- No Ink/React dependency or CLI `sprite tui` entrypoint was added.
- `@sprite/tui` path/package wiring exists in the workspace.
- The Story 6.1 review fix is critical for this story: normal runtime event payload `summary` fields must not be treated as warnings. Warning/error display belongs to explicit severity classification, not broad summary parsing.

Carry this into Story 6.2:

- Reuse `TuiSafeString`, `TuiBoundedList`, token formatting, and redaction helpers where possible.
- Keep message stream state adjacent to, but separate from, the startup/runtime summary state.
- Add regression coverage before broadening event classification.

### Current Implementation Baseline

- `packages/tui/src/index.ts` imports `RuntimeEventRecord` from `@sprite/core` and already accepts events in `createTuiRuntimeState()` for count/latest-type display. [Source: `packages/tui/src/index.ts`]
- `RuntimeEventRecord` and `RuntimeEventPayloadMap` are defined in `packages/core/src/runtime-events.ts`. The current event union includes task lifecycle, learning, retrospective, memory, skill, session, compaction, policy, approval, validation, file edit/activity, and tool call events. [Source: `packages/core/src/runtime-events.ts`]
- Runtime event payload validation forbids raw tool/policy content fields such as raw output, stdout/stderr, snippets, patches, diffs, env, credentials, and tokens. The TUI should preserve that safety boundary and not invent raw-output channels. [Source: `packages/core/src/runtime-events.ts`]
- Tool and validation completed/failed payloads can include `outputReference: { fullOutputStored, reason, path? }`. The TUI should display this reference safely and should not read the referenced file. [Source: `packages/core/src/runtime-events.ts`]
- `createRedactedPreview()` and `containsSecretLikeValue()` are already used by the TUI state adapter and should remain the first choice for safe summaries. [Source: `packages/tui/src/index.ts`; `@sprite/shared`]

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/tui/src/index.ts` — likely home for stream item types, mapper, formatter, large-output constants, and helper functions.
- `tests/tui-message-stream.test.ts` — recommended new focused test file for stream mapping and output truncation.
- `tests/tui-state.test.ts` — keep existing regression coverage; add only if shared helpers or warning behavior changes.
- `packages/core/src/runtime-events.ts` / `RuntimeEventRecord` — inspect only; avoid widening event contracts unless the stream story cannot be represented safely.
- `packages/core/src/agent-runtime.ts` / event emission sites — inspect only if sample events or message-like event coverage appears incomplete.
- `packages/tui/package.json` / `package-lock.json` — touch only if adding Ink/React/renderer test dependencies.
- `packages/cli/src/index.ts` / `createProgram()` — touch only if a thin `sprite tui` entrypoint becomes required, which is not expected for this story.

Expected new functions/contracts before implementation:

- `createTuiMessageStream(events, options?)`
- `createTuiEventStreamItem(event, options?)`
- `formatTuiMessageStream(stream, options?)`
- `TuiMessageStreamItem`
- `TuiMessageStreamKind`
- `TuiMessageStreamSeverity`
- `TuiOutputPreview`

### Library / Framework Notes

- Architecture recommends Ink/React terminal for the minimal TUI unless implementation discovery finds a stronger reason to change. [Source: `_bmad-output/planning-artifacts/prd.md` TUI requirements; `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- Current package registry check on 2026-05-11 via `npm view` returned:
  - `ink` version `7.0.2`
  - `react` version `19.2.6`
  - `ink-testing-library` version `4.0.0`
- Official package/reference links checked for this story:
  - `https://github.com/vadimdemedes/ink`
  - `https://github.com/vadimdemedes/ink-testing-library`
  - `https://clig.dev/`
  - `https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html`
- Do not add a new dependency casually. Story 6.2 can likely satisfy acceptance with pure stream mapping plus a deterministic text formatter. Add Ink only when interactive terminal rendering is unavoidable, and keep it scoped to `@sprite/tui`.

### UX / UI Guardrails

- Message stream items should communicate "what happened", "what status", "which tool/validation/request", and "where to inspect full output" without requiring color or final summary prose.
- Prefer compact one-line item headers plus bounded detail lines. Long output belongs behind `TuiOutputPreview` metadata, not raw terminal spam.
- Use consistent labels/tokens for categories and severity so later Ink components can style them without changing runtime truth.
- Avoid color-only signaling. Use text labels such as `ERROR`, `WARN`, `BLOCKED`, `FAILED`, `PENDING`, `PASSED`, and `RECORDED`.
- Preserve auditability: keep event IDs and correlation IDs available in the stream model even if the default formatter hides some detail.
- Keep references local and bounded. A log/reference path can be displayed as a safe label; the TUI mapper must not dereference it.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`.
- `packages/tui` may import exported contracts from `@sprite/core` and `@sprite/shared` as needed.
- TUI code must not execute tools, apply patches, approve policy requests, promote skills, mutate memory, or write session state.
- Adapter-local reducer state is allowed only as derived display state; losing it must not change runtime truth.
- Do not create a separate TUI task lifecycle state machine. Stream truth comes from `RuntimeEventRecord`.
- Do not parse final summaries to determine tool, validation, warning, or terminal status.
- Do not weaken runtime event raw-field safety to make UI display easier.

### Testing Requirements

- Use Vitest and existing test style.
- Prefer pure unit tests over terminal renderer tests.
- Use synthetic `RuntimeEventRecord` fixtures with realistic payloads and stable timestamps.
- Cover every current event family at least once, plus focused tool/validation boundary cases.
- Include secret-like strings in summaries/paths where safe and assert formatter output is redacted or omitted.
- Include `outputReference` fixtures with `fullOutputStored: true` and optional path.
- Keep tests deterministic: no network, no real terminal interaction, no live provider calls, no shell command execution.
- If adding Ink, use `ink-testing-library` and keep renderer tests bounded to presentation over the stream model.

### Project Structure Notes

- Expected implementation stays inside:
  - `packages/tui` for stream/read-model/formatter and optional renderer components.
  - `tests/` for adapter stream tests.
- Avoid modifying:
  - `packages/core` unless an exported runtime event contract is genuinely missing.
  - `packages/cli` unless a thin TUI command is required.
  - package dependencies unless renderer code is introduced.
- No standalone frontend state library, global UI store, or duplicated runtime loop should be introduced.

### Open Questions for Implementation

- Is a pure stream mapper plus deterministic formatter sufficient for Story 6.2, deferring Ink until Story 6.3 input/interaction work?
- Do assistant/provider message events currently exist in `RuntimeEventRecord`, or should Story 6.2 map task/message-like runtime events without expanding core contracts?
- Should the formatter default to showing event IDs/correlation IDs, or keep them in the model for debug/detail views only?
- How should output-preview boundary tests model 32 KB/500 lines without violating runtime raw-output restrictions?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Story created after Story 6.1 was closed by commit `b9a91b3`.
- Loaded BMad create-story workflow, sprint status, Epic 6 planning, PRD TUI requirements, architecture adapter/runtime boundaries, Story 6.1 implementation/review notes, current TUI package, and runtime event contracts.
- Confirmed current package registry versions with `npm view ink version`, `npm view react version`, and `npm view ink-testing-library version` on 2026-05-11.
- External references checked: Ink, ink-testing-library, CLI Guidelines, and WCAG use-of-color guidance.

### Completion Notes List

- Created ready-for-dev Story 6.2 context for typed message-stream rendering, tool/validation activity display, and large-output handling.
- Scoped Story 6.2 to a pure stream adapter/formatter first, with Ink/React deferred unless implementation proves it necessary.
- Captured Story 6.1 warning-classification regression as a guardrail for this story.
- Added explicit implementation boundaries to prevent TUI-owned lifecycle state, raw output display, secret leakage, or final-summary parsing.

### File List

- `_bmad-output/implementation-artifacts/6-2-display-message-stream-tool-activity-and-validation-results.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
