---
title: "Product Brief: Sprite Harness"
status: "draft"
created: "2026-04-20"
updated: "2026-04-20"
inputs:
  - "User discovery conversation on 2026-04-20"
  - "Hermes Agent README and documentation"
  - "Pi Coding Agent documentation"
---

# Product Brief: Sprite Harness

## Executive Summary

Sprite Harness is a personal-first terminal AI agent for software development. It gives the user a fast, scriptable CLI that can plan work, inspect and edit files, run commands in a sandbox, manage reusable skills, and preserve useful context across sessions. The product is inspired by the strongest patterns from Claude Code, Codex, Hermes Agent, and Pi, but its design goal is narrower: build a coding agent that fits one developer's workflow first, with clean architecture for later expansion.

The first version should not try to match every commercial coding assistant feature. It should provide a reliable agentic loop, a small set of high-leverage coding tools, automatic memory capture, sandboxed command execution, and a multi-provider model layer. This creates a usable daily tool quickly while leaving room for advanced context management, skills, subagents, and richer TUI features.

## Problem

Modern coding agents are powerful, but they often force the user into the tool's workflow. Provider choice may be constrained, memory behavior may be opaque, and customization often requires accepting a large existing architecture. For a developer who wants a terminal-native assistant that remembers their preferences, understands their projects, and can be shaped over time, existing tools are either too closed, too broad, or too difficult to bend.

The core pain is not only "write code faster." It is the lack of a controllable personal agent harness that can:

- work inside the terminal,
- operate on real project files,
- run commands safely,
- remember durable user and project context,
- support multiple model providers,
- load custom skills and agent behaviors,
- and expose enough of its loop that the user can trust and improve it.

## Product Vision

Sprite Harness is the user's own agent terminal: a TypeScript-based CLI for coding, planning, file editing, command execution, and skill-driven workflows. It should feel fast and practical from the first MVP, while its internal boundaries stay clean enough to support more ambitious agent behavior later.

The product should optimize for:

- fast local developer workflow,
- transparent agentic execution,
- easy provider switching,
- controlled memory and context growth,
- safe command execution by default,
- and extensibility through skills, tools, and agent profiles.

## Target User

The initial user is Chinnaphat: an intermediate developer building a personal coding agent for their own workflow. The product may later be useful to other developers, but the MVP should prioritize one-user fit over broad market generality.

Primary usage scenarios:

- ask the agent to inspect a codebase and explain what matters,
- plan a feature before implementation,
- edit files through an agentic loop,
- run tests or shell commands inside a sandbox,
- resume past work with preserved session context,
- let the agent remember stable project conventions,
- create and invoke reusable skills for repeated workflows.

## MVP Scope

The MVP should be intentionally small but complete enough to use on real projects.

### CLI and Session Flow

- Start the app with a command such as `sprite`.
- Support interactive chat in the terminal.
- Support slash commands such as `/new`, `/resume`, `/model`, `/memory`, `/skills`, `/tools`, and `/exit`.
- Persist sessions locally so work can be resumed.

### Agentic Loop

- Implement a plan-act-observe loop.
- Let the model call tools repeatedly until it reaches a final answer, hits an iteration limit, or needs user approval.
- Track max iterations per user request.
- Show concise progress while tools execute.
- Produce a final summary with changed files, commands run, and remaining risks.

### Coding Tools

Initial tools:

- `read_file`
- `write_file`
- `edit_file` or `apply_patch`
- `list_files`
- `search_files`
- `run_command`

Tools should be registered through a central `ToolRegistry` so new tools can be added without changing the core loop.

### Sandboxed Command Execution

Command execution must be sandboxed from the beginning. The MVP should support a practical local sandbox before more advanced isolation:

- default working directory isolation to the current project,
- allowlist or approval rules for risky commands,
- timeout for every command,
- captured stdout/stderr,
- optional environment variable passthrough,
- no destructive command execution without explicit approval.

Future sandbox options may include Docker, containerized project workspaces, or remote execution backends.

### Multi-Provider Model Layer

