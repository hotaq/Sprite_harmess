# Sprite Harness

Sprite Harness is a runtime-first local developer agent harness. This repository currently contains the Story 1.1 bootstrap workspace: npm-first packaging, TypeScript project references, a minimal runnable `sprite` CLI, and baseline test/build wiring.

The root workspace is currently marked `private` so Story 1.1 can focus on local bootstrap safety. npm distribution hardening will come in a later packaging story.

Story 1.2 extends bootstrap with first-use configuration loading from global and project config files so the startup surface can report merged defaults truthfully before task execution exists.

## Requirements

- Node.js 24 LTS preferred
- Node.js 22 supported
- npm is the canonical install workflow
- Bun is supported for development commands where compatible

## Commands

### npm

```bash
npm install
npm exec -- sprite --help
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

## Current Story 1.1 Scope

- Custom TypeScript ESM workspace
- Runtime-first package boundaries
- Local `sprite` binary bootstrap
- Basic help, version, and first-run entry response
- Baseline build/typecheck/test scripts

## First-Use Configuration

Sprite Harness currently loads startup defaults from:

- global config: `~/.sprite/config.json`
- project config: `.sprite/config.json`

Project config overrides global config where the same startup fields are defined.

Current bootstrap-visible fields:

- `provider.name`
- `provider.model`
- `output.format` (`text`, `json`, `ndjson`)
- `sandbox.mode` (`workspace-write`, `read-only`, `full-access`)

Example:

```json
{
  "provider": {
    "name": "openai",
    "model": "gpt-5.4"
  },
  "output": {
    "format": "json"
  },
  "sandbox": {
    "mode": "workspace-write"
  }
}
```

The bootstrap output reports the resolved startup state and whether global or project config files were loaded. Secrets do not belong in these example files.

## MVP Provider Setup

Story 1.3 adds an OpenAI-compatible provider bootstrap path. The current precedence for API-key resolution is:

1. runtime override
2. local auth file
3. environment variable
4. provider config

Auth files live under `~/.sprite/auth/` and use the provider name as the filename. Example:

```json
{
  "apiKey": "sk-example"
}
```

For the MVP provider, a typical auth file path is:

- `~/.sprite/auth/openai-compatible.json`

Provider config may specify:

- `provider.name`
- `provider.model`
- `provider.baseUrl`
- `provider.apiKeyEnvVar`
- `provider.apiKey`

Example provider config:

```json
{
  "provider": {
    "name": "openai-compatible",
    "model": "gpt-5.4",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  }
}
```

Bootstrap output exposes provider, model, auth source, and capability metadata, but it never prints the secret value.

## First Interactive Task

Stories 1.4, 1.5, and 1.6 add the first shared-runtime interactive task path:

```bash
sprite "fix the failing provider tests"
```

At this stage the runtime:

- creates a typed task request
- uses current cwd and active provider/model state
- returns an initial plan-act-observe execution flow
- exposes explicit waiting or terminal task state
- emits schema-validated runtime lifecycle events with stable IDs
- lets adapters subscribe to emitted runtime events instead of deriving task truth from text
- accepts immediate steering or cancellation intents through the shared runtime

Examples:

```bash
sprite --steer "Check auth-state warnings before adding commands." "fix the failing provider tests"
sprite --cancel "fix the failing provider tests"
```

At this stage the default interactive CLI task does not yet:

- execute tools or commands
- apply edits
- persist the runtime event stream to session storage

The goal of this slice is to prove that interactive task submission goes through `AgentRuntime`, not to fake full tool execution early.

## Repository Inspection Tools

Stories 2.1 and 2.3 add the first safe repository tools through the shared runtime/tool boundary:

- `read_file`
- `list_files`
- `search_files`
- `apply_patch`

These tools run inside the resolved project directory, reject path escapes, avoid following directory symlinks during traversal, and summarize large outputs over 32 KB or 500 lines. Tool lifecycle observations use canonical runtime events:

- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`

The current CLI does not expose direct file-inspection or patch commands yet. Tool execution is available through runtime/package APIs and remains separate from provider-driven automatic tool use, command execution, approvals, validation command execution, sessions, memory, and skills.

## Patch-Based File Edits

Story 2.3 adds a targeted `apply_patch` tool for runtime/package API use. The MVP patch contract is structured as exact text replacements:

- each edit targets one project-relative file path
- `oldText` must be non-empty and match exactly once
- `newText` must differ from `oldText`
- all edits are validated before any file is written

Patch tool audit is emitted through canonical runtime events:

- `file.edit.requested`
- `file.edit.applied`
- `file.edit.failed`

Successful patch application also records changed file activity through `file.activity.recorded`, so final summaries can list changed files. Runtime events and file activity records intentionally exclude raw file contents, old text, new text, patch hunks, diff bodies, and secret-looking values.

## File Activity Audit

Story 2.2 adds runtime-owned file activity tracking for repository inspection tools. Successful file activity is emitted through canonical runtime events:

- `file.activity.recorded`

Runtime task state and final summaries now group file activity into:

- files read or inspected
- files proposed for change
- files changed

The current implementation records activity for `read_file`, `list_files`, `search_files`, and successful `apply_patch` calls, plus a narrow runtime API for proposal-only `proposed_change` records. File activity records intentionally exclude raw file contents, search snippets, search query text, patch hunks, diff bodies, and secret-looking values.

Durable audit persistence under `.sprite/sessions/...` is not implemented yet; current audit state is runtime-local.

## Policy Classification

Story 2.4 adds a deterministic policy classifier through `@sprite/sandbox` and
`AgentRuntime.classifyPolicyRequest()` for runtime/package API use. It classifies
command and file edit metadata into:

- `allow`
- `modify`
- `require_approval`
- `deny`

Policy decisions are recorded through the canonical
`policy.decision.recorded` runtime event with metadata-only payloads. The
classifier validates untrusted request shapes, rejects raw content fields, keeps
environment values and patch bodies out of decisions, and treats repository or
tool-output instructions as untrusted input.

This story adds classification and audit only. It does not execute commands,
create approval prompts, gate `apply_patch`, run configured validation commands,
or provide the sandbox runner.

Not implemented yet:

- Live provider completions and tool-calling execution
- Full multi-iteration agent loop progression
- Patch approval flow and approval enforcement
- Sandboxed command execution
- TUI
- RPC server
- Sandbox runner
- Sessions, memory, and skills
