import type {
  ListFilesEntry,
  ToolExecutionResult,
  ToolName
} from "@sprite/tools";
import {
  SpriteError,
  containsSecretLikeValue,
  err,
  type Result
} from "@sprite/shared";
import path from "node:path";

export { containsSecretLikeValue } from "@sprite/shared";

export const FILE_ACTIVITY_KINDS = [
  "changed",
  "listed",
  "proposed_change",
  "read",
  "searched"
] as const;

const FILE_ACTIVITY_TOOL_NAMES = [
  "apply_patch",
  "list_files",
  "read_file",
  "run_command",
  "search_files"
] as const satisfies readonly ToolName[];
const FORBIDDEN_FILE_ACTIVITY_FIELDS = new Set([
  "content",
  "diff",
  "hunk",
  "newText",
  "oldText",
  "patch",
  "query",
  "rawContent",
  "rawSnippet",
  "snippet",
  "snippets"
]);
const MAX_LIST_ACTIVITY_ENTRIES = 80;

export type FileActivityKind = (typeof FILE_ACTIVITY_KINDS)[number];
export type FileActivityToolName = (typeof FILE_ACTIVITY_TOOL_NAMES)[number];

export interface FileActivityRecord {
  activityId: string;
  correlationId: string;
  createdAt: string;
  kind: FileActivityKind;
  path: string;
  returnedItemCount?: number;
  sessionId: string;
  status: "recorded";
  summary: string;
  taskId: string;
  toolCallId?: string;
  toolName?: FileActivityToolName;
  totalItemCount?: number;
}

export interface FileActivityDraft {
  kind: FileActivityKind;
  path: string;
  returnedItemCount?: number;
  summary: string;
  toolName?: FileActivityToolName;
  totalItemCount?: number;
}

export interface FileActivityGroups {
  filesChanged: string[];
  filesProposedForChange: string[];
  filesRead: string[];
}

export function deriveFileActivityDrafts(
  result: ToolExecutionResult
): FileActivityDraft[] {
  switch (result.toolName) {
    case "apply_patch":
      return uniqueSortedPaths(result.affectedFiles).map((affectedPath) => ({
        kind: "changed",
        path: affectedPath,
        summary: "apply_patch recorded changed activity.",
        toolName: result.toolName
      }));
    case "read_file":
      return [
        {
          kind: "read",
          path: result.path,
          summary: "read_file recorded read activity.",
          toolName: result.toolName
        }
      ];
    case "run_command":
      return [];
    case "list_files":
      return [
        {
          kind: "listed",
          path: result.path,
          returnedItemCount: result.returnedEntryCount,
          summary: "list_files recorded listed activity.",
          toolName: result.toolName,
          totalItemCount: result.totalEntryCount
        },
        ...listEntryDrafts(result.entries)
      ];
    case "search_files":
      return uniqueSortedPaths(result.matches.map((match) => match.path)).map(
        (matchPath) => ({
          kind: "searched",
          path: matchPath,
          returnedItemCount: result.returnedMatchCount,
          summary: "search_files recorded searched activity.",
          toolName: result.toolName,
          totalItemCount: result.totalMatchCount
        })
      );
  }
}

export function groupFileActivity(
  records: readonly FileActivityRecord[]
): FileActivityGroups {
  return {
    filesChanged: uniqueSortedPaths(
      records
        .filter((record) => record.kind === "changed")
        .map((record) => record.path)
    ),
    filesProposedForChange: uniqueSortedPaths(
      records
        .filter((record) => record.kind === "proposed_change")
        .map((record) => record.path)
    ),
    filesRead: uniqueSortedPaths(
      records
        .filter(
          (record) =>
            record.kind === "listed" ||
            record.kind === "read" ||
            record.kind === "searched"
        )
        .map((record) => record.path)
    )
  };
}

export function validateFileActivityPath(
  value: string
): Result<string, SpriteError> {
  if (
    value.trim().length === 0 ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    return err(
      new SpriteError(
        "FILE_ACTIVITY_INVALID_PATH",
        "File activity path must be a non-empty project-relative path."
      )
    );
  }

  return { ok: true, value };
}

export function findForbiddenFileActivityField(
  payload: Record<string, unknown>
): string | null {
  return findForbiddenField(payload, new WeakSet());
}

function findForbiddenField(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findForbiddenField(item, seen);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_FILE_ACTIVITY_FIELDS.has(key)) {
      return key;
    }

    const nested = findForbiddenField(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

export function isFileActivityKind(value: string): value is FileActivityKind {
  return FILE_ACTIVITY_KINDS.includes(value as FileActivityKind);
}

export function isFileActivityToolName(
  value: string
): value is FileActivityToolName {
  return FILE_ACTIVITY_TOOL_NAMES.includes(value as FileActivityToolName);
}

function listEntryDrafts(
  entries: readonly ListFilesEntry[]
): FileActivityDraft[] {
  return entries.slice(0, MAX_LIST_ACTIVITY_ENTRIES).map((entry) => ({
    kind: "listed",
    path: entry.path,
    summary: "list_files recorded listed activity.",
    toolName: "list_files"
  }));
}

function uniqueSortedPaths(paths: readonly string[]): string[] {
  return Array.from(new Set(paths)).sort((left, right) =>
    left.localeCompare(right, "en")
  );
}
