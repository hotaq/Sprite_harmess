import { SpriteError, err, type Result } from "@sprite/shared";
import path from "node:path";

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

export interface PolicyEventMetadata {
  affectedFiles?: string[];
  command?: string;
  cwd?: string;
  envExposure?: "custom" | "none";
  requestType: PolicyRequestType;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_TARGETED_PATCH_FILES = 10;

const COMMAND_REQUEST_KEYS = new Set([
  "args",
  "command",
  "configuredValidation",
  "cwd",
  "env",
  "timeoutMs",
  "type"
]);
const FILE_EDIT_REQUEST_KEYS = new Set([
  "affectedFiles",
  "editKind",
  "summary",
  "type"
]);
const FORBIDDEN_POLICY_INPUT_FIELDS = new Set([
  "content",
  "diff",
  "hunk",
  "newText",
  "oldText",
  "patch",
  "query",
  "rawContent",
  "rawSnippet",
  "repositoryInstruction",
  "snippet",
  "snippets",
  "stderr",
  "stdout"
]);
const READ_ONLY_COMMANDS = new Map<string, readonly string[][]>([
  ["git", [["status"], ["diff"], ["log"]]],
  ["ls", [[]]],
  ["pwd", [[]]]
]);
const PACKAGE_MANAGERS = new Set(["bun", "npm", "pnpm", "yarn"]);
const DIRECT_PACKAGE_EXECUTION_COMMANDS = new Set([
  "npx",
  "npm exec",
  "pnpm dlx",
  "yarn dlx"
]);
const PACKAGE_MUTATION_ARGS = new Set([
  "add",
  "ci",
  "install",
  "remove",
  "uninstall",
  "update",
  "upgrade"
]);
const SHELL_INTERPRETERS = new Set(["bash", "fish", "sh", "zsh"]);
const NETWORK_COMMANDS = new Set(["curl", "wget"]);
const FILE_WRITING_COMMANDS = new Set(["cp", "mkdir", "mv", "tee", "touch"]);
const DISK_COMMANDS = new Set(["dd", "diskutil", "fdisk", "mkfs"]);
const VALIDATION_SCRIPT_NAMES = new Set([
  "build",
  "check",
  "lint",
  "test",
  "typecheck"
]);
const VALIDATION_WRITE_INDICATORS = new Set([
  "--fix",
  "--update",
  "--update-snapshot",
  "--updatesnapshot",
  "--watch",
  "--write",
  "-u"
]);

export function classifyPolicyRequest(
  input: unknown
): Result<PolicyDecision, SpriteError> {
  const parsed = parsePolicyRequest(input);

  if (!parsed.ok) {
    return parsed;
  }

  return parsed.value.type === "command"
    ? classifyCommandRequest(parsed.value)
    : classifyFileEditRequest(parsed.value);
}

export function summarizePolicyRequestForEvent(
  input: unknown
): Result<PolicyEventMetadata, SpriteError> {
  const parsed = parsePolicyRequest(input);

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.value.type === "command") {
    return {
      ok: true,
      value: {
        command: summarizeCommand(parsed.value),
        cwd: parsed.value.cwd,
        envExposure:
          parsed.value.env === undefined ||
          Object.keys(parsed.value.env).length === 0
            ? "none"
            : "custom",
        requestType: "command",
        ...(parsed.value.timeoutMs === undefined
          ? {}
          : { timeoutMs: parsed.value.timeoutMs })
      }
    };
  }

  return {
    ok: true,
    value: {
      affectedFiles: [...parsed.value.affectedFiles],
      requestType: "file_edit"
    }
  };
}

function parsePolicyRequest(
  input: unknown
): Result<PolicyRequest, SpriteError> {
  if (!isPlainObject(input)) {
    return invalidRequest("Policy request must be an object.");
  }

  const forbiddenField = findForbiddenPolicyInputField(input, new WeakSet());

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "POLICY_UNSAFE_METADATA",
        `Policy request must not include raw metadata field '${forbiddenField}'.`
      )
    );
  }

  if (input.type === "command") {
    return parseCommandPolicyRequest(input);
  }

  if (input.type === "file_edit") {
    return parseFileEditPolicyRequest(input);
  }

  return invalidRequest("Policy request type must be command or file_edit.");
}

