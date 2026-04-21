# Sprite Harness

Sprite Harness is a runtime-first local developer agent harness. This repository currently contains the Story 1.1 bootstrap workspace: npm-first packaging, TypeScript project references, a minimal runnable `sprite` CLI, and baseline test/build wiring.

The root workspace is currently marked `private` so Story 1.1 can focus on local bootstrap safety. npm distribution hardening will come in a later packaging story.

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

Not implemented yet:

- Provider integration
- Agent loop
- TUI
- RPC server
- Sandbox and policy engine
- Sessions, memory, and skills
