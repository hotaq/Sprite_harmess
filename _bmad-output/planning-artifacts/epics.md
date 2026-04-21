---
stepsCompleted:
  - "step-01-validate-prerequisites"
  - "step-02-design-epics"
  - "step-03-create-stories"
  - "step-04-final-validation"
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/product-brief-Sprite-Harness.md"
  - "_bmad-output/planning-artifacts/reference-repo-synthesis.md"
  - "_bmad-output/planning-artifacts/prd-validation-report.md"
  - "_bmad-output/planning-artifacts/prd-validation-report-post-edit.md"
workflowType: "epics-and-stories"
status: "complete"
completedAt: "2026-04-21"
project_name: "Sprite_harmess"
user_name: "Chinnaphat"
date: "2026-04-21"
---

# Sprite_harmess - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Sprite_harmess, decomposing the requirements from the PRD, Architecture requirements, product brief, reference synthesis, and validation reports into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can start Sprite Harness in an interactive terminal session from a project directory.

FR2: Users can submit a development task to the agent and receive a planned execution flow.

FR3: The agent can execute a plan-act-observe loop for a submitted task.

FR4: The agent can stop a task when it reaches completion, requires user input, hits an iteration limit, or encounters an unrecoverable error.

FR5: Users can interrupt, cancel, or steer an in-progress task.

FR6: Users can receive a final summary for each completed task.

FR7: Users can run one-shot non-interactive tasks from the command line.

FR8: Users can choose structured output for non-interactive tasks.

FR9: The system can emit a runtime event stream for task lifecycle, tool activity, approvals, validation, memory, skills, and learning events.

FR10: The agent can assemble task context from user input, project context files, session state, memory, skills, and runtime self-model state.

FR11: The system can load project context files such as `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` when present.

FR12: The agent can inspect files in the current project.

FR13: The agent can search project files for relevant code or text.

FR14: The agent can list project files and directories.

FR15: The agent can propose patch-based file edits.

FR16: Users can review broad or risky file changes before they are applied.

FR17: The agent can apply approved file edits.

FR18: The agent can track which files were read, changed, or proposed for change during a task.

FR19: The agent can run project validation commands when available.

FR20: The agent can respond to failed validation results by updating its plan or asking for user input.

FR21: The agent can request command execution through a sandboxed command capability.

FR22: Users can approve, deny, or modify risky command requests.

FR23: Users can approve, deny, or modify broad or risky file edit requests.

FR24: The system can classify command and file-edit requests by risk level.

FR25: The system can record approval, denial, timeout, and sandbox violation events in the task history.

FR26: The agent can recover from denied commands, failed commands, or sandbox violations.

FR27: Users can configure memory exclusion and safety rules.

FR28: The system can prevent secrets and sensitive artifacts from being saved to memory by default.

FR29: Users can inspect an audit trail for a task, including tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status.

FR30: Users can create new sessions.

FR31: Users can resume previous sessions.

FR32: Users can inspect basic session state.

FR33: The system can persist session history locally.

FR34: The system can compact long-running context into a structured summary.

FR35: Users can trigger manual compaction.

FR36: The agent can preserve task goal, decisions, progress, files touched, commands run, failures, and next steps during compaction.

FR37: The agent can use compacted context to continue a task.

FR38: The system can maintain working memory for the current task.

FR39: The system can store episodic memory from prior sessions.

FR40: The system can store semantic memory for durable user and project facts.

FR41: The system can store procedural memory through skills and skill candidates.

FR42: The system can maintain a runtime self-model of available tools, loaded skills, provider state, sandbox state, context state, and memory state.

FR43: The agent can generate a post-task learning review for non-trivial completed tasks.

FR44: The learning review can identify mistakes, missed assumptions, test gaps, memory candidates, and skill signals.

FR45: The system can auto-save bounded non-sensitive high-confidence memory candidates.

FR46: Users can review, edit, reject, or accept memory candidates.

FR47: The agent can show which prior memory or lesson influenced a task.

FR48: The agent can reuse a prior memory or lesson in a later task.

FR49: Users can trigger a retrospective review for a completed, failed, or aborted task.

FR50: The retrospective review can produce memory candidates, skill signals, missed-assumption notes, and next-time improvement recommendations.

FR51: The system can produce learning outputs for failed or aborted tasks when enough task context exists.

FR52: Users can list available skills.

FR53: Users can manually invoke a skill.

FR54: The system can track skill usage during tasks.

FR55: The system can record skill signals from repeated workflows, successful tool sequences, or user corrections.

FR56: The agent can propose a skill candidate with a stated trigger reason.

FR57: Users can review, edit, reject, save as draft, or promote a skill candidate.

FR58: The agent can show when a skill or skill signal influenced a task.

FR59: The system can keep skill candidates separate from promoted skills.

FR60: Users can use a minimal TUI for interactive work.

FR61: The TUI can display messages, tool activity, command approvals, changed files, validation results, context state, memory state, model state, session state, and learning review outputs.

FR62: Users can use slash commands to access session, model, memory, skills, tools, compaction, and learning review actions.

FR63: External clients can connect to Sprite Harness through JSON-RPC over stdin/stdout.

FR64: External clients can submit tasks through JSON-RPC.

FR65: External clients can receive task lifecycle events through JSON-RPC.

FR66: External clients can respond to approval requests through JSON-RPC.

FR67: External clients can retrieve final summaries and learning reviews through JSON-RPC.

FR68: JSON-RPC clients can operate under scoped permissions for working directory, tools, session, and memory access.

FR69: Users can configure provider, model, and provider authentication settings.

FR70: The system can use an OpenAI-compatible API-key provider for MVP.

FR71: The system can expose active provider and model state to CLI, TUI, and RPC clients.

FR72: The system can expose provider capability metadata such as tool support, streaming support, context limits, and model identity.

FR73: Users can authenticate providers through environment variables, an auth file, or interactive login when supported by the provider.

FR74: Users can run a login flow for providers that require OAuth or subscription-based authorization.

FR75: Users can run a logout flow to remove stored provider credentials.

FR76: The system can store provider credentials locally with restricted file permissions.

FR77: The system can refresh OAuth credentials when refresh support is available.

FR78: The system can distinguish OpenAI Platform API key authentication from OpenAI/ChatGPT subscription-style OAuth authentication.

FR79: The system can support an OAuth authorization-code provider flow for providers that require it.

FR80: The system can resolve provider credentials using a clear precedence order across CLI flags, auth file, environment variables, and provider configuration.

FR81: The system can expose provider authentication state without exposing secret values.

FR82: The system can document which provider authentication modes are intended for personal use versus production API use.

FR83: Users can configure global settings.

FR84: Users can configure project-specific settings.

FR85: Project settings can override global settings where applicable.

FR86: Users can inspect the effective configuration after global and project settings are merged.

FR87: Users can configure validation commands for a project.

FR88: Users can configure output format defaults.

FR89: Users can install and run Sprite Harness through an npm-distributed package.

FR90: Developers can use Bun-friendly development workflows for Sprite Harness.

FR91: Users can access basic documentation and examples for installation, provider setup, first task execution, sandbox behavior, memory behavior, learning review, RPC usage, and skill candidate lifecycle.

### NonFunctional Requirements

NFR1: Interactive CLI/TUI input events should be accepted within 100ms and rendered within 250ms at the 95th percentile while the agent loop is running under normal local conditions.

NFR2: Tool lifecycle events should appear in the TUI or event stream within 500ms of being emitted by the runtime under normal local conditions.

NFR3: Non-interactive `text` and `json` output modes should return only after task completion, failure, cancellation, or approval-required stop.

NFR4: `ndjson` output mode should stream lifecycle events as they occur.

NFR5: Context compaction must preserve task continuity by retaining at minimum the task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps; a compacted session must resume without requiring the user to restate those fields.

NFR6: Tool outputs larger than 32 KB or 500 lines must be summarized, collapsible, or truncated in interactive displays while preserving a full local log reference when the full output is stored.

NFR7: Command execution must be constrained to the configured sandbox boundary by default.

NFR8: Risky or destructive commands must not execute without explicit user or scoped RPC approval.

NFR9: Broad or risky file edits must not apply without explicit user or scoped RPC approval.

NFR10: Secrets, credentials, private keys, tokens, and `.env`-style values must not be saved to long-term memory by default.

NFR11: Provider credentials must not be displayed in plaintext in CLI, TUI, logs, RPC state, summaries, or learning reviews.

NFR12: Stored provider credentials must use restricted local file permissions when saved to disk: credential files should be readable and writable only by the current user on POSIX-like systems, containing directories should be accessible only by the current user where supported, and unsupported permission enforcement must produce a warning in setup or auth status output.

NFR13: Repository content must be treated as untrusted input and must not override runtime/system safety policy.

NFR14: Memory exclusion rules must be configurable by the user.

NFR15: RPC clients must operate within declared permission scopes for working directory, tools, session, and memory access.

NFR16: The agent loop must enforce max-iteration limits and stop conditions.

NFR17: Every command execution must have a timeout.

NFR18: Denied commands, failed commands, sandbox violations, and validation failures must return to the agent as structured observations.