function parseCommandPolicyRequest(
  input: Record<string, unknown>
): Result<CommandPolicyRequest, SpriteError> {
  const unknownField = findUnknownField(input, COMMAND_REQUEST_KEYS);

  if (unknownField !== null) {
    return invalidRequest(
      `Command policy request contains unsupported field '${unknownField}'.`
    );
  }

  if (
    typeof input.command !== "string" ||
    input.command.trim().length === 0 ||
    typeof input.cwd !== "string" ||
    input.cwd.trim().length === 0
  ) {
    return invalidRequest(
      "Command policy request requires non-empty command and cwd strings."
    );
  }

  const args = parseOptionalStringArray(input.args);

  if (!args.ok) {
    return args;
  }

  const timeout = parseOptionalPositiveInteger(input.timeoutMs, "timeoutMs");

  if (!timeout.ok) {
    return timeout;
  }

  const configuredValidation =
    input.configuredValidation === undefined
      ? undefined
      : input.configuredValidation;

  if (
    configuredValidation !== undefined &&
    typeof configuredValidation !== "boolean"
  ) {
    return invalidRequest("configuredValidation must be a boolean.");
  }

  const env = parseOptionalStringRecord(input.env);

  if (!env.ok) {
    return env;
  }

  return {
    ok: true,
    value: {
      ...(args.value === undefined ? {} : { args: args.value }),
      command: input.command.trim(),
      ...(configuredValidation === undefined ? {} : { configuredValidation }),
      cwd: input.cwd.trim(),
      ...(env.value === undefined ? {} : { env: env.value }),
      ...(timeout.value === undefined ? {} : { timeoutMs: timeout.value }),
      type: "command"
    }
  };
}

function parseFileEditPolicyRequest(
  input: Record<string, unknown>
): Result<FileEditPolicyRequest, SpriteError> {
  const unknownField = findUnknownField(input, FILE_EDIT_REQUEST_KEYS);

  if (unknownField !== null) {
    return invalidRequest(
      `File edit policy request contains unsupported field '${unknownField}'.`
    );
  }

  if (!Array.isArray(input.affectedFiles) || input.affectedFiles.length === 0) {
    return invalidRequest("File edit policy request requires affectedFiles.");
  }

  const affectedFiles: string[] = [];

  for (const affectedFile of input.affectedFiles) {
    if (typeof affectedFile !== "string" || affectedFile.trim().length === 0) {
      return invalidRequest("affectedFiles must contain non-empty strings.");
    }

    affectedFiles.push(affectedFile.trim());
  }

  if (!isFileEditKind(input.editKind)) {
    return invalidRequest("File edit policy request has unsupported editKind.");
  }

  if (
    input.summary !== undefined &&
    (typeof input.summary !== "string" || input.summary.trim().length === 0)
  ) {
    return invalidRequest("File edit summary must be non-empty when provided.");
  }

  return {
    ok: true,
    value: {
      affectedFiles,
      editKind: input.editKind,
      ...(input.summary === undefined ? {} : { summary: input.summary.trim() }),
      type: "file_edit"
    }
  };
}

