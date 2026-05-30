import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";
import {
  createRpcReadyNotification,
  handleJsonRpcMessage,
  runJsonRpcStdioServer,
  type JsonRpcResponse,
  type JsonRpcRuntimeBridge,
  type JsonRpcSuccessResponse
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
import { PassThrough, Readable, Writable } from "node:stream";

const tempRoots: string[] = [];

function toBridge(runtime: AgentRuntime): JsonRpcRuntimeBridge {
  return {
    createSession: runtime.createSession.bind(runtime),
    getActiveTask: runtime.getActiveTask.bind(runtime),
    getBootstrapState: runtime.getBootstrapState.bind(runtime),
    getEventHistory: runtime.getEventHistory.bind(runtime),
    getLearningReviewArtifacts(cwd, options) {
      return { ok: true, value: [] };
    },
    getPendingApprovals: runtime.getPendingApprovals.bind(runtime),
    respondToApproval: runtime.respondToApproval.bind(runtime),
    resumeSession: runtime.resumeSession.bind(runtime),
    startTask: runtime.startTask.bind(runtime),
    subscribeToEvents: runtime.subscribeToEvents.bind(runtime)
  };
}

function createTempRuntime(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
  runtime: AgentRuntime;
  bridge: JsonRpcRuntimeBridge;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-rpc-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  tempRoots.push(rootDir);

  const runtime = new AgentRuntime({ cwd: projectDir, homeDir });

  return {
    bridge: {
      createSession: runtime.createSession.bind(runtime),
      getActiveTask: runtime.getActiveTask.bind(runtime),
      getBootstrapState: runtime.getBootstrapState.bind(runtime),
      getEventHistory: runtime.getEventHistory.bind(runtime),
      getLearningReviewArtifacts(_cwd, _options) {
        return { ok: true, value: [] };
      },
      getPendingApprovals: runtime.getPendingApprovals.bind(runtime),
      respondToApproval: runtime.respondToApproval.bind(runtime),
      resumeSession: runtime.resumeSession.bind(runtime),
      startTask: runtime.startTask.bind(runtime),
      subscribeToEvents: runtime.subscribeToEvents.bind(runtime)
    },
    homeDir,
    projectDir,
    rootDir,
    runtime
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

function writeJsonLine(input: PassThrough, message: unknown): void {
  input.write(`${JSON.stringify(message)}\n`);
}

async function waitForCondition(
  predicate: () => boolean,
  description: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function readNdjson(path: string): Record<string, unknown>[] {
  const content = readFileSync(path, "utf8").trim();

  return content.length === 0
    ? []
    : content
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
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
    const { homeDir, projectDir, runtime, bridge } = createTempRuntime();
    const notification = createRpcReadyNotification(bridge);

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
    const { projectDir, runtime, bridge } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        id: "ping-1",
        jsonrpc: "2.0",
        method: "rpc.ping",
        params: {
          token: "OPENAI_API_KEY=sk-test-secret"
        }
      },
      { runtime: bridge }
    );

    expect(response).toMatchObject({
      id: "ping-1",
      jsonrpc: "2.0",
      result: {
        capabilities: expect.arrayContaining([
          "rpc.ping",
          "session.create",
          "session.resume",
          "task.start"
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
    const { homeDir, projectDir, runtime, bridge } = createTempRuntime();
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
        { runtime: bridge }
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
            "session.resume",
            "task.start"
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
        join(
          projectDir,
          ".sprite",
          "sessions",
          result.session.sessionId,
          "state.json"
        )
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
    const { projectDir, runtime, bridge } = createTempRuntime();
    const created = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "first-create",
          jsonrpc: "2.0",
          method: "session.create",
          params: { cwd: projectDir }
        },
        { runtime: bridge }
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
        { runtime: bridge }
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
    const { homeDir, projectDir, runtime: seedRuntime, bridge } = createTempRuntime();
    const submitted = seedRuntime.submitInteractiveTask(
      "resume this RPC session with sk-test-secret hidden"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
    const runtimeBridge = toBridge(runtime);
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
        { runtime: runtimeBridge }
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

  it("starts tasks over RPC inside a previously created session", () => {
    const { homeDir, projectDir, runtime, bridge } = createTempRuntime();
    const created = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "create-for-task",
          jsonrpc: "2.0",
          method: "session.create",
          params: { cwd: projectDir }
        },
        { runtime: bridge }
      )
    );
    const createdResult = created.result as {
      session: { sessionId: string };
    };
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "start-task",
          jsonrpc: "2.0",
          method: "task.start",
          params: {
            allowedTools: ["read_file"],
            context: {
              client: "rpc-test"
            },
            cwd: projectDir,
            memoryScope: {
              manual: false,
              procedural: false,
              working: true
            },
            output: {
              format: "json"
            },
            provider: {
              baseUrl: "https://example.invalid/v1",
              model: "gpt-rpc-test",
              providerName: "openai-compatible"
            },
            sessionId: createdResult.session.sessionId,
            task: "start this task without leaking sk-test-secret"
          }
        },
        { runtime: bridge }
      )
    );
    const result = response.result as {
      lifecycle: {
        initialEvents: Array<{ type: string }>;
        waitingReason: string;
      };
      session: { sessionId: string };
      task: { correlationId: string; taskId: string };
    };

    expect(response).toMatchObject({
      id: "start-task",
      jsonrpc: "2.0",
      result: {
        acceptedScopes: {
          allowedTools: ["read_file"],
          cwd: projectDir,
          memoryScope: {
            manual: false,
            procedural: false,
            working: true
          },
          outputFormat: "json",
          provider: {
            model: "gpt-rpc-test",
            providerName: "openai-compatible"
          },
          toolExecutionEnabled: false
        },
        lifecycle: {
          initialEvents: [{ type: "task.started" }, { type: "task.waiting" }],
          waitingReason: "steering-required"
        },
        session: {
          resumed: false,
          sessionId: createdResult.session.sessionId
        },
        task: {
          currentPhase: "act",
          status: "waiting-for-input"
        }
      }
    });
    expect(result.session.sessionId).toBe(createdResult.session.sessionId);
    expect(result.task.taskId).toMatch(/^task_/);
    expect(result.task.correlationId).toMatch(/^corr_/);
    expect(runtime.getActiveTask().ok).toBe(true);

    const sessionDir = join(
      projectDir,
      ".sprite",
      "sessions",
      createdResult.session.sessionId
    );
    const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));
    const state = readJson(join(sessionDir, "state.json"));

    expect(persistedEvents.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting"
    ]);
    expect(state).toMatchObject({
      eventCount: 2,
      latestTask: {
        status: "waiting-for-input",
        taskId: result.task.taskId
      },
      sessionId: createdResult.session.sessionId
    });
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
    expect(JSON.stringify(response)).not.toContain(homeDir);
  });

  it("streams subscribed runtime lifecycle events over JSON-RPC notifications", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({ input, output, runtime: bridge });

    writeJsonLine(input, {
      id: "subscribe-events",
      jsonrpc: "2.0",
      method: "event.subscribe",
      params: {
        cwd: projectDir,
        eventTypes: ["task.started", "task.waiting", "task.completed"]
      }
    });
    writeJsonLine(input, {
      id: "start-streamed-task",
      jsonrpc: "2.0",
      method: "task.start",
      params: {
        cwd: projectDir,
        task: "stream lifecycle events"
      }
    });

    await waitForCondition(
      () => runtime.getActiveTask().ok,
      "RPC task to become active"
    );
    const approvalRequired = runtime.waitForInput(
      "approval-required",
      "Approval is required before continuing."
    );

    expect(approvalRequired.ok).toBe(true);

    const completed = runtime.completeActiveTask(
      "Task completed after approval."
    );

    expect(completed.ok).toBe(true);

    writeJsonLine(input, {
      id: "unsubscribe-events",
      jsonrpc: "2.0",
      method: "event.unsubscribe",
      params: {
        subscriptionId: "sub_missing"
      }
    });
    input.end();
    await server;

    const messages = parseJsonLines(read());
    const subscribeResponse = messages.find(
      (message) => message.id === "subscribe-events"
    ) as {
      result: {
        runtime: { capabilities: string[] };
        subscription: {
          eventTypes: string[];
          replayedEventCount: number;
          sessionId: null;
          subscriptionId: string;
          taskId: null;
        };
      };
    };
    const notifications = messages.filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        actionable: boolean;
        event: {
          correlationId: string;
          createdAt: string;
          eventId: string;
          payload: Record<string, unknown>;
          schemaVersion: number;
          sessionId: string;
          taskId: string;
          type: string;
        };
        replay: boolean;
        subscriptionId: string;
        terminal: boolean;
        waitingReason?: string;
      };
    }>;
    const waitingApproval = notifications.find(
      (notification) => notification.params.event.type === "task.waiting" &&
        notification.params.waitingReason === "approval-required"
    );
    const completedNotification = notifications.find(
      (notification) => notification.params.event.type === "task.completed"
    );

    expect(messages[0]).toMatchObject({ method: "rpc.ready" });
    expect(subscribeResponse.result.subscription).toMatchObject({
      eventTypes: ["task.started", "task.waiting", "task.completed"],
      replayedEventCount: 0,
      sessionId: null,
      taskId: null,
      subscriptionId: expect.stringMatching(/^sub_/)
    });
    expect(subscribeResponse.result.runtime.capabilities).toEqual(
      expect.arrayContaining(["event.subscribe", "event.unsubscribe"])
    );
    expect(notifications.map((notification) => notification.params.event.type))
      .toEqual(
        expect.arrayContaining([
          "task.started",
          "task.waiting",
          "task.completed"
        ])
      );
    expect(
      notifications.every(
        (notification) =>
          notification.params.subscriptionId ===
            subscribeResponse.result.subscription.subscriptionId &&
          notification.params.replay === false &&
          notification.params.event.schemaVersion === 1 &&
          notification.params.event.eventId.startsWith("evt_") &&
          notification.params.event.sessionId.startsWith("ses_") &&
          notification.params.event.taskId.startsWith("task_") &&
          notification.params.event.correlationId.startsWith("corr_")
      )
    ).toBe(true);
    expect(waitingApproval).toMatchObject({
      params: {
        actionable: true,
        terminal: false,
        waitingReason: "approval-required"
      }
    });
    expect(completedNotification).toMatchObject({
      params: {
        actionable: false,
        replay: false,
        terminal: true
      }
    });
  });

  it("writes batch responses before live event notifications emitted by batch items", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();

    await runJsonRpcStdioServer({
      emitReady: false,
      input: Readable.from([
        `${JSON.stringify([
          {
            id: "batch-subscribe",
            jsonrpc: "2.0",
            method: "event.subscribe",
            params: {
              cwd: projectDir,
              eventTypes: ["task.started", "task.waiting"]
            }
          },
          {
            id: "batch-start",
            jsonrpc: "2.0",
            method: "task.start",
            params: {
              cwd: projectDir,
              task: "start after subscribing in the same batch"
            }
          }
        ])}\n`
      ]),
      output,
      runtime: bridge
    });

    const messages = read()
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
    const batchResponse = messages[0] as Array<{ id: string }>;
    const liveNotifications = messages.slice(1) as Array<{
      method: string;
      params: { event: { type: string }; replay: boolean };
    }>;

    expect(Array.isArray(messages[0])).toBe(true);
    expect(batchResponse.map((response) => response.id)).toEqual([
      "batch-subscribe",
      "batch-start"
    ]);
    expect(liveNotifications).toHaveLength(2);
    expect(liveNotifications).toMatchObject([
      {
        method: "event.runtime",
        params: {
          event: { type: "task.started" },
          replay: false
        }
      },
      {
        method: "event.runtime",
        params: {
          event: { type: "task.waiting" },
          replay: false
        }
      }
    ]);
  });

  it.each([
    {
      eventType: "task.failed",
      finish: (runtime: AgentRuntime) =>
        runtime.failActiveTask("Provider failed permanently.")
    },
    {
      eventType: "task.cancelled",
      finish: (runtime: AgentRuntime) =>
        runtime.cancelActiveTask("User cancelled the task.")
    }
  ])("streams terminal $eventType notifications", async ({ eventType, finish }) => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({
      emitReady: false,
      input,
      output,
      runtime: bridge
    });

    writeJsonLine(input, {
      id: `subscribe-${eventType}`,
      jsonrpc: "2.0",
      method: "event.subscribe",
      params: {
        cwd: projectDir,
        eventTypes: [eventType]
      }
    });
    writeJsonLine(input, {
      id: `start-${eventType}`,
      jsonrpc: "2.0",
      method: "task.start",
      params: {
        cwd: projectDir,
        task: `task that will emit ${eventType}`
      }
    });

    await waitForCondition(
      () => runtime.getActiveTask().ok,
      `RPC task to become active before ${eventType}`
    );

    const terminal = finish(runtime);

    expect(terminal.ok).toBe(true);

    input.end();
    await server;

    const notifications = parseJsonLines(read()).filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        event: { type: string };
        replay: boolean;
        terminal: boolean;
      };
    }>;

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      params: {
        event: { type: eventType },
        replay: false,
        terminal: true
      }
    });
  });

  it("replays bounded current-runtime history after event subscription", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const started = runtime.startTask("seed replay history");

    expect(started.ok).toBe(true);

    await runJsonRpcStdioServer({
      emitReady: false,
      input: Readable.from([
        `${JSON.stringify({
          id: "subscribe-with-replay",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            eventTypes: ["task.started", "task.waiting"],
            replay: {
              limit: 1,
              mode: "recent"
            }
          }
        })}\n`
      ]),
      output,
      runtime: bridge
    });
    const messages = parseJsonLines(read());
    const subscribeResponse = messages.find(
      (message) => message.id === "subscribe-with-replay"
    ) as {
      result: {
        subscription: {
          lastEventId: string;
          replayedEventCount: number;
          subscriptionId: string;
        };
      };
    };
    const replayNotifications = messages.filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        event: { eventId: string; type: string };
        replay: boolean;
        subscriptionId: string;
      };
    }>;

    expect(subscribeResponse.result.subscription.replayedEventCount).toBe(1);
    expect(replayNotifications).toHaveLength(1);
    expect(replayNotifications[0]).toMatchObject({
      params: {
        event: {
          type: "task.waiting"
        },
        replay: true,
        subscriptionId:
          subscribeResponse.result.subscription.subscriptionId
      }
    });
    expect(subscribeResponse.result.subscription.lastEventId).toBe(
      replayNotifications[0].params.event.eventId
    );
  });

  it("filters replayed runtime events by taskId without requiring sessionId", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const started = runtime.startTask("seed task-specific replay history");

    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    await runJsonRpcStdioServer({
      emitReady: false,
      input: Readable.from([
        `${JSON.stringify({
          id: "subscribe-matching-task",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            eventTypes: ["task.started", "task.waiting"],
            replay: {
              limit: 10,
              mode: "recent"
            },
            taskId: started.value.flow.taskId
          }
        })}\n`,
        `${JSON.stringify({
          id: "subscribe-missing-task",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            replay: {
              limit: 10,
              mode: "recent"
            },
            taskId: "task_missing"
          }
        })}\n`
      ]),
      output,
      runtime: bridge
    });

    const messages = parseJsonLines(read());
    const matchingResponse = messages.find(
      (message) => message.id === "subscribe-matching-task"
    ) as {
      result: { subscription: { replayedEventCount: number; taskId: string } };
    };
    const missingResponse = messages.find(
      (message) => message.id === "subscribe-missing-task"
    ) as {
      result: { subscription: { replayedEventCount: number; taskId: string } };
    };
    const replayNotifications = messages.filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        event: { taskId: string; type: string };
        replay: boolean;
      };
    }>;

    expect(matchingResponse.result.subscription).toMatchObject({
      replayedEventCount: 2,
      taskId: started.value.flow.taskId
    });
    expect(missingResponse.result.subscription).toMatchObject({
      replayedEventCount: 0,
      taskId: "task_missing"
    });
    expect(
      replayNotifications.map((notification) => ({
        taskId: notification.params.event.taskId,
        type: notification.params.event.type
      }))
    ).toEqual([
        { taskId: started.value.flow.taskId, type: "task.started" },
        { taskId: started.value.flow.taskId, type: "task.waiting" }
      ]);
    expect(
      replayNotifications.every((notification) => notification.params.replay)
    ).toBe(true);
  });

  it("filters replayed runtime events by sessionId without requiring taskId", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const started = runtime.startTask("seed session-specific replay history");

    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    await runJsonRpcStdioServer({
      emitReady: false,
      input: Readable.from([
        `${JSON.stringify({
          id: "subscribe-matching-session",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            replay: {
              limit: 10,
              mode: "recent"
            },
            sessionId: started.value.flow.sessionId
          }
        })}\n`,
        `${JSON.stringify({
          id: "subscribe-missing-session",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            replay: {
              limit: 10,
              mode: "recent"
            },
            sessionId: "ses_missing"
          }
        })}\n`
      ]),
      output,
      runtime: bridge
    });

    const messages = parseJsonLines(read());
    const matchingResponse = messages.find(
      (message) => message.id === "subscribe-matching-session"
    ) as {
      result: {
        subscription: { replayedEventCount: number; sessionId: string };
      };
    };
    const missingResponse = messages.find(
      (message) => message.id === "subscribe-missing-session"
    ) as {
      result: {
        subscription: { replayedEventCount: number; sessionId: string };
      };
    };
    const replayNotifications = messages.filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        event: { sessionId: string; type: string };
        replay: boolean;
      };
    }>;

    expect(matchingResponse.result.subscription).toMatchObject({
      replayedEventCount: 2,
      sessionId: started.value.flow.sessionId
    });
    expect(missingResponse.result.subscription).toMatchObject({
      replayedEventCount: 0,
      sessionId: "ses_missing"
    });
    expect(
      replayNotifications.map((notification) => ({
        sessionId: notification.params.event.sessionId,
        type: notification.params.event.type
      }))
    ).toEqual([
      { sessionId: started.value.flow.sessionId, type: "task.started" },
      { sessionId: started.value.flow.sessionId, type: "task.waiting" }
    ]);
    expect(
      replayNotifications.every((notification) => notification.params.replay)
    ).toBe(true);
  });

  it("unsubscribes event streams and suppresses later notifications", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({
      emitReady: false,
      input,
      output,
      runtime: bridge
    });

    writeJsonLine(input, {
      id: "subscribe-then-unsubscribe",
      jsonrpc: "2.0",
      method: "event.subscribe",
      params: {
        cwd: projectDir,
        eventTypes: ["task.started"]
      }
    });
    await waitForCondition(
      () =>
        parseJsonLines(read()).some(
          (message) => message.id === "subscribe-then-unsubscribe"
        ),
      "event.subscribe response"
    );

    const subscribeResponse = parseJsonLines(read()).find(
      (message) => message.id === "subscribe-then-unsubscribe"
    ) as {
      result: { subscription: { subscriptionId: string } };
    };

    writeJsonLine(input, {
      id: "unsubscribe-active",
      jsonrpc: "2.0",
      method: "event.unsubscribe",
      params: {
        subscriptionId: subscribeResponse.result.subscription.subscriptionId
      }
    });
    await waitForCondition(
      () =>
        parseJsonLines(read()).some(
          (message) => message.id === "unsubscribe-active"
        ),
      "event.unsubscribe response"
    );

    const started = runtime.startTask("no event after unsubscribe");

    expect(started.ok).toBe(true);

    input.end();
    await server;

    const messages = parseJsonLines(read());

    expect(messages.find((message) => message.id === "unsubscribe-active"))
      .toMatchObject({
        result: {
          subscription: {
            status: "unsubscribed",
            subscriptionId:
              subscribeResponse.result.subscription.subscriptionId
          }
        }
      });
    expect(
      messages.filter((message) => message.method === "event.runtime")
    ).toEqual([]);
  });

  it("rejects invalid event subscription params without side effects", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, rootDir, runtime, bridge } = createTempRuntime();
    const outOfScopeDir = join(rootDir, "other-project");

    mkdirSync(outOfScopeDir, { recursive: true });

    await runJsonRpcStdioServer({
      emitReady: false,
      input: Readable.from([
        `${JSON.stringify({
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            eventTypes: ["task.started"]
          }
        })}\n`,
        `${JSON.stringify({
          id: "bad-cwd",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: outOfScopeDir,
            eventTypes: ["task.started"]
          }
        })}\n`,
        `${JSON.stringify({
          id: "bad-session-id",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            sessionId: "not-session-prefixed"
          }
        })}\n`,
        `${JSON.stringify({
          id: "bad-event-type",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            eventTypes: ["unknown.event"]
          }
        })}\n`,
        `${JSON.stringify({
          id: "bad-task-id",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            taskId: "not-task-prefixed"
          }
        })}\n`,
        `${JSON.stringify({
          id: "bad-replay",
          jsonrpc: "2.0",
          method: "event.subscribe",
          params: {
            cwd: projectDir,
            replay: {
              limit: 10_000,
              mode: "recent"
            }
          }
        })}\n`
      ]),
      output,
      runtime: bridge
    });

    const messages = parseJsonLines(read());

    expect(messages).toHaveLength(5);
    expect(messages).toMatchObject([
      {
        error: { data: { code: "INVALID_CWD" } },
        id: "bad-cwd"
      },
      {
        error: { data: { code: "SESSION_ID_INVALID" } },
        id: "bad-session-id"
      },
      {
        error: { data: { code: "EVENT_TYPES_INVALID" } },
        id: "bad-event-type"
      },
      {
        error: { data: { code: "TASK_ID_INVALID" } },
        id: "bad-task-id"
      },
      {
        error: { data: { code: "EVENT_REPLAY_INVALID" } },
        id: "bad-replay"
      }
    ]);
    expect(runtime.getEventHistory()).toEqual([]);
  });

  it("starts tasks over RPC without an explicit session id using the runtime default session", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "start-default-session",
          jsonrpc: "2.0",
          method: "task.start",
          params: {
            cwd: projectDir,
            task: "start with default runtime session"
          }
        },
        { runtime: bridge }
      )
    );
    const result = response.result as {
      session: { sessionId: string };
      task: { taskId: string };
    };

    expect(response).toMatchObject({
      id: "start-default-session",
      result: {
        acceptedScopes: {
          allowedTools: [],
          outputFormat: "text",
          toolExecutionEnabled: false
        },
        session: {
          resumed: false,
          sessionId: expect.stringMatching(/^ses_/)
        },
        task: {
          currentPhase: "act",
          status: "waiting-for-input"
        }
      }
    });
    expect(
      readJson(
        join(
          projectDir,
          ".sprite",
          "sessions",
          result.session.sessionId,
          "state.json"
        )
      )
    ).toMatchObject({
      latestTask: {
        taskId: result.task.taskId
      },
      sessionId: result.session.sessionId
    });
  });

  it("starts tasks over RPC against an existing persisted session id", () => {
    const { homeDir, projectDir, runtime: seedRuntime, bridge } = createTempRuntime();
    const first = seedRuntime.submitInteractiveTask("seed persisted RPC task");

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
    const runtimeBridge = toBridge(runtime);
    const response = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "start-existing-session",
          jsonrpc: "2.0",
          method: "task.start",
          params: {
            cwd: projectDir,
            sessionId: first.value.sessionId,
            task: "append task through RPC"
          }
        },
        { runtime: runtimeBridge }
      )
    );
    const result = response.result as {
      session: { sessionId: string };
      task: { taskId: string };
    };
    const sessionDir = join(
      projectDir,
      ".sprite",
      "sessions",
      first.value.sessionId
    );

    expect(response).toMatchObject({
      id: "start-existing-session",
      result: {
        session: {
          restoredEventCount: 2,
          resumed: true,
          sessionId: first.value.sessionId
        },
        task: {
          status: "waiting-for-input"
        }
      }
    });
    expect(result.session.sessionId).toBe(first.value.sessionId);
    expect(result.task.taskId).not.toBe(first.value.taskId);
    expect(readNdjson(join(sessionDir, "events.ndjson"))).toHaveLength(4);
    expect(readJson(join(sessionDir, "state.json"))).toMatchObject({
      eventCount: 4,
      latestTask: {
        taskId: result.task.taskId
      },
      sessionId: first.value.sessionId
    });
  });

  it("does not respond to task.start notifications and does not create task side effects", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "task.start",
        params: {
          cwd: projectDir,
          task: "notification must not start"
        }
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
    expect(runtime.getActiveTask().ok).toBe(false);
    expect(runtime.getEventHistory()).toEqual([]);
    expect(existsSync(join(projectDir, ".sprite", "sessions"))).toBe(false);
  });

  it("returns invalid params for malformed or out-of-scope session requests", () => {
    const { projectDir, rootDir, runtime, bridge } = createTempRuntime();
    const missingCwd = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "missing-cwd",
          jsonrpc: "2.0",
          method: "session.create",
          params: {}
        },
        { runtime: bridge }
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
        { runtime: bridge }
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
        { runtime: bridge }
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

  it("returns invalid params for unsafe or unsupported task.start scopes", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const requests = [
      {
        expectedDataCode: "INVALID_CWD",
        id: "missing-cwd",
        params: { task: "x" }
      },
      {
        expectedDataCode: "TASK_TEXT_INVALID",
        id: "missing-task",
        params: { cwd: projectDir }
      },
      {
        expectedDataCode: "TASK_TEXT_INVALID",
        id: "empty-task",
        params: { cwd: projectDir, task: "   " }
      },
      {
        expectedDataCode: "SESSION_ID_INVALID",
        id: "bad-session",
        params: { cwd: projectDir, sessionId: "not-safe", task: "x" }
      },
      {
        expectedDataCode: "TASK_TOOL_SCOPE_INVALID",
        id: "bad-tool",
        params: {
          allowedTools: ["read_file", "unknown_tool"],
          cwd: projectDir,
          task: "x"
        }
      },
      {
        expectedDataCode: "TASK_MEMORY_SCOPE_UNSUPPORTED",
        id: "bad-memory",
        params: {
          cwd: projectDir,
          memoryScope: { manual: true, procedural: true, working: false },
          task: "x"
        }
      },
      {
        expectedDataCode: "TASK_MEMORY_SCOPE_UNSUPPORTED",
        id: "unknown-memory-key",
        params: {
          cwd: projectDir,
          memoryScope: {
            longTerm: true,
            manual: true,
            procedural: true,
            working: true
          },
          task: "x"
        }
      },
      {
        expectedDataCode: "TASK_OUTPUT_FORMAT_INVALID",
        id: "bad-output",
        params: { cwd: projectDir, output: { format: "xml" }, task: "x" }
      },
      {
        expectedDataCode: "TASK_PROVIDER_SECRET_REJECTED",
        id: "secret-provider",
        params: {
          cwd: projectDir,
          provider: {
            apiKey: "sk-test-secret",
            model: "gpt-rpc-test",
            providerName: "openai-compatible"
          },
          task: "x"
        }
      }
    ];

    for (const request of requests) {
      const response = expectSingleResponse(
        handleJsonRpcMessage(
          {
            id: request.id,
            jsonrpc: "2.0",
            method: "task.start",
            params: request.params
          },
          { runtime: bridge }
        )
      );
      const serialized = JSON.stringify(response);

      expect(response).toMatchObject({
        error: {
          code: -32602,
          data: {
            code: request.expectedDataCode,
            recoverable: true,
            subsystem: "rpc"
          }
        },
        id: request.id,
        jsonrpc: "2.0"
      });
      expect(serialized).not.toContain("sk-test-secret");
      expect(serialized).not.toContain(projectDir);
    }
  });

  it("returns a safe task.start conflict error instead of replacing an active task", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const first = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "first-task",
          jsonrpc: "2.0",
          method: "task.start",
          params: { cwd: projectDir, task: "first task" }
        },
        { runtime: bridge }
      )
    );
    const duplicate = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "duplicate-task",
          jsonrpc: "2.0",
          method: "task.start",
          params: { cwd: projectDir, task: "second task" }
        },
        { runtime: bridge }
      )
    );

    expect(first).toMatchObject({
      result: {
        task: {
          status: "waiting-for-input"
        }
      }
    });
    expect(duplicate).toMatchObject({
      error: {
        code: -32602,
        data: {
          nextAction: expect.stringContaining("Resolve or cancel"),
          subsystem: "rpc"
        },
        message: "Task request rejected (TASK_ALREADY_ACTIVE)."
      },
      id: "duplicate-task",
      jsonrpc: "2.0"
    });
  });

  it("sanitizes session storage errors without leaking local paths or file contents", () => {
    const { homeDir, projectDir, runtime: seedRuntime, bridge } = createTempRuntime();
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
    const runtimeBridge = toBridge(runtime);
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
        { runtime: runtimeBridge }
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
    const { runtime, bridge } = createTempRuntime();
    const malformed = handleJsonRpcMessage("OPENAI_API_KEY=sk-test-secret", {
      runtime: bridge
    });
    const unknown = handleJsonRpcMessage(
      {
        id: 7,
        jsonrpc: "2.0",
        method: "unknown.secret.sk-test-secret"
      },
      { runtime: bridge }
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
    const { runtime, bridge } = createTempRuntime();

    await runJsonRpcStdioServer({
      input: Readable.from([
        '{"jsonrpc":"2.0","id":1,"method":"rpc.ping"}\n',
        "{not-json}\n",
        '{"jsonrpc":"2.0","id":2,"method":"missing"}\n'
      ]),
      output,
      runtime: bridge
    });

    const messages = parseJsonLines(read());

    expect(messages).toHaveLength(4);
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(messages[0]).toMatchObject({ method: "rpc.ready" });
    expect(messages[1]).toMatchObject({
      id: 1,
      result: { server: "sprite-rpc" }
    });
    expect(messages[2]).toMatchObject({ error: { code: -32700 }, id: null });
    expect(messages[3]).toMatchObject({ error: { code: -32601 }, id: 2 });
  });

  it("frames stdio records strictly on LF while accepting CRLF endings", async () => {
    const { output, read } = createCaptureWritable();
    const { runtime, bridge } = createTempRuntime();
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
        '{"jsonrpc":"2.0","id":"crlf","method":"rpc.ping"}\r\n',
        unicodeSeparatorLine
      ]),
      output,
      runtime: bridge
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
    const { runtime, bridge } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "rpc.ping"
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
  });
});

