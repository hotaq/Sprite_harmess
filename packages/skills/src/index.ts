import { containsSecretLikeValue, createRedactedPreview } from "@sprite/shared";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export * from "./skill-candidates.js";

export const SKILL_REGISTRY_SCHEMA_VERSION = 1 as const;
export const SKILL_REGISTRY_SOURCES = ["project", "global"] as const;
export const SKILL_LIFECYCLE_STATES = ["manual", "unavailable"] as const;
export const SKILL_INVOCATION_MODES = ["manual"] as const;
export const SKILL_INVOCATION_STATUSES = ["loaded", "failed"] as const;

const DEFAULT_ACTIVATION_HINT = "Manual invocation only.";
const DEFAULT_SKILL_CONTENT_MAX_LENGTH = 4_000;
const SKILL_MANIFEST_FILE_NAME = "SKILL.md";
const FORBIDDEN_METADATA_FIELD_FRAGMENTS = [
  "apikey",
  "apitoken",
  "content",
  "credential",
  "diff",
  "patch",
  "password",
  "passwd",
  "privatekey",
  "raw",
  "rawoutput",
  "secret",
  "stderr",
  "stdout",
  "token"
] as const;

export type SkillRegistrySource = (typeof SKILL_REGISTRY_SOURCES)[number];
export type SkillLifecycleState = (typeof SKILL_LIFECYCLE_STATES)[number];
export type SkillInvocationMode = (typeof SKILL_INVOCATION_MODES)[number];
export type SkillInvocationStatus = (typeof SKILL_INVOCATION_STATUSES)[number];

export type SkillRegistryWarningCode =
  | "SKILL_ENTRY_INVALID"
  | "SKILL_MANIFEST_MALFORMED"
  | "SKILL_MANIFEST_MISSING"
  | "SKILL_MANIFEST_UNREADABLE"
  | "SKILL_MANIFEST_UNSAFE"
  | "SKILL_PATH_ESCAPE"
  | "SKILL_REGISTRY_ROOT_UNREADABLE";

export type SkillInvocationErrorCode =
  | "SKILL_AMBIGUOUS"
  | "SKILL_BLOCKED_BY_POLICY"
  | "SKILL_CONTENT_UNREADABLE"
  | "SKILL_CONTENT_UNSAFE"
  | "SKILL_NOT_FOUND"
  | "SKILL_PATH_ESCAPE"
  | "SKILL_UNAVAILABLE";

export interface SkillRegistryRoot {
  exists: boolean;
  path: string;
  source: SkillRegistrySource;
}

export interface SkillRegistryWarning {
  code: SkillRegistryWarningCode;
  message: string;
  registryRoot: string;
  relativePath?: string;
  severity: "warning";
  source: SkillRegistrySource;
}

export interface SkillRegistryEntry {
  activationHint: string;
  description: string;
  id: string;
  lifecycleState: "manual";
  manifestPath: string;
  name: string;
  registryRoot: string;
  relativePath: string;
  source: SkillRegistrySource;
}

export interface UnavailableSkillRegistryEntry {
  id: string;
  lifecycleState: "unavailable";
  manifestPath?: string;
  registryRoot: string;
  relativePath?: string;
  source: SkillRegistrySource;
  warning: SkillRegistryWarning;
}

export interface ListSkillsResult {
  registryRoots: SkillRegistryRoot[];
  schemaVersion: typeof SKILL_REGISTRY_SCHEMA_VERSION;
  skills: SkillRegistryEntry[];
  unavailableSkills: UnavailableSkillRegistryEntry[];
  warnings: SkillRegistryWarning[];
}

export interface ListSkillsOptions {
  cwd?: string;
  globalSkillsDir?: string;
  homeDir?: string;
  projectSkillsDir?: string;
}

export interface SkillInvocationRequest extends ListSkillsOptions {
  maxContentLength?: number;
  reference: string;
}

export interface InvokedSkillContext {
  activationHint: string;
  content: string;
  contentLength: number;
  contentTruncated: boolean;
  description: string;
  id: string;
  invocationMode: "manual";
  invokedBy: "user";
  lifecycleState: "manual";
  name: string;
  source: SkillRegistrySource;
}

export interface SkillInvocationRecoverableError {
  code: SkillInvocationErrorCode;
  invocationMode: "manual";
  invokedBy: "user";
  message: string;
  recoverable: true;
  reference: string;
  source?: SkillRegistrySource;
}