NFR19: The system must persist the task goal, latest plan, compacted summary, recent event history, files touched, commands run, pending approvals, last error, and next step so a task can resume after process restart or interruption when the session store is readable.

NFR20: Failed or aborted tasks must be eligible for retrospective review when the session contains at least the task goal, event history, terminal state, files touched, commands run, failure reason, and final status.

NFR21: Provider errors must be surfaced as structured runtime errors rather than crashing the process.

NFR22: RPC clients must receive explicit task failure, cancellation, or approval-required states.

NFR23: Every task must have an inspectable audit trail containing tool calls, approvals, file changes, validation attempts, memory changes, skill signals, and final status.

NFR24: Final summaries must identify changed files, commands run, validation results, and unresolved risks when available.

NFR25: Learning reviews must distinguish facts, lessons, mistakes, test gaps, memory candidates, and skill signals.

NFR26: Memory entries must include provenance, confidence, type, timestamp, and source task.

NFR27: Skill candidates must include trigger reason, supporting evidence, intended activation conditions, and current lifecycle state.

NFR28: The agent must be able to explain which prior memory, lesson, skill signal, or self-model state influenced a task when applicable.

NFR29: CLI, TUI, and JSON-RPC must use one shared runtime capability model.

NFR30: JSON-RPC lifecycle events must use stable event names and structured payloads.

NFR31: JSON-RPC approval requests must include request ID, request type, command or edit summary, working directory, affected files when known, risk level, reason, environment exposure summary, timeout, allowed actions, and correlation ID so external clients can present safe approve/deny/edit decisions.

NFR32: Provider adapters must normalize tool calls, streaming, errors, usage, context limits, model identity, and capability metadata.

NFR33: Provider authentication state must be inspectable without exposing secret values.

NFR34: OAuth-capable provider flows must distinguish authorization-code login from API-key usage.

NFR35: Sprite Harness must store MVP sessions, memory, skills, learning artifacts, and config locally by default.

NFR36: Sprite Harness must support both global and project-local configuration.

NFR37: Project-local configuration must be portable by default: relative paths should be preferred, secrets must be excluded, machine-specific absolute paths must require explicit user configuration, and the effective configuration view must identify non-portable values.

NFR38: The npm-distributed binary must run in a standard Node.js environment.

NFR39: Development workflows must remain Bun-friendly by providing documented Bun commands for install, test, typecheck, and local execution unless a command is explicitly marked Node-only with a documented reason and equivalent Node.js command.

NFR40: First-run setup must guide the user through provider configuration or explicit skip, project config detection or creation, sandbox mode visibility, and access to a first-task prompt; completion is reached when those four states are recorded or displayed.

NFR41: Error messages should include the failed subsystem, likely cause, and next action when known.

NFR42: Documentation must cover installation, provider auth, config, sandbox behavior, memory behavior, learning review, RPC usage, and skill lifecycle.

NFR43: Example workflows must demonstrate real coding task execution, validation, memory reuse, and skill candidate review.

NFR44: Core runtime logic must be testable without launching the TUI.

NFR45: Provider adapters must be testable independently from the agent loop.

NFR46: Tool execution must be testable independently from provider calls.

NFR47: Sandbox policy behavior must be covered by automated tests.

NFR48: Memory filtering and secret exclusion behavior must be covered by automated tests.

NFR49: JSON-RPC request/response/event schemas must be covered by contract tests.

NFR50: Learning review and skill candidate generation must be covered by deterministic fixtures for at least one successful task learning review, one failed-task retrospective, and one repeated-workflow skill candidate scenario.

### Additional Requirements

AR1: Implement a custom runtime-first TypeScript workspace rather than a generated CLI/TUI starter; the first implementation story must manually scaffold the workspace.

AR2: Use TypeScript ESM with npm-first package distribution, Node.js runtime compatibility, and Bun-friendly development commands.

AR3: Expose the user-facing binary as `sprite`.

AR4: Keep CLI, TUI, print mode, and JSON-RPC as thin adapters over one shared `AgentRuntime`.

AR5: Place core runtime behavior in `packages/core`; adapters must not own task lifecycle state.

AR6: Create package boundaries for `shared`, `core`, `storage`, `providers`, `tools`, `sandbox`, `memory`, `skills`, `config`, `cli`, `tui`, and `rpc`.

AR7: Define shared Zod schemas before implementing persisted artifacts, runtime events, RPC payloads, tool records, provider metadata, memory candidates, skill candidates, and learning reviews.

AR8: Treat the runtime event stream as the system spine for TUI rendering, NDJSON output, JSON-RPC streaming, session persistence, audit views, learning review, and tests.

AR9: Use append-only `events.ndjson` plus recoverable `state.json` for session persistence.

AR10: Store global data under `~/.sprite` and project data under `.sprite`.

AR11: Use markdown long-term memory artifacts for human-readable user/project memory while keeping machine-readable candidates and metadata in JSON.

AR12: Keep SQLite deferred behind future `StorageIndex` or `SessionIndex` abstractions; do not make SQLite the MVP source of truth.

AR13: Implement provider logic behind a normalized provider adapter contract; provider-specific message formats, tool calls, streaming, errors, usage, and capability metadata must not leak into the agent loop.

AR14: Implement OpenAI-compatible API-key provider first; keep OAuth authorization-code flow architecture-supported but not blocking MVP unless required by a selected provider.

AR15: Resolve provider credentials using explicit precedence: CLI/runtime override, local auth file, environment variables, then provider config.

AR16: Store provider credentials under `~/.sprite/auth/` with restricted local permissions where supported and warning behavior where unsupported.

AR17: Centralize command risk classification, broad edit classification, memory save eligibility, RPC scope checks, and approval decisions in a `PolicyEngine`.

AR18: Ensure CLI, TUI, print mode, and RPC cannot bypass sandbox, policy, or approval boundaries.

AR19: Treat repository files, logs, tool output, context files, and model responses as untrusted input that cannot override runtime/system policy.

AR20: Implement initial runtime event families for task, plan, tool, approval, validation, memory, skill, learning, completion, failure, and cancellation lifecycle events.

AR21: Implement JSON-RPC over stdin/stdout as an adapter over `AgentRuntime`, with methods including `runtime.getState`, `session.create`, `session.resume`, `task.start`, `task.cancel`, `approval.respond`, `memory.list`, and `skills.list`.

AR22: Use structured domain errors with `code`, `message`, `subsystem`, `cause`, `recoverable`, `correlationId`, and optional `nextAction`.

AR23: Enforce max agent iterations, command timeout, output summarization thresholds, context budget thresholds, provider request cancellation, and approval timeout default-deny behavior.

AR24: Use Commander or an equivalent lightweight parser only inside `packages/cli`.

AR25: Use Ink only inside `packages/tui` after runtime event contracts exist.

AR26: Keep TUI rendering state derived from runtime events; UI components must not infer runtime truth from text output or rendering order.

AR27: Use TypeScript project references across packages.

AR28: Use Vitest for TypeScript tests unless implementation discovery finds a blocker.

AR29: Provide initial scripts for `typecheck`, `test`, `build`, `lint`, `format`, `dev`, `dev:cli`, and `dev:rpc`.

AR30: Use deterministic fake providers and fake tools for core runtime tests.

AR31: Add contract tests for runtime events and JSON-RPC schemas.

AR32: Add integration/scenario tests for tool execution, sandbox policy, approval flow, resume/compaction, memory learning, skill candidate generation, and RPC agent flow.

AR33: Do not include remote telemetry in MVP; logs and audit records are local artifacts.

AR34: Define command risk matrix detail as an early implementation story or ADR.

AR35: Define provider streaming/tool-call delta normalization as an early implementation story or ADR.

AR36: Define compaction quality rubric and deterministic fixture coverage early.

AR37: Add canonical fixtures for a minimal task lifecycle, approval flow, compaction resume, memory learning, skill candidate, and RPC flow.

AR38: Preserve future support for editor integrations and frontend dashboards through the JSON-RPC boundary, but do not implement those in MVP unless explicitly pulled into a later story.

AR39: Product brief confirms the MVP should prioritize one-user fit, fast terminal use, safe command execution, automatic but bounded memory, multi-provider model abstraction, and skill-driven workflows.

AR40: Reference synthesis confirms context files should be scanned/truncated, memory should be bounded and curated, skills should use progressive disclosure, command approval should fail closed, and session/compaction should preserve enough state for recovery.

AR41: The post-edit PRD validation report confirms all 91 FRs and 50 NFRs are acceptable, with no critical gaps remaining; story creation should preserve that measurability.

AR42: The original validation report is superseded by the post-edit validation report, but its earlier NFR issues should remain visible as regression risks during story acceptance criteria design.

### UX Design Requirements

No UX design specification was found in the planning artifacts. UX-specific story inputs therefore come from the PRD and Architecture only:

UX-DR1: Minimal TUI must show startup context including cwd, loaded context files, provider/model, sandbox mode, loaded skills, and session state.

UX-DR2: Minimal TUI must show message stream with assistant responses, tool calls, tool results, warnings, errors, approvals, validation results, memory events, skill events, and learning events.

UX-DR3: Minimal TUI must provide multiline input and allow user steering, cancellation, and approval responses during an active task.

