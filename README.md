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

Stories 1.4 and 1.5 add the first shared-runtime interactive task path:

```bash
sprite "fix the failing provider tests"
```

At this stage the runtime:

- creates a typed task request
- uses current cwd and active provider/model state
- returns an initial plan-act-observe execution flow
- exposes explicit waiting or terminal task state
- records minimal runtime lifecycle events for task state changes
- accepts immediate steering or cancellation intents through the shared runtime

Examples:

```bash
sprite --steer "Check auth-state warnings before adding commands." "fix the failing provider tests"
sprite --cancel "fix the failing provider tests"
```

At this stage the runtime does not yet:

- inspect repository files
- execute tools or commands
- apply edits
- emit the full runtime event stream

The goal of this slice is to prove that interactive task submission goes through `AgentRuntime`, not to fake full tool execution early.

Not implemented yet:

- Live provider completions and tool-calling execution
- Full runtime event schema and event bus
- Full multi-iteration agent loop progression
- TUI
- RPC server
- Sandbox and policy engine
- Sessions, memory, and skills
