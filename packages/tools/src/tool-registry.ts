import { SpriteError, err, type Result } from "@sprite/shared";
import {
  applyProjectPatch,
  type ApplyPatchInput,
  type ApplyPatchResult
} from "./apply-patch.js";
import {
  listProjectFiles,
  type ListFilesInput,
  type ListFilesResult
} from "./list-files.js";
import {
  type ToolOutputReference,
  type ToolOutputSummary
} from "./output-summarizer.js";
import {
  readProjectFile,
  type ReadFileInput,
  type ReadFileResult
} from "./read-file.js";
import {
  runProjectCommand,
  type RunCommandInput,
  type RunCommandResult
} from "./run-command.js";
import {
  searchProjectFiles,
  type SearchFilesInput,
  type SearchFilesResult
} from "./search.js";

export type ToolName =
  | "apply_patch"
  | "list_files"
  | "read_file"
  | "run_command"
  | "search_files";

export type ToolExecutionStatus = "completed";

export type ToolExecutionResult =
  | ApplyPatchResult
  | ListFilesResult
  | ReadFileResult
  | RunCommandResult
  | SearchFilesResult;

export type ToolInputMap = {
  apply_patch: ApplyPatchInput;
  list_files: ListFilesInput;
  read_file: ReadFileInput;
  run_command: RunCommandInput;
  search_files: SearchFilesInput;
};

export type ToolExecutionRequest<TName extends ToolName = ToolName> =
  TName extends "apply_patch"
    ? { cwd: string; input: ApplyPatchInput; toolName: "apply_patch" }
    : TName extends "read_file"
      ? { cwd: string; input: ReadFileInput; toolName: "read_file" }
      : TName extends "list_files"
        ? { cwd: string; input: ListFilesInput; toolName: "list_files" }
        : TName extends "run_command"
          ? { cwd: string; input: RunCommandInput; toolName: "run_command" }
          : TName extends "search_files"
            ? {
                cwd: string;
                input: SearchFilesInput;
                toolName: "search_files";
              }
            : never;

export class ToolRegistry {
  execute(
    request: ToolExecutionRequest<"apply_patch">
  ): Promise<Result<ApplyPatchResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest<"read_file">
  ): Promise<Result<ReadFileResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest<"list_files">
  ): Promise<Result<ListFilesResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest<"search_files">
  ): Promise<Result<SearchFilesResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest<"run_command">
  ): Promise<Result<RunCommandResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest
  ): Promise<Result<ToolExecutionResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest
  ): Promise<Result<ToolExecutionResult, SpriteError>> {
    switch (request.toolName) {
      case "apply_patch":
        return applyProjectPatch(request.cwd, request.input);
      case "read_file":
        return readProjectFile(request.cwd, request.input);
      case "list_files":
        return listProjectFiles(request.cwd, request.input);
      case "run_command":
        return runProjectCommand(request.cwd, request.input);
      case "search_files":
        return searchProjectFiles(request.cwd, request.input);
    }

    return Promise.resolve(
      err(new SpriteError("TOOL_UNKNOWN", "Unknown tool."))
    );
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

export type {
  ApplyPatchInput,
  ApplyPatchResult,
  ListFilesInput,
  ListFilesResult,
  ReadFileInput,
  ReadFileResult,
  RunCommandInput,
  RunCommandResult,
  SearchFilesInput,
  SearchFilesResult,
  ToolOutputReference,
  ToolOutputSummary
};
