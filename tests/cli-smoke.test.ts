import { describe, expect, it } from "vitest";
import { validateRuntimeEvent } from "@sprite/core";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import packageJson from "../packages/cli/package.json" with { type: "json" };

const cliPath = resolve(process.cwd(), "packages/cli/dist/index.js");
const localBinPath = resolve(process.cwd(), "node_modules/.bin/sprite");

function createTempCliWorkspace(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-cli-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  return { homeDir, projectDir, rootDir };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function writeRaw(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function parseNdjsonOutput(stdout: string): Record<string, unknown>[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("sprite cli smoke tests", () => {
  it("shows a bootstrap response with no arguments", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();
    const result = spawnSync("node", [cliPath], {
      cwd: projectDir,
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8"
    });

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Sprite Harness bootstrap workspace is ready."
    );
    expect(result.stdout).toContain("- project config: not loaded");
  });

  it("shows help output", () => {
    const result = spawnSync("node", [cliPath, "--help"], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: sprite");
    expect(result.stdout).toContain(
      "Sprite Harness local developer agent runtime"
    );
  });

  it("shows version output", () => {
    const result = spawnSync("node", [cliPath, "--version"], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("shows merged startup config when global and project config exist", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(homeDir, ".sprite/config.json"), {
      provider: { name: "openai", model: "gpt-5.1" },
      output: { format: "json" }
    });
    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: { model: "gpt-5.4" },
      output: { format: "ndjson" }
    });

    const result = spawnSync("node", [cliPath], {
      cwd: projectDir,
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8"
    });
    const resolvedProjectDir = realpathSync(projectDir);

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`- cwd: ${resolvedProjectDir}`);
    expect(result.stdout).toContain("- provider: openai");
    expect(result.stdout).toContain("- model: gpt-5.4");
    expect(result.stdout).toContain("- provider auth: not configured");
    expect(result.stdout).toContain("- provider capabilities: streaming=true");
    expect(result.stdout).toContain("- output: ndjson");
    expect(result.stdout).toContain("- global config: loaded");
    expect(result.stdout).toContain("- project config: loaded");
  });

  it("shows provider auth source without leaking the secret", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      }
    });

    const result = spawnSync("node", [cliPath], {
      cwd: projectDir,
      env: { ...process.env, HOME: homeDir, OPENAI_API_KEY: "sk-test-secret" },
      encoding: "utf8"
    });

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "- provider auth: environment (secret redacted)"
    );
    expect(result.stdout).not.toContain("sk-test-secret");
  });

  it("routes an interactive task through AgentRuntime and returns a planned execution flow", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      },
      output: { format: "text" }
    });

    const result = spawnSync(
      "node",
      [cliPath, "fix", "the", "provider", "tests"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Task received: fix the provider tests");
    expect(result.stdout).toContain("Planned execution flow:");
    expect(result.stdout).toContain("- task state: waiting-for-input");
    expect(result.stdout).toContain("- waiting: steering-required");
    expect(result.stdout).toContain("1. [plan] completed");
    expect(result.stdout).toContain("2. [act] pending");
    expect(result.stdout).toContain("3. [observe] pending");
    expect(result.stdout).toContain("Runtime events:");
    expect(result.stdout).toContain("task.started");
    expect(result.stdout).toContain("task.waiting");
    expect(result.stdout).toContain(
      "repository inspection and tool execution start in later stories"
    );
    expect(result.stdout).not.toContain("sk-test-secret");
  });

  it("submits steering input through the CLI without letting the adapter own task state", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      }
    });

    const result = spawnSync(
      "node",
      [
        cliPath,
        "--steer",
        "Focus on the auth warning path first.",
        "fix",
        "the",
        "provider",
        "tests"
      ],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("- task state: waiting-for-input");
    expect(result.stdout).toContain("Task intents:");
    expect(result.stdout).toContain(
      "[steer] Focus on the auth warning path first."
    );
    expect(result.stdout).toContain("task.steering.received");
    expect(result.stdout).not.toContain("sk-test-secret");
  });

  it("cancels a task through the CLI after runtime planning", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      }
    });

    const result = spawnSync(
      "node",
      [cliPath, "--cancel", "fix", "the", "provider", "tests"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("- task state: cancelled");
    expect(result.stdout).toContain("- terminal: cancelled");
    expect(result.stdout).toContain("Final summary:");
    expect(result.stdout).toContain("- status: cancelled");
    expect(result.stdout).toContain("Repository inspection and tool execution");
    expect(result.stdout).toContain("Validation");
    expect(result.stdout).toContain("[cancel] User cancelled the active task.");
    expect(result.stdout).toContain("task.cancelled");
    expect(result.stdout).not.toContain("sk-test-secret");
  });

  it("runs a one-shot print task with human-readable text output", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      },
      output: { format: "text" }
    });

    const result = spawnSync(
      "node",
      [cliPath, "--print", "fix the print output"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("One-shot task result:");
    expect(result.stdout).toContain("- task: fix the print output");
    expect(result.stdout).toContain("- status: max-iterations");
    expect(result.stdout).toContain("- correlation id: corr_");
    expect(result.stdout).toContain("Final summary:");
    expect(result.stdout).toContain("- result:");
    expect(result.stdout).toContain("Repository inspection and tool execution");
    expect(result.stdout).toContain("Validation");
    expect(result.stdout).toContain("task.failed");
    expect(result.stdout).not.toContain("sk-test-secret");
  });

  it("runs a one-shot print task through the -p alias with JSON output", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      },
      output: { format: "text" }
    });

    const result = spawnSync(
      "node",
      [cliPath, "-p", "fix the json output", "--output", "json"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("sk-test-secret");

    const output = parseJsonOutput(result.stdout);

    expect(output).toMatchObject({
      task: "fix the json output",
      status: "max-iterations",
      provider: {
        providerName: "openai-compatible",
        model: "gpt-5.4",
        auth: {
          authenticated: true,
          source: "environment",
          secretRedacted: true
        }
      }
    });
    expect(output.summary).toEqual(expect.any(String));
    expect(output.finalSummary).toMatchObject({
      status: "max-iterations",
      result: expect.stringContaining("One-shot print mode stopped"),
      provider: {
        providerName: "openai-compatible",
        model: "gpt-5.4"
      },
      model: "gpt-5.4",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({ type: "task.failed" })
      ]),
      notAttempted: expect.arrayContaining([
        expect.stringContaining("Repository inspection and tool execution"),
        expect.stringContaining("Validation")
      ])
    });
    expect(output.sessionId).toEqual(expect.stringMatching(/^session_/));
    expect(output.taskId).toEqual(expect.stringMatching(/^task_/));
    expect(output.correlationId).toEqual(expect.stringMatching(/^corr_/));
    expect(output.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "task.failed" })])
    );
  });

  it("uses ndjson output defaults for one-shot print events", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      },
      output: { format: "ndjson" }
    });

    const result = spawnSync(
      "node",
      [cliPath, "--print", "stream the events"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          OPENAI_API_KEY: "sk-test-secret"
        },
        encoding: "utf8"
      }
    );

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("sk-test-secret");

    const events = parseNdjsonOutput(result.stdout);

    expect(events.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "task.failed"
    ]);

    for (const event of events) {
      const validation = validateRuntimeEvent(event);

      expect(validation.ok).toBe(true);
      expect(event).toMatchObject({
        schemaVersion: 1,
        eventId: expect.stringMatching(/^evt_/),
        sessionId: expect.stringMatching(/^session_/),
        taskId: expect.stringMatching(/^task_/),
        correlationId: expect.stringMatching(/^corr_/),
        createdAt: expect.any(String),
        payload: expect.any(Object)
      });
    }
  });

  it("survives malformed config files and reports a warning", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    writeRaw(join(homeDir, ".sprite/config.json"), '{"provider":');

    const result = spawnSync("node", [cliPath], {
      cwd: projectDir,
      env: { ...process.env, HOME: homeDir },
      encoding: "utf8"
    });

    rmSync(rootDir, { recursive: true, force: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("- global config: not loaded");
    expect(result.stdout).toContain("- warning: Failed to load");
    expect(result.stdout).toContain("Unexpected end of JSON input");
  });

  it("runs through the installed local sprite bin symlink", () => {
    const result = spawnSync(localBinPath, ["--help"], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: sprite");
  });
});
