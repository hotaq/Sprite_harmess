import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";
import {
  createRpcReadyNotification,
  handleJsonRpcMessage,
  runJsonRpcStdioServer
} from "@sprite/rpc";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function expectSingleResponse(
  response: ReturnType<typeof handleJsonRpcMessage>
): Record<string, unknown> {
  expect(response).toBeDefined();
  expect(Array.isArray(response)).toBe(false);

  return response as unknown as Record<string, unknown>;
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
        capabilities: expect.arrayContaining([
          "rpc.ping",
          "session.create",
          "session.resume"
        ]),
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

  it("creates sessions over RPC without starting a task", () => {
    const { homeDir, projectDir, runtime } = createTempRuntime();
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "create-session",
          jsonrpc: "2.0",
          method: "session.create",
          params: {
            config: {},
            context: {},
            cwd: projectDir,
            token: "OPENAI_API_KEY=sk-test-secret"
          }
        },
        { runtime }
      )
    );
    const result = response.result as {
      runtime: { activeTask: null; eventCount: number };
      session: { cwd: string; sessionId: string; status: string; taskId: null };
    };

    expect(response).toMatchObject({
      id: "create-session",
      jsonrpc: "2.0",
      result: {
        runtime: {
          activeTask: null,
          capabilities: expect.arrayContaining([
            "rpc.ping",
            "session.create",
            "session.resume"
          ]),
          eventCount: 0
        },
        session: {
          cwd: projectDir,
          sessionId: expect.stringMatching(/^ses_/),
          status: "created",
          taskId: null
        }
      }
    });
    expect(existsSync(join(projectDir, ".sprite", "sessions"))).toBe(true);
    expect(
      readJson(
        join(projectDir, ".sprite", "sessions", result.session.sessionId, "state.json")
      )
    ).toMatchObject({
      cwd: projectDir,
      eventCount: 0,
      sessionId: result.session.sessionId
    });
    expect(runtime.getActiveTask().ok).toBe(false);
    expect(runtime.getEventHistory()).toEqual([]);
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
    expect(JSON.stringify(response)).not.toContain(homeDir);
  });

  it("rejects repeated session.create calls on one runtime without creating a hidden second session", () => {
    const { projectDir, runtime } = createTempRuntime();
    const created = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "first-create",
          jsonrpc: "2.0",
          method: "session.create",
          params: { cwd: projectDir }
        },
        { runtime }
      )
    );
    const duplicate = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "duplicate-create",
          jsonrpc: "2.0",
          method: "session.create",
          params: { cwd: projectDir }
        },
        { runtime }
      )
    );

    expect(created).toMatchObject({
      id: "first-create",
      result: {
        session: {
          sessionId: expect.stringMatching(/^ses_/),
          status: "created"
        }
      }
    });
    expect(duplicate).toMatchObject({
      error: {
        code: -32602,
        data: {
          nextAction: expect.stringContaining("existing session ID"),
          subsystem: "rpc"
        },
        message: "Session request rejected (SESSION_ALREADY_CREATED)."
      },
      id: "duplicate-create",
      jsonrpc: "2.0"
    });
  });

  it("resumes existing sessions over RPC and returns safe metadata", () => {
    const { homeDir, projectDir, runtime: seedRuntime } = createTempRuntime();
    const submitted = seedRuntime.submitInteractiveTask(
      "resume this RPC session with sk-test-secret hidden"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "resume-session",
          jsonrpc: "2.0",
          method: "session.resume",
          params: {
            cwd: projectDir,
            sessionId: submitted.value.sessionId
          }
        },
        { runtime }
      )
    );

    expect(response).toMatchObject({
      id: "resume-session",
      jsonrpc: "2.0",
      result: {
        session: {
          correlationId: submitted.value.correlationId,
          currentPhase: submitted.value.currentPhase,
          restoredEventCount: 2,
          sessionId: submitted.value.sessionId,
          status: submitted.value.status,
          taskId: submitted.value.taskId
        }
      }
    });
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
    expect(runtime.getActiveTask().ok).toBe(true);
    expect(runtime.getEventHistory().map((event) => event.type)).toContain(
      "session.resumed"
    );
  });

  it("returns invalid params for malformed or out-of-scope session requests", () => {
    const { projectDir, rootDir, runtime } = createTempRuntime();
    const missingCwd = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "missing-cwd",
          jsonrpc: "2.0",
          method: "session.create",
          params: {}
        },
        { runtime }
      )
    );
    const missingSession = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "missing-session",
          jsonrpc: "2.0",
          method: "session.resume",
          params: {
            cwd: projectDir,
            sessionId: "ses_missing"
          }
        },
        { runtime }
      )
    );
    const outOfScope = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "out-of-scope",
          jsonrpc: "2.0",
          method: "session.create",
          params: {
            cwd: join(rootDir, "other-project")
          }
        },
        { runtime }
      )
    );

    expect(missingCwd).toMatchObject({
      error: { code: -32602 },
      id: "missing-cwd",
      jsonrpc: "2.0"
    });
    expect(missingSession).toMatchObject({
      error: { code: -32602 },
      id: "missing-session",
      jsonrpc: "2.0"
    });
    expect(outOfScope).toMatchObject({
      error: { code: -32602 },
      id: "out-of-scope",
      jsonrpc: "2.0"
    });
  });

  it("sanitizes session storage errors without leaking local paths or file contents", () => {
    const { homeDir, projectDir, runtime: seedRuntime } = createTempRuntime();
    const submitted = seedRuntime.submitInteractiveTask("corrupt-safe-resume");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    writeFileSync(
      join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId,
        "state.json"
      ),
      "{not-json"
    );

    const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "corrupt-resume",
          jsonrpc: "2.0",
          method: "session.resume",
          params: {
            cwd: projectDir,
            sessionId: submitted.value.sessionId
          }
        },
        { runtime }
      )
    );
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      error: {
        code: -32602,
        data: {
          nextAction:
            "Repair or remove invalid local session artifacts before retrying.",
          subsystem: "rpc"
        },
        message: "Session request rejected (SESSION_STATE_INVALID_JSON)."
      },
      id: "corrupt-resume",
      jsonrpc: "2.0"
    });
    expect(serialized).not.toContain(projectDir);
    expect(serialized).not.toContain(homeDir);
    expect(serialized).not.toContain(".sprite/sessions");
    expect(serialized).not.toContain("state.json");
    expect(serialized).not.toContain("not-json");
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
