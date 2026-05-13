# Story 6.6: Show Final Summary and Learning Review Outputs in TUI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want final summaries and learning reviews surfaced in the TUI,
so that I can understand task outcomes and learning without opening raw artifacts.

## Acceptance Criteria

1. Given a task completes, fails, cancels, or stops for approval-required input, when the runtime emits terminal task and summary events, then the TUI displays final status, changed files, commands run, validation results, unresolved risks, and next steps when available.
2. Given the runtime creates a learning review, when the TUI receives the learning event, then it displays facts, lessons, mistakes, test gaps, memory candidates, skill signals, and relevant reuse evidence.
3. Given final summary or learning review output contains secret-like values, absolute private paths, raw provider credentials, raw memory contents, or oversized lists, when the TUI renders it, then visible values are redacted, bounded, or summarized and no credential value is displayed.
4. Given terminal and learning outputs are visible, when the user continues using the live TUI, then the prompt-first workbench remains usable: slash suggestions stay near input, diagnostics stay hidden unless requested, and final/learning cards do not become noisy always-on debug panels.
5. Given `/review-learning [sessionId]` is used after this story, when a learning review exists for the visible or requested session, then the command can open or surface the richer bounded learning-review panel/data instead of only listing lesson metadata.
6. Given tests run for this story, when final-summary and learning-review renderers, live TUI updates, slash review-learning behavior, and CLI bridge paths are exercised, then deterministic tests cover terminal states, no-provider/network operation, redaction/bounding, and no inference from free-form assistant text.

## Tasks / Subtasks

- [x] Confirm implementation surface and GitNexus blast radius before code edits (AC: 1-6)
  - [x] Inspect current exports and tests for `createFinalTaskSummary`, `FinalTaskSummary`, `learning.review.created`, `TuiMessageStreamItem`, `TuiLiveWorkbenchState`, `TuiWorkbenchApp`, `handleLiveTuiInteraction`, and `/review-learning` bridge behavior.
  - [x] Run GitNexus impact analysis before editing existing symbols such as `createTuiLiveWorkbenchState`, `createTuiMessageStream`, `TuiWorkbenchApp`, `handleLiveTuiInteraction`, `createLiveTuiLearningReviewResult`, or `createFinalTaskSummary`; report risk and direct callers before edits.
  - [x] Keep scope to TUI presentation/read-model wiring; do not change runtime lifecycle semantics, memory/skill mutation policy, provider behavior, or JSON-RPC.

- [x] Add final-summary read model and formatter in `packages/tui` (AC: 1, 3, 6)
  - [x] Import/use the existing `FinalTaskSummary` shape from `@sprite/core`; do not create a parallel final-summary schema in the TUI.
  - [x] Add typed TUI read-model contracts such as `TuiFinalSummaryView`, `TuiFinalSummarySection`, and/or `TuiFinalSummaryLine` in `packages/tui/src/index.ts` or a small extracted module if file size becomes unreviewable.
  - [x] Add pure helpers such as `createTuiFinalSummaryView(summary, options)` and `formatTuiFinalSummary(view)` that display status, result/next step, provider/model status, session/task/correlation IDs, files read/changed/proposed, important terminal/recovery events, memory/skill influences, unresolved risks, and not-attempted notes.
  - [x] Include command and validation evidence by deriving from typed runtime events already in the live state (`tool.call.*`, `validation.*`, policy/approval events) rather than parsing prose from assistant messages.
  - [x] Bound lists and strings consistently with existing TUI helpers (`createSafeString`, `createBoundedList`, `TUI_OUTPUT_PREVIEW_MAX_BYTES`, `TUI_OUTPUT_PREVIEW_MAX_LINES`) and never expose raw absolute/private paths beyond existing safe previews.

- [x] Add learning-review read model and formatter in `packages/tui` (AC: 2, 3, 5, 6)
  - [x] Use existing learning-review event payload fields (`factCount`, `lessonCount`, `mistakeCount`, `testGapCount`, `memoryCandidateIds`, `skillSignalIds`, `proceduralOutputIds`, `evidenceEventIds`, `artifactPath`, `mode`, `status`, `summary`) as the minimum event-driven panel source.
  - [x] When richer learning-review artifact reads are needed, route them through CLI/runtime/storage bridge code outside React rendering; renderer code must not read `.sprite` files directly.
  - [x] Add typed contracts such as `TuiLearningReviewView` and pure helpers such as `createTuiLearningReviewView(...)` / `formatTuiLearningReview(...)` to show facts, lessons, missed assumptions, mistakes, test gaps, memory candidates, skill signals/procedural outputs, evidence IDs, and reuse influence status when available.
  - [x] Reuse current `readLearningReviewLessonCandidates()` behavior for bounded metadata, but extend it or add a small adapter-neutral storage/core helper only if the full review artifact is required; keep any new helper schema-validated and tested.
  - [x] Ensure display is candidate/review-only: do not accept, reject, edit, save, promote, or mutate memory/skills from this story.

