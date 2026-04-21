---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/prd-validation-report-post-edit.md"
  - "_bmad-output/planning-artifacts/product-brief-Sprite-Harness.md"
  - "_bmad-output/planning-artifacts/reference-repo-synthesis.md"
workflowType: "architecture"
lastStep: 8
status: "complete"
completedAt: "2026-04-21"
project_name: "Sprite_harmess"
user_name: "Chinnaphat"
date: "2026-04-21"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Initialization

Architecture workflow initialized for Sprite Harness using the validated PRD and supporting planning artifacts.

**Input documents loaded:**

- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/prd-validation-report-post-edit.md`
- `_bmad-output/planning-artifacts/product-brief-Sprite-Harness.md`
- `_bmad-output/planning-artifacts/reference-repo-synthesis.md`

**Setup notes:**

- PRD is present and validated with post-edit overall status `Pass`.
- No UX design document was found.
- No project context document was found.
- `docs/` exists but is currently empty.

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The PRD defines 91 functional requirements across these architectural capability groups:

- Runtime and task execution: one shared `AgentRuntime`, interactive sessions, one-shot execution, plan-act-observe loop, interruption, final summaries, runtime event stream, context assembly, and project context file loading.
- Repository tools: file inspection, search, listing, patch-based edits, edit review, file tracking, validation command execution, and recovery from failed validation.
- Sandbox, approval, and safety: sandboxed command requests, approval/deny/edit paths, file-edit approvals, risk classification, safety event recording, recovery from denied or failed operations, memory exclusions, secret protection, and audit trail inspection.
- Sessions, context, and compaction: local session creation, resume, state inspection, persistence, structured compaction, manual compaction, and continued task execution from compacted context.
- Memory, learning, and retrospective: working, episodic, semantic, procedural, and self-model memory; post-task learning review; memory candidates; memory review flow; visible memory reuse; retrospective generation for failed or aborted tasks.
- Skills and skill evolution: skill listing, manual invocation, usage tracking, skill signals, skill candidates, review/edit/reject/draft/promote lifecycle, and skill influence visibility.
- Interfaces and integration: minimal TUI, slash commands, JSON-RPC over stdin/stdout, task submission, lifecycle events, approval responses, final summaries, learning reviews, and scoped RPC permissions.
- Provider, authentication, configuration, and packaging: OpenAI-compatible API-key provider MVP, provider state, provider capability metadata, environment/auth-file/interactive auth, OAuth-ready architecture, credential precedence, global/project config, npm package distribution, Bun-friendly workflows, and documentation.

Architecturally, the central implication is that CLI, TUI, print mode, and JSON-RPC must be thin clients over the same runtime. The runtime owns task state, event emission, tool execution, provider calls, context assembly, memory interactions, approvals, and learning outputs.

**Non-Functional Requirements:**

The PRD defines 50 non-functional requirements. The post-edit validation report marks the PRD as `Pass`; the previous NFR measurability gap is resolved.

NFRs that directly shape architecture:

- Input responsiveness: CLI/TUI input events accepted within 100ms and rendered within 250ms at p95 under normal local conditions.
- Event latency: tool lifecycle events appear in TUI or event stream within 500ms under normal local conditions.
- Output behavior: `text` and `json` complete only after terminal task states; `ndjson` streams lifecycle events as they occur.
- Compaction: compacted context must retain task goal, constraints, decisions, plan, progress, files touched, commands run, failures, pending approvals, and next steps.
- Large output handling: outputs above 32 KB or 500 lines must be summarized/collapsible/truncated while preserving full local log references when stored.
- Sandbox and approval: command execution constrained to configured sandbox boundary; risky commands and broad edits require explicit user or scoped RPC approval.
- Secret protection: secrets and credentials must not be saved to long-term memory or displayed in CLI, TUI, logs, RPC state, summaries, or learning reviews.
- Credential storage: provider credentials must use restricted local file permissions where supported and warn when enforcement is unsupported.
- Resume and recovery: sessions must persist enough state to resume after restart or interruption when the store is readable.
- Retrospective eligibility: failed or aborted tasks require retained task goal, event history, terminal state, touched files, commands, failure reason, and final status.
- Auditability: tasks must have inspectable audit trails containing tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status.
- RPC contract: lifecycle events and approval requests require stable names and structured payloads; approval requests include request ID, type, command/edit summary, cwd, affected files, risk, reason, environment exposure, timeout, allowed actions, and correlation ID.
- Local-first portability: sessions, memory, skills, learning artifacts, and config are local by default; project config favors relative paths, excludes secrets, and flags non-portable values.
- Testability: core runtime, provider adapters, tool execution, sandbox policy, memory filtering, JSON-RPC schemas, learning review, and skill candidate generation must be independently testable.

These NFRs imply explicit module boundaries, typed contracts, deterministic fixtures, event-driven runtime state, and strict separation between UI adapters and core behavior.

**Scale & Complexity:**

- Primary domain: local AI developer tooling / terminal agent runtime.
- Complexity level: medium-high.
- Initial architectural components: 16 core components.

Core components likely needed:

1. CLI entry adapter
2. TUI adapter
3. Print/automation adapter
4. JSON-RPC adapter
5. `AgentRuntime`
6. `AgentLoop`
7. runtime event bus / event stream
8. provider adapter layer
9. prompt/context assembly layer
10. tool registry
11. repository/file tool implementations
12. sandbox runner
13. approval service
14. session store and compaction service
15. memory manager
16. skill registry and skill evolution service

### Technical Constraints & Dependencies

Known constraints from PRD and reference synthesis:

- Language and package posture: TypeScript, npm-first distribution, `sprite` binary, Node.js runtime compatibility, Bun-friendly development workflows.
- Runtime posture: CLI, TUI, print mode, and JSON-RPC must share one `AgentRuntime`; no duplicated agent implementations.
- Provider posture: MVP uses OpenAI-compatible API-key provider; provider architecture must support normalized tool calls, streaming, errors, usage, context limits, model identity, capability metadata, API-key auth, and future OAuth authorization-code flows.
- UI posture: minimal TUI, likely Ink/React terminal unless implementation discovery changes this; UI must stay adapter-thin.
- RPC posture: JSON-RPC over stdin/stdout with stable lifecycle event names, structured payloads, scoped permissions, and approval request/response flow.
- Tool posture: tools are registry-driven; file edits are patch-based by default; command execution always routes through `SandboxRunner`.
- Storage posture: local-first storage under `~/.sprite` and `.sprite`; memory, session, skill, learning, and config artifacts stay local by default.
- Memory posture: layered memory model with working, episodic, semantic, procedural, and self-model state; memory entries require type, provenance, confidence, timestamp, and source task.
- Skill posture: skills are procedural memory; MVP supports manual registry and candidate generation, but promotion requires user approval.
- Safety posture: project files and context files are untrusted input; repository instructions cannot override runtime/system policy.
- Testing posture: core runtime, provider adapters, tools, sandbox policy, memory filtering, RPC schemas, learning review, and skill candidate generation need isolated automated tests.

### Cross-Cutting Concerns Identified

- Runtime ownership: one runtime must own task state, event emission, context assembly, provider calls, tools, approvals, memory writes, and learning outputs.
- Event contract consistency: CLI/TUI/print/RPC all consume the same runtime events, with adapters deciding presentation only.
- Safety and permission enforcement: sandbox, approvals, memory exclusions, context-file trust boundaries, and RPC scopes must be enforced below UI level.
- Provider normalization: provider differences must not leak into `AgentLoop`; adapters normalize messages, tool calls, streaming, errors, usage, and capabilities.
- Persistence and recovery: session storage, event history, compaction, full logs, memory artifacts, and learning outputs must share durable identifiers and retention rules.
- Context budget management: prompt assembly, memory injection, context files, session history, tool outputs, and compaction all compete for model context and need a defined ordering strategy.
- Auditability: tool calls, commands, approvals, file edits, validations, memory changes, skill signals, provider state, and final status must be inspectable after the task.
- Learning integrity: learning review must not be decorative; architecture must support later proof of memory or lesson reuse.
- Skill evolution control: skill candidates can be generated by runtime review, but skill creation/promotion remains user-approved.
- Local-first portability: global vs project config, relative paths, secrets exclusion, restricted auth files, and effective config inspection affect many modules.
- Testability: deterministic fixtures and contract tests should be designed with architecture, not added after implementation.

### Architectural Decision Pressure Points

The architecture must resolve these decision pressure points early:

1. **Runtime ownership vs UI convenience**
   CLI, TUI, print mode, and JSON-RPC must not each grow separate task-loop logic. All task lifecycle state, tool calls, approvals, memory writes, and learning outputs belong below the interface layer.

2. **Event stream as the system spine**
   The event model should be treated as a primary architecture contract, not a logging detail. UI rendering, NDJSON output, JSON-RPC streaming, audit trails, session persistence, learning review, and tests all depend on consistent runtime events.

3. **Memory as governed state, not chat history**
   Memory must be typed, bounded, provenance-aware, confidence-scored, and filtered. The architecture should prevent raw session history, secrets, large code chunks, or low-confidence assumptions from silently becoming long-term memory.

4. **Skills as reviewed procedural memory**
   Skill candidates are generated from repeated workflows and reviews, but promoted skills must remain user-approved artifacts. This keeps learning visible and prevents uncontrolled behavior drift.

5. **Provider normalization boundary**
   Provider adapters must absorb vendor-specific message formats, tool-call behavior, streaming behavior, errors, token usage, auth state, and model capabilities. `AgentLoop` should depend on a normalized provider contract only.

6. **Sandbox below every interface**
   Command and broad-edit safety cannot live in the TUI alone. CLI, print mode, TUI, and JSON-RPC must all route through the same sandbox, approval, and policy layer.

### Failure Pre-Mortem

If Sprite Harness fails architecturally, the likely causes are:

1. **The runtime becomes coupled to the first UI.**
   Prevention: define `AgentRuntime` and runtime events before TUI-specific rendering choices.

2. **The event stream is too informal.**
   Prevention: define typed lifecycle events and contract tests before multiple adapters depend on them.

3. **Memory becomes noisy or unsafe.**
   Prevention: use memory candidates, provenance, confidence, type, source task, secret filtering, and review gates from the start.

4. **Provider quirks leak into the agent loop.**
   Prevention: keep provider-specific behavior inside adapters and capability metadata.

5. **Sandbox approval differs across CLI/TUI/RPC.**
   Prevention: centralize risk classification, approval requests, denial observations, and policy enforcement.

6. **The MVP overbuilds cognitive architecture before the task loop works.**
   Prevention: stage implementation around runtime + tools + sandbox + sessions first, then learning review, memory reuse, and skill candidates.

7. **Learning is only decorative.**
   Prevention: architecture must persist enough learning evidence to prove later task reuse, not only generate review text.

### Dependency Graph Summary

Core dependency direction should be:

- Interface adapters depend on `AgentRuntime`.
- `AgentRuntime` depends on `AgentLoop`, event bus, session store, context assembler, tool registry, provider registry, approval service, memory manager, skill registry, and learning review service.
- `AgentLoop` depends on normalized provider contracts and tool execution contracts, not on CLI/TUI/RPC.
- Tools depend on sandbox, filesystem policy, and audit/event emission where applicable.
- Memory and skill systems consume task/session events and learning reviews; they should not directly control the agent loop.
- Session and audit storage consume runtime events; they should not be presentation-layer logs.
- JSON-RPC, TUI, print, and CLI all consume the same runtime event stream and expose different presentation/control surfaces.

This dependency direction prevents UI coupling, provider lock-in, duplicated safety logic, and untestable learning behavior.

### First-Principles Architecture Primitives

The irreducible primitives for Sprite Harness are:

1. **Task**
   A user goal with cwd, session, provider/model preference, allowed tools, permissions, and stop conditions.

2. **Runtime Event**
   A typed fact emitted by the runtime: task started, plan updated, tool called, command approval requested, validation failed, memory candidate created, skill signal recorded, task completed.

3. **Tool Invocation**
   A structured request to inspect, edit, search, validate, run a command, write a memory candidate, or record a skill signal.

4. **Policy Decision**
   A decision that allows, denies, requires approval, or modifies a command/edit/memory/RPC action.

5. **Session State**
   Durable task state, event history, compacted context, touched files, commands, approvals, failures, and next steps.

6. **Context Packet**
   The assembled prompt input from user task, project context, session state, memory, skills, provider limits, and self-model.

7. **Memory Candidate**
   A bounded proposed durable fact or lesson with type, provenance, confidence, timestamp, source task, and sensitivity status.

8. **Skill Candidate**
   A proposed reusable workflow with trigger reason, supporting evidence, activation conditions, required tools, risks, and lifecycle state.

9. **Provider Capability Profile**
   A normalized description of model identity, context limits, streaming support, tool-call support, auth state, and usage reporting.

10. **Learning Review**
    A structured post-task review that produces mistakes, lessons, test gaps, memory candidates, and skill signals.

## Starter Template Evaluation

### Primary Technology Domain

Primary domain: TypeScript CLI / local agent runtime.

Sprite Harness is not a conventional CLI-only tool. It is a local agent runtime with multiple adapters:

- interactive CLI,
- minimal TUI,
- print/non-interactive CLI,
- JSON-RPC over stdin/stdout,
- future editor/frontend clients.

The correct foundation should optimize for runtime isolation, typed contracts, testability, package boundaries, and adapter-thin interfaces. A CLI or TUI starter can help an adapter, but it should not own the application architecture.

### Starter Options Considered

#### Option 1: oclif-generated CLI

**Current status checked:** oclif provides an actively maintained TypeScript CLI generator. Current docs show `oclif generate NAME`, ESM/CJS module options, npm/yarn/pnpm package manager flags, generated bin scripts, sample commands, TypeScript config, ESLint/Prettier, Mocha test setup, and `@oclif/test`.

**Useful for Sprite Harness:**

- Strong CLI command structure.
- Built-in help and command conventions.
- Good for subcommands such as `sprite rpc`, `sprite resume`, `sprite memory`, and `sprite skills`.
- Mature CLI packaging posture.

**Risks for Sprite Harness:**

- Encourages command framework shape before runtime shape.
- Can make the CLI feel like the center of the system unless carefully isolated.
- Plugin system may distract from Sprite Harness's own skill/tool/runtime plugin boundaries.
- TUI and RPC still need custom architecture.

**Assessment:** Good candidate for CLI adapter scaffolding, not for core architecture ownership.

#### Option 2: Ink `create-ink-app --typescript`

**Current status checked:** Ink provides React for terminal UI and a `create-ink-app --typescript` scaffold. Ink is widely used for rich CLI/TUI applications.

**Useful for Sprite Harness:**

- Fits the PRD's minimal TUI direction.
- Declarative terminal UI with React-style state and components.
- Good for rendering runtime events, approvals, tool output, context usage, memory state, and learning review outputs.

**Risks for Sprite Harness:**

- TUI-first scaffold can couple task state to React state if not controlled.
- Current Ink major versions may impose Node/React compatibility decisions that should be checked during implementation.
- Does not solve CLI print mode, JSON-RPC, provider adapters, tool registry, sandboxing, memory, or session architecture.

**Assessment:** Good candidate for the TUI adapter after runtime/event contracts exist. Not suitable as the primary starter.

#### Option 3: Commander + custom TypeScript runtime workspace

**Current status checked:** Commander is a mature lightweight CLI parser with built-in TypeScript declarations and minimal runtime assumptions.

**Useful for Sprite Harness:**

- Keeps CLI adapter thin.
- Avoids framework-driven runtime shape.
- Easy to combine with a custom `AgentRuntime`.
- Works well for `sprite`, `sprite -p`, `sprite rpc`, `sprite resume`, `sprite compact`, `sprite memory`, and `sprite skills`.
- Lower architectural pressure than oclif.

**Risks for Sprite Harness:**

- More manual setup for help, docs, command testing, and package polish.
- Less built-in convention than oclif.

**Assessment:** Strong fit for MVP if we want maximum control over runtime-first architecture.

#### Option 4: Fully custom TypeScript npm workspace

**Useful for Sprite Harness:**

- Best match for runtime-first design.
- Allows explicit package boundaries for core runtime, adapters, providers, tools, sandbox, memory, sessions, skills, and RPC.
- Prevents CLI/TUI starters from owning core application state.
- Makes testing boundaries clean from day one.

**Risks for Sprite Harness:**

- Requires making more setup decisions manually.
- Needs explicit choices for CLI parser, TUI renderer, test framework, bundling, linting, and packaging.

**Assessment:** Best primary foundation. Use small libraries inside adapters rather than one large starter for the whole product.

### Selected Starter: Custom Runtime-First TypeScript Workspace

**Rationale for Selection:**

Sprite Harness should start from a custom TypeScript workspace rather than a generated CLI or TUI app starter.

The architecture must preserve one shared `AgentRuntime` across CLI, TUI, print mode, and JSON-RPC. A generated oclif or Ink starter would make early setup faster but risks centering the system around one interface. The product's core value depends on runtime contracts, event streams, sandbox enforcement, memory governance, session persistence, provider normalization, and skill evolution. Those boundaries should be explicit from the first implementation story.

The selected foundation is:

- npm-first workspace,
- TypeScript ESM,
- Node.js runtime compatibility,
- Bun-friendly development commands,
- custom package boundaries,
- Commander or equivalent lightweight parser for CLI adapter,
- Ink only inside the TUI adapter,
- JSON-RPC adapter built directly over stdin/stdout,
- runtime package independent from terminal UI.

### Initialization Command

Because the selected approach is custom workspace foundation rather than an external app starter, initialization should be manual and scripted as the first implementation story.

```bash
mkdir sprite-harness
cd sprite-harness
npm init -y
npm pkg set type=module
npm pkg set bin.sprite=./packages/cli/dist/index.js
npm pkg set workspaces[0]=packages/*
```

Implementation story 1 should then add TypeScript, test tooling, lint/format tooling, and package scripts.

### Architectural Decisions Provided by Starter

**Language & Runtime:**

- TypeScript as implementation language.
- ESM package posture.
- Node.js runtime compatibility for distributed CLI.
- Bun-friendly development workflow, but not Bun-only runtime.

**Styling Solution:**

- No styling solution at root.
- TUI styling belongs only inside the TUI adapter.
- Ink may be introduced in the TUI package after runtime events are defined.

**Build Tooling:**

- Root workspace scripts orchestrate package build/test/typecheck.
- Package-level builds keep runtime independent from CLI/TUI/RPC adapters.
- Bundling strategy should be decided after package boundaries are finalized.

**Testing Framework:**

- Core runtime tests must run without launching TUI.
- Provider adapter tests must run independently from `AgentLoop`.
- Tool execution and sandbox policy tests must run without model calls.
- JSON-RPC schemas need contract tests.
- Learning review and skill candidate generation need deterministic fixtures.

**Code Organization:**

Initial workspace direction:

```text
packages/
  core/
  cli/
  tui/
  rpc/
  providers/
  tools/
  sandbox/
  storage/
  memory/
  skills/
  config/
  shared/
```

This organization keeps runtime concepts explicit and prevents UI adapters from owning core behavior.

**Development Experience:**

- `npm` is the primary install/package path.
- Bun commands are documented for development where supported.
- Local execution should support the `sprite` binary during development.
- The first implementation story should create enough scripts to run typecheck, tests, and local CLI smoke checks.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

1. Runtime ownership and package boundaries.
2. Local storage model for sessions, audit, memory, skills, and learning artifacts.
3. Runtime event model and schema validation.
4. Provider adapter contract.
5. Tool execution, sandbox, and approval boundary.
6. JSON-RPC communication contract.
7. Test strategy and deterministic fixtures.

**Important Decisions (Shape Architecture):**

1. CLI parser and TUI renderer placement.
2. Credential storage and provider auth resolution.
3. Context assembly order.
4. Memory and skill candidate lifecycle.
5. Packaging, release, and Node/Bun support posture.

**Deferred Decisions (Post-MVP):**

1. SQLite-backed search/indexing.
2. Semantic/vector memory.
3. OS keychain integration.
4. Stronger sandbox backends such as containers.
5. Multi-provider parity beyond OpenAI-compatible provider.
6. Editor extension implementation.
7. Web dashboard/frontend.

### Data Architecture

**Decision: Use local artifact storage as the MVP source of truth, not a database-first architecture.**

MVP storage should be file-based and append-oriented:

```text
~/.sprite/
  config.json
  auth/
  memory/
    USER.md
    MEMORY.md
  skills/

.sprite/
  config.json
  sessions/
    <session-id>/
      events.ndjson
      state.json
      compactions/
      tool-logs/
      learning-review.json
  memory/
    PROJECT.md
    candidates/
  skills/
    candidates/
  learning/
```

**Rationale:**

- PRD requires local-first, inspectable, auditable storage.
- Append-only `events.ndjson` maps directly to runtime events, audit trail, RPC/NDJSON streaming, testing, and recovery.
- Markdown memory artifacts remain human-readable.
- JSON records provide typed machine-readable state for sessions, memory candidates, skill candidates, and learning reviews.
- File-based storage avoids premature database schema coupling while the runtime/event model is still forming.

**SQLite Decision: Deferred**

SQLite should be added behind a `StorageIndex` or `SessionIndex` abstraction when search, analytics, or large-session indexing become necessary. Do not make SQLite the MVP source of truth.

**Reason for deferral:**

- `node:sqlite` exists but is still not a conservative MVP dependency target.
- `better-sqlite3` is mature but introduces native installation complexity.
- MVP can satisfy session persistence, auditability, resume, compaction, and learning review with append-only local artifacts.
- A later SQLite index can be rebuilt from event logs if the event log is canonical.

**Data Modeling Approach:**

Use Zod schemas for persisted JSON artifacts:

- `Task`
- `RuntimeEvent`
- `SessionState`
- `CompactionSummary`
- `ToolInvocation`
- `ToolResult`
- `ApprovalRequest`
- `PolicyDecision`
- `MemoryCandidate`
- `MemoryEntryMetadata`
- `SkillCandidate`
- `ProviderCapabilityProfile`
- `LearningReview`

**Migration Approach:**

Each persisted JSON artifact includes:

- `schemaVersion`
- `createdAt`
- `updatedAt`
- stable `id`
- source/correlation IDs when applicable

Migrations are pure functions in `packages/storage` that upgrade JSON artifacts by schema version. Event logs remain append-only; if event shape changes, readers normalize old events into the current internal representation.

**Caching Strategy:**

MVP cache is in-memory per runtime process:

- loaded config,
- provider capability profile,
- loaded context files,
- loaded skill index,
- active session state,
- recent tool output summaries.

No cross-session cache is required for MVP.

### Authentication & Security

**Decision: No application user authentication in MVP. Provider authentication only.**

Sprite Harness is local personal software. The MVP does not need multi-user auth, accounts, teams, or hosted identity.

**Provider Auth Decision:**

Provider credentials resolve by explicit precedence:

1. CLI flags or runtime request override.
2. Local auth file.
3. Environment variables.
4. Provider config.

Provider auth state can be inspected without exposing secret values.

**Credential Storage Decision:**

Credential files live under `~/.sprite/auth/` and use restricted local permissions where supported:

- credential files: current-user read/write only,
- containing auth directory: current-user access only,
- unsupported permission enforcement: warning in setup/auth status.

**OAuth Decision:**

MVP implements OpenAI-compatible API-key provider first. OAuth authorization-code flow is architecture-supported through provider auth interfaces but may be implemented after MVP unless needed by a selected provider.

**Authorization / Policy Decision:**

Use a central `PolicyEngine` for:

- command risk classification,
- broad file-edit classification,
- memory save eligibility,
- RPC permission scope checks,
- approval requirement decisions.

No interface adapter can bypass policy. CLI, TUI, print mode, and RPC all call the same policy layer.

**Security Boundary Decision:**

Repository files, logs, tool output, context files, and model responses are untrusted input. They cannot override system/runtime policy.

### API & Communication Patterns

**Decision: Runtime event stream is the spine.**

The runtime emits typed `RuntimeEvent` records. All interfaces consume the same event stream:

- TUI renders events.
- `ndjson` prints events.
- JSON-RPC streams events.
- session store persists events.
- audit views read events.
- learning review consumes events.
- tests assert events.

**Runtime Event Schema Decision:**

Runtime events are discriminated unions validated with Zod at process boundaries and persistence boundaries.

Initial event families:

- `task.started`
- `task.plan.updated`
- `task.progress`
- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `approval.requested`
- `approval.resolved`
- `validation.started`
- `validation.completed`
- `memory.candidate.created`
- `memory.entry.saved`
- `skill.signal.recorded`
- `skill.candidate.created`
- `learning.review.created`
- `task.completed`
- `task.failed`
- `task.cancelled`

**JSON-RPC Decision:**

Use JSON-RPC over stdin/stdout for MVP. JSON-RPC is an adapter over `AgentRuntime`, not a separate runtime.

RPC methods should include:

- `runtime.getState`
- `session.create`
- `session.resume`
- `task.start`
- `task.cancel`
- `approval.respond`
- `memory.list`
- `skills.list`

RPC notifications stream runtime events.

**Error Handling Decision:**

Use structured errors with:

- `code`
- `message`
- `subsystem`
- `cause`
- `recoverable`
- `correlationId`
- optional `nextAction`

Provider errors, sandbox violations, validation failures, and RPC errors must not crash the runtime loop by default.

**Rate Limiting Decision:**

No network-style rate limiting for local MVP. Instead enforce:

- max agent iterations,
- command timeout,
- output size summarization threshold,
- context budget thresholds,
- provider request cancellation,
- approval timeout default deny where applicable.

### Frontend Architecture

**Decision: Interfaces are adapters, not owners.**

The core runtime has no dependency on Commander, Ink, React, JSON-RPC server libraries, or terminal rendering.

**CLI Adapter Decision:**

Use Commander or equivalent lightweight parser in `packages/cli`.

CLI responsibilities:

- parse command and flags,
- load config,
- construct task request,
- attach adapter event sink,
- call `AgentRuntime`,
- render text/json/ndjson output.

**TUI Adapter Decision:**

Use Ink only in `packages/tui`, after the runtime event model is established.

TUI responsibilities:

- render runtime events,
- maintain presentation state,
- collect user input,
- send steering/cancel/approval responses to runtime,
- display memory/skill/session/model state.

TUI must not own task lifecycle state.

**State Management Decision:**

Use adapter-local reducers over runtime events. No global frontend state library for MVP.

**Performance Decision:**

TUI rendering must respect NFR1/NFR2 by decoupling event ingestion from rendering. Large output rendering uses summaries/collapsible blocks, not raw full output.

### Infrastructure & Deployment

**Decision: Local-first npm package. No hosted infrastructure for MVP.**

Deployment means npm package distribution and local installation.

**Runtime Version Decision:**

Primary target: Node.js 24 LTS.
Compatibility target: Node.js 22 where dependency matrix permits.

Do not target Node.js 20 because it reaches EOL on 2026-04-30.

**Development Runtime Decision:**

- npm is canonical package/install workflow.
- Bun-friendly commands are documented for install, test, typecheck, and local execution.
- Bun is not the required runtime for the distributed CLI.

**Build Tooling Decision:**

Use TypeScript project references across packages. Use a package-level build tool only after package boundaries are created.

Initial scripts should cover:

- `typecheck`
- `test`
- `build`
- `lint`
- `format`
- `dev`
- `dev:cli`
- `dev:rpc`

**Testing Decision:**

Use Vitest stable line for TypeScript tests unless implementation discovery finds a blocker.

Test layers:

- unit tests for pure runtime state and policy,
- contract tests for runtime events and RPC schemas,
- integration tests for tool execution with fake filesystem/sandbox,
- provider adapter tests with mocked provider responses,
- deterministic fixtures for learning review and skill candidate generation,
- CLI smoke tests for `sprite`, `sprite -p`, and `sprite rpc`.

**CI Decision:**

Use GitHub Actions or equivalent CI later with matrix for supported Node versions. CI must run typecheck, tests, lint, and package build.

**Monitoring/Logging Decision:**

No remote telemetry in MVP. Logs are local artifacts:

- runtime events,
- tool logs,
- command stdout/stderr references,
- approval decisions,
- validation results,
- learning review outputs.

### Decision Impact Analysis

**Implementation Sequence:**

1. Workspace and package boundaries.
2. Shared schemas and event model.
3. Storage artifacts and session event log.
4. Runtime shell with event emission.
5. Provider adapter contract and OpenAI-compatible provider.
6. Tool registry with read/search/list/patch command stubs.
7. Sandbox runner and policy engine.
8. CLI adapter and print/ndjson output.
9. Session resume and compaction.
10. Memory candidates and learning review.
11. Skill signal and skill candidate flow.
12. Minimal TUI adapter.
13. JSON-RPC adapter.

**Cross-Component Dependencies:**

- Storage depends on schemas, not runtime implementation details.
- Runtime emits events; storage/audit/TUI/RPC consume them.
- Agent loop depends on provider and tool contracts, not concrete providers/tools.
- Sandbox and policy sit below all interface adapters.
- Memory and skill systems consume event history and learning review outputs.
- TUI and RPC never bypass runtime approval or policy decisions.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**

42 implementation areas could diverge across AI agents if left unspecified:

- Runtime package ownership and adapter boundaries
- Event naming, payload shape, lifecycle ordering, and correlation IDs
- JSON-RPC method names, params/results, errors, and permission scopes
- Local artifact naming, schema versioning, session layout, and migrations
- Provider adapter capability names, auth state, and model metadata
- Sandbox policy naming, approval request shape, command result shape, and audit records
- Memory entry classification, candidate review state, redaction, and reuse attribution
- Skill signal/candidate lifecycle, review state, and promotion gates
- Test placement, fixture naming, mocked provider behavior, and deterministic loop assertions
- CLI/TUI/print output formats and state derivation from runtime events

### Naming Patterns

**Storage and Future Database Naming Conventions:**

Sprite Harness is storage-artifact-first for MVP. If SQLite indexes are introduced later, they must mirror the artifact model rather than replace it.

Rules:

- Artifact filenames use `kebab-case`: `learning-review.json`, `events.ndjson`, `state.json`.
- Artifact JSON fields use `camelCase`: `sessionId`, `correlationId`, `schemaVersion`.
- Directory names use lowercase `kebab-case` or plural nouns where they contain collections: `tool-logs/`, `compactions/`, `skill-candidates/`.
- Future SQLite table names use plural `snake_case`: `sessions`, `runtime_events`, `memory_entries`, `skill_candidates`.
- Future SQLite columns use `snake_case`: `session_id`, `correlation_id`, `schema_version`.
- Future indexes use `idx_<table>_<column_or_purpose>`: `idx_runtime_events_session_id`.

**API and RPC Naming Conventions:**

Rules:

- JSON-RPC methods use dot-scoped lower camel case: `task.start`, `runtime.getState`, `approval.respond`.
- RPC params and results use `camelCase`.
- RPC permission scopes use colon-separated lowercase nouns/actions: `task:start`, `approval:respond`, `memory:read`.
- Runtime event names use dot-scoped past-tense or lifecycle verbs: `task.started`, `tool.call.completed`, `memory.candidate.created`.
- Approval actions use lowercase verbs: `allow`, `deny`, `edit`, `alwaysAllowForSession`.

**Code Naming Conventions:**

Rules:

- TypeScript types, interfaces, classes, and React/Ink components use `PascalCase`.
- Functions, variables, schema instances, and package-local constants use `camelCase`.
- Runtime event schema constants use descriptive camelCase names ending in `Schema`: `runtimeEventSchema`, `approvalRequestSchema`.
- Files use `kebab-case.ts` by default: `agent-runtime.ts`, `policy-engine.ts`.
- Test files use `*.test.ts` next to the source unless the test is cross-package or scenario-based.
- Package names use `@sprite-harness/<name>` internally if scoped packages are introduced.

**Canonical ID Pattern:**

Rules:

- IDs use stable prefixes:
  - `ses_` for sessions
  - `task_` for tasks
  - `evt_` for events
  - `corr_` for correlations
  - `tool_` for tool calls
  - `appr_` for approvals
  - `mem_` for memory entries
  - `skillcand_` for skill candidates
- IDs are generated by runtime/storage utilities, not hand-assembled inside adapters.

### Structure Patterns

**Project Organization:**

Rules:

- Core behavior lives in `packages/core`; adapters never own task lifecycle state.
- CLI behavior lives in `packages/cli`; CLI only parses input, calls runtime, and renders output.
- TUI behavior lives in `packages/tui`; TUI derives display state from runtime events.
- RPC behavior lives in `packages/rpc`; RPC maps JSON-RPC requests to runtime APIs and streams events.
- Provider adapters live in `packages/providers`.
- Tool implementations live in `packages/tools`.
- Sandbox and policy logic live in `packages/sandbox`.
- Memory logic lives in `packages/memory`.
- Skill logic lives in `packages/skills`.
- Persisted storage abstractions live in `packages/storage`.
- Shared schemas and small cross-package primitives live in `packages/shared`.

**File Structure Patterns:**

Rules:

- Package source code goes under `packages/<package>/src`.
- Package tests are co-located as `*.test.ts` for unit tests.
- Cross-package scenario tests go under `tests/scenarios`.
- Fixtures go under `tests/fixtures/<domain>`.
- Golden event logs go under `tests/fixtures/events`.
- Documentation for user-facing behavior goes under `docs`.
- Planning artifacts stay under `_bmad-output/planning-artifacts`.
- Generated local runtime state must never be committed unless it is a fixture.

**Module Boundary Rules:**

Rules:

- `packages/core` may depend on shared schemas, storage interfaces, memory interfaces, provider interfaces, tool interfaces, and policy interfaces.
- `packages/core` must not depend on CLI, TUI, RPC, Ink, Commander, or terminal rendering libraries.
- `packages/tui`, `packages/cli`, and `packages/rpc` may depend on `packages/core`, but core must not import them.
- Provider adapters must not write memory directly; they return model responses and metadata to runtime.
- Tools must not request approval directly; they submit tool intents to the runtime/policy boundary.
- Memory and skills may emit candidates, but promotion requires an explicit approval path.

### Format Patterns

**Runtime Event Format:**

All runtime events use this base shape:

```json
{
  "schemaVersion": 1,
  "eventId": "evt_...",
  "sessionId": "ses_...",
  "taskId": "task_...",
  "correlationId": "corr_...",
  "type": "tool.call.completed",
  "createdAt": "2026-04-21T00:00:00.000Z",
  "payload": {}
}
```

Rules:

- `type` is required and stable.
- `createdAt` is an ISO 8601 UTC string.
- `correlationId` links related model, tool, approval, validation, memory, and skill events.
- Event payloads must be schema-validated.
- Events are append-only in `events.ndjson`.
- Derived UI state must be rebuilt from events plus `state.json`, not hidden adapter state.

**JSON-RPC Formats:**

Successful JSON-RPC responses follow the JSON-RPC 2.0 result pattern.

Application-level result payloads use:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "correlationId": "corr_..."
  }
}
```

Application-level failures use:

```json
{
  "ok": false,
  "error": {
    "code": "SANDBOX_DENIED",
    "message": "Command requires approval",
    "subsystem": "sandbox",
    "recoverable": true,
    "correlationId": "corr_...",
    "nextAction": "Request approval or choose a safer command"
  }
}
```

Rules:

- Transport errors use JSON-RPC error objects.
- Runtime/domain errors inside successful JSON-RPC transport use the structured `ok: false` payload when the request was handled.
- Error codes use `SCREAMING_SNAKE_CASE`.
- User-facing messages must not include secrets, raw auth values, or unsafe command output.
- Machine-readable fields must be present for automation.

**Data Exchange Formats:**

Rules:

- JSON fields use `camelCase`.
- Dates use ISO 8601 UTC strings.
- Durations use milliseconds as numbers with field names ending in `Ms`.
- Byte counts use numbers with field names ending in `Bytes`.
- Optional unknown values use `null` only when absence is meaningful; otherwise omit the field.
- Secrets must be represented by redacted placeholders such as `[REDACTED]`, never stored raw.
- Large outputs store a summary plus a local log reference.

### Communication Patterns

**Event System Patterns:**

Rules:

- Runtime event names use `<domain>.<entity-or-action>.<state>` where practical.
- Lifecycle events use `started`, `completed`, `failed`, `cancelled`.
- Candidate events use `candidate.created`, not `suggested`, to keep lifecycle explicit.
- Approval events use `approval.requested` and `approval.resolved`.
- Validation events use `validation.started` and `validation.completed`.
- Memory save events use `memory.entry.saved`; memory candidates use `memory.candidate.created`.
- Skill promotion is separate from candidate creation: `skill.candidate.created` does not imply installed skill behavior.

**State Management Patterns:**

Rules:

- Runtime state is canonical in core.
- Adapters maintain only derived/rendering state.
- Reducers must treat events as append-only inputs.
- State updates must be deterministic from event order.
- UI components must not infer task completion from text output; they must use terminal runtime events.
- RPC clients must not assume final state until receiving `task.completed`, `task.failed`, or `task.cancelled`.

**Deterministic Replay Pattern:**

Rules:

- A session replay from `events.ndjson` plus `state.json` must reconstruct the same task status, visible approvals, tool history, memory candidates, and skill candidates.
- Adapter state is disposable. If losing TUI/CLI/RPC process state changes runtime truth, the implementation is wrong.
- Runtime events must never depend on terminal rendering order, animation timing, or UI-local counters.

**Logging Patterns:**

Rules:

- Logs use structured records where possible.
- Every log entry connected to a task includes `sessionId`, `taskId`, and `correlationId`.
- Tool output above threshold is summarized in UI/JSON response and stored with a log reference.
- Logs must apply the same redaction rules as memory and summaries.
- Debug logs are local only in MVP.

### Process Patterns

**Error Handling Patterns:**

Rules:

- Errors crossing package boundaries must be converted to structured domain errors.
- Each structured error includes `code`, `message`, `subsystem`, `recoverable`, `correlationId`, and optional `nextAction`.
- Runtime loop failures should create a retrospective-eligible terminal record.
- Provider errors must preserve retryability metadata when available.
- Sandbox denials are expected control flow, not crashes.
- Validation failures should be recorded with command, cwd, summarized output, and suggested next step.

**Approval Patterns:**

Rules:

- Risky command execution, broad edits, memory saves, skill promotion, and sensitive RPC actions go through the policy engine.
- Approval requests must include request ID, type, summary, cwd, affected files, risk, reason, environment exposure, timeout, allowed actions, and correlation ID.
- Approval timeout defaults to deny.
- Approved commands still emit tool lifecycle events.
- Edited approvals must create a new auditable command/edit intent.

**Memory and Learning Patterns:**

Rules:

- Working memory is task/session scoped.
- Episodic memory records task outcomes and notable events.
- Semantic memory records durable project/user facts.
- Procedural memory records reusable workflow lessons.
- Self-model memory records agent capability/limitation observations.
- Post-task learning reviews create candidates first.
- Long-term memory writes require filtering, redaction, and review policy.
- Memory reuse must be visible in task history or summary when it materially influenced behavior.

**Learning Feedback Control Pattern:**

Rules:

- A memory entry, learning review, or skill candidate must include evidence references such as task ID, event IDs, files touched, commands run, or validation results.
- Reused memory must be marked as `used`, `ignored`, or `contradicted` in task history when relevant.
- If a lesson causes a later failure, the retrospective must be able to identify which memory/skill influenced the behavior.
- Skill candidates from repeated workflows must include minimum evidence, counterexamples, and known failure cases before approval.

**Skill Evolution Patterns:**

Rules:

- Repeated workflow signals create skill signals first.
- Skill signals can aggregate into skill candidates.
- Skill candidates are draft artifacts, not active behavior.
- User approval is required before skill promotion.
- Promoted skills must include trigger rules, scope, constraints, and examples.
- Rejected skill candidates should retain rejection reason for future learning.

**RPC and Agent-to-Agent Boundary Pattern:**

Rules:

- RPC clients receive scoped capabilities, not full runtime authority by default.
- RPC scopes must be bound to session/task where possible.
- External agents must submit tool/edit/approval intents through runtime APIs, never write `.sprite` artifacts directly.
- RPC event subscriptions must filter by authorized session/task scope.
- Approval responses must validate both `approvalRequestId` and caller scope.

**Concurrency and Locking Pattern:**

Rules:

- Session writes must be serialized per session.
- Append-only event writes must preserve order.
- Memory and skill candidate promotion must use optimistic conflict checks or explicit review state transitions.
- Agents must not mutate the same session state file from multiple processes without the storage layer.

**Testing and Validation Patterns:**

Rules:

- Core runtime tests use deterministic fake providers and fake tools.
- Sandbox tests assert policy decisions without executing risky commands.
- Provider adapter tests use recorded/minimal fixtures, not live network by default.
- Event tests assert exact event sequence for critical loops.
- Memory tests assert redaction, classification, candidate creation, and reuse attribution.
- Skill tests assert signal aggregation and candidate lifecycle.
- RPC tests assert method schemas, errors, lifecycle events, and approval flow.
- CLI/TUI tests focus on adapter behavior, not runtime logic.

### Enforcement Guidelines

**All AI Agents MUST:**

- Add or update schemas before writing new persisted artifact shapes.
- Emit runtime events for task, tool, approval, validation, memory, and skill lifecycle changes.
- Keep CLI, TUI, print, and RPC as adapters over `AgentRuntime`.
- Use patch-based file edits unless an explicitly approved workflow requires otherwise.
- Route risky commands, broad edits, memory saves, and skill promotion through policy/approval.
- Store local runtime artifacts under the agreed `~/.sprite` and `.sprite` layouts.
- Avoid saving secrets or raw credentials to memory, logs, summaries, RPC state, or learning reviews.
- Add deterministic tests for new runtime, provider, sandbox, memory, skill, or RPC behavior.
- Preserve event and artifact backward compatibility through `schemaVersion`.

**Schema Change Pattern:**

- Any change to a persisted artifact, RPC payload, runtime event, memory entry, or skill candidate must update:
  - the Zod schema,
  - at least one fixture,
  - relevant tests,
  - and migration/default handling when old artifacts may exist.
- Schema changes must preserve `schemaVersion` and document compatibility behavior.
- Agents must not add ad hoc optional fields to persisted JSON without schema ownership.

**Pattern Enforcement:**

- TypeScript typecheck validates package boundaries and shared contracts.
- Zod schemas validate persisted JSON, RPC payloads, and runtime event payloads.
- Tests validate deterministic runtime event sequences.
- Fixture-based tests validate compaction, resume, memory filtering, and skill candidate generation.
- Architecture deviations require an ADR or explicit architecture document update.
- Pattern violations found during implementation should be recorded in the task retrospective.

### Pattern Examples

**Good Examples:**

- `packages/core/src/agent-runtime.ts` owns task loop orchestration.
- `packages/tui/src/runtime-event-reducer.ts` derives visible state from events.
- `packages/rpc/src/methods/task-start.ts` maps `task.start` to runtime APIs.
- `.sprite/sessions/ses_123/events.ndjson` stores append-only lifecycle events.
- `memory.candidate.created` is emitted before any durable memory write.
- `skill.candidate.created` creates a reviewable draft, not an active skill.
- `SANDBOX_APPROVAL_REQUIRED` includes `recoverable: true` and a `nextAction`.

**Anti-Patterns:**

- Implementing a separate task loop inside the TUI.
- Letting CLI output parsing determine runtime state.
- Writing memory directly from a provider adapter.
- Promoting a skill automatically because a workflow repeated twice.
- Returning raw provider errors with secrets or request headers.
- Storing command output above threshold only in summaries with no full local log reference.
- Adding RPC methods without schema validation.
- Creating hidden adapter state that cannot be reconstructed from runtime events.

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
sprite-harness/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.js
├── vitest.config.ts
├── .gitignore
├── .npmrc
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── configuration.md
│   ├── providers.md
│   ├── sandbox.md
│   ├── memory.md
│   ├── skills.md
│   └── rpc.md
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── ids.ts
│   │       ├── result.ts
│   │       ├── time.ts
│   │       ├── errors.ts
│   │       └── schemas/
│   │           ├── runtime-event.ts
│   │           ├── approval.ts
│   │           ├── tool.ts
│   │           ├── provider.ts
│   │           ├── memory.ts
│   │           ├── skill.ts
│   │           └── rpc.ts
│   ├── core/
│   │   └── src/
│   │       ├── agent-runtime.ts
│   │       ├── runtime-loop.ts
│   │       ├── context-assembler.ts
│   │       ├── compaction.ts
│   │       ├── task-state.ts
│   │       ├── event-bus.ts
│   │       └── ports/
│   │           ├── provider-port.ts
│   │           ├── tool-port.ts
│   │           ├── storage-port.ts
│   │           ├── policy-port.ts
│   │           ├── memory-port.ts
│   │           └── skill-port.ts
│   ├── storage/
│   │   └── src/
│   │       ├── sprite-home.ts
│   │       ├── project-store.ts
│   │       ├── session-store.ts
│   │       ├── event-log.ts
│   │       ├── artifact-lock.ts
│   │       ├── migrations.ts
│   │       └── layouts.ts
│   ├── providers/
│   │   └── src/
│   │       ├── provider-registry.ts
│   │       ├── provider-capabilities.ts
│   │       ├── openai-compatible-provider.ts
│   │       ├── auth/
│   │       │   ├── api-key-auth.ts
│   │       │   ├── auth-store.ts
│   │       │   └── oauth-placeholder.ts
│   │       └── fixtures/
│   ├── tools/
│   │   └── src/
│   │       ├── tool-registry.ts
│   │       ├── read-file.ts
│   │       ├── list-files.ts
│   │       ├── search.ts
│   │       ├── apply-patch.ts
│   │       ├── run-command.ts
│   │       └── output-summarizer.ts
│   ├── sandbox/
│   │   └── src/
│   │       ├── policy-engine.ts
│   │       ├── command-classifier.ts
│   │       ├── approval-service.ts
│   │       ├── sandbox-runner.ts
│   │       └── redaction.ts
│   ├── memory/
│   │   └── src/
│   │       ├── memory-service.ts
│   │       ├── memory-classifier.ts
│   │       ├── memory-candidates.ts
│   │       ├── memory-review.ts
│   │       ├── learning-review.ts
│   │       └── reuse-tracker.ts
│   ├── skills/
│   │   └── src/
│   │       ├── skill-registry.ts
│   │       ├── skill-loader.ts
│   │       ├── skill-signals.ts
│   │       ├── skill-candidates.ts
│   │       ├── skill-review.ts
│   │       └── skill-promoter.ts
│   ├── config/
│   │   └── src/
│   │       ├── config-loader.ts
│   │       ├── config-schema.ts
│   │       ├── precedence.ts
│   │       └── project-context.ts
│   ├── cli/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── commands/
│   │       │   ├── run.ts
│   │       │   ├── print.ts
│   │       │   ├── resume.ts
│   │       │   ├── memory.ts
│   │       │   ├── skills.ts
│   │       │   └── rpc.ts
│   │       └── renderers/
│   │           ├── text-renderer.ts
│   │           ├── json-renderer.ts
│   │           └── ndjson-renderer.ts
│   ├── tui/
│   │   └── src/
│   │       ├── app.tsx
│   │       ├── runtime-event-reducer.ts
│   │       ├── screens/
│   │       └── components/
│   └── rpc/
│       └── src/
│           ├── rpc-server.ts
│           ├── rpc-session.ts
│           ├── scope-authorizer.ts
│           ├── methods/
│           │   ├── runtime-get-state.ts
│           │   ├── session-create.ts
│           │   ├── session-resume.ts
│           │   ├── task-start.ts
│           │   ├── task-cancel.ts
│           │   ├── approval-respond.ts
│           │   ├── memory-list.ts
│           │   └── skills-list.ts
│           └── event-subscriptions.ts
├── tests/
│   ├── scenarios/
│   │   ├── task-loop.test.ts
│   │   ├── approval-flow.test.ts
│   │   ├── resume-compaction.test.ts
│   │   ├── memory-learning.test.ts
│   │   ├── skill-candidate.test.ts
│   │   └── rpc-agent-flow.test.ts
│   ├── fixtures/
│   │   ├── events/
│   │   ├── sessions/
│   │   ├── providers/
│   │   ├── memory/
│   │   └── skills/
│   └── helpers/
│       ├── fake-provider.ts
│       ├── fake-tool.ts
│       ├── temp-project.ts
│       └── event-assertions.ts
└── scripts/
    ├── check-boundaries.ts
    ├── build.ts
    └── release-local.ts
```

### Architectural Boundaries

**API Boundaries:**

- `packages/core` exposes `AgentRuntime` and typed ports.
- `packages/rpc` exposes JSON-RPC over stdin/stdout and never mutates runtime artifacts directly.
- `packages/cli` exposes the `sprite` binary and maps commands to runtime calls.
- `packages/tui` consumes runtime events and sends user intents back to runtime.
- Provider APIs are isolated behind `ProviderPort`.
- Tool execution APIs are isolated behind `ToolPort` and policy checks.

**Component Boundaries:**

- Core owns task lifecycle, event emission, context assembly, compaction, and terminal state.
- Adapters own input parsing and rendering only.
- Storage owns file layout, locking, migrations, and append-only event persistence.
- Sandbox owns command risk classification, approval decisions, redaction, and execution boundary.
- Memory owns learning review, candidates, durable memory writes, and reuse attribution.
- Skills owns signal aggregation, candidate lifecycle, review, and promotion.

**Service Boundaries:**

- Runtime calls providers through provider ports.
- Runtime calls tools through tool ports.
- Runtime asks policy before risky commands, broad edits, durable memory writes, skill promotion, and scoped RPC actions.
- Runtime emits events before adapters render state.
- Memory and skills consume event history and learning reviews, not raw adapter state.

**Data Boundaries:**

- Global data lives under `~/.sprite`.
- Project data lives under `.sprite`.
- Session event history is append-only `events.ndjson`.
- `state.json` is a recoverable snapshot, not the only source of truth.
- Secrets live only in auth stores and must not enter logs, summaries, memory, RPC state, or learning reviews.
- Future SQLite indexes are secondary indexes over canonical artifact data.

### Requirements to Structure Mapping

**Runtime and Task Execution:**

- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-loop.ts`
- `packages/core/src/event-bus.ts`
- `tests/scenarios/task-loop.test.ts`

**Repository Tools and File Editing:**

- `packages/tools/src/read-file.ts`
- `packages/tools/src/list-files.ts`
- `packages/tools/src/search.ts`
- `packages/tools/src/apply-patch.ts`
- `packages/tools/src/run-command.ts`

**Sandbox, Approval, and Safety:**

- `packages/sandbox/src/policy-engine.ts`
- `packages/sandbox/src/command-classifier.ts`
- `packages/sandbox/src/approval-service.ts`
- `packages/sandbox/src/sandbox-runner.ts`
- `tests/scenarios/approval-flow.test.ts`

**Sessions, Context, and Compaction:**

- `packages/storage/src/session-store.ts`
- `packages/storage/src/event-log.ts`
- `packages/core/src/context-assembler.ts`
- `packages/core/src/compaction.ts`
- `tests/scenarios/resume-compaction.test.ts`

**Memory, Learning, and Retrospective:**

- `packages/memory/src/memory-service.ts`
- `packages/memory/src/learning-review.ts`
- `packages/memory/src/memory-candidates.ts`
- `packages/memory/src/reuse-tracker.ts`
- `tests/scenarios/memory-learning.test.ts`

**Skills and Skill Evolution:**

- `packages/skills/src/skill-registry.ts`
- `packages/skills/src/skill-signals.ts`
- `packages/skills/src/skill-candidates.ts`
- `packages/skills/src/skill-review.ts`
- `packages/skills/src/skill-promoter.ts`
- `tests/scenarios/skill-candidate.test.ts`

**Interfaces and Integration:**

- `packages/cli/src`
- `packages/tui/src`
- `packages/rpc/src`
- `tests/scenarios/rpc-agent-flow.test.ts`

**Provider, Authentication, Configuration, and Packaging:**

- `packages/providers/src`
- `packages/providers/src/auth`
- `packages/config/src`
- root `package.json`
- root `tsconfig.base.json`

### Integration Points

**Internal Communication:**

- Runtime emits typed runtime events.
- Adapters subscribe to events and submit typed intents.
- Storage persists events and snapshots.
- Memory and skills consume event history after task execution.
- Policy engine gates risky actions before tools execute.

**External Integrations:**

- OpenAI-compatible provider APIs through `packages/providers`.
- JSON-RPC clients and external agents through `packages/rpc`.
- Local shell command execution through `packages/tools` plus `packages/sandbox`.
- Project files through tool ports, not direct adapter access.

**Data Flow:**

1. User or RPC client submits task intent.
2. CLI/TUI/RPC adapter calls `AgentRuntime`.
3. Runtime assembles context from config, session, project files, memory, and selected skills.
4. Runtime calls provider through provider port.
5. Runtime requests tool intent.
6. Policy engine approves, denies, or asks user.
7. Tool result returns to runtime and emits events.
8. Runtime validates progress, continues loop, or reaches terminal state.
9. Learning review creates memory and skill candidates.
10. Storage persists events, state, logs, candidates, and review artifacts.

### File Organization Patterns

**Configuration Files:**

- Root config controls workspace build, lint, test, and package scripts.
- `packages/config` owns Sprite config schema and precedence.
- `.env.example` documents environment variables without secrets.
- Runtime config resolves global config, project config, env vars, auth files, and CLI overrides.

**Source Organization:**

- Each package has `src`.
- Package APIs are exported from package-local entry points.
- Cross-package contracts live in `packages/shared`.
- Domain behavior stays in the owning package instead of shared utilities unless reused across boundaries.

**Test Organization:**

- Unit tests are co-located with implementation.
- Scenario tests live under `tests/scenarios`.
- Fixtures live under `tests/fixtures`.
- Helpers for fake providers, fake tools, temp projects, and event assertions live under `tests/helpers`.

**Asset Organization:**

- Static UI assets are deferred until TUI or future frontend requires them.
- Runtime-generated artifacts belong in `~/.sprite` or `.sprite`, not source directories.
- Documentation assets belong under `docs/assets` if needed later.

### Development Workflow Integration

**Development Server Structure:**

- `npm run dev:cli` runs the CLI against local packages.
- `npm run dev:rpc` starts JSON-RPC stdin/stdout mode for external agents.
- `npm run dev:tui` runs the TUI adapter after event contracts are stable.
- Development commands must use local package source, not published builds.

**Build Process Structure:**

- TypeScript project references build packages in dependency order.
- `packages/shared` builds before runtime-facing packages.
- `packages/core` builds before CLI, TUI, and RPC adapters.
- Build output goes to package-local `dist` directories.
- Package exports expose compiled entry points only.

**Deployment Structure:**

- MVP distribution is an npm package exposing the `sprite` binary.
- Bun is supported as a developer/runtime-friendly path where compatible, but npm remains canonical.
- No hosted deployment is required for MVP.
- CI later runs typecheck, tests, lint, and package build.

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**

The architecture is coherent. The runtime-first decision, TypeScript workspace, local-first storage, event stream, adapter-only CLI/TUI/RPC interfaces, OpenAI-compatible provider MVP, sandbox policy boundary, and memory/skill candidate lifecycle all reinforce the same implementation model.

No contradictory decisions were found.

Compatibility notes:

- Node.js 24 LTS primary target and Node.js 22 compatibility posture align with npm-first distribution.
- Bun-friendly support remains compatible because Bun is not the canonical runtime requirement.
- Ink and Commander/equivalent are adapter-level choices and do not affect core runtime contracts.
- SQLite remains deferred behind storage/index abstractions, avoiding native dependency risk in MVP.
- OAuth architecture is reserved for later while API-key auth remains the MVP provider path.

**Pattern Consistency:**

Implementation patterns support the architectural decisions.

- Naming rules align with JSON artifacts, runtime events, JSON-RPC, and future SQLite indexing.
- Event rules support auditability, deterministic replay, TUI rendering, RPC subscriptions, and learning review.
- Schema rules prevent untracked drift in persisted artifacts.
- Memory and skill rules prevent unapproved long-term behavioral changes.
- RPC scope rules preserve the runtime approval boundary for external agents.

**Structure Alignment:**

The project structure supports the architecture.

- `packages/core` owns runtime lifecycle and exposes ports.
- `packages/cli`, `packages/tui`, and `packages/rpc` are adapter-only packages.
- `packages/shared` owns schemas and primitives.
- `packages/storage`, `packages/sandbox`, `packages/memory`, `packages/skills`, `packages/providers`, and `packages/tools` map directly to architectural subsystems.
- Scenario tests and fixtures are positioned to validate event replay, compaction, sandbox approval, memory learning, skill evolution, and RPC flows.

### Requirements Coverage Validation

**Feature Coverage:**

All PRD feature groups have architectural support:

- Runtime and task execution: covered by `packages/core`.
- Tools and repository work: covered by `packages/tools`.
- Sandbox, approval, and safety: covered by `packages/sandbox` plus runtime policy ports.
- Sessions, context, and compaction: covered by `packages/storage` and core context/compaction modules.
- Memory, learning, and retrospective: covered by `packages/memory`.
- Skills and skill evolution: covered by `packages/skills`.
- Interfaces and integration: covered by `packages/cli`, `packages/tui`, and `packages/rpc`.
- Provider, authentication, configuration, and packaging: covered by `packages/providers`, `packages/config`, and root package setup.

**Functional Requirements Coverage:**

The architecture supports the PRD's 91 functional requirements through explicit subsystem boundaries, runtime events, storage artifacts, provider/tool ports, approval policy gates, and adapter contracts.

No orphan functional requirement category was found.

**Non-Functional Requirements Coverage:**

The architecture supports the PRD's 50 NFRs.

- Responsiveness: adapter-local rendering with runtime events and no UI-owned task loop.
- Streaming/event latency: runtime event spine and NDJSON output mode.
- Compaction continuity: compaction module plus persisted session state/event history.
- Large output handling: output summarizer and local tool log references.
- Sandbox and approval: policy engine, approval service, sandbox runner, and scoped RPC approval.
- Secret protection: redaction boundary and auth store isolation.
- Resume/recovery: event log plus snapshot state.
- Retrospective eligibility: terminal task records, event history, tool logs, touched files, and failure reasons.
- Auditability: append-only events, approval records, memory/skill candidate records, and validation events.
- Local-first portability: global/project storage split and relative project config rules.
- Maintainability/testability: package boundaries, schemas, fixtures, and scenario tests.

### Implementation Readiness Validation

**Decision Completeness:**

Critical decisions are ready for implementation:

- Runtime ownership and package boundaries are defined.
- Storage strategy and schema validation are defined.
- Event model and JSON-RPC contracts are defined.
- Provider adapter boundary is defined.
- Sandbox and approval boundary is defined.
- Memory and skill candidate lifecycle is defined.
- Test strategy is defined.

**Structure Completeness:**

The project structure is specific enough for initial implementation. It defines root config, package boundaries, source locations, adapter locations, test fixtures, scenario tests, and scripts.

**Pattern Completeness:**

Implementation patterns cover the highest-risk divergence points:

- Naming and IDs
- Storage artifacts and schema changes
- Runtime events and replay
- RPC errors/scopes
- Sandbox approval
- Memory and skill learning controls
- Concurrency and locking
- Testing and fixtures

### Gap Analysis Results

**Critical Gaps:**

None found.

**Important Gaps:**

These should become early implementation stories or ADRs:

1. Command risk matrix detail
   The architecture defines the policy boundary, but implementation still needs concrete risk categories, default rules, and examples.

2. Provider streaming/tool-call delta schema
   The provider adapter contract is defined, but exact streaming chunk normalization should be specified before implementing multiple providers.

3. Compaction quality rubric
   The architecture defines retained fields, but tests need a rubric for acceptable summaries and resume continuity.

4. Initial deterministic fixture set
   The architecture defines fixture locations and scenarios, but the first implementation pass must create canonical fixtures for task loop, approval, compaction, memory, skill candidate, and RPC flows.

5. OAuth authorization-code flow details
   OAuth is intentionally deferred. The placeholder boundary exists, but exact device/browser callback behavior remains post-MVP or later MVP-extension work.

**Nice-to-Have Gaps:**

- ADR template for future architecture changes.
- Local developer debug command for replaying a session event log.
- Human-readable storage layout documentation generated from schemas.
- Optional editor integration package after CLI/RPC are stable.

### Validation Issues Addressed

No blocking issues were found.

Important gaps are not blockers because the architecture places each unresolved detail behind a clear subsystem boundary:

- command risk detail belongs in `packages/sandbox`;
- streaming normalization belongs in `packages/providers`;
- compaction rubric belongs in `packages/core` and scenario fixtures;
- deterministic fixtures belong in `tests/fixtures`;
- OAuth details belong behind the provider auth boundary.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

Confidence is high because the architecture is built from a validated PRD, directly maps requirement categories to package boundaries, defines enforcement patterns for AI-agent consistency, and identifies remaining details as bounded implementation follow-ups rather than architectural blockers.

**Key Strengths:**

- Runtime-first design prevents CLI/TUI/RPC divergence.
- Event stream creates a shared spine for audit, replay, UI, RPC, learning, and skills.
- Local-first artifact model keeps MVP inspectable and portable.
- Policy engine centralizes sandbox, approval, memory, skill, and RPC safety decisions.
- Memory and skill evolution are candidate-first, preventing uncontrolled self-modification.
- Scenario fixtures make learning and replay behavior testable.

**Areas for Future Enhancement:**

- SQLite-backed indexes for search and analytics.
- Semantic/vector memory after durable memory semantics prove useful.
- Stronger OS-specific sandbox backends.
- Multi-provider parity beyond OpenAI-compatible API-key providers.
- Editor integration and frontend dashboard.
- OAuth authorization-code implementation.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect package boundaries and never put runtime ownership in adapters.
- Add schemas and fixtures before adding new persisted artifact shapes.
- Route risky command execution, broad edits, memory saves, skill promotion, and scoped RPC actions through policy approval.
- Prefer deterministic fake providers/tools for tests before live provider integration.
- Refer to this document for all architectural questions.

**First Implementation Priority:**

Start by scaffolding the TypeScript workspace and core contract layer:

1. Root workspace config and package scripts.
2. `packages/shared` schemas, IDs, errors, and result primitives.
3. `packages/core` `AgentRuntime` shell, runtime event bus, and ports.
4. `packages/storage` session layout and append-only event log.
5. Deterministic scenario fixture for a minimal task lifecycle.