export type ManualSkillInvocationResult =
  | {
      ok: true;
      skill: InvokedSkillContext;
      status: "loaded";
      warnings: SkillRegistryWarning[];
    }
  | {
      error: SkillInvocationRecoverableError;
      ok: false;
      status: "failed";
      warnings: SkillRegistryWarning[];
    };

export interface SkillFrontmatterParseResult {
  fields: Record<string, string>;
  ok: boolean;
  reason?: string;
}

export interface ValidateSkillRegistryEntryInput {
  fields: Record<string, string>;
  manifestPath: string;
  registryRoot: string;
  relativePath: string;
  source: SkillRegistrySource;
}

export type ValidateSkillRegistryEntryResult =
  | {
      entry: SkillRegistryEntry;
      ok: true;
    }
  | {
      ok: false;
      warning: SkillRegistryWarning;
    };

export function resolveSkillRegistryRoots(
  options: ListSkillsOptions = {}
): SkillRegistryRoot[] {
  return resolveSkillRegistryRootsForScan(options).map((root) => ({
    ...root,
    path: createSafePathPreview(root.path)
  }));
}

function resolveSkillRegistryRootsForScan(
  options: ListSkillsOptions = {}
): SkillRegistryRoot[] {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeDir =
    options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "";
  const projectRoot = resolve(
    options.projectSkillsDir ?? resolve(cwd, ".sprite", "skills")
  );
  const globalRoot = resolve(
    options.globalSkillsDir ??
      (homeDir === ""
        ? resolve(cwd, ".sprite", "global-skills-unavailable")
        : resolve(homeDir, ".sprite", "skills"))
  );

  return [
    {
      exists: isExistingDirectory(projectRoot),
      path: projectRoot,
      source: "project"
    },
    {
      exists: isExistingDirectory(globalRoot),
      path: globalRoot,
      source: "global"
    }
  ];
}

export function listAvailableSkills(
  options: ListSkillsOptions = {}
): ListSkillsResult {
  return sanitizeListSkillsResult(collectAvailableSkills(options));
}

export function invokeManualSkill(
  request: SkillInvocationRequest
): ManualSkillInvocationResult {
  const reference = createRedactedPreview(request.reference, 160);
  const parsedReference = parseSkillReference(request.reference);
  const registry = collectAvailableSkills(request);
  const warnings = sanitizeListSkillsResult(registry).warnings;

  if (parsedReference === null) {
    return createFailedSkillInvocationResult(
      "SKILL_NOT_FOUND",
      reference,
      "Manual skill reference must be a non-empty skill name or source-qualified skill name.",
      undefined,
      warnings
    );
  }

  const matchingSkills = registry.skills.filter((skill) =>
    matchesSkillReference(skill, parsedReference)
  );

  if (matchingSkills.length > 1) {
    return createFailedSkillInvocationResult(
      "SKILL_AMBIGUOUS",
      reference,
      "Manual skill reference matched multiple sources; use project:<name> or global:<name>.",
      parsedReference.source,
      warnings
    );
  }

  if (matchingSkills.length === 0) {
    const unavailable = registry.unavailableSkills.find((skill) =>
      matchesUnavailableSkillReference(skill, parsedReference)
    );

    if (unavailable !== undefined) {
      return createFailedSkillInvocationResult(
        unavailable.warning.code === "SKILL_PATH_ESCAPE"
          ? "SKILL_PATH_ESCAPE"
          : unavailable.warning.code === "SKILL_MANIFEST_UNSAFE"
            ? "SKILL_BLOCKED_BY_POLICY"
            : "SKILL_UNAVAILABLE",
        reference,
        unavailable.warning.message,
        unavailable.source,
        warnings
      );
    }

    return createFailedSkillInvocationResult(
      "SKILL_NOT_FOUND",
      reference,
      "Manual skill reference did not match an available skill.",
      parsedReference.source,
      warnings
    );
  }

  const skill = matchingSkills[0];
  const content = loadSkillContextContent(
    skill,
    request.maxContentLength ?? DEFAULT_SKILL_CONTENT_MAX_LENGTH
  );

  if (!content.ok) {
    return createFailedSkillInvocationResult(
      content.code,
      reference,
      content.message,
      skill.source,
      warnings
    );
  }

  const safeSkill = sanitizeSkillRegistryEntry(skill);

  return {
    ok: true,
    skill: {
      activationHint: safeSkill.activationHint,
      content: content.content,
      contentLength: content.contentLength,
      contentTruncated: content.contentTruncated,
      description: safeSkill.description,
      id: safeSkill.id,
      invocationMode: "manual",
      invokedBy: "user",
      lifecycleState: "manual",
      name: safeSkill.name,
      source: safeSkill.source
    },
    status: "loaded",
    warnings
  };
}

