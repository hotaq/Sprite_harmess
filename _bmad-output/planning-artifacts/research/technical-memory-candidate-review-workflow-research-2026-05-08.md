---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - packages/memory/src/index.ts
  - packages/storage/src/memory-store.ts
  - packages/core/src/agent-runtime.ts
  - packages/core/src/runtime-events.ts
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Story 4.3 memory candidate review/edit/reject/accept workflow'
research_goals: 'Design the next Sprite Harness story so memory remains accurate, safe, auditable, and user-controlled before candidates become durable knowledge.'
user_name: 'Chinnaphat'
date: '2026-05-08'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical

**Date:** 2026-05-08  
**Author:** Chinnaphat  
**Research Type:** technical  
**Topic:** Story 4.3 memory candidate review/edit/reject/accept workflow

---

## Research Overview

This research combines current Sprite Harness implementation review with external design references for AI memory controls and human-in-the-loop approvals.

Local research used:

- Story 4.3 acceptance criteria from `_bmad-output/planning-artifacts/epics.md`.
- Story 4.2 implementation in `packages/memory`, `packages/storage`, `packages/core`, and tests.
- Existing approval request/response patterns in `packages/sandbox/src/approval-service.ts` and `packages/core/src/agent-runtime.ts`.
- GitNexus context for `createMemoryCandidate()` and `recordMemoryCandidate()`.

External references used:

- OpenAI Memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- OpenAI memory controls announcement: https://openai.com/index/memory-and-new-controls-for-chatgpt/
- OpenAI Agents SDK human-in-the-loop docs: https://openai.github.io/openai-agents-python/human_in_the_loop/
- OpenAI Agents JS human-in-the-loop docs: https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- Anthropic Claude memory tool docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool

---

## Story 4.3 Source Scope

Story 4.3 says:

- Users can list or open memory candidates.
- Each candidate must show type, content summary, provenance, confidence, timestamp, source task, sensitivity status, and recommended action.
- Secret-like content must be redacted.
- Users can edit, reject, or accept a candidate.
- Confirmed actions update candidate lifecycle state.
- Actions are recorded in task/session audit history.

Covered requirement: FR46.

Important related requirements:

- FR39/FR40/FR45 from Story 4.2 established candidate and durable entry creation.
- NFR23 requires audit trails to include memory changes.
- NFR26 requires memory entries to carry provenance, confidence, type, timestamp, and source task.
- NFR28/Story 4.5 later requires visible explanation of memory influence, so 4.3 decisions must preserve provenance for future attribution.

---

## Current Local Baseline After Story 4.2

### Candidate creation

`packages/memory/src/index.ts` now creates safe memory candidates with:

- `id`
- `schemaVersion`
- `type`
- `content`
- `contentPreview`
- `provenance`
- `confidence`
- `sourceTaskId`
- `sourceEventIds`
- `sensitivityStatus`
- timestamps

It blocks or redacts unsafe content before runtime persistence.

### Local artifact persistence

`packages/storage/src/memory-store.ts` persists:

- candidates under `.sprite/memory/candidates/<candidateId>.json`
- durable entries in `.sprite/memory/entries.ndjson`

The current store can write candidates and append entries, but it does not yet list, read by ID, update candidate state, or rewrite candidate artifacts.

### Runtime events

`packages/core/src/runtime-events.ts` currently supports:

- `memory.safety.evaluated`
- `memory.candidate.created`
- `memory.entry.saved`

Story 4.3 likely needs at least one new event family for review decisions, for example:

- `memory.candidate.reviewed`

or separate events:

- `memory.candidate.accepted`
- `memory.candidate.rejected`
- `memory.candidate.edited`

The existing event design favors structured stable lifecycle events with bounded payloads, so one general `memory.candidate.reviewed` event with `decision` is likely less invasive.

---

## External Design Findings

### User control is not optional for memory

OpenAI’s memory documentation emphasizes that users must be able to review, delete, disable, and manage remembered information. It also separates saved memory from chat history and says memory is better suited to high-level preferences/details than large verbatim blocks.

Implication for Sprite Harness:

- Candidate review should expose memory state explicitly, not silently promote every candidate.
- Candidate content should stay summary-sized.
- The user needs clear accept/reject/edit controls before non-auto-saved candidates become durable entries.

