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
import { PassThrough, Readable, Writable } from "node:stream";

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

  it("starts tasks over RPC inside a previously created session", () => {
    const { homeDir, projectDir, runtime } = createTempRuntime();
    const created = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "create-for-task",
          jsonrpc: "2.0",
          method: "session.create",
          params: { cwd: projectDir }
        },
        { runtime }
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
        { runtime }
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
    const { projectDir, runtime } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({ input, output, runtime });

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
    const { projectDir, runtime } = createTempRuntime();

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
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({
      emitReady: false,
      input,
      output,
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
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
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
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
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
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
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
    const input = new PassThrough();
    const server = runJsonRpcStdioServer({
      emitReady: false,
      input,
      output,
      runtime
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
    const { projectDir, rootDir, runtime } = createTempRuntime();
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
      runtime
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
    const { projectDir, runtime } = createTempRuntime();
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
        { runtime }
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
    const { homeDir, projectDir, runtime: seedRuntime } = createTempRuntime();
    const first = seedRuntime.submitInteractiveTask("seed persisted RPC task");

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
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
        { runtime }
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
    const { projectDir, runtime } = createTempRuntime();
    const response = handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        method: "task.start",
        params: {
          cwd: projectDir,
          task: "notification must not start"
        }
      },
      { runtime }
    );

    expect(response).toBeUndefined();
    expect(runtime.getActiveTask().ok).toBe(false);
    expect(runtime.getEventHistory()).toEqual([]);
    expect(existsSync(join(projectDir, ".sprite", "sessions"))).toBe(false);
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

  it("returns invalid params for unsafe or unsupported task.start scopes", () => {
    const { projectDir, runtime } = createTempRuntime();
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
          { runtime }
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
    const { projectDir, runtime } = createTempRuntime();
    const first = expectSingleResponse(
      handleJsonRpcMessage(
        {
          id: "first-task",
          jsonrpc: "2.0",
          method: "task.start",
          params: { cwd: projectDir, task: "first task" }
        },
        { runtime }
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
        { runtime }
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
        '{"jsonrpc":"2.0","id":1,"method":"rpc.ping"}\n',
        "{not-json}\n",
        '{"jsonrpc":"2.0","id":2,"method":"missing"}\n'
      ]),
      output,
      runtime
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
        '{"jsonrpc":"2.0","id":"crlf","method":"rpc.ping"}\r\n',
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