UX-DR4: Minimal TUI must summarize, collapse, or truncate tool outputs larger than 32 KB or 500 lines while preserving full local log references when stored.

UX-DR5: CLI/TUI/RPC state views must expose provider/model state, sandbox mode, session state, memory state, skill state, and effective configuration without exposing secrets.

UX-DR6: Final summaries and learning reviews must be visible to users and include changed files, commands run, validation results, unresolved risks, mistakes, memory candidates, skill signals, and relevant reuse evidence.

### FR Coverage Map

FR1: Epic 1 - Bootstrap and run interactive local agent session.

FR2: Epic 1 - Submit a development task and receive planned execution flow.

FR3: Epic 1 - Execute plan-act-observe loop for a submitted task.

FR4: Epic 1 - Stop tasks on completion, user input, iteration limit, or unrecoverable error.

FR5: Epic 1 - Interrupt, cancel, or steer in-progress tasks.

FR6: Epic 1 - Receive final summary for completed tasks.

FR7: Epic 1 - Run one-shot non-interactive tasks.

FR8: Epic 1 - Choose structured output for non-interactive tasks.

FR9: Epic 1 - Emit runtime event stream for lifecycle, tools, approvals, validation, memory, skills, and learning.

FR10: Epic 3 - Assemble task context from user input, context files, session state, memory, skills, and self-model.

FR11: Epic 3 - Load project context files when present.

FR12: Epic 2 - Inspect files in the current project.

FR13: Epic 2 - Search project files for code or text.

FR14: Epic 2 - List project files and directories.

FR15: Epic 2 - Propose patch-based file edits.

FR16: Epic 2 - Review broad or risky file changes before application.

FR17: Epic 2 - Apply approved file edits.

FR18: Epic 2 - Track files read, changed, or proposed for change.

FR19: Epic 2 - Run project validation commands when available.

FR20: Epic 2 - Respond to failed validation by updating plan or asking for input.

FR21: Epic 2 - Request command execution through sandboxed command capability.

FR22: Epic 2 - Approve, deny, or modify risky command requests.

FR23: Epic 2 - Approve, deny, or modify broad or risky file edit requests.

FR24: Epic 2 - Classify command and file-edit requests by risk level.

FR25: Epic 2 - Record approval, denial, timeout, and sandbox violation events.

FR26: Epic 2 - Recover from denied commands, failed commands, or sandbox violations.

FR27: Epic 2 - Configure memory exclusion and safety rules.

FR28: Epic 2 - Prevent secrets and sensitive artifacts from being saved to memory by default.

FR29: Epic 2 - Inspect task audit trail.

FR30: Epic 3 - Create new sessions.

FR31: Epic 3 - Resume previous sessions.

FR32: Epic 3 - Inspect basic session state.

FR33: Epic 3 - Persist session history locally.

FR34: Epic 3 - Compact long-running context into structured summary.

FR35: Epic 3 - Trigger manual compaction.

FR36: Epic 3 - Preserve task goal, decisions, progress, files, commands, failures, and next steps during compaction.

FR37: Epic 3 - Continue a task using compacted context.

FR38: Epic 4 - Maintain working memory for current task.

FR39: Epic 4 - Store episodic memory from prior sessions.

FR40: Epic 4 - Store semantic memory for durable user and project facts.

FR41: Epic 4 - Store procedural memory through skills and skill candidates.

FR42: Epic 4 - Maintain runtime self-model.

FR43: Epic 4 - Generate post-task learning review.

FR44: Epic 4 - Identify mistakes, missed assumptions, test gaps, memory candidates, and skill signals.

FR45: Epic 4 - Auto-save bounded non-sensitive high-confidence memory candidates.

FR46: Epic 4 - Review, edit, reject, or accept memory candidates.

FR47: Epic 4 - Show which prior memory or lesson influenced a task.

FR48: Epic 4 - Reuse prior memory or lesson in a later task.

FR49: Epic 4 - Trigger retrospective review for completed, failed, or aborted tasks.

FR50: Epic 4 - Produce retrospective memory candidates, skill signals, missed-assumption notes, and next-time improvements.

FR51: Epic 4 - Produce learning outputs for failed or aborted tasks when enough context exists.

FR52: Epic 5 - List available skills.

FR53: Epic 5 - Manually invoke a skill.

FR54: Epic 5 - Track skill usage during tasks.

FR55: Epic 5 - Record skill signals from repeated workflows, successful tool sequences, or user corrections.

FR56: Epic 5 - Propose skill candidate with stated trigger reason.

FR57: Epic 5 - Review, edit, reject, draft, or promote a skill candidate.

FR58: Epic 5 - Show when a skill or skill signal influenced a task.

FR59: Epic 5 - Keep skill candidates separate from promoted skills.

FR60: Epic 6 - Use a minimal TUI for interactive work.

FR61: Epic 6 - Display messages, tool activity, approvals, changed files, validation, context, memory, model, session, and learning outputs.

FR62: Epic 6 - Use slash commands for session, model, memory, skills, tools, compaction, and learning review actions.

FR63: Epic 7 - Connect external clients through JSON-RPC over stdin/stdout.

FR64: Epic 7 - Submit tasks through JSON-RPC.

FR65: Epic 7 - Receive lifecycle events through JSON-RPC.

FR66: Epic 7 - Respond to approval requests through JSON-RPC.

FR67: Epic 7 - Retrieve final summaries and learning reviews through JSON-RPC.

FR68: Epic 7 - Operate JSON-RPC clients under scoped permissions.

FR69: Epic 1 - Configure provider, model, and provider authentication settings enough for first use.

FR70: Epic 1 - Use OpenAI-compatible API-key provider for MVP.

FR71: Epic 1 - Expose active provider and model state to interfaces.

FR72: Epic 1 - Expose provider capability metadata.

FR73: Epic 1 - Authenticate providers through environment variables, auth file, or supported interactive login.

FR74: Epic 8 - Run provider login flow for OAuth or subscription-based providers.

FR75: Epic 8 - Run logout flow to remove stored provider credentials.

FR76: Epic 8 - Store provider credentials locally with restricted file permissions.

FR77: Epic 8 - Refresh OAuth credentials when supported.

FR78: Epic 8 - Distinguish OpenAI Platform API key authentication from OpenAI/ChatGPT subscription-style OAuth authentication.

FR79: Epic 8 - Support OAuth authorization-code provider flow when required.

FR80: Epic 1 - Resolve provider credentials using precedence across CLI flags, auth file, environment variables, and provider config.

FR81: Epic 8 - Expose provider authentication state without exposing secret values.

FR82: Epic 8 - Document provider authentication modes for personal versus production API use.

FR83: Epic 1 - Configure global settings.

FR84: Epic 1 - Configure project-specific settings.

FR85: Epic 1 - Override global settings with project settings where applicable.

FR86: Epic 8 - Inspect effective configuration after global and project settings are merged.

FR87: Epic 2 - Configure validation commands for a project.

FR88: Epic 1 - Configure output format defaults.

FR89: Epic 1 - Install and run Sprite Harness through npm-distributed package.

FR90: Epic 1 - Use Bun-friendly development workflows.

FR91: Epic 9 - Access documentation and examples for install, provider setup, first task, sandbox, memory, learning review, RPC, and skill lifecycle.

## Epic List

### Epic 1: Bootstrap and Run the First Local Agent Task

Users can install/run `sprite`, configure enough provider/model/config state to start, submit interactive or one-shot tasks, observe runtime lifecycle events, and receive final summaries.

**FRs covered:** FR1-FR9, FR69-FR73, FR80, FR83-FR85, FR88-FR90

**Implementation notes:** This is the first vertical slice. Story order should stay strict: workspace/package bootstrap, config/provider basics, minimal runtime task request, plan-act-observe shell, event stream, print/structured output, final summary, and npm/Bun-friendly execution. Do not let CLI or print mode own runtime state.

### Epic 2: Safe Codebase Editing and Verification

Users can let the agent inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.

**FRs covered:** FR12-FR29, FR87

**Implementation notes:** Tool execution, sandbox, approval, secret filtering, and validation recovery must be shared runtime capabilities, not TUI-only prompts. File edits are patch-based by default.

### Epic 3: Sessions and Context Continuity

Users can create/resume sessions, load project context, inspect state, persist history, compact context, and continue work without re-explaining the task.

**FRs covered:** FR10-FR11, FR30-FR37

**Implementation notes:** Session state, event logs, context assembly, project context loading, and compaction must preserve replay/resume behavior. Project files are untrusted input.

### Epic 4: Persistent Learning and Reuse of Prior Work

Users can get learning reviews, memory candidates, retrospectives, and visible later reuse of prior facts, lessons, and self-model state.

**FRs covered:** FR38-FR51

**Implementation notes:** Learning must be visible and reusable, not decorative. Memory writes require provenance, confidence, type, timestamp, source task, filtering, and review policy.

### Epic 5: Trusted Skills and Workflow Evolution

Users can list/invoke skills, see skill usage, collect workflow signals, review skill candidates, and promote/reject procedural workflows under approval.

**FRs covered:** FR52-FR59

