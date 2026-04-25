import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSandboxCommand } from "@sprite/sandbox";

const tempRoots: string[] = [];

function createTempProject(): {
  outsideDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-sandbox-"));
  const projectDir = join(rootDir, "project");
  const outsideDir = join(rootDir, "outside");

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  tempRoots.push(rootDir);

  return { outsideDir, projectDir, rootDir };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("sandbox command runner", () => {
  it("executes a structured command inside the project boundary", async () => {
    const { projectDir } = createTempProject();
    const realProjectDir = realpathSync(projectDir);

    const result = await runSandboxCommand({
      args: ["-e", "process.stdout.write(process.cwd())"],
      command: process.execPath,
      cwd: projectDir,
      projectRoot: projectDir,
      timeoutMs: 30_000
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      command: process.execPath,
      cwd: realProjectDir,
      exitCode: 0,
      status: "completed",
      timedOut: false,
      timeoutMs: 30_000
    });
    expect(result.value.stdout).toBe(realProjectDir);
  });

  it("returns structured results for non-zero exits and timeouts", async () => {
    const { projectDir } = createTempProject();

    const nonZero = await runSandboxCommand({
      args: ["-e", "process.stderr.write('failed'); process.exit(7)"],
      command: process.execPath,
      cwd: projectDir,
      projectRoot: projectDir,
      timeoutMs: 30_000
    });
    const timeout = await runSandboxCommand({
      args: ["-e", "setTimeout(() => {}, 5_000)"],
      command: process.execPath,
      cwd: projectDir,
      projectRoot: projectDir,
      timeoutMs: 50
    });

    expect(nonZero).toMatchObject({
      ok: true,
      value: {
        exitCode: 7,
        status: "failed",
        stderr: "failed",
        timedOut: false
      }
    });
    expect(timeout).toMatchObject({
      ok: true,
      value: {
        exitCode: null,
        status: "timed_out",
        timedOut: true,
        timeoutMs: 50
      }
    });
  });

  it("force-kills commands that ignore timeout termination", async () => {
    const { projectDir } = createTempProject();

    const startedAt = Date.now();
    const timeout = await runSandboxCommand({
      args: [
        "-e",
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)"
      ],
      command: process.execPath,
      cwd: projectDir,
      projectRoot: projectDir,
      timeoutMs: 50
    });

    expect(timeout).toMatchObject({
      ok: true,
      value: {
        exitCode: null,
        status: "timed_out",
        timedOut: true,
        timeoutMs: 50
      }
    });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("rejects cwd outside the project boundary and symlink escapes", async () => {
    const { outsideDir, projectDir } = createTempProject();
    symlinkSync(outsideDir, join(projectDir, "outside-link"), "dir");

    const outside = await runSandboxCommand({
      command: process.execPath,
      cwd: outsideDir,
      projectRoot: projectDir,
      timeoutMs: 30_000
    });
    const symlinkEscape = await runSandboxCommand({
      command: process.execPath,
      cwd: join(projectDir, "outside-link"),
      projectRoot: projectDir,
      timeoutMs: 30_000
    });

    expect(outside).toMatchObject({
      error: { code: "SANDBOX_CWD_OUTSIDE_PROJECT" },
      ok: false
    });
    expect(symlinkEscape).toMatchObject({
      error: { code: "SANDBOX_CWD_OUTSIDE_PROJECT" },
      ok: false
    });
  });

  it("rejects shell parsing and custom environment exposure", async () => {
    const { projectDir } = createTempProject();

    const shellString = await runSandboxCommand({
      command: "echo secret | sh",
      cwd: projectDir,
      projectRoot: projectDir,
      timeoutMs: 30_000
    });
    const customEnv = await runSandboxCommand({
      command: process.execPath,
      cwd: projectDir,
      env: { OPENAI_API_KEY: "sk-test-secret" },
      projectRoot: projectDir,
      timeoutMs: 30_000
    });

    expect(shellString).toMatchObject({
      error: { code: "SANDBOX_SHELL_UNSUPPORTED" },
      ok: false
    });
    expect(customEnv).toMatchObject({
      error: { code: "SANDBOX_CUSTOM_ENV_UNSUPPORTED" },
      ok: false
    });
    expect(JSON.stringify(customEnv)).not.toContain("sk-test-secret");
  });

  it("rejects malformed command requests with a stable error code", async () => {
    const { projectDir } = createTempProject();

    const malformed = await runSandboxCommand({
      command: "",
      cwd: projectDir,
      timeoutMs: 30_000
    });

    expect(malformed).toMatchObject({
      error: { code: "SANDBOX_INVALID_REQUEST" },
      ok: false
    });
  });
});
