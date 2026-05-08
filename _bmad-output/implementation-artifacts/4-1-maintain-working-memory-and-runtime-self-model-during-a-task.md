# Story 4.1: Maintain Working Memory and Runtime Self-Model During a Task

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to track current task memory and runtime self-state,
so that the agent can reason about what it is doing and what it is capable of.

## Acceptance Criteria

1. Given a task is active, when the runtime updates task-local context, then working memory records the current goal, plan, recent observations, files touched, commands run, and pending constraints.
2. Given working memory is recorded, then it is scoped to the current task/session and is not silently promoted to durable memory.
3. Given runtime capabilities are available, when the self-model is requested or injected into context, then it identifies available tools, loaded skills, provider state, sandbox state, context state, and memory state.
4. Given a capability is unavailable or not implemented, when the self-model is included, then it explicitly reports the limitation and does not overclaim unavailable tools, durable memory retrieval, provider capabilities, permissions, or skills.

## Tasks / Subtasks

- [x] Add first-class working-memory context contract (AC: 1, 2)
  - [x] Add `working-memory` to `TASK_CONTEXT_SOURCE_ORDER`, immediately after `runtime-self-model`.
  - [x] Add typed working-memory inputs in `packages/core/src/task-context.ts`, likely `WorkingMemorySnapshot`, `WorkingMemoryObservation`, and `WorkingMemoryCommand`.
  - [x] Add optional `workingMemory?: WorkingMemorySnapshot` to `TaskContextAssemblyInput`.
  - [x] Keep working memory separate from existing durable `memoryEntries`; do not represent current-task memory as a durable memory candidate.
  - [x] Include `schemaVersion`, `taskId`, `sessionId`, `updatedAt`, and `scope` in the snapshot.

- [x] Implement working-memory section creation (AC: 1, 2)
  - [x] Add `createWorkingMemorySection()` in `packages/core/src/task-context.ts`.
  - [x] If no snapshot is supplied, return a skipped section with an explicit reason.
  - [x] If a snapshot is supplied, include bounded previews for current goal, current plan, recent observations, files touched, commands run, pending constraints, decisions, and blockers.
  - [x] Add metadata counts for plan steps, observations, files, commands, constraints, decisions, blockers, and source event IDs.
  - [x] Redact or block secret-looking values with existing `containsSecretLikeValue()` / `createRedactedPreview()` patterns.
  - [x] Never include raw command output, raw tool output, file contents, approval payloads, credentials, tokens, or `.env` values.

- [x] Expand runtime self-model into a structured snapshot (AC: 3, 4)
  - [x] Add a helper such as `createRuntimeSelfModelSnapshot()` in `packages/core/src/task-context.ts`.
  - [x] Refactor existing `createRuntimeSelfModelSection()` to derive its content/metadata from the snapshot.
  - [x] Include provider state from `ResolvedProviderState | null`: provider name, model, auth state without secrets, streaming support, tool-call support, context window, and model identity.
  - [x] Include sandbox state from startup config: cwd, sandbox mode, output format, validation command count, and known approval/tool-execution limitations.
  - [x] Include context state: task context packet schema version, source order, compacted-context presence, and section/source limitations.
  - [x] Include memory state: working-memory availability, durable retrieval availability, candidate-store availability, safety rule count, and provider/source name when known.
  - [x] Include skill state: loaded skill names only when `skillEntries` are provided; otherwise explicitly report registry integration as unavailable/skipped.
  - [x] Preserve the current truthful limitation that provider-driven tool execution is not connected in this MVP loop.

- [x] Thread working memory through task request creation (AC: 1, 2)
  - [x] Extend `TaskRequestContextOptions` in `packages/core/src/runtime-loop.ts` with `workingMemory?: WorkingMemorySnapshot`.
  - [x] Pass `options.workingMemory` into `assembleTaskContextPacket()`.
  - [x] For new interactive tasks in `AgentRuntime.submitInteractiveTask()`, create an initial runtime-owned working-memory snapshot with the task goal, initial plan/known waiting state, current session/task IDs, and current constraints.
  - [x] For resumed tasks in `AgentRuntime.createResumedTask()`, create a resumed working-memory snapshot from persisted session state, latest plan, compacted context when present, file activity counts/lists, pending approvals count, last error, and next step.
  - [x] Keep resume no-replay semantics: no provider calls, tools, validations, approvals, file edits, or memory writes should be replayed only to build working memory.