**Implementation notes:** Skill candidates are draft artifacts, not active behavior. Promotion requires user approval and should include evidence, trigger reason, risks, and lifecycle state.

### Epic 6: Minimal TUI Workbench and Slash Commands

Users can steer the runtime through a richer terminal workbench that displays messages, tool activity, approvals, changed files, validation, memory, skills, model, session, and slash-command controls.

**FRs covered:** FR60-FR62

**Implementation notes:** TUI is an adapter over runtime events. It may derive display state but must not own task lifecycle, tool policy, session state, memory writes, or skill promotion.

### Epic 7: JSON-RPC Integration for External Agents and Tools

External clients can connect over JSON-RPC, submit tasks, receive lifecycle events, answer approvals, retrieve summaries/reviews, and operate under scoped permissions.

**FRs covered:** FR63-FR68

**Implementation notes:** JSON-RPC is an adapter over `AgentRuntime`, not a second runtime. Scope authorization and approval responses must go through shared policy/runtime APIs.

### Epic 8: Provider Authentication and Effective Configuration

Users can manage advanced provider auth, logout/refresh credentials, inspect auth state without secret leakage, distinguish auth modes, and inspect effective configuration.

**FRs covered:** FR74-FR79, FR81-FR82, FR86

**Implementation notes:** API-key auth remains the MVP path. OAuth authorization-code flow is architecture-supported and should remain behind provider auth interfaces. Auth state must be inspectable without exposing secret values.

### Epic 9: Developer Documentation, Examples, and Operational Handoff

Users can understand installation, provider setup, first task execution, sandbox behavior, memory behavior, learning review, RPC usage, and skill candidate lifecycle through docs and examples.

**FRs covered:** FR91

**Implementation notes:** Documentation should reflect the real implemented behavior and include examples for first task execution, JSON/NDJSON output, RPC mode, memory review, and skill candidate review.

## Epic 1: Bootstrap and Run the First Local Agent Task

Users can install/run `sprite`, configure enough provider/model/config state to start, submit interactive or one-shot tasks, observe runtime lifecycle events, and receive final summaries.

### Story 1.1: Initialize Runnable Sprite Workspace

As a developer,
I want to install dependencies and run the `sprite` binary locally,
So that I can start Sprite Harness from a project directory.

**Acceptance Criteria:**

**Given** a fresh checkout of the Sprite Harness repository
**When** the developer installs dependencies and runs the local `sprite` binary
**Then** the CLI starts without crashing and displays a basic help, version, or first-run entry response
**And** the package exposes a `sprite` binary through npm package metadata.

**Given** the workspace has multiple packages
**When** the developer runs typecheck, test, and build scripts
**Then** the scripts execute across the workspace in dependency order
**And** Bun-friendly commands are documented or aliased where supported.

**Covers:** FR1, FR89, FR90

### Story 1.2: Load Global and Project Configuration for First Use

As a developer,
I want Sprite Harness to load global and project configuration,
So that provider, model, sandbox, and output defaults are predictable before a task starts.

**Acceptance Criteria:**

**Given** global config exists under `~/.sprite/config.json` and project config exists under `.sprite/config.json`
**When** Sprite Harness starts in a project directory
**Then** project config overrides global config where applicable
**And** the resolved startup state includes provider, model, output format defaults, and project cwd.

**Given** no project config exists
**When** Sprite Harness starts
**Then** it uses global/default values and reports that no project config was loaded
**And** it does not require the user to create project config before the first task.

**Covers:** FR83, FR84, FR85, FR88

### Story 1.3: Configure OpenAI-Compatible Provider for MVP Task Execution

As a developer,
I want to configure an OpenAI-compatible provider and model,
So that the runtime can call a model without hard-coding provider-specific logic.

**Acceptance Criteria:**

**Given** provider credentials are available through CLI/runtime override, auth file, environment variable, or provider config
**When** Sprite Harness resolves credentials
**Then** it uses the documented precedence order
**And** it does not expose secret values in logs, state, or output.

**Given** an OpenAI-compatible provider configuration is valid
**When** the runtime initializes the provider adapter
**Then** the active provider, model, and capability metadata are available to CLI/runtime state
**And** provider-specific message, tool-call, streaming, error, usage, and capability behavior stays behind the provider adapter contract.

**Covers:** FR69, FR70, FR71, FR72, FR73, FR80

### Story 1.4: Submit an Interactive Task to the Runtime

As a developer,
I want to submit a task in an interactive terminal session,
So that Sprite Harness can produce an initial plan and begin working through the runtime.

**Acceptance Criteria:**

**Given** Sprite Harness starts from a project directory with provider configuration available
**When** the user submits a development task interactively
**Then** the runtime creates a task request with cwd, provider/model state, allowed defaults, and stop conditions
**And** the user receives a planned execution flow before tool work begins.

**Given** the runtime starts a task
**When** the task enters the agent loop
**Then** the loop follows plan-act-observe structure
**And** the CLI remains an adapter over `AgentRuntime`, not the owner of task lifecycle state.

**Covers:** FR1, FR2, FR3

### Story 1.5: Stop, Cancel, and Steer a Running Task

As a developer,
I want to stop, cancel, or steer an in-progress task,
So that I remain in control when the agent needs correction or reaches a limit.

**Acceptance Criteria:**

**Given** a task is running
**When** the runtime reaches completion, requires user input, hits max iterations, or encounters an unrecoverable error
**Then** it transitions to an explicit terminal or waiting state
**And** the state is emitted as a runtime event.

**Given** a task is running
**When** the user cancels or provides steering input
**Then** the runtime records the user action and updates or stops the task through `AgentRuntime`
**And** the adapter does not mutate task state directly.

**Covers:** FR4, FR5

### Story 1.6: Emit Runtime Lifecycle Events for First Task Execution

As a developer,
I want the runtime to emit structured lifecycle events,
So that CLI, print mode, TUI, RPC, audit, and tests can observe the same task truth.

**Acceptance Criteria:**

**Given** a task starts and progresses
**When** the runtime changes task state, plan state, provider state, or terminal state
**Then** it emits schema-validated runtime events with stable IDs, type, timestamps, session/task/correlation IDs, and payloads
**And** event names follow the architecture event naming pattern.

**Given** lifecycle events are emitted
**When** an adapter subscribes to events
**Then** it can render or serialize the events without owning runtime state
**And** event contract tests verify the minimal first-task event sequence.

**Covers:** FR9

### Story 1.7: Run One-Shot Print Tasks with Text, JSON, and NDJSON Output

As a developer,
I want to run one-shot tasks from the command line with structured output options,
So that Sprite Harness can be used in scripts and automation.

**Acceptance Criteria:**

**Given** the user runs `sprite --print "<task>"` or equivalent
**When** the task completes, fails, is cancelled, or stops for approval-required input
**Then** `text` and `json` modes return only after the terminal state
**And** `json` output includes structured final status, summary, provider/model state, and correlation IDs.

**Given** the user selects `ndjson` output
**When** the runtime emits lifecycle events
**Then** events stream as newline-delimited JSON as they occur
**And** the output remains schema-compatible with runtime event contracts.

**Covers:** FR7, FR8, FR88

### Story 1.8: Produce Final Summary for First Runnable Task

As a developer,
I want every completed task to produce a concise final summary,
So that I can understand what the agent did and what remains uncertain.

**Acceptance Criteria:**

**Given** a task reaches a completed, failed, cancelled, or approval-required terminal state
**When** the runtime finalizes the task
**Then** the user receives a final summary with final status, task result, provider/model used, important events, and unresolved risks when available
**And** the final summary is derived from runtime state/events rather than adapter-local text parsing.

**Given** the task did not run tools or validation yet
**When** the final summary is generated
**Then** it explicitly states what was not attempted
**And** it remains valid for the first minimal runtime task.

**Covers:** FR6

## Epic 2: Safe Codebase Editing and Verification

Users can let the agent inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.

### Story 2.1: Inspect and Search Project Files Safely

As a developer,
I want the agent to inspect, list, and search project files,
So that it can understand a codebase before proposing changes.

**Acceptance Criteria:**

**Given** the runtime is operating inside a project directory
**When** the agent requests file inspection, file listing, or text search
**Then** the tool registry executes the request within the project boundary
**And** emits tool lifecycle events for requested, started, completed, or failed states.

**Given** a file or search result is too large
**When** the tool returns output above the configured threshold
**Then** the runtime summarizes or truncates interactive output
**And** preserves a local log reference when full output is stored.

**Covers:** FR12, FR13, FR14

### Story 2.2: Track Files Read, Changed, and Proposed for Change

As a developer,
I want Sprite Harness to track file activity during a task,
So that I can audit what the agent inspected or modified.

**Acceptance Criteria:**

**Given** the agent reads, searches, proposes edits, or applies edits
**When** those tool calls complete
**Then** the task history records files read, files changed, and files proposed for change
**And** those records are available for final summary and audit trail.

**Given** a task ends
**When** the audit view or task state is inspected
**Then** file activity is grouped by task and correlated with tool events
**And** secret values are not included in audit output.

**Covers:** FR18, FR29

### Story 2.3: Propose and Apply Patch-Based File Edits

