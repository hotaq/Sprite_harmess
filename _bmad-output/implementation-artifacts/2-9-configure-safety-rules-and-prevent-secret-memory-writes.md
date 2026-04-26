# Story 2.9: Configure Safety Rules and Prevent Secret Memory Writes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want configurable safety and memory exclusion rules,
so that secrets and sensitive artifacts do not become durable memory or unsafe output.

## Acceptance Criteria

1. Given safety or memory exclusion rules are configured, when tool output, file content, command output, or learning material is evaluated, then matching secrets and sensitive artifacts are blocked or redacted before memory persistence, and the decision is auditable without exposing the secret value.
2. Given no custom exclusion rules exist, when the runtime evaluates memory or safety-sensitive content, then default exclusions prevent credentials, private keys, tokens, and `.env`-style values from being saved to memory, and the user can inspect or update the effective safety rules.

## Tasks / Subtasks

- [x] Add configurable safety rule schema and effective config resolution (AC: 1, 2)
  - [x] Extend `packages/config/src/config-schema.ts` with a bounded `safety`/memory-exclusion config shape.
  - [x] Model rules with stable IDs, action (`block` or `redact`), match target, reason, and non-secret pattern/path metadata.
  - [x] Merge global/project rules deterministically; project rules with the same ID should override global rules, while defaults always remain inspectable.
  - [x] Expose effective rules through startup/runtime config without exposing configured secret values.
- [x] Centralize secret/sensitive detection for runtime and memory use (AC: 1, 2)
  - [x] Move or wrap the current secret-like detector so `@sprite/core`, `@sprite/memory`, and future adapters reuse one implementation rather than duplicating patterns.
  - [x] Keep existing runtime event/file activity secret protections behavior-compatible.
  - [x] Preserve existing forbidden raw metadata fields for runtime events and policy/tool payloads.
- [x] Implement memory safety evaluation primitives (AC: 1, 2)
  - [x] Add `@sprite/memory` APIs for evaluating safety-sensitive content before candidate creation/persistence.
  - [x] Default exclusions must catch credential assignments, private keys, OpenAI-style `sk-` tokens, provider API-key variable names, `.env`-style paths, and common private-key/certificate paths.
  - [x] Return audit-safe decisions containing rule IDs, action, target, reason, and redacted previews only; never return matched secret text.
  - [x] Ensure blocked decisions do not produce memory candidates; redacted decisions only produce redacted candidate content.
- [x] Add runtime audit support for memory safety decisions (AC: 1, 2)
  - [x] Add metadata-only runtime events for memory/safety evaluation or memory-candidate decisions.
  - [x] Add an `AgentRuntime` API that evaluates a memory candidate with effective safety rules and emits the audit event.
  - [x] Ensure audit payloads reject raw content, command output, environment values, repository instructions, and secret-looking values.
  - [x] Keep this story scoped to in-memory/runtime APIs; durable session or memory persistence remains future Epic 3/4 work.
- [x] Update docs and tests (AC: 1, 2)
  - [x] Add config-loader tests for custom safety rules, malformed rules, and global/project precedence.
  - [x] Add memory package unit tests for default blocking, custom redaction, safe candidates, and audit-safe decision payloads.
  - [x] Add runtime event/AgentRuntime integration tests proving safety decisions are auditable without leaking secret values.
  - [x] Update README with effective safety-rule configuration, default exclusions, and current persistence limitations.
  - [x] Run `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test`, `rtk git diff --check`, targeted Prettier check, and GitNexus status/analyze fallback.

## Dev Notes

### Story Intent

Story 2.9 is the guardrail layer for future memory and learning work. The current code already prevents raw content from leaking into runtime events, policy decisions, file activity, and recovery records. This story should turn those scattered protections into configurable, inspectable safety rules that can be reused before any memory candidate becomes durable state.

Implement this slice:

- Configuration schema and effective-rule resolution for safety/memory exclusions.
- A shared secret/sensitive detector used by runtime event validation and memory candidate evaluation.
- Memory package primitives that block or redact unsafe candidate content before persistence.
- Runtime audit events/API so blocked or redacted memory decisions are visible without revealing the secret.
- Documentation and tests for default and custom rules.

Do not implement in this story:

- Durable session persistence or `.sprite/memory` file writes. Epic 3/4 own persisted session and memory artifacts.
- Review UI for memory candidates. Epic 4 owns review/edit/reject/accept workflows.
- Semantic/vector memory or embeddings.
- Provider-driven autonomous learning review generation beyond deterministic runtime APIs.
- New dependencies for secret scanning. Use TypeScript/Node primitives and bounded regular expressions.