describe("approval.respond", () => {
  async function expectAsyncResponse(
    response: ReturnType<typeof handleJsonRpcMessage>
  ): Promise<Record<string, unknown>> {
    expect(response).toBeDefined();
    const awaited = await Promise.resolve(response);
    expect(Array.isArray(awaited)).toBe(false);

    return awaited as unknown as Record<string, unknown>;
  }

  async function createPendingCommandApproval(
    runtime: AgentRuntime
  ): Promise<{
    approvalRequestId: string;
    sessionId: string;
    taskId: string;
  }> {
    const submitted = runtime.submitInteractiveTask("approval.respond fixture");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      throw new Error("expected submitInteractiveTask to succeed");
    }

    const pending = await runtime.executeToolCall({
      input: {
        args: ["--version"],
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(pending.ok).toBe(false);

    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      throw new Error("expected pending approval to be created");
    }

    return {
      approvalRequestId: approval.approvalRequestId,
      sessionId: submitted.value.sessionId,
      taskId: submitted.value.taskId
    };
  }

  it("advertises approval.respond in protocol capabilities", () => {
    const { runtime, bridge } = createTempRuntime();
    const ready = createRpcReadyNotification(bridge);

    expect((ready.params as { capabilities: string[] }).capabilities).toEqual(
      expect.arrayContaining(["approval.respond"])
    );
  });

  it("returns a bounded execution result for allow responses", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-allow",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      id: "approval-allow",
      jsonrpc: "2.0",
      result: {
        action: "allow",
        approvalRequestId: fixture.approvalRequestId,
        execution: {
          status: "completed",
          toolName: "run_command"
        }
      }
    });
    const result = (response as { result: { execution: Record<string, unknown> } })
      .result;
    expect(result.execution).toMatchObject({
      affectedFiles: [],
      durationMs: expect.any(Number),
      summary: expect.any(String)
    });
    expect(serialized).not.toMatch(/v\d+\.\d+\.\d+/);
    expect(serialized).not.toContain("stdout");
    expect(serialized).not.toContain("stderr");
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("returns a bounded execution result for alwaysAllowForSession responses", async () => {
    const { projectDir, runtime } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "approval.respond always allow fixture"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const approvalRequestId = "appr_always-allow";
    const bridge: JsonRpcRuntimeBridge = {
      createSession: runtime.createSession.bind(runtime),
      getActiveTask: runtime.getActiveTask.bind(runtime),
      getBootstrapState: runtime.getBootstrapState.bind(runtime),
      getEventHistory: runtime.getEventHistory.bind(runtime),
      getLearningReviewArtifacts(cwd, options) {
        return { ok: true, value: [] };
      },
      getPendingApprovals: runtime.getPendingApprovals.bind(runtime),
      respondToApproval: async (approvalResponse) => {
        expect(approvalResponse).toEqual({
          action: "alwaysAllowForSession",
          approvalRequestId
        });

        return {
          ok: true,
          value: {
            command: process.execPath,
            cwd: projectDir,
            durationMs: 1,
            exitCode: 0,
            output: {
              content: "",
              originalBytes: 0,
              originalLines: 0,
              reference: {
                fullOutputStored: false,
                reason: "test fixture"
              },
              returnedBytes: 0,
              returnedLines: 0,
              thresholdBytes: 32_768,
              thresholdLines: 500,
              truncated: false
            },
            status: "completed",
            stderr: "",
            stdout: "",
            summary: "Command completed successfully.",
            timedOut: false,
            timeoutMs: 30_000,
            toolName: "run_command"
          }
        };
      },
      resumeSession: runtime.resumeSession.bind(runtime),
      startTask: runtime.startTask.bind(runtime),
      subscribeToEvents: runtime.subscribeToEvents.bind(runtime)
    };

    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-always-allow",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "alwaysAllowForSession",
            approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      id: "approval-always-allow",
      jsonrpc: "2.0",
      result: {
        action: "alwaysAllowForSession",
        approvalRequestId,
        execution: {
          status: "completed",
          toolName: "run_command"
        }
      }
    });
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("returns a denial confirmation when responding with deny", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-deny",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "deny",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            reason: "Untrusted command in this scope."
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      id: "approval-deny",
      jsonrpc: "2.0",
      result: {
        action: "deny",
        approvalRequestId: fixture.approvalRequestId,
        reason: "Untrusted command in this scope."
      }
    });
    expect(response).not.toMatchObject({ error: { code: expect.any(Number) } });
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("returns a timeout confirmation when responding with timeout", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-timeout",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "timeout",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      id: "approval-timeout",
      jsonrpc: "2.0",
      result: {
        action: "timeout",
        approvalRequestId: fixture.approvalRequestId
      }
    });
    expect(response).not.toMatchObject({ error: { code: expect.any(Number) } });
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("executes a modified command request for edit responses", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-edit-command",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              timeoutMs: 30_000,
              type: "command"
            },
            reason: "Restricting to read-only command."
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      id: "approval-edit-command",
      jsonrpc: "2.0",
      result: {
        action: "edit",
        approvalRequestId: fixture.approvalRequestId,
        execution: {
          status: "completed",
          toolName: "run_command"
        }
      }
    });
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("executes a modified apply_patch tool call for edit responses", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(
      join(projectDir, "src", "edit.ts"),
      "export const value = 1;\n"
    );
    writeFileSync(join(projectDir, "package.json"), '{"name":"old"}\n');
    const submitted = runtime.submitInteractiveTask("approval edit apply_patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const pending = await runtime.executeToolCall({
      input: {
        edits: [
          {
            newText: '{"name":"renamed"}\n',
            oldText: '{"name":"old"}\n',
            path: "package.json"
          }
        ],
        summary: "rename package"
      },
      toolName: "apply_patch"
    });

    expect(pending.ok).toBe(false);

    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "approval-edit-patch",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: approval.approvalRequestId,
            cwd: projectDir,
            modifiedToolCall: {
              input: {
                edits: [
                  {
                    newText: "export const value = 2;\n",
                    oldText: "export const value = 1;\n",
                    path: "src/edit.ts"
                  }
                ],
                summary: "bump value"
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      id: "approval-edit-patch",
      jsonrpc: "2.0",
      result: {
        action: "edit",
        approvalRequestId: approval.approvalRequestId,
        execution: {
          status: "completed",
          toolName: "apply_patch"
        }
      }
    });
    expect(runtime.getPendingApprovals()).toHaveLength(0);
  });

  it("ignores approval.respond notifications without producing side effects", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "approval.respond",
        params: {
          action: "allow",
          approvalRequestId: fixture.approvalRequestId,
          cwd: projectDir
        }
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
    expect(runtime.getPendingApprovals()).toHaveLength(1);
  });

  it("streams approval.requested notifications with NFR31 presentation fields", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "approval.requested notification fixture"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const input = new PassThrough();
    const server = runJsonRpcStdioServer({
      emitReady: false,
      input,
      output,
      runtime: bridge
    });

    writeJsonLine(input, {
      id: "subscribe-approval-requested",
      jsonrpc: "2.0",
      method: "event.subscribe",
      params: {
        cwd: projectDir,
        eventTypes: ["approval.requested"]
      }
    });
    await waitForCondition(
      () =>
        parseJsonLines(read()).some(
          (message) => message.id === "subscribe-approval-requested"
        ),
      "approval.requested subscription response"
    );

    const pending = await runtime.executeToolCall({
      input: {
        args: ["--version"],
        command: process.execPath,
        env: { STORY_75_REVIEW: "1" },
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(pending.ok).toBe(false);

    await waitForCondition(
      () =>
        parseJsonLines(read()).some(
          (message) => message.method === "event.runtime"
        ),
      "approval.requested notification"
    );
    input.end();
    await server;

    const notifications = parseJsonLines(read()).filter(
      (message) => message.method === "event.runtime"
    ) as Array<{
      params: {
        event: {
          correlationId: string;
          payload: Record<string, unknown>;
          taskId: string;
          type: string;
        };
        replay: boolean;
      };
    }>;

    expect(notifications).toHaveLength(1);
    expect(notifications[0].params).toMatchObject({
      replay: false,
      event: {
        correlationId: submitted.value.correlationId,
        taskId: submitted.value.taskId,
        type: "approval.requested",
        payload: {
          allowedActions: expect.arrayContaining(["allow", "deny", "edit"]),
          approvalRequestId: expect.stringMatching(/^appr_/),
          command: `${process.execPath} --version`,
          cwd: projectDir,
          envExposure: "custom",
          reason: expect.any(String),
          requestType: "command",
          riskLevel: expect.any(String),
          status: "pending",
          summary: expect.any(String),
          timeoutMs: 30_000
        }
      }
    });
  });

  it("rejects invalid approval.respond params with structured errors", async () => {
    const { projectDir, rootDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const outOfScopeDir = join(rootDir, "other-project");

    mkdirSync(outOfScopeDir, { recursive: true });

    const missingCwd = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "missing-cwd",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            approvalRequestId: fixture.approvalRequestId
          }
        },
        { runtime: bridge }
      )
    );
    const badCwd = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "bad-cwd",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            approvalRequestId: fixture.approvalRequestId,
            cwd: outOfScopeDir
          }
        },
        { runtime: bridge }
      )
    );
    const missingAction = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "missing-action",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const missingId = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "missing-id",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const unknownId = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "unknown-id",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            approvalRequestId: "appr_does-not-exist",
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const badAction = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "bad-action",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "explode",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const editWithoutPayload = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "edit-missing",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );
    const editWithBothPayloads = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "edit-both",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              type: "command"
            },
            modifiedToolCall: {
              input: {
                edits: [
                  {
                    newText: "x",
                    oldText: "y",
                    path: "package.json"
                  }
                ]
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const nonPositiveTimeout = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "non-positive-timeout",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              timeoutMs: 0,
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const invalidEnvKey = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "invalid-env-key",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              env: { "BAD-NAME": "1" },
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooManyEnvEntries = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-many-env-entries",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              env: Object.fromEntries(
                Array.from({ length: 65 }, (_entry, index) => [
                  `KEY_${index}`,
                  "1"
                ])
              ),
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongEnvValue = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-env-value",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "pwd",
              cwd: projectDir,
              env: { OK: "x".repeat(4_097) },
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongCommand = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-command",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              command: "x".repeat(16_001),
              cwd: projectDir,
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooManyArgs = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-many-args",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              args: Array.from({ length: 129 }, () => "x"),
              command: "pwd",
              cwd: projectDir,
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongArg = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-arg",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedRequest: {
              args: ["x".repeat(4_097)],
              command: "pwd",
              cwd: projectDir,
              type: "command"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooManyPatchEdits = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-many-patch-edits",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedToolCall: {
              input: {
                edits: Array.from({ length: 51 }, (_entry, index) => ({
                  newText: `${index}\n`,
                  oldText: `${index}\n`,
                  path: `file-${index}.txt`
                }))
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongOldText = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-old-text",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedToolCall: {
              input: {
                edits: [
                  {
                    newText: "new\n",
                    oldText: "x".repeat(65_537),
                    path: "file.txt"
                  }
                ]
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongNewText = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-new-text",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedToolCall: {
              input: {
                edits: [
                  {
                    newText: "y".repeat(65_537),
                    oldText: "old\n",
                    path: "file.txt"
                  }
                ]
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const tooLongPatchSummary = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "too-long-patch-summary",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "edit",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir,
            modifiedToolCall: {
              input: {
                edits: [
                  {
                    newText: "new\n",
                    oldText: "old\n",
                    path: "file.txt"
                  }
                ],
                summary: "x".repeat(1_001)
              },
              toolName: "apply_patch"
            }
          }
        },
        { runtime: bridge }
      )
    );
    const disallowedAction = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "disallowed-action",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "alwaysAllowForSession",
            approvalRequestId: fixture.approvalRequestId,
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );

    expect(missingCwd).toMatchObject({
      error: {
        code: -32602,
        data: { code: "INVALID_CWD", recoverable: true, subsystem: "rpc" }
      },
      id: "missing-cwd"
    });
    expect(badCwd).toMatchObject({
      error: {
        code: -32602,
        data: { code: "INVALID_CWD", recoverable: true, subsystem: "rpc" }
      },
      id: "bad-cwd"
    });
    expect(missingAction).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_ACTION_INVALID", subsystem: "rpc" }
      },
      id: "missing-action"
    });
    expect(missingId).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_REQUEST_ID_INVALID", subsystem: "rpc" }
      },
      id: "missing-id"
    });
    expect(unknownId).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_NOT_FOUND", subsystem: "rpc" }
      },
      id: "unknown-id"
    });
    expect(badAction).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_ACTION_INVALID", subsystem: "rpc" }
      },
      id: "bad-action"
    });
    expect(editWithoutPayload).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_EDIT_PAYLOAD_INVALID", subsystem: "rpc" }
      },
      id: "edit-missing"
    });
    expect(editWithBothPayloads).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_EDIT_PAYLOAD_INVALID", subsystem: "rpc" }
      },
      id: "edit-both"
    });
    for (const [id, response, expectedCode] of [
      ["non-positive-timeout", nonPositiveTimeout, "APPROVAL_TIMEOUT_INVALID"],
      ["invalid-env-key", invalidEnvKey, "APPROVAL_ENV_KEY_INVALID"],
      ["too-many-env-entries", tooManyEnvEntries, "APPROVAL_ENV_TOO_MANY_ENTRIES"],
      ["too-long-env-value", tooLongEnvValue, "APPROVAL_ENV_VALUE_TOO_LONG"],
      ["too-long-command", tooLongCommand, "APPROVAL_COMMAND_TOO_LONG"],
      ["too-many-args", tooManyArgs, "APPROVAL_ARGS_TOO_MANY"],
      ["too-long-arg", tooLongArg, "APPROVAL_ARG_TOO_LONG"],
      ["too-many-patch-edits", tooManyPatchEdits, "APPROVAL_PATCH_EDITS_TOO_MANY"],
      ["too-long-old-text", tooLongOldText, "APPROVAL_PATCH_TEXT_TOO_LONG"],
      ["too-long-new-text", tooLongNewText, "APPROVAL_PATCH_TEXT_TOO_LONG"],
      ["too-long-patch-summary", tooLongPatchSummary, "APPROVAL_PATCH_SUMMARY_TOO_LONG"]
    ] as const) {
      expect(response).toMatchObject({
        error: {
          code: -32602,
          data: { code: expectedCode, subsystem: "rpc" }
        },
        id
      });
    }
    expect(disallowedAction).toMatchObject({
      error: {
        code: -32602,
        data: { code: "APPROVAL_ACTION_NOT_ALLOWED", subsystem: "rpc" }
      },
      id: "disallowed-action"
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
  });

  it("rejects approval.respond when there is no active task", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "no-active",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "allow",
            approvalRequestId: "appr_does-not-exist",
            cwd: projectDir
          }
        },
        { runtime: bridge }
      )
    );

    expect(response).toMatchObject({
      error: {
        code: -32603,
        data: {
          code: "NO_ACTIVE_TASK",
          recoverable: false,
          subsystem: "rpc"
        }
      },
      id: "no-active"
    });
  });

  it("does not echo secret-like values in approval.respond errors", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    await createPendingCommandApproval(runtime);
    const response = await expectAsyncResponse(
      handleJsonRpcMessage(
        {
          id: "secret-bad-action",
          jsonrpc: "2.0",
          method: "approval.respond",
          params: {
            action: "OPENAI_API_KEY=sk-test-secret",
            approvalRequestId: "appr_OPENAI_API_KEY=sk-test-secret",
            cwd: projectDir,
            reason: "OPENAI_API_KEY=sk-test-secret"
          }
        },
        { runtime: bridge }
      )
    );

    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
    expect(JSON.stringify(response)).not.toContain(
      "OPENAI_API_KEY=sk-test-secret"
    );
  });

  it("streams approval.respond responses through the serialized write queue", async () => {
    const { output, read } = createCaptureWritable();
    const { projectDir, runtime, bridge } = createTempRuntime();
    const fixture = await createPendingCommandApproval(runtime);
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({ input, output, runtime: bridge });

    writeJsonLine(input, {
      id: "stream-subscribe",
      jsonrpc: "2.0",
      method: "event.subscribe",
      params: {
        cwd: projectDir,
        eventTypes: [
          "approval.resolved",
          "tool.call.completed",
          "tool.call.requested",
          "tool.call.started"
        ]
      }
    });
    writeJsonLine(input, {
      id: "stream-allow",
      jsonrpc: "2.0",
      method: "approval.respond",
      params: {
        action: "allow",
        approvalRequestId: fixture.approvalRequestId,
        cwd: projectDir
      }
    });
    input.end();
    await server;

    const messages = parseJsonLines(read());

    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    const allowResponse = messages.find(
      (message) => message.id === "stream-allow"
    ) as { result?: Record<string, unknown> } | undefined;

    expect(allowResponse).toBeDefined();
    expect(allowResponse?.result).toMatchObject({
      action: "allow",
      approvalRequestId: fixture.approvalRequestId
    });
  });
});