- [x] Integrate final and learning outputs into live workbench display (AC: 1-5)
  - [x] Extend `TuiLiveWorkbenchState` or derived view construction so terminal task states and learning-review events produce stable final-summary/learning-review cards.
  - [x] Render cards in `TuiWorkbenchApp` near the conversation/activity area after command results and before/around recent activity, without making diagnostics permanently visible.
  - [x] Preserve existing Story 6.4/6.5 UX: minimal header, prompt-first bottom area, hidden `/runtime` and `/context` panels by default, sticky `/details`, submitted prompt cards, bounded command result cards, approval cards, and slash suggestions.
  - [x] Avoid duplicate cards on re-render or repeated event replacement; key cards by task/session/event IDs, not by local render counters alone.
  - [x] Make `/review-learning [sessionId]` return or surface richer bounded review data when available, while keeping safe `UNAVAILABLE`/`OK empty` results when no review exists.

- [x] Add deterministic tests and fixtures (AC: 1-6)
  - [x] Add pure formatter/state tests proving final summary display includes terminal status, changed/proposed/read files, command/validation evidence, unresolved risks, not-attempted notes, memory influence, and skill influence.
  - [x] Add learning-review formatter/state tests for facts, lessons, missed assumptions, mistakes, test gaps, memory candidates, skill signals/procedural outputs, evidence IDs, and compact/empty review behavior.
  - [x] Add live Ink workbench tests proving final-summary and learning-review cards appear after terminal/learning events and stay redacted/bounded.
  - [x] Add `/review-learning` CLI bridge tests proving it does not submit as a prompt, does not read raw artifacts from renderer code, and surfaces richer bounded review data or honest unavailable state.
  - [x] Add regression tests for secret-like values in result text, event summaries, artifact paths, memory/skill IDs, command output references, and approval/validation summaries.
  - [x] Keep tests deterministic: no live provider, network access, uncontrolled terminal, risky command execution, or committed private `.sprite` raw artifacts.

- [x] Validate and advance status during development (AC: 1-6)
  - [x] Start development by moving this story and sprint status to `in-progress`.
  - [x] Run targeted tests first, e.g. `npm test -- --run tests/tui-live-workbench.test.tsx tests/tui-message-stream.test.ts tests/cli-tui-live.test.ts tests/runtime-loop.test.ts` or updated equivalents.
  - [x] Run full validation before review: `rtk run 'git diff --check && npm run lint && npm test'`.
  - [x] Run GitNexus detect/analyze/status before commit according to project rules: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'`.
  - [x] Move status to `review` only after implementation validation passes; move to `done` only after code-review fixes and validation pass.

## Dev Notes

### Story Intent

Story 6.6 completes the Epic 6 visible-outcome loop. The TUI already shows startup/runtime state, recent message/tool activity, approvals, multiline input, live shell launch, and typed slash command results. This story should make task-ending information and learning outputs first-class TUI cards so the user can finish a task from the live workbench without opening CLI print output or raw `.sprite` learning artifacts.

The main implementation rule is still adapter thinness: the TUI may derive display state from `FinalTaskSummary`, typed runtime events, safe storage/core bridge helpers, and bounded view models. It must not infer completion from assistant prose, read raw session files from React components, mutate memory or skills, or create a second task lifecycle model.

### Source Requirements

