---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/6-1-render-minimal-tui-startup-and-runtime-state.md
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-05-11.md
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'TUI UX/UI for Sprite Harness runtime-state workbench'
research_goals: 'Define UX/UI guardrails for Epic 6 Story 6.1 before implementation, focusing on state visibility, redaction, adapter-thin architecture, and dependency timing.'
user_name: 'Chinnaphat'
date: '2026-05-11'
web_research_enabled: true
source_verification: true
---

# Research Report: TUI UX/UI for Sprite Harness Runtime-State Workbench

**Date:** 2026-05-11
**Author:** Chinnaphat
**Research Type:** Technical UX/UI research
**Story:** 6.1 Render Minimal TUI Startup and Runtime State

---

## Research Overview

This research combines local Sprite Harness requirements with current public references for terminal UX, accessibility, and terminal UI implementation. The goal is not to design the full Epic 6 interface yet; it is to decide what Story 6.1 should safely implement first.

Story 6.1 should create a trustworthy state presentation contract before a rich renderer. The TUI must make runtime state visible, but runtime truth remains owned by `AgentRuntime`, runtime events, and safe exported state snapshots.

---

## Local Product Constraints

Sprite Harness already defines the TUI as a thin adapter over one shared runtime:

- CLI, TUI, print mode, and JSON-RPC share `AgentRuntime`.
- TUI renders runtime events and safe state snapshots; it must not own task lifecycle state.
- TUI must show cwd, session state, provider/model, sandbox mode, loaded context, loaded skills, and memory state without leaking secrets.
- Skill candidates must remain visually and semantically separate from promoted manual skills.
- Core runtime must stay testable without launching a TUI renderer.

Sources:

- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/6-1-render-minimal-tui-startup-and-runtime-state.md`
- `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-11.md`

---

## External UX/UI Findings

### 1. Terminal UX should prioritize clarity, defaults, and predictable state

The CLI Guidelines project emphasizes human-first command-line interfaces: clear output, predictable behavior, helpful errors, and progressive detail. For Sprite Harness, this means the startup state should be understandable at a glance, with details bounded and expandable later rather than dumped all at once.

Source: https://clig.dev/

Implication for Story 6.1:

- Default view should be a compact "runtime state card", not a wall of raw JSON.
- State labels should be stable and predictable: `cwd`, `session`, `provider`, `model`, `sandbox`, `context`, `memory`, `skills`, `warnings`.
- Long paths, raw warnings, skill metadata, and memory snippets should be summarized.

### 2. Visibility of system status is a core UX heuristic

Nielsen Norman Group's usability heuristics include visibility of system status, user control, consistency, error prevention, and recognition over recall. A coding-agent TUI is high-trust software: the user needs to know what environment the agent is operating in before allowing it to read, edit, run commands, or learn.

Source: https://www.nngroup.com/articles/ten-usability-heuristics/

Implication for Story 6.1:

- The top of the TUI should communicate "where am I, what runtime am I using, and what safety mode is active?"
- Missing provider, missing memory, skipped context, or warning states should be visible without needing commands.
- Labels should use user-facing language, not internal type names.

### 3. Accessibility means do not rely on color alone

WCAG guidance around use of color means status and warnings should not be communicated only through color. Terminal UIs are also affected by themes, low-contrast terminals, monochrome logs, and copy/paste output.

Sources:

- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

Implication for Story 6.1:

- Use text labels and symbols in addition to color: `OK`, `MISSING`, `LOCKED`, `WARN`, `REDACTED`.
- Tests should validate serialized state/text content, not ANSI color.
- Renderer should be optional for Story 6.1; state contract should be testable without terminal color support.

### 4. Ink is still the natural renderer, but Story 6.1 should not need it yet

Ink provides React-style terminal UI primitives and is suitable for interactive command-line apps. Current registry checks on 2026-05-11 showed:

- `ink`: 7.0.2
- `react`: 19.2.6
- `ink-testing-library`: 4.0.0

Sources:

- https://github.com/vadimdemedes/ink
- https://www.npmjs.com/package/ink

Implication for Story 6.1:

- Defer Ink/React dependency unless acceptance requires a live renderer now.
- First build pure read-model functions and deterministic text/state output.
- Add Ink later when Story 6.2/6.3 needs live message streams, input, approvals, and layout interaction.

### 5. Existing agent CLIs converge on command/status visibility and explicit controls

Modern terminal agent tools expose command surfaces, status, context, model/provider information, and permission/approval flows. The common lesson is not to hide capability boundaries: the user should see what the agent can access and what mode it is operating under.

Sources:

- OpenCode TUI docs: https://opencode.ai/docs/tui/
- Gemini CLI docs: https://google-gemini.github.io/gemini-cli/docs/cli/
- Claude Code command docs: https://code.claude.com/docs/en/commands

Implication for Story 6.1:

- Show runtime capability state early, even before full interaction exists.
- Keep future slash commands and approvals out of Story 6.1 implementation unless required.
- Use Story 6.1 as a foundation for later message stream/input/approval stories.

---

## Recommended Story 6.1 UX Direction

### Display model

Implement a compact state model that can later be rendered by Ink, plain text, JSON, or tests:

```txt
Sprite Harness
cwd: ~/project/Sprite_harmess
session: active | resumed | none
provider: openai-compatible / model: gpt-x / auth: configured
sandbox: workspace-write / approvals: on-request
context: 3 loaded, 1 skipped
memory: available, 2 relevant items
skills: 4 active manual skills
candidates: 2 drafts, 1 pending review
warnings: 1
```

This is intentionally a read model, not a UI-owned task model.

### Layout hierarchy for later renderer

For Epic 6, converge toward a three-zone terminal workbench:

1. **Header / trust strip** — cwd, session, provider/model, sandbox, auth-redacted state.
2. **Main activity area** — message stream, tool calls, results, approvals, validation output. This begins in Story 6.2.
3. **State side/bottom panel** — context, memory, skills, warnings, learning/review state.

Story 6.1 should implement the data contract and minimal textual representation for zones 1 and 3 only.

### Visual language

Use stable textual tokens:

- `OK` — available/configured/loaded.
- `MISSING` — expected but unavailable.
- `WARN` — non-fatal issue.
- `REDACTED` — intentionally hidden value.
- `CANDIDATE` — not active behavior.
- `ACTIVE` — promoted manual skill or current runtime state.

Avoid:

- raw absolute paths where basename/relative label is enough;
- raw provider env var names or token hints;
- raw memory snippets in startup view;
- raw `SKILL.md` body;
- candidate bodies/diffs/patches in broad status panes;
- color-only status.

---

## Architecture Recommendation

Use this implementation sequence:

1. Add pure TUI state/read-model exports in `packages/tui/src/index.ts`.
2. Add focused tests in `tests/tui-state.test.ts`.
3. Import only safe exported runtime/core/shared contracts.
4. Do not add Ink/React in Story 6.1 unless the pure state model cannot satisfy acceptance criteria.
5. Do not add `sprite tui` yet unless required by acceptance; CLI entry can wait until interactive stories.

Suggested function names:

- `createTuiStartupState(input)`
- `createTuiRuntimeState(input)`
- `formatTuiStateSummary(state)`

Suggested exported state areas:

- `workspace`
- `session`
- `provider`
- `sandbox`
- `context`
- `memory`
- `skills`
- `skillCandidates`
- `warnings`

---

## Test Strategy

Story 6.1 tests should prove:

- visible state derives from supplied runtime/bootstrap/task-context snapshots;
- no separate TUI task lifecycle model exists;
- provider auth and secret-like values are redacted or omitted;
- long strings/lists are bounded;
- active manual skills and candidates are separate;
- output is deterministic without launching an interactive renderer;
- color is not required to understand status.

---

## Decision

Proceed with development, but keep Story 6.1 as a state-contract story:

- **Do now:** pure state model, safe formatter, adapter-boundary tests.
- **Defer:** Ink renderer dependency, full screen layout, multiline input, approval response UI, slash commands, message stream, and learning review panes.

This gives Epic 6 a UX foundation without introducing UI coupling or dependency churn too early.
