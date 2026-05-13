import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCliOutputWritable } from "../packages/cli/src/index.js";

const cliPath = resolve(process.cwd(), "packages/cli/dist/index.js");

function createTempCliWorkspace(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-cli-rpc-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  return { homeDir, projectDir, rootDir };
}

function parseJsonLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("sprite rpc CLI", () => {
  it("adapts test IO writers to Writable streams that complete RPC writes", async () => {
    let output = "";
    const writable = createCliOutputWritable({
      write(value: string) {
        output += value;
      }
    });

    await new Promise<void>((resolve, reject) => {
      writable.write("{\"jsonrpc\":\"2.0\"}\n", (error) => {
        if (error instanceof Error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    expect(output).toBe("{\"jsonrpc\":\"2.0\"}\n");
  });

  it("shows bounded rpc help without starting protocol mode", () => {
    const result = spawnSync("node", [cliPath, "rpc", "--help"], {
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("start JSON-RPC mode over stdin/stdout");
    expect(result.stdout).toContain("Usage: sprite rpc");
  });

  it("accepts JSON-RPC over stdin and emits protocol messages on stdout only", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    try {
      const result = spawnSync("node", [cliPath, "rpc"], {
        cwd: projectDir,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: homeDir,
          SPRITE_TEST_SECRET: "sk-test-secret"
        },
        input: "{\"jsonrpc\":\"2.0\",\"id\":\"cli-ping\",\"method\":\"rpc.ping\"}\n"
      });
      const messages = parseJsonLines(result.stdout);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(messages).toHaveLength(2);
      expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
      expect(messages[0]).toMatchObject({
        method: "rpc.ready",
        params: {
          runtimeConnected: true,
          transport: "stdio"
        }
      });
      expect(messages[1]).toMatchObject({
        id: "cli-ping",
        result: {
          runtimeConnected: true,
          server: "sprite-rpc"
        }
      });
      expect(result.stdout).not.toContain("sk-test-secret");
      expect(result.stdout).not.toContain(homeDir);
      expect(result.stdout).not.toContain(projectDir);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("returns JSON-RPC parse errors on stdout without stderr protocol leakage", () => {
    const { homeDir, projectDir, rootDir } = createTempCliWorkspace();

    try {
      const result = spawnSync("node", [cliPath, "rpc"], {
        cwd: projectDir,
        encoding: "utf8",
        env: { ...process.env, HOME: homeDir },
        input: "{not-json}\n"
      });
      const messages = parseJsonLines(result.stdout);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ method: "rpc.ready" });
      expect(messages[1]).toMatchObject({
        error: {
          code: -32700,
          data: {
            recoverable: true,
            subsystem: "rpc"
          }
        },
        id: null
      });
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