- Epic 6 exists to let users steer the runtime through a richer terminal workbench showing messages, tool activity, approvals, changed files, validation, memory, skills, model, session, and slash-command controls. [Source: `_bmad-output/planning-artifacts/epics.md` Epic 6]
- Story 6.6 requires TUI display of final status, changed files, commands run, validation results, unresolved risks, next steps, and learning-review facts/lessons/mistakes/test gaps/memory candidates/skill signals/reuse evidence with secrets redacted. [Source: `_bmad-output/planning-artifacts/epics.md` Story 6.6]
- FR61 requires the TUI to display messages, tool activity, approvals, changed files, validation results, context state, memory state, model state, session state, and learning review outputs. [Source: `_bmad-output/planning-artifacts/prd.md` FR61]
- The PRD says MVP success includes a concise final summary, and visible learning requires structured post-task learning reviews with facts, lessons, mistakes, test gaps, memory candidates, and skill candidates/signals. [Source: `_bmad-output/planning-artifacts/prd.md` Success Criteria and Learning Success]
- NFR24 requires final summaries to identify changed files, commands run, validation results, and unresolved risks when available. [Source: `_bmad-output/planning-artifacts/prd.md` NFR24]
- NFR25 requires learning reviews to distinguish facts, lessons, mistakes, test gaps, memory candidates, and skill signals. [Source: `_bmad-output/planning-artifacts/prd.md` NFR25]
- NFR11 requires provider credentials not to be displayed in CLI, TUI, logs, RPC state, summaries, or learning reviews. [Source: `_bmad-output/planning-artifacts/prd.md` NFR11]
- Architecture requires CLI, TUI, print mode, and JSON-RPC to share one `AgentRuntime`; adapters decide presentation only. [Source: `_bmad-output/planning-artifacts/architecture.md` Project Context Analysis]
- Architecture defines the event stream as the spine for UI rendering, audit trails, session persistence, learning review, and tests. [Source: `_bmad-output/planning-artifacts/architecture.md` Architectural Decision Pressure Points]
- Architecture says adapter state is disposable and losing TUI/CLI/RPC process state must not change runtime truth. [Source: `_bmad-output/planning-artifacts/architecture.md` State Management Patterns]
- Architecture states memory and skills consume event history and learning reviews, not raw adapter state; secrets must not enter logs, summaries, memory, RPC state, or learning reviews. [Source: `_bmad-output/planning-artifacts/architecture.md` Component/Data Boundaries]
- TUI research recommends a three-zone workbench with header/trust strip, main activity area, and state side/bottom panel; learning/review panes were deferred until later Epic 6 stories. [Source: `_bmad-output/planning-artifacts/research/technical-tui-ux-ui-research-2026-05-11.md` Layout hierarchy and Decision]

### Previous Story Intelligence

Story 6.5 established the slash-command and bridge baseline this story should extend:

- `packages/tui/src/slash-commands.ts` now owns typed slash command names, parser, suggestions, results, result formatting, bounded session-id parsing, and redaction helpers.
- `TuiLiveWorkbenchInteraction` in `packages/tui/src/live-workbench.tsx` includes `{ type: "slash-command", intent, visibleSessionId }` for runtime slash commands.
- `TuiWorkbenchApp` renders submitted prompt cards, command result cards, dispatch status, recent activity cards, approval cards, slash suggestions, and a prompt-first footer.
- `handleLiveTuiInteraction()` in `packages/cli/src/index.ts` dispatches runtime slash intents and returns `TuiSlashCommandResult` for TUI-local command cards.
- `/review-learning [sessionId]` currently reads bounded learning-review lesson candidates via `readLearningReviewLessonCandidates(cwd, { artifactLimit: 5, candidateLimit: 5, sessionLimit: 20 })`; it intentionally shows metadata only and says Story 6.6 owns full panels.
- Code review for 6.5 fixed two redaction/state bugs: unsupported secret-like command names in command-card headers and `/compact` defaulting to the visible TUI session ID.
- Full 6.5 validation passed with `rtk run 'git diff --check && npm run lint && npm test'` (25 files, 374 tests), then GitNexus was re-indexed and status was clean before commit `e298245`.

Earlier Epic 6 guardrails still apply:

- Story 6.1 created pure runtime/TUI state view contracts and safe formatting with redaction and bounded lists.
- Story 6.2 added typed message stream mapping and explicitly avoids parsing final summary text to classify event families.
- Story 6.3 added typed submit/steer/cancel/approval response intents and bounded approval edit handling.
- Story 6.4 launched the live Ink workbench with hidden diagnostics by default and prompt-first interaction.

### Current Implementation Baseline

