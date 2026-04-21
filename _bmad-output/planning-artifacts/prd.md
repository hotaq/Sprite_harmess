---
stepsCompleted:
  - "step-01-init"
  - "step-02-discovery"
  - "step-02b-vision"
  - "step-02c-executive-summary"
  - "step-03-success"
  - "step-04-journeys"
  - "step-05-domain"
  - "step-06-innovation"
  - "step-07-project-type"
  - "step-08-scoping"
  - "step-09-functional"
  - "step-10-nonfunctional"
  - "step-11-polish"
  - "step-12-complete"
  - "step-e-01-discovery"
  - "step-e-02-review"
  - "step-e-03-edit"
inputDocuments:
  - "_bmad-output/planning-artifacts/product-brief-Sprite-Harness.md"
  - "https://github.com/nousresearch/hermes-agent"
  - "https://github.com/badlogic/pi-mono/tree/main/packages"
  - "https://github.com/yasasbanukaofficial/claude-code"
documentCounts:
  productBriefs: 1
  research: 3
  brainstorming: 0
  projectDocs: 0
workflowType: "prd"
workflowStatus: "complete"
projectName: "Sprite Harness"
classification:
  projectType: "cli_tool"
  secondaryType: "developer_tool"
  productClass: "local AI agent runtime for developer workflows"
  interfaceModes:
    - "CLI interactive"
    - "CLI print/non-interactive"
    - "TUI"
    - "JSON-RPC"
  domain: "AI developer tooling"
  complexity: "medium-high"
  projectContext: "greenfield"
  architecturalPosture: "runtime-first, UI-adapter based"
  coreDifferentiators:
    - "personal-first memory and context"
    - "multi-provider model abstraction"
    - "sandboxed command execution"
    - "skill/agent extensibility"
    - "agentic plan-act-observe loop"
  referencePositioning:
    hermes: "memory, session recall, skills, provider switching"
    piMono: "TypeScript modularity, CLI/TUI/RPC modes, minimal tools"
    claudeCodeLike: "terminal UX and agentic workflow inspiration only; do not copy implementation"
visionUnderstanding:
  productIdentity: "self-evolving cognitive agent harness for developer workflows"
  runtimePosture: "runtime-first with CLI, TUI, and JSON-RPC clients"
  cognitiveModel:
    workingMemory: "current task state, context window, plan, recent observations"
    episodicMemory: "session history, task outcomes, decisions, file and command activity"
    semanticMemory: "durable user preferences, project facts, conventions, lessons"
    proceduralMemory: "skills and reusable workflows evolved from repeated successful behavior"
    selfModel: "runtime-generated knowledge of tools, limits, provider, sandbox, context, skills, and memory state"
  learningLoop:
    - "capture experience"
    - "compact context"
    - "consolidate durable memory"
    - "detect repeated patterns"
    - "propose skills"
    - "track skill outcomes"
    - "refine future behavior"
  safetyBoundary:
    autoAllowed:
      - "bounded memory capture"
      - "session summaries"
      - "non-sensitive project facts with provenance"
    confirmationRequired:
      - "skill creation or promotion"
      - "destructive commands"
      - "broad file edits"
      - "memory entries with low confidence"
  mvpCognitiveScope:
    - "working memory"
    - "session store"
    - "structured compaction"
    - "markdown long-term memory"
    - "manual skill registry"
    - "skill usage tracking"
    - "runtime capability manifest"
created: "2026-04-20"
updated: "2026-04-21"
completed: "2026-04-20"
lastEdited: "2026-04-21"
editHistory:
  - date: "2026-04-21"
    workflow: "bmad-edit-prd"
    changes: "Tightened NFR measurability for validation findings: responsiveness, compaction, output handling, credential permissions, resume/retrospective state, RPC approval payloads, portability, Bun-friendly workflows, first-run setup, and deterministic learning fixtures."
---

# Product Requirements Document - Sprite Harness

**Author:** Chinnaphat
**Date:** 2026-04-20

## Executive Summary

Sprite Harness is a TypeScript-based local AI agent runtime and terminal workbench for developer workflows. It is designed as a personal-first harness for running coding agents through CLI, TUI, and JSON-RPC interfaces while sharing one core runtime. The product supports coding, project planning, file editing, sandboxed command execution, multi-provider model access, session persistence, memory management, and skill-driven workflows.

The core problem Sprite Harness solves is that current coding agents are powerful but difficult to own, inspect, and evolve. Existing tools often lock users into a provider, hide memory behavior, couple agent logic to a specific UI, or treat skills as static extensions. Sprite Harness approaches the problem as a runtime-first system: the agent loop, tools, memory, sandbox, provider layer, sessions, and skills are core primitives, while CLI, TUI, and RPC are clients of the same agent brain.

The long-term vision is a self-evolving cognitive agent harness. Sprite Harness should not only execute tasks; it should capture experience, compact context, consolidate durable memory, detect repeated workflows, propose reusable skills, track outcomes, and refine future behavior. Its memory model should separate working memory, episodic memory, semantic memory, procedural memory, and self-model state so the agent can reason about the current task, remember past work, preserve stable facts, evolve skills, and understand its own capabilities and limits.

The MVP should be usable quickly while preserving the architecture needed for future depth. It should provide a functioning agentic loop, basic terminal interaction, JSON-RPC runtime access, sandboxed command execution, OpenAI-compatible provider support, structured session storage, context compaction, markdown-based long-term memory, manual skill registry, skill usage tracking, and a runtime-generated capability manifest.

### What Makes This Special

Sprite Harness is not a Claude Code clone, a simple CLI chatbot, or a static skill runner. Its differentiator is the combination of runtime-first architecture, layered memory, self-modeling, and skill evolution inside a local developer agent harness.

The core insight is that useful coding agents improve not only by adding more tools, but by turning experience into memory, memory into reusable procedures, and procedures into better future behavior. Memory answers what the agent knows. Skills answer how the agent acts. The self-model answers what the agent knows about itself: available tools, provider limits, context budget, sandbox mode, loaded skills, memory confidence, and operational constraints.

Sprite Harness should borrow selectively from existing systems: Hermes inspires memory, session recall, skills, and provider switching; Pi inspires modular TypeScript packages, CLI/TUI/RPC modes, minimal tools, context handling, and compaction patterns; Claude Code-like tools inspire polished terminal workflow and agentic tool orchestration. Sprite Harness should not copy implementation from unofficial or leaked repositories.

The initial product promise is: a fast local terminal agent that remembers how the user works, acts through safe tools, switches models freely, exposes one runtime through CLI/TUI/RPC, and gradually evolves reusable skills from real developer workflows.

## Project Classification

