import { SpriteError, err, type Result } from "@sprite/shared";
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
  searchProjectFiles,
  type SearchFilesInput,
  type SearchFilesResult
} from "./search.js";

export type ToolName = "list_files" | "read_file" | "search_files";

export type ToolExecutionStatus = "completed";

export type ToolExecutionResult =
  | ListFilesResult
  | ReadFileResult
  | SearchFilesResult;

export type ToolInputMap = {
  list_files: ListFilesInput;
  read_file: ReadFileInput;
  search_files: SearchFilesInput;
};

export type ToolExecutionRequest<TName extends ToolName = ToolName> =
  TName extends "read_file"
    ? { cwd: string; input: ReadFileInput; toolName: "read_file" }
    : TName extends "list_files"
      ? { cwd: string; input: ListFilesInput; toolName: "list_files" }
      : TName extends "search_files"
        ? { cwd: string; input: SearchFilesInput; toolName: "search_files" }
        : never;

export class ToolRegistry {
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
    request: ToolExecutionRequest
  ): Promise<Result<ToolExecutionResult, SpriteError>>;
  execute(
    request: ToolExecutionRequest
  ): Promise<Result<ToolExecutionResult, SpriteError>> {
    switch (request.toolName) {
      case "read_file":
        return readProjectFile(request.cwd, request.input as ReadFileInput);
      case "list_files":
        return listProjectFiles(request.cwd, request.input as ListFilesInput);
      case "search_files":
        return searchProjectFiles(
          request.cwd,
          request.input as SearchFilesInput
        );
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
  ListFilesInput,
  ListFilesResult,
  ReadFileInput,
  ReadFileResult,
  SearchFilesInput,
  SearchFilesResult,
  ToolOutputReference,
  ToolOutputSummary
};
