import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AgentRuntime,
  createRuntimeEventRecord,
  validateRuntimeEvent
} from "@sprite/core";

const tempRoots: string[] = [];

function createTempRuntimeProject(): {
  outsideSecretPath: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-runtime-"));
  const projectDir = join(rootDir, "project");
  const outsideSecretPath = join(rootDir, "outside-secret.txt");

  mkdirSync(projectDir, { recursive: true });
  writeFileSync(outsideSecretPath, "OPENAI_API_KEY=sk-test-secret");
  tempRoots.push(rootDir);

  return { outsideSecretPath, projectDir, rootDir };
}

function writeProjectFile(
  projectDir: string,
  relativePath: string,
  value: string
): void {
  const targetPath = join(projectDir, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, value);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("runtime event contract", () => {
  it("validates the canonical runtime event base shape", () => {
    const event = createRuntimeEventRecord(
      {
        eventId: "evt_test",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "task.started",
      {
        phase: "plan",
        status: "planned",
        providerName: "openai-compatible",
        model: "gpt-5.4"
      }
    );

    const result = validateRuntimeEvent(event);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      schemaVersion: 1,
      type: "task.started",
      sessionId: "session_test",
      taskId: "task_test",
      correlationId: "corr_test"
    });
  });

  it("rejects malformed runtime events that do not satisfy the schema contract", () => {
    const result = validateRuntimeEvent({
      schemaVersion: 2,
      eventId: "",
      sessionId: "session_test",
      taskId: "task_test",
      correlationId: "corr_test",
      type: "task.waiting",
      createdAt: "not-a-date",
      payload: {}
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME_EVENT"
    });
  });

  it("returns a schema error instead of throwing for non-string base fields", () => {
    const validate = () =>
      validateRuntimeEvent({
        schemaVersion: 1,
        eventId: undefined,
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        type: "task.waiting",
        createdAt: "2026-04-23T12:40:00.000Z",
        payload: {
          reason: "steering-required",
          message: "Waiting for steering input."
        }
      });

    expect(validate).not.toThrow();

    const result = validate();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME_EVENT"
    });
  });

  it("rejects payload values that do not match the event-specific contract", () => {
    const result = validateRuntimeEvent({
      schemaVersion: 1,
      eventId: "evt_test",
      sessionId: "session_test",
      taskId: "task_test",
      correlationId: "corr_test",
      type: "task.failed",
      createdAt: "2026-04-23T12:40:00.000Z",
      payload: {
        reason: "cancelled",
        message: "A cancelled reason must not validate as task.failed."
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME_EVENT"
    });
  });

  it("validates canonical tool lifecycle events", () => {
    const event = createRuntimeEventRecord(
      {
        eventId: "evt_tool",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "tool.call.completed",
      {
        cwd: "/tmp/project",
        outputReference: {
          fullOutputStored: false,
          reason: "Full output persistence is not implemented yet."
        },
        status: "completed",
        summary: "read_file completed for README.md.",
        targetPath: "README.md",
        toolCallId: "tool_call_test",
        toolName: "read_file"
      }
    );

    const result = validateRuntimeEvent(event);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      type: "tool.call.completed",
      payload: {
        toolCallId: "tool_call_test",
        toolName: "read_file",
        status: "completed"
      }
    });
  });

  it("rejects tool lifecycle events that include raw content in metadata payloads", () => {
    const result = validateRuntimeEvent({
      schemaVersion: 1,
      eventId: "evt_tool",
      sessionId: "session_test",
      taskId: "task_test",
      correlationId: "corr_test",
      type: "tool.call.completed",
      createdAt: "2026-04-23T12:40:00.000Z",
      payload: {
        cwd: "/tmp/project",
        rawContent: "OPENAI_API_KEY=sk-test-secret",
        status: "completed",
        summary: "read_file completed.",
        toolCallId: "tool_call_test",
        toolName: "read_file"
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME_EVENT"
    });
  });

  it("validates canonical file activity events", () => {
    const event = createRuntimeEventRecord(
      {
        eventId: "evt_file_activity",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "file.activity.recorded",
      {
        activityId: "file_activity_test",
        kind: "read",
        path: "src/index.ts",
        status: "recorded",
        summary: "read_file recorded read activity for src/index.ts.",
        toolCallId: "tool_call_test",
        toolName: "read_file"
      }
    );

    const result = validateRuntimeEvent(event);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      type: "file.activity.recorded",
      payload: {
        activityId: "file_activity_test",
        kind: "read",
        path: "src/index.ts",
        status: "recorded",
        toolCallId: "tool_call_test"
      }
    });
  });

  it("rejects file activity events with raw content, query text, or unsafe paths", () => {
    const baseEvent = {
      schemaVersion: 1,
      eventId: "evt_file_activity",
      sessionId: "session_test",
      taskId: "task_test",
      correlationId: "corr_test",
      type: "file.activity.recorded",
      createdAt: "2026-04-23T12:40:00.000Z",
      payload: {
        activityId: "file_activity_test",
        kind: "searched",
        path: "src/index.ts",
        query: "OPENAI_API_KEY=sk-test-secret",
        status: "recorded",
        summary: "search_files recorded activity.",
        toolCallId: "tool_call_test",
        toolName: "search_files"
      }
    };

    const rawQuery = validateRuntimeEvent(baseEvent);
    const unsafePath = validateRuntimeEvent({
      ...baseEvent,
      payload: {
        ...baseEvent.payload,
        path: "../outside.txt",
        query: undefined
      }
    });
    const secretSummary = validateRuntimeEvent({
      ...baseEvent,
      payload: {
        ...baseEvent.payload,
        query: undefined,
        summary: "search_files recorded OPENAI_API_KEY=sk-test-secret."
      }
    });

    expect(rawQuery.ok).toBe(false);
    expect(unsafePath.ok).toBe(false);
    expect(secretSummary.ok).toBe(false);
  });

  it("validates file edit lifecycle events without raw patch metadata", () => {
    const valid = createRuntimeEventRecord(
      {
        eventId: "evt_file_edit",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "file.edit.applied",
      {
        affectedFiles: ["src/index.ts"],
        editId: "file_edit_test",
        status: "applied",
        summary: "apply_patch edit applied.",
        toolCallId: "tool_call_test",
        toolName: "apply_patch"
      }
    );
    const rawPatch = {
      ...valid,
      payload: {
        ...valid.payload,
        patch: "@@ raw patch",
        summary: "apply_patch edit applied."
      }
    };
    const unsafePath = {
      ...valid,
      payload: {
        ...valid.payload,
        affectedFiles: ["../outside.ts"]
      }
    };
    const secretSummary = {
      ...valid,
      payload: {
        ...valid.payload,
        summary: "apply_patch edit applied with OPENAI_API_KEY=sk-test-secret."
      }
    };

    expect(validateRuntimeEvent(valid).ok).toBe(true);
    expect(validateRuntimeEvent(rawPatch).ok).toBe(false);
    expect(validateRuntimeEvent(unsafePath).ok).toBe(false);
    expect(validateRuntimeEvent(secretSummary).ok).toBe(false);
  });

  it("validates policy decision events without raw command or patch metadata", () => {
    const valid = createRuntimeEventRecord(
      {
        eventId: "evt_policy",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "policy.decision.recorded",
      {
        action: "require_approval",
        command: "npm run test",
        cwd: "/tmp/project",
        envExposure: "custom",
        reason: "Custom environment metadata requires approval.",
        requestType: "command",
        riskLevel: "high",
        ruleId: "command.env.custom",
        status: "recorded",
        summary: "Command policy decision recorded.",
        timeoutMs: 30_000
      }
    );
    const rawStdout = {
      ...valid,
      payload: {
        ...valid.payload,
        stdout: "OPENAI_API_KEY=sk-test-secret"
      }
    };
    const unsafePath = createRuntimeEventRecord(
      {
        eventId: "evt_policy_files",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "policy.decision.recorded",
      {
        action: "deny",
        affectedFiles: ["../outside.ts"],
        reason: "Unsafe path is denied.",
        requestType: "file_edit",
        riskLevel: "critical",
        ruleId: "file_edit.path.unsafe",
        status: "recorded",
        summary: "File edit policy decision recorded."
      }
    );
    const invalidAction = {
      ...valid,
      payload: {
        ...valid.payload,
        action: "maybe"
      }
    };
    const secretSummary = {
      ...valid,
      payload: {
        ...valid.payload,
        summary: "Command policy decision OPENAI_API_KEY=sk-test-secret."
      }
    };

    expect(validateRuntimeEvent(valid).ok).toBe(true);
    expect(validateRuntimeEvent(rawStdout).ok).toBe(false);
    expect(validateRuntimeEvent(unsafePath).ok).toBe(false);
    expect(validateRuntimeEvent(invalidAction).ok).toBe(false);
    expect(validateRuntimeEvent(secretSummary).ok).toBe(false);
  });
});

describe("runtime event subscription", () => {
  it("emits a deterministic first-task event sequence that adapters can subscribe to", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    const observedTypes: string[] = [];

    const unsubscribe = runtime.subscribeToEvents((event) => {
      observedTypes.push(event.type);
    });

    runtime.submitInteractiveTask("fix the provider output");
    runtime.steerActiveTask("Focus on task.waiting payload shape.");
    runtime.cancelActiveTask(
      "User cancelled after reviewing the waiting state."
    );
    unsubscribe();

    expect(observedTypes).toEqual([
      "task.started",
      "task.waiting",
      "task.steering.received",
      "task.waiting",
      "task.cancelled"
    ]);
  });

  it("stores event history per task so adapters can render without owning runtime state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const submitted = runtime.submitInteractiveTask("inspect event history");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    runtime.steerActiveTask("Record another event.");
    const history = runtime.getEventHistory(submitted.value.taskId);

    expect(history).toHaveLength(4);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "task.steering.received",
      "task.waiting"
    ]);
    expect(
      history.every((event) => event.taskId === submitted.value.taskId)
    ).toBe(true);
  });

  it("isolates subscriber mutations from canonical runtime event history", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    let observedReason: unknown;

    runtime.subscribeToEvents((event) => {
      if (event.type === "task.waiting") {
        event.payload.reason = "mutated-by-subscriber";
      }
    });
    runtime.subscribeToEvents((event) => {
      if (event.type === "task.waiting") {
        observedReason = event.payload.reason;
      }
    });

    const submitted = runtime.submitInteractiveTask(
      "protect runtime event truth"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const waitingEvent = submitted.value.events.find(
      (event) => event.type === "task.waiting"
    );
    const history = runtime.getEventHistory(submitted.value.taskId);
    const historyWaitingEvent = history.find(
      (event) => event.type === "task.waiting"
    );

    expect(observedReason).toBe("steering-required");
    expect(waitingEvent?.payload.reason).toBe("steering-required");
    expect(historyWaitingEvent?.payload.reason).toBe("steering-required");

    if (historyWaitingEvent !== undefined) {
      historyWaitingEvent.payload.reason = "mutated-by-history-reader";
    }

    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .find((event) => event.type === "task.waiting")?.payload.reason
    ).toBe("steering-required");
  });

  it("keeps subscriber failures from aborting runtime task transitions", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    const observedTypes: string[] = [];

    runtime.subscribeToEvents(() => {
      throw new Error("subscriber failed");
    });
    runtime.subscribeToEvents((event) => {
      observedTypes.push(event.type);
    });

    const submitted = runtime.submitInteractiveTask(
      "continue when subscribers fail"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    expect(submitted.value.status).toBe("waiting-for-input");
    expect(runtime.getActiveTask().ok).toBe(true);
    expect(
      runtime.getEventHistory(submitted.value.taskId).map((event) => event.type)
    ).toEqual(["task.started", "task.waiting"]);
    expect(observedTypes).toEqual(["task.started", "task.waiting"]);
  });

  it("emits tool lifecycle and file activity events through AgentRuntime without adapter-owned state", async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      homeDir: "/tmp/sprite-home"
    });
    const observedTypes: string[] = [];
    runtime.subscribeToEvents((event) => {
      observedTypes.push(event.type);
    });

    const submitted = runtime.submitInteractiveTask("read package metadata");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: { path: "package.json" },
      toolName: "read_file"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(observedTypes.slice(-4)).toEqual([
      "tool.call.requested",
      "tool.call.started",
      "tool.call.completed",
      "file.activity.recorded"
    ]);
    const history = runtime.getEventHistory(submitted.value.taskId);
    const toolEvents = history.filter((event) =>
      event.type.startsWith("tool.call.")
    );
    const activityEvents = history.filter(
      (event) => event.type === "file.activity.recorded"
    );

    expect(toolEvents.map((event) => event.type)).toEqual([
      "tool.call.requested",
      "tool.call.started",
      "tool.call.completed"
    ]);
    expect(activityEvents).toHaveLength(1);
    expect(activityEvents[0]?.payload).toMatchObject({
      kind: "read",
      path: "package.json",
      status: "recorded",
      toolName: "read_file"
    });
    expect(activityEvents[0]?.payload.toolCallId).toBe(
      toolEvents[0]?.payload.toolCallId
    );
  });

  it("emits failed tool lifecycle events without exposing raw file content", async () => {
    const { outsideSecretPath, projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });

    const submitted = runtime.submitInteractiveTask("read denied file");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: { path: outsideSecretPath },
      toolName: "read_file"
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const toolEvents = runtime
      .getEventHistory(submitted.value.taskId)
      .filter((event) => event.type.startsWith("tool.call."));

    expect(toolEvents.map((event) => event.type)).toEqual([
      "tool.call.requested",
      "tool.call.started",
      "tool.call.failed"
    ]);
    expect(JSON.stringify(toolEvents)).not.toContain("outside-secret");
    expect(JSON.stringify(toolEvents)).not.toContain("sk-test-secret");
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .filter((event) => event.type === "file.activity.recorded")
    ).toEqual([]);
  });

  it("records search activity without raw snippets or query text", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(
      projectDir,
      "src/secret.ts",
      "const value = 'OPENAI_API_KEY=sk-test-secret';\n"
    );
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });

    const submitted = runtime.submitInteractiveTask(
      "search secret-looking text"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: { path: ".", query: "OPENAI_API_KEY" },
      toolName: "search_files"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const activityEvents = runtime
      .getEventHistory(submitted.value.taskId)
      .filter((event) => event.type === "file.activity.recorded");
    const serializedActivity = JSON.stringify(activityEvents);

    expect(activityEvents.map((event) => event.payload.path)).toEqual([
      "src/secret.ts"
    ]);
    expect(serializedActivity).not.toContain("OPENAI_API_KEY");
    expect(serializedActivity).not.toContain("sk-test-secret");
  });

  it("does not copy project-relative paths into file activity summaries", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "sk-filename-tokenish.txt", "content\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("read token-like filename");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: { path: "sk-filename-tokenish.txt" },
      toolName: "read_file"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const activityEvents = runtime
      .getEventHistory(submitted.value.taskId)
      .filter((event) => event.type === "file.activity.recorded");

    expect(activityEvents).toHaveLength(1);
    expect(activityEvents[0]?.payload).toMatchObject({
      path: "sk-filename-tokenish.txt",
      summary: "read_file recorded read activity."
    });
  });

  it("bounds file activity records for large list output", async () => {
    const { projectDir } = createTempRuntimeProject();

    for (let index = 0; index < 600; index += 1) {
      writeProjectFile(
        projectDir,
        `many/file-${String(index).padStart(3, "0")}.txt`,
        "content"
      );
    }

    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("list many files");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: { path: ".", recursive: true },
      toolName: "list_files"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const activityEvents = runtime
      .getEventHistory(submitted.value.taskId)
      .filter((event) => event.type === "file.activity.recorded");

    expect(activityEvents.length).toBeLessThanOrEqual(81);
    expect(activityEvents[0]?.payload).toMatchObject({
      kind: "listed",
      path: ".",
      returnedItemCount: 80,
      totalItemCount: 601
    });
  });

  it("records explicit proposed and changed file activity safely", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "track future edit activity"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const proposed = runtime.recordFileActivity({
      kind: "proposed_change",
      paths: ["src/index.ts"]
    });
    const changed = runtime.recordFileActivity({
      kind: "changed",
      paths: ["src/index.ts"]
    });
    const unsafe = runtime.recordFileActivity({
      kind: "changed",
      paths: ["../outside.ts"]
    });
    const nestedRaw = runtime.recordFileActivity({
      kind: "changed",
      paths: ["src/index.ts"],
      metadata: {
        diff: "+OPENAI_API_KEY=sk-test-secret"
      }
    } as never);

    expect(proposed.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(unsafe.ok).toBe(false);
    expect(nestedRaw.ok).toBe(false);
    if (!proposed.ok || !changed.ok) {
      return;
    }

    expect(proposed.value[0]).toMatchObject({
      kind: "proposed_change",
      path: "src/index.ts"
    });
    expect(changed.value[0]).toMatchObject({
      kind: "changed",
      path: "src/index.ts"
    });
  });

  it("emits file edit events and changed activity for successful patches", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "src/edit.ts", "export const value = 1;\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("apply targeted patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "src/edit.ts",
            oldText: "value = 1",
            newText: "value = 2"
          }
        ]
      },
      toolName: "apply_patch"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "tool.call.requested",
      "tool.call.started",
      "file.edit.requested",
      "tool.call.completed",
      "file.edit.applied",
      "file.activity.recorded"
    ]);

    const editEvents = history.filter((event) =>
      event.type.startsWith("file.edit.")
    );
    const activityEvents = history.filter(
      (event) => event.type === "file.activity.recorded"
    );

    expect(editEvents.map((event) => event.payload.status)).toEqual([
      "requested",
      "applied"
    ]);
    expect(activityEvents[0]?.payload).toMatchObject({
      kind: "changed",
      path: "src/edit.ts",
      toolName: "apply_patch"
    });
  });

  it("emits policy decisions with active task correlation id without executing or mutating", () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(
      projectDir,
      "src/unchanged.ts",
      "export const value = 1;\n"
    );
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("classify policy request");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const decision = runtime.classifyPolicyRequest({
      args: ["status"],
      command: "git",
      cwd: projectDir,
      timeoutMs: 30_000,
      type: "command"
    });

    expect(decision).toMatchObject({
      ok: true,
      value: {
        action: "allow",
        ruleId: "command.readonly"
      }
    });
    expect(readFileSync(join(projectDir, "src/unchanged.ts"), "utf8")).toBe(
      "export const value = 1;\n"
    );

    const history = runtime.getEventHistory(submitted.value.taskId);
    const policyEvents = history.filter(
      (event) => event.type === "policy.decision.recorded"
    );

    expect(policyEvents).toHaveLength(1);
    expect(policyEvents[0]).toMatchObject({
      correlationId: submitted.value.correlationId,
      payload: {
        action: "allow",
        command: "git status",
        requestType: "command",
        riskLevel: "low",
        ruleId: "command.readonly",
        status: "recorded"
      }
    });
    expect(history.some((event) => event.type.startsWith("tool.call."))).toBe(
      false
    );
  });

  it("executes allowed run_command requests after recording policy decisions", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("run pwd safely");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: {
        command: "pwd",
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      command: "pwd",
      status: "completed",
      timedOut: false,
      toolName: "run_command"
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "tool.call.requested",
      "tool.call.started",
      "tool.call.completed"
    ]);
    expect(history[2]).toMatchObject({
      correlationId: submitted.value.correlationId,
      payload: {
        action: "allow",
        command: "pwd",
        requestType: "command",
        status: "recorded"
      },
      type: "policy.decision.recorded"
    });
    expect(history[3]?.payload).toMatchObject({
      command: "pwd",
      status: "requested",
      timeoutMs: 30_000,
      toolName: "run_command"
    });
    expect(history[5]?.payload).toMatchObject({
      command: "pwd",
      durationMs: expect.any(Number),
      exitCode: 0,
      outputReference: {
        fullOutputStored: false
      },
      status: "completed",
      timeoutMs: 30_000,
      toolName: "run_command"
    });
    expect(JSON.stringify(history)).not.toContain("stdout");
    expect(JSON.stringify(history)).not.toContain("stderr");
  });

  it("does not execute denied or approval-required run_command requests", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "do not run unsafe commands"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const denied = await runtime.executeToolCall({
      input: {
        args: ["-rf", "/"],
        command: "sudo",
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const approvalRequired = await runtime.executeToolCall({
      input: {
        command: "node",
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(denied).toMatchObject({
      error: { code: "COMMAND_DENIED_BY_POLICY" },
      ok: false
    });
    expect(approvalRequired).toMatchObject({
      error: { code: "COMMAND_REQUIRES_APPROVAL" },
      ok: false
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "policy.decision.recorded"
    ]);
    const activeTask = runtime.getActiveTask();
    expect(activeTask.ok).toBe(true);
    if (activeTask.ok) {
      expect(activeTask.value.events.map((event) => event.type)).toEqual(
        history.map((event) => event.type)
      );
    }
    expect(history.some((event) => event.type.startsWith("tool.call."))).toBe(
      false
    );
  });

  it("emits failed run_command lifecycle events for command failures", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("run git status failure");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: {
        args: ["status"],
        command: "git",
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(result).toMatchObject({
      error: { code: "TOOL_COMMAND_FAILED" },
      ok: false
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "tool.call.requested",
      "tool.call.started",
      "tool.call.failed"
    ]);
    expect(history[5]?.payload).toMatchObject({
      command: "git status",
      durationMs: expect.any(Number),
      errorCode: "TOOL_COMMAND_FAILED",
      exitCode: expect.any(Number),
      outputReference: {
        fullOutputStored: false
      },
      status: "failed",
      timeoutMs: 30_000,
      toolName: "run_command"
    });
  });

  it("does not gate existing apply_patch execution before approval enforcement exists", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "src/edit.ts", "export const value = 1;\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "classify then apply targeted patch"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const decision = runtime.classifyPolicyRequest({
      affectedFiles: ["package.json"],
      editKind: "targeted_patch",
      type: "file_edit"
    });
    const result = await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "src/edit.ts",
            oldText: "value = 1",
            newText: "value = 2"
          }
        ]
      },
      toolName: "apply_patch"
    });

    expect(decision).toMatchObject({
      ok: true,
      value: {
        action: "require_approval",
        ruleId: "file_edit.package_config"
      }
    });
    expect(result.ok).toBe(true);

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "tool.call.requested",
      "tool.call.started",
      "file.edit.requested",
      "tool.call.completed",
      "file.edit.applied",
      "file.activity.recorded"
    ]);
  });

  it("emits patch failure events without changed file activity", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "src/edit.ts", "export const value = 1;\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("apply failing patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const result = await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "src/edit.ts",
            oldText: "missing",
            newText: "value = 2"
          }
        ]
      },
      toolName: "apply_patch"
    });

    expect(result.ok).toBe(false);

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "tool.call.requested",
      "tool.call.started",
      "file.edit.requested",
      "tool.call.failed",
      "file.edit.failed"
    ]);
    expect(
      history.filter((event) => event.type === "file.activity.recorded")
    ).toEqual([]);
  });

  it("returns structured tool failure for malformed patch input", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("apply malformed patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const execute = () =>
      runtime.executeToolCall({
        input: { edits: [null] } as never,
        toolName: "apply_patch"
      });

    await expect(execute()).resolves.toMatchObject({
      error: { code: "TOOL_INVALID_INPUT" },
      ok: false
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "tool.call.requested",
      "tool.call.started",
      "tool.call.failed"
    ]);
    expect(
      history.filter((event) => event.type.startsWith("file.edit."))
    ).toEqual([]);
  });
});