Sprite Harness is primarily a CLI tool and developer tool, but its product class is more specific: a local AI agent runtime for developer workflows. It should expose multiple interface modes over one runtime:

- CLI interactive mode for terminal conversations.
- CLI print/non-interactive mode for direct one-shot tasks.
- TUI mode for richer terminal interaction, tool visibility, status display, and session navigation.
- JSON-RPC mode for editor integrations, external processes, automation, and future SDK clients.

The product domain is AI developer tooling. The project context is greenfield. The complexity level is medium-high because the system combines agentic loop design, provider abstraction, sandboxed command execution, layered memory, context compaction, skill evolution, session persistence, and self-modeling. It is not regulated-domain software, but it has meaningful safety, reliability, architecture, and developer-experience risks.

## Success Criteria

### User Success

Sprite Harness MVP succeeds when the user can run real development tasks end-to-end through the terminal without manually performing the core loop. For a typical task, the agent must understand the request, inspect relevant files, plan the work, edit files, run sandboxed commands, execute relevant tests or checks when available, respond to failures, and produce a concise final summary.

The user should see visible learning after completed tasks. Each non-trivial completed task should produce a post-task learning review that explains what the agent attempted, what failed, what was corrected, what should be remembered, and what reusable workflow or skill signal was discovered.

The first aha moment is when the agent not only completes a coding task, but also identifies what it did poorly, updates durable memory or lesson candidates, and reuses that learning in a later similar task.

### Learning Success

Sprite Harness must demonstrate visible and reusable learning, not only post-task logging. A completed task should produce a learning review, but the system is only considered to be learning when a later task can retrieve or apply a previously saved memory, lesson, or skill candidate.

Learning success requires:

- Every non-trivial completed task produces a structured learning review unless disabled by mode.
- Learning reviews distinguish between facts, lessons, mistakes, test gaps, and skill candidates.
- Memory candidates include provenance, confidence, type, and update timestamp.
- Skill candidates require repeated workflow evidence, explicit user correction, or clear recurring task structure.
- The agent can show what memory, lesson, or skill signal influenced a later task.
- The user can reject, edit, or promote learning outputs.

### Business Success

Because Sprite Harness is personal-first, initial business success is measured by sustained personal usage rather than external adoption. Within the first month of MVP use, success means the user voluntarily uses Sprite Harness for repeated real coding or planning sessions instead of treating it as a demo.

Early target outcomes:

- Complete at least 20 real development tasks through Sprite Harness.
- Use Sprite Harness across at least 10 separate sessions.
- Resume prior work from stored session context without manually reconstructing the task.
- Identify at least 5 durable memory entries that improve later behavior.
- Identify at least 3 skill candidates from repeated workflows.

### Technical Success

The MVP is technically successful when the core runtime can execute a full agentic loop reliably across CLI, minimal TUI, and JSON-RPC entry points without duplicating agent logic.

Technical success requires:

- One shared `AgentRuntime` powers CLI, TUI, and JSON-RPC modes.
- The agent can perform plan-act-observe loops with tool calls, progress tracking, stop conditions, and max-iteration limits.
- File inspection, file editing, search, and command execution tools work on real repositories.
- Command execution always passes through `SandboxRunner`.
- Risky or destructive commands require explicit approval.
- Commands stay within the configured sandbox boundary, with timeout and environment controls.
- For coding tasks, the agent attempts a relevant test, check, build, typecheck, lint, or user-configured validation command when available.
- If no relevant validation exists, the agent states that explicitly in the final summary and learning review.
- Provider logic is isolated behind a normalized provider adapter.
- Provider adapters normalize tool calls, streaming, errors, usage, and context/model capability metadata.
- Session history is persisted locally.
- Context compaction preserves goal, decisions, progress, files touched, commands run, failures, and next steps.
- Long-term memory can store bounded user/project facts with provenance.
- A post-task learning review is generated after completed non-trivial tasks.
- Learning review output can create memory candidates and skill candidates.

### Measurable Outcomes

MVP acceptance targets:

- The agent completes a simple real coding task end-to-end without manual file editing by the user.
- The agent can run at least one relevant test/check command after making changes.
- The agent can recover from at least one failing test or command output by taking a follow-up action.
- The agent produces a structured final summary for every completed task.
- The agent produces a structured learning review for every non-trivial completed task.
- At least 80% of completed task summaries correctly list changed files and commands run.
- No command executes outside the configured sandbox path.
- No destructive command runs without explicit approval.
- A resumed session can restore the previous task goal, recent progress, and next step.
- At least one repeated workflow produces a skill candidate with a stated trigger reason.
- At least one durable project fact is saved and reused in a later session.
- At least one later task visibly reuses a memory or lesson generated from an earlier task.
- At least one learning review identifies a mistake or missed assumption that changes a later plan.
- At least one memory candidate is rejected or edited by the user, proving the review path is auditable.
- Skill candidates are not generated for every task; they require repeated workflow evidence, explicit user correction, or clear recurring task structure.
- The agent can explain which prior memory or lesson it used before taking action.

## Product Scope

### MVP - Minimum Viable Product

The MVP must prove the runtime, task execution loop, and learning reuse loop. It implements a thin but real cognitive architecture. It does not need semantic vector search, autonomous skill promotion, or deep procedural memory graphs, but it must implement the interfaces and artifacts needed for those capabilities later.

The MVP includes:

- TypeScript runtime-first architecture.
- Interactive CLI.
- Minimal TUI.
- JSON-RPC mode.
- OpenAI-compatible provider adapter.
- Tool registry.
- File read/search/edit tools.
- Sandboxed command runner.
- Configurable test/check command execution.
- Agentic plan-act-observe loop.
- Session persistence.
- Structured context compaction.
- Markdown long-term memory.
- Runtime capability manifest.
- Manual skill registry.
- Skill usage tracking.
- Post-task learning review.
- Memory and skill candidate generation.
- Compact and full post-task learning review modes.

### Growth Features (Post-MVP)

Post-MVP features include:

- Better TUI session navigation.
- Multi-provider support beyond OpenAI-compatible endpoints.
- Session search.
- Skill proposal approval flow.
- Skill versioning and refinement.
- More advanced sandbox backends.
- Context branching.
- Model-specific capability profiles.
- Automated memory consolidation jobs.
- Memory deduplication and stale-memory pruning.
- Learning review analytics across sessions.

### Vision (Future)

The long-term vision is a self-evolving cognitive agent harness that improves from usage. Future versions should support deeper episodic recall, semantic memory search, procedural memory graphs, autonomous skill refinement with review gates, richer self-modeling, multi-agent delegation, editor integrations through RPC, and eventually a practical framework for building personal coding agents.