- `packages/core/src/final-task-summary.ts` exports `FinalTaskSummary` and `createFinalTaskSummary(state)`. It includes status, result, provider/model, important events, memory influences, skill influences, files changed/proposed/read, unresolved risks, not-attempted notes, session ID, task ID, and correlation ID.
- CLI/print output already renders final summary text through private `formatFinalSummaryLines()` inside `packages/core/src/agent-runtime.ts`, but that formatter is not a TUI view model and is not exported for Ink rendering.
- `AgentRuntime.completeActiveTask()` and related terminal paths use `createFinalTaskSummary()` for learning-review generation; `createLearningReviewForCompletedTask()` emits `skill.signal.recorded` and `learning.review.created` events and persists the review through the session store.
- `learning.review.created` payloads currently expose summary/count metadata, artifact path, evidence event IDs, memory candidate IDs, skill signal IDs, procedural output IDs, mode, and status.
- `packages/memory/src/index.ts` defines `LearningReview`, `LearningReviewSectionItem`, `LearningReviewEvidence`, `LearningReviewMemoryCandidateReference`, and `LearningReviewSkillSignal` with facts, lessons, missed assumptions, mistakes, test gaps, memory candidates, procedural outputs, and skill signals.
- `packages/storage/src/session-store.ts` exposes `readLearningReviewLessonCandidates()` for safe bounded lesson metadata; it does not currently provide a full TUI panel read model.
- `packages/tui/src/index.ts` already has `TuiRuntimeViewState`, `TuiMessageStream`, `TuiMessageStreamItem`, `createTuiRuntimeState()`, `createTuiMessageStream()`, `createTuiEventStreamItem()`, `createTuiLiveWorkbenchState()`, `reduceTuiLiveWorkbenchEvent()`, and `formatTuiLiveWorkbenchPreview()`.
- `packages/tui/src/live-workbench.tsx` currently renders only the last three activity stream items. A terminal task event or learning event may appear as generic activity, but there is no dedicated final-summary or learning-review card.
- `packages/cli/src/index.ts` owns the live TUI runtime bridge. Keep bridge logic there (or in a CLI-local helper) when reading persisted learning artifacts; do not make React components call storage directly.
- `packages/rpc/src/index.ts` is still a placeholder; Story 7.6 owns RPC retrieval of final summaries and learning reviews.

### Suggested Contracts and Functions to Inspect

Review and adjust this list before implementation:

- `packages/core/src/final-task-summary.ts` — source of truth for final summary fields and unresolved-risk/not-attempted logic.
- `packages/core/src/agent-runtime.ts` — terminal task transitions, `createLearningReviewForCompletedTask()`, `formatFinalSummaryLines()` for CLI-only reference, and event collection helpers for commands/validations/memory/skills.
- `packages/core/src/runtime-events.ts` — `task.completed`, `task.failed`, `task.cancelled`, `task.waiting`, `learning.review.created`, `skill.signal.recorded`, `validation.*`, and redaction validation.
- `packages/memory/src/index.ts` — `LearningReview` types, `summarizeLearningReviewForEvent()`, section names, skill signal/procedural output rules, and secret validation.
- `packages/storage/src/session-store.ts` — current `readLearningReviewLessonCandidates()` and any possible safe full-review read helper location.
- `packages/tui/src/index.ts` — pure TUI state/read-model contracts, message stream/event mapping, bounded output previews, live state construction, and preview formatting.
- `packages/tui/src/live-workbench.tsx` — renderer placement for new final-summary and learning-review cards.
- `packages/tui/src/slash-commands.ts` — `/review-learning` parser/result shape; avoid breaking existing slash command semantics.
- `packages/cli/src/index.ts` — `handleLiveTuiInteraction()`, `dispatchLiveTuiSlashCommand()`, `createLiveTuiLearningReviewResult()`, `publishLiveState()`/state update behavior, and live command preview/demo paths.
- Tests to update or mirror: `tests/runtime-loop.test.ts`, `tests/runtime-events.test.ts`, `tests/tui-message-stream.test.ts`, `tests/tui-state.test.ts`, `tests/tui-live-workbench.test.tsx`, `tests/tui-slash-commands.test.ts`, `tests/cli-tui-live.test.ts`, and `tests/cli-smoke.test.ts`.

Expected new or changed contracts before implementation, subject to adjustment after inspection:

- `TuiFinalSummaryView`
- `TuiFinalSummarySection` or equivalent section/line item type
- `TuiLearningReviewView`
- `TuiLearningReviewSection` or equivalent section/line item type
- `createTuiFinalSummaryView(summary, options)`
- `formatTuiFinalSummary(view)`
- `createTuiLearningReviewView(input, options)`
- `formatTuiLearningReview(view)`
- Optional `TuiOutcomePanels`/`TuiTaskOutcomeView` on `TuiLiveWorkbenchState` if needed to avoid recomputing and duplicate rendering
- Optional adapter-neutral storage/core helper to read a full bounded learning-review artifact for one session/task

### UX / UI Guardrails

