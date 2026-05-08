# Story 4.3: Review, Edit, Reject, or Accept Memory Candidates

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to review memory candidates before they become durable knowledge,
so that memory remains accurate, safe, and under my control.

## Acceptance Criteria

1. Given memory candidates exist, when the user lists or opens candidates, then each candidate shows type, content summary, provenance, confidence, timestamp, source task, sensitivity status, lifecycle status, and recommended action, and secret-like content is redacted.
2. Given the user accepts a memory candidate, when the action is confirmed, then the candidate lifecycle state is updated, a durable memory entry is created only when appropriate, and the action is recorded in task/session audit history without raw or secret content.
3. Given the user rejects a memory candidate, when the action is confirmed, then the candidate lifecycle state is updated, no durable memory entry is created, and the rejection is recorded in task/session audit history.
4. Given the user edits a memory candidate before accepting it, when the edited content is submitted, then the edited content is re-evaluated through the same safety and boundedness rules as new candidates before it can become durable memory.
5. Given candidate review events or stored review artifacts are validated, when raw content fields, raw output, tokens, secrets, credentials, private keys, large code chunks, or secret-like values are present, then validation rejects them and nothing unsafe is emitted or persisted.

## Tasks / Subtasks

- [x] Confirm implementation function list before code edits (AC: 1-5)
  - [x] Before touching implementation files, report exact functions/contracts to add or modify.
  - [x] Run GitNexus impact analysis before editing any existing function, class, or method symbol.
  - [x] Treat this story as a trust-boundary story; do not implement a loose CRUD path that bypasses safety checks.

- [x] Add candidate lifecycle and review contracts in `packages/memory` (AC: 1-4)
  - [x] Extend the existing memory candidate model rather than creating a duplicate review model.
  - [x] Add lifecycle status support for at least `pending_review`, `accepted`, `rejected`, `edited`, and `auto_saved`.
  - [x] Add recommended action support for at least `accept`, `review`, and `reject`.
  - [x] Add review metadata fields such as `reviewedAt`, `reviewedBy`, `reviewReason`, `acceptedEntryId`, and edit provenance as needed.
  - [x] Backfill/derive safe defaults for Story 4.2 candidate artifacts that do not yet have lifecycle fields.
  - [x] Keep `episodic` and `semantic` as the only durable accept targets in this story.

- [x] Add safe candidate read/list/update storage APIs in `packages/storage` (AC: 1-4)
  - [x] Extend `LocalMemoryStore` with candidate list/read/update methods using `.sprite/memory/candidates/`.
  - [x] Preserve path-boundary checks and ID validation; candidate ID must stay under the candidates directory.
  - [x] Use atomic candidate updates via temp file + rename.
  - [x] Never let CLI/runtime callers provide arbitrary candidate artifact paths.
  - [x] Keep `entries.ndjson` append-oriented for durable entries and prevent duplicate entry creation for already accepted/auto-saved candidates.
  - [x] Ensure storage validation rejects secret-looking values and unsafe serialized artifacts.

- [x] Add pure review helpers in `packages/memory` (AC: 2-5)
  - [x] Add helper(s) to produce bounded review summaries for list/open responses.
  - [x] Add helper(s) to validate review actions: accept, reject, edit.
  - [x] On edit, rerun the same safety/boundedness checks used by `createMemoryCandidate()`.
  - [x] Ensure edited content cannot preserve raw logs, raw tool output, secrets, tokens, credentials, private keys, or large code chunks.
  - [x] Ensure accept rejects blocked, sensitive, redacted, unsupported, or malformed candidates unless the edit produces a safe non-sensitive durable candidate.

- [x] Add runtime candidate review APIs in `packages/core` (AC: 1-5)
  - [x] Add `AgentRuntime` method(s) to list/open memory candidates with safe bounded output.
  - [x] Add `AgentRuntime.reviewMemoryCandidate()` or equivalent for accept/reject/edit actions.
  - [x] Reuse runtime-owned storage and event boundaries; do not mutate `.sprite/memory` from adapters.
  - [x] Preserve audit ordering: lifecycle decision must be persisted and evented only after the candidate state/entry operation succeeds.
  - [x] Ensure resumed sessions do not replay candidate review actions, duplicate durable entries, or re-emit review events.

