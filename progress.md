# Sprite Harness Progress

This file records story-by-story implementation progress and detailed runtime
behavior notes. Keep `README.md` focused on quick start and current capability
summaries; place detailed progress notes here.

## Story 1.1 Bootstrap Scope

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
- `validation.commands`
- `safety.rules`

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
  },
  "validation": {
    "commands": [
      {
        "name": "typecheck",
        "command": "npm",
        "args": ["run", "typecheck"],
        "timeoutMs": 60000
      }
    ]
  },
  "safety": {
    "rules": [
      {
        "id": "project.ticket-redaction",
        "action": "redact",
        "targets": ["learning_material", "memory_candidate"],
        "pattern": "TICKET-[0-9]+",
        "reason": "Ticket identifiers are customer metadata."
      }
    ]
  }
}
```

The bootstrap output reports the resolved startup state and whether global or project config files were loaded. Secrets do not belong in these example files.

## MVP Provider Setup

Story 1.3 adds an OpenAI-compatible provider bootstrap path. The current precedence for API-key resolution is:

1. runtime override
2. local auth file
3. environment variable
4. provider config

Auth files live under `~/.sprite/auth/` and use the provider name as the filename. Example:

```json
{
  "apiKey": "sk-example"
}
```

For the MVP provider, a typical auth file path is:

- `~/.sprite/auth/openai-compatible.json`

Provider config may specify:

- `provider.name`
- `provider.model`
- `provider.baseUrl`
- `provider.apiKeyEnvVar`
- `provider.apiKey`

Example provider config:

```json
{
  "provider": {
    "name": "openai-compatible",
    "model": "gpt-5.4",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  }
}
```

Bootstrap output exposes provider, model, auth source, and capability metadata, but it never prints the secret value.

## First Interactive Task

Stories 1.4, 1.5, and 1.6 add the first shared-runtime interactive task path:

```bash
sprite "fix the failing provider tests"
```

At this stage the runtime:

- creates a typed task request
- uses current cwd and active provider/model state
- returns an initial plan-act-observe execution flow
- exposes explicit waiting or terminal task state
- emits schema-validated runtime lifecycle events with stable IDs
- lets adapters subscribe to emitted runtime events instead of deriving task truth from text
- accepts immediate steering or cancellation intents through the shared runtime

Examples:

```bash
sprite --steer "Check auth-state warnings before adding commands." "fix the failing provider tests"
sprite --cancel "fix the failing provider tests"
```

At this stage the default interactive CLI task does not yet:

- execute tools or commands
- apply edits
- resume, inspect, or compact durable session state

The goal of this slice is to prove that interactive task submission goes through `AgentRuntime`, not to fake full tool execution early.

## Repository Inspection Tools

Stories 2.1 and 2.3 add the first safe repository tools through the shared runtime/tool boundary:

- `read_file`
- `list_files`
- `search_files`
- `apply_patch`

These tools run inside the resolved project directory, reject path escapes, avoid following directory symlinks during traversal, and summarize large outputs over 32 KB or 500 lines. Tool lifecycle observations use canonical runtime events:

- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`

The current CLI does not expose direct commands for file inspection, patching, command execution, or approval responses yet. Tool execution and approval response handling are available through runtime/package APIs and remain separate from provider-driven automatic tool use, validation command execution, sessions, memory, and skills.

## Patch-Based File Edits

Story 2.3 adds a targeted `apply_patch` tool for runtime/package API use. The MVP patch contract is structured as exact text replacements:

- each edit targets one project-relative file path
- `oldText` must be non-empty and match exactly once
- `newText` must differ from `oldText`
- all edits are validated before any file is written

Patch tool audit is emitted through canonical runtime events:

- `file.edit.requested`
- `file.edit.applied`
- `file.edit.failed`

Successful patch application also records changed file activity through `file.activity.recorded`, so final summaries can list changed files. Runtime events and file activity records intentionally exclude raw file contents, old text, new text, patch hunks, diff bodies, and secret-looking values.

## File Activity Audit

Story 2.2 adds runtime-owned file activity tracking for repository inspection tools. Successful file activity is emitted through canonical runtime events:

- `file.activity.recorded`

Runtime task state and final summaries now group file activity into:

- files read or inspected
- files proposed for change
- files changed

The current implementation records activity for `read_file`, `list_files`, `search_files`, and successful `apply_patch` calls, plus a narrow runtime API for proposal-only `proposed_change` records. File activity records intentionally exclude raw file contents, search snippets, search query text, patch hunks, diff bodies, and secret-looking values.

Durable audit persistence for runtime events now starts in Story 3.1 under
project-local `.sprite/sessions/<session-id>/events.ndjson`.

## Local Session Persistence

Story 3.1 adds the first durable local session slice. A new `AgentRuntime`
instance generates a stable `ses_...` session ID and creates project-local
artifacts under:

- `.sprite/sessions/<session-id>/events.ndjson`
- `.sprite/sessions/<session-id>/state.json`

Runtime events are validated and appended to `events.ndjson` as ordered
NDJSON before runtime subscribers are notified, one validated runtime event per
line. The bounded `state.json` snapshot is replaced atomically and records
schema version, session identity, cwd, creation/update timestamps, latest task
identity/status, event count, last event ID/type, file activity summaries,
pending approval count, last error, and next-step hints.

The event log remains the durable audit source of truth; `state.json` is only a
recoverable snapshot for future inspection/resume stories. This slice does not
implement session listing, resume, project context loading, context assembly,
or compaction.

## Sandboxed Command Execution

