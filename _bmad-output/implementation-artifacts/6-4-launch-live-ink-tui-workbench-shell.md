# Story 6.4: Launch Live Ink TUI Workbench Shell

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to launch a live Ink-based TUI workbench,
so that I can use the state, stream, input, and approval controls from one terminal UI.

## Acceptance Criteria

1. Given `sprite tui` or an equivalent development command starts in a project directory, when the live TUI launches, then it renders startup/runtime state, message stream, input area, approval prompts, and footer/status using `packages/tui` without duplicating runtime task lifecycle logic in the UI layer.
2. Given runtime events or runtime state change, when the TUI receives the update, then the live view updates through the display contracts from Stories 6.1, 6.2, and 6.3 and the runtime remains the source of truth for task state, events, approvals, and control outcomes.
3. Given the user submits multiline input, cancels, or answers an approval in the live TUI, when the action is dispatched, then it goes through the Story 6.3 typed control intents and runtime port and the UI does not execute commands or apply file edits directly.
4. Given tests run for the live TUI, when rendering and interaction behavior are verified, then deterministic Ink renderer tests cover startup display, streamed events, multiline input, cancellation, and approval actions without requiring a live provider, network access, or raw secret display.
5. Given verbose tool output, raw approval details, multiline drafts, provider metadata, or path-like content are visible in the TUI, when the live workbench renders them, then it uses existing safe preview/redaction/output-summary contracts and non-color-only labels so secrets and accessibility-critical state are not hidden behind color alone.
6. Given the TUI package introduces Ink/React, when the repo builds and tests, then Ink/React dependencies remain scoped to `packages/tui`, `packages/core` remains free of UI dependencies, and the root package build/typecheck/test suite still passes.

## Tasks / Subtasks

- [x] Confirm implementation function/package list before code edits (AC: 1-6)
  - [x] Report exact exports/files to add or modify before implementation.
  - [x] Run GitNexus impact analysis before editing existing exported symbols, especially `createProgram()`, existing `packages/tui` exports, `AgentRuntime`, `respondToApproval()`, `steerActiveTask()`, and `cancelActiveTask()`.
  - [x] Treat this story as the first live renderer shell, not slash-command support, final-summary panel work, or learning-review panel work.
  - [x] Confirm dependency plan before package edits: `ink`, `react`, `ink-testing-library`, and `@types/react` are acceptable only inside TUI/test scope.

- [x] Add live Ink package wiring inside `packages/tui` (AC: 1, 4, 6)
  - [x] Update `packages/tui/package.json` with renderer/test dependencies required for a live Ink shell.
  - [x] Update `packages/tui/tsconfig.json` only as needed for TSX/React while keeping current `.ts` contracts buildable.
  - [x] Keep `packages/core`, `packages/shared`, and other runtime packages independent from Ink/React imports.
  - [x] Update `package-lock.json` intentionally if dependencies are added.

- [x] Build a thin live workbench component over existing TUI contracts (AC: 1, 2, 5)
  - [x] Add a `TuiWorkbenchApp` or equivalent Ink component in `packages/tui/src`.
  - [x] Render Story 6.1 state via `createTuiStartupState()` / `createTuiRuntimeState()` and `formatTuiStateSummary()` or their display-safe data structures.
  - [x] Render Story 6.2 stream via `createTuiMessageStream()` / `formatTuiMessageStream()` or equivalent stream item display.
  - [x] Render Story 6.3 controls via `createTuiInputDraft()`, `createTuiSubmitIntent()`, `createTuiCancelIntent()`, `createTuiApprovalResponseIntent()`, and `dispatchTuiUserIntent()`.
  - [x] Maintain only presentation-local state: focused region, draft text, selected approval/action, scroll/collapse preferences, and latest dispatch result.
  - [x] Do not create a second task lifecycle state machine or UI-owned approval cache.