- [x] Add runtime event contract for review decisions (AC: 2-5)
  - [x] Add one stable event type, preferably `memory.candidate.reviewed`, unless implementation evidence proves separate event types are safer.
  - [x] Event payload must include candidate ID, action/decision, lifecycle status, type, confidence, provenance, source task, source event IDs, sensitivity status, bounded content preview, optional durable entry ID, and safe summary/reason.
  - [x] Event payload must not include raw content, before/after edit diffs, raw output, stdout/stderr, tokens, secrets, credentials, private keys, or large code chunks.
  - [x] Add strict validator coverage in `packages/core/src/runtime-events.ts` and `tests/runtime-events.test.ts`.

- [x] Add minimal user-facing list/open/review surface (AC: 1-4)
  - [x] Prefer runtime APIs first, then add a thin CLI surface only if needed to satisfy "user lists or opens candidates".
  - [x] If CLI is added, keep it thin in `packages/cli/src/index.ts` and use `AgentRuntime`/storage APIs rather than reading files directly.
  - [x] If CLI is added, support safe text output and JSON output; neither may leak secrets or raw content.
  - [x] Do not add TUI, RPC, vector retrieval, MemPalace integration, or learning-review generation in this story.

- [x] Add regression tests (AC: 1-5)
  - [x] Memory tests: lifecycle/default recommended action, accept/reject/edit validation, edited content safety rejection.
  - [x] Storage tests: list/read/update candidates, path boundary protection, atomic update shape, duplicate durable entry prevention.
  - [x] Runtime event tests: valid `memory.candidate.reviewed`, reject raw/secret fields, reject secret-like summary/reason/preview.
  - [x] Runtime tests: list/open candidates returns bounded redacted summaries; accept creates entry and audit event; reject creates no entry; edit reruns safety and blocks unsafe content.
  - [x] Session persistence tests: candidate review actions persist next to session audit history and resume does not replay review side effects.
  - [x] CLI smoke tests if CLI commands are added.

- [x] Update story evidence and lifecycle status (AC: 1-5)
  - [x] Record implementation notes, changed files, validation evidence, and remaining transaction limitations in this story file.
  - [x] Run targeted validation before review: memory, storage, runtime-events, session-persistence, and CLI tests if touched.
  - [x] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [x] Run GitNexus detect-changes before committing implementation changes when available; if CLI still lacks `detect_changes`, run `npx gitnexus analyze . --force --skip-agents-md --no-stats` and `npx gitnexus status`.

## Dev Notes

### Story Intent

Story 4.3 turns Story 4.2 memory candidates into a user-controlled review workflow. This is a trust boundary: candidates must be inspectable, editable, rejectable, and acceptable without leaking raw content or allowing edited content to bypass safety checks.

Implement this slice:

- Candidate lifecycle metadata and recommended actions.
- Safe candidate list/open/read/update storage APIs.
- Runtime-owned review action API.
- Audit event for memory candidate review decisions.
- Regression coverage for accept/reject/edit safety and persistence.
- Minimal user-facing list/open/review surface if needed to satisfy the AC.

Do not implement in this story:

- Story 4.4 post-task learning review generation.
- Story 4.5 memory retrieval/reuse attribution.
- Story 4.6 retrospective review trigger.
- Story 4.7 procedural skill memory.
- Vector search, semantic embeddings, Chroma, SQLite knowledge graph, MemPalace backend integration, or external memory providers.
- Rich TUI/RPC workflows unless a thin surface is strictly necessary.
- Full cross-file transaction/rollback engine between `.sprite/memory` artifacts and session event append.

### Source Requirements

