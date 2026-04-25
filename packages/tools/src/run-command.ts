import { runSandboxCommand } from "@sprite/sandbox";
import { SpriteError, err, type Result } from "@sprite/shared";
import path from "node:path";
import {
  summarizeToolOutput,
  type ToolOutputSummary
} from "./output-summarizer.js";

export interface RunCommandInput {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface RunCommandResult {
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number;
  output: ToolOutputSummary;
  status: "completed";
  stderr: string;
  stdout: string;
  summary: string;
  timedOut: false;
  timeoutMs: number;
  toolName: "run_command";
}

export interface RunCommandFailureMetadata {
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  outputReference: ToolOutputSummary["reference"];
  timedOut: boolean;
  timeoutMs: number;
}

export class RunCommandError extends SpriteError {
  readonly commandMetadata: RunCommandFailureMetadata;

  constructor(
    code: "TOOL_COMMAND_FAILED" | "TOOL_COMMAND_TIMEOUT",
    message: string,
    commandMetadata: RunCommandFailureMetadata
  ) {
    super(code, message);
    this.commandMetadata = commandMetadata;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function runProjectCommand(
  projectRoot: string,
  input: RunCommandInput
): Promise<Result<RunCommandResult, SpriteError>> {
  const validation = validateRunCommandInput(input);

  if (!validation.ok) {
    return validation;
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commandCwd =
    input.cwd === undefined
      ? projectRoot
      : path.resolve(projectRoot, input.cwd);
  const sandboxResult = await runSandboxCommand({
    ...(input.args === undefined ? {} : { args: input.args }),
    command: input.command.trim(),
    cwd: commandCwd,
    ...(input.env === undefined ? {} : { env: input.env }),
    projectRoot,
    timeoutMs
  });

  if (!sandboxResult.ok) {
    return sandboxResult;
  }

  const result = sandboxResult.value;
  const output = summarizeToolOutput(formatCommandOutput(result));

  if (result.timedOut) {
    return err(
      new RunCommandError(
        "TOOL_COMMAND_TIMEOUT",
        `run_command timed out after ${result.timeoutMs}ms.`,
        createRunCommandFailureMetadata(result, output)
      )
    );
  }

  if (result.status === "failed" || result.exitCode !== 0) {
    return err(
      new RunCommandError(
        "TOOL_COMMAND_FAILED",
        `run_command exited with code ${String(result.exitCode)}.`,
        createRunCommandFailureMetadata(result, output)
      )
    );
  }

  return {
    ok: true,
    value: {
      command: summarizeCommand(result.command, result.args),
      cwd: result.cwd,
      durationMs: result.durationMs,
      exitCode: result.exitCode ?? 0,
      output,
      status: "completed",
      stderr: result.stderr,
      stdout: result.stdout,
      summary: `run_command completed with exit code ${String(result.exitCode ?? 0)}.`,
      timedOut: false,
      timeoutMs: result.timeoutMs,
      toolName: "run_command"
    }
  };
}

export function getRunCommandErrorMetadata(
  error: unknown
): RunCommandFailureMetadata | null {
  return error instanceof RunCommandError ? error.commandMetadata : null;
}

function validateRunCommandInput(
  input: RunCommandInput
): Result<void, SpriteError> {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.command !== "string" ||
    input.command.trim().length === 0
  ) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "run_command requires a non-empty command string."
      )
    );
  }

  if (
    input.args !== undefined &&
    (!Array.isArray(input.args) ||
      input.args.some((arg) => typeof arg !== "string"))
  ) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "run_command args must be an array of strings when provided."
      )
    );
  }

  if (input.cwd !== undefined && typeof input.cwd !== "string") {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "run_command cwd must be a string when provided."
      )
    );
  }

  if (
    input.timeoutMs !== undefined &&
    (typeof input.timeoutMs !== "number" ||
      !Number.isInteger(input.timeoutMs) ||
      input.timeoutMs <= 0)
  ) {
    return err(
      new SpriteError(
        "TOOL_INVALID_INPUT",
        "run_command timeoutMs must be a positive integer when provided."
      )
    );
  }

  if (input.env !== undefined) {
    if (
      typeof input.env !== "object" ||
      input.env === null ||
      Array.isArray(input.env)
    ) {
      return err(
        new SpriteError(
          "TOOL_INVALID_INPUT",
          "run_command env must be an object with string values when provided."
        )
      );
    }

    for (const value of Object.values(input.env)) {
      if (typeof value !== "string") {
        return err(
          new SpriteError(
            "TOOL_INVALID_INPUT",
            "run_command env values must be strings."
          )
        );
      }
    }
  }

  return { ok: true, value: undefined };
}

function formatCommandOutput(result: {
  stderr: string;
  stdout: string;
}): string {
  if (result.stderr.length === 0) {
    return result.stdout;
  }

  if (result.stdout.length === 0) {
    return result.stderr;
  }

  return `${result.stdout}\n${result.stderr}`;
}

function summarizeCommand(command: string, args: readonly string[]): string {
  return [command, ...args].filter((part) => part.length > 0).join(" ");
}

function createRunCommandFailureMetadata(
  result: {
    args: readonly string[];
    command: string;
    cwd: string;
    durationMs: number;
    exitCode: number | null;
    timedOut: boolean;
    timeoutMs: number;
  },
  output: ToolOutputSummary
): RunCommandFailureMetadata {
  return {
    command: summarizeCommand(result.command, result.args),
    cwd: result.cwd,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    outputReference: output.reference,
    timedOut: result.timedOut,
    timeoutMs: result.timeoutMs
  };
}