## User Journeys

### Journey 1: Primary Developer Completes a Real Coding Task

Chinnaphat starts in a real project directory with a concrete task: fix a bug, add a small feature, or clean up a failing test. He opens Sprite Harness from the terminal and enters the task in interactive mode. The TUI shows the working directory, active model, session name, context usage, sandbox mode, loaded project context, and available tools.

The agent reads the request, builds an initial plan, and begins the plan-act-observe loop. It searches the repository, reads relevant files, identifies likely edit points, and shows tool activity in the message stream. The TUI lets Chinnaphat collapse verbose tool output, inspect changed files, interrupt the loop, or queue steering instructions while the agent is working.

When the agent needs to run a command, Sprite Harness routes execution through the sandbox. Safe commands run under configured limits. Risky commands request approval with the command, working directory, environment scope, and reason. After edits, the agent runs a relevant test, typecheck, lint, build, or configured validation command. If the check fails, the agent reads the failure, updates its plan, and loops again.

The journey reaches its value moment when the agent completes the task without manual file editing, runs a relevant validation command, recovers from at least one failure or ambiguity, and produces a final summary listing changed files, commands run, test results, remaining risks, and next steps.

Requirements revealed:

- Interactive CLI/TUI session.
- Runtime-visible plan-act-observe loop.
- Read/search/edit/file tools.
- Sandboxed command execution with approval prompts.
- Configurable validation command execution.
- Tool output display and collapse controls.
- Steering, interrupt, and queued follow-up input.
- Final task summary with files changed, commands run, validation results, and risks.

### Journey 2: The Agent Reuses Memory and Learns Across Sessions

A few days later, Chinnaphat returns to the same project and starts a new task. He expects the agent to remember durable context without manually restating everything: preferred language, project commands, framework conventions, previous decisions, recurring failure patterns, and lessons from past work.

At startup, Sprite Harness loads layered context. Working memory begins empty for the new task. Episodic memory provides relevant prior sessions. Semantic memory provides durable user and project facts. Procedural memory exposes available skills or workflow candidates. The runtime self-model identifies active tools, provider, context limits, sandbox mode, loaded skills, and memory confidence.

As the task begins, the agent states which prior memory or lesson influenced its plan. It does not dump raw history into the prompt. Instead, it retrieves compact, relevant facts with provenance. During the task, context grows. When the context approaches limits, structured compaction preserves the goal, constraints, decisions, progress, files touched, commands run, failures, and next steps while full session history remains stored for later inspection.

After completing the task, Sprite Harness generates a post-task learning review. The review identifies mistakes, missed assumptions, useful facts, test gaps, and memory candidates. Non-sensitive high-confidence memory can be auto-saved. Low-confidence or sensitive memory requires review. The next time a similar task appears, the agent can show that it reused a prior lesson.

The journey reaches its value moment when Chinnaphat sees that the agent does not merely log history; it applies a previous lesson to avoid repeating a mistake.

Requirements revealed:

- Session persistence.
- Episodic memory retrieval.
- Semantic long-term memory with provenance and confidence.
- Structured context compaction.
- Post-task learning review.
- Auto-save policy for bounded memory.
- User-visible memory reuse.
- Memory candidate review/edit/reject flow.
- Runtime capability and self-state manifest.

### Journey 3: Repeated Work Evolves into a Skill Candidate

Chinnaphat repeatedly asks Sprite Harness to perform similar workflows: review code before commit, fix TypeScript errors, update tests after a refactor, create PRD sections, or run a project-specific validation sequence. Over time, the agent detects that the same pattern is recurring.

The agent does not immediately promote every repeated action into a skill. Instead, it records skill signals from completed tasks: task type, tool sequence, successful commands, common failure points, user corrections, and final outcomes. When evidence is strong enough, Sprite Harness proposes a skill candidate with a stated trigger reason.

The TUI shows the proposed skill after a task or through a review command. The proposal includes the skill name, intended activation conditions, workflow steps, required tools, known risks, and examples from prior sessions. Chinnaphat can reject, edit, save as draft, or promote the candidate. Promoted skills become procedural memory and can be manually invoked or suggested by the agent in future sessions.

The journey reaches its value moment when Sprite Harness turns repeated behavior into a reusable workflow that saves effort on later tasks, while Chinnaphat remains in control of promotion.

Requirements revealed:

- Skill signal capture.
- Skill usage tracking.
- Skill candidate generation.
- Stated trigger reason for each candidate.
- User approval before skill promotion.
- Manual skill registry.
- Draft/active/deprecated skill lifecycle.
- Ability to show which skill influenced a task.
- Future support for skill refinement after use.

### Journey 4: External Tools Use Sprite Harness Through JSON-RPC

Chinnaphat wants Sprite Harness to be more than a standalone terminal app. He wants an editor extension, scripts, other agents, or a future UI frontend to call the same runtime without duplicating logic.

He starts Sprite Harness in JSON-RPC mode. An editor extension or automation script sends a task request with the working directory, session ID, model preference, allowed tools, and optional context. The runtime executes the same core agent loop used by the CLI/TUI. Tool events, progress updates, approval requests, final summaries, and learning review outputs stream back through RPC.

When a command requires approval, the RPC client receives a structured approval request. When the task finishes, the client receives changed files, commands run, validation results, memory candidates, skill signals, and final status. Because RPC is a first-class interface, future integrations can build on the same runtime: editor panels, local dashboards, agent-to-agent orchestration, and custom frontends.

The journey reaches its value moment when an external client can run a real task through Sprite Harness and receive the same lifecycle events as the TUI.

Requirements revealed:

- JSON-RPC server mode.
- Stable runtime event protocol.
- Task request schema.
- Session ID and working directory handling.
- Streaming tool events and progress events.
- Structured approval request/response flow.
- Final summary and learning review result schema.
- Shared `AgentRuntime` across CLI, TUI, and RPC.
- Future SDK/client compatibility.

### Journey 5: Safety Review and Error Recovery

During a task, the agent proposes a command that could modify files broadly or access sensitive environment data. Sprite Harness classifies the command as risky and pauses for approval. The approval prompt explains the command, working directory, expected effect, sandbox boundary, environment exposure, and why the agent believes it is needed.

Chinnaphat can approve, deny, edit the command, or provide an alternative. If denied, the agent must update its plan and continue safely. If a command fails, times out, or violates sandbox policy, the failure becomes part of the agent observation. The agent may recover by using a safer command, asking for clarification, or stopping with a clear explanation.

After the task, the learning review records the safety decision, whether the command was appropriate, and whether a future memory or skill rule should be created. For example, the agent may learn that this project should use a safer test command or avoid a destructive script unless explicitly requested.

