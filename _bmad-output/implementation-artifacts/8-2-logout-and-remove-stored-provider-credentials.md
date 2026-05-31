# Story 8.2: Logout and Remove Stored Provider Credentials

Status: review

## Story

As a developer,
I want to remove stored provider credentials,
So that I can revoke or reset local provider access.

## Acceptance Criteria

1. Given provider credentials are stored locally, when the user runs logout for that provider, Sprite Harness removes or invalidates the stored credential record.
2. Given stored credentials were removed, later auth state shows the provider as logged out from local stored-auth state without exposing prior secret values.
3. Given logout is requested for a provider with no stored credentials, the command returns a non-fatal status explaining there was nothing to remove.
4. Logout output must not expose prior API keys, OAuth tokens, auth headers, callback secrets, or private credential paths.
5. Logout must support safe text output and pure JSON output for automation.
6. Logout must not delete or mutate environment variables, project config, or global provider config; it only removes Sprite-managed stored credential records.
7. Provider-specific OAuth logout/revoke behavior must stay behind provider auth modules rather than AgentRuntime.

## Tasks / Subtasks

- [x] Confirm Story 8.2 scope and implementation surfaces. (AC: 1-7)
  - [x] Read Epic 8 Story 8.2 requirements from planning artifacts.
  - [x] Inspect existing auth store, provider login seam, provider exports, and CLI command tree.
  - [x] Run GitNexus impact analysis before editing provider/CLI symbols.
- [x] Add RED logout tests before production code. (AC: 1-6)
  - [x] Provider-level test removes stored API-key auth file and redacts removed secrets/paths.
  - [x] Provider-level no-op test returns non-fatal nothing-to-remove status.
  - [x] CLI text output test removes stored auth file without leaking secrets/paths.
  - [x] CLI JSON output test is pure JSON and safe when nothing is stored.
- [x] Implement provider logout seam. (AC: 1-7)
  - [x] Add auth-store primitive to remove provider auth file safely.
  - [x] Add provider logout result contract with statuses for removed/not-found/failed.
  - [x] Delegate provider-specific OAuth logout through auth modules when supplied.
  - [x] Keep API-key providers on local stored-credential removal only.
  - [x] Reuse shared redaction for provider name, warnings, next action, and paths.
- [x] Add CLI command. (AC: 3-6)
  - [x] Add `sprite provider logout` with optional `--provider <name>` and `--output text|json`.
  - [x] Keep stdout pure for JSON and avoid stderr on non-fatal no-op.
- [x] Verify and document. (AC: 1-7)
  - [x] Run targeted RED/GREEN tests and record evidence.
  - [x] Run `npm run typecheck`, `npm run lint`, and `npm test`.
  - [x] Update story Dev Agent Record and sprint status.

## Dev Notes

- Story 8.1 added `runProviderLogin` and `sprite provider login`; mirror its boundary decisions.
- Do not put logout logic in `AgentRuntime` or the task loop.
- API-key logout means deleting Sprite-managed auth-store files only. Environment variables and config files remain untouched.
- Story 8.3 owns file permission hardening; do not expand this story into chmod/directory permission work except preserving current behavior.
- Story 8.4 owns refresh/revoke details; provider-specific OAuth revocation can be represented by auth-module delegation but should remain deterministic in tests.

## Testing Requirements

- Use TDD: add failing tests before production code.
- Targeted tests:
  - `npm test -- --run tests/provider-resolution.test.ts tests/cli-smoke.test.ts`
- Full validation:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`

## Dev Agent Record

### Agent Model Used

GPT-5.5 via Hermes Agent CLI.

### Debug Log References

- GitNexus pre-edit impact checks after `npx gitnexus analyze`:
  - `resolveProviderAuthFilePath`: LOW, 2 impacted, auth module only.
  - `runProviderLogin`: LOW, 1 impacted test file.
  - `createProgram`: LOW, 2 impacted, CLI command construction only.
- RED targeted validation: `npm test -- --run tests/provider-resolution.test.ts tests/cli-smoke.test.ts` failed with missing `runProviderLogout` export/function and missing `provider logout` CLI command, proving the 8.2 tests exercised absent behavior.
- GREEN targeted validation: `npm test -- --run tests/provider-resolution.test.ts tests/cli-smoke.test.ts` passed 50/50 tests.
- Full validation: `npm run typecheck && npm run lint && npm test` passed; full suite 28 files / 464 tests.

### Completion Notes List

- Added `runProviderLogout` provider-auth seam with structured removed/not-found/failed statuses.
- Added auth-store removal primitive for Sprite-managed auth files.
- API-key logout removes only local Sprite auth-store files; environment variables and provider config remain untouched.
- Added provider auth-module delegation for future OAuth/subscription logout without adding auth behavior to `AgentRuntime`.
- Added `sprite provider logout` text/JSON CLI output with redaction and non-fatal no-op behavior.
- Added provider and CLI regression tests for removal, not-found no-op, OAuth delegation, safe output, and JSON purity.

### File List

- `packages/providers/src/auth/auth-store.ts`
- `packages/providers/src/auth/provider-logout.ts`
- `packages/providers/src/index.ts`
- `packages/cli/src/index.ts`
- `tests/provider-resolution.test.ts`
- `tests/cli-smoke.test.ts`
- `_bmad-output/implementation-artifacts/8-2-logout-and-remove-stored-provider-credentials.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-05-31: Created Story 8.2 implementation artifact and moved story to in-progress.
- 2026-05-31: Implemented provider logout seam and CLI command; moved story to review after targeted and full validation passed.
