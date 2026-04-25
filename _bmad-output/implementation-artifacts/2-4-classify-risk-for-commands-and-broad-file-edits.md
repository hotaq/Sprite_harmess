# Story 2.4: Classify Risk for Commands and Broad File Edits

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want risky commands and broad edits to be classified before execution,
so that unsafe actions require explicit review.

## Acceptance Criteria

1. Given the agent requests command execution or a broad file edit, when the policy engine evaluates the request, then it classifies the action by risk level and returns allow, deny, require approval, or modify decision.
2. Given repository content or tool output suggests bypassing safety rules, when policy evaluates the request, then runtime/system policy wins over repository-provided instructions and the decision is recorded with reason and correlation ID.

## Tasks / Subtasks

- [x] Add a deterministic policy/risk classification module (AC: 1, 2)
  - [x] Implement the classifier under `packages/sandbox/src/` and export it from `packages/sandbox/src/index.ts`.
  - [x] Add `@sprite/shared` as a `packages/sandbox` dependency if the classifier uses `Result`, `ok`, `err`, or `SpriteError`.
  - [x] Define explicit request and result types for command requests and file edit requests.
  - [x] Use a stable decision shape with `action`, `riskLevel`, `reason`, `ruleId`, optional `modifiedRequest`, and optional `approvalSummary`.
  - [x] Expose a public classification entrypoint that accepts unknown or otherwise untrusted input, validates and narrows it before classification, rejects forbidden raw fields before constructing a decision, and returns `Result<PolicyDecision, SpriteError>` failures instead of throwing.
  - [x] Keep classification pure and deterministic: no file writes, no command execution, no process environment reads, no network calls, and no third-party parser dependency.
- [x] Classify command execution requests (AC: 1, 2)
  - [x] Prefer a structured command contract such as `{ command: string; args: string[]; cwd: string; timeoutMs?: number; env?: Record<string, string> }`; do not require shell-string parsing for MVP.
  - [x] Allow low-risk read-only commands only when bounded by cwd and timeout defaults; validation-like package-manager commands may be allowed only when explicitly identified as configured validation commands and still have no custom env, shell interpreter, install/network behavior, force flags, or broad write indicators.
  - [x] Require approval for commands that mutate project state, install dependencies, run package scripts with write potential, expose custom environment values, or use elevated risk flags.
  - [x] Require approval for arbitrary package manager scripts (`npm run <unknown>`, `pnpm run <unknown>`, `yarn <unknown>`), direct package execution (`npx`, `pnpm dlx`, `yarn dlx`, `npm exec`), network commands, file-writing commands, and shell interpreters unless a later story adds narrower configuration.
  - [x] Deny clearly destructive or sandbox-escaping command families such as `sudo`, `su`, `chmod 777`, `chown`, disk formatting, root-targeted deletion, path traversal outside cwd, and shell pipeline download execution.
  - [x] Return `modify` only when the safer request is unambiguous and lossless, primarily adding or reducing a timeout to the supported bound; custom env exposure should require approval by default rather than being silently removed.
- [x] Classify file edit requests and broad edits (AC: 1, 2)
  - [x] Recognize targeted patch requests from Story 2.3 as the low-risk baseline when they use safe project-relative affected files and bounded file counts.
  - [x] Require approval for broad edit indicators: many affected files, directory/glob mutation, generated unknown patch scope, full-file rewrite, deletion, rename, or package/config file mutation.
  - [x] Treat package/config mutations as approval-required when affected paths include `package.json`, lockfiles, workspace files, `tsconfig*.json`, tool config files, CI files, `.npmrc`, `.env*`, provider/auth-looking files, or other project policy/config artifacts.
  - [x] Deny unsafe paths: absolute paths, `..` traversal, empty paths, paths outside cwd, and attempts to write runtime/state/secret-looking artifacts.
  - [x] Keep raw `oldText`, `newText`, patch hunks, diff bodies, command stdout, and repository-provided instructions out of policy decision summaries and events.
  - [x] Do not change `apply_patch` behavior in this story except optional classification helpers; approval enforcement is Story 2.6.