The journey reaches its value moment when the agent remains useful under safety constraints instead of either blindly executing commands or giving up.

Requirements revealed:

- Command risk classification.
- Approval UI in CLI/TUI and RPC.
- Deny/edit/approve command paths.
- Sandbox boundary enforcement.
- Timeout and environment filtering.
- Safety events included in session history.
- Safety lessons included in learning review.
- Recovery behavior after command denial or failure.

### Journey Requirements Summary

The journeys reveal these core capability areas:

- One shared `AgentRuntime` used by CLI, TUI, and JSON-RPC.
- TUI that shows messages, tool calls, tool results, command approvals, file changes, validation results, context usage, memory usage, active model, session state, and learning review.
- Agentic loop with planning, tool calling, observation, validation, recovery, and final summary.
- Sandboxed command execution with risk classification, timeout, cwd boundary, environment filtering, and approval flow.
- Session persistence with resume support.
- Structured compaction for long-running sessions.
- Layered memory: working, episodic, semantic, procedural, and self-model state.
- Post-task learning review that produces memory candidates, skill signals, mistakes, test gaps, and next-time improvements.
- Auto-save memory policy with review for low-confidence or sensitive entries.
- Skill evolution pipeline with signal capture, candidate generation, user approval, registry, usage tracking, and lifecycle states.
- JSON-RPC interface for editor integration, script automation, agent-to-agent use, and future frontend clients.

## Domain-Specific Requirements

Sprite Harness operates in the AI developer tooling domain. It is not subject to regulated-industry compliance by default, but it handles sensitive local development assets: source code, shell commands, environment files, credentials, session history, memory artifacts, and agent-generated skills. Domain-specific requirements therefore focus on local safety, privacy, auditability, and trust.

### Compliance & Regulatory

No formal healthcare, fintech, government, or safety-critical compliance is required for MVP.

Sprite Harness must still treat local developer data as sensitive by default:

- The system must assume repositories may contain `.env` files, API keys, credentials, tokens, private source code, and confidential project information.
- Provider usage must be explicit in configuration. MVP may use external providers, but the active provider and model must be visible to the user.
- Local-only provider mode is not required for MVP, but the architecture must not prevent it later.
- Memory and session storage must be local by default.
- User-configurable memory exclusion rules must be supported or planned from the beginning.

### Technical Constraints

Command execution must pass through a sandbox layer:

- Commands must execute within a configured working directory boundary.
- Commands must have timeouts.
- Environment variable exposure must be controlled.
- Risky or destructive commands must require explicit approval.
- Command denials must return to the agent loop as observations so the agent can recover safely.

File editing must also have boundaries:

- Normal targeted edits may proceed through approved tools.
- Broad edits, destructive edits, or edits touching many files should require approval.
- Final summaries must list changed files.
- Learning reviews must record unsafe or denied actions when relevant.

Memory must be bounded and auditable:

- Secrets, credentials, private keys, raw sensitive logs, and large raw code chunks must not be saved by default.
- The user may configure what memory types are allowed or blocked.
- Memory candidates must include type, provenance, confidence, timestamp, and source task.
- Low-confidence or sensitive memory candidates must require review.
- Auto-save is allowed for bounded, non-sensitive, high-confidence facts.

Prompt injection from repository content must be treated as a domain risk:

- Project files must be treated as untrusted input unless explicitly configured otherwise.
- Instructions found inside source files, logs, issues, or generated artifacts must not override system/runtime policy.
- The agent must preserve higher-priority safety rules over repository-provided instructions.

### Integration Requirements

JSON-RPC mode must support scoped permissions:

- RPC clients must declare working directory, session, allowed tools, and memory access scope.
- RPC clients must receive structured approval requests for risky commands or broad file edits.
- RPC clients must receive structured task lifecycle events: plan, tool call, tool result, validation result, memory candidate, skill signal, final summary, and learning review.
- RPC must use the same `AgentRuntime` as CLI and TUI, not a separate agent implementation.

Provider integration must be normalized:

- Provider adapters must normalize tool calls, streaming, errors, usage, and model capability metadata.
- Provider mismatch must not leak into core agent loop logic.
- Active model/provider must be visible in CLI/TUI and available through RPC state.

### Risk Mitigations

Key risks and mitigations:

- **Secret leakage:** default memory exclusions, provider visibility, configurable privacy rules.
- **Unsafe command execution:** sandbox boundary, command classification, approval prompts, timeouts, environment control.
- **Unsafe file edits:** targeted edit tools, broad edit approval, changed-file summaries.
- **Prompt injection:** repo content treated as untrusted; runtime policy has priority.
- **Memory corruption or noise:** provenance, confidence, dedupe, review/edit/reject flow.
- **Skill evolution drift:** skill candidates require trigger reasons and user approval before promotion.
- **RPC abuse:** scoped permissions and structured approval flows.
- **Provider inconsistency:** normalized provider contract and model capability manifest.
- **Loss of user trust:** visible tool activity, final summaries, learning reviews, and auditable memory/skill changes.

## Innovation & Novel Patterns

### Detected Innovation Areas

Sprite Harness combines several existing agent patterns into a more ambitious product shape: a local cognitive agent harness for developer workflows. The innovation is not any single feature in isolation, but the learning pipeline that connects memory, post-task review, skill evolution, self-modeling, and runtime-first interfaces.

The innovation areas are prioritized as follows:

1. **Cognitive layered memory.** Sprite Harness separates working memory, episodic memory, semantic memory, procedural memory, and self-model state. This gives the agent a practical memory architecture that resembles how a developer expects a capable assistant to remember: current task context, past events, durable facts, reusable procedures, and knowledge of its own operating state.
2. **Post-task learning review.** After non-trivial tasks, the agent produces a structured review of what happened: what it attempted, what failed, what was corrected, what tests revealed, what assumptions were missed, what memory should be saved, and whether a skill signal appeared.
3. **Learning reuse loop.** The product is innovative only if learning affects later behavior. The MVP must demonstrate at least one case where a second task improves because the agent retrieved or applied a lesson, memory, or review output from a previous task.
4. **Self-evolving skills.** Sprite Harness treats skills as procedural memory that can emerge from repeated workflows. The agent observes repeated task patterns, successful tool sequences, user corrections, and recurring project-specific steps, then proposes skill candidates with trigger reasons. Promotion requires user approval.
5. **Runtime self-model.** The agent maintains operational knowledge about its own tools, provider, context budget, sandbox state, loaded skills, memory confidence, and limits. This is not human-like consciousness; it is practical self-awareness that helps the agent plan safely and explain its constraints.
6. **Runtime-first CLI/TUI/RPC architecture.** CLI, TUI, and JSON-RPC clients share one `AgentRuntime`. This enables terminal usage, editor integration, script automation, agent-to-agent calls, and future frontends without duplicating agent logic.