- [x] Add runtime event ingestion and adapter-local reducer (AC: 1, 2, 5)
  - [x] Add a small adapter-local reducer such as `reduceTuiWorkbenchEvent()` / `createTuiWorkbenchSnapshot()` only for display derivation.
  - [x] Ensure event order, timestamps, statuses, and output references come from `RuntimeEventRecord[]`.
  - [x] Ensure startup/runtime state stays derived from `AgentRuntime.getBootstrapState()`, runtime event records, safe task context snapshots, and pending approval APIs.
  - [x] Decouple event ingestion from rendering enough to respect NFR1/NFR2 and avoid raw large-output rendering.

- [x] Add a thin CLI entrypoint for the live TUI (AC: 1, 3, 6)
  - [x] Add `sprite tui` or a clearly equivalent development command through `packages/cli/src/index.ts`.
  - [x] Keep the command as a thin adapter: construct runtime, attach event sink/control port, call the TUI runner, and return a bounded result.
  - [x] Do not duplicate one-shot print, interactive task, sandbox approval, memory, skill, session, or runtime-loop logic in the CLI command.
  - [x] Preserve existing CLI smoke behavior for `sprite`, `sprite -p`, session commands, and skill commands.

- [x] Wire multiline input, cancel, and approval actions to the runtime port (AC: 2, 3, 5)
  - [x] Preserve multiline input text when creating submit/steer intents.
  - [x] Expose visible non-color-only controls such as `SUBMIT`, `STEER`, `CANCEL`, `APPROVE`, `DENY`, `EDIT`, `TIMEOUT`, `PENDING`, and `ERROR`.
  - [x] Ensure approval actions use Story 6.3 response helpers so command edits use `modifiedRequest` and file-edit approvals use `modifiedToolCall`.
  - [x] Never execute commands, apply patches, write session state, mutate memory, or promote skills directly from TUI code.

- [x] Add deterministic live TUI tests (AC: 1-6)
  - [x] Add `tests/tui-live-workbench.test.tsx` or equivalent with `ink-testing-library`.
  - [x] Cover startup state display, message stream rendering, footer/status display, multiline draft input, submit/steer dispatch, cancellation dispatch, and approval allow/deny/edit/timeout controls.
  - [x] Cover secret redaction in rendered output for provider/auth/env-like values, raw patches, approval reasons, and multiline draft previews.
  - [x] Cover no-network/no-live-provider fixtures and prove runtime methods are mocked or in-memory.
  - [x] Add CLI smoke coverage for `sprite tui --help` or the chosen non-interactive bounded path without launching an uncontrolled terminal session.

- [x] Validate and update story status (AC: 1-6)
  - [x] Run targeted TUI live workbench tests first.
  - [x] Run `rtk run 'git diff --check && npm run typecheck -- --pretty false && npm test -- --run'`.
  - [x] Run GitNexus analyze/status before commit: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [x] Move status to `in-progress` when development starts, `review` after implementation validation passes, and `done` only after review fixes pass.

## Dev Notes

### Story Intent

Story 6.4 is the first story that must create a live terminal UI shell. Stories 6.1, 6.2, and 6.3 intentionally built pure contracts first: safe runtime state, safe event stream, and typed user/control intents. This story should now connect those contracts into an Ink-based workbench that can actually be launched.

The core rule remains runtime ownership. The live TUI may render, collect input, maintain focus/selection/scroll state, and dispatch typed intents. It must not own task lifecycle truth, execute commands directly, apply file edits directly, or invent a separate approval/task state model.

### Source Requirements

