# Sprite Harness

Sprite Harness is a runtime-first local developer agent harness. It is building
the shared runtime, tool boundary, safety policy, validation, and audit surfaces
needed before provider-driven automatic development work is enabled.

The root workspace is currently marked `private` while local bootstrap and
runtime safety stories are still in progress. npm distribution hardening will
come in a later packaging story.

For detailed story-by-story implementation notes, see [progress.md](progress.md).

## Requirements

- Node.js 24 LTS preferred
- Node.js 22 supported
- npm is the canonical install workflow
- Bun is supported for development commands where compatible

## Quick Start

```bash
npm install
npm exec -- sprite --help
npm run typecheck
npm run test
npm run build
```

## Development Commands

### npm

```bash
npm run typecheck
npm run test
npm run build
npm run dev:cli
npm run dev:rpc
```

### Bun

```bash
bun install
bun run build
bun run --bun packages/cli/dist/index.js --help
bun run typecheck
bun run test
bun run build
bun run dev:cli
bun run dev:rpc
```

## Current Capabilities

Current runtime/package API capabilities include:

- first-use configuration loading from global and project config files
- OpenAI-compatible provider bootstrap metadata and auth-source reporting
- typed interactive task submission through `AgentRuntime`
- schema-validated runtime lifecycle events
- repository inspection and patch tools behind the shared tool boundary
- file activity summaries for inspected, proposed, and changed files
- policy classification for command and file-edit metadata
- approval-gated command/file-edit execution paths
- sandboxed command execution through `run_command`
- configured validation commands through the runtime approval/sandbox path
- metadata-only recovery decision records
- inspectable safety rules before content becomes a memory candidate
- project-local session artifacts with `ses_...` IDs, append-only
  `events.ndjson`, and bounded `state.json` snapshots
- read-only `sprite session inspect <session-id>` output with bounded recent
  events, file activity, command summaries, pending approvals, last error,
  next-step hints, local-state warnings, and secret redaction
- conservative `sprite resume <session-id>` output that restores persisted task
  state, validates event history, emits a metadata-only `session.resumed`
  event, and does not replay tools, commands, approvals, validations, or
  provider calls

## Current Limitations

Not implemented yet:

- live provider completions and provider-driven tool-calling execution
- full multi-iteration agent loop progression
- TUI
- RPC server
- context loading and compaction
- durable memory persistence and skills
- CLI/TUI/RPC approval prompts