### Market Context & Competitive Landscape

Existing coding agents and terminal harnesses provide useful reference patterns, but Sprite Harness targets a different center of gravity.

Hermes Agent provides inspiration for memory, session recall, skills, provider switching, and agent growth. Pi provides inspiration for modular TypeScript packages, terminal UX, CLI/TUI/RPC-style modes, context handling, session management, and compaction. Claude Code-like tools provide inspiration for polished terminal coding workflows and tool orchestration. Sprite Harness should learn from these patterns without copying leaked or unofficial implementations.

The differentiating market position is a personal-first cognitive harness: a local developer agent runtime that makes learning visible and reusable. Most tools focus on making the agent act. Sprite Harness focuses on making the agent act, review itself, remember what mattered, and improve future behavior under user control.

### Validation Approach

The innovation should be validated through observable behavior, not claims.

The MVP must validate:

- A real coding task can be completed through the agentic loop.
- A relevant test/check can be run after changes.
- A post-task learning review is produced after a non-trivial task.
- The learning review creates at least one memory or lesson candidate.
- A later task visibly reuses a memory or lesson from an earlier task.
- A repeated workflow produces a skill candidate with a stated trigger reason.
- The user can approve, reject, or edit learning outputs.
- The agent can explain what prior memory, lesson, skill signal, or self-model state influenced its plan.

The strongest MVP demonstration is:

1. Task 1: the agent makes a mistake, fixes it, runs validation, and records a lesson.
2. Task 2: a similar task appears, and the agent changes its plan because it retrieved that lesson.
3. Later repeated workflow: the agent proposes a skill candidate instead of silently accumulating logs.

### Risk Mitigation

Innovation risks and fallbacks:

- **Layered memory becomes too complex:** MVP implements thin but real memory layers using simple local artifacts before adding semantic search or graphs.
- **Learning review becomes decorative:** success requires later reuse, not only review generation.
- **Memory becomes noisy:** memory candidates require type, provenance, confidence, timestamp, dedupe, and user-configurable exclusions.
- **Skill evolution creates low-quality skills:** MVP generates skill candidates only, with user approval required before promotion.
- **Self-model overclaims capability:** self-model must be runtime-generated from actual tools, provider metadata, sandbox state, loaded skills, and context limits.
- **Runtime-first architecture slows UI progress:** CLI/TUI/RPC can start minimal, but they must share one runtime boundary.
- **Automatic learning behaves poorly:** fallback to retrospective mode, where the agent produces structured post-task retrospectives and the user manually approves memory, lessons, and skill evolution.

## CLI and Developer Tool Specific Requirements

### Project-Type Overview

Sprite Harness is a TypeScript-based local AI agent runtime exposed through terminal-first interfaces. It is both a CLI tool and a developer tool. The CLI surface must support interactive use, scriptable one-shot execution, TUI operation, and JSON-RPC process integration. The developer-tool surface must support real repositories, file edits, sandboxed commands, tests/checks, memory, skills, and provider configuration.

The product should be distributed npm-first, with Bun-friendly development and execution where practical. The default user-facing binary should be `sprite`.

### Command Structure

MVP command modes:

- `sprite` starts the default interactive terminal experience.
- `sprite -p "<task>"` or `sprite --print "<task>"` runs a non-interactive task and prints the final result.
- `sprite rpc` starts JSON-RPC mode over stdin/stdout.
- `sprite resume` resumes or selects a previous session.
- `sprite compact` manually compacts the current or selected session.
- `sprite memory` inspects memory entries or candidates.
- `sprite skills` lists available skills and skill candidates.

Interactive slash commands should include:

- `/new` start a new session.
- `/resume` resume a prior session.
- `/model` inspect or switch provider/model.
- `/memory` inspect memory used or memory candidates.
- `/skills` list, invoke, or review skill candidates.
- `/tools` list available tools.
- `/compact` compact current context.
- `/review-learning` inspect post-task learning review.
- `/exit` exit the session.

Shell completion is not required for MVP and belongs in Growth.

### Interface Modes

Sprite Harness must expose one shared `AgentRuntime` through multiple interfaces:

- Interactive CLI/TUI for human-in-the-loop terminal work.
- Print/non-interactive CLI for direct one-shot tasks.
- JSON-RPC over stdin/stdout for editor integration, script automation, agent-to-agent use, and future frontends.

The TUI should use Ink/React terminal unless implementation discovery reveals a strong reason to change. TUI requirements:

- Show startup context: cwd, loaded context files, provider/model, sandbox mode, loaded skills, and session state.
- Show message stream with assistant responses, tool calls, tool results, warnings, errors, and learning events.
- Show editor/input area with multiline support.
- Show footer/status with cwd, session name, context usage, active model, sandbox mode, and cost/usage if available.
- Allow collapsing verbose tool output.
- Allow interrupting or steering the agent while a task is running.
- Surface approval prompts for risky commands and broad edits.
- Surface final summaries and learning reviews.

### Output Formats

Print/non-interactive mode must support:

- `text` for human-readable output.
- `json` for structured single-result output.
- `ndjson` for streaming events and automation.

JSON and NDJSON outputs should include structured events for:

- task start,
- plan update,
- tool call,
- tool result,
- approval request,
- validation result,
- memory candidate,
- skill signal,
- final summary,
- learning review,
- task error.

### Configuration Model

Sprite Harness must support both global and project configuration:

- Global config path: `~/.sprite/config.json`
- Project config path: `.sprite/config.json`

Project config overrides global config where appropriate. Config should cover:

- provider and model defaults,
- sandbox policy,
- validation/test commands,
- memory policy and exclusions,
- output format defaults,
- enabled tools,
- enabled skills,
- compaction thresholds,
- learning review mode,
- RPC permissions.

Secrets should not be stored directly in config files unless explicitly allowed. Environment variables or secret-provider integration should be preferred.

### Storage Model

Sprite Harness must support both global and project storage:

- Global storage for user preferences, cross-project memory, provider settings, and global skills.
- Project storage for project-specific memory, sessions, skill candidates, context files, and local configuration.

Suggested paths:

- `~/.sprite/memory/USER.md`
- `~/.sprite/memory/MEMORY.md`
- `~/.sprite/skills/`
- `.sprite/memory/PROJECT.md`
- `.sprite/sessions/`
- `.sprite/skills/`
- `.sprite/learning/`
- `.sprite/config.json`

The exact storage backend can evolve, but MVP must persist sessions and memory locally.