- Story 6.4 requires a live Ink-based TUI workbench that renders startup/runtime state, message stream, input area, approval prompts, and footer/status from `packages/tui`. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.4]
- Story 6.4 requires runtime event/state updates to drive the live view through existing Story 6.1/6.2/6.3 contracts. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.4]
- PRD interface modes require the TUI to use Ink/React terminal unless implementation discovery reveals a strong reason to change. [Source: `_bmad-output/planning-artifacts/prd.md` Interface Modes]
- PRD TUI requirements include startup context, message stream, multiline input, footer/status, collapse behavior, interrupt/steer controls, approval prompts, final summaries, and learning reviews. This story covers the shell and interaction foundation; user review pulled in only minimal `/runtime` and `/context` diagnostics toggles so the first live view is not overloaded. [Source: `_bmad-output/planning-artifacts/prd.md` TUI requirements]
- Architecture says CLI, TUI, print mode, and JSON-RPC must share one `AgentRuntime`; adapters decide presentation only. [Source: `_bmad-output/planning-artifacts/architecture.md` Interface Adapter Pattern]
- Architecture says Ink belongs only in `packages/tui`, after runtime event model establishment, and `packages/core` must not depend on terminal UI libraries. [Source: `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- NFR1/NFR2 require input responsiveness and event latency under normal local conditions; this implies event ingestion/rendering should not block on large output formatting. [Source: `_bmad-output/planning-artifacts/prd.md` NFR1-NFR2]
- NFR11 requires secrets and credentials to never display in plaintext in CLI, TUI, logs, RPC state, summaries, or learning reviews. [Source: `_bmad-output/planning-artifacts/prd.md` NFR11]

### Previous Story Intelligence

Story 6.1 established safe runtime state display:

- `packages/tui/src/index.ts` exports `createTuiStartupState()`, `createTuiRuntimeState()`, and `formatTuiStateSummary()`.
- Runtime state includes workspace/session/provider/sandbox/context/memory/skills/skill-candidates/warnings/events.
- Provider auth is shown only as configured/missing/redacted. Raw secret values must not render.
- Skill candidates remain distinct from active promoted skills.
- No Ink/React dependency or CLI entrypoint was added in Story 6.1.

Story 6.2 established safe message stream display:

- `packages/tui/src/index.ts` exports `createTuiMessageStream()`, `createTuiEventStreamItem()`, and `formatTuiMessageStream()`.
- Stream items are ordered, typed, bounded, and metadata-safe.
- Large output is represented by preview/truncation/output-reference semantics, not raw full output.
- Event rendering does not parse final summary text.

Story 6.3 established typed controls:

- `packages/tui/src/index.ts` exports `TuiInputDraft`, `TuiUserIntent`, `TuiRuntimeControlPort`, `TuiApprovalRequestSummary`, `TuiApprovalResponseSelection`, `TuiWorkbenchView`, `createTuiInputDraft()`, `updateTuiInputDraft()`, `createTuiSubmitIntent()`, `createTuiCancelIntent()`, `createTuiApprovalResponseIntent()`, `dispatchTuiUserIntent()`, `createTuiWorkbenchView()`, and `formatTuiWorkbenchView()`.
- `dispatchTuiUserIntent()` routes submit/steer/cancel/approval-response intents through an `AgentRuntime`-shaped control port.
- Approval response construction preserves the critical distinction: command edit = `modifiedRequest`; file-edit edit = `modifiedToolCall`.
- No runtime contract, CLI entrypoint, Ink/React dependency, or package lockfile change was added in Story 6.3.
- Current Story 6.3 status is `review`; development of 6.4 should either wait until 6.3 closes or explicitly revalidate the 6.3 control exports before relying on them.

### Current Implementation Baseline

- `packages/tui` currently contains pure TypeScript display/control contracts and depends on `@sprite/core` and `@sprite/shared`.
- `packages/tui/tsconfig.json` includes `src/**/*.ts` only; TSX/React support is not configured yet.
- Root `package.json` has no Ink/React dependencies today.
- `packages/cli/src/index.ts` has a `createProgram()` Commander surface with root interactive/print behavior, `session` commands, `skills` commands, `compact`, and `resume`; there is no `sprite tui` command yet.
- Existing TUI tests are pure/deterministic:
  - `tests/tui-state.test.ts`
  - `tests/tui-message-stream.test.ts`
  - `tests/tui-control-intents.test.ts`
- Existing CLI smoke tests live in `tests/cli-smoke.test.ts`.

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/tui/src/index.ts` — current export surface; avoid letting it become an unreviewable monolith if adding components.
- `packages/tui/src/live-workbench.tsx` or equivalent — recommended home for the Ink component.
- `packages/tui/src/live-workbench-runner.ts` or equivalent — recommended home for terminal launch/run wiring if needed.
- `packages/tui/src/live-workbench-state.ts` or equivalent — recommended home for adapter-local event/display reducer if splitting files.
- `packages/tui/package.json` — add Ink/React only inside the TUI adapter package.
- `packages/tui/tsconfig.json` — add TSX support and include patterns only if TSX is introduced.
- `packages/cli/src/index.ts` / `createProgram()` — add only a thin `sprite tui` command.
- `packages/core/src/agent-runtime.ts` — inspect `getBootstrapState()`, event emission, `submitInteractiveTask()`, `steerActiveTask()`, `cancelActiveTask()`, `getPendingApprovals()`, and `respondToApproval()`; avoid changing runtime contracts unless a missing adapter-safe API is proven.
- `tests/tui-live-workbench.test.tsx` — recommended new deterministic renderer test file.
- `tests/cli-smoke.test.ts` — extend with a bounded `sprite tui --help` or equivalent smoke path.

Expected new contracts before implementation, subject to adjustment after inspection:

- `TuiWorkbenchApp`
- `TuiWorkbenchAppProps`
- `TuiLiveWorkbenchState`
- `TuiLiveWorkbenchAction`
- `createTuiLiveWorkbenchState(input)`
- `reduceTuiLiveWorkbenchEvent(state, event)`
- `runTuiWorkbench(options)`
- Optional CLI helper such as `renderTuiCommand(runtime, options)` or `startTuiCommand(options)` if useful for testability.

### Library / Framework Notes

- Existing 2026-05-11 registry checks from previous TUI research showed:
  - `ink`: `7.0.2`
  - `react`: `19.2.6`
  - `ink-testing-library`: `4.0.0`
  - `@types/react`: `19.2.14`
- Re-check package versions before adding dependencies if implementation occurs later.
- Add dependencies only if the live renderer cannot be honestly implemented/tested without them; for this story, Ink/React is expected because the story explicitly asks for a live Ink workbench.
- Keep dependencies scoped to `@sprite/tui` / tests; do not import Ink/React from `packages/core`.

### UX / UI Guardrails

- Converge toward the three-zone layout from TUI research:
  1. Header/trust strip: cwd, session, provider/model, sandbox, auth-redacted state.
  2. Main activity area: message stream, tool calls/results, approvals, validation output.
  3. Input/footer/status area: multiline draft, submit/steer/cancel controls, context/session/model/sandbox summary.
- Show non-color-only labels for important actions and states: `SUBMIT`, `STEER`, `CANCEL`, `APPROVE`, `DENY`, `EDIT`, `TIMEOUT`, `PENDING`, `ERROR`, `OK`, `WARN`, `MISSING`, `REDACTED`.
- Preserve multiline input semantics when dispatching to runtime, but render only bounded/redacted previews where full content could leak secrets.
- Approval prompts should show safe metadata only: request type, risk, reason summary, timeout, allowed actions, affected-file labels, and IDs. Do not show raw patch bodies, raw command output, raw env values, or unbounded user content.
- Avoid accidental cancellation through ordinary text-editing keys; cancellation should be explicit and visible in tests.
- Do not implement broad slash command behavior in this story. User review allowed minimal diagnostic toggles only: `/runtime`, `/context`, `/details`, `/hide`, and `/help`.
- Do not implement final summary and learning review panels beyond safe placeholders needed for layout. Those belong to Story 6.6.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`, Ink, React, Commander, or terminal renderer code.
- TUI code may depend on exported core runtime contracts but must not bypass runtime APIs.
- TUI code must not execute commands, apply patches, approve policy requests internally, mutate memory, promote skills, write session state directly, or own lifecycle state.
- Adapter-local UI state is allowed only for draft input, focus/selection, collapse/scroll state, and latest dispatch result.
- Pending approvals must be derived from runtime events/APIs, not a UI-owned source of truth.
- Large output rendering must use bounded summaries/previews/output references.
- Keep renderer tests deterministic and non-interactive; no real terminal control should be required in CI.

### Testing Requirements

- Use Vitest and existing test style.
- Use `ink-testing-library` or an equivalent deterministic renderer harness for Ink components.
- Cover startup/runtime state rendering from fixtures.
- Cover event stream rendering from `RuntimeEventRecord[]` fixtures.
- Cover multiline input and submit/steer/cancel interactions without a live provider.
- Cover approval allow/deny/edit/timeout display and dispatch through a mocked `TuiRuntimeControlPort`.
- Cover file-edit approval edits using `modifiedToolCall`, not `modifiedRequest`.
- Cover redaction of secret-like strings in rendered output.
- Cover CLI command registration/help without launching an uncontrolled terminal session.
- Run full typecheck and test suite after implementation.

### Project Structure Notes

- Expected implementation stays inside:
  - `packages/tui` for Ink components, runner, adapter-local display reducer, and exports.
  - `packages/cli` for a thin `sprite tui` command.
  - `tests/` for renderer/control/CLI smoke coverage.
- Touch `packages/core` only if a missing adapter-safe runtime API is proven and GitNexus impact is acceptable.
- Do not add a global frontend state library, standalone UI store, duplicated runtime loop, or new app scaffold.

### Open Questions for Implementation

- Should `sprite tui` initially launch an idle workbench only, or also accept an optional initial task argument?
- Should the root `sprite` no-argument behavior remain the existing bootstrap text for now, with live TUI only behind `sprite tui`?
- Which keybindings should the first live TUI expose for multiline newline, submit, cancel, and approval selection while staying testable and accessible?
- Should collapse/expand controls for verbose output be implemented now or represented as deterministic collapsed summaries only, leaving interactive expansion for a follow-up slice?
- Should Story 6.4 depend on Story 6.3 being marked `done`, or is `review` acceptable if 6.3 validation evidence remains green?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created after adding Story 6.4 to Epic 6 backlog because existing Epic 6 stories covered contracts but not a live Ink TUI shell.
- Loaded BMad create-story workflow, Epic 6 planning, sprint status, PRD TUI requirements, architecture TUI adapter decision, TUI UX research, current CLI command surface, current TUI package config, and previous Story 6.1-6.3 implementation notes.
- Current working tree already contains uncommitted Story 6.3 review artifacts; this story file intentionally does not modify implementation code.
- Started BMad dev-story implementation on 2026-05-11; marked Story 6.4 in-progress.
- Confirmed implementation contracts before code edits: `TuiWorkbenchApp`, `TuiWorkbenchAppProps`, `TuiLiveWorkbenchState`, `TuiLiveWorkbenchAction`, `createTuiLiveWorkbenchState()`, `reduceTuiLiveWorkbenchEvent()`, `runTuiWorkbench()`, and `createTuiCommandPreview()`.
- GitNexus impact checks before code edits returned LOW risk for `createProgram()`, `createTuiStartupState()`, `createTuiRuntimeState()`, `createTuiMessageStream()`, `createTuiWorkbenchView()`, and `dispatchTuiUserIntent()`.
- Re-checked current package registry versions on 2026-05-11: `ink@7.0.2`, `react@19.2.6`, `ink-testing-library@4.0.0`, and `@types/react@19.2.14`.
- Red tests were added first for missing live TUI exports and `sprite tui --help`; targeted run failed as expected with missing `createTuiLiveWorkbenchState()` and missing `tui` command help.
- Implemented live workbench state/reducer/preview contracts, Ink component, `runTuiWorkbench()`, scoped TUI dependencies, TSX test config, and thin `sprite tui` CLI entrypoint.
- Validation passed: targeted live TUI/CLI/TUI contract tests, `npm run typecheck -- --pretty false`, `git diff --check`, full `npm test -- --run`, manual `sprite tui --preview`, and GitNexus analyze/status.
- User review rejected the first bounded preview because it looked like the whole TUI rather than an interactive session; treated this as a required follow-up before closing Story 6.4.
- Inspected Pi's TUI architecture for adaptation ideas: persistent terminal lifecycle, component tree, focused input handling, explicit render invalidation, footer/status composition, and interactive-mode startup that calls `ui.start()` rather than printing a static frame.
- GitNexus impact checks before follow-up edits returned LOW risk for `createProgram()`, TUI CLI helpers, `TuiWorkbenchApp`, `runTuiWorkbench()`, `formatTuiLiveWorkbenchPreview()`, `createTuiCommandPreview()`, and `formatTuiWorkbenchView()`.
- Added red tests first for static-preview labeling, demo preview smoke coverage, live title clarity, and explicit exit interaction; targeted tests failed before the follow-up implementation and passed after the fix.
- Manual live PTY verification passed: `node packages/cli/dist/index.js tui --demo` rendered `Sprite Harness TUI live workbench`, stayed interactive, and exited cleanly from an empty draft.
- Inspected Pi interactive-mode reference image and adapted the first draft layout toward that shape: compact header/status, collapsible diagnostic details, bordered activity/tool cards, bordered approval cards, a clean prompt box, and footer shortcuts.
- GitNexus flagged `createTuiLiveWorkbenchState()` as HIGH risk for the visual follow-up because it feeds CLI initial state, preview, live command, reducer, and renderer tests; change was constrained to deriving runtime event count/latest type from the supplied event list and covered by renderer tests.
- Visual/manual preview verification passed: `sprite tui --preview --demo` now shows a Pi-like static first draft and `sprite tui --demo` renders the same structure in a live PTY.
- User review found the default `[Runtime]` and `[Context]` blocks too noisy for the first screen; collapsed diagnostics by default and exposed them through `/runtime`, `/context`, `/details`, `/hide`, and `/help`.
- User review rejected `Cmd+D` on macOS because it conflicts with terminal split shortcuts; exit is now `Ctrl+D` on all platforms, while Esc opens a visible cancel prompt and pressing Esc again confirms cancellation.
- User review found multiline Enter hard to see because empty draft rows rendered invisibly while only the line counter changed; blank input rows now render as real blank rows without visible marker characters.
- User review found the input box too noisy because it repeated actions, line counts, and slash-command help. The prompt box now contains only placeholder/draft text; shortcuts moved to the footer.
- User review questioned `Ctrl+S` as the primary send shortcut. The live prompt now treats `Enter` as send and keeps multiline entry on `Shift+Enter` / `Ctrl+J`.
- User review expected live TUI launch to start from a clean screen instead of rendering below previous shell output. `runTuiWorkbench()` now uses Ink `alternateScreen` by default for the live renderer.
- User review found section titles such as `[Activity]`, `[Approvals]`, and `[Footer]` too report-like. Activity and approval cards now render only when data exists, without section headers or empty pending placeholders.
- User review found sending a prompt did not feel real because the submitted text disappeared from the visible chat area. Submitted prompts now echo immediately as redacted `You` cards before runtime activity arrives.
- User review asked to make the live workbench more beautiful. Visual polish is constrained to presentation: rounded cards, softer prompt placeholder, colored activity/approval accents, and cleaner preview copy without changing runtime ownership.
- User review asked the prompt box and shortcut footer to sit on the inferior/bottom edge of the terminal. The live Ink layout now reserves a bottom dock for input/footer and lets the work area flex above it.
- User review asked to remove the default `details hidden` diagnostic line and only show runtime/context details through slash commands. Typing `/` now opens command suggestions.
- User review asked submitted user prompts to render like a clean filled prompt block and found the outline unattractive on the filled background. Submitted prompt echoes now use a stretched dark filled block with no `You` label or outline.
- User review preferred Pi's minimal startup header and did not want an outlined header box. The live header now renders as plain compact text with shortcut/status hints instead of a bordered card.
- User review wanted `/details` to remain sticky for monitoring, while lighter diagnostic panels should be temporary. Normal prompt submission now clears `/runtime`, `/context`, and `/help` panels but keeps `/details` visible.
- User review found the boxed cancel confirmation too heavy and clarified the notice should look like a chat interruption under the sent user prompt, not inside the empty input box. Cancel interruption now renders as inline red `Conversation interrupted` guidance below the latest submitted prompt card.
- User review requested the live session and ongoing agent work to read like a minimal command timeline, not boxed report sections. Header startup, submitted prompts, and activity cards now render with `›` / `│` timeline cues inspired by the provided reference.
- User review noted the input-rule outline color did not match the `Sprite Harness` header accent. The prompt rule now shares the same cyan brand accent as the header.
- Follow-up review found the live CLI did not refresh from runtime events after submit/cancel/approval. Added a live state subscriber so runtime events rebuild the displayed workbench from runtime truth.
- Follow-up review found live approval keys were display-only and did not dispatch through the runtime approval path. Approval prompts now keep a bounded display label separate from the raw control approval ID, and allow/deny/timeout dispatch through Story 6.3 intents.
- Follow-up review found the `E edit` shortcut was exposed before the live bounded edit flow existed. The live UI now only advertises/accepts approval actions currently supported by the control surface.

### Implementation Plan

- Keep runtime truth in existing Story 6.1/6.2/6.3 contracts and add only display-derived live workbench state.
- Introduce Ink/React only inside `packages/tui`; expose `TuiWorkbenchApp` and `runTuiWorkbench()` from the TUI adapter package.
- Add `sprite tui` as a thin CLI adapter with `--preview` for deterministic smoke testing and non-TTY safe output.
- Use `ink-testing-library` for deterministic renderer tests; no live provider, network, risky command execution, or raw secret display.

### Completion Notes List

- Created ready-for-dev Story 6.4 context for the first live Ink-based TUI workbench shell.
- Scoped Story 6.4 to live renderer/entrypoint integration over existing contracts, while deferring broad slash commands and final summary/learning review panels to later stories.
- Captured dependency, architecture, redaction, accessibility, and deterministic renderer-test guardrails.
- Confirmed the first implementation slice and blast radius before code edits; all checked existing symbols reported LOW impact.
- Added scoped Ink/React package wiring to `@sprite/tui` and TSX support for TUI/package tests.
- Added live display-derived workbench state, reducer, preview formatter, and Ink component over existing state/stream/control contracts.
- Added `sprite tui` with a safe `--preview` path and non-TTY fallback; the command constructs runtime state but does not duplicate task-loop logic.
- Added deterministic live TUI renderer tests for state/stream/input/approval/footer rendering, multiline keyboard interaction, cancellation, approval controls, redaction, and file-edit approval `modifiedToolCall`.
- Full validation passed: 23 test files and 349 tests.
- Fixed the preview/live confusion found in review: `sprite tui --preview` now clearly says static/non-interactive, while `sprite tui` runs the live Ink app and awaits `waitUntilExit()`.
- Added `--demo` local fixtures so manual testers can see activity and approval UI without a provider, network, or risky command execution.
- Added explicit live exit handling via `Ctrl+D` when the draft is empty; Esc now opens a visible cancel prompt and pressing Esc again confirms cancellation.
- Improved the first draft visual hierarchy to be more Pi-like and usable: startup resource sections, activity/approval cards, clear input affordance, and compact footer metadata.
- Corrected demo event counters so the header and runtime summary report the same activity count shown in the Activity section.
- Reduced first-screen noise by hiding verbose runtime/context diagnostics until the user submits `/runtime`, `/context`, or `/details`; `/hide` collapses them again.
- Removed `Cmd+D` from live and preview shortcut labels because macOS terminals commonly reserve it for pane splitting.
- Preserved blank multiline draft rows by rendering a whitespace placeholder internally, so pressing Enter creates visible row space without showing marker characters.
- Simplified the prompt box to behave like a text entry area: no action list, no line counter, and no slash-command legend inside the box.
- Changed primary prompt submission to `Enter`; multiline insertion is available through `Shift+Enter` when supported and `Ctrl+J` as a terminal-safe fallback.
- Enabled Ink alternate-screen rendering for live TUI launches, so the workbench starts on a clean terminal screen and restores the previous shell view on exit.
- Removed Activity/Approvals/Footer section titles. Activity is conditional on runtime messages; approvals are conditional on pending approval requests; empty states stay hidden.
- Added local submitted-prompt echo cards so user messages appear in the chat/work area immediately after `Enter send`; slash commands remain control input and are not echoed.
- Polished the live TUI visual hierarchy with rounded prompt/activity/approval cards, severity/risk accent colors, a cleaner header, a softer empty prompt, and matching static preview output.
- Docked the prompt box and shortcut/footer metadata to the bottom of the live terminal viewport while keeping runtime/activity/approval content in the flexible upper work area.
- Removed default hidden-details diagnostics from the live first screen and added slash-command suggestions for `/runtime`, `/context`, `/details`, `/hide`, and `/help`.
- Updated submitted-prompt echo cards to match the provided visual reference: a full-width dark filled block with only the redacted prompt text inside and no border competing with the background.
- Removed the header outline and converted it to a compact Pi-like text header with command/status hints.
- Made `/details` sticky across prompt submissions while treating `/runtime`, `/context`, and `/help` as temporary panels that clear on the next real prompt send.
- Replaced the large boxed cancel prompt with a compact inline red interruption notice below the latest submitted prompt card, leaving the input box clean.
- Restyled startup, submitted prompts, and runtime activity as an unboxed command timeline using `›` prompt cues and `│` work/activity cues, so the TUI feels closer to an active agent session.
- Matched the prompt composer outline color to the `Sprite Harness` header accent and kept only horizontal rules so the input/footer area stays visually close to the terminal reference.
- Wired live TUI state updates to runtime event subscriptions, so submitted tasks, cancellations, approvals, and tool activity are reflected in the live workbench after dispatch.
- Routed live approval allow/deny/timeout actions through raw runtime approval IDs while still rendering bounded display IDs; edit remains hidden until a safe bounded edit prompt is implemented.

### File List

- `_bmad-output/implementation-artifacts/6-4-launch-live-ink-tui-workbench-shell.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/tsconfig.json`
- `packages/tui/package.json`
- `packages/tui/src/index.ts`
- `packages/tui/src/live-workbench.tsx`
- `packages/tui/tsconfig.json`
- `tests/cli-tui-live.test.ts`
- `tests/cli-smoke.test.ts`
- `tests/tui-live-workbench.test.tsx`
- `tests/tsconfig.json`
- `vitest.config.ts`

### Change Log

- 2026-05-11: Created ready-for-dev Story 6.4 context for launching a live Ink TUI workbench shell.
- 2026-05-11: Started Story 6.4 development and confirmed live TUI implementation scope/dependency plan.
- 2026-05-11: Implemented live Ink TUI workbench shell, `sprite tui` entrypoint, renderer tests, and moved Story 6.4 to review.
- 2026-05-11: Addressed user review on static-preview confusion by adding clearer preview labels, demo fixtures, live `waitUntilExit()` handling, and exit controls.
- 2026-05-11: Improved first-draft TUI visual hierarchy toward the Pi interactive-mode reference with bordered activity/approval/input areas.
- 2026-05-11: Hid noisy runtime/context diagnostics behind minimal slash toggles and standardized exit on Ctrl+D instead of Cmd+D.
- 2026-05-11: Preserved visible blank rows for multiline draft input after Enter without marker characters.
- 2026-05-12: Simplified the live prompt box and moved shortcut hints to the footer.
- 2026-05-12: Changed prompt send UX from Ctrl+S-first to Enter-send with Shift+Enter/Ctrl+J newline.
- 2026-05-12: Enabled alternate-screen rendering for clean live TUI startup/exit behavior.
- 2026-05-12: Removed report-like section titles and hid empty activity/approval placeholders.
- 2026-05-12: Added immediate redacted user-prompt echo cards after send.
- 2026-05-12: Polished live TUI visual hierarchy with rounded cards, accent colors, and cleaner static preview text.
- 2026-05-12: Docked the prompt box and footer shortcuts to the bottom of the live terminal viewport.
- 2026-05-12: Removed default hidden-details diagnostics and added slash-command suggestions.
- 2026-05-12: Restyled submitted user prompt echoes as full-width filled dark prompt blocks without outlines.
- 2026-05-12: Simplified the live header into a minimal unboxed Pi-like text header.
- 2026-05-12: Kept `/details` sticky while clearing temporary slash panels on prompt submission.
- 2026-05-12: Replaced boxed cancel confirmation with inline red interruption text below the sent prompt card.
- 2026-05-12: Converted live startup, submitted prompts, and activity rendering to a command-timeline style with matching header/input accent color.
- 2026-05-12: Fixed live event subscription and approval dispatch regressions; raw approval IDs now stay internal while bounded labels remain visible.