function collectAvailableSkills(
  options: ListSkillsOptions = {}
): ListSkillsResult {
  const registryRoots = resolveSkillRegistryRootsForScan(options);
  const skills: SkillRegistryEntry[] = [];
  const unavailableSkills: UnavailableSkillRegistryEntry[] = [];
  const warnings: SkillRegistryWarning[] = [];

  for (const root of registryRoots) {
    scanRegistryRoot(root, skills, unavailableSkills, warnings);
  }

  return {
    registryRoots,
    schemaVersion: SKILL_REGISTRY_SCHEMA_VERSION,
    skills,
    unavailableSkills,
    warnings
  };
}

export function parseSkillFrontmatter(
  manifestContent: string
): SkillFrontmatterParseResult {
  const lines = manifestContent.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return {
      fields: {},
      ok: false,
      reason: "SKILL.md must start with bounded frontmatter."
    };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );

  if (closingIndex === -1) {
    return {
      fields: {},
      ok: false,
      reason: "SKILL.md frontmatter must be closed before the body."
    };
  }

  const fields: Record<string, string> = {};

  for (const rawLine of lines.slice(1, closingIndex)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);

    if (match === null) {
      return {
        fields: {},
        ok: false,
        reason: "SKILL.md frontmatter contains an unsupported metadata line."
      };
    }

    const [, key, value] = match;

    if (fields[key] !== undefined) {
      return {
        fields: {},
        ok: false,
        reason: "SKILL.md frontmatter contains duplicate metadata keys."
      };
    }

    fields[key] = unquoteScalar(value);
  }

  return { fields, ok: true };
}

export function validateSkillRegistryEntry(
  input: ValidateSkillRegistryEntryInput
): ValidateSkillRegistryEntryResult {
  const unsafeField = Object.keys(input.fields).find((key) =>
    isUnsafeMetadataField(key)
  );
  const unsafeValue = Object.values(input.fields).some((value) =>
    containsSecretLikeValue(value)
  );

  if (unsafeField !== undefined || unsafeValue) {
    return {
      ok: false,
      warning: createWarning(
        "SKILL_MANIFEST_UNSAFE",
        input.source,
        input.registryRoot,
        input.relativePath,
        "Skill manifest contains unsafe metadata and was not listed."
      )
    };
  }

  const name = input.fields.name;
  const description = input.fields.description;

  if (
    name === undefined ||
    description === undefined ||
    name.trim().length === 0 ||
    description.trim().length === 0
  ) {
    return {
      ok: false,
      warning: createWarning(
        "SKILL_MANIFEST_MALFORMED",
        input.source,
        input.registryRoot,
        input.relativePath,
        "Skill manifest must include non-empty name and description metadata."
      )
    };
  }

  const safeName = createRedactedPreview(name, 80);
  const safeDescription = createRedactedPreview(description, 240);
  const safeActivationHint =
    input.fields.activationHint === undefined ||
    input.fields.activationHint.trim().length === 0
      ? DEFAULT_ACTIVATION_HINT
      : createRedactedPreview(input.fields.activationHint, 160);

  return {
    entry: {
      activationHint: safeActivationHint,
      description: safeDescription,
      id: createSkillId(input.source, safeName, input.relativePath),
      lifecycleState: "manual",
      manifestPath: input.manifestPath,
      name: safeName,
      registryRoot: input.registryRoot,
      relativePath: input.relativePath,
      source: input.source
    },
    ok: true
  };
}