### Memory controls need provenance and source visibility

OpenAI’s Memory Sources feature exposes what information influenced personalization and lets users edit/delete saved memories or mark sources as relevant/not relevant.

Implication for Sprite Harness:

- Story 4.3 candidate views should include `sourceTaskId`, `sourceEventIds`, provenance, confidence, and sensitivity status.
- Do not lose source metadata when accepting edited candidates.
- Future Story 4.5 reuse explanations depend on this preserved source chain.

### Human-in-the-loop approvals should be durable and resumable

OpenAI Agents SDK human-in-the-loop docs model approvals as interruptions that can be approved/rejected and resumed later. The JS docs also highlight that approval state can be serialized for long-running approvals and should avoid storing secrets in serialized context.

Implication for Sprite Harness:

- Candidate review should not require an active model/tool execution to remain alive.
- Candidate review state should be stored in `.sprite/memory/candidates/*.json`, not only in process memory.
- Runtime events should record decisions so session replay can explain what happened.
- Serialized review payloads must remain bounded and secret-safe.

### Client-side memory storage gives control but requires path boundaries

Anthropic’s memory tool docs describe client-side memory storage where the application controls where/how data is stored, and recommend restricting memory operations to a dedicated memory directory.

Implication for Sprite Harness:

- Continue keeping memory operations inside `.sprite/memory`.
- Do not let adapters or free-form paths update memory artifacts.
- Add storage APIs for candidate listing/updating rather than letting CLI/runtime hand-edit paths.

---

## Recommended Story 4.3 Architecture

### 1. Extend memory candidate lifecycle model

Add lifecycle state fields to stored candidates:

- `lifecycleStatus`: `"pending_review" | "accepted" | "rejected" | "edited" | "auto_saved"`
- `recommendedAction`: `"accept" | "review" | "reject"`
- `reviewedAt?: string`
- `reviewedBy?: "user" | "runtime"`
- `reviewReason?: string`
- `acceptedEntryId?: string`
- `originalCandidateId?: string` for edited candidates, or `editHistory` if keeping one artifact.

Recommendation:

- Keep a single candidate artifact per candidate ID and update its lifecycle in place.
- If the user edits content before accept, keep `originalContentPreview` or `originalCandidateId` metadata so review/audit can show that an edit occurred without storing unsafe raw before/after diffs in events.

### 2. Add storage APIs first

In `packages/storage/src/memory-store.ts`, add:

- `listCandidates(cwd, filter?)`
- `readCandidate(cwd, candidateId)`
- `updateCandidate(cwd, candidate)`
- optional `appendEntry()` reuse for accept action

Guardrails:

- Validate candidate ID prefix and path boundaries.
- Reject candidate artifacts that contain secret-looking values.
- Do not return unbounded raw content to event payloads or CLI summaries.
- Prefer atomic update via temp file + rename.

### 3. Add pure memory review helpers

In `packages/memory/src/index.ts`, add pure functions:

- `summarizeMemoryCandidateForReview(candidate)`
- `reviewMemoryCandidate(candidate, action)`
- `createAcceptedMemoryEntryFromCandidate(candidate, editedContent?)`
- `validateMemoryCandidateEdit(...)`

Actions:

- `accept`: candidate must be non-sensitive, non-blocked, supported durable type, bounded.
- `reject`: safe reason optional; no durable entry.
- `edit`: edited content must rerun the same memory safety/boundary validation before acceptance.

### 4. Add runtime review API

In `packages/core/src/agent-runtime.ts`, add a runtime-owned API:

- `listMemoryCandidates(options?)`
- `reviewMemoryCandidate(response)`

Possible response shape:

```ts
interface RuntimeMemoryCandidateReviewResponse {
  action: "accept" | "reject" | "edit";
  candidateId: string;
  editedContent?: string;
  reason?: string;
}
```

Runtime responsibilities:

- Load candidate via store.
- Validate action.
- For edit, re-run safety and boundedness against edited content.
- Update candidate lifecycle.
- On accept, append durable memory entry.
- Emit audit event after successful state change.
- Preserve event ordering:
  1. candidate lifecycle update
  2. optional durable entry append
  3. review/audit event

Note: Story 4.2 left full cross-file transaction/rollback out of scope. Story 4.3 should not expand into a general transaction engine unless tests expose a practical need.

