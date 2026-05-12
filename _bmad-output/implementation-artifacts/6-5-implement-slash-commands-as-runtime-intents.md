# Story 6.5: Implement Slash Commands as Runtime Intents

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want slash commands for common runtime actions,
so that I can inspect and control sessions, model, memory, skills, tools, compaction, and learning review quickly.

## Acceptance Criteria

1. Given the user enters `/new`, `/resume`, `/model`, `/memory`, `/skills`, `/tools`, `/compact`, `/review-learning`, or `/exit`, when the TUI parses the slash command, then it maps the command to a typed runtime intent or local exit action and does not bypass runtime policy, session, memory, skill, tool, or compaction services.
2. Given the user enters a slash command with arguments such as `/resume ses_...` or `/compact ses_...`, when parsing succeeds, then the typed intent carries validated bounded arguments and the live TUI displays a safe command result card without echoing raw secrets or unbounded artifacts.
3. Given the user enters a slash command that is unavailable, malformed, missing required arguments, or unsupported in the current runtime state, when the runtime bridge returns an error, then the TUI displays subsystem, likely cause, and next action when known and does not crash or submit the command as a normal prompt.
4. Given existing diagnostic commands `/runtime`, `/context`, `/details`, `/hide`, and `/help` are used, when the command is parsed, then the current UX is preserved: `/details` remains sticky, short diagnostic commands are temporary/local display actions, and runtime-intent commands are not confused with diagnostic toggles.
5. Given slash command suggestions are shown after typing `/`, when command names or prefixes are typed, then suggestions include the broad runtime commands plus existing diagnostics with concise descriptions and no hidden behavior.
6. Given tests run for slash commands, when parser, dispatch, live TUI interaction, and CLI bridge tests are executed, then deterministic tests cover success and failure paths without launching an uncontrolled terminal, requiring a live provider, or using network access.

## Tasks / Subtasks

- [ ] Confirm implementation function/package list before code edits (AC: 1-6)
  - [ ] Report exact new and modified functions to the user before implementation; include which functions are pure TUI parsing, which are CLI/runtime bridge helpers, and which are renderer-only.
  - [ ] Run GitNexus impact analysis before editing existing symbols such as `TuiWorkbenchApp`, `handleLiveTuiInteraction`, `runLiveTuiCommand`, `createProgram`, `createTuiLiveWorkbenchState`, `reduceTuiLiveWorkbenchEvent`, `AgentRuntime`, `compactSessionManually`, `resumeSession`, `listMemoryCandidates`, `listSkillCandidates`, or tool registry exports.
  - [ ] Treat this story as slash-command intent wiring, not final summary/learning review display polish, JSON-RPC implementation, provider auth switching, or a new UI redesign.
  - [ ] Keep dependency plan unchanged unless proven necessary; do not add new packages for slash parsing.

- [ ] Add typed slash command contracts in `packages/tui` (AC: 1, 2, 3, 5)
  - [ ] Add or extract a small module such as `packages/tui/src/slash-commands.ts` instead of growing `live-workbench.tsx` or `index.ts` into an unreviewable monolith.
  - [ ] Define `TuiSlashCommandName`, `TuiSlashCommandIntent`, `TuiSlashCommandResult`, and `TuiSlashCommandSuggestion` or equivalent typed contracts.
  - [ ] Implement a pure parser such as `parseTuiSlashCommand(input)` that recognizes `/new`, `/resume`, `/model`, `/memory`, `/skills`, `/tools`, `/compact`, `/review-learning`, `/exit`, `/runtime`, `/context`, `/details`, `/hide`, and `/help`.
  - [ ] Validate bounded arguments: no unbounded free-form payloads, no secret-looking raw args in visible error messages, and predictable error codes for missing/invalid arguments.
  - [ ] Keep local diagnostic commands clearly typed separately from runtime commands so `/runtime` and `/details` do not require runtime mutation.

