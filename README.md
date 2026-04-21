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

Not implemented yet:

- Provider integration
- Agent loop
- TUI
- RPC server
- Sandbox and policy engine
- Sessions, memory, and skills