As a developer,
I want the agent to propose patch-based edits,
So that code changes are reviewable and auditable before they affect files.

**Acceptance Criteria:**

**Given** the agent identifies a targeted file change
**When** it creates an edit request
**Then** the request is represented as a patch with affected files and summary
**And** direct broad file writes are not used for MVP default editing.

**Given** a targeted patch is approved or allowed by policy
**When** the edit is applied
**Then** the file is updated through the patch tool
**And** the runtime emits file-edit lifecycle and audit events.

**Covers:** FR15, FR17

### Story 2.4: Classify Risk for Commands and Broad File Edits

As a developer,
I want risky commands and broad edits to be classified before execution,
So that unsafe actions require explicit review.

**Acceptance Criteria:**

**Given** the agent requests command execution or a broad file edit
**When** the policy engine evaluates the request
**Then** it classifies the action by risk level
**And** returns allow, deny, require approval, or modify decision.

**Given** repository content or tool output suggests bypassing safety rules
**When** policy evaluates the request
**Then** runtime/system policy wins over repository-provided instructions
**And** the decision is recorded with reason and correlation ID.

**Covers:** FR16, FR23, FR24

### Story 2.5: Execute Commands Through the Sandbox Runner

As a developer,
I want command execution to go through a sandbox boundary,
So that local project work can run without uncontrolled shell access.

**Acceptance Criteria:**

**Given** the agent requests a command
**When** the request is allowed by policy
**Then** `SandboxRunner` executes it within the configured working directory boundary
**And** applies timeout and environment exposure controls.

**Given** a command fails, times out, or violates sandbox policy
**When** the sandbox returns the result
**Then** the runtime records a structured observation instead of crashing
**And** emits command/tool failure events.

**Covers:** FR21, FR25

### Story 2.6: Approve, Deny, or Modify Risky Actions

As a developer,
I want to approve, deny, or modify risky command and edit requests,
So that I remain in control of destructive or broad actions.

**Acceptance Criteria:**

**Given** policy requires approval for a command or file edit
**When** the approval request is created
**Then** it includes action type, command or patch summary, cwd, affected files when known, risk level, reason, environment exposure, timeout, allowed actions, and correlation ID.

**Given** the user approves, denies, modifies, or times out an approval
**When** the runtime receives the decision
**Then** it records the decision in task history
**And** denial or timeout returns to the agent loop as a structured observation.

**Covers:** FR22, FR23, FR25

### Story 2.7: Configure and Run Project Validation Commands

As a developer,
I want Sprite Harness to run configured validation commands,
So that edits can be checked by tests, typecheck, lint, or build steps.

**Acceptance Criteria:**

**Given** project configuration defines validation commands
**When** the agent reaches a validation step
**Then** the runtime requests the configured command through policy and sandbox
**And** records validation started/completed events.

**Given** no validation command is configured
**When** the task reaches finalization
**Then** the final summary states that no relevant validation was available
**And** the learning/audit record preserves that validation was skipped for a known reason.

**Covers:** FR19, FR87

### Story 2.8: Recover from Failed Validation or Denied Actions

As a developer,
I want the agent to recover from failed validation, denied commands, and sandbox violations,
So that it remains useful under safety constraints.

**Acceptance Criteria:**

**Given** validation fails
**When** the runtime returns failure output to the agent loop
**Then** the agent updates its plan, proposes a follow-up action, or asks for user input
**And** the failed validation output is summarized when large.

**Given** a command is denied or violates sandbox policy
**When** the agent observes the denial or violation
**Then** it either chooses a safer alternative, asks for clarification, or stops with a clear explanation
**And** the recovery path is recorded in task history.

**Covers:** FR20, FR26

### Story 2.9: Configure Safety Rules and Prevent Secret Memory Writes

As a developer,
I want configurable safety and memory exclusion rules,
So that secrets and sensitive artifacts do not become durable memory or unsafe output.

**Acceptance Criteria:**

**Given** safety or memory exclusion rules are configured
**When** tool output, file content, command output, or learning material is evaluated
**Then** matching secrets and sensitive artifacts are blocked or redacted before memory persistence
**And** the decision is auditable without exposing the secret value.

**Given** no custom exclusion rules exist
**When** the runtime evaluates memory or safety-sensitive content
**Then** default exclusions prevent credentials, private keys, tokens, and `.env`-style values from being saved to memory
**And** the user can inspect or update the effective safety rules.

**Covers:** FR27, FR28

## Epic 3: Sessions and Context Continuity

Users can create/resume sessions, load project context, inspect state, persist history, compact context, and continue work without re-explaining the task.

### Story 3.1: Create and Persist Local Sessions

As a developer,
I want Sprite Harness to create and persist local sessions,
So that task history survives beyond a single process run.

**Acceptance Criteria:**

**Given** the user starts a new task or session
**When** the runtime creates a session
**Then** it assigns a stable session ID and creates project-local session artifacts under `.sprite/sessions/<session-id>/`
**And** session storage includes append-only `events.ndjson` and recoverable `state.json`.

**Given** runtime events occur during a session
**When** events are emitted
**Then** they are appended to the session event log in order
**And** the session state snapshot can be updated without becoming the only source of truth.

**Covers:** FR30, FR33

### Story 3.2: Inspect Basic Session State

As a developer,
I want to inspect basic session state,
So that I know what task is active, what happened, and what can be resumed.

**Acceptance Criteria:**

**Given** a session exists
**When** the user requests session state
**Then** Sprite Harness shows session ID, cwd, task goal, latest plan, terminal/waiting state, recent events, files touched, commands run, pending approvals, last error, and next step when available.

**Given** session state includes sensitive or secret-like content
**When** the state is displayed through CLI or future adapters
**Then** secrets are redacted
**And** project-local portability warnings are preserved where relevant.

**Covers:** FR32

### Story 3.3: Resume Previous Sessions

As a developer,
I want to resume a previous session,
So that I can continue work without manually reconstructing the task.

**Acceptance Criteria:**

**Given** a readable session store exists
**When** the user resumes a session
**Then** the runtime restores task goal, latest plan, compacted summary if present, recent event history, files touched, commands run, pending approvals, last error, and next step
**And** it emits a session resume event.

**Given** the requested session is missing or unreadable
**When** the user attempts to resume
**Then** Sprite Harness returns a structured recoverable error with subsystem, cause, and next action
**And** it does not crash the process.

**Covers:** FR31

### Story 3.4: Load Project Context Files as Untrusted Context

As a developer,
I want Sprite Harness to load project context files when present,
So that the agent can follow project-specific guidance without unsafe instruction override.

**Acceptance Criteria:**

**Given** `SPRITE.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` exists in the project
**When** the runtime assembles context
**Then** it loads supported context files according to the configured priority/order
**And** records which files were loaded, skipped, truncated, or blocked.

**Given** a project context file contains instructions that conflict with runtime/system policy
**When** context is assembled
**Then** runtime/system policy remains higher priority
**And** repository-provided instructions are treated as untrusted input.

**Covers:** FR11

### Story 3.5: Assemble Task Context from Runtime Sources

As a developer,
I want the agent to assemble task context from the right runtime sources,
So that it can act with relevant project/session/memory/skill/self-model information.

**Acceptance Criteria:**

**Given** a task starts or resumes
**When** the runtime builds a context packet
**Then** it includes user input, project context, session state, memory, skills, provider limits, and runtime self-model according to the documented ordering
**And** the context packet excludes secrets and unsafe memory by policy.

**Given** context inputs exceed budget or policy limits
**When** context is assembled
**Then** the runtime summarizes, truncates, or omits lower-priority content according to deterministic rules
**And** records the decision in task/session state.

**Covers:** FR10

### Story 3.6: Compact Long-Running Context into Structured Summary

As a developer,
I want long-running context to compact into a structured summary,
So that the agent can continue when the context grows too large.

**Acceptance Criteria:**

**Given** context approaches a configured threshold or the user requests compaction
**When** compaction runs
**Then** it produces a structured summary preserving task goal, active constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, and next steps
**And** the summary is saved under the session's compaction artifacts.

**Given** large tool outputs or logs exist in the session
**When** compaction summarizes the session
**Then** it summarizes relevant information and preserves local log references instead of embedding large raw output.

**Covers:** FR34, FR36

### Story 3.7: Trigger Manual Compaction

As a developer,
I want to trigger manual compaction,
So that I can control context cleanup during long work.

**Acceptance Criteria:**

**Given** an active or resumable session exists
**When** the user invokes manual compaction
**Then** Sprite Harness compacts the current session context and records a compaction event
**And** the user can inspect the resulting summary.

**Given** compaction cannot run because required session fields are missing
**When** the user requests compaction
**Then** Sprite Harness returns a structured recoverable error
**And** explains which minimum fields are unavailable.

**Covers:** FR35

### Story 3.8: Continue Work from Compacted Context

As a developer,
I want the agent to continue from compacted context,
So that I do not need to restate prior work after compaction or restart.

**Acceptance Criteria:**

**Given** a session has a compacted summary
**When** the user resumes or continues the task
**Then** the runtime uses the compacted summary with recent events to reconstruct the working context
**And** the agent can continue without requiring the user to restate goal, constraints, decisions, current plan, progress, files touched, commands run, failures, pending approvals, or next steps.