- [ ] Add runtime command dispatch through a thin port (AC: 1, 2, 3)
  - [ ] Add a `TuiSlashCommandRuntimePort` or equivalent adapter shape that exposes only the runtime services needed by slash commands.
  - [ ] Route `/resume <sessionId>` through `AgentRuntime.resumeSession(sessionId)` or a small bridge wrapper; do not replay tools, commands, approvals, or provider calls outside runtime resume behavior.
  - [ ] Route `/compact [sessionId]` through `compactSessionManually(cwd, sessionId)` using the current visible session ID when no explicit session ID is provided; return a structured unavailable error when there is no session ID.
  - [ ] Route `/memory` to safe memory views already exposed by runtime/storage, prioritizing candidate summaries and redacted memory metadata over raw content.
  - [ ] Route `/skills` to manual skill registry and skill-candidate review summaries; do not promote, edit, or invoke skills implicitly from this story.
  - [ ] Route `/tools` to a bounded list of registered tools. If the registry lacks a list API, add a minimal exported constant/helper in `packages/tools` rather than duplicating tool names in the TUI.
  - [ ] Route `/model` to current provider/model/auth state from bootstrap/runtime state; model switching can return `unsupported` unless a safe existing runtime API already exists.
  - [ ] Route `/review-learning` to bounded learning review metadata for the current/resumed session when available; do not implement Story 6.6 full final-summary/learning-review panels here.
  - [ ] Route `/new` through a deliberate live-bridge reset/new-runtime action if implemented; otherwise return a structured `unsupported` result with a next action. Do not silently clear state and call it a new session.
  - [ ] Route `/exit` as a local exit action only; it should not create runtime events or mutate session state.

- [ ] Integrate slash commands into the live Ink workbench (AC: 1, 3, 4, 5)
  - [ ] Replace the current local-only `parseSlashCommand()` path in `packages/tui/src/live-workbench.tsx` with typed slash command intents/results while preserving current `/runtime`, `/context`, `/details`, `/hide`, and `/help` behavior.
  - [ ] Ensure slash commands are never echoed as submitted user prompts and are never sent through `createTuiSubmitIntent()`.
  - [ ] Display runtime command results as safe workbench/system cards in the conversation area or details panel, with clear labels such as `command`, `status`, `subsystem`, `next action`, and `source`.
  - [ ] Preserve the UX rule from previous TUI polish: `/details` can remain sticky; other diagnostic/result panels should be temporary unless the command explicitly opens a persistent view.
  - [ ] Keep suggestion rendering minimal and close to the input footer; do not reintroduce noisy always-visible runtime/context blocks.
  - [ ] Make malformed commands recoverable: keep the draft or show a clear error, but do not crash, exit, or submit as task text.

- [ ] Wire the CLI live bridge to slash command dispatch (AC: 1, 2, 3, 6)
  - [ ] Extend `TuiLiveWorkbenchInteraction` with a slash-command interaction or typed command result flow if needed.
  - [ ] Update `handleLiveTuiInteraction()` and/or `runLiveTuiCommand()` as the thin bridge between TUI intents and `AgentRuntime`/session/memory/skill/tool services.
  - [ ] Preserve existing `sprite tui --preview` and `sprite tui --demo` behavior.
  - [ ] Do not duplicate CLI `session inspect`, `session compact`, `session resume`, or `skills candidates` command logic in a second implementation; extract reusable helpers only when needed.

- [ ] Add deterministic tests (AC: 1-6)
  - [ ] Add parser tests for every slash command, aliases if any, missing args, invalid session IDs, unsupported args, and secret-looking input redaction.
  - [ ] Add TUI renderer tests proving slash suggestions include runtime commands and existing diagnostics.
  - [ ] Add live workbench tests proving `/runtime`, `/context`, `/details`, `/hide`, and `/help` keep existing behavior.
  - [ ] Add interaction tests proving runtime slash commands do not produce normal submit interactions and do produce safe command result/error cards.
  - [ ] Add CLI bridge/runtime fixture tests for `/resume`, `/compact`, `/memory`, `/skills`, `/tools`, `/model`, `/review-learning`, `/new` unsupported-or-reset behavior, and `/exit` local action.
  - [ ] Add regression tests proving slash command errors show structured safe messages and do not leak raw secrets, raw memory contents, raw learning review contents, or raw filesystem paths beyond existing safe previews.

