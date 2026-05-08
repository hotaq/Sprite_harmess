# Story 4.2: Store Episodic and Semantic Memory Candidates

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Sprite Harness to capture useful session outcomes and durable project/user facts,
so that the agent can remember what matters across sessions.

## Acceptance Criteria

1. Given a task produces notable decisions, outcomes, project facts, or user preferences, when the learning process evaluates them, then it can create episodic or semantic memory candidates with type, provenance, confidence, timestamp, source task, and sensitivity status, and raw logs, secrets, credentials, private keys, tokens, and large code chunks are excluded by default.
2. Given a memory candidate is high-confidence, bounded, and non-sensitive, when auto-save policy allows it, then the runtime can save it to durable memory and emits `memory.candidate.created` and `memory.entry.saved` events as appropriate.

## Tasks / Subtasks

- [ ] Confirm implementation function list before code edits (AC: 1, 2)
  - [ ] Before touching implementation files, report the exact functions/contracts to add or modify.
  - [ ] Run GitNexus impact analysis before editing any existing function, class, or method symbol.
  - [ ] Do not start with CLI/TUI/RPC surfaces; Story 4.2 is a runtime + memory/storage slice.

- [ ] Add durable memory candidate and entry contracts (AC: 1, 2)
  - [ ] Extend the existing `packages/memory/src/index.ts` candidate model rather than creating a duplicate memory package.
  - [ ] Add explicit sensitivity status metadata to non-blocked candidates.
  - [ ] Add stable IDs for saved candidate/entry artifacts using architecture ID prefixes (`mem_` for durable entries; use a clear candidate prefix if needed, do not hand-assemble IDs in adapters).
  - [ ] Ensure candidate and entry metadata includes `schemaVersion`, `createdAt`/timestamp, `updatedAt` where persisted, `type`, `provenance`, `confidence`, `sourceTaskId`, sensitivity status, and evidence/source references.
  - [ ] Limit Story 4.2 auto-save flow to episodic and semantic memory. Leave procedural, self-model, and working-memory persistence to later stories unless existing code requires shared type support.

- [ ] Harden candidate safety and boundedness rules (AC: 1)
  - [ ] Preserve existing secret filtering and custom safety-rule behavior from `createMemoryCandidate()`.
  - [ ] Exclude raw logs, raw command/tool output, private keys, tokens, credentials, `.env` values, and large code chunks by default.
  - [ ] Add deterministic maximum content/preview limits and return structured errors or blocked decisions for oversized or raw-looking content.
  - [ ] Store bounded summaries/previews, not raw transcripts or large code snippets.
  - [ ] Ensure blocked memory content never appears in runtime events, persisted candidates, persisted entries, logs, summaries, or task context packets.

- [ ] Implement candidate creation and auto-save policy (AC: 1, 2)
  - [ ] Add a pure helper for candidate evaluation/creation that can be used by the runtime and later learning-review stories.
  - [ ] Add a pure `shouldAutoSaveMemoryCandidate()` style policy helper: default allow only high-confidence, bounded, non-sensitive episodic/semantic candidates when policy allows memory save.
  - [ ] Low-confidence, medium-confidence, sensitive, redacted, blocked, or unsupported-type candidates must not auto-save in this story.
  - [ ] Do not implement Story 4.3 review/edit/reject/accept UI in this story; save only the candidate state needed for that later lifecycle.

- [ ] Add local artifact storage for memory candidates and durable entries (AC: 1, 2)
  - [ ] Store project-local memory candidates under `.sprite/memory/candidates/` or the nearest existing storage abstraction that maps to the architecture.
  - [ ] Store durable memory entry metadata/content under `.sprite/memory/` using inspectable local artifacts; prefer append-oriented JSON records for machine state and keep Markdown memory human-readable if updated.
  - [ ] Keep storage code in `packages/storage` when persistence is needed; keep memory classification/safety logic in `packages/memory`.
  - [ ] Serialize writes through existing storage/runtime boundaries; do not let adapters write `.sprite` memory artifacts directly.
  - [ ] Add schema validation/migration-friendly fields for any new persisted artifact shape.