**Given** compacted context conflicts with newer events
**When** the runtime reconstructs context
**Then** newer event history takes precedence
**And** the conflict is recorded as a recoverable context assembly note.

**Covers:** FR37

## Epic 4: Persistent Learning and Reuse of Prior Work

Users can get learning reviews, memory candidates, retrospectives, and visible later reuse of prior facts, lessons, and self-model state.

### Story 4.1: Maintain Working Memory and Runtime Self-Model During a Task

As a developer,
I want Sprite Harness to track current task memory and runtime self-state,
So that the agent can reason about what it is doing and what it is capable of.

**Acceptance Criteria:**

**Given** a task is active
**When** the runtime updates task-local context
**Then** working memory records the current goal, plan, recent observations, files touched, commands run, and pending constraints
**And** working memory is scoped to the current task/session.

**Given** runtime capabilities are available
**When** the self-model is requested or injected into context
**Then** it identifies available tools, loaded skills, provider state, sandbox state, context state, and memory state
**And** it does not overclaim unavailable tools or permissions.

**Covers:** FR38, FR42

### Story 4.2: Store Episodic and Semantic Memory Candidates

As a developer,
I want Sprite Harness to capture useful session outcomes and durable project/user facts,
So that the agent can remember what matters across sessions.

**Acceptance Criteria:**

**Given** a task produces notable decisions, outcomes, project facts, or user preferences
**When** the learning process evaluates them
**Then** it can create episodic or semantic memory candidates with type, provenance, confidence, timestamp, source task, and sensitivity status
**And** raw logs, secrets, credentials, private keys, tokens, and large code chunks are excluded by default.

**Given** a memory candidate is high-confidence, bounded, and non-sensitive
**When** auto-save policy allows it
**Then** the runtime can save it to durable memory
**And** emits `memory.candidate.created` and `memory.entry.saved` events as appropriate.

**Covers:** FR39, FR40, FR45

### Story 4.3: Review, Edit, Reject, or Accept Memory Candidates

As a developer,
I want to review memory candidates before they become durable knowledge,
So that memory remains accurate, safe, and under my control.

**Acceptance Criteria:**

**Given** memory candidates exist
**When** the user lists or opens candidates
**Then** each candidate shows type, content summary, provenance, confidence, timestamp, source task, sensitivity status, and recommended action
**And** secret-like content is redacted.

**Given** the user edits, rejects, or accepts a memory candidate
**When** the action is confirmed
**Then** the candidate lifecycle state is updated
**And** the action is recorded in task/session audit history.

**Covers:** FR46

### Story 4.4: Generate Post-Task Learning Review

As a developer,
I want every non-trivial completed task to produce a learning review,
So that mistakes, lessons, test gaps, memory candidates, and skill signals are visible.

**Acceptance Criteria:**

**Given** a non-trivial task reaches completion
**When** the runtime generates a learning review
**Then** the review distinguishes facts, lessons, mistakes, missed assumptions, test gaps, memory candidates, and skill signals
**And** it references evidence such as task ID, event IDs, files touched, commands run, validation results, or user corrections.

**Given** compact and full learning review modes are configured
**When** the review is produced
**Then** the selected mode controls verbosity without removing required structured fields
**And** the review is saved as a local artifact.

**Covers:** FR43, FR44

### Story 4.5: Show Prior Memory or Lesson Influence During a Later Task

As a developer,
I want the agent to show when prior memory or lessons influenced a task,
So that learning reuse is visible instead of hidden.

**Acceptance Criteria:**

**Given** a later task retrieves relevant memory or lesson candidates
**When** the agent uses one to shape its plan or action
**Then** the task history records the memory/lesson as `used` with source reference and influence summary
**And** the user can see which prior memory or lesson influenced the task.

**Given** retrieved memory is not used or contradicts current evidence
**When** the task proceeds
**Then** the task history can mark it as `ignored` or `contradicted` with reason
**And** this state is available for retrospective analysis.

**Covers:** FR47, FR48

### Story 4.6: Trigger Retrospective Review for Completed, Failed, or Aborted Tasks

As a developer,
I want to run retrospectives on completed, failed, or aborted tasks,
So that failed work still produces useful learning when enough context exists.

**Acceptance Criteria:**

**Given** a completed, failed, or aborted task has sufficient retained context
**When** the user triggers a retrospective
**Then** Sprite Harness produces a retrospective with failure reason or outcome, missed assumptions, memory candidates, skill signals, and next-time improvement recommendations
**And** the retrospective records source task, event history reference, terminal state, files touched, commands run, and final status.

**Given** a task lacks the minimum retrospective context
**When** the user requests a retrospective
**Then** Sprite Harness returns a structured explanation of missing fields
**And** does not fabricate learning outputs.

**Covers:** FR49, FR50, FR51

### Story 4.7: Store Procedural Memory Through Skill-Linked Learning Outputs

As a developer,
I want learning reviews to identify reusable workflow patterns,
So that repeated procedures can become skill candidates later.

**Acceptance Criteria:**

**Given** a learning review identifies a repeated workflow or reusable procedure
**When** procedural memory output is created
**Then** it records the procedure as a skill signal or skill-linked memory candidate without promoting it to an active skill
**And** it includes evidence, trigger reason, known risks, and source task references.

**Given** procedural memory influences a later task
**When** the task history is inspected
**Then** the influence is visible separately from semantic or episodic memory
**And** it remains candidate-first until skill promotion is explicitly approved in the skill lifecycle.

**Covers:** FR41, FR44

## Epic 5: Trusted Skills and Workflow Evolution

Users can list/invoke skills, see skill usage, collect workflow signals, review skill candidates, and promote/reject procedural workflows under approval.

### Story 5.1: List Available Skills from Manual Skill Registry

As a developer,
I want to list available skills,
So that I know what reusable workflows the agent can use.

**Acceptance Criteria:**

**Given** global or project skill directories exist
**When** the user lists skills
**Then** Sprite Harness shows available skills with name, description, source, lifecycle state, and activation/manual invocation hint
**And** local project skills and global skills are distinguishable.

**Given** a skill is malformed or unreadable
**When** skills are listed
**Then** Sprite Harness reports the skill as unavailable with a structured warning
**And** does not crash the runtime.

**Covers:** FR52

### Story 5.2: Manually Invoke a Skill During a Task

As a developer,
I want to manually invoke a skill,
So that I can reuse a known workflow when I decide it is relevant.

**Acceptance Criteria:**

**Given** a valid skill is available
**When** the user manually invokes it during a task
**Then** the runtime loads the skill content into the task context according to the skill loading rules
**And** records that the skill was invoked by the user.

**Given** the requested skill is unavailable, invalid, or blocked by policy
**When** the user invokes it
**Then** Sprite Harness returns a structured recoverable error
**And** the task can continue without that skill.

**Covers:** FR53

### Story 5.3: Track Skill Usage and Influence During Tasks

As a developer,
I want Sprite Harness to track when skills influence tasks,
So that I can audit whether a workflow helped or hurt.

**Acceptance Criteria:**

**Given** a skill is loaded, invoked, suggested, or materially affects a task plan/action
**When** the task history is inspected
**Then** the skill usage record shows skill ID/name, source, invocation mode, task ID, event references, and influence summary
**And** the final summary or audit trail can show skill influence when applicable.

**Given** a skill was loaded but not used
**When** the task completes
**Then** the usage record can distinguish loaded, used, ignored, or contradicted states
**And** this state can feed later skill refinement.

**Covers:** FR54, FR58

### Story 5.4: Record Skill Signals from Repeated Workflows

As a developer,
I want the agent to record skill signals from repeated workflows and corrections,
So that reusable procedures can be discovered without immediate promotion.

**Acceptance Criteria:**

**Given** a task includes repeated workflow steps, successful tool sequences, or explicit user corrections
**When** the learning review evaluates the task
**Then** it can record skill signals with task evidence, workflow summary, trigger reason, tool sequence, outcome, and known risks
**And** emits `skill.signal.recorded`.

**Given** a skill signal is low-confidence or based on one weak example
**When** it is recorded
**Then** it remains a signal only
**And** it does not become an active skill or candidate without additional evidence or user action.

**Covers:** FR55

### Story 5.5: Propose Skill Candidates with Evidence and Trigger Reason

As a developer,
I want Sprite Harness to propose skill candidates from strong workflow evidence,
So that repeated procedures can become reusable drafts.

**Acceptance Criteria:**

**Given** enough skill signals or explicit user correction evidence exists
**When** the skill candidate generator runs
**Then** it creates a candidate with name, intended activation conditions, trigger reason, workflow steps, required tools, supporting evidence, examples, counterexamples, known risks, and lifecycle state
**And** emits `skill.candidate.created`.

**Given** insufficient evidence exists
**When** candidate generation runs
**Then** no candidate is created
**And** the system records why the signal was not promoted to candidate.

**Covers:** FR56

### Story 5.6: Review, Edit, Reject, Draft, or Promote Skill Candidates

As a developer,
I want to control the skill candidate lifecycle,
So that new procedural behavior is trusted before it becomes active.