- [ ] Validate and update story status during development (AC: 1-6)
  - [ ] Start with red tests for parser and live workbench dispatch.
  - [ ] Run targeted tests first: `npm test -- --run tests/tui-live-workbench.test.tsx tests/tui-control-intents.test.ts tests/cli-tui-live.test.ts tests/cli-smoke.test.ts` or updated equivalents.
  - [ ] Run full validation before review: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [ ] Run GitNexus detect/analyze/status before commit according to project rules: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [ ] Move status to `in-progress` when development starts, `review` after implementation validation passes, and `done` only after review fixes pass.

## Dev Notes

### Story Intent

Story 6.5 turns the TUI slash command surface from mostly local diagnostic toggles into typed control intents. Story 6.4 intentionally allowed only minimal `/runtime`, `/context`, `/details`, `/hide`, and `/help` behavior while the live workbench shell stabilized. This story should keep that polished UX but add a typed command layer that can reach runtime-backed session, model, memory, skill, tool, compaction, and learning-review services safely.

The core rule remains adapter thinness. The TUI may parse commands, render suggestions, display bounded command results, and request runtime actions through a typed bridge. It must not own task lifecycle truth, read/write raw session artifacts directly from renderer code, promote skills, save memory, apply patches, run commands, or invent a second runtime state model.

### Source Requirements

- Story 6.5 requires slash commands for common runtime actions and requires parsing to typed runtime intent or local exit action without bypassing runtime policy, session, memory, or skill services. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.5]
- PRD interactive slash commands include `/new`, `/resume`, `/model`, `/memory`, `/skills`, `/tools`, `/compact`, `/review-learning`, and `/exit`. [Source: `_bmad-output/planning-artifacts/prd.md` MVP command modes]
- FR62 requires slash commands to access session, model, memory, skills, tools, compaction, and learning review actions. [Source: `_bmad-output/planning-artifacts/prd.md` FR62]
- Architecture states CLI, TUI, print mode, and JSON-RPC must share one `AgentRuntime`; adapters decide presentation only. [Source: `_bmad-output/planning-artifacts/architecture.md` Project Context Analysis]
- Architecture states TUI responsibilities are rendering runtime events, maintaining presentation state, collecting user input, sending steering/cancel/approval responses to runtime, and displaying memory/skill/session/model state. [Source: `_bmad-output/planning-artifacts/architecture.md` TUI Adapter Decision]
- Architecture requires runtime state to be canonical in core, adapters to maintain only derived/rendering state, and UI components not to infer task completion from text output. [Source: `_bmad-output/planning-artifacts/architecture.md` State Management Patterns]
- Architecture requires user-facing messages to avoid secrets, raw auth values, or unsafe command output; error codes use `SCREAMING_SNAKE_CASE`. [Source: `_bmad-output/planning-artifacts/architecture.md` JSON-RPC Formats]
- Architecture requires CLI/TUI tests to focus on adapter behavior, not runtime logic. [Source: `_bmad-output/planning-artifacts/architecture.md` Testing and Validation Patterns]

### Previous Story Intelligence

Story 6.3 established typed TUI control intents:

- `packages/tui/src/index.ts` exports `createTuiInputDraft()`, `createTuiSubmitIntent()`, `createTuiCancelIntent()`, `createTuiApprovalResponseIntent()`, `dispatchTuiUserIntent()`, `createTuiWorkbenchView()`, and `formatTuiWorkbenchView()`.
- Approval response construction preserves the critical distinction: command edit = `modifiedRequest`; file-edit edit = `modifiedToolCall`.
- `dispatchTuiUserIntent()` routes submit/steer/cancel/approval-response intents through an `AgentRuntime`-shaped port.
- Heavy review later required bounded live approval edits; commit `fd3a48b` completed that gap and pushed 6.3/6.4 back to honest done status.