- [x] Add runtime audit event support for policy decisions (AC: 2)
  - [x] Add a schema-validated runtime event, recommended name `policy.decision.recorded`, in `packages/core/src/runtime-events.ts`.
  - [x] Include stable base fields: `schemaVersion`, `eventId`, `sessionId`, `taskId`, `correlationId`, `createdAt`, `type`, and `payload`.
  - [x] Payload should include `requestType`, `action`, `riskLevel`, `reason`, `ruleId`, and metadata-only command/edit summary fields; command decisions should include the working directory (`cwd`) or an equivalent sanitized working-directory summary for audit and later approval request creation.
  - [x] Reject unsafe paths, raw content, raw patch/diff/hunk fields, secret-looking reason or summary values, and repository/tool-output attempts to override policy.
  - [x] Use policy-specific recursive forbidden-field validation, or carefully extend shared helpers, so policy events reject `content`, `rawContent`, `oldText`, `newText`, `patch`, `diff`, `hunk`, `snippet`, `snippets`, `rawSnippet`, `query`, `stdout`, `stderr`, `env`, and `repositoryInstruction` without regressing existing tool/file event validation.
  - [x] Preserve event bus clone semantics so subscriber mutations cannot alter canonical policy history.
- [x] Add runtime API for policy classification without executing actions (AC: 1, 2)
  - [x] Add an `AgentRuntime` method, such as `classifyPolicyRequest()`, that invokes the sandbox classifier and emits `policy.decision.recorded`.
  - [x] Attach the active task's existing correlation ID to the decision and event.
  - [x] Accept untrusted input at the runtime boundary, validate it before calling classifier internals, and return structured failures instead of throwing for malformed requests.
  - [x] Do not wire command execution, sandbox runner, approval prompts, provider-driven automatic tool use, or `executeToolCall()` enforcement in this story; existing Story 2.3 tool execution behavior and tests must remain compatible until Story 2.6 adds enforcement.
- [x] Add deterministic tests (AC: 1, 2)
  - [x] Add sandbox classifier tests for allow, deny, require approval, and modify decisions.
  - [x] Add command risk tests for read-only commands, narrowly configured validation commands, arbitrary package scripts, direct package execution, dependency install commands, destructive commands, missing/excessive timeout, custom env exposure, and shell download execution patterns.
  - [x] Add file edit risk tests for targeted patch, broad multi-file edit, glob/directory mutation, deletion/rename/full-file rewrite, package/config mutation path patterns, and unsafe paths.
  - [x] Add malformed public-input tests proving unknown/untrusted classifier and runtime inputs return `Result` failures instead of throwing or being unsafely cast.
  - [x] Add repository-instruction override tests proving untrusted repository/tool output cannot lower risk.
  - [x] Add runtime event validation tests for `policy.decision.recorded`, including rejection of raw content, raw patch fields, unsafe paths, and secret-looking summaries.
  - [x] Add runtime integration tests proving classification emits a policy decision event with the active task correlation ID and does not execute or mutate anything.
  - [x] Add regression tests proving `AgentRuntime.executeToolCall(apply_patch)` still emits Story 2.3 file-edit events and is not policy-gated until approval enforcement is implemented in Story 2.6.
