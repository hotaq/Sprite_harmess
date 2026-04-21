---
title: "Reference Repository Synthesis: Sprite Harness"
created: "2026-04-20"
purpose: "Reference synthesis for PRD validation"
sources:
  - "https://github.com/nousresearch/hermes-agent"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/memory"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/security"
  - "https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files"
  - "https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly"
  - "https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md"
  - "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md"
  - "https://github.com/yasasbanukaofficial/claude-code"
---

# Reference Repository Synthesis: Sprite Harness

## Validation Use

This document captures reference patterns from Hermes Agent, Pi, and the Claude Code mirror for use during PRD validation. It is not an implementation source. The Claude Code mirror is explicitly treated as a conceptual reference only because the repository describes itself as a backup of leaked proprietary source, not an official Anthropic product.

## Hermes Agent Patterns

### Product Shape

Hermes positions itself as a self-improving agent with a learning loop, persistent memory, skill creation, session search, provider switching, TUI, messaging gateways, subagents, terminal backends, and research tooling. Sprite Harness should not copy Hermes breadth for MVP; it should use Hermes as evidence that memory, skills, provider abstraction, safety, and session recall are meaningful primitives.

### Memory Model

Hermes has bounded, curated persistent memory using `MEMORY.md` and `USER.md`, stored under the Hermes home directory and injected into the system prompt at session start. The memory snapshot is frozen for the session to preserve prompt caching; live memory writes persist to disk but are not re-injected until a later session.

Useful Sprite Harness implications:

- Keep long-term memory bounded, not an unbounded log.
- Separate user profile memory from agent/project memory.
- Prefer compact, durable facts over raw dumps.
- Include capacity metadata so the agent knows memory pressure.
- Treat memory writes as durable artifacts with security scanning.
- Do not inject every memory update immediately into the active prompt by default.

Hermes also distinguishes always-on memory from on-demand session search. Persistent memory is for critical facts that should always be available; session search is for retrieving specific prior conversations. Sprite Harness should preserve this distinction as semantic memory vs episodic/session recall.

### Skill System

Hermes skills are progressive-disclosure knowledge documents. The agent sees a skill index, then loads full skill content or reference files only when needed. Skills can have metadata, platform restrictions, required toolsets, required tools, secure setup variables, config settings, supporting references, templates, scripts, and assets.

Hermes also supports agent-managed skills through a `skill_manage` tool. The agent can create, patch, edit, delete, and update supporting files. It creates skills after complex successful tasks, dead-end recovery, user corrections, or discovered non-trivial workflows.

Useful Sprite Harness implications:

- Skill registry should support an index-first loading model.
- Skill candidates need activation conditions, verification, known pitfalls, required tools, and evidence.
- Skill promotion should remain user-controlled in MVP.
- Patch-based skill updates are preferable to whole-file rewrites.
- External skill directories can be read-only while local skills are the write target.

### Security Model

Hermes documents a defense-in-depth model: user authorization, dangerous command approval, container isolation, credential filtering for subprocesses, context file scanning, cross-session isolation, and input sanitization. Dangerous command approval supports manual, smart, and off/yolo modes; fail-closed approval timeout denies by default.

Useful Sprite Harness implications:

- Sandbox and approval must be first-class, not UI-only prompts.
- Command classification needs explicit dangerous patterns and fail-closed behavior.
- Context files and memory entries need prompt-injection scanning.
- RPC clients need permission scopes and approval flows.
- A yolo/off mode may be useful later but should not be the default.

### Agent Loop and Prompt Assembly

Hermes separates cached system prompt state from ephemeral API-call-time additions. Prompt assembly includes agent identity, tool-aware behavior, optional system message, frozen memory, user profile, skills index, context files, timestamp/session, and platform hint. The core agent loop handles prompt assembly, provider mode selection, interruptible calls, tool dispatch, conversation history, compression, retries, fallback models, iteration budgets, and memory flushing before context is lost.

Useful Sprite Harness implications:

- `AgentRuntime` should own prompt/context assembly, not the TUI.
- Prompt layers should be explicit and ordered.
- Runtime events should expose prompt/context state without leaking secrets.
- Provider adapters should normalize API modes and message/tool-call formats.
- Interruptibility and cancellation are core runtime requirements.

### Context Files