function classifyCommandRequest(
  request: CommandPolicyRequest
): Result<PolicyDecision, SpriteError> {
  const commandName = normalizedCommandName(request.command);
  const args = request.args ?? [];
  const commandWithSubcommand = `${commandName} ${args[0] ?? ""}`.trim();

  if (requiresShellParsing(request.command)) {
    return allowDecision({
      action: "deny",
      reason:
        "Shell-string command parsing is not supported for policy safety.",
      riskLevel: "critical",
      ruleId: "command.shell.parse_required"
    });
  }

  if (commandName === "sudo" || commandName === "su") {
    return allowDecision({
      action: "deny",
      reason: "Privilege escalation commands are denied.",
      riskLevel: "critical",
      ruleId: "command.privilege"
    });
  }

  if (isShellDownloadExecution(commandName, args)) {
    return allowDecision({
      action: "deny",
      reason: "Download-to-shell execution is denied.",
      riskLevel: "critical",
      ruleId: "command.shell.download_execution"
    });
  }

  if (isRootDeletion(commandName, args)) {
    return allowDecision({
      action: "deny",
      reason: "Root-targeted deletion is denied.",
      riskLevel: "critical",
      ruleId: "command.delete.root"
    });
  }

  if (commandName === "chmod" && args.includes("777")) {
    return allowDecision({
      action: "deny",
      reason: "Broad permission changes are denied.",
      riskLevel: "critical",
      ruleId: "command.permission.broad"
    });
  }

  if (commandName === "chown" || DISK_COMMANDS.has(commandName)) {
    return allowDecision({
      action: "deny",
      reason: "Ownership and disk operations are denied.",
      riskLevel: "critical",
      ruleId: "command.system.destructive"
    });
  }

  if (args.some(isPotentialCwdEscapeArg)) {
    return allowDecision({
      action: "deny",
      reason:
        "Command arguments attempt to traverse outside the working scope.",
      riskLevel: "critical",
      ruleId: "command.cwd_escape"
    });
  }

  if (hasCustomEnv(request)) {
    return allowDecision({
      action: "require_approval",
      approvalSummary: "Command exposes custom environment metadata.",
      reason: "Custom environment metadata requires approval.",
      riskLevel: "high",
      ruleId: "command.env.custom"
    });
  }

  if (
    DIRECT_PACKAGE_EXECUTION_COMMANDS.has(commandName) ||
    DIRECT_PACKAGE_EXECUTION_COMMANDS.has(commandWithSubcommand)
  ) {
    return allowDecision({
      action: "require_approval",
      reason: "Direct package execution requires approval.",
      riskLevel: "high",
      ruleId: "command.package.execute"
    });
  }

  if (
    PACKAGE_MANAGERS.has(commandName) &&
    args.some((arg) => PACKAGE_MUTATION_ARGS.has(arg))
  ) {
    return allowDecision({
      action: "require_approval",
      reason: "Dependency mutation commands require approval.",
      riskLevel: "high",
      ruleId: "command.package.install"
    });
  }

  if (PACKAGE_MANAGERS.has(commandName) && isPackageScript(args)) {
    if (isConfiguredValidationCommand(request, commandName, args)) {
      if (hasUnsafeValidationArgs(args)) {
        return allowDecision({
          action: "require_approval",
          reason:
            "Configured validation commands with mutating or elevated-risk arguments require approval.",
          riskLevel: "medium",
          ruleId: "command.validation.unsafe_args"
        });
      }

      return allowWithTimeout(request, "command.validation.configured");
    }

    return allowDecision({
      action: "require_approval",
      reason:
        "Package manager scripts with unknown side effects require approval.",
      riskLevel: "medium",
      ruleId: "command.package.script"
    });
  }

  if (NETWORK_COMMANDS.has(commandName)) {
    return allowDecision({
      action: "require_approval",
      reason: "Network commands require approval.",
      riskLevel: "high",
      ruleId: "command.network"
    });
  }

  if (SHELL_INTERPRETERS.has(commandName)) {
    return allowDecision({
      action: "require_approval",
      reason: "Shell interpreter commands require approval.",
      riskLevel: "high",
      ruleId: "command.shell"
    });
  }

  if (FILE_WRITING_COMMANDS.has(commandName) || hasForceFlag(args)) {
    return allowDecision({
      action: "require_approval",
      reason: "File-writing commands and force flags require approval.",
      riskLevel: "medium",
      ruleId: "command.mutating"
    });
  }

  if (isReadOnlyCommand(commandName, args)) {
    return allowWithTimeout(request, "command.readonly");
  }

  return allowDecision({
    action: "require_approval",
    reason: "Unknown command side effects require approval.",
    riskLevel: "medium",
    ruleId: "command.unknown"
  });
}