Story 6.4 established the live Ink workbench:

- `packages/tui/src/live-workbench.tsx` exports `TuiWorkbenchApp` and `runTuiWorkbench()`.
- `packages/tui/src/index.ts` exports `TuiLiveWorkbenchState`, `createTuiLiveWorkbenchState()`, `reduceTuiLiveWorkbenchEvent()`, and `createTuiCommandPreview()`.
- `packages/cli/src/index.ts` exposes `sprite tui`, `--preview`, and `--demo`, and bridges live interactions through `handleLiveTuiInteraction()`.
- Current live slash behavior is intentionally local and narrow: `parseSlashCommand()` handles `/runtime`, `/context`, `/details`, `/hide`, and `/help`; slash commands are not echoed as user prompts and do not dispatch runtime actions.
- UX polish settled on a prompt-first workbench: minimal header, hidden diagnostics by default, slash suggestions near the input footer, submitted user prompt cards in the conversation area, and interruption/error messages outside the input box.

### Current Implementation Baseline

- `packages/tui/src/live-workbench.tsx` currently defines local `TuiSlashCommand = TuiDetailPanel | "hide"`, local `SLASH_COMMAND_SUGGESTIONS`, `parseSlashCommand()`, and `getSlashCommandSuggestions()`.
- `TuiLiveWorkbenchInteraction` currently covers submit, cancel, approval, and exit; it does not yet model slash command interactions/results.
- `handleLiveTuiInteraction()` in `packages/cli/src/index.ts` currently routes submit/cancel/approval/exit only.
- `AgentRuntime` already exposes runtime-backed APIs relevant to this story: `getBootstrapState()`, `resumeSession(sessionId)`, `listMemoryCandidates()`, `openMemoryCandidate(candidateId)`, `listSkillCandidates()`, `openSkillCandidate(candidateId)`, event history access, and runtime state through existing TUI adapters.
- Manual compaction already exists as `compactSessionManually(cwd, sessionId)` in `packages/core/src/compaction.ts` and is used by the CLI `session compact <sessionId>` command.
- Session inspection already exists as `inspectSessionState(cwd, sessionId)` and is used by `sprite session inspect <sessionId>`.
- The tool registry currently exposes `ToolName`, `ToolRegistry`, and `createToolRegistry()`, but no obvious public `listTools()` helper; add a small exported `TOOL_NAMES`/`listToolNames()` helper if `/tools` needs one.
- `packages/rpc/src/index.ts` is still an empty placeholder; Story 6.5 must not implement JSON-RPC.

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/tui/src/live-workbench.tsx` — current parser, suggestions, input handling, detail panel behavior, and renderer placement.
- `packages/tui/src/index.ts` — current export barrel and live state/control contracts; split slash commands out if the file grows.
- `packages/cli/src/index.ts` — `handleLiveTuiInteraction()`, `runLiveTuiCommand()`, `createProgram()`, existing `session` and `skills candidates` command helpers.
- `packages/core/src/agent-runtime.ts` — `getBootstrapState()`, `resumeSession()`, memory/skill candidate list/open methods, event history methods.
- `packages/core/src/compaction.ts` — `compactSessionManually()` and compaction result shape.
- `packages/core/src/session-inspection.ts` — `inspectSessionState()` and safe session inspection view.
- `packages/tools/src/tool-registry.ts` — tool name/type source of truth for `/tools`.
- `packages/memory/src/index.ts`, `packages/storage/src/memory-store.ts`, and `packages/storage/src/session-store.ts` — only if `/memory` or `/review-learning` needs bounded read helpers not already exposed through runtime.
- `tests/tui-live-workbench.test.tsx`, `tests/tui-control-intents.test.ts`, `tests/cli-tui-live.test.ts`, and `tests/cli-smoke.test.ts` — current deterministic patterns for renderer, control-port, and CLI bridge coverage.

Expected new contracts before implementation, subject to adjustment after inspection:

- `TuiSlashCommandName`
- `TuiSlashCommandIntent`
- `TuiSlashCommandResult`
- `TuiSlashCommandError`
- `TuiSlashCommandRuntimePort`
- `parseTuiSlashCommand(input)`
- `createTuiSlashCommandSuggestions(input)`
- `dispatchTuiSlashCommandIntent(port, intent)`
- `formatTuiSlashCommandResult(result)`
- Optional CLI bridge helper such as `createLiveTuiSlashCommandPort(runtime, state)` or `handleLiveTuiSlashCommandInteraction(runtime, intent, state)`.

### Command Semantics Guidance

Use the smallest honest semantics that satisfy FR62 without pretending unsupported behavior works:

- `/runtime`, `/context`, `/details`, `/hide`, `/help`: local diagnostic/display commands; keep existing behavior.
- `/exit`: local exit interaction; no runtime event required.
- `/model`: inspect provider/model/auth state from existing bootstrap/runtime state. Model switching is out of scope unless an existing safe runtime API is found.
- `/tools`: display bounded registered tool names and safe descriptions; do not execute tools.
- `/memory`: display bounded memory candidate/entry metadata; do not accept/reject/edit memory candidates unless explicitly added as a later story or existing safe API is deliberately wired.
- `/skills`: display manual skills and skill candidate review summaries; do not promote, edit, or invoke skills implicitly.
- `/compact [sessionId]`: compact a concrete session through `compactSessionManually()`. If no session ID is visible, show a structured recoverable error with next action.
- `/resume <sessionId>`: resume through `AgentRuntime.resumeSession()`. Do not replay side effects; rely on existing conservative resume behavior.
- `/review-learning [sessionId]`: show bounded metadata/summary for existing learning review artifacts. Full final summary/learning review presentation belongs to Story 6.6.
- `/new`: either implement a real live-runtime reset/new idle session bridge or return `unsupported` with a clear next action. Do not clear UI-only state and claim a new runtime session exists.

### Library / Framework Notes

- Current repo dependencies already include Ink `^7.0.2`, React `^19.2.6`, `ink-testing-library` `^4.0.0`, Commander `^14.0.0`, TypeScript `^5.9.2`, and Vitest `^3.2.4`.
- Current package registry check on 2026-05-12 returned Ink `7.0.2`, React `19.2.6`, `ink-testing-library` `4.0.0`, Commander `14.0.3`, TypeScript `6.0.3`, and Vitest `4.1.6`; do not upgrade TypeScript/Vitest/Commander just for this story.
- Official Ink docs confirm Ink is a React renderer for command-line apps with React-style components and terminal hooks; the GitHub README notes it may document upcoming Ink behavior and stable release details should be checked through npm. Treat local installed versions and existing tests as the implementation contract.
- Ink docs note `renderToString()` does not run terminal-specific hooks like live `useInput()` behavior. Continue to use `ink-testing-library` for interactive key/input tests rather than relying only on static rendering.

### UX / UI Guardrails

- Slash command suggestions should be concise and visible only while typing slash input.
- Runtime command results should feel like assistant/system messages in the conversation area, not like always-on debug panels.
- Preserve the user's preferred TUI shape from Story 6.4: minimal header, prompt-first bottom area, hidden diagnostics by default, no noisy labels like `[Footer]`, and no heavy bordered modal for normal command feedback.
- Do not submit slash commands as user prompts. A mistyped slash command should produce a recoverable slash-command error, not start a task.
- Keep `/details` sticky; keep `/runtime` and `/context` temporary unless the user explicitly asks for persistent details.
- Display non-color-only status tokens such as `OK`, `ERROR`, `UNAVAILABLE`, `MISSING_ARG`, `UNSUPPORTED`, and `NEXT` so status is understandable without color.
- Redact secret-like values in command args, session paths, memory previews, learning-review snippets, provider auth state, and errors.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`, Ink, React, Commander, or terminal renderer code.
- `packages/tui` may define slash command parse/result contracts and renderer behavior, but runtime/service dispatch should stay behind a typed port.
- `packages/cli` may bridge TUI command intents to `AgentRuntime`, compaction/session helpers, memory/skill/tool services, and safe render results.
- Renderer code must not read/write session files directly; use runtime/CLI bridge helpers or core/storage service functions outside React rendering.
- Slash commands must not execute commands, apply patches, approve policy requests, mutate memory, promote skills, or write sessions unless routed through an existing explicit runtime/service API for that purpose.
- If a new public helper is added to `packages/tools`, `packages/memory`, `packages/skills`, or `packages/core`, keep it small, typed, tested, and adapter-neutral.
- Keep `packages/rpc` untouched unless implementation discovers a shared schema helper that is explicitly adapter-neutral; Story 7 owns JSON-RPC.