Hermes loads context files with priority and safety scanning. Supported files include `.hermes.md`/`HERMES.md`, `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `.cursorrules`, and Cursor rule modules. It progressively discovers subdirectory `AGENTS.md` or related context files as tools access files in those directories. Large context files are truncated; suspicious prompt-injection patterns are blocked.

Useful Sprite Harness implications:

- The PRD should validate project context loading, priority, scanning, truncation, and progressive discovery.
- Runtime self-model should expose which context files were loaded and whether any were blocked.

## Pi Coding Agent Patterns

### Product Shape

Pi describes itself as a minimal terminal coding harness that adapts to user workflows through TypeScript extensions, skills, prompt templates, themes, and packages. It deliberately skips some large features, such as subagents and plan mode, and exposes four modes: interactive, print/JSON, RPC, and SDK.

Useful Sprite Harness implications:

- Runtime-first design with CLI/TUI/RPC is aligned with the reference.
- MVP should remain minimal despite the larger cognitive vision.
- Extensibility should be designed but not overbuilt.

### Terminal Experience

Pi's interactive UI includes startup context, message stream, editor, and footer. The footer exposes working directory, session name, token/cache usage, cost, context usage, and current model. Commands include `/login`, `/logout`, `/model`, `/settings`, `/resume`, `/new`, `/tree`, `/fork`, `/compact`, `/reload`, and `/quit`. The editor supports file references, path completion, multiline input, image paste, and bash command shortcuts. It supports queued steering/follow-up messages while the agent is working.

Useful Sprite Harness implications:

- TUI should show runtime state, model, context, tools, memory, approvals, and learning events.
- Steering and interruption should be part of MVP or an explicit early growth target.
- File reference and path completion can be growth features unless required for MVP ergonomics.

### Sessions and Compaction

Pi stores sessions as JSONL with tree structure via `id` and `parentId`, enabling branching. Compaction summarizes older messages while preserving recent work. Manual compaction is available via `/compact`; automatic compaction triggers near context limits. Compaction uses a structured summary preserving goal, constraints, progress, decisions, next steps, critical context, and file paths. Tool results are truncated during serialization, and compaction tracks read and modified files cumulatively. Branch summarization preserves context when navigating session branches.

Useful Sprite Harness implications:

- Session storage should support future branching, even if MVP only uses linear sessions.
- Compaction summaries should be structured, not freeform.
- File-operation tracking belongs in compaction details.
- Full session history should remain inspectable even when compacted.

### Provider Auth

Pi supports subscription-based providers via `/login` OAuth flows and API-key providers through environment variables or an auth file. Tokens are stored locally and can refresh when expired. It has a credential resolution order: CLI flag, auth file, environment variable, then custom provider configuration. Pi distinguishes OpenAI Codex subscription use from OpenAI Platform API use.

Useful Sprite Harness implications:

- Provider auth must distinguish API-key providers from OAuth/subscription providers.
- OpenAI Platform API key should be the MVP path.
- OAuth authorization-code flow belongs in provider auth architecture for supported providers.
- Credential state must be inspectable without exposing secrets.

### Package Shape

Pi's package is npm-distributed, TypeScript/ESM, exposes a binary, exports an SDK surface, and supports Node with build/test scripts. It also has a Bun-compiled binary path. Sprite Harness can follow npm-first and Bun-friendly development without committing to a Bun-only runtime.

## Claude Code Mirror Patterns

The mirror repository states that it is a backup of leaked proprietary source from an npm sourcemap and is not official Anthropic code. It should not be copied or treated as implementation source.

Conceptual patterns worth noting:

- Large TypeScript terminal app with Ink/React terminal entry point.
- Core LLM/query engine separated from tools and services.
- Tool layer includes shell/files/LSP/web categories.
- Services include MCP, OAuth, analytics, and memory/dream-like consolidation.
- IDE bridge exists as a separate integration layer.
- Background memory consolidation is framed as orient, gather, consolidate, and prune.

Useful Sprite Harness implications:

- PRD should validate separation of CLI/TUI, core runtime, tools, services, integrations, and memory consolidation.
- Memory consolidation/dream-like behavior should remain conceptual inspiration only.
- Avoid source-level dependency or implementation borrowing from this mirror.

## Validation Focus Areas Added from References

The PRD validation should scrutinize these areas:

1. Prompt/context assembly order and ownership.
2. Context file priority, scanning, truncation, and progressive discovery.
3. Runtime event stream and session audit model.
4. Session storage shape, compaction schema, and future branching compatibility.
5. Provider auth separation: API key vs OAuth/subscription.
6. Credential storage and resolution precedence.
7. Skill candidate lifecycle and progressive skill loading.
8. Safety boundaries: command approval, sandbox, file-edit approval, context-file injection defense, and RPC permissions.
9. Learning reuse proof: later task must show use of earlier memory/lesson/skill signal.
10. Explicit non-goals preventing MVP scope creep into full Hermes/Pi/Claude-Code parity.
