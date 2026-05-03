---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
lastStep: step-04-generate-tests
lastSaved: 2026-05-03
storyId: 3.3
storyKey: 3-3-resume-previous-sessions
storyFile: _bmad-output/implementation-artifacts/3-3-resume-previous-sessions.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-3-resume-previous-sessions.md
generatedTestFiles:
  - tests/runtime-events.test.ts
  - tests/session-store.test.ts
  - tests/session-persistence.test.ts
  - tests/cli-smoke.test.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/3-3-resume-previous-sessions.md
---

# ATDD Checklist: Story 3.3 Resume Previous Sessions

## Context

- Stack: backend TypeScript package workspace with Vitest.
- Generation mode: AI-generated red-phase tests; no browser recording needed.
- Scope: acceptance tests only. Implementation code remains untouched so the user can write it manually.

## Acceptance Criteria Coverage

### AC1: Resume readable session store

- Runtime event contract validates metadata-only `session.resumed` events and rejects raw output/payload dumps, secret-looking summaries, and negative restored event counts.
- Storage exposes a resume read path that returns full parsed event history while keeping `readSessionArtifacts()` display limits bounded.
- Runtime resumes an existing session conservatively, appends `session.resumed`, updates `state.json`, and restores event history for adapters.
- CLI `sprite resume <session-id> --output json` returns redacted, bounded resume information.

### AC2: Missing/unreadable sessions fail safely

- Storage resume read rejects invalid/missing sessions without creating artifacts.
- Runtime resume returns structured `SESSION_NOT_FOUND` for missing sessions.
- CLI resume exits non-zero for invalid/missing sessions and does not create session directories.

## Red Phase Expectations

These tests are expected to fail before implementation because the codebase does not yet expose:

- `session.resumed` runtime event type and validator case.
- `readSessionForResume(cwd, sessionId)` in `@sprite/storage`.
- `AgentRuntime.resumeSession(sessionId)` in `@sprite/core`.
- `sprite resume <session-id>` CLI command.