### Source Requirements

- Story 2.9 requires configurable safety and memory exclusion rules. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.9]
- Matching secrets and sensitive artifacts must be blocked or redacted before memory persistence, and the decision must be auditable without exposing the secret value. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.9]
- Default exclusions must prevent credentials, private keys, tokens, and `.env`-style values from being saved to memory. [Source: `_bmad-output/planning-artifacts/epics.md` Story 2.9]
- PRD FR27 requires users to configure memory exclusion and safety rules. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD FR28 requires secrets and sensitive artifacts to be prevented from memory by default. [Source: `_bmad-output/planning-artifacts/prd.md` Sandbox, Approval, and Safety]
- PRD NFR23 requires memory changes to be part of the audit trail. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- PRD NFR26 requires memory entries to include provenance, confidence, type, timestamp, and source task. [Source: `_bmad-output/planning-artifacts/prd.md` Observability and Auditability]
- PRD NFR48 requires automated tests for memory filtering and secret exclusion behavior. [Source: `_bmad-output/planning-artifacts/prd.md` Maintainability and Testability]
- Architecture says memory must be typed, bounded, provenance-aware, confidence-scored, and filtered, preventing raw session history, secrets, large code chunks, or low-confidence assumptions from silently becoming long-term memory. [Source: `_bmad-output/planning-artifacts/architecture.md` Architectural Decision Pressure Points]
- Architecture maps memory/learning to `packages/memory` and local-first storage, but durable persistence is later scope. [Source: `_bmad-output/planning-artifacts/architecture.md` Requirements Coverage Validation]

### Previous Story Intelligence

Story 2.8 established recovery and metadata-only audit patterns:

- `task.recovery.recorded` events are schema-validated and metadata-only.
- Recovery events reject raw stdout/stderr, command output aliases, environment values, patch text, repository instructions, and secret-looking values.
- `AgentRuntime.recordRecoveryAction()` now validates trigger-specific source linkage before appending audit events.
- GitNexus CLI in this environment does not include `detect_changes`; use `rtk gitnexus status`, `rtk gitnexus analyze`, scoped diffs, and full tests as the fallback.

Story 2.7 established validation output handling:

- Validation command output is summarized through `ToolOutputSummary.reference`; raw stdout/stderr must not enter runtime events.
- Validation results include status, error code, output reference, validation ID, and tool call ID.

Story 2.6 and 2.4 established safety policy behavior:

- `packages/sandbox/src/policy-engine.ts` already rejects raw policy input fields and hides environment values in policy decisions.
- File edit policy denies `.env` and unsafe paths with stable rule IDs such as `file_edit.path.secret`.
- Approval edits for file edits must use `modifiedToolCall`; do not add a `modifiedRequest` file-edit path.

### Current Codebase State

Relevant files:

- `packages/config/src/config-schema.ts`: currently parses provider/output/sandbox/validation config; extend here for safety rules.
- `packages/config/src/config-loader.ts`: currently exposes `ResolvedStartupConfig`; extend effective safety-rule visibility here.
- `packages/config/src/precedence.ts`: currently merges nested config objects; update if rule merging needs ID-based behavior.
- `packages/core/src/file-activity.ts`: currently owns `containsSecretLikeValue()` and forbidden file-activity field detection.
- `packages/core/src/runtime-events.ts`: validates metadata-only runtime events and rejects raw output/content fields.
- `packages/core/src/agent-runtime.ts`: runtime-owned active task and event emission; add memory safety audit API here if audit events are runtime-owned.
- `packages/memory/src/index.ts`: currently empty placeholder; implement memory safety primitives here or in focused module files exported by this package.
- `tests/config-loader.test.ts`: add config parsing/precedence coverage.
- `tests/runtime-events.test.ts`: add audit event and runtime integration coverage.
- Add a new `tests/memory-*.test.ts` if memory package logic is substantial.

No `project-context.md` or UX design artifact was found.

### Suggested Contracts

Keep final names aligned with implementation, but preserve this behavior:

```ts
export type SafetyRuleAction = "block" | "redact";
export type SafetyRuleTarget =
  | "tool_output"
  | "file_content"
  | "command_output"
  | "learning_material"
  | "memory_candidate";

export interface SpriteSafetyRule {
  action: SafetyRuleAction;
  id: string;
  pattern?: string;
  pathPattern?: string;
  reason: string;
  targets: SafetyRuleTarget[];
}

export interface SafetyEvaluationDecision {
  action: "allow" | "block" | "redact";
  matchedRuleIds: string[];
  reason: string;
  redactedPreview: string;
  target: SafetyRuleTarget;
}
```