### 5. Add review runtime event

Recommended event:

`memory.candidate.reviewed`

Payload:

```ts
{
  action: "accept" | "reject" | "edit";
  candidateId: string;
  confidence: "low" | "medium" | "high";
  contentPreview: string;
  entryId?: string;
  memoryType: "episodic" | "semantic";
  provenance: string;
  reason?: string;
  sensitivityStatus: "non_sensitive" | "redacted";
  sourceEventIds: string[];
  sourceTaskId?: string;
  status: "accepted" | "rejected" | "edited";
  summary: string;
}
```

Why one event:

- Lower validator surface than three event types.
- Easy to extend for review decisions.
- Mirrors existing approval resolved pattern where one event records a decision.

Guardrails:

- Reject forbidden raw fields and secret-like values.
- Use bounded `contentPreview`, not raw content.
- If edited content is accepted, event should expose only the new safe preview.

### 6. CLI/UI scope recommendation

Story 4.3 can remain runtime + storage + tests only if CLI/TUI is not required by AC. However, the AC says “user lists or opens candidates,” so at minimum the runtime should expose inspectable APIs and tests. A thin CLI can be deferred only if the team accepts that tests/API are the first user surface.

Recommended MVP user surface:

- A thin CLI command or runtime method for:
  - list candidates
  - show candidate
  - accept/reject/edit candidate

If keeping story small, implement runtime methods and storage helpers first, then CLI in a follow-up slice.

---

## Proposed Acceptance Criteria Refinement

1. Given candidate artifacts exist under `.sprite/memory/candidates`, when candidate list/open is requested, then returned candidates include safe bounded fields: candidate ID, type, content preview, provenance, confidence, timestamps, source task, source event IDs, sensitivity status, lifecycle status, and recommended action.
2. Given a candidate is accepted, when the runtime confirms the action, then the candidate lifecycle changes to accepted, a durable memory entry is appended when appropriate, and `memory.candidate.reviewed` is persisted without raw/secret content.
3. Given a candidate is rejected, when the runtime confirms the action, then the candidate lifecycle changes to rejected, no durable entry is created, and the rejection is audited.
4. Given a candidate is edited before accept, when the runtime validates the edited content, then the edited content must pass the same safety/boundedness checks as new candidates before it can become a durable entry.
5. Given secret-like or raw fields appear in candidate review payloads/events, when validation runs, then validation rejects them and neither stored artifacts nor runtime events expose raw secret content.

---

## Implementation Risk Ranking

### High

- Edited content may bypass Story 4.2 safety checks if implemented as a storage-only mutation.
- Event payloads may accidentally include raw before/after content if review audit is modeled like a diff.
- Candidate lifecycle updates and entry append can drift without clear ordering.

### Medium

- Adding many event types increases runtime event validator surface.
- Listing candidate artifacts can expose raw content if storage API returns full objects directly to UI/CLI.
- Auto-saved candidates need a clear lifecycle state so they do not look like still-pending review candidates.

### Low

- Local artifact listing/update is straightforward if constrained to `.sprite/memory/candidates`.
- Reusing existing approval/event patterns should keep design consistent.

---

## Recommended Development Order

1. Add lifecycle/status types in `packages/memory`.
2. Add storage read/list/update candidate APIs with path and secret validation.
3. Add memory review pure helpers and edited-content safety validation.
4. Add `memory.candidate.reviewed` runtime event type + validator tests.
5. Add `AgentRuntime.reviewMemoryCandidate()` and candidate list/open methods.
6. Add regression tests:
   - list/open safe preview
   - accept creates entry and review event
   - reject creates no entry
   - edit reruns safety and blocks secrets/raw logs/code chunks
   - auto-saved candidates are not duplicated on accept
   - resumed sessions do not replay review actions

---

## Research Conclusion

Story 4.3 should be treated as a trust-boundary story, not just a CRUD story. The core design should preserve user control, explicit provenance, bounded previews, durable lifecycle state, and auditable review decisions.

The safest MVP is:

- storage-level candidate list/read/update,
- pure memory review validation,
- one runtime review API,
- one `memory.candidate.reviewed` event,
- tests that prove edit cannot bypass safety checks.

Defer richer TUI/UX unless the story is explicitly expanded. The next story file should make the no-raw-content rule very explicit for review events and edited candidates.
