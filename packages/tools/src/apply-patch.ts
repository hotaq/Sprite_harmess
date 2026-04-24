import { SpriteError, err, type Result } from "@sprite/shared";
import { lstat, readFile, writeFile } from "node:fs/promises";
import {
  summarizeToolOutput,
  type ToolOutputSummary
} from "./output-summarizer.js";
import { createFilesystemSpriteError } from "./filesystem-error.js";
import { resolveProjectPath } from "./path-boundary.js";

export interface ApplyPatchEdit {
  path: string;
  oldText: string;
  newText: string;
}

export interface ApplyPatchInput {
  edits: ApplyPatchEdit[];
  summary?: string;
}

export interface ApplyPatchResult {
  affectedFiles: string[];
  changedFileCount: number;
  output: ToolOutputSummary;
  status: "completed";
  summary: string;
  toolName: "apply_patch";
}

interface PendingFilePatch {
  content: string;
  realPath: string;
  relativePath: string;
}

export async function applyProjectPatch(
  cwd: string,
  input: ApplyPatchInput
): Promise<Result<ApplyPatchResult, SpriteError>> {
  const inputValidation = validateApplyPatchInput(input);

  if (!inputValidation.ok) {
    return inputValidation;
  }

  const pendingFiles = new Map<string, PendingFilePatch>();

  for (const edit of input.edits) {
    const prepared = await preparePatchEdit(cwd, edit, pendingFiles);

    if (!prepared.ok) {
      return prepared;
    }
  }

  try {
    for (const pending of pendingFiles.values()) {
      await writeFile(pending.realPath, pending.content, "utf8");
    }
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_FILESYSTEM_ERROR",
        "apply_patch could not write the requested file inside the project boundary",
        error
      )
    );
  }

  const affectedFiles = Array.from(
    new Set(Array.from(pendingFiles.values()).map((file) => file.relativePath))
  ).sort((left, right) => left.localeCompare(right, "en"));
  const output = summarizeToolOutput(formatAffectedFiles(affectedFiles));

  return {
    ok: true,
    value: {
      affectedFiles,
      changedFileCount: affectedFiles.length,
      output,
      status: "completed",
      summary: `apply_patch completed for ${affectedFiles.length} ${affectedFiles.length === 1 ? "file" : "files"}.`,
      toolName: "apply_patch"
    }
  };
}

function validateApplyPatchInput(
  input: ApplyPatchInput
): Result<void, SpriteError> {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray(input.edits) ||
    input.edits.length === 0
  ) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "apply_patch requires at least one targeted edit."
      )
    );
  }

  for (const edit of input.edits) {
    if (
      typeof edit !== "object" ||
      edit === null ||
      typeof edit.path !== "string" ||
      edit.path.trim().length === 0 ||
      typeof edit.oldText !== "string" ||
      typeof edit.newText !== "string"
    ) {
      return err(
        new SpriteError(
          "TOOL_INVALID_INPUT",
          "apply_patch edits require path, oldText, and newText strings."
        )
      );
    }

    if (edit.oldText.length === 0) {
      return err(
        new SpriteError(
          "TOOL_INVALID_INPUT",
          "apply_patch oldText must be non-empty."
        )
      );
    }

    if (edit.oldText === edit.newText) {
      return err(
        new SpriteError(
          "TOOL_PATCH_NOOP",
          "apply_patch replacement must change the target text."
        )
      );
    }
  }

  return { ok: true, value: undefined };
}

async function preparePatchEdit(
  cwd: string,
  edit: ApplyPatchEdit,
  pendingFiles: Map<string, PendingFilePatch>
): Promise<Result<void, SpriteError>> {
  const resolved = await resolveProjectPath(cwd, edit.path);

  if (!resolved.ok) {
    return resolved;
  }

  if (!resolved.value.exists || resolved.value.realPath === null) {
    return err(
      new SpriteError(
        "TOOL_FILE_NOT_FOUND",
        "Patch target file does not exist inside the project boundary."
      )
    );
  }

  const existing = pendingFiles.get(resolved.value.realPath);

  if (existing !== undefined) {
    const replacement = replaceSingleOccurrence(existing.content, edit);

    if (!replacement.ok) {
      return replacement;
    }

    existing.content = replacement.value;
    return { ok: true, value: undefined };
  }

  try {
    const stat = await lstat(resolved.value.realPath);

    if (!stat.isFile()) {
      return err(
        new SpriteError(
          "TOOL_PATH_NOT_FILE",
          "Patch target path is not a file."
        )
      );
    }

    const buffer = await readFile(resolved.value.realPath);

    if (buffer.includes(0)) {
      return err(
        new SpriteError(
          "TOOL_UNSUPPORTED_BINARY_FILE",
          "Patch target appears to be binary and is not supported by apply_patch."
        )
      );
    }

    const replacement = replaceSingleOccurrence(buffer.toString("utf8"), edit);

    if (!replacement.ok) {
      return replacement;
    }

    pendingFiles.set(resolved.value.realPath, {
      content: replacement.value,
      realPath: resolved.value.realPath,
      relativePath: resolved.value.relativePath
    });
    return { ok: true, value: undefined };
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_FILESYSTEM_ERROR",
        "apply_patch could not inspect the requested file inside the project boundary",
        error
      )
    );
  }
}

function replaceSingleOccurrence(
  content: string,
  edit: ApplyPatchEdit
): Result<string, SpriteError> {
  const firstIndex = content.indexOf(edit.oldText);

  if (firstIndex === -1) {
    return err(
      new SpriteError(
        "TOOL_PATCH_TARGET_NOT_FOUND",
        "Patch target text was not found exactly once."
      )
    );
  }

  if (content.indexOf(edit.oldText, firstIndex + edit.oldText.length) !== -1) {
    return err(
      new SpriteError(
        "TOOL_PATCH_AMBIGUOUS",
        "Patch target text matched more than once."
      )
    );
  }

  return {
    ok: true,
    value:
      content.slice(0, firstIndex) +
      edit.newText +
      content.slice(firstIndex + edit.oldText.length)
  };
}

function formatAffectedFiles(affectedFiles: readonly string[]): string {
  return affectedFiles.map((filePath) => `changed\t${filePath}`).join("\n");
}