- [ ] Emit and validate runtime events (AC: 2)
  - [ ] Add `memory.candidate.created` and `memory.entry.saved` to `packages/core/src/runtime-events.ts`.
  - [ ] Event payloads must include IDs, type, confidence, provenance/source reference, source task, sensitivity status, status, and bounded summary/preview only.
  - [ ] Event payloads must not include forbidden raw fields such as `rawContent`, `rawOutput`, `stdout`, `stderr`, `token`, `secret`, or large code chunks.
  - [ ] Emit `memory.candidate.created` after a non-blocked candidate is created.
  - [ ] Emit `memory.entry.saved` only after durable storage succeeds.
  - [ ] Preserve event order so session replay can reconstruct candidate/entry state.

- [ ] Wire runtime API without replay side effects (AC: 1, 2)
  - [ ] Replace or complement `AgentRuntime.evaluateMemoryCandidateSafety()` with a runtime-owned candidate recording API that creates events and storage artifacts.
  - [ ] Ensure resumed sessions do not replay candidate creation, memory saves, provider calls, tools, validations, approvals, or file edits.
  - [ ] Update runtime self-model memory state so candidate-store availability becomes truthful when implemented.
  - [ ] Keep working memory task/session scoped and never silently promote it as durable memory.

- [ ] Add red-phase and regression tests (AC: 1, 2)
  - [ ] Memory unit tests: safe episodic/semantic candidate includes type, provenance, confidence, timestamp, source task, and sensitivity status.
  - [ ] Memory unit tests: raw logs, secrets, credentials, private keys, tokens, and large code chunks are blocked or excluded by default.
  - [ ] Policy tests: only high-confidence, bounded, non-sensitive episodic/semantic candidates auto-save.
  - [ ] Runtime event tests: candidate creation emits `memory.candidate.created`; auto-save emits `memory.entry.saved` after storage succeeds.
  - [ ] Runtime event tests: blocked/sensitive candidate emits only safety/audit information and never emits a saved entry.
  - [ ] Persistence tests: memory candidates and saved entries survive session storage boundaries without raw secret leakage.
  - [ ] Regression tests: Story 4.1 working memory remains task scoped and is not promoted to durable memory.

- [ ] Update story evidence and lifecycle status (AC: 1, 2)
  - [ ] Record implementation notes, changed files, and validation evidence in this story file.
  - [ ] Run targeted validation before review: `rtk run 'npm test -- --run tests/memory-safety.test.ts tests/runtime-events.test.ts tests/session-persistence.test.ts tests/task-context.test.ts'`.
  - [ ] Run full validation before marking done: `rtk run 'npm run lint -- --pretty false && npm test -- --run && git diff --check'`.
  - [ ] Run GitNexus detect-changes before committing implementation changes when GitNexus tooling is available.

## Dev Notes

### Story Intent

Story 4.2 is the first durable-memory implementation slice for Epic 4. It should create safe episodic and semantic memory candidates, persist enough state for later review/reuse stories, and auto-save only bounded high-confidence non-sensitive candidates.

Implement this slice:

- Candidate contract and safety metadata for episodic/semantic memory.
- Bounded candidate creation from already-evaluated learning/session facts.
- Local durable candidate/entry artifacts.
- Runtime events for candidate creation and entry save.
- Auto-save policy for high-confidence, bounded, non-sensitive candidates.

Do not implement in this story:

- Story 4.3 review/edit/reject/accept UI or command workflow.
- Story 4.4 post-task learning review generation.
- Story 4.5 retrieval/reuse attribution.
- Story 4.7 procedural skill memory.
- Vector search, semantic embeddings, Chroma, SQLite knowledge graph, MemPalace backend integration, or external memory providers.
- Raw session transcript storage as long-term memory.

### Source Requirements