- [x] Update docs and validation records (AC: 1, 2)
  - [x] Update README only for implemented classification behavior and current limitations.
  - [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`, and targeted Prettier check for touched source, tests, README, and story files.
  - [x] Record validation commands and key implementation notes in the Dev Agent Record before moving the story to review.

### Review Findings

- [x] [Review][Patch] Configured validation scripts allow force/write-like flags without approval [packages/sandbox/src/policy-engine.ts:420]
- [x] [Review][Patch] Shell-interpreter download pipelines are approval-gated instead of denied [packages/sandbox/src/policy-engine.ts:805]
- [x] [Review][Patch] Targeted file edits with glob or directory-looking paths are allowed [packages/sandbox/src/policy-engine.ts:845]
- [x] [Review][Patch] Root `.github/workflows` files are not treated as CI/config mutations [packages/sandbox/src/policy-engine.ts:881]

## Dev Notes

### Story Intent

Story 2.4 adds the safety decision layer that sits before command execution and broad edit application. The goal is a deterministic policy classifier and audit path, not a full approval system. Later stories will use this decision output:

- Story 2.5 executes allowed commands through `SandboxRunner`.
- Story 2.6 creates approval requests and handles approve, deny, modify, or timeout responses.
- Story 2.7 routes validation commands through policy and sandbox.
- Story 2.8 turns denied or failed actions into recovery observations.

This story covers FR16, FR23, and FR24: classify command and file-edit requests, keep runtime/system policy above repository content, and record decisions for audit.

### Source Requirements

- Epic 2 objective: users can inspect, search, patch, validate, and recover on real repositories while risky commands and broad edits go through sandbox/approval.
- PRD MVP scope lists initial tools including `run_command` and states command execution must be sandboxed with cwd boundary, timeout, environment control, and approval for risky commands.
- PRD NFR7-NFR9 require sandbox boundaries, approval for risky/destructive commands, and approval for broad/risky file edits.
- PRD NFR13 requires repository content to be treated as untrusted input and unable to override runtime/system safety policy.
- PRD NFR23-NFR24 require inspectable audit trails and final summaries that identify changed files, commands run, validation results, and unresolved risks when available.
- PRD NFR31 defines future approval request metadata: request ID, request type, command or edit summary, working directory, affected files when known, risk level, reason, environment exposure summary, timeout, allowed actions, and correlation ID.
- Architecture says sandbox, approvals, memory exclusions, context trust boundaries, and RPC scopes are cross-interface policy concerns, not adapter-specific logic.
- Architecture module boundaries place sandbox, approval, and safety under `packages/sandbox` plus runtime policy ports. CLI, TUI, print, and RPC must not bypass this policy boundary.
- Runtime events are the spine for UI, NDJSON, RPC, storage, audit, and tests. Policy decisions must be metadata-only, schema-validated runtime events.

### Previous Story Intelligence

Story 2.3 established patch-based file editing:

- `packages/tools/src/apply-patch.ts` implements strict targeted replacements with `edits: [{ path, oldText, newText }]`.
- `apply_patch` validates all edits before writing, rejects unsafe paths, rejects binary files, rejects missing/ambiguous/no-op replacements, and returns metadata-only `affectedFiles`.
- `AgentRuntime.executeToolCall()` emits tool lifecycle events, `file.edit.requested`, `file.edit.applied`, `file.edit.failed`, and changed file activity for successful patch application.
- Runtime file edit events and file activity records reject raw `oldText`, `newText`, `patch`, `diff`, `hunk`, snippets, unsafe paths, and secret-looking summaries.
- Code review fixed malformed runtime patch input by validating edit path shape before emitting file edit metadata.

Use these patterns directly:

- Return `Result<..., SpriteError>` for expected validation failures.
- Emit metadata-only events through `createRuntimeEventRecord()` and `RuntimeEventBus`.
- Keep raw repository, command, and patch content out of runtime events and summaries.
- Add tests before implementation for event validation and runtime integration.

### Current Codebase State

Relevant existing files:

- `packages/sandbox/src/index.ts` currently only exports `{}`. This is the intended home for the classifier.
- `packages/sandbox/package.json` currently lacks `exports`, `types`, and dependencies. Add them if the classifier becomes imported by tests or `@sprite/core`.
- `packages/core/package.json` currently depends on `@sprite/config`, `@sprite/providers`, `@sprite/shared`, and `@sprite/tools`. Add `@sprite/sandbox` only if `AgentRuntime` imports the classifier directly.
- `packages/core/src/runtime-events.ts` owns event schemas, validation, cloning, and event bus behavior.
- `packages/core/src/agent-runtime.ts` owns active task state, event emission, tool execution, and file activity append logic.
- `packages/core/src/file-activity.ts` owns safe project-relative path validation, secret-looking summary detection, and forbidden raw metadata field detection.
- `packages/tools/src/path-boundary.ts` provides project boundary helpers for filesystem tools. For policy classification, do not inspect the filesystem unless a later story requires it; validate path shape deterministically.
- `tests/runtime-events.test.ts` is the current home for runtime event validation and runtime event integration tests.
- Add sandbox-specific tests under `tests/` unless a dedicated `packages/sandbox` test pattern is introduced.
- Story validation report exists at `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits-validation-report-2026-04-24.md`; apply its precision fixes before implementation.

### Suggested Policy Contract

Use a narrow, typed contract so later approval and sandbox stories can reuse it.

```ts
export type PolicyRequestType = "command" | "file_edit";
export type PolicyAction = "allow" | "deny" | "modify" | "require_approval";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface CommandPolicyRequest {
  args?: string[];
  command: string;
  configuredValidation?: boolean;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  type: "command";
}

export interface FileEditPolicyRequest {
  affectedFiles: string[];
  editKind:
    | "broad_edit"
    | "delete"
    | "full_file_write"
    | "rename"
    | "targeted_patch";
  summary?: string;
  type: "file_edit";
}

export type PolicyRequest = CommandPolicyRequest | FileEditPolicyRequest;

export interface PolicyDecision {
  action: PolicyAction;
  approvalSummary?: string;
  modifiedRequest?: PolicyRequest;
  reason: string;
  riskLevel: RiskLevel;
  ruleId: string;
}
```

Do not expose only typed APIs that trust the caller. Public classifier/runtime entrypoints should accept `unknown` or another untrusted input shape, validate and narrow it to `PolicyRequest`, reject forbidden raw fields before constructing a decision, and return `Result<PolicyDecision, SpriteError>` for malformed input instead of throwing.

Do not include raw command output, raw patch bodies, old text, new text, snippets, environment values, or repository-provided instructions in `PolicyDecision`.

### Recommended MVP Rules

Command classification:

- `allow`: safe inspection commands (`pwd`, `ls`, `git status`, `git diff`, `git log`) when cwd and timeout are bounded. Validation-like package-manager commands may be allowed only when metadata explicitly identifies them as configured validation commands and they have no custom env, install behavior, network behavior, shell interpreter, force flags, or broad write indicators.
- `modify`: request is otherwise safe but lacks a timeout or uses a timeout above the supported maximum; return the same request with the bounded timeout. Avoid silent semantic changes. Custom env exposure should require approval by default rather than being removed as a `modify` shortcut.
- `require_approval`: package installs, dependency mutations, direct package execution (`npx`, `npm exec`, `pnpm dlx`, `yarn dlx`), package manager scripts with unknown side effects, shell interpreters, commands with custom env exposure, file-writing commands, network commands, and commands with force flags.
- `deny`: privilege escalation, root-targeted deletion, disk formatting, ownership/permission broad changes, shell download execution (`curl ... | sh`, `wget ... | sh`), attempts to escape cwd, and command strings that require shell parsing to understand safety.

File edit classification:

- `allow`: targeted patch metadata with safe project-relative affected files and a small bounded file count.
- `require_approval`: broad edit, full-file rewrite, deletion, rename, glob/directory mutation, many affected files, package/config mutation, and generated unknown patch scope.
- `require_approval` package/config paths include `package.json`, lockfiles, workspace manifests, `tsconfig*.json`, tool config files, CI files, `.npmrc`, `.env*`, provider/auth-looking files, and other project policy/config artifacts.
- `deny`: unsafe paths, attempts to touch secrets/runtime state, empty affected file list, absolute paths, `..` traversal, or raw content fields in request metadata.
- `modify`: only if the safer edit metadata is mechanical and lossless. Prefer `require_approval` when uncertain.

When uncertain, choose the more conservative result: `deny` over `require_approval`, and `require_approval` over `allow`.

### Policy Decision Event Contract

Recommended runtime event payload:

```ts
{
  action: "allow" | "deny" | "modify" | "require_approval";
  affectedFiles?: string[];
  command?: string;
  cwd?: string;
  envExposure?: "custom" | "none";
  reason: string;
  requestType: "command" | "file_edit";
  riskLevel: "low" | "medium" | "high" | "critical";
  ruleId: string;
  status: "recorded";
  summary: string;
  timeoutMs?: number;
}
```

Validation requirements:

- `affectedFiles`, if present, must be safe project-relative paths.
- `command`, if present, must be a bounded command name or sanitized command summary, not full shell output.
- `cwd`, if present, must be metadata only and must not duplicate command output or repository instructions.
- Reject forbidden raw fields recursively: `content`, `rawContent`, `oldText`, `newText`, `patch`, `diff`, `hunk`, `snippet`, `snippets`, `rawSnippet`, `query`, `stdout`, `stderr`, `env`, and `repositoryInstruction`.
- The existing `findForbiddenFileActivityField()` helper does not cover all policy-forbidden fields. Create a policy-specific helper or carefully extend shared helper coverage with regression tests for existing file/tool events.
- Reject secret-looking `reason` and `summary` values.
- Preserve correlation ID from the active task. Do not generate unrelated correlation IDs inside the classifier.

### Architecture Compliance

- Runtime owns task state, event emission, correlation ID, and audit truth.
- `packages/sandbox` owns policy/risk classification logic and must not import CLI, TUI, RPC, provider, storage, or tools implementation internals.
- Tools must not request approval directly. They submit intents or metadata to the runtime/policy boundary.
- CLI, TUI, print, and RPC must remain adapters. Do not add adapter-local policy decisions.
- Do not execute commands in this story. Do not add `run_command` as an active tool yet.
- Do not implement approval request creation, approval response handling, timeouts, sandbox runner execution, validation command execution, or recovery loops in this story.
- Do not policy-gate `AgentRuntime.executeToolCall()` yet. Story 2.4 adds classification and audit APIs; Story 2.6 adds enforcement and approval behavior. Existing Story 2.3 `apply_patch` execution and event ordering must continue to pass.
- Do not add new third-party dependencies.

### Security and Redaction Requirements

- Repository content, tool output, model text, and proposed commands are untrusted input.
- Runtime/system policy always wins over repository instructions, including prompts that say to bypass safety, ignore policy, disable approvals, or run destructive commands.
- Policy events and summaries must not contain raw command output, raw patch text, old text, new text, `.env` values, provider credentials, tokens, private keys, or secret-looking values.
- A filename may look token-like; path fields may contain project-relative filenames, but summaries and reasons must not duplicate token-like path text.
- Denied decisions should be structured and recoverable, not thrown exceptions.

### File Structure Guidance

Expected files to add or update:

- `packages/sandbox/package.json`
- `packages/sandbox/src/index.ts`
- `packages/sandbox/src/policy-engine.ts` or `packages/sandbox/src/risk-classifier.ts`
- `packages/core/package.json` if core imports `@sprite/sandbox`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/file-activity.ts` only if shared forbidden-field or path helpers are reused or extended
- `packages/core/src/index.ts` only if new public runtime types need explicit export
- `tests/runtime-events.test.ts`
- `tests/policy-engine.test.ts` or another focused sandbox test file
- `README.md`

Avoid changing:

- `packages/tools/src/apply-patch.ts` except if type-only metadata helpers are needed.
- `packages/providers`: provider-driven tool use remains future work.
- `packages/cli/src/index.ts`: no CLI command surface is required unless README claims a user-facing command.
- `packages/storage`: durable audit persistence is later work.
- `packages/rpc`, `packages/tui`: approval and adapter integrations are later work.

### Testing Requirements

Minimum test coverage:

- Classifier returns `allow` for safe read-only command metadata.
- Classifier returns `allow` for narrowly configured validation command metadata only when bounded and free of env, install/network, shell, force, and broad write indicators.
- Classifier returns `modify` for otherwise safe command metadata with missing or excessive timeout without changing command semantics.
- Classifier returns `require_approval` for install/mutating/network/custom-env command metadata, arbitrary package scripts, direct package execution, and shell interpreter requests.
- Classifier returns `deny` for privilege escalation, root deletion, chmod/chown broad permission changes, disk operations, shell download execution, and cwd escape attempts.
- Classifier returns `allow` for safe targeted patch metadata from Story 2.3.
- Classifier returns `require_approval` for broad edits, full-file writes, deletes, renames, glob/directory mutation, package/config mutation path patterns, and too many affected files.
- Classifier returns `deny` for unsafe edit paths, empty affected file lists, runtime/state/secret-looking artifact paths, and raw content fields.
- Public classifier/runtime inputs that are malformed or include forbidden raw metadata return structured `Result` failures and do not throw.
- Repository/tool-output instruction override attempts do not lower risk.
- `validateRuntimeEvent()` accepts canonical `policy.decision.recorded` events and rejects raw content/patch fields, unsafe paths, invalid actions, invalid risk levels, and secret-looking summaries.
- `AgentRuntime.classifyPolicyRequest()` emits `policy.decision.recorded` with the active task correlation ID and does not execute commands, mutate files, or gate existing tool execution.
- Existing `AgentRuntime.executeToolCall(apply_patch)` Story 2.3 event ordering continues to pass.
- Existing tests continue to pass.

Run before moving to review:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `git diff --check`
- Targeted `npm exec -- prettier --check ...` for touched source, tests, README, and story files.

### Latest Technical Information

No external dependency research is required for this story. Use the repository's current stack and avoid adding dependencies:

- Node.js standard library only.
- TypeScript `5.9.2` from `package.json`.
- Vitest `3.2.4` from `package.json`.
- Existing `Result`, `ok`, `err`, and `SpriteError` primitives from `@sprite/shared`.

### Git Intelligence

Recent relevant commits:

- `ac9867d feat: add patch-based file edits`
- `119ce3e feat: track runtime file activity`
- `aa9e206 feat: add safe repository inspection tools`
- `acccc48 feat: add final task summaries`
- `0c1d504 feat: add one-shot print output modes`

Actionable patterns:

- Add failing tests first for classifier behavior, runtime event validation, and runtime integration.
- Keep event payloads metadata-only and schema-validated.
- Return structured `Result` failures for malformed input instead of throwing.
- Keep README wording truthful about implemented API behavior and future approval/sandbox work.

### Project Context Reference

No `project-context.md` or UX design file was found during story creation. Use these source artifacts:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/2-3-propose-and-apply-patch-based-file-edits.md`
- Existing source files under `packages/` and tests under `tests/`

### References

- Story 2.4 definition: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.4)
- PRD MVP scope: `_bmad-output/planning-artifacts/prd.md` (MVP Scope Summary)
- PRD sandbox and approval protocol: `_bmad-output/planning-artifacts/prd.md` (Sandbox and Approval Protocol)
- PRD NFR7-NFR13: `_bmad-output/planning-artifacts/prd.md` (Security and Privacy)
- PRD NFR23-NFR24: `_bmad-output/planning-artifacts/prd.md` (Observability and Auditability)
- PRD NFR31: `_bmad-output/planning-artifacts/prd.md` (Integration and API Contract)
- Architecture module boundaries: `_bmad-output/planning-artifacts/architecture.md` (Module Boundary Rules)
- Architecture runtime event format: `_bmad-output/planning-artifacts/architecture.md` (Runtime Event Format)
- Architecture requirements coverage: `_bmad-output/planning-artifacts/architecture.md` (Requirements Coverage Validation)
- Previous story: `_bmad-output/implementation-artifacts/2-3-propose-and-apply-patch-based-file-edits.md`

## Dev Agent Record

### Agent Model Used

gpt-5

### Debug Log References

- GitNexus impact before edits: `AgentRuntime` upstream risk CRITICAL; `validateRuntimeEvent` upstream risk LOW.
- `npm test -- tests/policy-engine.test.ts tests/runtime-events.test.ts` (red phase: expected failures for missing `@sprite/sandbox` exports, missing `policy.decision.recorded`, and missing `AgentRuntime.classifyPolicyRequest()`).
- `npm test -- tests/policy-engine.test.ts tests/runtime-events.test.ts` (35 tests).
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test` (82 tests).
- `git diff --check`
- `npm exec -- prettier --check README.md package.json package-lock.json tsconfig.base.json packages/core/package.json packages/core/tsconfig.json packages/core/src/agent-runtime.ts packages/core/src/runtime-events.ts packages/sandbox/package.json packages/sandbox/tsconfig.json packages/sandbox/src/index.ts packages/sandbox/src/policy-engine.ts tests/policy-engine.test.ts tests/runtime-events.test.ts _bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md _bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits-validation-report-2026-04-24.md _bmad-output/implementation-artifacts/sprint-status.yaml`
- GitNexus `detect_changes(scope: all)`: high affected scope; affected flows include runtime event emit/validation and AgentRuntime CLI flow.
- Code review fixes: GitNexus impact on policy classifier helpers returned LOW risk.
- Code review fixes validation: `npm run build`; `npm run typecheck`; `npm run lint`; `npm test` (83 tests); `git diff --check`; targeted Prettier check.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented deterministic policy classification in `@sprite/sandbox` for command and file-edit requests with allow, deny, modify, and require-approval decisions.
- Added public untrusted-input validation, policy-specific raw metadata rejection, timeout normalization, package/config edit classification, and conservative command risk rules.
- Added canonical `policy.decision.recorded` runtime events with metadata-only validation and no raw command output, env values, patch bodies, or repository instructions.
- Added `AgentRuntime.classifyPolicyRequest()` to emit policy decision audit events using the active task correlation ID without executing commands, mutating files, or gating existing `apply_patch` behavior.
- Updated README with implemented classification behavior and current limitations.
- Added deterministic classifier, runtime event, runtime integration, malformed input, and non-enforcement regression tests.
- Addressed code review findings for configured validation flags, shell download execution through interpreters, glob/directory edit scopes, and root `.github/workflows` config paths.

### File List

- `README.md`
- `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits-validation-report-2026-04-24.md`
- `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/tsconfig.json`
- `packages/sandbox/package.json`
- `packages/sandbox/src/index.ts`
- `packages/sandbox/src/policy-engine.ts`
- `packages/sandbox/tsconfig.json`
- `tests/policy-engine.test.ts`
- `tests/runtime-events.test.ts`
- `tsconfig.base.json`

### Change Log

- 2026-04-24: Created comprehensive Story 2.4 context and moved story to ready-for-dev.
- 2026-04-24: Validated and refined Story 2.4 context before implementation.
- 2026-04-24: Implemented policy classification and audit events; moved story to review.
- 2026-04-24: Addressed code review findings and moved story to done.