### Tool Protocol

Tools must be registered through a `ToolRegistry`. Initial tools:

- `read_file`
- `search_files`
- `list_files`
- `apply_patch`
- `run_command`
- `inspect_context`
- `write_memory_candidate`
- `record_skill_signal`

File edits should be patch-based by default for auditability. Direct writes may exist later, but MVP should prefer patches so summaries, diffs, and review flows remain clear.

### Sandbox and Approval Protocol

Command execution must route through `SandboxRunner`. Broad or risky file edits must also trigger approval. Approval requests must be available in CLI/TUI and RPC.

Approval request fields should include:

- action type,
- command or patch summary,
- working directory,
- expected effect,
- risk classification,
- environment exposure,
- files affected,
- agent rationale,
- approve/deny/edit options.

### JSON-RPC Requirements

MVP RPC transport is stdin/stdout JSON-RPC. RPC clients must be able to:

- create or resume a session,
- submit a task,
- receive streaming lifecycle events,
- respond to approval requests,
- inspect runtime state,
- request cancellation,
- retrieve final summary,
- retrieve learning review,
- access memory/skill outputs only within granted scope.

RPC requests must include or resolve:

- working directory,
- session ID,
- allowed tools,
- memory access scope,
- provider/model preference,
- output/event preferences.

### Package and Runtime Requirements

Sprite Harness should be implemented in TypeScript and distributed npm-first. Bun should be supported for development and may be supported for runtime where practical.

Package requirements:

- Expose a `sprite` binary.
- Support Node.js runtime for broad compatibility.
- Keep provider SDK usage behind adapter modules.
- Keep CLI/TUI/RPC entry points thin.
- Keep core runtime testable without terminal UI.
- Provide examples for CLI, TUI, and RPC usage.

### Documentation and Examples

MVP documentation must include:

- installation,
- authentication/provider setup,
- first task walkthrough,
- config reference,
- sandbox policy explanation,
- memory behavior explanation,
- learning review explanation,
- RPC usage example,
- skill candidate lifecycle explanation.

Examples should include:

- fixing a small coding task,
- running print mode with JSON output,
- starting JSON-RPC mode,
- reviewing a memory candidate,
- approving or rejecting a skill candidate.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Runtime-and-learning MVP

Sprite Harness MVP should prove two loops:

1. The task execution loop: user request -> plan -> tools -> validation -> final summary.
2. The learning reuse loop: completed task -> learning review -> memory/lesson candidate -> later reuse.

The MVP is not a full clone of Claude Code, Hermes, or Pi. It is a thin but real implementation of a local cognitive agent runtime. The goal is to make the core runtime usable on real repositories while preserving architecture for deeper memory, skills, and integrations later.

**Resource Requirements:** One full-stack TypeScript developer with strong CLI/runtime skills can build the MVP incrementally. Additional expertise may be helpful for terminal UI, sandbox hardening, and provider integration, but the MVP should not require a large team.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- Primary developer completes a real coding task.
- Agent reuses memory or a lesson from an earlier task.
- Repeated workflow produces a skill candidate.
- External client can submit a task through JSON-RPC.
- User can approve/deny risky commands or broad edits.

**Must-Have Capabilities:**

- TypeScript monorepo or package structure.
- Shared `AgentRuntime` used by CLI, minimal TUI, and JSON-RPC.
- npm-first package with `sprite` binary and Bun-friendly development.
- Interactive CLI/TUI entry point using Ink unless implementation discovery changes this.
- Print/non-interactive CLI mode with `text`, `json`, and `ndjson` output.
- JSON-RPC over stdin/stdout.
- OpenAI-compatible provider adapter.
- Normalized provider contract for messages, tool calls, streaming, errors, usage, and model metadata.
- Tool registry.
- Initial tools: `read_file`, `search_files`, `list_files`, `apply_patch`, `run_command`, `inspect_context`, `write_memory_candidate`, `record_skill_signal`.
- Patch-based file edits by default.
- Sandboxed command runner with cwd boundary, timeout, environment control, and approval for risky commands.
- Approval flow for broad or risky file edits.
- Agentic plan-act-observe loop with max-iteration limits, progress tracking, stop conditions, and validation attempts.
- Configurable validation/test command execution.
- Session persistence.
- Structured context compaction.
- Markdown-based long-term memory.
- Memory candidates with type, provenance, confidence, timestamp, and source task.
- Auto-save for bounded non-sensitive high-confidence memory.
- User review path for low-confidence or sensitive memory.
- Manual skill registry.
- Skill signal capture and skill candidate generation.
- User approval before skill promotion.
- Runtime capability manifest/self-model.
- Post-task learning review with compact and full modes.
- TUI visibility for messages, tool calls, command approvals, changed files, validation results, context usage, memory usage, model, session, and learning review.
- Basic documentation and examples.

### Explicit MVP Non-Goals

The MVP should not include:

- Full semantic vector memory.
- Autonomous skill promotion.
- Deep procedural memory graphs.
- Multi-agent delegation.
- Cloud execution.
- Plugin marketplace.
- Advanced session tree UI.
- Shell completion.
- Full local-only model mode.
- Multi-provider parity across every provider.
- Complex editor extension.
- Web dashboard.
- Polished full Claude Code/Pi-level TUI.

### Post-MVP Features

**Phase 2 (Post-MVP):**

- Additional providers beyond OpenAI-compatible endpoints.
- Better TUI navigation and session browsing.
- Session search.
- Skill proposal approval UI.
- Skill versioning and refinement.
- Memory deduplication and stale-memory pruning.
- Automated memory consolidation jobs.
- Context branching.
- Model-specific capability profiles.
- Stronger sandbox backend options.
- Editor integration through JSON-RPC.
- Shell completion.

**Phase 3 (Expansion):**

- Semantic memory search.
- Episodic recall across projects.
- Procedural memory graph.
- Autonomous skill refinement with review gates.
- Multi-agent delegation.
- Agent-to-agent orchestration.
- Local-only/private model mode.
- SDK for embedding Sprite Harness in other apps.
- Full frontend or dashboard.
- Shareable skill packages.
- Advanced retrospective analytics.

### Risk Mitigation Strategy

**Technical Risks:**

- The largest risk is overbuilding cognitive architecture before the task loop works. Mitigation: implement thin memory layers and simple artifacts first.
- The second risk is UI coupling. Mitigation: keep CLI, TUI, and RPC as adapters around one runtime.
- The third risk is unsafe local execution. Mitigation: make `SandboxRunner` mandatory from the first command tool.
- The fourth risk is fake learning. Mitigation: success requires later reuse, not only learning review generation.

**Market/Product Risks:**