- Story 4.2 requires episodic or semantic memory candidates with type, provenance, confidence, timestamp, source task, and sensitivity status. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.2]
- Story 4.2 requires excluding raw logs, secrets, credentials, private keys, tokens, and large code chunks by default. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.2]
- Story 4.2 requires high-confidence, bounded, non-sensitive candidates to be saved to durable memory when auto-save policy allows it. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.2]
- Story 4.2 requires `memory.candidate.created` and `memory.entry.saved` events as appropriate. [Source: `_bmad-output/planning-artifacts/epics.md` Story 4.2]
- PRD FR39 requires storing episodic memory from prior sessions. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD FR40 requires storing semantic memory for durable user and project facts. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD FR45 requires auto-save for bounded non-sensitive high-confidence memory candidates. [Source: `_bmad-output/planning-artifacts/prd.md` Functional Requirements]
- PRD NFR10-NFR11 require secrets and credentials not to be saved or displayed in memory, CLI, TUI, logs, RPC state, summaries, or learning outputs. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- PRD NFR26 requires memory entries to include provenance, confidence, type, timestamp, and source task. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- PRD NFR48 requires automated coverage for memory filtering and secret exclusion. [Source: `_bmad-output/planning-artifacts/prd.md` Non-Functional Requirements]
- Architecture requires layered memory with working, episodic, semantic, procedural, and self-model categories and metadata for type, provenance, confidence, timestamp, and source task. [Source: `_bmad-output/planning-artifacts/architecture.md` Requirements Overview]
- Architecture requires local artifact storage for memory and candidates under `.sprite/memory/` and JSON records for typed machine-readable state. [Source: `_bmad-output/planning-artifacts/architecture.md` Data Architecture]
- Architecture states memory save events use `memory.entry.saved` and candidates use `memory.candidate.created`. [Source: `_bmad-output/planning-artifacts/architecture.md` Runtime Event Patterns]
- Architecture states long-term memory writes require filtering, redaction, and review policy. [Source: `_bmad-output/planning-artifacts/architecture.md` Memory and Learning Patterns]

### Architecture Guardrails

- Keep memory classification, safety evaluation, and candidate creation logic in `packages/memory`.
- Keep persistence and artifact validation in `packages/storage`.
- Keep runtime orchestration and event emission in `packages/core`, centered on `AgentRuntime` and `runtime-events.ts`.
- Keep CLI/TUI/RPC thin; do not add adapter-owned memory state in this story.
- Do not add dependencies. Use the existing stack: Node `>=22`, TypeScript `^5.9.2`, Vitest `^3.2.4`.
- Use local artifact storage as the MVP source of truth; do not add SQLite or vector storage.
- Runtime events are the audit spine. Every durable memory save must have an auditable event.
- Event payloads and stored artifacts must use bounded summaries/previews and safe metadata, never raw logs or raw tool output.
- Memory saves are policy-governed; adapters and external agents must go through runtime APIs.
- Working memory from Story 4.1 stays task/session scoped and must not be silently promoted into durable memory.

### Current Codebase State

- `packages/memory/src/index.ts` already defines `MemoryType`, `MemoryConfidence`, `MemoryCandidateRequest`, `MemoryCandidate`, `MemoryCandidateEvaluation`, `evaluateSafetySensitiveContent()`, and `createMemoryCandidate()`.
- `createMemoryCandidate()` already blocks or redacts secret-like content using effective safety rules and returns `candidate: null` for blocking decisions.
- Existing `MemoryType` includes `"episodic"`, `"semantic"`, `"procedural"`, `"self_model"`, and `"working"`, but Story 4.2 auto-save should focus on episodic/semantic memory only.
- `tests/memory-safety.test.ts` already covers default credential/token/private-key/env/key-path blocking, custom redaction, and safe candidate metadata.
- `AgentRuntime.evaluateMemoryCandidateSafety()` currently evaluates candidate safety and emits only `memory.safety.evaluated`; it does not persist candidates or entries.
- `packages/core/src/runtime-events.ts` currently includes `memory.safety.evaluated` but does not yet include `memory.candidate.created` or `memory.entry.saved`.
- `packages/core/src/task-context.ts` currently reports `candidateStoreAvailable: false` and durable retrieval unavailable in the runtime self-model.
- `packages/storage/src/session-store.ts` owns persisted session state/events. Add memory persistence in storage abstractions rather than writing from adapters.

### Previous Story Intelligence

