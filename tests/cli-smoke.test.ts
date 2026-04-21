import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const cliPath = "packages/cli/dist/index.js";
const localBinPath = "./node_modules/.bin/sprite";

describe("sprite cli smoke tests", () => {
  it("shows a bootstrap response with no arguments", () => {
    const result = spawnSync("node", [cliPath], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Sprite Harness bootstrap workspace is ready."
    );
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
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  it("runs through the installed local sprite bin symlink", () => {
    const result = spawnSync(localBinPath, ["--help"], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: sprite");
  });
});
