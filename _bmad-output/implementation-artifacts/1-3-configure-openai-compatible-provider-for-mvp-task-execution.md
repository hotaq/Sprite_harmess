# Story 1.3: Configure OpenAI-Compatible Provider for MVP Task Execution

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,  
I want to configure an OpenAI-compatible provider and model,  
so that the runtime can call a model without hard-coding provider-specific logic.

## Acceptance Criteria

1. Given provider credentials are available through CLI/runtime override, auth file, environment variable, or provider config, when Sprite Harness resolves credentials, then it uses the documented precedence order, and it does not expose secret values in logs, state, or output.
2. Given an OpenAI-compatible provider configuration is valid, when the runtime initializes the provider adapter, then the active provider, model, and capability metadata are available to CLI/runtime state, and provider-specific message, tool-call, streaming, error, usage, and capability behavior stays behind the provider adapter contract.

## Tasks / Subtasks

- [x] Establish provider contracts and metadata boundaries in `packages/providers` and `packages/core` (AC: 1, 2)
  - [x] Add a normalized provider state/capabilities contract for active provider name, model identity, auth state, streaming support, tool-call support, and context limit metadata.
  - [x] Keep provider-specific request/response/auth logic behind `packages/providers`, not in CLI or core task orchestration code.
  - [x] Extend runtime startup/provider-facing state only enough to surface active provider/model/capabilities truthfully.
- [x] Implement OpenAI-compatible API-key provider configuration loading for MVP (AC: 1, 2)
  - [x] Add provider config types and loader helpers for an OpenAI-compatible endpoint, model, and auth mode.
  - [x] Support credential precedence in this order: CLI/runtime override, local auth file, environment variable, provider config.
  - [x] Keep OAuth as an architecture placeholder only; do not implement the authorization flow in this story.
- [x] Add local auth-file handling without secret leakage (AC: 1)
  - [x] Resolve auth files under `~/.sprite/auth/` with a provider-specific file or equivalent MVP-safe layout.
  - [x] Expose auth state and credential source without ever returning the secret value itself.
  - [x] Keep warning/error messages redacted and safe for CLI/runtime state.
- [x] Wire provider initialization into the current bootstrap/runtime state (AC: 2)
  - [x] Allow the runtime to initialize the active provider adapter from resolved config/credential inputs.
  - [x] Surface active provider, model, auth state, and capability metadata through runtime state so later CLI/TUI/RPC layers can reuse one source of truth.
  - [x] Keep the current bootstrap output honest about what exists now versus what task execution still does not do yet.
- [x] Add deterministic provider tests and documentation (AC: 1, 2)
  - [x] Add unit tests for credential precedence and redaction behavior.
  - [x] Add tests for valid provider initialization and capability metadata exposure without making real network calls.
  - [x] Document the MVP provider setup path and supported auth inputs without encouraging secrets in project config.

## Dev Notes

### Story Intent

This story introduces the first real model-facing subsystem, but it should still stop short of task execution. The objective is to make provider selection, credential resolution, and provider capability state real and inspectable before Story 1.4 starts submitting tasks.

The important architectural boundary is that the runtime depends on a normalized provider contract, not an OpenAI-specific request shape. The MVP provider can be OpenAI-compatible only, but the contract must leave room for additional providers later.

### Previous Story Learnings

From Story 1.2:

- Keep ownership clear: config merge rules stayed in `packages/config`, and runtime only consumed resolved state. Follow the same pattern here for provider logic.
- Bootstrap output should remain truthful and resilient. Even malformed config should not crash startup; provider/auth initialization should follow the same standard.
- Deterministic temp-directory tests worked well for startup/config behavior. Reuse that approach for auth files, env vars, and provider initialization paths.
- Avoid leaking sensitive values into output, warnings, or state. Story 1.2 already established the pattern of surfacing safe status rather than raw internals.

### Scope Boundaries

In scope:

- normalized provider contract and capability metadata
- OpenAI-compatible API-key provider adapter for MVP
- credential resolution precedence
- auth file + environment variable + provider config + runtime override resolution
- safe auth state exposure
- bootstrap/runtime provider state visibility
- deterministic tests and setup docs

Out of scope for Story 1.3:

- real task submission/agent loop execution
- provider streaming implementation tied to a live model session
- OAuth authorization-code flow implementation
- multi-provider parity beyond OpenAI-compatible endpoints
- TUI or RPC-specific provider rendering
- secret storage beyond the MVP local auth-file posture

### Technical Requirements

- MVP provider is OpenAI-compatible API-key auth.
- Credential precedence must be:
  1. CLI flags or runtime request override
  2. local auth file
  3. environment variable
  4. provider config
