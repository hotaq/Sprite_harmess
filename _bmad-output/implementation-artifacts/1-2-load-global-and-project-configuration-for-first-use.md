# Story 1.2: Load Global and Project Configuration for First Use

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want Sprite Harness to load global and project configuration,  
so that provider, model, sandbox, and output defaults are predictable before a task starts.

## Acceptance Criteria

1. Given global config exists under `~/.sprite/config.json` and project config exists under `.sprite/config.json`, when Sprite Harness starts in a project directory, then project config overrides global config where applicable, and the resolved startup state includes provider, model, output format defaults, and project cwd.
2. Given no project config exists, when Sprite Harness starts, then it uses global/default values and reports that no project config was loaded, and it does not require the user to create project config before the first task.

## Tasks / Subtasks

- [x] Build the Sprite config package for first-use configuration loading (AC: 1, 2)
  - [x] Implement config schema/types in `packages/config` for provider default, model default, output format default, and sandbox placeholder defaults needed by startup state.
  - [x] Implement config path resolution for global `~/.sprite/config.json` and project `.sprite/config.json`.
  - [x] Implement merge precedence so project config overrides global config without requiring a project config file.
- [x] Surface resolved startup state through the runtime boundary (AC: 1, 2)
  - [x] Keep config file discovery/merge logic in `packages/config`, not in the CLI adapter.
  - [x] Add a core-level startup state contract that exposes cwd, provider, model, output format, and whether project config was loaded.
  - [x] Keep the bootstrap response truthful about missing project config and unimplemented later-stage runtime features.
- [x] Wire the CLI bootstrap path to show first-use configuration state (AC: 1, 2)
  - [x] Update the no-argument bootstrap path so startup output reflects merged config state from the current working directory.
  - [x] Preserve `--help` and `--version` behavior from Story 1.1.
- [x] Add deterministic tests for config precedence and no-project-config startup (AC: 1, 2)
  - [x] Add unit coverage for config loading and merge precedence using temp directories rather than the real home directory.
  - [x] Add CLI-facing coverage proving first-run startup reports `no project config` when only global/default config exists.
  - [x] Re-run workspace build/typecheck/test validation after implementation.
- [x] Document the first-use config paths and startup behavior (AC: 1, 2)
  - [x] Extend the README with the config file locations and what the bootstrap output now represents.
  - [x] Keep secrets out of examples; use non-secret provider/model placeholders only.

## Dev Notes

### Story Intent

This story is the first real runtime-adjacent slice after workspace bootstrap. It should establish configuration ownership and precedence early so later provider, task-loop, sandbox, print-mode, and RPC stories inherit one source of truth.

This is still a bootstrap-oriented story. Do not build credential resolution, full validation command config, memory policies, or interactive config creation yet. The goal is deterministic startup config loading, not a full settings system.

### Previous Story Learnings

From Story 1.1:

- Keep the CLI thin. Runtime/state logic belongs in `packages/core` or the owning package, not command handlers.
- Package boundaries matter early. If a workspace package is real, it must participate in root build/typecheck references.
- Keep first-run messaging truthful. The bootstrap output can report current state, but it must not imply task execution exists yet.
- Regression coverage around the built CLI path and local `node_modules/.bin/sprite` path is worth keeping as the CLI boot path evolves.

### Scope Boundaries

In scope:

- `packages/config` schema, path resolution, load, and merge precedence
- core startup state contract for first-use config visibility
- CLI bootstrap output updates for merged config visibility
- deterministic tests for global/project precedence and missing project config
- README updates for config paths

Out of scope for Story 1.2:

- provider credential resolution precedence across flags/auth/env/provider config
- interactive first-run setup or config creation
- effective config inspection commands
- validation command execution
- sandbox enforcement implementation
- session, memory, learning, or skill configuration behavior
- RPC or TUI configuration rendering

### Technical Requirements

- Global config path is `~/.sprite/config.json`.
- Project config path is `.sprite/config.json` relative to the current working directory.
- Project config overrides global config where the same startup fields are set.
- Startup must work without a project config file.
- Resolved startup state must include:
  - current project cwd
  - provider default
  - model default
  - output format default
  - whether global config was loaded
  - whether project config was loaded
- Keep file reads local and synchronous if that keeps bootstrap deterministic and simple; there is no async provider work in this story.

### Architecture Compliance

- `packages/config` owns Sprite config schema and precedence.
- `packages/core` may consume resolved config state, but the CLI must not own merge rules or direct config parsing logic.
- Keep startup state representation independent from Commander or future TUI/RPC rendering.
- Avoid adding dependencies for schema validation unless they are already required by the story. TypeScript-first runtime validation is sufficient for this slice.
- Do not store or print secrets in startup output.

### File Structure Guidance

Expected implementation direction:

- `packages/config/src/config-schema.ts`
- `packages/config/src/config-loader.ts`
- `packages/config/src/precedence.ts`
- `packages/config/src/index.ts`
- updates in `packages/core/src`
- minimal CLI integration in `packages/cli/src/index.ts`
- tests under `tests/`

### Testing Requirements

- Unit tests should cover:
  - defaults only
  - global config only
  - global + project config with project override
  - missing project config path
- CLI-facing tests should verify:
  - bootstrap output still succeeds with no config files
  - bootstrap output reports no project config loaded when appropriate
  - bootstrap output reports merged provider/model/output values when config files exist
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Epic 1 and Story 1.2 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.2)
- Global/project config requirements: `_bmad-output/planning-artifacts/prd.md` (FR83, FR84, FR85, FR88, NFR36, NFR37, NFR40)
- Config ownership and precedence: `_bmad-output/planning-artifacts/architecture.md` (`packages/config` owns Sprite config schema and precedence)
- Local storage/config paths: `_bmad-output/planning-artifacts/architecture.md` (local artifact storage under `~/.sprite` and `.sprite`)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`
- `node packages/cli/dist/index.js`

### Completion Notes List

- Added `@sprite/config` as a real exported workspace package with typed config schema, config-path resolution, partial override precedence, and resolved startup state helpers.
- Kept config ownership in `packages/config` and surfaced merged startup state through `AgentRuntime` so the CLI stays adapter-thin.
- Updated bootstrap output to report cwd, provider, model, output format, sandbox mode, and whether global/project config files were loaded.
- Added deterministic unit tests for defaults, global-only config, and project-overrides-global config using temp home/project directories.
- Added CLI smoke coverage proving the no-arg bootstrap path reports missing project config and merged startup state correctly.
- Extended the README with first-use config paths, supported bootstrap-visible fields, and a safe example config.
- Verified `npm run build`, `npm run typecheck`, `npm test`, `npm pack --dry-run`, and `node packages/cli/dist/index.js`.

### File List

- `_bmad-output/implementation-artifacts/1-2-load-global-and-project-configuration-for-first-use.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README.md`
- `package.json`
- `packages/config/package.json`
- `packages/config/src/config-loader.ts`
- `packages/config/src/config-schema.ts`
- `packages/config/src/index.ts`
- `packages/config/src/precedence.ts`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/tsconfig.json`
- `tests/cli-smoke.test.ts`
- `tests/config-loader.test.ts`
- `tsconfig.base.json`

### Change Log

- 2026-04-22: Created Story 1.2 with implementation context for first-use global/project configuration loading.
- 2026-04-22: Implemented global/project config loading, startup state reporting, bootstrap output wiring, and deterministic tests; moved story to review.