function classifyFileEditRequest(
  request: FileEditPolicyRequest
): Result<PolicyDecision, SpriteError> {
  const unsafePath = request.affectedFiles.find(
    (affectedFile) => !isSafeProjectRelativePath(affectedFile)
  );

  if (unsafePath !== undefined) {
    return allowDecision({
      action: "deny",
      reason: "Unsafe file edit paths are denied.",
      riskLevel: "critical",
      ruleId: "file_edit.path.unsafe"
    });
  }

  if (request.affectedFiles.some(isSecretOrRuntimePath)) {
    return allowDecision({
      action: "deny",
      reason: "Secret or runtime state artifact edits are denied.",
      riskLevel: "critical",
      ruleId: "file_edit.path.secret"
    });
  }

  if (request.affectedFiles.some(isGlobOrDirectoryMutationPath)) {
    return allowDecision({
      action: "require_approval",
      reason: "Glob or directory edit scopes require approval.",
      riskLevel: "medium",
      ruleId: "file_edit.scope.broad"
    });
  }

  if (request.editKind !== "targeted_patch") {
    return allowDecision({
      action: "require_approval",
      reason: "Broad or destructive edit kinds require approval.",
      riskLevel: "high",
      ruleId: `file_edit.${request.editKind}`
    });
  }

  if (request.affectedFiles.length > MAX_TARGETED_PATCH_FILES) {
    return allowDecision({
      action: "require_approval",
      reason: "Edits touching many files require approval.",
      riskLevel: "medium",
      ruleId: "file_edit.too_many_files"
    });
  }

  if (request.affectedFiles.some(isPackageOrConfigPath)) {
    return allowDecision({
      action: "require_approval",
      reason: "Package or project configuration edits require approval.",
      riskLevel: "high",
      ruleId: "file_edit.package_config"
    });
  }

  return allowDecision({
    action: "allow",
    reason: "Targeted patch metadata is bounded and safe.",
    riskLevel: "low",
    ruleId: "file_edit.targeted_patch"
  });
}

function allowWithTimeout(
  request: CommandPolicyRequest,
  allowRuleId: string
): Result<PolicyDecision, SpriteError> {
  if (request.timeoutMs === undefined) {
    return allowDecision({
      action: "modify",
      modifiedRequest: { ...request, timeoutMs: DEFAULT_TIMEOUT_MS },
      reason: "Command request requires a default timeout before execution.",
      riskLevel: "low",
      ruleId: "command.timeout.default"
    });
  }

  if (request.timeoutMs > MAX_TIMEOUT_MS) {
    return allowDecision({
      action: "modify",
      modifiedRequest: { ...request, timeoutMs: MAX_TIMEOUT_MS },
      reason: "Command request timeout is capped to the supported maximum.",
      riskLevel: "low",
      ruleId: "command.timeout.max"
    });
  }

  return allowDecision({
    action: "allow",
    reason: "Command metadata is bounded and read-only.",
    riskLevel: "low",
    ruleId: allowRuleId
  });
}

function allowDecision(
  decision: PolicyDecision
): Result<PolicyDecision, SpriteError> {
  return { ok: true, value: decision };
}

function invalidRequest(message: string): Result<never, SpriteError> {
  return err(new SpriteError("POLICY_INVALID_REQUEST", message));
}

function parseOptionalStringArray(
  value: unknown
): Result<string[] | undefined, SpriteError> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Array.isArray(value)) {
    return invalidRequest("args must be an array of strings.");
  }

  const args: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return invalidRequest("args must contain only strings.");
    }

    args.push(item);
  }

  return { ok: true, value: args };
}

function parseOptionalPositiveInteger(
  value: unknown,
  field: string
): Result<number | undefined, SpriteError> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    return invalidRequest(`${field} must be a positive integer.`);
  }

  return { ok: true, value };
}

function parseOptionalStringRecord(
  value: unknown
): Result<Record<string, string> | undefined, SpriteError> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!isPlainObject(value)) {
    return invalidRequest("env must be an object with string values.");
  }

  const entries: Record<string, string> = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      return invalidRequest("env values must be strings.");
    }

    entries[key] = item;
  }

  return { ok: true, value: entries };
}

function findForbiddenPolicyInputField(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findForbiddenPolicyInputField(item, seen);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_POLICY_INPUT_FIELDS.has(key)) {
      return key;
    }

    const nested = findForbiddenPolicyInputField(item, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function findUnknownField(
  input: Record<string, unknown>,
  allowedFields: Set<string>
): string | null {
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) {
      return key;
    }
  }

  return null;
}

function normalizedCommandName(command: string): string {
  return path.basename(command.trim()).toLowerCase();
}

function summarizeCommand(request: CommandPolicyRequest): string {
  return [request.command.trim(), ...(request.args ?? [])]
    .filter((part) => part.length > 0)
    .join(" ");
}

function isReadOnlyCommand(
  commandName: string,
  args: readonly string[]
): boolean {
  const allowedArgSets = READ_ONLY_COMMANDS.get(commandName);

  if (allowedArgSets === undefined) {
    return false;
  }

  return allowedArgSets.some((allowedArgs) =>
    stringArraysEqual(allowedArgs, args)
  );
}