- [x] Preserve existing task-context and compaction behavior (AC: 1, 2, 3, 4)
  - [x] Update tests that assert `TASK_CONTEXT_SOURCE_ORDER` and section indexes because adding `working-memory` intentionally shifts positions.
  - [x] Ensure `compacted-context` remains after `session-state` and before `project-context`.
  - [x] Ensure project context remains untrusted and durable memory remains governed/skipped when no memory entries exist.
  - [x] Do not add vector search, semantic memory storage, memory candidates, learning review generation, or skill promotion in this story.

- [x] Add deterministic tests before implementation (AC: 1, 2, 3, 4)
  - [x] RED test: task context source order includes `working-memory` after `runtime-self-model`.
  - [x] RED test: working-memory section is skipped when no snapshot is provided.
  - [x] RED test: working-memory section is included when snapshot is provided and includes goal, plan, observations, files, commands, and constraints as bounded previews.
  - [x] RED test: secret-looking values in working memory are redacted and never appear in serialized packets.
  - [x] RED test: runtime self-model metadata reports provider state, sandbox state, context state, memory state, and skill state.
  - [x] RED test: runtime self-model reports unavailable provider-driven tool execution and unavailable durable retrieval instead of overclaiming.
  - [x] Runtime-loop test: new task requests include initial working memory.
  - [x] Resume/session test: resumed task requests include task/session-scoped working memory without replaying side effects.
  - [x] Regression test: compacted context and project context sections still behave as Story 3.8 expects.

- [x] Update story evidence and lifecycle status (AC: 1, 2, 3, 4)
  - [x] Before code edits, report the exact functions/contracts you will touch.
  - [x] Run GitNexus impact checks before editing target symbols.
  - [x] Record implementation notes, changed files, and validation evidence in this story file.
  - [x] Run targeted validation before review: `rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/compaction.test.ts tests/memory-safety.test.ts'`.
  - [x] Run full validation before marking review-ready: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.

### Review Findings

- [x] [Review][Decision] Working-memory trust semantics for user-derived text need an architecture/product call — Resolved by preserving the Story 4.1 contract that working memory is trusted because the snapshot is runtime-owned, while adding explicit metadata/content labels that user-derived fields are descriptive and not policy-authoritative.
- [x] [Review][Patch] Active task working memory is seeded but not maintained during task-local runtime updates [`packages/core/src/agent-runtime.ts:377`, `packages/core/src/agent-runtime.ts:2710`] — Fixed by refreshing the active task context packet's working-memory section from current events/file activity after task updates, approvals, recovery actions, tool calls, validation, and manual file activity.
- [x] [Review][Patch] Runtime self-model underclaims available runtime tools [`packages/core/src/task-context.ts:436`] — Fixed by reporting runtime tool-registry availability and tool names separately from provider-driven tool execution, which remains explicitly unavailable/not-connected.
- [x] [Review][Patch] Runtime self-model omits approval and permission limitations [`packages/core/src/task-context.ts:176`, `packages/core/src/task-context.ts:340`] — Fixed by adding policy-governed approval/permission fields for risky commands/file edits and pending approval count.
- [x] [Review][Patch] Runtime self-model metadata can leak secret-like strings when content is redacted [`packages/core/src/task-context.ts:306`, `packages/core/src/task-context.ts:340`] — Fixed by sanitizing metadata string/string-array fields and using a safe cwd label instead of raw cwd in metadata.
- [x] [Review][Patch] Resumed command statuses can be reported as completed when they were only requested, denied, blocked, skipped, or failed [`packages/core/src/agent-runtime.ts:2629`] — Fixed by deriving command status from event lifecycle/status and excluding policy-only decisions from `commandsRun`.
- [x] [Review][Patch] Resumed working-memory provenance metadata is unbounded [`packages/core/src/agent-runtime.ts:2619`, `packages/core/src/task-context.ts:488`] — Fixed by bounding source event IDs to recent/contributing IDs and adding total event count metadata.
- [x] [Review][Patch] Working-memory preview can globally truncate away required categories [`packages/core/src/task-context.ts:993`] — Fixed by bounding/redacting each category independently before final preview assembly so required category labels remain represented.
- [x] [Review Rerun][Patch] Compacted resume commands were still over-reported as completed when only requested/blocked/skipped or policy-only — Fixed by deriving compacted command status from the compacted event summary, excluding approval/policy-only summaries from `commandsRun`, and adding resume regression coverage.
- [x] [Review Rerun][Patch] Blocked/skipped validations could be rendered as failed/planned in working memory — Fixed by extending `WorkingMemoryCommand.status` with `blocked` and `skipped`, mapping validation lifecycle statuses explicitly, and adding blocked-validation regression coverage.
- [x] [Review Rerun][Patch] Pending approvals were registered after working-memory refresh/persist, so approval-required context could underreport pending count — Fixed by registering the pending approval before refresh/persist and rolling back the pending record if persistence fails.
- [x] [Review Rerun][Patch] Provider-limits metadata could leak secret-looking provider/model strings outside the self-model section — Fixed by sanitizing provider-limits metadata with `createSafeMetadata()` and adding full-packet redaction coverage.
- [x] [Review Rerun][Patch] `updateTaskContextWorkingMemory()` was replace-only for restored/older packets without a working-memory section — Fixed by upserting the section and source order in canonical position.
- [x] [Review Rerun][Patch] Tight working-memory content budgets could still hide high-signal command/constraint details — Fixed by adding a compact formatting path that preserves category labels plus recent commands/constraints before falling back to labels-only output.