Runtime audit event shape should be metadata-only, for example:

```ts
"memory.safety.evaluated": {
  action: "allow" | "block" | "redact";
  matchedRuleIds: string[];
  reason: string;
  status: "recorded";
  summary: string;
  target: SafetyRuleTarget;
}
```

Do not include:

- raw candidate content
- matched secret text
- stdout/stderr bodies
- command output bodies
- raw file content
- raw environment values
- repository instructions or prompt text

### Runtime Behavior Requirements

- Default rules must always be present and inspectable even when no config files exist.
- Custom rules must be parsed from global/project config with validation errors reported as config warnings, not crashes.
- A matching `block` rule must prevent memory candidate creation.
- A matching `redact` rule may produce candidate content only after replacing sensitive spans with a fixed marker such as `[REDACTED]`.
- Audit decisions must be append-only runtime events when routed through `AgentRuntime`.
- Safe content should be allowed and produce an audit-safe allowed decision.
- The same detector should protect runtime event summaries and memory candidate content to avoid future drift.
- Follow existing Result/SpriteError patterns; do not throw from public runtime/memory APIs except config parsing internals already do so behind loader warnings.

### Testing Requirements

Minimum coverage:

- `resolveStartupConfig()` returns default safety rules when no config exists.
- Malformed custom safety rules produce a warning and fall back safely.
- Global/project safety rule precedence is deterministic and inspectable.
- Default memory safety blocks credential assignments, `sk-` tokens, private keys, `.env` paths, and private key/certificate paths.
- Custom redaction rules replace matched content without returning the raw match.
- Safe memory candidates produce provenance/confidence/type metadata and no block.
- Blocked memory candidates do not produce durable candidate content.
- Runtime audit events for safety decisions pass validation and do not include secret-looking values.
- Runtime event validators reject memory/safety audit payloads containing raw output/content fields.
- Existing runtime-events, config-loader, policy-engine, tool-registry, and cli-smoke tests remain green.

## Dev Agent Record

### Agent Model Used

Codex

### Debug Log References

- 2026-04-26: Created Story 2.9 context after Story 2.8 reached done.
- 2026-04-26: Used `rtk omx explore` and `rtk gitnexus query -r Sprite_harmess "secret memory exclusion safety rules config"` to map current config, secret, runtime event, policy, and memory-placeholder surfaces.
- 2026-04-26: Started implementation after GitNexus impact analysis flagged CRITICAL blast radius for config startup/runtime symbols; scope is additive/backward-compatible with full validation required.
- 2026-04-26: Implemented safety config, shared sensitive detection, memory candidate evaluation, runtime audit events, README docs, and regression tests.
- 2026-04-26: Validation passed: `rtk npm run build`, `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm test` (132 tests), `rtk git diff --check`, targeted Prettier check, `rtk gitnexus status`, and `rtk gitnexus analyze`.

### Completion Notes List

- Added bounded `safety.rules` config with stable IDs, `block`/`redact` actions, targets, pattern/path metadata, secret-looking metadata rejection, default safety exclusions, and deterministic ID-based rule precedence.
- Centralized secret-like detection/redaction in `@sprite/shared` while preserving `@sprite/core` file-activity/runtime event protections.
- Implemented `@sprite/memory` runtime-local candidate safety evaluation that blocks unsafe candidates, redacts allowed custom matches, and returns audit-safe decisions only.
- Added `memory.safety.evaluated` runtime events and `AgentRuntime.evaluateMemoryCandidateSafety()` so memory decisions are visible without leaking raw candidate content.
- Documented effective safety rules and current persistence limitations in README.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-9-configure-safety-rules-and-prevent-secret-memory-writes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `packages/config/src/config-loader.ts`
- `packages/config/src/config-schema.ts`
- `packages/config/src/precedence.ts`
- `packages/config/tsconfig.json`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/file-activity.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/tsconfig.json`
- `packages/memory/package.json`
- `packages/memory/src/index.ts`
- `packages/memory/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/sensitive.ts`
- `tests/config-loader.test.ts`
- `tests/memory-safety.test.ts`
- `tests/runtime-events.test.ts`
- `tsconfig.base.json`

## Change Log

| Date       | Version | Description                                                                        | Author |
| ---------- | ------- | ---------------------------------------------------------------------------------- | ------ |
| 2026-04-26 | 0.1     | Created Story 2.9 implementation context.                                          | Codex  |
| 2026-04-26 | 1.0     | Implemented safety rules, memory filtering, runtime audit events, docs, and tests. | Codex  |

## QA Results

Implementation complete and ready for review. Full validation passed with 132 tests.