### Testing Requirements

- Use Vitest and existing deterministic test patterns.
- Prefer pure parser/unit tests for command parsing and suggestions.
- Use `ink-testing-library` for live workbench interaction tests where key input matters.
- Use real `AgentRuntime` fixtures only where needed to prove bridge semantics for resume, compaction preconditions, memory/skill listing, and dispatch errors.
- No live provider, network calls, risky command execution, uncontrolled terminal sessions, or raw `.sprite` private state committed as fixtures.
- Include redaction assertions for secret-like command args and service errors.
- Preserve all existing TUI tests from Stories 6.3/6.4, especially bounded live approval edit, hidden diagnostics, submitted prompt cards, and cancel prompt placement.

### Project Structure Notes

Expected implementation stays inside:

- `packages/tui/src` for slash command parser/contracts/suggestions and renderer result display.
- `packages/cli/src/index.ts` for thin live bridge dispatch, unless extracted helper modules become necessary.
- `packages/tools/src/tool-registry.ts` only if a public tool-list source of truth is needed.
- `tests/` for cross-package TUI/CLI/runtime fixture coverage.

Avoid:

- Adding a new dependency.
- Creating a second runtime loop or UI-owned session store.
- Implementing Story 6.6 full final summary/learning review UI.
- Implementing Story 7 JSON-RPC.
- Reintroducing noisy always-visible diagnostic panels.

