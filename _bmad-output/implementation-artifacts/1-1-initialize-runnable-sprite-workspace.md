# Story 1.1: Initialize Runnable Sprite Workspace

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want to install dependencies and run the `sprite` binary locally,  
so that I can start Sprite Harness from a project directory.

## Acceptance Criteria

1. Given a fresh checkout of the Sprite Harness repository, when the developer installs dependencies and runs the local `sprite` binary, then the CLI starts without crashing and displays a basic help, version, or first-run entry response, and the package exposes a `sprite` binary through npm package metadata.
2. Given the workspace has multiple packages, when the developer runs typecheck, test, and build scripts, then the scripts execute across the workspace in dependency order, and Bun-friendly commands are documented or aliased where supported.

## Tasks / Subtasks

- [x] Scaffold the root npm-first TypeScript workspace (AC: 1, 2)
  - [x] Create root `package.json` as an ESM workspace with `bin.sprite` pointing to `packages/cli/dist/index.js`.
  - [x] Add root workspace configuration, TypeScript base config, project-reference root config, and shared scripts for `typecheck`, `test`, `build`, `lint`, `format`, `dev`, `dev:cli`, and `dev:rpc`.
  - [x] Keep the repository root usable alongside existing `_bmad/`, `_bmad-output/`, `docs/`, and hidden agent folders; do not restructure or overwrite them.
- [x] Establish the required package boundaries for the runtime-first architecture (AC: 1, 2)
  - [x] Create the `packages/` layout required by architecture, with runnable foundations for `shared`, `core`, and `cli`.
  - [x] Add placeholder package roots for `storage`, `providers`, `tools`, `sandbox`, `memory`, `skills`, `config`, `tui`, and `rpc` so the workspace shape matches the target package boundary early.
  - [x] Use TypeScript project references so package builds run in dependency order rather than through ad hoc shell sequencing.
- [x] Implement the first runnable `sprite` CLI path (AC: 1)
  - [x] Add a minimal CLI entry in `packages/cli` using Commander only in the CLI adapter package.
  - [x] Ensure `sprite --help` and `sprite --version` work after build or local dev execution.
  - [x] Return a minimal first-run response that is honest about what is and is not implemented yet.
- [x] Add baseline shared/core contracts needed by the CLI entry (AC: 1, 2)
  - [x] Create minimal exports for shared result/error utilities and a stub runtime boundary in `packages/core` so the CLI does not own runtime logic.
  - [x] Keep the core package free of CLI/TUI/RPC rendering dependencies.
- [x] Add baseline test/build verification (AC: 2)
  - [x] Configure Vitest for TypeScript package testing.
  - [x] Add CLI smoke tests that verify the built binary boots and prints help/version/entry responses.
  - [x] Confirm `npm run typecheck`, `npm run test`, and `npm run build` run successfully across the workspace.
- [x] Document Bun-friendly developer commands without making Bun the required runtime (AC: 2)
  - [x] Add Bun-equivalent commands or documentation for install, typecheck, test, and local CLI execution.
  - [x] Keep npm as the canonical package/install flow and Node.js as the required distributed CLI runtime.

## Dev Notes

### Story Intent

This story is the foundation slice for the whole product. It is not a generic repo bootstrap. It must create the runtime-first TypeScript workspace in a way that preserves the future architecture:

- one shared `AgentRuntime`,
- adapter-thin CLI/TUI/RPC layers,
- package boundaries that prevent UI ownership of runtime state,
- npm-first packaging with Bun-friendly development,
- a runnable `sprite` binary from the start.

Do not overbuild beyond that. This story should stop at a truthful, runnable workspace and minimal local CLI entry.

### Scope Boundaries

In scope:

- Root workspace and package layout
- ESM + TypeScript foundation
- `sprite` binary wiring
- Minimal CLI help/version/first-run response
- Root scripts for typecheck/test/build/lint/format/dev/dev:cli/dev:rpc
- Minimal shared/core/cli contract wiring
- Baseline test harness and smoke checks
- Bun-friendly developer command support

Out of scope for Story 1.1:

- Real provider integration
- Config loading logic
- Agent loop
- Runtime event stream
- TUI implementation
- JSON-RPC server
- Sandbox/policy enforcement implementation
- Session persistence
- Memory/skills implementation
- OAuth/auth-store implementation
- SQLite or any DB-first storage

### Technical Requirements