- Story 4.3 requires users to list/open memory candidates with type, content summary, provenance, confidence, timestamp, source task, sensitivity status, recommended action, and redacted secret-like content. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.3]
- Story 4.3 requires edit/reject/accept actions to update candidate lifecycle state and record the action in task/session audit history. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.3]
- FR46 requires users to review, edit, reject, or accept memory candidates. [Source: `_bmad-output/planning-artifacts/epics.md` FR46]
- NFR23 requires every task to have an inspectable audit trail containing memory changes. [Source: `_bmad-output/planning-artifacts/epics.md` NFR23]
- NFR26 requires memory entries to include provenance, confidence, type, timestamp, and source task. [Source: `_bmad-output/planning-artifacts/epics.md` NFR26]
- NFR28 requires the agent to explain which prior memory, lesson, skill signal, or self-model state influenced a task when applicable; keep provenance/source IDs for future reuse explanations. [Source: `_bmad-output/planning-artifacts/epics.md` NFR28]
- Architecture requires layered memory categories and metadata for type, provenance, confidence, timestamp, and source task. [Source: `_bmad-output/planning-artifacts/architecture.md` Requirements Overview]
- Architecture requires local artifact storage for memory and candidates under `.sprite/memory/` and JSON records for typed machine-readable state. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Architecture]
- Architecture requires memory writes to use filtering, redaction, and review policy. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Learning Patterns]
- Research recommends storage-level candidate list/read/update, pure memory review validation, one runtime review API, one `memory.candidate.reviewed` event, and tests proving edit cannot bypass safety checks. [Source: `_bmad-output/planning-artifacts/research/technical-memory-candidate-review-workflow-research-2026-05-08.md` Research Conclusion]

### External Research Notes