- Final summary should feel like the concluding assistant/system card, not a debug dump. Prefer concise sections with labels such as `Final summary`, `Files changed`, `Validation`, `Risks`, `Next steps`, and `Learning review`.
- Preserve prompt-first layout: new cards belong in the conversation/activity area; the input footer and slash suggestions remain near the bottom.
- Do not make `/runtime`, `/context`, or `/details` visible by default. Dedicated outcome cards are allowed after terminal/learning events because they are task results, not diagnostics.
- Display status in text, not color alone: `completed`, `failed`, `cancelled`, `waiting-for-input`, `max-iterations`, `recorded`, `none`, `redacted`, etc.
- Bounded lists should show a clear hidden count (for example `+3 more`) rather than silently dropping data.
- If no files changed, no validation ran, or no learning review exists, show an honest `none` / `not attempted` / `unavailable` state rather than implying success.
- Avoid repeating the same summary card every render; use event/task identity to keep display stable.
- Keep `/review-learning` command output compatible with command cards, but let it open/return richer review content when available.

### Architecture Compliance Guardrails

- `packages/core` must not import from `packages/tui`, Ink, React, Commander, or CLI renderer code.
- `packages/tui` may import type-safe core/memory/shared contracts and may create pure view models; it must not read or write session files.
- `packages/cli` may bridge runtime/session/storage data into TUI-safe results because it already owns `AgentRuntime` and cwd/session context.
- Do not duplicate `createFinalTaskSummary()` logic. If the TUI needs more fields, add them at the core summary boundary with tests rather than recalculating lifecycle truth in the renderer.
- Do not parse final summary or learning-review information from assistant text, CLI-formatted strings, or raw markdown/prose logs.
- Do not mutate memory candidates, skill candidates, procedural outputs, sessions, provider config, or approvals from final-summary/learning panels.
- Do not implement Story 7.6 RPC summary/review retrieval, provider auth changes, or a new hosted/frontend dashboard here.
- Any new persisted artifact helper must validate schema versions and preserve redaction; avoid adding new dependencies.

### Library / Framework Notes

- Current local implementation uses Ink and React only in `packages/tui/src/live-workbench.tsx`; pure TUI contracts live in `packages/tui/src/index.ts` and remain deterministic without launching a live renderer.
- `packages/tui/package.json` currently depends on `ink` `^7.0.2` and `react` `^19.2.6`; `ink-testing-library` `^4.0.0` is a dev dependency. No dependency upgrade is required for this story.
- Root scripts remain `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test`; the user requested `rtk run` wrapping for validation commands.
- Keep TypeScript ESM imports consistent with existing `.js` extension import style.

### Testing Requirements

- Use Vitest and existing test helpers/fixtures. Prefer pure formatter/state tests before Ink renderer tests.
- Use `ink-testing-library` only where live input/render placement matters.
- Tests must assert output does not contain secret sentinels such as `OPENAI_API_KEY=...`, `TOKEN=...`, raw provider auth values, or raw private cwd strings.
- Tests must assert summary/review cards are derived from typed events and `FinalTaskSummary`, not from arbitrary text containing words like `final summary`, `validation failed`, or `warning`.
- Include terminal-state coverage for `completed`, `failed`, `cancelled`, and approval-required/waiting state. Include learning-review coverage for both event-only counts and richer artifact-backed sections if implemented.
- Preserve existing slash command tests from Story 6.5 and update them only for the richer `/review-learning` behavior.
- Full validation target before review: `rtk run 'git diff --check && npm run lint && npm test'`.

### Project Structure Notes

Expected implementation stays inside:

- `packages/tui/src/index.ts` or a small sibling module for pure final-summary/learning-review view models and formatters.
- `packages/tui/src/live-workbench.tsx` for renderer card placement.
- `packages/cli/src/index.ts` or a small CLI-local helper for richer `/review-learning` bridge behavior.
- `packages/core/src/final-task-summary.ts` only if a missing field belongs in the core final-summary contract.
- `packages/storage/src/session-store.ts` or `packages/core/src/index.ts` only if a safe adapter-neutral full-review read helper is required.
- `tests/` for deterministic cross-package coverage.

Avoid:

- Adding new packages.
- Editing `packages/rpc` for summary/review retrieval.
- Writing renderer-local filesystem readers.
- Creating another session state model in TUI.
- Moving existing CLI print summary formatting into TUI without converting it to a typed safe view model first.

### Open Questions for Implementation