**Acceptance Criteria:**

**Given** skill candidates exist
**When** the user reviews them
**Then** each candidate shows trigger reason, evidence, intended activation, workflow steps, required tools, risks, examples, and lifecycle state
**And** the user can edit, reject, save as draft, or promote it.

**Given** the user promotes a skill candidate
**When** promotion is confirmed
**Then** the promoted skill is stored in the appropriate skill registry
**And** the candidate remains auditable with promotion timestamp and source evidence.

**Covers:** FR57, FR59

### Story 5.7: Keep Skill Candidates Separate from Promoted Skills

As a developer,
I want skill candidates to stay separate from active skills,
So that proposed behavior cannot silently change future tasks.

**Acceptance Criteria:**

**Given** a skill candidate exists
**When** the runtime loads available skills
**Then** candidates are not treated as active skills
**And** they cannot influence task behavior unless explicitly loaded for review or promoted.

**Given** a candidate is rejected or left as draft
**When** future tasks run
**Then** the runtime does not activate that candidate
**And** the rejection or draft reason remains available for future learning analysis.

**Covers:** FR59

## Epic 6: Minimal TUI Workbench and Slash Commands

Users can steer the runtime through a richer terminal workbench that displays messages, tool activity, approvals, changed files, validation, memory, skills, model, session, and slash-command controls.

### Story 6.1: Render Minimal TUI Startup and Runtime State

As a developer,
I want the TUI to show startup and runtime state,
So that I can understand what environment the agent is operating in.

**Acceptance Criteria:**

**Given** the TUI starts in a project directory
**When** the runtime initializes
**Then** the TUI shows cwd, session state, active provider/model, sandbox mode, loaded context files, loaded skills, and memory state
**And** provider credentials or secret values are never displayed.

**Given** runtime state changes
**When** events are emitted
**Then** the TUI updates visible state from runtime events or runtime state APIs
**And** does not own or mutate task lifecycle state directly.

**Covers:** FR60, FR61, UX-DR1, UX-DR5

### Story 6.2: Display Message Stream, Tool Activity, and Validation Results

As a developer,
I want the TUI to display the agent's work as it happens,
So that I can inspect messages, tool calls, validation, and outcomes.

**Acceptance Criteria:**

**Given** the runtime emits assistant messages, tool events, validation events, warnings, errors, memory events, skill events, or learning events
**When** the TUI receives those events
**Then** it renders them in a message stream with clear event type and status
**And** event rendering does not depend on parsing final summary text.

**Given** tool output exceeds 32 KB or 500 lines
**When** the TUI renders the result
**Then** it shows summarized, collapsible, or truncated output
**And** displays a local log reference when full output is stored.

**Covers:** FR61, UX-DR2, UX-DR4

### Story 6.3: Support Multiline Input, Steering, Cancellation, and Approval Responses

As a developer,
I want to interact with the running agent from the TUI,
So that I can steer, cancel, or approve work without leaving the terminal workbench.

**Acceptance Criteria:**

**Given** the user enters multiline input
**When** the input is submitted
**Then** the TUI sends a typed user intent to `AgentRuntime`
**And** the runtime records the input as task input or steering input.

**Given** the runtime emits an approval request
**When** the user approves, denies, edits, or times out from the TUI
**Then** the TUI sends the response through runtime approval APIs
**And** does not execute commands or apply edits directly.

**Given** a task is running
**When** the user cancels or interrupts from the TUI
**Then** the TUI sends a cancellation intent to the runtime
**And** the runtime emits the resulting task state.

**Covers:** FR60, FR61, UX-DR3

### Story 6.4: Implement Slash Commands as Runtime Intents

As a developer,
I want slash commands for common runtime actions,
So that I can inspect and control sessions, model, memory, skills, tools, compaction, and learning review quickly.

**Acceptance Criteria:**

**Given** the user enters `/new`, `/resume`, `/model`, `/memory`, `/skills`, `/tools`, `/compact`, `/review-learning`, or `/exit`
**When** the TUI parses the slash command
**Then** it maps the command to a typed runtime intent or local exit action
**And** it does not bypass runtime policy, session, memory, or skill services.

**Given** a slash command fails or is unavailable
**When** the runtime returns an error
**Then** the TUI displays subsystem, likely cause, and next action when known
**And** does not crash the session.

**Covers:** FR62

### Story 6.5: Show Final Summary and Learning Review Outputs in TUI

As a developer,
I want final summaries and learning reviews surfaced in the TUI,
So that I can understand task outcomes and learning without opening raw artifacts.

**Acceptance Criteria:**

**Given** a task completes, fails, cancels, or stops for approval-required input
**When** the runtime emits terminal task and summary events
**Then** the TUI displays final status, changed files, commands run, validation results, unresolved risks, and next steps when available.

**Given** the runtime creates a learning review
**When** the TUI receives the learning event
**Then** it displays facts, lessons, mistakes, test gaps, memory candidates, skill signals, and relevant reuse evidence
**And** secret or credential values remain redacted.

**Covers:** FR61, UX-DR6

## Epic 7: JSON-RPC Integration for External Agents and Tools

External clients can connect over JSON-RPC, submit tasks, receive lifecycle events, answer approvals, retrieve summaries/reviews, and operate under scoped permissions.

### Story 7.1: Start JSON-RPC Mode over Stdin/Stdout

As an external tool developer,
I want to start Sprite Harness in JSON-RPC mode,
So that another process can call the same runtime without using the TUI.

**Acceptance Criteria:**

**Given** the user runs `sprite rpc`
**When** JSON-RPC mode starts
**Then** Sprite Harness accepts JSON-RPC requests over stdin and writes responses/notifications over stdout
**And** stderr is reserved for process diagnostics that do not corrupt the JSON-RPC stream.

**Given** JSON-RPC mode starts
**When** runtime state initializes
**Then** the RPC adapter connects to the shared `AgentRuntime`
**And** does not create a separate task loop.

**Covers:** FR63

### Story 7.2: Create or Resume Sessions Through JSON-RPC

As an external client,
I want to create or resume sessions through JSON-RPC,
So that automation can manage task continuity.

**Acceptance Criteria:**

**Given** an RPC client calls `session.create` with cwd and optional config/context parameters
**When** the request is authorized
**Then** the runtime creates a session and returns session ID, cwd, provider/model state, and initial runtime state.

**Given** an RPC client calls `session.resume` with an existing session ID
**When** the session is readable and in scope
**Then** the runtime restores the session state
**And** returns resumable task/session metadata without exposing secrets.

**Covers:** FR63, FR68

### Story 7.3: Submit Tasks Through JSON-RPC

As an external client,
I want to submit tasks through JSON-RPC,
So that scripts, editors, or other agents can use Sprite Harness for developer workflows.

**Acceptance Criteria:**

**Given** an RPC client calls `task.start` with task text, cwd/session, provider/model preference, allowed tools, memory scope, and output preferences
**When** the request is valid and authorized
**Then** the shared runtime starts the task
**And** returns task ID, session ID, accepted scopes, and initial lifecycle state.

**Given** a task request is invalid or out of scope
**When** `task.start` is handled
**Then** the RPC response includes a structured error with code, subsystem, recoverable flag, correlation ID, and next action when known.

**Covers:** FR64, FR68

### Story 7.4: Stream Runtime Lifecycle Events to RPC Clients

As an external client,
I want to receive runtime lifecycle events,
So that I can render progress, tools, approvals, validation, memory, skills, and task state externally.

**Acceptance Criteria:**

**Given** an RPC client subscribes to a session/task event stream
**When** the runtime emits lifecycle events
**Then** the RPC adapter sends JSON-RPC notifications with stable event names and schema-validated payloads
**And** events are filtered by authorized session/task scope.

**Given** a task reaches completed, failed, cancelled, or approval-required state
**When** the terminal event is emitted
**Then** the RPC client receives explicit terminal state
**And** does not need to infer completion from text output.

**Covers:** FR65, FR68

### Story 7.5: Respond to Approval Requests Through JSON-RPC

As an external client,
I want to respond to approval requests through JSON-RPC,
So that external tools can safely mediate risky commands and broad edits.

**Acceptance Criteria:**

**Given** the runtime requires approval for a command or edit
**When** the approval request is sent to an RPC client
**Then** it includes request ID, type, command/edit summary, cwd, affected files when known, risk level, reason, environment exposure summary, timeout, allowed actions, and correlation ID.

**Given** an RPC client calls `approval.respond`
**When** the request ID and caller scope are valid
**Then** the runtime records approve, deny, edit, or timeout outcome
**And** invalid or out-of-scope responses are rejected with structured errors.

**Covers:** FR66, FR68

### Story 7.6: Retrieve Final Summaries and Learning Reviews Through JSON-RPC

As an external client,
I want to retrieve final summaries and learning reviews,
So that editors, scripts, and other agents can use task outputs after completion.

**Acceptance Criteria:**

**Given** a task has a final summary
**When** an authorized RPC client requests it
**Then** the response includes final status, changed files, commands run, validation results, unresolved risks, and correlation IDs when available
**And** secret values are redacted.