Sprite Harness should use a provider abstraction from the start.

MVP provider order:

1. OpenAI-compatible provider first.
2. Add Anthropic support after the loop is stable.
3. Add OpenRouter or custom base URL support for broader model choice.

The core runtime should call a `ProviderAdapter` interface, not vendor-specific SDKs directly from agent logic.

### Automatic Memory

Memory should be automatic, but bounded and curated.

Initial memory stores:

- `USER.md`: user preferences, communication style, preferred workflow, stable personal settings.
- `MEMORY.md`: environment facts, project conventions, useful lessons, recurring commands.
- `sessions.sqlite`: conversation history and session metadata.

The agent should be able to propose and save durable facts automatically. Memory entries should be compact, deduplicated, and security-scanned before injection into future prompts. The MVP should avoid storing raw logs, secrets, or large code blocks.

### Project Context

Sprite Harness should load project context files when present:

- `SPRITE.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.cursorrules`

The first version can use a simple priority order and explicit file size limits. Later versions can add smarter indexing and retrieval.

### Skills and Agent Profiles

Skills should be markdown-based packages loaded on demand.

Example:

```text
skills/
  code-review/
    SKILL.md
  create-prd/
    SKILL.md
  quick-dev/
    SKILL.md
```

The MVP should support listing and manually invoking skills. Automatic skill selection can come after the first version is usable.

## Architecture Direction

Sprite Harness should be written in TypeScript.

Recommended high-level modules:

```text
CLI/TUI
  -> AgentRuntime
      -> AgentLoop
      -> PromptBuilder
      -> ProviderAdapter
      -> ToolRegistry
      -> SandboxRunner
      -> MemoryManager
      -> SessionStore
      -> SkillLoader
```

Key architectural principles:

- Keep provider logic outside the agent loop.
- Keep tools declarative and registry-driven.
- Keep command execution behind a sandbox boundary.
- Keep memory small, explicit, and auditable.
- Keep the first UI simple enough to ship quickly.
- Prefer working primitives over a large framework.

## Differentiation

Sprite Harness differentiates by being personal-first rather than platform-first. Its strongest position is not that it has more built-in features than Claude Code, Codex, Hermes, or Pi. Its advantage is that its memory, skills, provider layer, and execution loop are designed to be owned and modified by the user from the beginning.

The product promise:

> A fast terminal coding agent that remembers how you work, runs safely, switches models freely, and grows through your own skills.

## Success Criteria

The MVP is successful when the user can use Sprite Harness on a real local project to:

- start a terminal session,
- ask for a coding or planning task,
- let the agent inspect files,
- make a controlled edit,
- run a sandboxed command,
- receive a useful final summary,
- resume the session later,
- and see that durable preferences or project facts were saved automatically.

## Non-Goals for MVP

- Full Claude Code parity.
- Messaging integrations such as Slack, Discord, or Telegram.
- Complex subagent orchestration.
- Cloud execution backends.
- Rich plugin marketplace.
- Automatic skill generation.
- Web UI.
- Sophisticated semantic memory provider.

These may be valuable later, but they would slow the first usable version.

## Key Risks and Open Questions

- Sandbox design may become complex if the MVP tries to support every platform immediately.
- Automatic memory can become noisy or unsafe if save rules are too broad.
- Multi-provider support can create inconsistent tool-call behavior across models.
- A TUI can consume too much effort before the core loop is proven.
- The product needs a clear boundary between "agent autonomy" and "user approval" for file and command changes.

Open questions:

- Should the MVP use a simple line-based CLI first, or start with a richer TUI?
- Should automatic memory writes happen silently, or should the user see a compact "saved memory" notice?
- What sandbox backend should be first: Node child process with strict controls, Docker, or another isolation layer?
- Should file edits use direct write/edit tools or patch-only edits for auditability?
- Should skills follow the Agent Skills format exactly from day one?

## Recommended Next Step

Create a PRD for the MVP. The PRD should turn this brief into concrete functional requirements, non-functional requirements, command behavior, tool schemas, memory rules, sandbox rules, and acceptance criteria.