function scanRegistryRoot(
  root: SkillRegistryRoot,
  skills: SkillRegistryEntry[],
  unavailableSkills: UnavailableSkillRegistryEntry[],
  warnings: SkillRegistryWarning[]
): void {
  if (!root.exists) {
    if (existsSync(root.path)) {
      addUnavailableWarning(
        root,
        undefined,
        undefined,
        createWarning(
          "SKILL_REGISTRY_ROOT_UNREADABLE",
          root.source,
          root.path,
          undefined,
          "Skill registry root exists but could not be read as a directory."
        ),
        unavailableSkills,
        warnings
      );
    }

    return;
  }

  let rootRealPath: string;
  let entries: string[];

  try {
    rootRealPath = realpathSync(root.path);
    entries = readdirSync(root.path).sort((left, right) =>
      left.localeCompare(right, "en")
    );
  } catch {
    addUnavailableWarning(
      root,
      undefined,
      undefined,
      createWarning(
        "SKILL_REGISTRY_ROOT_UNREADABLE",
        root.source,
        root.path,
        undefined,
        "Skill registry root exists but could not be read."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  for (const entryName of entries) {
    scanRegistryEntry(
      root,
      rootRealPath,
      entryName,
      skills,
      unavailableSkills,
      warnings
    );
  }
}

function scanRegistryEntry(
  root: SkillRegistryRoot,
  rootRealPath: string,
  entryName: string,
  skills: SkillRegistryEntry[],
  unavailableSkills: UnavailableSkillRegistryEntry[],
  warnings: SkillRegistryWarning[]
): void {
  const entryPath = resolve(root.path, entryName);
  const manifestPath = resolve(entryPath, SKILL_MANIFEST_FILE_NAME);
  const relativePath = toSafeRelativePath(root.path, manifestPath);

  let entryRealPath: string;

  try {
    entryRealPath = realpathSync(entryPath);
  } catch {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      createWarning(
        "SKILL_ENTRY_INVALID",
        root.source,
        root.path,
        relativePath,
        "Skill registry entry could not be resolved."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  if (!isPathInside(rootRealPath, entryRealPath)) {
    addUnavailableWarning(
      root,
      relativePath,
      undefined,
      createWarning(
        "SKILL_PATH_ESCAPE",
        root.source,
        root.path,
        relativePath,
        "Skill registry entry resolves outside its expected root."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  if (!isExistingDirectory(entryPath)) {
    addUnavailableWarning(
      root,
      toSafeRelativePath(root.path, entryPath),
      undefined,
      createWarning(
        "SKILL_ENTRY_INVALID",
        root.source,
        root.path,
        toSafeRelativePath(root.path, entryPath),
        "Skill registry entry must be a directory containing SKILL.md."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  if (!existsSync(manifestPath)) {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      createWarning(
        "SKILL_MANIFEST_MISSING",
        root.source,
        root.path,
        relativePath,
        "Skill registry entry is missing SKILL.md."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  try {
    if (!isPathInside(rootRealPath, realpathSync(manifestPath))) {
      addUnavailableWarning(
        root,
        relativePath,
        undefined,
        createWarning(
          "SKILL_PATH_ESCAPE",
          root.source,
          root.path,
          relativePath,
          "Skill manifest resolves outside its expected registry root."
        ),
        unavailableSkills,
        warnings
      );
      return;
    }
  } catch {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      createWarning(
        "SKILL_MANIFEST_UNREADABLE",
        root.source,
        root.path,
        relativePath,
        "Skill manifest exists but could not be resolved."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  let manifestContent: string;

  try {
    manifestContent = readFileSync(manifestPath, "utf8");
  } catch {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      createWarning(
        "SKILL_MANIFEST_UNREADABLE",
        root.source,
        root.path,
        relativePath,
        "Skill manifest exists but could not be read."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  const parsed = parseSkillFrontmatter(manifestContent);

  if (!parsed.ok) {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      createWarning(
        "SKILL_MANIFEST_MALFORMED",
        root.source,
        root.path,
        relativePath,
        parsed.reason ?? "Skill manifest metadata is malformed."
      ),
      unavailableSkills,
      warnings
    );
    return;
  }

  const validated = validateSkillRegistryEntry({
    fields: parsed.fields,
    manifestPath,
    registryRoot: root.path,
    relativePath,
    source: root.source
  });

  if (!validated.ok) {
    addUnavailableWarning(
      root,
      relativePath,
      manifestPath,
      validated.warning,
      unavailableSkills,
      warnings
    );
    return;
  }

  skills.push(validated.entry);
}

function addUnavailableWarning(
  root: SkillRegistryRoot,
  relativePath: string | undefined,
  manifestPath: string | undefined,
  warning: SkillRegistryWarning,
  unavailableSkills: UnavailableSkillRegistryEntry[],
  warnings: SkillRegistryWarning[]
): void {
  warnings.push(warning);
  unavailableSkills.push({
    id: createUnavailableSkillId(root.source, relativePath ?? root.path),
    lifecycleState: "unavailable",
    manifestPath,
    registryRoot: root.path,
    relativePath,
    source: root.source,
    warning
  });
}

function createWarning(
  code: SkillRegistryWarningCode,
  source: SkillRegistrySource,
  registryRoot: string,
  relativePath: string | undefined,
  message: string
): SkillRegistryWarning {
  return {
    code,
    message: createRedactedPreview(message, 240),
    registryRoot,
    relativePath,
    severity: "warning",
    source
  };
}

function isExistingDirectory(pathValue: string): boolean {
  try {
    return statSync(pathValue).isDirectory();
  } catch {
    return false;
  }
}

function isPathInside(rootPath: string, childPath: string): boolean {
  const relativePath = relative(rootPath, childPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function toSafeRelativePath(rootPath: string, pathValue: string): string {
  return relative(rootPath, pathValue).replace(/\\/g, "/");
}

function isUnsafeMetadataField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    FORBIDDEN_METADATA_FIELD_FRAGMENTS.some((fragment) =>
      normalized.includes(fragment)
    ) || containsSecretLikeValue(key)
  );
}

function sanitizeListSkillsResult(result: ListSkillsResult): ListSkillsResult {
  return {
    registryRoots: result.registryRoots.map((root) => ({
      ...root,
      path: createSafePathPreview(root.path)
    })),
    schemaVersion: result.schemaVersion,
    skills: result.skills.map((skill) => sanitizeSkillRegistryEntry(skill)),
    unavailableSkills: result.unavailableSkills.map((skill) =>
      sanitizeUnavailableSkillRegistryEntry(skill)
    ),
    warnings: result.warnings.map((warning) =>
      sanitizeSkillRegistryWarning(warning)
    )
  };
}

function sanitizeSkillRegistryEntry(
  skill: SkillRegistryEntry
): SkillRegistryEntry {
  const relativePath = createSafePathPreview(skill.relativePath);

  return {
    ...skill,
    id: createSkillId(skill.source, skill.name, relativePath),
    manifestPath: createSafePathPreview(skill.manifestPath),
    registryRoot: createSafePathPreview(skill.registryRoot),
    relativePath
  };
}

function sanitizeUnavailableSkillRegistryEntry(
  skill: UnavailableSkillRegistryEntry
): UnavailableSkillRegistryEntry {
  const relativePath =
    skill.relativePath === undefined
      ? undefined
      : createSafePathPreview(skill.relativePath);
  const registryRoot = createSafePathPreview(skill.registryRoot);

  return {
    ...skill,
    id: createUnavailableSkillId(skill.source, relativePath ?? registryRoot),
    manifestPath:
      skill.manifestPath === undefined
        ? undefined
        : createSafePathPreview(skill.manifestPath),
    registryRoot,
    relativePath,
    warning: sanitizeSkillRegistryWarning(skill.warning)
  };
}

function sanitizeSkillRegistryWarning(
  warning: SkillRegistryWarning
): SkillRegistryWarning {
  return {
    ...warning,
    registryRoot: createSafePathPreview(warning.registryRoot),
    relativePath:
      warning.relativePath === undefined
        ? undefined
        : createSafePathPreview(warning.relativePath)
  };
}

interface ParsedSkillReference {
  name: string;
  source?: SkillRegistrySource;
}

type SkillContentLoadResult =
  | {
      content: string;
      contentLength: number;
      contentTruncated: boolean;
      ok: true;
    }
  | {
      code: SkillInvocationErrorCode;
      message: string;
      ok: false;
    };

function parseSkillReference(reference: string): ParsedSkillReference | null {
  const trimmed = reference.trim();

  if (trimmed.length === 0 || containsSecretLikeValue(trimmed)) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");

  if (separatorIndex === -1) {
    return { name: trimmed };
  }

  const source = trimmed.slice(0, separatorIndex);
  const name = trimmed.slice(separatorIndex + 1).trim();

  if (
    name.length === 0 ||
    !SKILL_REGISTRY_SOURCES.includes(source as SkillRegistrySource)
  ) {
    return null;
  }

  return {
    name,
    source: source as SkillRegistrySource
  };
}

function matchesSkillReference(
  skill: SkillRegistryEntry,
  reference: ParsedSkillReference
): boolean {
  if (reference.source !== undefined && skill.source !== reference.source) {
    return false;
  }

  return (
    skill.name === reference.name ||
    skill.id === reference.name ||
    getRegistryDirectoryName(skill.relativePath) === reference.name
  );
}

function matchesUnavailableSkillReference(
  skill: UnavailableSkillRegistryEntry,
  reference: ParsedSkillReference
): boolean {
  if (reference.source !== undefined && skill.source !== reference.source) {
    return false;
  }

  return (
    skill.id === reference.name ||
    (skill.relativePath !== undefined &&
      getRegistryDirectoryName(skill.relativePath) === reference.name)
  );
}

function getRegistryDirectoryName(relativePathValue: string): string {
  return relativePathValue.split("/")[0] ?? relativePathValue;
}

function loadSkillContextContent(
  skill: SkillRegistryEntry,
  maxContentLength: number
): SkillContentLoadResult {
  const normalizedMaxContentLength =
    normalizeSkillContentMaxLength(maxContentLength);

  try {
    const rootRealPath = realpathSync(skill.registryRoot);
    const manifestRealPath = realpathSync(skill.manifestPath);

    if (!isPathInside(rootRealPath, manifestRealPath)) {
      return {
        code: "SKILL_PATH_ESCAPE",
        message: "Skill manifest resolves outside its expected registry root.",
        ok: false
      };
    }
  } catch {
    return {
      code: "SKILL_CONTENT_UNREADABLE",
      message: "Skill manifest exists but could not be resolved for loading.",
      ok: false
    };
  }

  let manifestContent: string;

  try {
    manifestContent = readFileSync(skill.manifestPath, "utf8");
  } catch {
    return {
      code: "SKILL_CONTENT_UNREADABLE",
      message: "Skill manifest exists but could not be read for loading.",
      ok: false
    };
  }

  const body = stripSkillFrontmatterBody(manifestContent).trim();

  if (containsSecretLikeValue(body)) {
    return {
      code: "SKILL_BLOCKED_BY_POLICY",
      message: "Skill content contains secret-looking or unsafe values.",
      ok: false
    };
  }

  const contentTruncated = body.length > normalizedMaxContentLength;
  const content = contentTruncated
    ? body.slice(0, normalizedMaxContentLength).trimEnd()
    : body;

  return {
    content,
    contentLength: body.length,
    contentTruncated,
    ok: true
  };
}

function stripSkillFrontmatterBody(manifestContent: string): string {
  const lines = manifestContent.replace(/^\uFEFF/, "").split(/\r?\n/);
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );

  if (lines[0]?.trim() !== "---" || closingIndex === -1) {
    return "";
  }

  return lines.slice(closingIndex + 1).join("\n");
}

function normalizeSkillContentMaxLength(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_SKILL_CONTENT_MAX_LENGTH;
  }

  return Math.min(value, DEFAULT_SKILL_CONTENT_MAX_LENGTH);
}

function createFailedSkillInvocationResult(
  code: SkillInvocationErrorCode,
  reference: string,
  message: string,
  source: SkillRegistrySource | undefined,
  warnings: SkillRegistryWarning[]
): ManualSkillInvocationResult {
  return {
    error: {
      code,
      invocationMode: "manual",
      invokedBy: "user",
      message: createRedactedPreview(message, 240),
      recoverable: true,
      reference,
      ...(source === undefined ? {} : { source })
    },
    ok: false,
    status: "failed",
    warnings
  };
}

function createSafePathPreview(pathValue: string): string {
  return createRedactedPreview(pathValue, 512);
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function createSkillId(
  source: SkillRegistrySource,
  name: string,
  relativePath: string
): string {
  return `skill_${source}_${slugify(name)}_${slugify(relativePath)}`;
}

function createUnavailableSkillId(
  source: SkillRegistrySource,
  pathValue: string
): string {
  return `skill_unavailable_${source}_${slugify(pathValue)}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return slug.length === 0 ? "unknown" : slug;
}