describe("task.getResult", () => {
  it("advertises task.getResult in protocol capabilities", () => {
    const { runtime, bridge } = createTempRuntime();
    const ready = createRpcReadyNotification(bridge);

    expect((ready.params as { capabilities: string[] }).capabilities).toEqual(
      expect.arrayContaining(["task.getResult"])
    );
  });

  it("returns TASK_NOT_TERMINAL for tasks that have not reached a terminal state", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "demonstrate task.getResult terminal gate"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const response = (await handleJsonRpcMessage(
      {
        id: "get-result-active",
        jsonrpc: "2.0",
        method: "task.getResult",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "get-result-active",
      jsonrpc: "2.0",
      error: {
        code: -32603,
        data: {
          code: "TASK_NOT_TERMINAL",
          recoverable: true,
          subsystem: "rpc"
        },
        message: expect.stringContaining("terminal state")
      }
    });
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
  });

  it("returns NO_ACTIVE_TASK when no task is active", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    expect(runtime.getActiveTask().ok).toBe(false);

    const response = (await handleJsonRpcMessage(
      {
        id: "no-active-task",
        jsonrpc: "2.0",
        method: "task.getResult",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "no-active-task",
      jsonrpc: "2.0",
      error: {
        code: -32603,
        data: {
          code: "NO_ACTIVE_TASK",
          recoverable: false,
          subsystem: "rpc"
        },
        message: expect.stringContaining("No active task")
      }
    });
  });

  it("returns TASK_NOT_FOUND for a taskId that does not match the active task", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "task.getResult non-matching taskId fixture"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const response = (await handleJsonRpcMessage(
      {
        id: "wrong-task-id",
        jsonrpc: "2.0",
        method: "task.getResult",
        params: {
          cwd: projectDir,
          taskId: "task_nonexistent_01"
        }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "wrong-task-id",
      jsonrpc: "2.0",
      error: {
        code: -32602,
        data: {
          code: "TASK_NOT_FOUND",
          recoverable: true,
          subsystem: "rpc"
        }
      }
    });
  });

  it("rejects task.getResult with out-of-scope cwd", async () => {
    const { rootDir, runtime, bridge } = createTempRuntime();
    const outOfScopeDir = join(rootDir, "other-project");

    mkdirSync(outOfScopeDir, { recursive: true });

    const response = (await handleJsonRpcMessage(
      {
        id: "wrong-cwd",
        jsonrpc: "2.0",
        method: "task.getResult",
        params: { cwd: outOfScopeDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "wrong-cwd",
      jsonrpc: "2.0",
      error: {
        code: -32602,
        data: { code: "INVALID_CWD", subsystem: "rpc" }
      }
    });
  });

  it("does not respond to task.getResult notifications", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "task.getResult",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
    expect(runtime.getActiveTask().ok).toBe(false);
  });
});

describe("task.learningReview", () => {
  it("advertises task.learningReview in protocol capabilities", () => {
    const { runtime, bridge } = createTempRuntime();
    const ready = createRpcReadyNotification(bridge);

    expect((ready.params as { capabilities: string[] }).capabilities).toEqual(
      expect.arrayContaining(["task.learningReview"])
    );
  });

  it("returns LEARNING_REVIEW_NOT_FOUND when no learning review exists for the active task", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "task.learningReview absent fixture"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const response = (await handleJsonRpcMessage(
      {
        id: "no-learning-review",
        jsonrpc: "2.0",
        method: "task.learningReview",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "no-learning-review",
      jsonrpc: "2.0",
      error: {
        code: -32602,
        data: {
          code: "LEARNING_REVIEW_NOT_FOUND",
          recoverable: true,
          subsystem: "rpc"
        }
      }
    });
  });

  it("returns NO_ACTIVE_TASK when no task is active", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    expect(runtime.getActiveTask().ok).toBe(false);

    const response = (await handleJsonRpcMessage(
      {
        id: "no-active-task-lr",
        jsonrpc: "2.0",
        method: "task.learningReview",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "no-active-task-lr",
      jsonrpc: "2.0",
      error: {
        code: -32603,
        data: {
          code: "NO_ACTIVE_TASK",
          subsystem: "rpc"
        }
      }
    });
  });

  it("rejects task.learningReview with out-of-scope cwd", async () => {
    const { rootDir, runtime, bridge } = createTempRuntime();
    const outOfScopeDir = join(rootDir, "other-project");

    mkdirSync(outOfScopeDir, { recursive: true });

    const response = (await handleJsonRpcMessage(
      {
        id: "wrong-cwd-lr",
        jsonrpc: "2.0",
        method: "task.learningReview",
        params: { cwd: outOfScopeDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "wrong-cwd-lr",
      jsonrpc: "2.0",
      error: {
        code: -32602,
        data: { code: "INVALID_CWD", subsystem: "rpc" }
      }
    });
  });

  it("does not respond to task.learningReview notifications", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "task.learningReview",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
  });
});

describe("runtime.getState", () => {
  it("advertises runtime.getState in protocol capabilities", () => {
    const { runtime, bridge } = createTempRuntime();
    const ready = createRpcReadyNotification(bridge);

    expect((ready.params as { capabilities: string[] }).capabilities).toEqual(
      expect.arrayContaining(["runtime.getState"])
    );
  });

  it("returns protocol metadata and no session when no task is active", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    const response = (await handleJsonRpcMessage(
      {
        id: "get-state-no-session",
        jsonrpc: "2.0",
        method: "runtime.getState",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "get-state-no-session",
      jsonrpc: "2.0",
      result: {
        protocol: {
          capabilities: expect.arrayContaining(["runtime.getState"]),
          protocolVersion: "2.0",
          runtimeConnected: true,
          server: "sprite-rpc",
          transport: "stdio"
        },
        session: null,
        task: null,
        provider: null,
        sandbox: {
          pendingApprovals: 0,
          eventCount: 0
        },
        warnings: expect.arrayContaining([
          expect.stringContaining("No active session")
        ])
      }
    });
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
  });

  it("returns session and task state when a task is active", async () => {
    const { projectDir, runtime, bridge } = createTempRuntime();
    const submitted = runtime.submitInteractiveTask(
      "runtime.getState active task fixture"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const response = (await handleJsonRpcMessage(
      {
        id: "get-state-active-task",
        jsonrpc: "2.0",
        method: "runtime.getState",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    const result = (response as JsonRpcSuccessResponse).result as Record<string, unknown>;

    expect(result.session).not.toBeNull();
    expect(result.task).not.toBeNull();
    expect(result.protocol).toBeDefined();

    const session = result.session as Record<string, unknown>;
    expect(session.sessionId).toEqual(expect.stringMatching(/^ses_/));
    expect(session.cwd).toBe(projectDir);

    const task = result.task as Record<string, unknown>;
    expect(task.taskId).toBe(submitted.value.taskId);
    expect(task.correlationId).toBe(submitted.value.correlationId);
    expect(task.status).toBe(submitted.value.status);

    expect(result.sandbox).toBeDefined();
    expect(JSON.stringify(response)).not.toContain("sk-test-secret");
  });

  it("strips provider secrets from the state response", async () => {
    const { projectDir, homeDir, bridge } = createTempRuntime();
    const runtimeWithProvider = new AgentRuntime({
      cwd: projectDir,
      homeDir,
      providerOverride: {
        apiKey: "sk-deadbeef1234-secret",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        providerName: "openai"
      }
    });
    const runtimeBridge = toBridge(runtimeWithProvider);

    const response = (await handleJsonRpcMessage(
      {
        id: "get-state-no-secrets",
        jsonrpc: "2.0",
        method: "runtime.getState",
        params: { cwd: projectDir }
      },
      { runtime: runtimeBridge }
    )) as JsonRpcResponse;

    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain("sk-deadbeef1234");
    expect(serialized).not.toContain("deadbeef");
    expect(serialized).not.toContain("https://api.openai.com");

    const result = (response as JsonRpcSuccessResponse).result as Record<string, unknown>;
    const provider = result.provider as Record<string, unknown> | null;

    if (provider !== null) {
      expect(provider.providerName).toBe("openai");
      expect(provider.model).toBe("gpt-4o");
      expect(provider).not.toHaveProperty("apiKey");
      expect(provider).not.toHaveProperty("baseUrl");
    }
  });

  it("rejects runtime.getState with out-of-scope cwd", async () => {
    const { rootDir, runtime, bridge } = createTempRuntime();
    const outOfScopeDir = join(rootDir, "other-project");

    mkdirSync(outOfScopeDir, { recursive: true });

    const response = (await handleJsonRpcMessage(
      {
        id: "wrong-cwd-state",
        jsonrpc: "2.0",
        method: "runtime.getState",
        params: { cwd: outOfScopeDir }
      },
      { runtime: bridge }
    )) as JsonRpcResponse;

    expect(response).toMatchObject({
      id: "wrong-cwd-state",
      jsonrpc: "2.0",
      error: {
        code: -32602,
        data: { code: "INVALID_CWD", subsystem: "rpc" }
      }
    });
  });

  it("does not respond to runtime.getState notifications", () => {
    const { projectDir, runtime, bridge } = createTempRuntime();

    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "runtime.getState",
        params: { cwd: projectDir }
      },
      { runtime: bridge }
    );

    expect(response).toBeUndefined();
  });
});