- Use a **custom TypeScript workspace**, not a generated CLI or TUI starter.
- Use **TypeScript ESM** and **npm workspaces** as the canonical package/install path.
- Expose the user-facing binary as **`sprite`**.
- Make the distributed CLI target a **standard Node.js environment**.
- Keep development **Bun-friendly**, but do not make Bun the required runtime.
- Ensure package build/typecheck order comes from **TypeScript project references**.
- Create architecture-aligned package boundaries early so later stories do not need to undo Story 1.1 decisions.

### Architecture Compliance

- CLI, TUI, print mode, and RPC must remain thin adapters over one shared runtime; Story 1.1 must not embed task-loop ownership inside CLI code.
- `packages/core` must not depend on Commander, Ink, React, JSON-RPC server libraries, or terminal rendering libraries.
- Commander belongs only in `packages/cli`.
- Ink belongs only in `packages/tui`, and should be deferred until runtime event contracts exist.
- Avoid generated oclif or `create-ink-app` scaffolds as the product foundation.
- Do not introduce SQLite or any schema-first storage. Local artifact-first storage remains the architecture baseline.
- No remote telemetry in MVP bootstrap.

### Library / Framework Requirements

- **TypeScript**: use the current stable line during implementation discovery. As of 2026-04-21, npm shows the latest stable tag at `5.9.2`. Keep configuration compatible with Node.js 24 LTS primary target and Node.js 22 compatibility posture.
- **Commander**: use the current stable line for CLI parsing in `packages/cli` only. As of 2026-04-21, npm shows the latest tag at `14.0.0`, and the package notes support for current LTS Node versions with a minimum of Node 20.
- **Vitest**: use the stable line for TypeScript tests. As of 2026-04-21, npm shows the latest stable tag at `3.2.4`.
- **Ink**: architecture keeps Ink in reserve for the TUI package only. As of 2026-04-21, npm shows the latest stable tag at `6.2.3`, but Story 1.1 should not depend on it unless a placeholder `packages/tui` package needs package metadata only.

### File Structure Requirements

Minimum required direction from architecture:

- Root: `package.json`, `tsconfig.base.json`, `tsconfig.json`, test config, lint/format config, `.gitignore`, docs placeholders as needed
- Packages: `shared`, `core`, `storage`, `providers`, `tools`, `sandbox`, `memory`, `skills`, `config`, `cli`, `tui`, `rpc`
- CLI package contains the binary entry and renderers
- Core package contains runtime boundary code only
- Shared package contains common utilities and schemas

Recommended first-pass implementation:

- Implement real source roots in `packages/shared`, `packages/core`, and `packages/cli`
- Create minimal package scaffolds or placeholders for the remaining packages
- Add package-level `package.json` and `tsconfig.json` where required for project references
- Use absolute workspace-relative paths consistently; do not bury source under temporary scaffold-specific directories

### Testing Requirements

- `npm run typecheck` must validate the workspace successfully.
- `npm run test` must execute at least one smoke test against the CLI boot path.
- `npm run build` must produce the CLI distribution output needed by `bin.sprite`.
- Prefer deterministic tests that do not require providers, sandbox execution, or TUI launch.
- The first smoke tests should verify:
  - `sprite --help`
  - `sprite --version`
  - minimal first-run entry response from a local command path

### Project Structure Notes

- This repository is already a live working directory containing `_bmad/`, `_bmad-output/`, `docs/`, `.agents/`, `.claude/`, `.cursor/`, and related local folders.
- Treat those directories as existing project infrastructure and do not delete, rename, or relocate them during workspace bootstrap.
- The architecture sample tree includes `pnpm-workspace.yaml`, but the documented package/install posture is npm-first. If you add `pnpm-workspace.yaml` for compatibility, keep it secondary to npm workspaces and do not let it redefine the project posture.
- Because the repo is greenfield for product code but not empty, Story 1.1 should add implementation files alongside planning artifacts rather than trying to create a separate nested `sprite-harness/` directory.

### Implementation Guardrails

- Do not create a nested project folder inside the existing repo root.
- Do not use oclif, `create-ink-app`, or other starter generators as the project foundation.
- Do not make CLI code the de facto runtime by embedding future task-loop logic into command handlers.
- Do not target Node.js 20. Architecture explicitly prefers Node.js 24 LTS and Node.js 22 compatibility.
- Do not claim support for unimplemented interfaces. The first-run response must accurately describe MVP bootstrap state.
- Do not add provider packages, OAuth flows, or TUI runtime dependencies unless needed for placeholder scaffolding only.

### Latest Technical Information

Use these as implementation-time checkpoints rather than immutable pins:

- TypeScript latest stable tag on npm: `5.9.2`  
  Source: https://www.npmjs.com/package/typescript?activeTab=versions
- Commander latest stable tag on npm: `14.0.0`  
  Source: https://www.npmjs.com/package/commander?activeTab=versions
- Vitest latest stable tag on npm: `3.2.4`  
  Source: https://www.npmjs.com/package/vitest?activeTab=versions
- Ink latest stable tag on npm: `6.2.3`  
  Source: https://www.npmjs.com/package/ink?activeTab=versions

These are informative guardrails for Story 1.1. During implementation, prefer compatible stable versions that preserve the architecture's Node 24 / Node 22 posture and avoid dragging in TUI dependencies before they are needed.

### References

- Epic 1 and Story 1.1 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.1)
- Product requirements for installability and Bun-friendly workflows: `_bmad-output/planning-artifacts/prd.md` (FR1, FR89, FR90, NFR38, NFR39)
- Runtime-first workspace decision and manual bootstrap command: `_bmad-output/planning-artifacts/architecture.md` (custom TypeScript workspace foundation, initialization command)
- Build, project references, scripts, and test posture: `_bmad-output/planning-artifacts/architecture.md` (Build Tooling Decision, Testing Decision, Runtime Version Decision)
- Target package structure: `_bmad-output/planning-artifacts/architecture.md` (Initial workspace direction / project tree)
- Reference posture for npm-first and Bun-friendly packaging: `_bmad-output/planning-artifacts/reference-repo-synthesis.md` (Pi Coding Agent, Package Shape)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`
- `node packages/cli/dist/index.js`
- `node packages/cli/dist/index.js --help`
- `node packages/cli/dist/index.js --version`
- `./node_modules/.bin/sprite`
- `./node_modules/.bin/sprite --help`
- `./node_modules/.bin/sprite --version`

### Completion Notes List

- Implemented a custom npm-first TypeScript ESM workspace at the existing repo root without disturbing `_bmad/`, `_bmad-output/`, `docs/`, or local agent folders.
- Added runtime-first package boundaries with real implementations for `shared`, `core`, and `cli`, plus placeholder package roots for the remaining architecture packages.
- Wired the root `sprite` binary to `packages/cli/dist/index.js` and implemented truthful bootstrap help/version/default responses.
- Added a minimal `AgentRuntime` bootstrap boundary in `packages/core` so the CLI remains an adapter rather than owning runtime logic.
- Added build, typecheck, lint, test, dev, and Bun-friendly command documentation, plus a placeholder `dev:rpc` command that does not pretend RPC exists yet.
- Added CLI smoke tests against the built binary and verified `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `node packages/cli/dist/index.js`, `node packages/cli/dist/index.js --help`, and `node packages/cli/dist/index.js --version`.
- Hardened local bootstrap so `npm install` runs `prepare` and produces the built CLI path expected by the root `sprite` bin.
- Marked the root workspace `private` and added a publish allowlist so planning artifacts like `_bmad/` and `_bmad-output/` do not leak into npm tarballs.
- Fixed CLI entrypoint detection to handle execution through the installed `node_modules/.bin/sprite` symlink and added a regression test for that path.
- Tightened the root package publish surface so only runtime distribution artifacts are included and build metadata like `.tsbuildinfo` is excluded from dry-run tarballs.

### File List

- `.gitignore`
- `.npmignore`
- `README.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-1-initialize-runnable-sprite-workspace.md`
- `package-lock.json`
- `package.json`
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/tsconfig.json`
- `packages/config/package.json`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/index.ts`
- `packages/core/tsconfig.json`
- `packages/memory/package.json`
- `packages/providers/package.json`
- `packages/rpc/package.json`
- `packages/sandbox/package.json`
- `packages/shared/package.json`
- `packages/shared/src/errors.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/result.ts`
- `packages/shared/tsconfig.json`
- `packages/skills/package.json`
- `packages/storage/package.json`
- `packages/tools/package.json`
- `packages/tui/package.json`
- `prettier.config.cjs`
- `scripts/dev-rpc-placeholder.mjs`
- `tests/cli-smoke.test.ts`
- `tsconfig.base.json`
- `tsconfig.json`
- `vitest.config.ts`

## Change Log

- 2026-04-21: Implemented Story 1.1 workspace bootstrap, added root/package scaffolding, minimal `sprite` CLI entry, smoke tests, and updated sprint tracking to reflect completion readiness.
- 2026-04-21: Addressed pre-commit review findings by adding install-time build preparation, publish-surface hardening, npm tarball allowlisting, and a local bin symlink regression fix.
