# Story 2.4 Validation Report

Date: 2026-04-24
Project: Sprite_harmess
Story: 2.4 - Classify Risk for Commands and Broad File Edits
Story file: `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md`

## Review Status

Status: Applied to story

The story is strong and has enough source, architecture, previous-story, testing, and file-structure context for implementation. The remaining risks are mostly precision problems: a dev agent could still implement a typed-only classifier boundary, over-allow package-manager validation commands, or reuse existing raw-field helpers without covering policy-specific unsafe fields.

Update: The recommendations in this report were applied to `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md` on 2026-04-24.

## Sources Reviewed

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/implementation-artifacts/2-3-propose-and-apply-patch-based-file-edits.md`
- `_bmad-output/implementation-artifacts/2-4-classify-risk-for-commands-and-broad-file-edits.md`
- `packages/sandbox/package.json`
- `packages/sandbox/src/index.ts`
- `packages/core/package.json`
- `packages/core/src/agent-runtime.ts`
- `packages/core/src/runtime-events.ts`
- `packages/core/src/file-activity.ts`
- `packages/tools/src/apply-patch.ts`
- `tests/runtime-events.test.ts`
- `tests/tool-registry.test.ts`

## Critical Issues

1. Public policy input boundary is underspecified.

   Story lines 121-157 define typed `PolicyRequest` interfaces, and lines 44-48 require an `AgentRuntime.classifyPolicyRequest()` method with structured failures. This is not explicit enough that the public classifier/runtime boundary must accept `unknown` or an untrusted input shape and validate it before narrowing. If the implementation accepts only `PolicyRequest`, malformed model/RPC/tool metadata can be cast through tests or adapters and skip runtime validation. Add a guardrail that exported classifier and runtime methods validate unknown input at the boundary, reject extra forbidden raw fields before decision construction, and return `Result<PolicyDecision, SpriteError>` failures instead of throwing.

2. Validation-like command rules are ambiguous.

   Story lines 28 and 165 allow "validation-like commands", while lines 29 and 167 require approval for package-manager scripts with unknown side effects. Without a precise rule, one implementation may allow arbitrary `npm run <script>` or `npm run build`, while another may require approval for all package-manager commands. Add an explicit MVP rule set: read-only commands are allowed; package-manager validation commands are allowed only when narrowly matched and bounded; installs, `npx`/`dlx`/`exec`, arbitrary package scripts, network commands, custom env, and shell interpreters must require approval or deny according to risk.

## Enhancement Opportunities

3. Add policy-specific unsafe metadata helper guidance.

   `packages/core/src/file-activity.ts` currently rejects `content`, `rawContent`, `oldText`, `newText`, `patch`, `diff`, `hunk`, `snippet`, `snippets`, `rawSnippet`, and `query`, but Story 2.4 policy event validation must also reject `stdout`, `stderr`, `env`, and `repositoryInstruction`. Add guidance to create a policy-specific recursive forbidden-field helper or extend shared helpers carefully, with regression tests proving existing tool/file events still validate as intended.

4. Include cwd in the policy decision event payload for command requests.

   The PRD approval metadata includes working directory, and existing `tool.call.*` events include `cwd`. Story lines 181-197 recommend `command`, `envExposure`, and `timeoutMs`, but not `cwd`. Add `cwd` or a sanitized working-directory summary for command policy events so audit and later approval request creation have the same decision context.

5. Define package/config mutation path patterns.

   Story lines 34 and 173 require approval for package/config mutation but do not list examples. Add a bounded pattern list for `package.json`, lockfiles, workspace files, `tsconfig*.json`, tool config files, CI files, `.npmrc`, `.env*`, and provider/auth-looking files. This prevents inconsistent classification of high-impact edits.

## Optimizations

6. Tighten `modify` semantics.

   Story lines 31 and 166 allow timeout normalization, and line 31 also mentions removing unsupported environment exposure. Silent env removal can change command meaning and conflicts with the custom-env approval rule. Clarify that `modify` is primarily for safe timeout normalization unless the request explicitly permits lossless metadata normalization; custom env exposure should require approval by default.

7. State that this story adds classification API only, not enforcement in `executeToolCall()`.

   Story line 48 says not to wire command execution or approval prompts, and line 37 says not to change `apply_patch` behavior. Add a direct guardrail that existing `executeToolCall()` behavior must remain compatible with Story 2.3 tests; Story 2.4 may add `classifyPolicyRequest()` but must not gate existing tool execution paths until Story 2.6 enforcement.

## Recommendation

The story now includes these precision fixes and is ready for `bmad-dev-story`.
