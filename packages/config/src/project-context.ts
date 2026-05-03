import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync
} from "node:fs";
import { relative, resolve } from "node:path";
import {
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  type Result
} from "@sprite/shared";

export const PROJECT_CONTEXT_FILE_ORDER = [
  "SPRITE.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules"
] as const;

export const DEFAULT_PROJECT_CONTEXT_MAX_BYTES = 8_192;
const PROJECT_CONTEXT_PREVIEW_MAX_LENGTH = 240;
const PROJECT_CONTEXT_UNTRUSTED_WARNING =
  "Project context files are untrusted repository guidance with lower priority than runtime/system policy.";

export type ProjectContextFileName =
  (typeof PROJECT_CONTEXT_FILE_ORDER)[number];
export type ProjectContextFileStatus =
  | "blocked"
  | "loaded"
  | "skipped"
  | "truncated";
export type ProjectContextTrustLevel = "untrusted";

interface ProjectContextFileRecordBase {
  absolutePath: string;
  fileName: ProjectContextFileName;
  priority: number;
  relativePath: ProjectContextFileName;
  trust: ProjectContextTrustLevel;
}

export interface ProjectContextLoadedFileRecord extends ProjectContextFileRecordBase {
  bytesRead: number;
  content: string;
  preview: string;
  reason?: never;
  redacted: boolean;
  status: "loaded";
  totalBytes: number;
  truncated: false;
}

export interface ProjectContextTruncatedFileRecord extends ProjectContextFileRecordBase {
  bytesRead: number;
  content: string;
  preview: string;
  reason: string;
  redacted: boolean;
  status: "truncated";
  totalBytes: number;
  truncated: true;
}

export interface ProjectContextSkippedFileRecord extends ProjectContextFileRecordBase {
  bytesRead: 0;
  content?: never;
  preview?: never;
  reason: string;
  redacted: false;
  status: "skipped";
  totalBytes: 0;
  truncated: false;
}

export interface ProjectContextBlockedFileRecord extends ProjectContextFileRecordBase {
  bytesRead: 0;
  content?: never;
  preview?: never;
  reason: string;
  redacted: false;
  status: "blocked";
  totalBytes: 0;
  truncated: false;
}

export type ProjectContextFileRecord =
  | ProjectContextBlockedFileRecord
  | ProjectContextLoadedFileRecord
  | ProjectContextSkippedFileRecord
  | ProjectContextTruncatedFileRecord;

export interface ProjectContextLoadOptions {
  maxBytes?: number;
}

export interface ProjectContextLoadResult {
  blockedCount: number;
  cwd: string;
  loadedCount: number;
  records: ProjectContextFileRecord[];
  skippedCount: number;
  truncatedCount: number;
  warning: string;
}

export function loadProjectContextFiles(
  cwd: string,
  options: ProjectContextLoadOptions = {}
): Result<ProjectContextLoadResult, SpriteError> {
  const maxBytes = options.maxBytes ?? DEFAULT_PROJECT_CONTEXT_MAX_BYTES;

  if (!isPositiveInteger(maxBytes)) {
    return err(
      new SpriteError(
        "PROJECT_CONTEXT_INVALID_BUDGET",
        "Project context maxBytes must be a positive integer."
      )
    );
  }

  const projectRoot = resolve(cwd);
  const records = PROJECT_CONTEXT_FILE_ORDER.map((fileName, priority) =>
    loadProjectContextFile(projectRoot, fileName, priority, maxBytes)
  );

  const result: ProjectContextLoadResult = {
    blockedCount: countRecords(records, "blocked"),
    cwd: projectRoot,
    loadedCount: countRecords(records, "loaded"),
    records,
    skippedCount: countRecords(records, "skipped"),
    truncatedCount: countRecords(records, "truncated"),
    warning: PROJECT_CONTEXT_UNTRUSTED_WARNING
  };

  return { ok: true, value: result };
}

