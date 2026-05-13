import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";
import {
  createRpcReadyNotification,
  handleJsonRpcMessage,
  runJsonRpcStdioServer
} from "@sprite/rpc";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

const tempRoots: string[] = [];

function createTempRuntime(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
  runtime: AgentRuntime;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-rpc-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  tempRoots.push(rootDir);

  return {
    homeDir,
    projectDir,
    rootDir,
    runtime: new AgentRuntime({ cwd: projectDir, homeDir })
  };
}

function createCaptureWritable(): { output: Writable; read: () => string } {
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    }
  });

  return {
    output,
    read: () => text
  };
}

function parseJsonLines(text: string): Record<string, unknown>[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { force: true, recursive: true });
    }
  }
});

describe("JSON-RPC protocol adapter", () => {
  it("creates a ready notification without private runtime details", () => {
    const { homeDir, projectDir, runtime } = createTempRuntime();
    const notification = createRpcReadyNotification(runtime);

    expect(notification).toMatchObject({
      jsonrpc: "2.0",
      method: "rpc.ready",
      params: {
        protocolVersion: "2.0",
        runtimeConnected: true,
        server: "sprite-rpc",
        transport: "stdio"
      }
    });
    expect(JSON.stringify(notification)).not.toContain(homeDir);
    expect(JSON.stringify(notification)).not.toContain(projectDir);
  });

  it("handles rpc.ping through the shared runtime bridge without starting a task", () => {
    const { projectDir, runtime } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        id: "ping-1",
        jsonrpc: "2.0",
        method: "rpc.ping",
        params: {
          token: "OPENAI_API_KEY=sk-test-secret"
        }
      },
      { runtime }
    );

    expect(response).toMatchObject({
      id: "ping-1",
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2.0",
        runtimeConnected: true,
        server: "sprite-rpc",
        transport: "stdio"
      }
    });
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
    expect(JSON.stringify(response)).not.toContain(projectDir);
    expect(runtime.getActiveTask().ok).toBe(false);
    expect(runtime.getEventHistory()).toEqual([]);
  });

  it("returns structured errors without echoing raw malformed or unknown input", () => {
    const { runtime } = createTempRuntime();
    const malformed = handleJsonRpcMessage("OPENAI_API_KEY=sk-test-secret", {
      runtime
    });
    const unknown = handleJsonRpcMessage(
      {
        id: 7,
        jsonrpc: "2.0",
        method: "unknown.secret.sk-test-secret"
      },
      { runtime }
    );

    expect(malformed).toMatchObject({
      error: {
        code: -32600,
        data: {
          recoverable: true,
          subsystem: "rpc"
        }
      },
      id: null,
      jsonrpc: "2.0"
    });
    expect(unknown).toMatchObject({
      error: {
        code: -32601,
        data: {
          recoverable: true,
          subsystem: "rpc"
        }
      },
      id: 7,
      jsonrpc: "2.0"
    });
    expect(JSON.stringify(malformed)).not.toContain("sk-test-secret");
    expect(JSON.stringify(unknown)).not.toContain("sk-test-secret");
  });

  it("runs newline-delimited JSON-RPC over streams with parseable stdout messages", async () => {
    const { output, read } = createCaptureWritable();
    const { runtime } = createTempRuntime();

    await runJsonRpcStdioServer({
      input: Readable.from([
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"rpc.ping\"}\n",
        "{not-json}\n",
        "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"missing\"}\n"
      ]),
      output,
      runtime
    });

    const messages = parseJsonLines(read());

    expect(messages).toHaveLength(4);
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(messages[0]).toMatchObject({ method: "rpc.ready" });
    expect(messages[1]).toMatchObject({ id: 1, result: { server: "sprite-rpc" } });
    expect(messages[2]).toMatchObject({ error: { code: -32700 }, id: null });
    expect(messages[3]).toMatchObject({ error: { code: -32601 }, id: 2 });
  });

  it("frames stdio records strictly on LF while accepting CRLF endings", async () => {
    const { output, read } = createCaptureWritable();
    const { runtime } = createTempRuntime();
    const unicodeSeparatorLine = `${JSON.stringify({
      id: "unicode",
      jsonrpc: "2.0",
      method: "rpc.ping",
      params: {
        note: "line\u2028separator and paragraph\u2029separator"
      }
    })}\n`;

    await runJsonRpcStdioServer({
      input: Readable.from([
        "{\"jsonrpc\":\"2.0\",\"id\":\"crlf\",\"method\":\"rpc.ping\"}\r\n",
        unicodeSeparatorLine
      ]),
      output,
      runtime
    });

    const messages = parseJsonLines(read());

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ method: "rpc.ready" });
    expect(messages[1]).toMatchObject({
      id: "crlf",
      result: { server: "sprite-rpc" }
    });
    expect(messages[2]).toMatchObject({
      id: "unicode",
      result: { server: "sprite-rpc" }
    });
    expect(messages[2]).not.toMatchObject({ error: { code: -32700 } });
  });

  it("does not respond to client notifications", () => {
    const { runtime } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "rpc.ping"
      },
      { runtime }
    );

    expect(response).toBeUndefined();
  });
});