function isPackageScript(args: readonly string[]): boolean {
  return args[0] === "run" || args.length > 0;
}

function isConfiguredValidationCommand(
  request: CommandPolicyRequest,
  commandName: string,
  args: readonly string[]
): boolean {
  if (
    request.configuredValidation !== true ||
    !PACKAGE_MANAGERS.has(commandName)
  ) {
    return false;
  }

  const scriptName = args[0] === "run" ? args[1] : args[0];

  return scriptName !== undefined && VALIDATION_SCRIPT_NAMES.has(scriptName);
}

function hasCustomEnv(request: CommandPolicyRequest): boolean {
  return request.env !== undefined && Object.keys(request.env).length > 0;
}

function hasForceFlag(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--force" ||
      arg === "-f" ||
      (arg.startsWith("-") && arg.includes("f"))
  );
}

function hasUnsafeValidationArgs(args: readonly string[]): boolean {
  return args.some((arg) => {
    const normalized = normalizedCommandName(arg);
    const lowered = arg.toLowerCase();

    return (
      PACKAGE_MUTATION_ARGS.has(normalized) ||
      NETWORK_COMMANDS.has(normalized) ||
      SHELL_INTERPRETERS.has(normalized) ||
      FILE_WRITING_COMMANDS.has(normalized) ||
      DISK_COMMANDS.has(normalized) ||
      hasForceFlag([arg]) ||
      VALIDATION_WRITE_INDICATORS.has(lowered)
    );
  });
}

function hasTraversalSegment(value: string): boolean {
  return value.split(/[\\/]/).includes("..");
}

function isPotentialCwdEscapeArg(value: string): boolean {
  return path.isAbsolute(value) || hasTraversalSegment(value);
}

function requiresShellParsing(command: string): boolean {
  return /[\s|&;<>$()`]/.test(command.trim());
}

function isShellDownloadExecution(
  commandName: string,
  args: readonly string[]
): boolean {
  const directDownloadExecution =
    NETWORK_COMMANDS.has(commandName) &&
    args.includes("|") &&
    args.some((arg) => SHELL_INTERPRETERS.has(normalizedCommandName(arg)));

  if (directDownloadExecution) {
    return true;
  }

  if (!SHELL_INTERPRETERS.has(commandName)) {
    return false;
  }

  const shellText = args.join(" ").toLowerCase();

  return /\b(curl|wget)\b[\s\S]*\|[\s\S]*\b(sh|bash|zsh|fish)\b/.test(
    shellText
  );
}

function isRootDeletion(commandName: string, args: readonly string[]): boolean {
  return (
    commandName === "rm" &&
    args.some((arg) => arg.includes("r")) &&
    args.includes("/")
  );
}

function isSafeProjectRelativePath(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function isGlobOrDirectoryMutationPath(value: string): boolean {
  return (
    value === "." ||
    value.endsWith("/") ||
    value.endsWith("\\") ||
    /[*?[\]{}]/.test(value)
  );
}

function isSecretOrRuntimePath(value: string): boolean {
  const normalized = value.toLowerCase();
  const segments = normalized.split(/[\\/]/);

  return (
    segments.some((segment) => segment.startsWith(".env")) ||
    segments.includes(".gitnexus") ||
    segments.includes(".sprite") ||
    normalized.includes("credential") ||
    normalized.includes("private_key") ||
    normalized.includes("secret") ||
    normalized.includes("token")
  );
}

function isPackageOrConfigPath(value: string): boolean {
  const basename = path.basename(value).toLowerCase();
  const normalized = value.toLowerCase();

  return (
    basename === "package.json" ||
    basename === "package-lock.json" ||
    basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock" ||
    basename === "bun.lockb" ||
    basename === ".npmrc" ||
    basename.startsWith("tsconfig") ||
    normalized.startsWith(".github/workflows/") ||
    normalized.includes("/.github/workflows/") ||
    /(^|[\\/])[^\\/]*(config|rc)\.(json|js|cjs|mjs|ts|yaml|yml)$/.test(value)
  );
}

function isFileEditKind(
  value: unknown
): value is FileEditPolicyRequest["editKind"] {
  return (
    value === "broad_edit" ||
    value === "delete" ||
    value === "full_file_write" ||
    value === "rename" ||
    value === "targeted_patch"
  );
}

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