- The main product risk is building an impressive system that is not used daily. Mitigation: MVP must complete real coding tasks and reduce repeated work for the primary user.
- The second risk is unclear differentiation. Mitigation: demonstrate learning reuse and skill candidate generation early.

**Resource Risks:**

- If time is constrained, prioritize in this order:
  1. Runtime + provider + tool loop.
  2. File/search/patch/command tools.
  3. Sandbox + approval.
  4. Session persistence + final summary.
  5. Learning review + memory candidates.
  6. Minimal TUI.
  7. JSON-RPC.
  8. Skill candidate generation.

If needed, TUI polish, multi-provider support, session browsing, and skill versioning move out of MVP.

## Functional Requirements

### Runtime and Task Execution

- FR1: Users can start Sprite Harness in an interactive terminal session from a project directory.
- FR2: Users can submit a development task to the agent and receive a planned execution flow.
- FR3: The agent can execute a plan-act-observe loop for a submitted task.
- FR4: The agent can stop a task when it reaches completion, requires user input, hits an iteration limit, or encounters an unrecoverable error.
- FR5: Users can interrupt, cancel, or steer an in-progress task.
- FR6: Users can receive a final summary for each completed task.
- FR7: Users can run one-shot non-interactive tasks from the command line.
- FR8: Users can choose structured output for non-interactive tasks.
- FR9: The system can emit a runtime event stream for task lifecycle, tool activity, approvals, validation, memory, skills, and learning events.
- FR10: The agent can assemble task context from user input, project context files, session state, memory, skills, and runtime self-model state.
- FR11: The system can load project context files such as `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` when present.

### Tools and Repository Work

- FR12: The agent can inspect files in the current project.
- FR13: The agent can search project files for relevant code or text.
- FR14: The agent can list project files and directories.
- FR15: The agent can propose patch-based file edits.
- FR16: Users can review broad or risky file changes before they are applied.
- FR17: The agent can apply approved file edits.
- FR18: The agent can track which files were read, changed, or proposed for change during a task.
- FR19: The agent can run project validation commands when available.
- FR20: The agent can respond to failed validation results by updating its plan or asking for user input.

### Sandbox, Approval, and Safety

- FR21: The agent can request command execution through a sandboxed command capability.
- FR22: Users can approve, deny, or modify risky command requests.
- FR23: Users can approve, deny, or modify broad or risky file edit requests.
- FR24: The system can classify command and file-edit requests by risk level.
- FR25: The system can record approval, denial, timeout, and sandbox violation events in the task history.
- FR26: The agent can recover from denied commands, failed commands, or sandbox violations.
- FR27: Users can configure memory exclusion and safety rules.
- FR28: The system can prevent secrets and sensitive artifacts from being saved to memory by default.
- FR29: Users can inspect an audit trail for a task, including tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status.

### Sessions, Context, and Compaction

- FR30: Users can create new sessions.
- FR31: Users can resume previous sessions.
- FR32: Users can inspect basic session state.
- FR33: The system can persist session history locally.
- FR34: The system can compact long-running context into a structured summary.
- FR35: Users can trigger manual compaction.
- FR36: The agent can preserve task goal, decisions, progress, files touched, commands run, failures, and next steps during compaction.
- FR37: The agent can use compacted context to continue a task.

### Memory, Learning, and Retrospective

- FR38: The system can maintain working memory for the current task.
- FR39: The system can store episodic memory from prior sessions.
- FR40: The system can store semantic memory for durable user and project facts.
- FR41: The system can store procedural memory through skills and skill candidates.
- FR42: The system can maintain a runtime self-model of available tools, loaded skills, provider state, sandbox state, context state, and memory state.
- FR43: The agent can generate a post-task learning review for non-trivial completed tasks.
- FR44: The learning review can identify mistakes, missed assumptions, test gaps, memory candidates, and skill signals.
- FR45: The system can auto-save bounded non-sensitive high-confidence memory candidates.
- FR46: Users can review, edit, reject, or accept memory candidates.
- FR47: The agent can show which prior memory or lesson influenced a task.
- FR48: The agent can reuse a prior memory or lesson in a later task.
- FR49: Users can trigger a retrospective review for a completed, failed, or aborted task.
- FR50: The retrospective review can produce memory candidates, skill signals, missed-assumption notes, and next-time improvement recommendations.
- FR51: The system can produce learning outputs for failed or aborted tasks when enough task context exists.

### Skills and Skill Evolution

- FR52: Users can list available skills.
- FR53: Users can manually invoke a skill.
- FR54: The system can track skill usage during tasks.
- FR55: The system can record skill signals from repeated workflows, successful tool sequences, or user corrections.
- FR56: The agent can propose a skill candidate with a stated trigger reason.
- FR57: Users can review, edit, reject, save as draft, or promote a skill candidate.
- FR58: The agent can show when a skill or skill signal influenced a task.
- FR59: The system can keep skill candidates separate from promoted skills.

### Interfaces and Integration

- FR60: Users can use a minimal TUI for interactive work.
- FR61: The TUI can display messages, tool activity, command approvals, changed files, validation results, context state, memory state, model state, session state, and learning review outputs.
- FR62: Users can use slash commands to access session, model, memory, skills, tools, compaction, and learning review actions.
- FR63: External clients can connect to Sprite Harness through JSON-RPC over stdin/stdout.
- FR64: External clients can submit tasks through JSON-RPC.
- FR65: External clients can receive task lifecycle events through JSON-RPC.
- FR66: External clients can respond to approval requests through JSON-RPC.
- FR67: External clients can retrieve final summaries and learning reviews through JSON-RPC.
- FR68: JSON-RPC clients can operate under scoped permissions for working directory, tools, session, and memory access.

### Provider, Authentication, Configuration, and Packaging

- FR69: Users can configure provider, model, and provider authentication settings.
- FR70: The system can use an OpenAI-compatible API-key provider for MVP.
- FR71: The system can expose active provider and model state to CLI, TUI, and RPC clients.
- FR72: The system can expose provider capability metadata such as tool support, streaming support, context limits, and model identity.
- FR73: Users can authenticate providers through environment variables, an auth file, or interactive login when supported by the provider.
- FR74: Users can run a login flow for providers that require OAuth or subscription-based authorization.
- FR75: Users can run a logout flow to remove stored provider credentials.
- FR76: The system can store provider credentials locally with restricted file permissions.
- FR77: The system can refresh OAuth credentials when refresh support is available.
- FR78: The system can distinguish OpenAI Platform API key authentication from OpenAI/ChatGPT subscription-style OAuth authentication.
- FR79: The system can support an OAuth authorization-code provider flow for providers that require it.
- FR80: The system can resolve provider credentials using a clear precedence order across CLI flags, auth file, environment variables, and provider configuration.
- FR81: The system can expose provider authentication state without exposing secret values.
- FR82: The system can document which provider authentication modes are intended for personal use versus production API use.
- FR83: Users can configure global settings.
- FR84: Users can configure project-specific settings.
- FR85: Project settings can override global settings where applicable.
- FR86: Users can inspect the effective configuration after global and project settings are merged.
- FR87: Users can configure validation commands for a project.
- FR88: Users can configure output format defaults.
- FR89: Users can install and run Sprite Harness through an npm-distributed package.
- FR90: Developers can use Bun-friendly development workflows for Sprite Harness.
- FR91: Users can access basic documentation and examples for installation, provider setup, first task execution, sandbox behavior, memory behavior, learning review, RPC usage, and skill candidate lifecycle.

