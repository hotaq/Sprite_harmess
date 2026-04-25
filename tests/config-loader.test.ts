import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { resolveStartupConfig } from "@sprite/config";

const tempRoots: string[] = [];

function createTempWorkspace(): { homeDir: string; projectDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-config-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  tempRoots.push(rootDir);

  return { homeDir, projectDir };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function writeRaw(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("resolveStartupConfig", () => {
  it("returns defaults when no config files exist", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.cwd).toBe(projectDir);
    expect(result.provider).toBeNull();
    expect(result.model).toBeNull();
    expect(result.outputFormat).toBe("text");
    expect(result.sandboxMode).toBe("workspace-write");
    expect(result.validationCommands).toEqual([]);
    expect(result.globalConfigLoaded).toBe(false);
    expect(result.projectConfigLoaded).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("loads global config without requiring project config", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(homeDir, ".sprite/config.json"), {
      provider: { name: "openai", model: "gpt-5.1" },
      output: { format: "json" }
    });

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-5.1");
    expect(result.outputFormat).toBe("json");
    expect(result.globalConfigLoaded).toBe(true);
    expect(result.projectConfigLoaded).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("lets project config override global config where provided", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(homeDir, ".sprite/config.json"), {
      provider: { name: "openai", model: "gpt-5.1" },
      output: { format: "json" },
      sandbox: { mode: "workspace-write" }
    });
    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: { model: "gpt-5.4" },
      output: { format: "ndjson" },
      sandbox: { mode: "read-only" }
    });

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-5.4");
    expect(result.outputFormat).toBe("ndjson");
    expect(result.sandboxMode).toBe("read-only");
    expect(result.validationCommands).toEqual([]);
    expect(result.globalConfigLoaded).toBe(true);
    expect(result.projectConfigLoaded).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to defaults and records a warning when config is malformed", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeRaw(join(homeDir, ".sprite/config.json"), '{"provider":');

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.provider).toBeNull();
    expect(result.model).toBeNull();
    expect(result.outputFormat).toBe("text");
    expect(result.sandboxMode).toBe("workspace-write");
    expect(result.globalConfigLoaded).toBe(false);
    expect(result.projectConfigLoaded).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Failed to load");
    expect(result.warnings[0]).toContain(join(homeDir, ".sprite/config.json"));
  });

  it("loads and overrides structured validation commands", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(homeDir, ".sprite/config.json"), {
      validation: {
        commands: [
          {
            args: ["run", "typecheck"],
            command: "npm",
            name: "global-typecheck",
            timeoutMs: 60_000
          }
        ]
      }
    });
    writeJson(join(projectDir, ".sprite/config.json"), {
      validation: {
        commands: [
          {
            args: ["run", "test", "--silent"],
            command: "npm",
            cwd: ".",
            name: "project-test",
            timeoutMs: 45_000
          }
        ]
      }
    });

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.validationCommands).toEqual([
      {
        args: ["run", "test", "--silent"],
        command: "npm",
        cwd: ".",
        name: "project-test",
        timeoutMs: 45_000
      }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("records a warning for malformed validation command config", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      validation: {
        commands: [{ args: "run test", command: "npm" }]
      }
    });

    const result = resolveStartupConfig({
      cwd: projectDir,
      homeDir
    });

    expect(result.validationCommands).toEqual([]);
    expect(result.projectConfigLoaded).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("validation.commands[0].args");
  });
});