function loadProjectContextFile(
  projectRoot: string,
  fileName: ProjectContextFileName,
  priority: number,
  maxBytes: number
): ProjectContextFileRecord {
  const absolutePath = resolve(projectRoot, fileName);
  const baseRecord = createBaseRecord(absolutePath, fileName, priority);

  if (!isDirectProjectFile(projectRoot, absolutePath, fileName)) {
    return {
      ...baseRecord,
      bytesRead: 0,
      reason: "Context file path is outside the resolved project root.",
      redacted: false,
      status: "blocked",
      totalBytes: 0,
      truncated: false
    };
  }

  try {
    const stats = lstatSync(absolutePath);

    if (stats.isSymbolicLink()) {
      return {
        ...baseRecord,
        bytesRead: 0,
        reason: "Context file is a symlink and will not be followed.",
        redacted: false,
        status: "blocked",
        totalBytes: 0,
        truncated: false
      };
    }

    if (!stats.isFile()) {
      return {
        ...baseRecord,
        bytesRead: 0,
        reason: "Context candidate is not a regular file.",
        redacted: false,
        status: "blocked",
        totalBytes: 0,
        truncated: false
      };
    }

    const boundedRead = readBoundedProjectContextFile(absolutePath, maxBytes);
    const truncated = boundedRead.totalBytes > boundedRead.bytesRead;
    const redacted = containsSecretLikeValue(boundedRead.text);
    const content = createRedactedPreview(boundedRead.text, maxBytes);
    const preview = createRedactedPreview(
      boundedRead.text,
      PROJECT_CONTEXT_PREVIEW_MAX_LENGTH
    );

    if (truncated) {
      return {
        ...baseRecord,
        bytesRead: boundedRead.bytesRead,
        content,
        preview,
        reason: `Context file exceeded ${maxBytes} byte budget and was truncated.`,
        redacted,
        status: "truncated",
        totalBytes: boundedRead.totalBytes,
        truncated: true
      };
    }

    return {
      ...baseRecord,
      bytesRead: boundedRead.bytesRead,
      content,
      preview,
      redacted,
      status: "loaded",
      totalBytes: boundedRead.totalBytes,
      truncated: false
    };
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return {
        ...baseRecord,
        bytesRead: 0,
        reason: "Context file is not present.",
        redacted: false,
        status: "skipped",
        totalBytes: 0,
        truncated: false
      };
    }

    return {
      ...baseRecord,
      bytesRead: 0,
      reason: `Context file could not be read: ${formatErrorMessage(error)}`,
      redacted: false,
      status: "blocked",
      totalBytes: 0,
      truncated: false
    };
  }
}

function createBaseRecord(
  absolutePath: string,
  fileName: ProjectContextFileName,
  priority: number
): ProjectContextFileRecordBase {
  return {
    absolutePath,
    fileName,
    priority,
    relativePath: fileName,
    trust: "untrusted"
  };
}

interface BoundedProjectContextRead {
  bytesRead: number;
  text: string;
  totalBytes: number;
}

function readBoundedProjectContextFile(
  absolutePath: string,
  maxBytes: number
): BoundedProjectContextRead {
  const descriptor = openSync(
    absolutePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );

  try {
    const stats = fstatSync(descriptor);

    if (!stats.isFile()) {
      throw new Error("Context candidate is not a regular file.");
    }

    const readLength = Math.min(maxBytes, stats.size);
    const buffer = Buffer.allocUnsafe(readLength);
    const bytesRead =
      readLength === 0 ? 0 : readSync(descriptor, buffer, 0, readLength, 0);

    return {
      bytesRead,
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      totalBytes: stats.size
    };
  } finally {
    closeSync(descriptor);
  }
}

function isDirectProjectFile(
  projectRoot: string,
  absolutePath: string,
  fileName: ProjectContextFileName
): boolean {
  return relative(projectRoot, absolutePath) === fileName;
}

function countRecords(
  records: readonly ProjectContextFileRecord[],
  status: ProjectContextFileStatus
): number {
  return records.filter((record) => record.status === status).length;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