### Open Questions for Implementation

- Should `/new` create a new `AgentRuntime` inside the live CLI bridge immediately, or should it return `unsupported` until a runtime-owned session reset API exists?
- Should `/resume` require an explicit session ID for MVP, or should `/resume` with no args show a bounded recent-session list first?
- Should `/memory` show durable memory entries, memory candidates, or both in the first slice?
- Should `/skills` show manual skills, skill candidates, or both in the first slice?
- Should `/compact` default to the current visible session ID only when `state.runtimeState.session.sessionId` exists, or should it also inspect latest local session state?
- Should slash command result cards be part of `TuiLiveWorkbenchState` so parent updates can control them, or presentation-local state inside `TuiWorkbenchApp`?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created on 2026-05-12 after Story 6.4 and the bounded live approval edit follow-up were committed and pushed in `fd3a48b`.
- Loaded BMad create-story workflow, sprint status, Epic 6 Story 6.5, PRD slash command requirements, architecture adapter/runtime boundaries, current TUI slash implementation, current CLI live bridge, current runtime APIs, current package versions, GitNexus query output, and previous Story 6.3/6.4 implementation notes.
- External research checked Ink and npm package status on 2026-05-12; no dependency change is required for this story.
- This story file intentionally does not modify implementation code.

### Completion Notes List

- Created ready-for-dev Story 6.5 context for slash commands as typed runtime intents.
- Preserved current Story 6.4 UI/UX decisions while expanding slash commands beyond local diagnostics.
- Scoped JSON-RPC, full learning-review panels, provider model switching, and skill/memory mutation out unless existing safe runtime APIs already support them.

### File List

- `_bmad-output/implementation-artifacts/6-5-implement-slash-commands-as-runtime-intents.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-12: Created Story 6.5 and marked it ready-for-dev in sprint status.