## Non-Functional Requirements

### Performance and Responsiveness

- NFR1: Interactive CLI/TUI input events should be accepted within 100ms and rendered within 250ms at the 95th percentile while the agent loop is running under normal local conditions.
- NFR2: Tool lifecycle events should appear in the TUI or event stream within 500ms of being emitted by the runtime under normal local conditions.
- NFR3: Non-interactive `text` and `json` output modes should return only after task completion, failure, cancellation, or approval-required stop.
- NFR4: `ndjson` output mode should stream lifecycle events as they occur.
- NFR5: Context compaction must preserve task continuity by retaining at minimum the task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps; a compacted session must resume without requiring the user to restate those fields.
- NFR6: Tool outputs larger than 32 KB or 500 lines must be summarized, collapsible, or truncated in interactive displays while preserving a full local log reference when the full output is stored.

### Security and Privacy

- NFR7: Command execution must be constrained to the configured sandbox boundary by default.
- NFR8: Risky or destructive commands must not execute without explicit user or scoped RPC approval.
- NFR9: Broad or risky file edits must not apply without explicit user or scoped RPC approval.
- NFR10: Secrets, credentials, private keys, tokens, and `.env`-style values must not be saved to long-term memory by default.
- NFR11: Provider credentials must not be displayed in plaintext in CLI, TUI, logs, RPC state, summaries, or learning reviews.
- NFR12: Stored provider credentials must use restricted local file permissions when saved to disk: credential files should be readable and writable only by the current user on POSIX-like systems, containing directories should be accessible only by the current user where supported, and unsupported permission enforcement must produce a warning in setup or auth status output.
- NFR13: Repository content must be treated as untrusted input and must not override runtime/system safety policy.
- NFR14: Memory exclusion rules must be configurable by the user.
- NFR15: RPC clients must operate within declared permission scopes for working directory, tools, session, and memory access.

### Reliability and Recovery

- NFR16: The agent loop must enforce max-iteration limits and stop conditions.
- NFR17: Every command execution must have a timeout.
- NFR18: Denied commands, failed commands, sandbox violations, and validation failures must return to the agent as structured observations.
- NFR19: The system must persist the task goal, latest plan, compacted summary, recent event history, files touched, commands run, pending approvals, last error, and next step so a task can resume after process restart or interruption when the session store is readable.
- NFR20: Failed or aborted tasks must be eligible for retrospective review when the session contains at least the task goal, event history, terminal state, files touched, commands run, failure reason, and final status.
- NFR21: Provider errors must be surfaced as structured runtime errors rather than crashing the process.
- NFR22: RPC clients must receive explicit task failure, cancellation, or approval-required states.

### Observability and Auditability

- NFR23: Every task must have an inspectable audit trail containing tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status.
- NFR24: Final summaries must identify changed files, commands run, validation results, and unresolved risks when available.
- NFR25: Learning reviews must distinguish facts, lessons, mistakes, test gaps, memory candidates, and skill signals.
- NFR26: Memory entries must include provenance, confidence, type, timestamp, and source task.
- NFR27: Skill candidates must include trigger reason, supporting evidence, intended activation conditions, and current lifecycle state.
- NFR28: The agent must be able to explain which prior memory, lesson, skill signal, or self-model state influenced a task when applicable.

### Integration and API Contract

- NFR29: CLI, TUI, and JSON-RPC must use one shared runtime capability model.
- NFR30: JSON-RPC lifecycle events must use stable event names and structured payloads.
- NFR31: JSON-RPC approval requests must include request ID, request type, command or edit summary, working directory, affected files when known, risk level, reason, environment exposure summary, timeout, allowed actions, and correlation ID so external clients can present safe approve/deny/edit decisions.
- NFR32: Provider adapters must normalize tool calls, streaming, errors, usage, context limits, model identity, and capability metadata.
- NFR33: Provider authentication state must be inspectable without exposing secret values.
- NFR34: OAuth-capable provider flows must distinguish authorization-code login from API-key usage.

### Local-First Portability

- NFR35: Sprite Harness must store MVP sessions, memory, skills, learning artifacts, and config locally by default.
- NFR36: Sprite Harness must support both global and project-local configuration.
- NFR37: Project-local configuration must be portable by default: relative paths should be preferred, secrets must be excluded, machine-specific absolute paths must require explicit user configuration, and the effective configuration view must identify non-portable values.
- NFR38: The npm-distributed binary must run in a standard Node.js environment.
- NFR39: Development workflows must remain Bun-friendly by providing documented Bun commands for install, test, typecheck, and local execution unless a command is explicitly marked Node-only with a documented reason and equivalent Node.js command.

### Developer Experience

- NFR40: First-run setup must guide the user through provider configuration or explicit skip, project config detection or creation, sandbox mode visibility, and access to a first-task prompt; completion is reached when those four states are recorded or displayed.
- NFR41: Error messages should include the failed subsystem, likely cause, and next action when known.
- NFR42: Documentation must cover installation, provider auth, config, sandbox behavior, memory behavior, learning review, RPC usage, and skill lifecycle.
- NFR43: Example workflows must demonstrate real coding task execution, validation, memory reuse, and skill candidate review.

### Maintainability and Testability

- NFR44: Core runtime logic must be testable without launching the TUI.
- NFR45: Provider adapters must be testable independently from the agent loop.
- NFR46: Tool execution must be testable independently from provider calls.
- NFR47: Sandbox policy behavior must be covered by automated tests.
- NFR48: Memory filtering and secret exclusion behavior must be covered by automated tests.
- NFR49: JSON-RPC request/response/event schemas must be covered by contract tests.
- NFR50: Learning review and skill candidate generation must be covered by deterministic fixtures for at least one successful task learning review, one failed-task retrospective, and one repeated-workflow skill candidate scenario.
