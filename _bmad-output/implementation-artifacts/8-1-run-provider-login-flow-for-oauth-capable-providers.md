# Story 8.1: Run Provider Login Flow for OAuth-Capable Providers

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to run a provider login flow when a provider requires OAuth or subscription-based authorization,
so that Sprite Harness can support providers beyond API-key usage without changing the runtime loop.

## Acceptance Criteria

1. A provider login command/interface exists for configured providers that support OAuth or subscription-style login, and it starts the provider-specific auth flow through a provider auth interface rather than through the agent task loop.
2. Providers that do not support interactive login return a structured explanation with a safe `nextAction`, including API-key or provider-specific configuration guidance where applicable.
3. Login flow results expose only non-secret auth state: provider name, auth mode, status, source, recoverability, warnings, and next action. Raw tokens, API keys, refresh tokens, auth headers, local private paths, and callback secrets are never printed.
4. The existing OpenAI-compatible API-key provider remains backward-compatible: API-key resolution precedence continues to work, and requesting interactive login for an API-key-only provider returns the unsupported-login path rather than changing runtime credentials.
5. Provider auth behavior is implemented behind provider/auth modules and/or provider registry interfaces. `AgentRuntime` task execution must not contain provider-specific OAuth control flow.
6. CLI behavior is deterministic and testable without opening a real browser, performing network calls, or requiring real provider credentials. Stub/test providers may be used for supported-login contract coverage.
7. Errors use safe structured codes and `nextAction` hints, with secret-like values redacted from messages, warnings, JSON output, and tests.
8. Existing provider resolution, CLI smoke, runtime, TUI, and RPC behavior remains backward-compatible.
9. Contract tests cover supported-login delegation, unsupported-login explanation, secret/path redaction, API-key provider compatibility, structured error shape, and CLI output purity for text/json modes as applicable.

## Tasks / Subtasks

- [ ] Confirm Story 8.1 scope and implementation surfaces. (AC: 1-9)
  - [ ] Read this story, Epic 8 requirements, PRD provider/auth requirements, architecture provider/config sections, Epic 7 retrospective action items, and existing provider/auth implementation.
  - [ ] Inspect `packages/providers/src/provider-capabilities.ts`, `packages/providers/src/provider-registry.ts`, `packages/providers/src/auth/api-key-auth.ts`, `packages/providers/src/auth/auth-store.ts`, `packages/providers/src/openai-compatible-provider.ts`, `packages/cli/src/index.ts`, provider resolution tests, and CLI smoke tests.
  - [ ] Run required GitNexus impact checks before editing provider/auth/CLI symbols; report HIGH/CRITICAL blast radius before code changes.
  - [ ] Keep scope to provider login flow only; do not implement logout, credential permission hardening, refresh, full auth-mode inspection, effective config inspection, or real network OAuth provider integrations unless already available behind testable provider modules.

- [ ] Define provider auth/login contracts. (AC: 1-7)
  - [ ] Add a provider-auth interface for interactive login capability detection and login execution.
  - [ ] Represent supported, unsupported, and failed login outcomes with structured safe result types.
  - [ ] Include non-secret fields only: provider name, auth mode, status, source, recoverability, warnings, and next action.
  - [ ] Define stable safe error codes such as `LOGIN_UNSUPPORTED`, `LOGIN_FAILED`, and `INVALID_PROVIDER` where needed.
  - [ ] Ensure unsupported providers can suggest API-key/environment/auth-file configuration without echoing secret values or private paths.

- [ ] Implement provider-side login handling. (AC: 1-6)
  - [ ] Keep OAuth/subscription-specific behavior behind provider auth modules or provider adapter/registry interfaces.
  - [ ] Preserve OpenAI-compatible API-key provider behavior and return unsupported-login guidance for interactive login requests.
  - [ ] Add a deterministic test/stub provider path if needed to validate supported-login delegation without network/browser dependencies.
  - [ ] Avoid adding new dependencies unless explicitly approved.

- [ ] Expose login through CLI. (AC: 1-4, 6-8)
  - [ ] Add a user-facing provider login command or equivalent CLI surface consistent with existing command style.
  - [ ] Support safe text output and JSON output if this CLI area already uses output-format patterns.
  - [ ] Ensure unsupported-login output is actionable and non-fatal where appropriate.
  - [ ] Ensure stdout/stderr behavior stays deterministic and does not leak diagnostics into machine-readable output.

- [ ] Add tests. (AC: 1-9)
  - [ ] Provider/auth unit tests for supported-login delegation and unsupported-login result shape.
  - [ ] API-key provider compatibility tests proving existing resolution precedence remains unchanged.
  - [ ] CLI tests for unsupported login and, if stubbed, supported login without browser/network side effects.
  - [ ] Redaction tests for secret-like token/API-key/header/path values in results, warnings, errors, text output, and JSON output.
  - [ ] Backward-compatibility tests for existing provider resolution and relevant CLI smoke behavior.

- [ ] Validate and update story status during implementation. (AC: 8-9)
  - [ ] Before code edits, run targeted GitNexus impact checks and record blast radius in the Dev Agent Record.
  - [ ] Run targeted validation for provider/auth and CLI tests touched by this story.
  - [ ] Run full validation: `npm run typecheck`, `npm run lint`, and `npm test`.
  - [ ] Run Story-scoped `git diff --check` for touched files; document any unrelated pre-existing workspace issues separately.
  - [ ] Run GitNexus analyze/status fallback before commit if `gitnexus_detect_changes()` is unavailable.
  - [ ] Move story to `review` only after implementation and tests pass.