- Story 4.1 deliberately deferred durable retrieval, vector memory, and memory candidates to Story 4.2+.
- Story 4.1 added `WorkingMemorySnapshot`, `WorkingMemoryObservation`, `WorkingMemoryCommand`, and `RuntimeSelfModelSnapshot`; do not conflate these task-local snapshots with durable entries.
- Story 4.1 established that working memory is runtime-owned/trusted for current task context, but user-derived content must be descriptive and not policy-authoritative.
- Story 4.1 redaction fixes require safe metadata as well as safe content; apply the same rule to memory candidate and entry payloads.
- Story 4.1 resume behavior must not replay side effects. Story 4.2 must not recreate or resave memory entries during resume.
- Story 4.1 full validation passed with lint, all tests, and `git diff --check`; preserve those gates for this story.
- Latest relevant commits:
  - `716569a` — made runtime context truthful across working-memory resumes.
  - `be2ade3` — recorded Epic 3 learning before persistent-memory work.
  - `03c3763` — closed compacted-context continuation after verified review.

### Suggested Contracts / Functions for Dev Planning

Before implementation, review and report this list to the user, then adjust if code inspection finds a better minimal path:

- `MemorySensitivityStatus` — explicit status for candidate/entry safety posture.
- `MemoryEntry` / `MemoryEntryMetadata` — durable memory entry contract.
- `MemoryAutoSavePolicy` — policy settings for high-confidence non-sensitive auto-save.
- `createMemoryCandidate()` — extend existing function; do not duplicate it.
- `createMemoryEntryFromCandidate()` — pure conversion after policy and storage checks.
- `shouldAutoSaveMemoryCandidate()` — pure eligibility gate.
- `createMemoryCandidateCreatedEvent()` — runtime event helper in core.
- `createMemoryEntrySavedEvent()` — runtime event helper in core.
- `AgentRuntime.recordMemoryCandidate()` or similar — runtime-owned API that evaluates, emits, persists, and optionally auto-saves.
- `MemoryStore` / `createMemoryStore()` — storage abstraction for `.sprite/memory/candidates/` and durable entries if no suitable existing store exists.

### Testing Standards

- Add RED tests before implementation where practical.
- Keep unit tests deterministic; do not use live provider calls, network calls, or real secrets.
- Use fake providers/tools/session directories for runtime and persistence tests.
- Assert exact runtime event sequences for candidate creation and auto-save.
- Assert absence of forbidden raw fields and secret-looking values in serialized events and persisted artifacts.
- Include regression coverage proving blocked candidates and Story 4.1 working memory are not promoted to durable memory.

### Project Structure Notes

- The story aligns with the architecture package boundaries:
  - `packages/memory` for memory candidate and safety logic.
  - `packages/storage` for file-backed artifacts.
  - `packages/core` for runtime APIs, event validation, and orchestration.
  - `tests/` for cross-package scenario coverage.
- No sharded PRD/architecture docs were required; whole planning artifacts are available in `_bmad-output/planning-artifacts/`.
- No latest external SDK/library research is required for this story because it should use existing local TypeScript, Vitest, runtime event, policy, and storage patterns without adding dependencies.

### References

- `_bmad-output/planning-artifacts/epics.md` — Epic 4 and Story 4.2 acceptance criteria.
- `_bmad-output/planning-artifacts/prd.md` — FR39, FR40, FR45, NFR10, NFR11, NFR26, NFR48.
- `_bmad-output/planning-artifacts/architecture.md` — Data Architecture, Runtime Event Schema Decision, Memory and Learning Patterns, Testing and Validation Patterns, package boundaries.
- `_bmad-output/implementation-artifacts/4-1-maintain-working-memory-and-runtime-self-model-during-a-task.md` — previous story implementation notes and review learnings.
- `packages/memory/src/index.ts` — existing candidate/safety API to extend.
- `packages/core/src/runtime-events.ts` — current runtime event union and validation patterns.
- `packages/core/src/agent-runtime.ts` — current runtime safety evaluation method.
- `tests/memory-safety.test.ts` and `tests/runtime-events.test.ts` — existing regression test locations.

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

TBD

### Completion Notes List

TBD

### File List

TBD
