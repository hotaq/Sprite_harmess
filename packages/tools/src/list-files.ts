import { SpriteError, err, type Result } from "@sprite/shared";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { createFilesystemSpriteError } from "./filesystem-error.js";
import {
  DEFAULT_PREVIEW_LINES,
  summarizeToolOutput,
  type ToolOutputSummary
} from "./output-summarizer.js";
import {
  isInsidePath,
  resolveProjectPath,
  toProjectRelativePath
} from "./path-boundary.js";

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);

export interface ListFilesInput {
  path?: string;
  recursive?: boolean;
}

export interface ListFilesEntry {
  path: string;
  type: "directory" | "file" | "symlink";
}

export interface ListFilesResult {
  entries: ListFilesEntry[];
  output: ToolOutputSummary;
  path: string;
  returnedEntryCount: number;
  status: "completed";
  summary: string;
  toolName: "list_files";
  totalEntryCount: number;
}

export async function listProjectFiles(
  cwd: string,
  input: ListFilesInput = {}
): Promise<Result<ListFilesResult, SpriteError>> {
  const inputValidation = validateListFilesInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  const resolved = await resolveProjectPath(cwd, input.path ?? ".");

  if (!resolved.ok) {
    return resolved;
  }

  if (!resolved.value.exists || resolved.value.realPath === null) {
    return err(
      new SpriteError(
        "TOOL_FILE_NOT_FOUND",
        "Requested directory does not exist inside the project boundary."
      )
    );
  }

  try {
    const stat = await lstat(resolved.value.realPath);

    if (resolved.value.symbolicLink && stat.isDirectory()) {
      return err(
        new SpriteError(
          "TOOL_DIRECTORY_SYMLINK_UNSUPPORTED",
          "Directory symlinks are not followed by list_files."
        )
      );
    }

    if (!stat.isDirectory()) {
      return err(
        new SpriteError(
          "TOOL_PATH_NOT_DIRECTORY",
          "Requested path is not a directory."
        )
      );
    }

    const entries = input.recursive
      ? await listRecursive(resolved.value.realPath, resolved.value.projectRoot)
      : await listDirect(resolved.value.realPath, resolved.value.projectRoot);
    const sortedEntries = entries.sort(compareEntries);
    const output = summarizeToolOutput(formatEntries(sortedEntries));
    const returnedEntries = output.truncated
      ? sortedEntries.slice(0, DEFAULT_PREVIEW_LINES)
      : sortedEntries;
    const summary = output.truncated
      ? `list_files completed for ${resolved.value.relativePath} (${sortedEntries.length} entries, returning ${returnedEntries.length} preview entries).`
      : `list_files completed for ${resolved.value.relativePath} (${sortedEntries.length} entries).`;

    return {
      ok: true,
      value: {
        entries: returnedEntries,
        output,
        path: resolved.value.relativePath,
        returnedEntryCount: returnedEntries.length,
        status: "completed",
        summary,
        toolName: "list_files",
        totalEntryCount: sortedEntries.length
      }
    };
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_FILESYSTEM_ERROR",
        "list_files could not inspect the requested path inside the project boundary",
        error
      )
    );
  }
}

function validateListFilesInput(
  input: ListFilesInput
): Result<void, SpriteError> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "list_files input must be an object when provided."
      )
    );
  }

  if (
    input.path !== undefined &&
    (typeof input.path !== "string" || input.path.trim().length === 0)
  ) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "list_files path must be a non-empty string when provided."
      )
    );
  }

  if (input.recursive !== undefined && typeof input.recursive !== "boolean") {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "list_files recursive must be a boolean when provided."
      )
    );
  }

  return { ok: true, value: undefined };
}

async function listDirect(
  directoryPath: string,
  projectRoot: string
): Promise<ListFilesEntry[]> {
  const dirents = await readdir(directoryPath, { withFileTypes: true });
  const entries: ListFilesEntry[] = [];

  for (const dirent of dirents) {
    const absolutePath = path.join(directoryPath, dirent.name);
    entries.push({
      path: toProjectRelativePath(projectRoot, absolutePath),
      type: dirent.isDirectory()
        ? "directory"
        : dirent.isSymbolicLink()
          ? "symlink"
          : "file"
    });
  }

  return entries;
}

async function listRecursive(
  directoryPath: string,
  projectRoot: string
): Promise<ListFilesEntry[]> {
  const entries: ListFilesEntry[] = [];
  const dirents = await readdir(directoryPath, { withFileTypes: true });

  for (const dirent of dirents) {
    const absolutePath = path.join(directoryPath, dirent.name);
    const relativePath = toProjectRelativePath(projectRoot, absolutePath);

    if (!isInsidePath(projectRoot, absolutePath)) {
      continue;
    }

    if (dirent.isSymbolicLink()) {
      continue;
    }

    if (dirent.isDirectory() && DEFAULT_EXCLUDED_DIRECTORIES.has(dirent.name)) {
      continue;
    }

    if (dirent.isDirectory()) {
      entries.push({ path: relativePath, type: "directory" });
      entries.push(...(await listRecursive(absolutePath, projectRoot)));
      continue;
    }

    entries.push({ path: relativePath, type: "file" });
  }

  return entries;
}

function compareEntries(left: ListFilesEntry, right: ListFilesEntry): number {
  return left.path.localeCompare(right.path, "en");
}

function formatEntries(entries: ListFilesEntry[]): string {
  return entries.map((entry) => `${entry.type}\t${entry.path}`).join("\n");
}