- Should the first implementation render learning-review event/count metadata only, or add a safe full-review artifact helper in the same story to show facts/lessons/mistakes/test gaps text?
- Should final-summary cards be computed from the latest active/resumed `PlannedExecutionFlow`, from terminal events plus `createFinalTaskSummary()`, or passed in from the CLI bridge when terminal state changes?
- Should `/review-learning` open a persistent learning panel, append a command result card with richer items, or both?
- Should command evidence in the final summary include all `tool.call.*` events or only shell-like command/validation events for the `commands run` AC?

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Created on 2026-05-13 after Story 6.5 was implemented, reviewed, validated, committed as `e298245`, and GitNexus was re-indexed cleanly.
- Loaded BMad dev-story workflow, project config, sprint status, full Story 6.6 context, and verified no project-context.md was present.
- Completed read-only style/context pass across `packages/tui`, `packages/cli`, `packages/core`, `packages/storage`, and existing TUI/CLI/runtime tests before edits.
- GitNexus pre-edit impact checks completed. `createTuiLiveWorkbenchState` and `createFinalTaskSummary` reported CRITICAL blast radius; implementation kept `createFinalTaskSummary` unchanged and constrained live-state changes with full affected-path tests.
- Red phase confirmed with failing targeted tests for missing final-summary/learning-review helpers, live cards, CLI final-summary bridge, and richer `/review-learning` output.
- Targeted green validation passed: `rtk run 'npm test -- --run tests/tui-outcome-panels.test.ts tests/tui-live-workbench.test.tsx tests/cli-tui-live.test.ts'` (28 tests).
- Full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (26 test files, 379 tests).
- GitNexus re-index/status passed: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` (5,918 nodes, 10,611 edges, status up-to-date).
- Code review found and patched live learning-review richness, final-summary event alignment, and CLI private-path redaction gaps.
- Post-review targeted validation passed: `rtk run 'npm test -- --run tests/tui-outcome-panels.test.ts tests/tui-live-workbench.test.tsx tests/cli-tui-live.test.ts'` (28 tests).
- Post-review full validation passed: `rtk run 'git diff --check && npm run lint && npm test'` (26 test files, 379 tests).

### Review Findings

- [x] [Review][Patch] Live learning-review cards only surfaced event count metadata instead of rich facts/lessons/mistakes/test gaps — fixed by bridging artifact-backed learning review details through CLI state construction while keeping React renderers file-read free. [`packages/cli/src/index.ts`, `packages/tui/src/index.ts`, `tests/cli-tui-live.test.ts`, `tests/tui-live-workbench.test.tsx`]
- [x] [Review][Patch] Final-summary cards were built from the active task while command/validation evidence came from the passed event list, which could make displayed outcome evidence drift — fixed by creating the summary from the active task with the same event list used for the live TUI state. [`packages/cli/src/index.ts`]
- [x] [Review][Patch] CLI slash result safe strings redacted secrets but not all private absolute paths, including `/tmp/...` fixture paths — fixed by applying private-path redaction before bounded slash result formatting. [`packages/cli/src/index.ts`, `tests/cli-tui-live.test.ts`]

### Completion Notes List

- Added typed TUI final-summary and learning-review view models plus pure formatters derived from `FinalTaskSummary` and typed runtime events, not assistant prose.
- Wired live TUI state so terminal/approval-required task states can surface a stable final-summary card while learning-review events produce bounded learning cards.
- Rendered final-summary and learning-review cards in the conversation area without exposing diagnostics by default or moving slash suggestions/input away from the bottom prompt area.
- Added a schema-validated storage/core bridge to read bounded full learning-review artifacts and updated `/review-learning [sessionId]` to surface richer review data through safe command result cards.
- Added redaction/bounding coverage for secret-like values, absolute private paths, command/validation evidence, memory/skill influences, and learning-review sections.

### File List

- `_bmad-output/implementation-artifacts/6-6-show-final-summary-and-learning-review-outputs-in-tui.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/cli/src/index.ts`
- `packages/core/src/index.ts`
- `packages/storage/src/session-store.ts`
- `packages/tui/src/index.ts`
- `packages/tui/src/live-workbench.tsx`
- `tests/cli-tui-live.test.ts`
- `tests/tui-live-workbench.test.tsx`
- `tests/tui-outcome-panels.test.ts`

### Change Log

- 2026-05-13: Created Story 6.6 and marked it ready-for-dev in sprint status.
- 2026-05-13: Implemented Story 6.6 final-summary and learning-review TUI panels; added richer `/review-learning` output and deterministic validation coverage.