## Dev Notes

### Story Intent

Story 4.1 starts Epic 4 by making the current task’s working memory and runtime self-model explicit in the context packet. This is a **runtime context contract** story, not a durable memory story.

Implement this slice:

- Add a dedicated `working-memory` context source.
- Build safe, bounded working-memory snapshots for new and resumed tasks.
- Expand the runtime self-model so it truthfully reports capabilities and limitations.
- Keep durable memory represented honestly as unavailable/skipped until later Epic 4 stories.

Do not implement in this story:

- Episodic or semantic durable memory storage.
- Memory candidate persistence or review flows.
- Vector/semantic retrieval, Chroma, SQLite KG, MemPalace backend integration, or external memory providers.
- Post-task learning review generation.
- Skill candidate generation/promotion.
- New UI/TUI/RPC memory commands.
- Any auto-save of raw transcripts or working memory.

### Source Requirements

- Story 4.1 requires task-local working memory with current goal, plan, recent observations, files touched, commands run, and pending constraints. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.1]
- Story 4.1 requires working memory to be scoped to the current task/session. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.1]
- Story 4.1 requires the self-model to identify tools, loaded skills, provider state, sandbox state, context state, and memory state without overclaiming unavailable tools or permissions. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.1]
- PRD FR38 requires current-task working memory. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD FR42 requires runtime self-model state for tools, loaded skills, provider state, sandbox state, context state, and memory state. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD NFR10-NFR11 require secrets and credentials not to be saved or displayed in memory, CLI, TUI, logs, RPC state, summaries, or learning outputs. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- PRD NFR23 requires inspectable audit trail for memory changes, but this story should not create durable memory changes. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture states CLI/TUI/print/RPC must stay thin over one runtime and that runtime owns context assembly, memory interactions, event emission, tools, approvals, and learning outputs. [Source: `_bmad-output/planning-artifacts/architecture.md` Requirements Overview and Dependency Graph]
- Architecture states memory must be typed, bounded, provenance-aware, confidence-scored, and filtered; raw session history/secrets/large code chunks must not silently become long-term memory. [Source: `_bmad-output/planning-artifacts/architecture.md` Architectural Decision Pressure Points]
- Epic 3 retrospective says Story 4.1 must define working-memory and runtime self-model contracts before implementation and must not overclaim unavailable tools, providers, memory, skills, sandbox, or context state. [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-08.md` Critical Path Before Story 4.1 Development]
- Hermes/MemPalace research recommends Story 4.1 implement `WorkingMemorySnapshot` and `RuntimeSelfModelSnapshot` only, deferring durable retrieval/vector memory to Story 4.2+. [Source: `_bmad-output/planning-artifacts/research/technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md` Final Recommendation]

### Architecture Guardrails

- Keep task context assembly in `packages/core/src/task-context.ts`.
- Keep runtime request wiring in `packages/core/src/runtime-loop.ts`.
- Keep new/resumed task orchestration in `packages/core/src/agent-runtime.ts`.
- Keep CLI behavior unchanged unless tests prove a core-owned output needs adapter rendering.
- Do not add dependencies. Use the existing stack: Node `>=22`, TypeScript `^5.9.2`, Vitest `^3.2.4`.
- Do not make memory authoritative over system/developer/user policy. Source trust should remain:
  - runtime self-model: trusted,
  - working memory: trusted but current-task/session scoped,
  - compacted context: trusted persisted runtime state,
  - project context: untrusted,
  - durable memory: governed.
- Do not store raw working memory as long-term memory. Story 4.2 owns memory candidates.
- Do not add a `working_memory.updated` runtime event unless implementation genuinely needs an auditable update boundary. If added, validate it like other runtime events and forbid raw output/content fields.
- Prefer bounded previews and metadata counts over large serialized arrays.

### Current Codebase State

- `packages/core/src/task-context.ts` currently has source order:
  - `runtime-self-model`
  - `provider-limits`
  - `user-input`
  - `session-state`
  - `compacted-context`
  - `project-context`
  - `memory`
  - `skills`
- `createRuntimeSelfModelSection()` currently reports output format, sandbox mode, provider-driven tool execution limitation, and validation command count.
- `createProviderLimitsSection()` already reports provider capability/auth metadata without exposing secrets.
- `createMemorySection()` already represents durable memory as skipped when no entries exist and safety-evaluates supplied entries.
- `packages/memory/src/index.ts` already includes memory type `"working"`, but that should not be used to blur task-local working memory with durable memory candidates.
- `packages/core/src/runtime-loop.ts` creates `TaskRequest.contextPacket` through `assembleTaskContextPacket()`.
- `TaskRequestContextOptions` currently carries `compactedContext` and `sessionState`.
- `AgentRuntime.submitInteractiveTask()` creates the initial request before running the initial loop.
- `AgentRuntime.createResumedTask()` already passes compacted context and session state into `createTaskRequest()`.
- Story 3.8 added compacted-context restoration and tests; do not regress resume/compaction behavior.
- `.gitignore` may have local out-of-scope modifications in the working tree; do not stage it unless explicitly requested.

### Previous Story Intelligence

- Story 3.8 established `compacted-context` as a first-class task-context section and updated section-order tests. Story 4.1 must update those assertions deliberately, not accidentally.
- Story 3.8 preserved no-replay resume semantics. Building working memory during resume must not replay tools, validations, approvals, provider calls, file edits, memory writes, or compaction events.
- Story 3.8 review added bounded post-compaction recent-event handling and redaction coverage. Working memory must follow the same bounded/redacted pattern.
- Epic 3 retrospective warns that self-model truth rules are critical: unavailable tools, providers, memory, skills, sandbox state, and context state must be reported as unavailable rather than implied.
- Latest relevant commits:
  - `be2ade3` — recorded Epic 3 learning before persistent-memory work.
  - `03c3763` — closed compacted-context continuation after verified review.
  - `e667569` — preserved compacted continuity so resumed work needs no retelling.
  - `4b35cbe` — protected manual compaction audit history from persistence ambiguity.

### Hermes and MemPalace Adaptation Notes

- Hermes’ memory manager shows the value of a single memory lifecycle boundary, but Story 4.1 should only define local runtime snapshots, not a provider manager. [Source: `technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md` Hermes Agent Findings]
- Hermes’ memory tool freezes prompt-injected memory snapshots and avoids mutating prompt state mid-session. Sprite should similarly keep working-memory snapshots explicit and bounded rather than hidden prompt mutation. [Source: `technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md` Prompt-Cache-Safe Memory Injection]
- MemPalace’s layered memory stack maps cleanly to Sprite: L0 runtime self-model, L1 working memory, L2 governed memory candidates, L3 durable retrieval. Story 4.1 should implement only L0/L1. [Source: `technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md` MemPalace Findings]
- MemPalace’s evidence/provenance stance supports adding source event IDs to working memory metadata, but not storing raw transcripts. [Source: `technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md` MemPalace Findings]

### Suggested Contracts / Functions for Dev Planning

Before implementing, report the exact functions/contracts to the user. Likely candidates:

- `packages/core/src/task-context.ts`
  - add `WorkingMemoryObservation`
  - add `WorkingMemoryCommand`
  - add `WorkingMemorySnapshot`
  - add `RuntimeSelfModelSnapshot`
  - add `createRuntimeSelfModelSnapshot()`
  - update `createRuntimeSelfModelSection()`
  - add `createWorkingMemorySection()`
  - add `formatWorkingMemoryContent()` or equivalent local formatter
  - update `TASK_CONTEXT_SOURCE_ORDER`
  - update `TaskContextAssemblyInput`
  - update `summarizeTaskContextPacket()` only if new summary metadata requires it
- `packages/core/src/runtime-loop.ts`
  - update `TaskRequestContextOptions`
  - update `createTaskRequest()`
  - add/create helper for initial working-memory snapshot if best placed here
- `packages/core/src/agent-runtime.ts`
  - update `submitInteractiveTask()`
  - update `createResumedTask()`
  - add helper such as `createInitialWorkingMemorySnapshot()` / `createResumedWorkingMemorySnapshot()` if runtime state is needed
- Tests
  - `tests/task-context.test.ts`
  - `tests/runtime-loop.test.ts`
  - `tests/session-persistence.test.ts`
  - `tests/compaction.test.ts`
  - `tests/memory-safety.test.ts` only if shared safety behavior changes

These names are guidance, not mandatory. Prefer the smallest typed core API that satisfies the ACs without adding durable storage.

### File Structure Requirements

- Core context contracts stay in `packages/core/src/task-context.ts`.
- Runtime loop request options stay in `packages/core/src/runtime-loop.ts`.
- New/resume orchestration stays in `packages/core/src/agent-runtime.ts`.
- Existing memory safety helpers stay in `packages/memory/src/index.ts`; do not duplicate memory safety rules in core.
- Existing shared redaction helpers stay in `@sprite/shared`.
- Tests stay under root `tests/`.
- Update this story file and `sprint-status.yaml` as lifecycle evidence only.

### Safety and Security Requirements

- Working memory is runtime-owned current-task context, not durable memory.
- Working memory must not contain raw stdout, raw stderr, raw tool output, raw file contents, approval payloads, credentials, tokens, private keys, `.env` values, or large code chunks.
- Secret-like values must not appear in serialized `TaskContextPacket`.
- Provider auth state must remain redacted.
- Project context remains untrusted and cannot override runtime/system policy.
- Self-model limitations must be explicit:
  - provider-driven tool execution is not connected,
  - durable memory retrieval is not implemented unless the implementation actually provides it,
  - skill registry integration is not implemented unless `skillEntries` are supplied,
  - provider auth can be configured/missing but secrets are never exposed.

### Testing Requirements

Minimum targeted validation:

```bash
rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/compaction.test.ts tests/memory-safety.test.ts'
```

Full validation before review:

```bash
rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'
```

Specific assertions to include:

- `TASK_CONTEXT_SOURCE_ORDER` includes `working-memory` after `runtime-self-model`.
- Without a snapshot, `working-memory` is skipped and packet skipped count increases deliberately.
- With a snapshot, `working-memory` is included with trusted current-task/session-scoped metadata.
- Working-memory content is bounded and secret-like values are redacted.
- Runtime self-model metadata includes provider, sandbox, context, memory, and skill state.
- Runtime self-model does not overclaim provider-driven tool execution, durable memory retrieval, unavailable provider auth, or loaded skills.
- New interactive task requests include initial working memory.
- Resumed task requests include working memory derived from persisted session state without replaying side effects.
- Compacted-context tests remain green after source-order/index updates.

### GitNexus and Impact Requirements

Before code edits, run impact analysis and record results in the Dev Agent Record:

- `rtk run "npx gitnexus status"` and `rtk run "npx gitnexus analyze"` if stale.
- `rtk run "npx gitnexus impact --repo Sprite_harmess TASK_CONTEXT_SOURCE_ORDER"` before changing source order.
- `rtk run "npx gitnexus impact --repo Sprite_harmess assembleTaskContextPacket"` before changing packet assembly.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createRuntimeSelfModelSection"` before changing self-model section logic.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createTaskRequest"` before changing runtime-loop request context options.
- `rtk run "npx gitnexus impact --repo Sprite_harmess submitInteractiveTask"` before changing new task wiring.
- `rtk run "npx gitnexus impact --repo Sprite_harmess createResumedTask"` before changing resume task construction, if GitNexus indexes the private method.
- If GitNexus `detect_changes` is unavailable before commit, record the CLI limitation and use GitNexus status, scoped diffs, impact checks, and full validation as fallback evidence.

### Latest Technical Information

No new external package, SDK, API, or framework should be introduced for this story. Use the pinned project stack:

- Node `>=22`
- TypeScript `^5.9.2`
- Vitest `^3.2.4`
- existing workspace packages under `packages/*`

Latest external research was already completed against Hermes Agent and MemPalace and is captured in:

- `_bmad-output/planning-artifacts/research/technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5.5 Codex (session default)

### Debug Log References

- 2026-05-08: Created Story 4.1 context after Epic 3 retrospective and Hermes/MemPalace technical research. Loaded BMad create-story workflow, sprint status, Epic 4 Story 4.1 acceptance criteria, PRD FR38/FR42/NFR10-NFR11/NFR23, architecture runtime/memory/context boundaries, Story 3.8 implementation notes, current task-context/runtime-loop/agent-runtime code, and research artifact recommendations.
- 2026-05-08: Latest technical research decision: no new dependency/version research is required for implementation because this story must use existing TypeScript/Vitest/runtime packages only. Hermes/MemPalace research is used for architectural adaptation, not dependency adoption.
- 2026-05-08: Development phase started. Pre-code function/contract list reported to user: `WorkingMemorySnapshot`, `WorkingMemoryObservation`, `WorkingMemoryCommand`, `RuntimeSelfModelSnapshot`, `createRuntimeSelfModelSnapshot()`, `createWorkingMemorySection()`, `TASK_CONTEXT_SOURCE_ORDER`, `TaskContextAssemblyInput`, `TaskRequestContextOptions`, `createTaskRequest()`, `submitInteractiveTask()`, and `createResumedTask()`.
- 2026-05-08: GitNexus initially reported stale index at `03c3763` versus current `be2ade3`; re-indexed with `rtk run 'npx gitnexus analyze --skip-agents-md --no-stats'`, producing an up-to-date index at `be2ade3`.
- 2026-05-08: Pre-code GitNexus impact checks: `TASK_CONTEXT_SOURCE_ORDER` LOW, `assembleTaskContextPacket` LOW, `createRuntimeSelfModelSection` LOW, `createTaskRequest` CRITICAL, `submitInteractiveTask` HIGH, `createResumedTask` LOW. Scope kept narrow to context packet and runtime request wiring.
- 2026-05-08: RED validation confirmed expected failures before implementation with `rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts'`: missing `working-memory` source/section, runtime self-model capability metadata/content gaps, and missing new/resumed task working-memory injection.
- 2026-05-08: Implemented `WorkingMemorySnapshot`, `WorkingMemoryObservation`, `WorkingMemoryCommand`, and `RuntimeSelfModelSnapshot`; added `working-memory` context assembly; expanded runtime self-model metadata/content; wired initial and resumed working-memory snapshots through runtime task request creation.
- 2026-05-08: Targeted validation passed with `rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/compaction.test.ts tests/memory-safety.test.ts'`: 5 test files passed, 62 tests passed.
- 2026-05-08: Full validation passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: lint/typecheck passed, 15 test files passed, 210 tests passed, and diff whitespace check passed.
- 2026-05-08: Pre-commit GitNexus scope check attempted with `npx gitnexus detect_changes` and `npx gitnexus detect-changes`; both commands are unavailable in the installed CLI. Fallback evidence used: up-to-date GitNexus status, pre-code impact checks, scoped `git status`/diff review, targeted validation, full validation, and `git diff --check`.
- 2026-05-08: Three-agent code review completed with Blind Hunter, Edge Case Hunter, and Acceptance Auditor. Review triage produced 1 decision-needed trust-semantics item and 7 patch findings; story moved back to in-progress until findings are resolved or explicitly deferred.
- 2026-05-08: Review follow-up implementation completed. GitNexus impact before follow-up edits: `createRuntimeSelfModelSection` LOW; new/private helper symbols were not found in the GitNexus index; `executeRegisteredTool` impact was CRITICAL, so the fix avoided changing `executeRegisteredTool` itself and updated context-refresh helpers around active task state instead.
- 2026-05-08: Review follow-up targeted validation passed with `rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-loop.test.ts tests/session-persistence.test.ts tests/compaction.test.ts tests/memory-safety.test.ts tests/runtime-events.test.ts'`: 6 test files passed, 122 tests passed.
- 2026-05-08: Review follow-up full validation passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: lint/typecheck passed, 15 test files passed, 212 tests passed, and diff whitespace check passed.
- 2026-05-08: Three-agent review rerun found 1 high-severity compacted resume command-status defect plus medium follow-ups for pending approvals, validation blocked/skipped status, provider metadata sanitization, and working-memory refresh/upsert behavior. Fix scope was limited to `createResumedWorkingMemorySnapshot()`, `createWorkingMemoryCommandFromEvent()`, `requestApproval()`, `createProviderLimitsSection()`, `updateTaskContextWorkingMemory()`, and working-memory compact formatting.
- 2026-05-08: Review-rerun targeted validation passed with `rtk run 'npm test -- --run tests/task-context.test.ts tests/runtime-events.test.ts tests/session-persistence.test.ts tests/runtime-loop.test.ts'`: 4 test files passed, 106 tests passed.
- 2026-05-08: Review-rerun full validation passed with `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`: lint/typecheck passed, 15 test files passed, 217 tests passed, and diff whitespace check passed.

### Completion Notes List

- Added `working-memory` as a first-class trusted context source immediately after `runtime-self-model`, with task/session scope metadata and bounded snapshot formatting.
- Added typed working-memory contracts for current goal, current plan, recent observations, files touched, commands run, pending constraints, decisions, blockers, source event IDs, and schema/version fields.
- Expanded runtime self-model into a structured snapshot that reports provider, sandbox, context, memory, skill, and tool state without exposing secrets or overclaiming unavailable capabilities.
- Wired new interactive tasks to receive an initial runtime-owned working-memory snapshot with the task goal, initial plan, constraints, and lifecycle event provenance.
- Wired resumed tasks to receive a session-scoped working-memory snapshot derived from persisted session state, compacted context, file activity, pending approvals, errors, and next-step hints without replaying side effects.
- Preserved Story 3.8 compaction ordering and behavior: `compacted-context` remains after `session-state` and before `project-context`; project context remains untrusted; durable memory remains governed/skipped when absent.
- Deferred durable memory retrieval, vector search, memory candidates, learning review generation, skill promotion, and any external MemPalace/Hermes integration to later Epic 4 stories.
- Added/updated deterministic tests for source order, skipped/included working-memory sections, secret redaction, truthful self-model limitations, new task injection, resume injection, compaction regression, and CLI JSON context summaries.
- Resolved code-review follow-ups by maintaining active-task working memory after runtime updates, reporting explicit runtime tool availability, adding approval/permission limitations, sanitizing metadata, bounding provenance IDs, deriving resumed command statuses accurately, and preserving required working-memory categories under truncation.
- Resolved review-rerun findings by deriving compacted command statuses conservatively, representing blocked/skipped validations truthfully, refreshing approval-required working memory after pending approval registration, sanitizing provider-limits metadata, upserting missing working-memory sections for older packets, and preserving recent command/constraint signal under compact budgets.

### File List

- `_bmad-output/planning-artifacts/research/technical-hermes-agent-mempalace-adaptation-research-2026-05-08.md`
- `_bmad-output/implementation-artifacts/4-1-maintain-working-memory-and-runtime-self-model-during-a-task.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/task-context.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/agent-runtime.ts`
- `tests/task-context.test.ts`
- `tests/runtime-loop.test.ts`
- `tests/session-persistence.test.ts`
- `tests/runtime-events.test.ts`
- `tests/cli-smoke.test.ts`

### Change Log

- 2026-05-08: Implemented Story 4.1 working-memory and runtime self-model context contracts and marked the story ready for review after targeted and full validation passed.
- 2026-05-08: Added three-agent review findings and moved story back to in-progress for follow-up.
- 2026-05-08: Resolved all three-agent review findings and returned Story 4.1 to review after targeted and full validation passed.
- 2026-05-08: Resolved review rerun findings, full validation passed, and marked Story 4.1 done.
