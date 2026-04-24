import { SpriteError, err, type Result } from "@sprite/shared";
import { lstat, readFile, readdir } from "node:fs/promises";
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
const MAX_SNIPPET_LENGTH = 160;

export interface SearchFilesInput {
  path?: string;
  query: string;
}

export interface SearchMatch {
  line: number;
  path: string;
  snippet: string;
}

export interface SearchFilesResult {
  matches: SearchMatch[];
  output: ToolOutputSummary;
  path: string;
  query: string;
  returnedMatchCount: number;
  status: "completed";
  summary: string;
  toolName: "search_files";
  totalMatchCount: number;
}

export async function searchProjectFiles(
  cwd: string,
  input: SearchFilesInput
): Promise<Result<SearchFilesResult, SpriteError>> {
  if (input.query.length === 0) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "search_files query must be non-empty."
      )
    );
  }

  const resolved = await resolveProjectPath(cwd, input.path ?? ".");

  if (!resolved.ok) {
    return resolved;
  }

  if (!resolved.value.exists || resolved.value.realPath === null) {
    return err(
      new SpriteError(
        "TOOL_FILE_NOT_FOUND",
        "Requested search path does not exist inside the project boundary."
      )
    );
  }

  try {
    const stat = await lstat(resolved.value.realPath);

    if (resolved.value.symbolicLink && stat.isDirectory()) {
      return err(
        new SpriteError(
          "TOOL_DIRECTORY_SYMLINK_UNSUPPORTED",
          "Directory symlinks are not followed by search_files."
        )
      );
    }

    if (!stat.isDirectory() && !stat.isFile()) {
      return err(
        new SpriteError(
          "TOOL_PATH_NOT_SEARCHABLE",
          "Requested path is not a searchable file or directory."
        )
      );
    }

    const files = stat.isDirectory()
      ? await collectTextFiles(
          resolved.value.realPath,
          resolved.value.projectRoot
        )
      : [resolved.value.realPath];
    const matches: SearchMatch[] = [];

    for (const filePath of files.sort((left, right) =>
      left.localeCompare(right, "en")
    )) {
      const fileMatches = await searchFile(
        filePath,
        resolved.value.projectRoot,
        input.query
      );
      matches.push(...fileMatches);
    }

    matches.sort((left, right) => {
      const pathComparison = left.path.localeCompare(right.path, "en");
      return pathComparison === 0 ? left.line - right.line : pathComparison;
    });

    const output = summarizeToolOutput(formatMatches(matches));
    const returnedMatches = output.truncated
      ? matches.slice(0, DEFAULT_PREVIEW_LINES)
      : matches;
    const summary = output.truncated
      ? `search_files completed for ${resolved.value.relativePath} (${matches.length} matches, returning ${returnedMatches.length} preview matches).`
      : `search_files completed for ${resolved.value.relativePath} (${matches.length} matches).`;

    return {
      ok: true,
      value: {
        matches: returnedMatches,
        output,
        path: resolved.value.relativePath,
        query: input.query,
        returnedMatchCount: returnedMatches.length,
        status: "completed",
        summary,
        toolName: "search_files",
        totalMatchCount: matches.length
      }
    };
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_FILESYSTEM_ERROR",
        "search_files could not inspect the requested path inside the project boundary",
        error
      )
    );
  }
}

async function collectTextFiles(
  directoryPath: string,
  projectRoot: string
): Promise<string[]> {
  const files: string[] = [];
  const dirents = await readdir(directoryPath, { withFileTypes: true });

  for (const dirent of dirents) {
    const absolutePath = path.join(directoryPath, dirent.name);

    if (!isInsidePath(projectRoot, absolutePath) || dirent.isSymbolicLink()) {
      continue;
    }

    if (dirent.isDirectory()) {
      if (DEFAULT_EXCLUDED_DIRECTORIES.has(dirent.name)) {
        continue;
      }

      files.push(...(await collectTextFiles(absolutePath, projectRoot)));
      continue;
    }

    if (dirent.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function searchFile(
  filePath: string,
  projectRoot: string,
  query: string
): Promise<SearchMatch[]> {
  const buffer = await readFile(filePath);

  if (buffer.includes(0)) {
    return [];
  }

  const content = buffer.toString("utf8");
  const lines = content.split(/\r\n|\r|\n/);
  const matches: SearchMatch[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!line.includes(query)) {
      continue;
    }

    matches.push({
      line: index + 1,
      path: toProjectRelativePath(projectRoot, filePath),
      snippet: createSnippet(line, query)
    });
  }

  return matches;
}

function createSnippet(line: string, query: string): string {
  if (line.length <= MAX_SNIPPET_LENGTH) {
    return line;
  }

  const queryIndex = line.indexOf(query);
  const start = Math.max(
    0,
    queryIndex - Math.floor((MAX_SNIPPET_LENGTH - query.length) / 2)
  );

  return line.slice(start, start + MAX_SNIPPET_LENGTH);
}

function formatMatches(matches: SearchMatch[]): string {
  return matches
    .map((match) => `${match.path}:${match.line}: ${match.snippet}`)
    .join("\n");
}
