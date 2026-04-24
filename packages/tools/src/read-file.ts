import { SpriteError, err, type Result } from "@sprite/shared";
import { lstat, readFile } from "node:fs/promises";
import {
  summarizeToolOutput,
  type ToolOutputSummary
} from "./output-summarizer.js";
import { createFilesystemSpriteError } from "./filesystem-error.js";
import { resolveProjectPath } from "./path-boundary.js";

export interface ReadFileInput {
  path: string;
}

export interface ReadFileResult {
  content: string;
  output: ToolOutputSummary;
  path: string;
  status: "completed";
  summary: string;
  toolName: "read_file";
}

export async function readProjectFile(
  cwd: string,
  input: ReadFileInput
): Promise<Result<ReadFileResult, SpriteError>> {
  const resolved = await resolveProjectPath(cwd, input.path);

  if (!resolved.ok) {
    return resolved;
  }

  if (!resolved.value.exists || resolved.value.realPath === null) {
    return err(
      new SpriteError(
        "TOOL_FILE_NOT_FOUND",
        "Requested file does not exist inside the project boundary."
      )
    );
  }

  try {
    const stat = await lstat(resolved.value.realPath);

    if (!stat.isFile()) {
      return err(
        new SpriteError("TOOL_PATH_NOT_FILE", "Requested path is not a file.")
      );
    }

    const buffer = await readFile(resolved.value.realPath);

    if (isBinaryBuffer(buffer)) {
      return err(
        new SpriteError(
          "TOOL_UNSUPPORTED_BINARY_FILE",
          "Requested file appears to be binary and is not supported by read_file."
        )
      );
    }

    const content = buffer.toString("utf8");
    const output = summarizeToolOutput(content);

    return {
      ok: true,
      value: {
        content: output.content,
        output,
        path: resolved.value.relativePath,
        status: "completed",
        summary: `read_file completed for ${resolved.value.relativePath} (${output.originalLines} lines, ${output.originalBytes} bytes).`,
        toolName: "read_file"
      }
    };
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_FILESYSTEM_ERROR",
        "read_file could not read the requested file inside the project boundary",
        error
      )
    );
  }
}

function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}
