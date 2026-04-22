import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import packageJson from "../packages/cli/package.json" with { type: "json" };

const cliPath = resolve(process.cwd(), "packages/cli/dist/index.js");
const localBinPath = resolve(process.cwd(), "node_modules/.bin/sprite");

function createTempCliWorkspace(): { homeDir: string; projectDir: string; rootDir: string } {
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
    expect(result.stdout).toContain("Sprite Harness local developer agent runtime");
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
    expect(result.stdout).toContain("- provider auth: environment (secret redacted)");
    expect(result.stdout).not.toContain("sk-test-secret");
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