## Dev Notes

### Story Intent

Story 8.1 starts Epic 8 by adding an auth-login seam for providers that require OAuth or subscription-style authorization. The goal is not to implement every provider's real OAuth flow at once; the goal is to create the safe interface, CLI behavior, unsupported-provider path, and deterministic tests so later Epic 8 stories can add logout, credential permission hardening, refresh, auth-mode distinction, and effective configuration inspection.

### Source Requirements

- Epic 8 objective: users can manage advanced provider auth, logout/refresh credentials, inspect auth state without secret leakage, distinguish auth modes, and inspect effective configuration.
- FR74: users can run a login flow for providers that require OAuth or subscription-based authorization.
- FR79: the system can support an OAuth authorization-code provider flow for providers that require it.
- FR81/FR82 context: auth state must be exposed without secret values and must distinguish intended provider auth modes.
- Epic 7 retrospective action items: inventory provider/auth/config code, write RED unsupported-login tests first, add secret/path redaction fixtures, keep auth provider modules separate from `AgentRuntime`, and continue GitNexus impact checks.

### Existing Code and Reuse Targets

- `packages/providers/src/provider-capabilities.ts`: currently defines provider auth state and provider adapter shape. Likely location for auth-mode/auth-state type extension or a sibling provider-auth contract.
- `packages/providers/src/auth/api-key-auth.ts`: resolves API-key credentials from runtime override, auth file, environment, and provider config. Must remain backward-compatible.
- `packages/providers/src/auth/auth-store.ts`: current auth-file path and API-key file loading helpers. Later stories will expand storage and permission handling; Story 8.1 should avoid broad credential-store changes unless needed for the login result contract.
- `packages/providers/src/provider-registry.ts`: initializes OpenAI-compatible providers and returns unsupported-provider warnings. Likely seam for login capability routing.
- `packages/providers/src/openai-compatible-provider.ts`: existing provider adapter implementation for API-key behavior.
- `packages/cli/src/index.ts`: existing command registration and output helpers. Add login command here while preserving existing CLI behavior.
- `tests/provider-resolution.test.ts`: existing API-key precedence and redaction tests. Extend or add adjacent tests.
- `tests/cli-smoke.test.ts`: likely CLI command coverage surface.

### Previous Epic Intelligence

- Epic 7 established safe structured errors, `nextAction` hints, redaction rules, and adapter-boundary discipline.
- Provider/model metadata has already been exposed safely in RPC and TUI by selecting explicit non-secret fields rather than spreading provider state.
- Story 7.7 showed that high-blast-radius core runtime symbols should be avoided when an adapter/provider sidecar can satisfy the contract.

### Critical Implementation Hazards

1. **Secret leakage.** Auth work can involve API keys, OAuth access tokens, refresh tokens, bearer headers, device codes, callback URLs, auth-file paths, and local home paths. Tests must intentionally include secret-like fixtures and assert they do not appear in output.
2. **Runtime boundary drift.** OAuth flow orchestration belongs behind provider auth modules/interfaces, not inside `AgentRuntime`'s task loop.
3. **Network/browser nondeterminism.** Tests must not open real browsers, call real provider endpoints, or require live credentials. Use stubs/fakes for supported-login paths.
4. **Breaking API-key MVP behavior.** Existing OpenAI-compatible API-key resolution is already implemented and tested. Interactive login must not change precedence or credential resolution.
5. **Overbuilding future stories.** Logout, refresh, permission hardening, auth-mode listing, and effective-config inspection are separate Epic 8 stories.
6. **Unrelated workspace changes.** The working tree currently contains unrelated `.codex/` and `_bmad/` changes outside BMAD output. Keep Story 8.1 commits scoped.

### Recommended CLI Shape

Exact command naming should follow the existing CLI style after inspecting `packages/cli/src/index.ts`. A likely shape is:

```bash
sprite provider login --provider openai-compatible
sprite provider login --provider test-oauth --output json
```

or, if existing command grouping favors auth-first naming:

```bash
sprite auth login --provider openai-compatible
```

The implementation should choose the shape that best matches the current Commander command tree and document the chosen surface in the Dev Agent Record.

### Recommended Result Shape

```ts
interface ProviderLoginResult {
  ok: boolean;
  providerName: string;
  authMode: "api-key" | "oauth-authorization-code" | "subscription-oauth" | "unsupported";
  status: "started" | "unsupported" | "failed";
  recoverable: boolean;
  nextAction: string;
  warnings: string[];
}
```

Never include raw tokens, API keys, auth headers, callback secrets, or absolute private credential paths in this result.

## Testing Requirements

- Use RED-GREEN workflow for at least the unsupported-login path and API-key backward compatibility.
- Add targeted provider/auth unit tests before implementation where possible.
- Add CLI tests that run without live network or browser dependencies.
- Include explicit redaction fixtures for:
  - API-key-looking strings (`sk-...`),
  - bearer-token-looking strings,
  - refresh-token-looking strings,
  - callback URLs with query secrets,
  - auth-file/private home paths.
- Run targeted tests first, then full validation.

## Dev Agent Record

### Agent Model Used

(To be filled by dev agent)

### Debug Log References

(To be filled by dev agent)

### Completion Notes List

(To be filled by dev agent)

### File List

(To be filled by dev agent)

## Change Log

- 2026-05-31: Created Story 8.1 implementation artifact following Epic 8 transition from completed Epic 7.