Story 2.5 adds sandboxed command execution for runtime/package API use through
the `run_command` tool. Runtime command execution classifies the request first,
records `policy.decision.recorded`, and only executes `allow` decisions or
mechanically safe `modify` decisions supplied by the policy classifier.

Allowed commands execute through `SandboxRunner` with:

- `shell: false`
- structured command and args
- resolved cwd enforcement inside the configured project boundary
- symlink escape rejection
- mandatory timeouts
- minimal inherited environment exposure (`PATH` only)

Command tool events use metadata-only payloads. They can identify command, cwd,
status, timeout, exit code, duration, and output reference, but do not include
raw stdout, stderr, custom environment values, or command output bodies.

Approval-required command requests now create metadata-only approval events and
pending runtime approvals. Runtime callers can respond with allow, deny, edit,
or timeout decisions; approved commands still execute through `run_command` and
`SandboxRunner`, while denial and timeout return structured observations. Edit
responses keep the original request type: command approvals use a modified
command request, and file edit approvals use a modified `apply_patch` tool call
so the runtime receives the exact replacement text needed to apply the patch.
The runtime rejects approval actions that were not listed in the request's
`allowedActions`.

Current limitations:

- CLI/TUI/RPC approval prompts remain future adapter work
- provider-driven automatic command use remains future work

## Project Validation Commands

Project validation commands can be configured in `.sprite/config.json` using a
structured, shell-free command shape:

```json
{
  "validation": {
    "commands": [
      {
        "name": "test",
        "command": "npm",
        "args": ["run", "test"],
        "timeoutMs": 60000
      }
    ]
  }
}
```

Runtime callers can invoke `AgentRuntime.runConfiguredValidationCommands()` to
run the configured commands through the same policy, approval, sandbox, and
tool lifecycle path as `run_command`. Validation emits metadata-only
`validation.started` and `validation.completed` events. If no validation command
is configured, the runtime emits a skipped `validation.completed` event so final
summaries can state that no relevant validation was available.

## Safety Rules and Memory Exclusions

Story 2.9 adds inspectable safety rules that run before safety-sensitive content
can become a memory candidate. Effective startup config includes default safety
rules plus any global/project rules from `.sprite/config.json`. Project rules
with the same `id` override global rules deterministically.

Safety rules use metadata-only match definitions:

- `id`: stable rule identifier
- `action`: `block` or `redact`
- `targets`: one or more of `tool_output`, `file_content`, `command_output`,
  `learning_material`, `memory_candidate`
- `pattern`: regular expression for content matches
- `pathPattern`: regular expression for path matches
- `reason`: audit-safe reason text

Default exclusions block credential assignments, private keys, OpenAI-style
`sk-` tokens, provider API-key variable names, `.env`-style paths, and common
private-key/certificate paths. Rule metadata itself is validated so configured
patterns and reasons do not contain secret-looking values.

Runtime/package callers can use:

- `resolveStartupConfig().safetyRules` to inspect the effective rules
- `createMemoryCandidate()` from `@sprite/memory` to allow, block, or redact a
  candidate before persistence
- `AgentRuntime.evaluateMemoryCandidateSafety()` to emit a metadata-only
  `memory.safety.evaluated` audit event

Audit payloads include action, matched rule IDs, target, reason, and redacted
preview only. They never include raw candidate content, matched secret text,
stdout/stderr bodies, environment values, patch bodies, or repository
instructions.

Current scope remains runtime-local: durable `.sprite/memory` persistence,
candidate review UI, semantic/vector memory, and provider-driven learning are
future stories.

## Recovery After Validation or Denial

Runtime callers can record the agent's recovery decision with
`AgentRuntime.recordRecoveryAction()`. Recovery records are emitted as
metadata-only `task.recovery.recorded` events and can link back to validation,
tool, policy, or approval events through source IDs, validation IDs, tool call
IDs, rule IDs, and error codes.

Recovery decisions are intentionally bounded:

- `retry_with_fix`
- `choose_safer_alternative`
- `ask_user`
- `stop`

When recovery asks the user, the runtime reuses the existing
`task.waiting`/`user-input-required` state so adapters can render a normal input
request. Recovery events must not include raw stdout, stderr, command output,
patch text, environment values, repository instructions, or secret-looking
values. Follow-up tool calls still have to go through the normal policy,
approval, sandbox, and tool lifecycle path.

## Policy Classification

Story 2.4 adds a deterministic policy classifier through `@sprite/sandbox` and
`AgentRuntime.classifyPolicyRequest()` for runtime/package API use. It classifies
command and file edit metadata into:

- `allow`
- `modify`
- `require_approval`
- `deny`

Policy decisions are recorded through the canonical
`policy.decision.recorded` runtime event with metadata-only payloads. The
classifier validates untrusted request shapes, rejects raw content fields, keeps
environment values and patch bodies out of decisions, and treats repository or
tool-output instructions as untrusted input.

Policy classification itself remains approval-free. Command execution and
`apply_patch` now use runtime approval gates when policy returns
`require_approval`; safe targeted patches still use the existing patch lifecycle
events, while broad or risky edits wait for approval before any file is written.
Approval requests always include a timeout value, and tasks waiting on approval
block further runtime tool execution until the pending approval is resolved.
Configured validation commands also use policy and sandbox checks; provider-driven
automatic tool-calling remains future work.

Not implemented yet:

- Live provider completions and tool-calling execution
- Full multi-iteration agent loop progression
- TUI
- RPC server
- Session inspection/resume/context/compaction flows
- Durable memory persistence and skills