- OpenAI memory controls emphasize user ability to review, manage, and delete remembered information; memory should favor high-level preferences/details over large verbatim content. [Source: `https://help.openai.com/en/articles/8590148-memory-faq`, `https://openai.com/index/memory-and-new-controls-for-chatgpt/`]
- OpenAI Agents human-in-the-loop docs model approvals as interrupt/resume decisions and highlight durable approval state for long-running workflows. Use this as guidance for auditability and resumability, not as a dependency. [Source: `https://openai.github.io/openai-agents-python/human_in_the_loop/`, `https://openai.github.io/openai-agents-js/guides/human-in-the-loop/`]
- Anthropic memory tool docs describe client-controlled memory storage and recommend dedicated memory directories. Keep Sprite memory operations constrained to `.sprite/memory`. [Source: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool`]

### Architecture Guardrails

- Keep memory classification, lifecycle contracts, and edit safety checks in `packages/memory`.
- Keep artifact read/list/update/append logic in `packages/storage`.
- Keep runtime orchestration and event emission in `packages/core`.
- Keep CLI/TUI/RPC thin. If a CLI surface is added, it must call runtime/storage APIs rather than owning memory state.
- No new dependencies.
- Use existing stack: Node `>=22`, TypeScript `^5.9.2`, Vitest `^3.2.4`, Commander already present in CLI.
- Runtime events are the audit spine. Review decisions must be auditable.
- Stored artifacts and event payloads must use bounded summaries/previews and safe metadata, never raw logs, raw tool output, before/after edit diffs, or secrets.
- Project files and candidate content are untrusted user/runtime data. Treat candidate review as data validation, not as trusted instructions.

### Current Implementation Baseline

- `packages/memory/src/index.ts` defines candidate creation, safety evaluation, `MemoryCandidate`, `MemoryEntry`, `shouldAutoSaveMemoryCandidate()`, and `createMemoryEntryFromCandidate()`.
- `packages/storage/src/memory-store.ts` defines `LocalMemoryStore`, `writeCandidate()`, `appendEntry()`, `ensureMemoryStore()`, and `readMemoryEntries()`.
- `packages/core/src/agent-runtime.ts` defines `recordMemoryCandidate()`, emits candidate and entry audit events, and keeps `evaluateMemoryCandidateSafety()` backward-compatible.
- `packages/core/src/runtime-events.ts` validates `memory.safety.evaluated`, `memory.candidate.created`, and `memory.entry.saved`.
- `packages/core/src/task-context.ts` reports candidate-store availability but durable retrieval remains unavailable.
- Tests already cover safe candidates, auto-save, blocked candidates, event ordering, persistence artifacts, and working-memory non-promotion.

### Previous Story Intelligence

- Story 4.2 review found that candidate audit events must not wait on entry append. Maintain audit-after-successful-artifact-step ordering. [Source: `_bmad-output/implementation-artifacts/4-2-store-episodic-and-semantic-memory-candidates.md` Review Findings]
- Story 4.2 hardened event validators against `secret`, `token`, and credential-like field names. Reuse the same forbidden-field discipline for review events. [Source: `_bmad-output/implementation-artifacts/4-2-store-episodic-and-semantic-memory-candidates.md` Review Findings]
- Story 4.2 explicitly left full cross-file transaction/rollback between `.sprite/memory` artifacts and session event append out of scope. Do not accidentally expand Story 4.3 into a general transaction engine. [Source: `_bmad-output/implementation-artifacts/4-2-store-episodic-and-semantic-memory-candidates.md` Review Findings]
- Story 4.1 established that working memory is task/session scoped and must not be silently promoted into durable memory. Candidate review must remain explicit and user-controlled. [Source: `_bmad-output/implementation-artifacts/4-2-store-episodic-and-semantic-memory-candidates.md` Prior Story Notes]

### Suggested Contracts and Functions

Review and adjust this list before implementation:

- `MemoryCandidateLifecycleStatus` — candidate lifecycle union.
- `MemoryCandidateRecommendedAction` — recommended review action union.
- `MemoryCandidateReviewAction` / `MemoryCandidateReviewRequest` — accept/reject/edit request contract.
- `MemoryCandidateReviewResult` — review result including candidate state and optional entry.
- `summarizeMemoryCandidateForReview()` — bounded review view helper.
- `reviewMemoryCandidate()` or `applyMemoryCandidateReview()` — pure lifecycle/action helper.
- `validateMemoryCandidateEdit()` — safety/boundedness guard for edited content.
- `LocalMemoryStore.listCandidates()` — list candidate artifacts.
- `LocalMemoryStore.readCandidate()` — read candidate by ID.
- `LocalMemoryStore.updateCandidate()` — atomic candidate lifecycle update.
- `AgentRuntime.listMemoryCandidates()` / `AgentRuntime.openMemoryCandidate()` — safe runtime read APIs.
- `AgentRuntime.reviewMemoryCandidate()` — runtime orchestration for accept/reject/edit.
- `createMemoryCandidateReviewedEvent()` — runtime event factory.
- `validateMemoryCandidateReviewedEvent()` — runtime event validator.

### File Structure Expectations

Likely files to modify:

- `packages/memory/src/index.ts`
- `packages/storage/src/memory-store.ts`
- `packages/storage/src/index.ts` only if new exports are needed
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/cli/src/index.ts` only if adding a thin CLI user surface
- `tests/memory-safety.test.ts`
- `tests/session-persistence.test.ts`
- `tests/runtime-events.test.ts`
- `tests/cli-smoke.test.ts` if CLI is touched
- A new storage-specific test file only if existing tests become too broad.

Avoid:

- Creating a second memory store outside `packages/storage`.
- Letting CLI/TUI/RPC parse candidate files directly.
- Duplicating approval-service command/file-edit semantics for memory unless a shared pattern is clearly reusable.
- Writing `.sprite/memory` from package adapters or tests without going through storage helpers, except fixture setup.

### Testing Requirements

- Use Vitest and existing test helper patterns.
- For storage tests, create temp projects under `tmpdir()` and clean them with `rmSync(..., { recursive: true, force: true })`.
- For runtime tests, use `AgentRuntime` and `submitInteractiveTask()` to get task/session context before review actions.
- For event tests, use `createRuntimeEventRecord()` and `validateRuntimeEvent()` like existing memory event tests.
- For CLI tests, use `spawnSync("node", [cliPath, ...])` like `tests/cli-smoke.test.ts`.
- Every test touching secrets must assert the serialized result does not contain the raw secret.

### Project Structure Notes

- This story extends the Epic 4 memory pipeline. It must not introduce database/vector dependencies.
- Story 4.2 committed local memory artifacts under `.sprite/memory`; Story 4.3 should continue that local artifact approach.
- `packages/core/dist` and other `dist` files are build outputs; do not edit generated dist files manually.
- Keep story implementation small enough to review: storage + memory + runtime + tests first, CLI only as a thin surface.

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 4.3, FR46, NFR23, NFR26, NFR28.
- `_bmad-output/planning-artifacts/prd.md` — memory safety and learning requirements.
- `_bmad-output/planning-artifacts/architecture.md` — memory and learning architecture, runtime event patterns, data architecture.
- `_bmad-output/planning-artifacts/research/technical-memory-candidate-review-workflow-research-2026-05-08.md` — Story 4.3 technical research.
- `_bmad-output/implementation-artifacts/4-2-store-episodic-and-semantic-memory-candidates.md` — previous story baseline and review learnings.
- `packages/memory/src/index.ts` — memory contracts and safety helpers.
- `packages/storage/src/memory-store.ts` — local memory artifact store.
- `packages/core/src/agent-runtime.ts` — runtime orchestration and existing approval patterns.
- `packages/core/src/runtime-events.ts` — runtime event contracts and validators.
- `packages/sandbox/src/approval-service.ts` — existing approve/deny/edit action pattern for comparison only.

## Change Log

- 2026-05-08: Implemented memory candidate lifecycle/review contracts, safe storage APIs, runtime list/open/review APIs, `memory.candidate.reviewed` audit events, and regression coverage for accept/reject/edit safety.

## Dev Agent Record

### Agent Model Used

GPT-5.5 Codex

### Debug Log References

- Reported implementation function/contract list before code edits.
- Ran GitNexus impact analysis for edited symbols: `createMemoryCandidate`, `createMemoryEntryFromCandidate`, `LocalMemoryStore`, `recordMemoryCandidate`, `validateRuntimeEvent`, and related runtime/CLI surfaces. Highest noted risk was `validateRuntimeEvent` (CRITICAL central validator), mitigated with a localized `memory.candidate.reviewed` branch and strict tests.
- RED phase: targeted Story 4.3 tests failed as expected before implementation (missing memory helpers, storage methods, event contract, runtime APIs).
- GREEN phase targeted validation: `rtk run 'npm test -- --run tests/memory-safety.test.ts tests/memory-store.test.ts tests/runtime-events.test.ts tests/session-persistence.test.ts'` → 4 files passed, 99 tests passed.
- Full validation: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'` → typecheck passed, 16 files passed, 235 tests passed, diff check passed.
- GitNexus fallback change check: `rtk run 'npx gitnexus analyze . --force --skip-agents-md --no-stats && npx gitnexus status'` → indexed successfully, status up-to-date at commit `412d314`.

### Completion Notes List

- Extended `MemoryCandidate` with lifecycle status, recommended action, review metadata, accepted entry linkage, and edit provenance while reusing existing candidate creation/safety boundaries.
- Added pure review helpers for safe list/open summaries, accept/reject/edit validation, and edit re-evaluation through `createMemoryCandidate()`.
- Added storage-owned candidate list/read/update APIs constrained to `.sprite/memory/candidates/`, with atomic updates, ID/path validation, lifecycle default backfill, and secret-looking artifact rejection.
- Added `AgentRuntime.listMemoryCandidates()`, `openMemoryCandidate()`, and `reviewMemoryCandidate()`; accept/edit create durable entries only for safe episodic/semantic candidates and block duplicate durable entries.
- Added `memory.candidate.reviewed` as the stable audit event for review decisions, with strict validation against raw fields, secret-looking values, unsafe summaries/reasons, and invalid IDs.
- Did not add CLI commands in this story; runtime APIs satisfy the minimal user-facing surface while avoiding adapter-owned memory mutation.
- Remaining limitation: cross-file transaction rollback is still intentionally out of scope; entry append, candidate update, and session event append are ordered and validated but not wrapped in a general transaction engine.

### File List

- `_bmad-output/implementation-artifacts/4-3-review-edit-reject-or-accept-memory-candidates.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/memory/src/index.ts`
- `packages/storage/src/memory-store.ts`
- `tests/memory-safety.test.ts`
- `tests/memory-store.test.ts`
- `tests/runtime-events.test.ts`
- `tests/session-persistence.test.ts`