- Auth files live under `~/.sprite/auth/`.
- Provider auth state can be inspected without exposing secret values.
- Provider metadata should include at least:
  - provider name
  - model identity
  - auth state
  - streaming support
  - tool-call support
  - context limit metadata when available
- No real provider network calls are required in tests.

### Architecture Compliance

- `packages/providers` owns provider-specific behavior, auth helpers, and provider capability metadata.
- Core/runtime should depend on a normalized provider contract only.
- OAuth details stay behind the provider auth boundary and remain placeholder-only in this story.
- Do not leak secrets into logs, startup output, runtime state, summaries, or test snapshots.
- Keep `.env.example` and docs secret-free.

### File Structure Guidance

Expected implementation direction:

- `packages/providers/src/provider-registry.ts`
- `packages/providers/src/provider-capabilities.ts`
- `packages/providers/src/openai-compatible-provider.ts`
- `packages/providers/src/auth/api-key-auth.ts`
- `packages/providers/src/auth/auth-store.ts`
- updates in `packages/core/src`
- optional config/provider integration updates in `packages/config/src`
- tests under `tests/`

### Testing Requirements

- Unit tests should cover:
  - precedence order across runtime override, auth file, env var, and provider config
  - redacted auth state exposure
  - malformed/missing auth file fallback
- Provider initialization tests should cover:
  - valid OpenAI-compatible provider startup state
  - capability metadata exposure
  - no secret leakage in returned runtime/bootstrap state
- Run `npm run build`, `npm run typecheck`, and `npm test`.

### References

- Epic 1 and Story 1.3 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.3)
- Provider/auth requirements: `_bmad-output/planning-artifacts/prd.md` (FR69, FR70, FR71, FR72, FR73, FR80, FR81, FR82, NFR32)
- Provider posture and credential precedence: `_bmad-output/planning-artifacts/architecture.md` (OpenAI-compatible provider MVP, local auth file, env/auth/config precedence, auth state exposure)
- Provider/package structure: `_bmad-output/planning-artifacts/architecture.md` (`packages/providers/src`, auth boundary, provider capability profile)
- Reference posture: `_bmad-output/planning-artifacts/reference-repo-synthesis.md` (OpenAI-compatible provider/auth patterns, OAuth-ready architecture)

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm_config_cache=/tmp/sprite-npm-cache npm pack --dry-run`

### Completion Notes List

- Expanded config handling to support provider endpoint/auth fields while keeping bootstrap-facing startup state redacted.
- Added `@sprite/providers` with normalized provider state, auth source, capability metadata, auth-file loading, API-key precedence resolution, and an OpenAI-compatible provider adapter.
- Kept provider-specific auth and header construction behind the provider adapter contract while exposing only safe provider/auth/capability state to runtime consumers.
- Updated `AgentRuntime` bootstrap state to include active provider metadata and safe warning propagation without exposing secret values in output or state.
- Added deterministic provider resolution tests covering provider-config fallback, runtime-override precedence, auth-file precedence over environment values, malformed auth-file fallback, and capability metadata exposure.
- Extended CLI smoke tests so bootstrap output proves provider auth source and capability metadata are visible while secrets remain redacted.
- Updated README with the MVP provider setup path, precedence order, auth-file location, and safe configuration examples.
- Verified `npm run build`, `npm run typecheck`, `npm test`, and `npm pack --dry-run`.

### File List

- `_bmad-output/implementation-artifacts/1-3-configure-openai-compatible-provider-for-mvp-task-execution.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README.md`
- `package.json`
- `packages/config/package.json`
- `packages/config/src/config-loader.ts`
- `packages/config/src/config-schema.ts`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/tsconfig.json`
- `packages/providers/package.json`
- `packages/providers/src/index.ts`
- `packages/providers/src/provider-capabilities.ts`
- `packages/providers/src/provider-registry.ts`
- `packages/providers/src/openai-compatible-provider.ts`
- `packages/providers/src/auth/api-key-auth.ts`
- `packages/providers/src/auth/auth-store.ts`
- `packages/providers/tsconfig.json`
- `tests/cli-smoke.test.ts`
- `tests/provider-resolution.test.ts`
- `tsconfig.base.json`

### Change Log

- 2026-04-22: Created Story 1.3 with implementation context for OpenAI-compatible provider setup, credential precedence, and safe auth-state exposure.
- 2026-04-22: Implemented OpenAI-compatible provider bootstrap wiring, credential precedence, auth-file handling, redacted provider state exposure, tests, and documentation; moved story to review.
