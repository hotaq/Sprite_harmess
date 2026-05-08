# Technical Research: Hermes Agent + MemPalace Adaptation for Sprite Harness

Date: 2026-05-08  
Research type: Technical architecture research  
Requested by: Chinnaphat  
Project: Sprite Harness  
Primary targets:
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- [MemPalace/mempalace](https://github.com/MemPalace/mempalace)

## Executive Conclusion

Sprite Harness should adapt **contracts and governance patterns** from Hermes Agent and MemPalace, not copy either system wholesale.

The immediate Story 4.1 target should stay narrow:

1. Add a first-class **working-memory snapshot** scoped to the active task/session.
2. Expand the **runtime self-model** so it accurately reports available tools, loaded skills, provider state, sandbox state, context state, and memory state.
3. Keep durable memory retrieval and semantic/vector memory out of Story 4.1; those belong to Story 4.2+.

Hermes Agent is strongest as a reference for:

- memory-provider lifecycle boundaries,
- prompt-cache-safe memory injection,
- explicit self-model / user-model separation,
- memory context fencing,
- cadence and budget controls,
- post-session and pre-compression learning hooks.

MemPalace is strongest as a reference for:

- evidence-first memory with provenance,
- layered recall,
- hybrid lexical/semantic retrieval,
- temporal fact validity,
- local-first storage,
- auditability through MCP/tools/hooks.

For Sprite, the correct synthesis is:

> Runtime-owned task memory should be short, structured, safety-filtered, and current. Durable memory should remain governed, provenance-backed, confidence-scored, and visibly influential only when used.

## Current Sprite Context

Relevant existing implementation:

- `packages/core/src/task-context.ts`
  - already has `runtime-self-model`, `provider-limits`, `session-state`, `compacted-context`, `memory`, and `skills` sections.
  - current self-model is minimal: output format, sandbox mode, provider-driven tool execution limitation, validation command count.
  - durable memory is represented as skipped when no entries are supplied.
- `packages/memory/src/index.ts`
  - already defines memory types: `episodic`, `procedural`, `self_model`, `semantic`, `working`.
  - already has safety evaluation and candidate creation.
- `packages/core/src/runtime-events.ts`
  - already has safe event validation for `memory.safety.evaluated`, `session.resumed`, and `session.compacted`.
  - runtime events already reject raw output/content fields and secret-like values in sensitive places.
- `_bmad-output/planning-artifacts/epics.md`
  - Story 4.1 requires task-local working memory and an accurate runtime self-model.
  - Story 4.2 starts durable episodic/semantic memory candidates.

Implication: Sprite already has most of the **governance foundation**. Story 4.1 should add structured snapshots and context assembly support, not introduce a storage backend.

## Hermes Agent Findings

### 1. Memory Manager as a Single Integration Boundary

Hermes uses `MemoryManager` as the single runtime integration point for memory providers. It registers providers, builds prompt blocks, prefetches recall, syncs turns, exposes memory tool schemas, handles memory tool calls, and forwards lifecycle hooks.

Primary source: [agent/memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)

Important patterns:

- One manager owns provider registration and routing.
- Failures in one memory provider are non-fatal to the rest of the runtime.
- Only one external provider is allowed at a time to avoid conflicting tool schemas and context bloat.
- Lifecycle hooks are explicit:
  - initialize,
  - system prompt block,
  - prefetch,
  - queued prefetch,
  - sync completed turn,
  - session switch,
  - pre-compress,
  - memory write,
  - delegation result,
  - shutdown.

Adaptation for Sprite:

- Do **not** build a full provider manager in Story 4.1.
- Do define Sprite’s internal memory/self-model contract so later provider integration has a stable boundary.
- Keep the “single integration point” idea for Epic 4/5: runtime should not scatter memory writes across CLI/TUI/RPC adapters.
- If external memory providers are added later, limit active external durable providers or explicitly merge them through a governed source list.

### 2. Memory Provider Contract

Hermes defines an abstract memory provider with required and optional hooks.

Primary source: [agent/memory_provider.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py)

Key lifecycle concepts:

- `is_available()` must be cheap and should not perform network calls.
- `initialize()` receives session and runtime identity context.
- `system_prompt_block()` is static provider information.
- `prefetch()` provides relevant recall before an API call.
- `sync_turn()` persists completed turns.
- optional hooks cover turn start, session end, session switch, pre-compression, delegation, and memory-write mirroring.

Adaptation for Sprite:

- Story 4.1 should expose memory state in the self-model as capability metadata:
  - working memory available,
  - durable retrieval unavailable,
  - candidate store available/unavailable,
  - safety rules count,
  - last refresh timestamp if known.
- Story 4.2+ can introduce a typed `MemorySource` / `MemoryStore` interface inspired by this lifecycle.
- Availability checks must not overclaim. If memory retrieval is not implemented, context should say so.

### 3. Prompt-Cache-Safe Memory Injection

Hermes’ built-in memory tool stores bounded file-backed memory and injects a frozen snapshot at session start. Mid-session writes update disk but do not mutate the current system prompt, preserving prompt-cache stability.

Primary source: [tools/memory_tool.py](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py)

Useful patterns:

- Separate durable disk state from prompt-injected snapshot.
- Bound memory by character budget.
- Deduplicate entries.
- Block prompt-injection and exfiltration patterns before accepting memory.
- Preserve prefix cache by not mutating the system prompt mid-session.

Adaptation for Sprite:

- Working memory may update during the task, but it should be a **runtime context section**, not a hidden mutation of provider/system prompt.
- Durable memory should be snapshot-based or explicitly refreshed at assembly boundaries.
- Memory entries included in task context should remain bounded and redacted through existing safety rules.
- Story 4.1 should not auto-save raw working memory to durable memory.

### 4. Memory Context Fencing and Leak Prevention

Hermes wraps recalled memory in a fenced memory-context block and includes a system note that it is recalled memory, not new user input. It also scrubs leaked memory-context spans from streamed output.

Primary source: [agent/memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)

Adaptation for Sprite:

- Sprite should not make recalled memory “authoritative” by default. A safer stance is:
  - runtime self-model: trusted,
  - working memory: trusted but current-task scoped,
  - durable memory: governed and provenance-backed,
  - project context: untrusted repository guidance.
- If memory is later injected into prompts, it should be fenced, labeled, and excluded from user-visible output unless deliberately summarized.
- Context summaries should distinguish active user instructions from background memory.

### 5. Honcho: Two-Layer User/AI Modeling

Hermes’ Honcho provider uses cross-session user modeling with layered context injection, cadence, budgets, and dialectic reasoning.

Primary source: [plugins/memory/honcho/README.md](https://github.com/NousResearch/hermes-agent/blob/main/plugins/memory/honcho/README.md)

Important design ideas:

- Static mode header goes in the system prompt.
- Dynamic memory context is injected separately at API-call time.
- Base context and dialectic context run on independent cadences.
- Context is truncated to a configured token budget.
- It models both user and AI peers.
- It supports multiple session-resolution strategies: per-directory, per-session, per-repo, global.

Adaptation for Sprite:

- Runtime self-model should include the agent/runtime side, not just user memory.
- Story 4.1 should track:
  - provider capabilities,
  - tool execution state,
  - sandbox and approval state,
  - context/compaction state,
  - memory availability,
  - loaded skill state.
- Later user/project semantic memory should be scoped by session/project and never treated as global truth without provenance.

### 6. Holographic Memory: Local Facts, Trust, and Feedback

Hermes’ Holographic provider is a local SQLite-backed fact store with FTS5, trust scoring, entity resolution, and fact feedback.

Primary source: [plugins/memory/holographic/README.md](https://github.com/NousResearch/hermes-agent/blob/main/plugins/memory/holographic/README.md)

Adaptation for Sprite:

- Story 4.2 semantic candidates should include confidence and lifecycle state.
- Story 4.5 should record whether a memory was used, ignored, or contradicted.
- Later semantic memory should support invalidation/contradiction, not just append-only facts.
- Feedback should influence future ranking but not silently rewrite history.

### 7. Context Compression Lessons

Hermes’ context compressor uses structured summary framing, active-task separation, tool-output pruning, and iterative summary updates.

Primary source: [agent/context_compressor.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/context_compressor.py)

Sprite already completed Epic 3 compaction. The adaptation for Epic 4 is:

- Working memory should be derivable from compacted continuity plus newer runtime events.
- Compaction should preserve enough active-task memory to rebuild Story 4.1 snapshots after resume.
- Compaction summaries must not become active instructions except through explicit current-task fields.

## MemPalace Findings

### 1. Local-First, Verbatim, Structured Memory

MemPalace stores conversation history as verbatim text, structures it by wings/rooms/drawers, and supports semantic retrieval with local storage.

Primary source: [MemPalace README](https://github.com/MemPalace/mempalace/blob/main/README.md)

Important patterns:

- original content is preserved rather than immediately paraphrased,
- retrieval can be scoped by project/person/topic,
- storage is local-first,
- durable memory supports MCP tools and hooks,
- knowledge graph support includes validity windows.

Adaptation for Sprite:

- Do not store raw transcripts in Story 4.1.
- For Story 4.2+, memory candidates should preserve source references and evidence IDs, even if the displayed candidate content is summarized.
- Durable memory should be scoped by task/session/project.
- Memory retrieval should be visibly governed, not hidden.

### 2. Backend Contract

MemPalace defines a small backend interface for storage collections.

Primary source: [mempalace/backends/base.py](https://github.com/MemPalace/mempalace/blob/main/mempalace/backends/base.py)

Adaptation for Sprite:

- Later memory storage should have a typed minimal interface:
  - add,
  - upsert,
  - update,
  - query,
  - get,
  - delete,
  - count,
  - health.
- New code should prefer typed result objects over ad hoc dictionaries.
- Backend failures should degrade to “memory unavailable” instead of corrupting context assembly.

### 3. Hybrid Retrieval and Closet/Drawer Separation

MemPalace combines direct drawer search, closet pointer boosts, vector similarity, BM25, and neighbor expansion.

Primary source: [mempalace/searcher.py](https://github.com/MemPalace/mempalace/blob/main/mempalace/searcher.py)

Key lesson:

- Semantic retrieval should not be the only gate.
- Lexical/exact matching is a useful safety net.
- Compact pointer indexes can boost ranking but should not hide direct evidence.
- Neighbor expansion helps avoid clipped context.

Adaptation for Sprite:

- Story 4.1 should not implement retrieval.
- Story 4.2/4.5 should use a staged retrieval plan:
  1. exact/provenance lookup,
  2. lexical match,
  3. semantic/vector search,
  4. optional reranking,
  5. influence record.
- Every used memory should cite the candidate/source ID that influenced the task.

### 4. Temporal Knowledge Graph

MemPalace includes a local knowledge graph with validity windows, confidence, source closet/file/drawer IDs, and invalidation.

Primary source: [mempalace/knowledge_graph.py](https://github.com/MemPalace/mempalace/blob/main/mempalace/knowledge_graph.py)

Adaptation for Sprite:

- Semantic memory candidates should eventually include:
  - entity or subject,
  - relation/predicate,
  - object/value,
  - confidence,
  - validFrom,
  - validTo,
  - source task/session/event IDs,
  - lifecycle state.
- Contradictions should invalidate or supersede prior facts rather than silently overwriting them.
- Story 4.1 only needs to report whether semantic memory/KG is available.

### 5. Layered Memory Stack

MemPalace describes a layered recall stack:

- always-loaded identity,
- essential story,
- on-demand recall,
- deep search.

Primary source: [mempalace/layers.py](https://github.com/MemPalace/mempalace/blob/main/mempalace/layers.py)

Adaptation for Sprite:

Sprite can use a similar conceptual layering:

| Layer | Sprite Equivalent | Story |
| --- | --- | --- |
| L0 | Runtime self-model | 4.1 |
| L1 | Working memory snapshot | 4.1 |
| L2 | Governed memory candidates / accepted memory summaries | 4.2-4.5 |
| L3 | Durable retrieval / deep semantic search | 4.5+ |

The key is to keep L0/L1 always bounded and runtime-owned. L2/L3 must be provenance-backed and safety-filtered.

### 6. Hooks and Pre-Compaction Saves

MemPalace uses hooks to save periodically and before context compaction.

Primary source: [hooks/README.md](https://github.com/MemPalace/mempalace/blob/main/hooks/README.md)

Adaptation for Sprite:

- Sprite already has runtime events and compaction boundaries.
- Use runtime lifecycle boundaries instead of external hook-only logic:
  - task completion,
  - task failure,
  - task cancellation,
  - session compaction,
  - session resume.
- For Story 4.1, emit/update working-memory snapshots at context assembly boundaries.
- For Story 4.4/4.6, generate post-task learning reviews and retrospective outputs.

## Recommended Story 4.1 Design

### Proposed Working Memory Snapshot

Add a runtime-owned task/session snapshot. It should be derived from explicit input/runtime state, not LLM claims.

```ts
export interface WorkingMemoryObservation {
  kind: "decision" | "observation" | "failure" | "constraint" | "progress";
  summary: string;
  eventId?: string;
  createdAt?: string;
}

export interface WorkingMemoryCommand {
  command: string;
  status?: "planned" | "started" | "completed" | "failed";
  eventId?: string;
}

export interface WorkingMemorySnapshot {
  schemaVersion: 1;
  taskId: string;
  sessionId: string;
  updatedAt: string;
  scope: "task" | "session";
  currentGoal: string;
  currentPlan: readonly string[];
  recentObservations: readonly WorkingMemoryObservation[];
  filesTouched: readonly string[];
  commandsRun: readonly WorkingMemoryCommand[];
  pendingConstraints: readonly string[];
  decisions: readonly string[];
  blockers: readonly string[];
  sourceEventIds: readonly string[];
}
```

Minimum Story 4.1 behavior:

- If no snapshot exists, include a skipped working-memory section.
- If a snapshot exists, include a bounded redacted preview.
- Metadata should include counts and source event IDs.
- Secret-looking values should be redacted or blocked.
- Snapshot is task/session-scoped and should not become durable memory by default.

### Proposed Runtime Self-Model Snapshot

Expand the current runtime-self-model section into structured capability metadata.

```ts
export interface RuntimeSelfModelSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  tools: {
    available: boolean;
    names: readonly string[];
    unavailableReason?: string;
  };
  skills: {
    loaded: boolean;
    names: readonly string[];
    source?: string;
  };
  provider: {
    configured: boolean;
    providerName?: string;
    model?: string;
    supportsStreaming: boolean;
    supportsToolCalls: boolean;
    contextWindowTokens: number | null;
    auth: "configured-redacted" | "missing";
  };
  sandbox: {
    mode: string;
    approvalPolicy?: string;
    networkAccess?: boolean;
    cwd?: string;
  };
  context: {
    packetSchemaVersion: number;
    sourceOrder: readonly string[];
    compactionAvailable: boolean;
    compactedArtifactId?: string;
  };
  memory: {
    workingMemoryAvailable: boolean;
    durableRetrievalAvailable: boolean;
    candidateStoreAvailable: boolean;
    providerName?: string;
    safetyRulesCount: number;
    lastRefresh?: string;
  };
  limitations: readonly string[];
}
```

Minimum Story 4.1 behavior:

- Provider/tool state must not overclaim. If provider-driven tool execution is absent, state that it is absent.
- Durable memory retrieval should remain `false` until implemented.
- Skills should show loaded entries only when actual skill entries are provided.
- Sandbox state should come from startup/runtime config, not from the model’s assumptions.

### Recommended Source Order Change

Current source order:

```ts
[
  "runtime-self-model",
  "provider-limits",
  "user-input",
  "session-state",
  "compacted-context",
  "project-context",
  "memory",
  "skills"
]
```

Recommended Story 4.1 order:

```ts
[
  "runtime-self-model",
  "working-memory",
  "provider-limits",
  "user-input",
  "session-state",
  "compacted-context",
  "project-context",
  "memory",
  "skills"
]
```

Rationale:

- Working memory is not durable memory.
- It is runtime-owned and current-task scoped.
- It should appear near the self-model because both are high-trust runtime sections.

Alternative:

- Reuse existing `memory` section with `type: "working"`.

Why not preferred:

- It blurs current-task working memory with governed durable memory.
- It makes Story 4.1’s AC less visible.
- It complicates future “which durable memory influenced this task?” reporting.

## Recommended Function List Before Implementation

When implementing Story 4.1, introduce or update these functions first:

1. `createRuntimeSelfModelSnapshot(input)`
   - Builds structured runtime capability state from startup/provider/session/context inputs.

2. `createRuntimeSelfModelSection(factoryInput)`
   - Existing function should delegate to the snapshot builder and format a bounded preview.

3. `createWorkingMemorySnapshot(input)`
   - Builds an explicit snapshot from provided task/session data.

4. `createWorkingMemorySection(factoryInput)`
   - Adds a first-class context section for Story 4.1 working memory.

5. `formatWorkingMemoryContent(snapshot, maxLength)`
   - Produces a safe bounded preview.

6. `validateWorkingMemorySnapshot(snapshot)`
   - Optional in Story 4.1 if construction is internal-only, but useful if snapshots can be loaded from persisted session state later.

7. `redactWorkingMemorySnapshot(snapshot, safetyRules)`
   - Can be folded into the section factory at MVP scope; split only if tests need direct coverage.

## Recommended Story 4.2+ Design Influence

Sprite already has `MemoryCandidate`. For later stories, consider expanding candidate shape toward:

```ts
export interface DurableMemoryCandidate {
  id: string;
  type: "episodic" | "semantic" | "procedural" | "self_model";
  content: string;
  summary: string;
  provenance: {
    taskId: string;
    sessionId: string;
    eventIds: readonly string[];
    sourceFile?: string;
    sourceToolCallId?: string;
  };
  confidence: "low" | "medium" | "high";
  sensitivity: "safe" | "redacted" | "blocked";
  validFrom?: string;
  validTo?: string;
  status: "proposed" | "accepted" | "rejected" | "saved" | "invalidated";
  influencePolicy: "never" | "manual" | "auto";
  safetyDecision: unknown;
}
```

Recommended later events:

- `working_memory.updated` if the runtime needs an auditable event for snapshot changes.
- `memory.candidate.created`
- `memory.entry.saved`
- `memory.entry.used`
- `memory.entry.ignored`
- `memory.entry.contradicted`
- `learning.review.created`

## What Not to Copy

Do not copy these parts into Story 4.1:

- vector database integration,
- Chroma/HNSW index management,
- cloud memory provider dependency,
- auto-saving raw transcripts,
- AAAK-style compressed memory dialect,
- always-authoritative recalled memory,
- autonomous skill curator,
- user-model dialectic reasoning,
- hidden memory influence.

Reasons:

- Story 4.1 is about active task working memory and runtime self-state, not durable recall.
- Adding retrieval/storage now increases surface area before governance and review UX exist.
- Hidden memory influence would conflict with Epic 4’s visibility requirements.

## Test Strategy

### Unit Tests

Update `tests/task-context.test.ts`:

- packet source order includes `working-memory`,
- working-memory section is skipped when no snapshot exists,
- working-memory section is included when snapshot exists,
- counts are exposed in metadata,
- secret-looking values are redacted,
- self-model includes provider/tool/sandbox/context/memory state,
- self-model does not overclaim unavailable provider-driven tools or durable memory.

Add focused tests if helper functions are exported:

- `createRuntimeSelfModelSnapshot()`
- `createWorkingMemorySnapshot()`

### Runtime Event Tests

Only needed if Story 4.1 adds `working_memory.updated`.

If added:

- validate required fields,
- forbid raw output/content fields,
- reject secret-like summaries,
- ensure source event IDs are safe strings.

### Regression Tests

Run:

```bash
rtk run 'bun test tests/task-context.test.ts tests/memory-safety.test.ts tests/runtime-events.test.ts tests/compaction.test.ts'
rtk run 'bun run typecheck'
```

## Recommended Implementation Sequence

1. Update `TASK_CONTEXT_SOURCE_ORDER` with `working-memory`.
2. Add `WorkingMemorySnapshot` and related input types.
3. Add optional `workingMemory?: WorkingMemorySnapshot` to `TaskContextAssemblyInput`.
4. Add `createWorkingMemorySection()`.
5. Refactor `createRuntimeSelfModelSection()` to use a richer snapshot.
6. Update task-context tests for order, skipped/included state, redaction, and no-overclaim behavior.
7. Run targeted tests and typecheck.

## Risks and Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Self-model overclaims tools or memory | High | Derive state only from runtime inputs; explicitly list unavailable states. |
| Working memory leaks secrets | High | Use existing safety/redaction utilities before section inclusion. |
| Working memory becomes confused with durable memory | Medium | Add separate `working-memory` source kind. |
| Snapshot grows too large | Medium | Use bounded previews and metadata counts. |
| Event-derived memory includes raw outputs | Medium | Only store summaries and output references, never raw stdout/stderr. |
| Future vector memory adds complexity too early | Medium | Defer durable retrieval to Story 4.2+. |

## Final Recommendation

Proceed with Story 4.1 as a **runtime context contract** story:

- add explicit working memory section,
- deepen runtime self-model,
- keep durable memory represented honestly as unavailable/skipped,
- preserve safety and provenance boundaries,
- write tests around no-overclaim and redaction.

Then use this foundation for:

- Story 4.2 memory candidates,
- Story 4.4 learning reviews,
- Story 4.5 visible memory influence,
- Story 4.6 retrospective triggers,
- Story 4.7 procedural skill signals.

This path adapts the strongest ideas from Hermes Agent and MemPalace while keeping Sprite Harness incremental, auditable, and safe.
