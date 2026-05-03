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

## Local Session Inspection

Story 3.2 adds a read-only inspection slice for existing project-local sessions.
`sprite session inspect <session-id>` reads the current cwd's
`.sprite/sessions/<session-id>/state.json` and `events.ndjson` without creating,
resuming, or mutating session artifacts.

Inspection output supports text and JSON formats:

```bash
sprite session inspect ses_example --output text --recent-events 20
sprite session inspect ses_example --output json --recent-events 20
```

The adapter-facing view includes session ID, cwd, task goal, latest bounded plan
summary, waiting or terminal state, recent event summaries, files read/changed
or proposed for change, command metadata summaries, pending approval count, last
error, next-step hint, parsed event count, and warnings. Displayed strings are
redacted through the shared secret-like value helpers, and the CLI preserves the
warning that `.sprite/sessions` artifacts are local private state that should
not be committed or treated as portable across machines.

The event log remains the audit evidence and `state.json` remains a bounded
recoverable snapshot. This slice does not implement resume, session listing,
project context loading, context assembly, TUI/RPC inspection screens, or
compaction.

## Local Session Resume

Story 3.3 adds the first conservative resume slice for existing project-local
sessions. `sprite resume <session-id>` reads the current cwd's
`.sprite/sessions/<session-id>/state.json` and full `events.ndjson` history,
validates persisted runtime events, restores a minimal runtime-owned active task
from safe snapshot fields, and appends a metadata-only `session.resumed` event.

Resume output supports text and JSON formats:

```bash
sprite resume ses_example --output text
sprite resume ses_example --output json
```

The resume result includes the resumed session ID, task/correlation IDs, task
goal, status, current phase, latest plan snapshot, restored event count, resume
event ID, files touched, command summaries, pending approval count, last error,
next-step hint, and local-state warnings. Displayed fields are redacted through
the shared secret-like value helpers, and missing or unreadable sessions return
structured recoverable errors without creating new session artifacts.

Resume is intentionally conservative. It restores audit/history visibility and
waiting/terminal task state, but it does not replay tools, commands,
validations, approvals, provider calls, project context loading, context
assembly, TUI/RPC flows, or compaction.

## Project Context Loading

Story 3.4 adds the first safe project-context loading slice. The runtime now
checks the resolved project cwd for direct files in this deterministic order:

1. `SPRITE.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `.cursorrules`

`@sprite/config` exposes `loadProjectContextFiles()` and records every
candidate as `loaded`, `skipped`, `truncated`, or `blocked`. Records include
the direct file name, absolute and relative path, priority, byte counts,
truncation state, redaction state, optional bounded redacted content/preview,
and a reason for skipped, truncated, or blocked candidates.

Project context files are always marked `untrusted`. They are repository
guidance with lower priority than runtime/system policy, sandbox policy,
approval state, provider configuration, validation commands, and user input.
The loader does not parse project context as executable configuration and does
not allow these files to introduce tools, approvals, safety overrides, or
sandbox changes.

Safety behavior for this slice:

- only direct files under the resolved cwd are considered
- directories, symlinks, unreadable files, and non-regular candidates are
  blocked with per-file records
- each file uses a deterministic per-file byte budget and truncates instead of
  loading unbounded content
- secret-like values are redacted with the shared sensitive-value helpers before
  content or previews are exposed

The shared runtime exposes the project-context result through
`AgentRuntime.getBootstrapState()` and one-shot print results. CLI bootstrap and
one-shot text/JSON output render only core-returned records; the CLI does not
read project files directly.

This slice itself did not implement full context packet assembly, provider
prompt injection, memory or skill context inclusion, semantic search, TUI/RPC
inspection screens, or compaction. Later Epic 3 stories own those flows.

## Task Context Packet Assembly

Story 3.5 adds the first structured task context packet. `@sprite/core`
exposes `assembleTaskContextPacket()` and stores the packet on
`TaskRequest.contextPacket` for both new tasks and conservatively resumed
sessions.

The canonical source order is:

1. `runtime-self-model`
2. `provider-limits`
3. `user-input`
4. `session-state`
5. `project-context`
6. `memory`
7. `skills`

Every packet section records a source, trust level, status, summary, safe
metadata, and optional bounded redacted content. Section statuses are:
`included`, `skipped`, `blocked`, and `redacted`. The packet summary exposes
source ordering and counts without raw section content.

Runtime-owned sections stay trusted and authoritative. Project context records
remain explicitly `untrusted` and lower priority than runtime/system policy.
User input, project context, and future memory/skill summaries are represented
only through bounded redacted previews before adapter-facing output can see
them.

Current runtime integration:

- new interactive tasks include session identity, task ID, correlation ID, and
  lifecycle phase in the `session-state` section
- resumed tasks include bounded restored-session metadata such as restored event
  count, pending approval count, file activity counts, task status, and current
  phase without replaying tools, commands, approvals, validations, or provider
  calls
- one-shot JSON output includes the structured `contextPacket`
- one-shot text output renders a concise task-context status summary and does
  not dump raw project documents, memory, or skills

Memory and skills do not load durable backing stores yet. Their source slots are
represented as explicit `skipped` sections until later memory and skill-registry
stories implement those systems. This story also does not implement provider
prompt injection, live provider completions, automatic tool calls, semantic
search, TUI/RPC context rendering, or compaction.

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
- Full context packet assembly and compaction flows
- Durable memory persistence and skills
