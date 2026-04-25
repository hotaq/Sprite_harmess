import { SpriteError, err, type Result } from "@sprite/shared";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

export interface SandboxCommandRequest {
  args?: string[];
  command: string;
  cwd: string;
  env?: Record<string, string>;
  projectRoot?: string;
  timeoutMs: number;
}

export interface SandboxCommandResult {
  args: string[];
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  status: "completed" | "failed" | "timed_out";
  timedOut: boolean;
  timeoutMs: number;
}

const MAX_CAPTURE_BYTES = 1024 * 1024;
const TIMEOUT_KILL_GRACE_MS = 100;

export async function runSandboxCommand(
  request: SandboxCommandRequest
): Promise<Result<SandboxCommandResult, SpriteError>> {
  const validation = validateSandboxCommandRequest(request);

  if (!validation.ok) {
    return validation;
  }

  if (requiresShellParsing(request.command)) {
    return err(
      new SpriteError(
        "SANDBOX_SHELL_UNSUPPORTED",
        "SandboxRunner requires structured command and args without shell parsing."
      )
    );
  }

  if (request.env !== undefined && Object.keys(request.env).length > 0) {
    return err(
      new SpriteError(
        "SANDBOX_CUSTOM_ENV_UNSUPPORTED",
        "SandboxRunner does not execute custom environment values without approval."
      )
    );
  }

  const boundary = await resolveExecutionBoundary(request);

  if (!boundary.ok) {
    return boundary;
  }

  return executeSpawnedCommand(request, boundary.value.cwd);
}

function validateSandboxCommandRequest(
  request: SandboxCommandRequest
): Result<void, SpriteError> {
  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.command !== "string" ||
    request.command.trim().length === 0 ||
    typeof request.cwd !== "string" ||
    request.cwd.trim().length === 0 ||
    typeof request.timeoutMs !== "number" ||
    !Number.isInteger(request.timeoutMs) ||
    request.timeoutMs <= 0
  ) {
    return err(
      new SpriteError(
        "SANDBOX_INVALID_REQUEST",
        "Sandbox command request requires command, cwd, and positive timeoutMs."
      )
    );
  }

  if (
    request.projectRoot !== undefined &&
    typeof request.projectRoot !== "string"
  ) {
    return err(
      new SpriteError(
        "SANDBOX_INVALID_REQUEST",
        "Sandbox command projectRoot must be a string when provided."
      )
    );
  }

  if (
    request.args !== undefined &&
    (!Array.isArray(request.args) ||
      request.args.some((arg) => typeof arg !== "string"))
  ) {
    return err(
      new SpriteError(
        "SANDBOX_INVALID_REQUEST",
        "Sandbox command args must be an array of strings when provided."
      )
    );
  }

  if (request.env !== undefined) {
    if (
      typeof request.env !== "object" ||
      request.env === null ||
      Array.isArray(request.env)
    ) {
      return err(
        new SpriteError(
          "SANDBOX_INVALID_REQUEST",
          "Sandbox command env must be an object with string values when provided."
        )
      );
    }

    for (const value of Object.values(request.env)) {
      if (typeof value !== "string") {
        return err(
          new SpriteError(
            "SANDBOX_INVALID_REQUEST",
            "Sandbox command env values must be strings."
          )
        );
      }
    }
  }

  return { ok: true, value: undefined };
}

async function resolveExecutionBoundary(
  request: SandboxCommandRequest
): Promise<
  Result<
    {
      cwd: string;
      projectRoot: string;
    },
    SpriteError
  >
> {
  try {
    const projectRoot = await realpath(request.projectRoot ?? request.cwd);
    const cwd = await realpath(request.cwd);

    if (!isInsidePath(projectRoot, cwd)) {
      return err(
        new SpriteError(
          "SANDBOX_CWD_OUTSIDE_PROJECT",
          "Command cwd is outside the sandbox project boundary."
        )
      );
    }

    return { ok: true, value: { cwd, projectRoot } };
  } catch {
    return err(
      new SpriteError(
        "SANDBOX_CWD_UNAVAILABLE",
        "Could not resolve sandbox command cwd."
      )
    );
  }
}

function executeSpawnedCommand(
  request: SandboxCommandRequest,
  cwd: string
): Promise<Result<SandboxCommandResult, SpriteError>> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = request.args ?? [];
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(request.command, args, {
      cwd,
      env: createSandboxEnvironment(),
      shell: false,
      windowsHide: true
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, TIMEOUT_KILL_GRACE_MS);
    }, request.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", () => {
      if (settled) {
        return;
      }

      settled = true;
      clearCommandTimers(timeout, killTimer);
      resolve(
        err(
          new SpriteError(
            "SANDBOX_COMMAND_SPAWN_FAILED",
            "Sandbox command could not be spawned."
          )
        )
      );
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearCommandTimers(timeout, killTimer);

      const durationMs = Math.max(0, Date.now() - startedAt);
      const status =
        timedOut || exitCode === null
          ? "timed_out"
          : exitCode === 0
            ? "completed"
            : "failed";

      resolve({
        ok: true,
        value: {
          args,
          command: request.command,
          cwd,
          durationMs,
          exitCode: status === "timed_out" ? null : exitCode,
          stderr,
          stdout,
          status,
          timedOut: status === "timed_out",
          timeoutMs: request.timeoutMs
        }
      });
    });
  });
}

function clearCommandTimers(
  timeout: NodeJS.Timeout,
  killTimer: NodeJS.Timeout | undefined
): void {
  clearTimeout(timeout);

  if (killTimer !== undefined) {
    clearTimeout(killTimer);
  }
}

function createSandboxEnvironment(): NodeJS.ProcessEnv {
  return process.env.PATH === undefined ? {} : { PATH: process.env.PATH };
}

function appendBounded(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current, "utf8") >= MAX_CAPTURE_BYTES) {
    return current;
  }

  const combined = current + chunk.toString("utf8");

  if (Buffer.byteLength(combined, "utf8") <= MAX_CAPTURE_BYTES) {
    return combined;
  }

  return truncateUtf8ByBytes(combined, MAX_CAPTURE_BYTES);
}

function truncateUtf8ByBytes(value: string, maxBytes: number): string {
  let usedBytes = 0;
  let truncated = "";

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");

    if (usedBytes + characterBytes > maxBytes) {
      break;
    }

    truncated += character;
    usedBytes += characterBytes;
  }

  return truncated;
}

function requiresShellParsing(command: string): boolean {
  return /[\s|&;<>$()`]/.test(command.trim());
}

function isInsidePath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