**Given** a task has a learning review
**When** an authorized RPC client requests it
**Then** the response includes facts, lessons, mistakes, test gaps, memory candidates, skill signals, and reuse evidence within the client's scope
**And** out-of-scope memory or skill data is omitted.

**Covers:** FR67, FR68

### Story 7.7: Inspect Runtime State Through Scoped JSON-RPC

As an external client,
I want to inspect runtime state through scoped RPC,
So that integrations can display status without overreaching into local data.

**Acceptance Criteria:**

**Given** an RPC client calls `runtime.getState`
**When** the request is authorized
**Then** the response includes active session/task state, provider/model state, sandbox state, allowed tools, memory scope, and capability metadata
**And** provider secrets and unauthorized memory/session data are not exposed.

**Given** an RPC client requests data outside its declared scope
**When** authorization is evaluated
**Then** the response is denied with a structured permission error
**And** the denial is auditable.

**Covers:** FR68

## Epic 8: Provider Authentication and Effective Configuration

Users can manage advanced provider auth, logout/refresh credentials, inspect auth state without secret leakage, distinguish auth modes, and inspect effective configuration.

### Story 8.1: Run Provider Login Flow for OAuth-Capable Providers

As a developer,
I want to run a provider login flow when a provider requires OAuth or subscription-based authorization,
So that Sprite Harness can support providers beyond API-key usage without changing the runtime loop.

**Acceptance Criteria:**

**Given** a configured provider supports OAuth or subscription-style login
**When** the user starts the provider login flow
**Then** Sprite Harness begins the provider-specific auth flow through the provider auth interface
**And** keeps OAuth behavior behind provider auth modules rather than the agent loop.

**Given** a provider does not support interactive login
**When** the user requests login
**Then** Sprite Harness returns a structured explanation and next action
**And** suggests API-key or documented provider-specific configuration where applicable.

**Covers:** FR74, FR79

### Story 8.2: Logout and Remove Stored Provider Credentials

As a developer,
I want to remove stored provider credentials,
So that I can revoke or reset local provider access.

**Acceptance Criteria:**

**Given** provider credentials are stored locally
**When** the user runs logout for that provider
**Then** Sprite Harness removes or invalidates the stored credential record
**And** later auth state shows the provider as logged out without exposing prior secret values.

**Given** logout is requested for a provider with no stored credentials
**When** the command runs
**Then** Sprite Harness returns a non-fatal status explaining there was nothing to remove
**And** the process does not fail as an error.

**Covers:** FR75

### Story 8.3: Store Provider Credentials with Restricted Local Permissions

As a developer,
I want provider credentials stored with local permission safeguards,
So that secret material is not broadly readable on disk.

**Acceptance Criteria:**

**Given** Sprite Harness writes provider credentials to disk
**When** the auth store saves the credential file
**Then** credential files are readable and writable only by the current user on POSIX-like systems
**And** containing auth directories are accessible only by the current user where supported.

**Given** the runtime cannot enforce restricted permissions on the current platform
**When** credentials are stored or auth status is inspected
**Then** Sprite Harness emits a warning explaining the unsupported permission enforcement
**And** still avoids printing credential values.

**Covers:** FR76

### Story 8.4: Refresh OAuth Credentials When Supported

As a developer,
I want Sprite Harness to refresh OAuth credentials when supported,
So that authenticated provider sessions can continue without unnecessary manual login.

**Acceptance Criteria:**

**Given** a provider credential includes refresh support
**When** access credentials are expired or near expiry
**Then** Sprite Harness refreshes credentials through the provider auth interface
**And** updates stored auth state without exposing secret values.

**Given** refresh fails or is unsupported
**When** the provider auth state is inspected or used
**Then** Sprite Harness returns a structured recoverable auth error
**And** provides the next action such as re-login or API-key configuration.

**Covers:** FR77

### Story 8.5: Distinguish API-Key Auth from Subscription OAuth Auth

As a developer,
I want Sprite Harness to distinguish OpenAI Platform API-key usage from OpenAI/ChatGPT subscription-style OAuth usage,
So that I configure providers correctly and understand what account path is being used.

**Acceptance Criteria:**

**Given** the user inspects provider auth modes
**When** Sprite Harness lists supported modes
**Then** it distinguishes API-key auth, authorization-code OAuth auth, subscription-style OAuth auth, and unsupported modes
**And** identifies intended personal-use versus production API-use cases where documented.

**Given** provider auth state is shown in CLI, TUI, or RPC
**When** the state includes account or credential metadata
**Then** it displays non-secret status only
**And** never displays raw tokens, API keys, refresh tokens, or secret headers.

**Covers:** FR78, FR81, FR82

### Story 8.6: Inspect Effective Configuration Without Secret Leakage

As a developer,
I want to inspect effective configuration after global and project settings are merged,
So that I can understand what Sprite Harness will actually use.

**Acceptance Criteria:**

**Given** global config, project config, environment variables, auth files, and CLI/runtime overrides exist
**When** the user inspects effective configuration
**Then** Sprite Harness shows the resolved provider, model, output defaults, sandbox policy, validation commands, memory policy, enabled tools, enabled skills, compaction thresholds, learning mode, and RPC permissions
**And** indicates which source contributed each value.

**Given** effective configuration contains non-portable paths or secret-like values
**When** it is displayed
**Then** non-portable values are flagged
**And** secret-like values are redacted or omitted.

**Covers:** FR86

## Epic 9: Developer Documentation, Examples, and Operational Handoff

Users can understand installation, provider setup, first task execution, sandbox behavior, memory behavior, learning review, RPC usage, and skill candidate lifecycle through docs and examples.

### Story 9.1: Document Installation, First Run, and Provider Setup

As a developer,
I want clear installation and first-run documentation,
So that I can install Sprite Harness, configure a provider, and run my first task without reverse-engineering the CLI.

**Acceptance Criteria:**

**Given** the documentation is opened by a new user
**When** they follow the installation and first-run guide
**Then** it explains npm installation/local development, `sprite` binary usage, first-run provider setup or explicit skip, project config detection/creation, sandbox mode visibility, and first-task prompt
**And** the guide distinguishes OpenAI-compatible API-key setup from OAuth/subscription-style provider setup.

**Given** provider setup requires secrets
**When** docs show examples
**Then** they use placeholders and safe environment/auth-file patterns
**And** do not encourage committing secrets to project config.

**Covers:** FR91

### Story 9.2: Document Configuration, Sandbox, and Safety Behavior

As a developer,
I want documentation for config, sandbox, and safety rules,
So that I understand how Sprite Harness decides what is allowed, denied, or requires approval.

**Acceptance Criteria:**

**Given** a user reads the configuration reference
**When** they review global/project config behavior
**Then** the docs explain precedence, effective config inspection, provider/model defaults, validation commands, memory policy, enabled tools, enabled skills, compaction thresholds, learning mode, and RPC permissions.

**Given** a user reads the sandbox documentation
**When** they review command and edit safety behavior
**Then** the docs explain cwd boundaries, timeouts, environment exposure, risky command approval, broad edit approval, denial recovery, secret redaction, and audit trail behavior.

**Covers:** FR91

### Story 9.3: Document Memory, Learning Review, and Skill Candidate Lifecycle

As a developer,
I want documentation for memory, learning reviews, and skill evolution,
So that I can trust and control what the agent learns.

**Acceptance Criteria:**

**Given** a user reads memory documentation
**When** they review memory behavior
**Then** the docs explain working, episodic, semantic, procedural, and self-model memory; memory candidates; provenance; confidence; source task; sensitivity; auto-save policy; review/edit/reject/accept flow; and secret exclusions.

**Given** a user reads skill lifecycle documentation
**When** they review skill behavior
**Then** the docs explain manual skill registry, skill invocation, usage tracking, skill signals, skill candidates, evidence, trigger reasons, draft/reject/promote lifecycle, and user approval before promotion.

**Covers:** FR91

### Story 9.4: Document JSON-RPC Usage and Automation Examples

As a developer,
I want JSON-RPC documentation and examples,
So that I can integrate Sprite Harness with scripts, editors, external agents, or future frontends.

**Acceptance Criteria:**

**Given** a user reads RPC documentation
**When** they follow the examples
**Then** the docs show how to start `sprite rpc`, create/resume a session, submit a task, receive lifecycle events, respond to approval requests, inspect runtime state, retrieve final summaries, and retrieve learning reviews.

**Given** RPC examples include scopes or permissions
**When** the examples are reviewed
**Then** they explain working directory, tools, session, memory access scope, and approval handling
**And** they do not imply that RPC clients can bypass runtime policy.

**Covers:** FR91

### Story 9.5: Provide End-to-End Example Workflows

As a developer,
I want concrete example workflows,
So that I can see how Sprite Harness should be used on real tasks.

**Acceptance Criteria:**

**Given** the examples are available
**When** a user reviews them
**Then** they include at least one real coding task execution, one validation run, one memory reuse example, and one skill candidate review example.

**Given** examples include outputs
**When** outputs are shown
**Then** they demonstrate text/json/ndjson output where relevant, changed files, commands run, validation results, learning review output, and skill candidate lifecycle
**And** they avoid exposing real secrets or private code.

**Covers:** FR91
