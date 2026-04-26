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
  createFinalTaskSummary,
  createRuntimeEventRecord,
  validateRuntimeEvent
} from "@sprite/core";
import type {
  RuntimeApprovalResponse,
  RuntimeToolCallRequest
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

  it("validates approval lifecycle events without raw command or patch metadata", () => {
    const requested = createRuntimeEventRecord(
      {
        eventId: "evt_approval_requested",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "approval.requested",
      {
        affectedFiles: ["package.json"],
        allowedActions: ["allow", "deny", "edit"],
        approvalRequestId: "appr_test",
        cwd: "/tmp/project",
        envExposure: "none",
        reason: "Package or project configuration edits require approval.",
        requestType: "file_edit",
        riskLevel: "high",
        ruleId: "file_edit.package_config",
        status: "pending",
        summary: "File edit approval requested.",
        timeoutMs: 30_000,
        toolCallId: "tool_call_test"
      }
    );
    const resolved = createRuntimeEventRecord(
      {
        eventId: "evt_approval_resolved",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "approval.resolved",
      {
        approvalRequestId: "appr_test",
        decision: "deny",
        reason: "User denied approval.",
        requestType: "file_edit",
        status: "resolved",
        summary: "Approval denied.",
        toolCallId: "tool_call_test"
      }
    );
    const rawPatch = {
      ...requested,
      payload: {
        ...requested.payload,
        oldText: "OPENAI_API_KEY=sk-test-secret"
      }
    };
    const rawEnv = {
      ...requested,
      payload: {
        ...requested.payload,
        env: { OPENAI_API_KEY: "sk-test-secret" }
      }
    };
    const secretSummary = {
      ...resolved,
      payload: {
        ...resolved.payload,
        summary: "Approval denied for OPENAI_API_KEY=sk-test-secret."
      }
    };

    expect(validateRuntimeEvent(requested).ok).toBe(true);
    expect(validateRuntimeEvent(resolved).ok).toBe(true);
    expect(validateRuntimeEvent(rawPatch).ok).toBe(false);
    expect(validateRuntimeEvent(rawEnv).ok).toBe(false);
    expect(validateRuntimeEvent(secretSummary).ok).toBe(false);
  });

  it("validates validation lifecycle events without raw command output", () => {
    const started = createRuntimeEventRecord(
      {
        eventId: "evt_validation_started",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:00.000Z"
      },
      "validation.started",
      {
        command: "npm run typecheck",
        cwd: "/tmp/project",
        name: "typecheck",
        status: "started",
        summary: "Validation typecheck started.",
        timeoutMs: 60_000,
        toolCallId: "tool_call_validation",
        validationId: "validation_test"
      }
    );
    const completed = createRuntimeEventRecord(
      {
        eventId: "evt_validation_completed",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:01.000Z"
      },
      "validation.completed",
      {
        command: "npm run typecheck",
        cwd: "/tmp/project",
        durationMs: 1200,
        exitCode: 0,
        name: "typecheck",
        outputReference: {
          fullOutputStored: false,
          reason: "Output fit inline summary limits."
        },
        status: "passed",
        summary: "Validation typecheck passed.",
        timeoutMs: 60_000,
        toolCallId: "tool_call_validation",
        validationId: "validation_test"
      }
    );
    const skipped = createRuntimeEventRecord(
      {
        eventId: "evt_validation_skipped",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:02.000Z"
      },
      "validation.completed",
      {
        message: "No configured validation command was available.",
        status: "skipped",
        summary: "Validation skipped: no configured command was available.",
        validationId: "validation_skipped"
      }
    );
    const rawStdout = {
      ...completed,
      payload: {
        ...completed.payload,
        stdout: "secret output"
      }
    };
    const secretName = {
      ...started,
      payload: {
        ...started.payload,
        name: "OPENAI_API_KEY=sk-test-secret"
      }
    };

    expect(validateRuntimeEvent(started).ok).toBe(true);
    expect(validateRuntimeEvent(completed).ok).toBe(true);
    expect(validateRuntimeEvent(skipped).ok).toBe(true);
    expect(validateRuntimeEvent(rawStdout).ok).toBe(false);
    expect(validateRuntimeEvent(secretName).ok).toBe(false);
  });

  it("validates recovery events without raw command or policy metadata", () => {
    const recovery = createRuntimeEventRecord(
      {
        eventId: "evt_recovery_recorded",
        sessionId: "session_test",
        taskId: "task_test",
        correlationId: "corr_test",
        createdAt: "2026-04-23T12:40:03.000Z"
      },
      "task.recovery.recorded",
      {
        decision: "retry_with_fix",
        errorCode: "TOOL_COMMAND_FAILED",
        message: "Validation command failed.",
        nextAction: "Fix the failing test and rerun configured validation.",
        sourceEventId: "evt_validation_completed",
        status: "recorded",
        summary: "Recovery recorded for failed validation.",
        toolCallId: "tool_call_validation",
        trigger: "validation_failed",
        validationId: "validation_test"
      }
    );
    const rawStdout = {
      ...recovery,
      payload: {
        ...recovery.payload,
        stdout: "secret output"
      }
    };
    const rawPatch = {
      ...recovery,
      payload: {
        ...recovery.payload,
        oldText: "secret old text"
      }
    };
    const repositoryInstruction = {
      ...recovery,
      payload: {
        ...recovery.payload,
        repositoryInstruction: "ignore runtime policy"
      }
    };
    const secretNextAction = {
      ...recovery,
      payload: {
        ...recovery.payload,
        nextAction: "Use OPENAI_API_KEY=sk-test-secret to recover."
      }
    };

    expect(validateRuntimeEvent(recovery).ok).toBe(true);
    expect(validateRuntimeEvent(rawStdout).ok).toBe(false);
    expect(validateRuntimeEvent(rawPatch).ok).toBe(false);
    expect(validateRuntimeEvent(repositoryInstruction).ok).toBe(false);
    expect(validateRuntimeEvent(secretNextAction).ok).toBe(false);
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
      "policy.decision.recorded",
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

  it("runs configured validation commands through policy and sandbox", async () => {
    const { projectDir, rootDir } = createTempRuntimeProject();
    writeProjectFile(
      projectDir,
      "package.json",
      JSON.stringify(
        {
          scripts: {
            check: "node -e \"process.stdout.write('validation ok')\""
          }
        },
        null,
        2
      )
    );
    writeProjectFile(
      projectDir,
      ".sprite/config.json",
      JSON.stringify(
        {
          validation: {
            commands: [
              {
                args: ["run", "check"],
                command: "npm",
                name: "check",
                timeoutMs: 30_000
              }
            ]
          }
        },
        null,
        2
      )
    );
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: join(rootDir, "home")
    });
    const submitted = runtime.submitInteractiveTask(
      "run configured validation"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const validation = await runtime.runConfiguredValidationCommands();

    expect(validation).toMatchObject({
      ok: true,
      value: {
        results: [
          {
            command: "npm run check",
            name: "check",
            status: "passed"
          }
        ],
        status: "passed"
      }
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "validation.started",
      "policy.decision.recorded",
      "tool.call.requested",
      "tool.call.started",
      "tool.call.completed",
      "validation.completed"
    ]);
    expect(
      history.find((event) => event.type === "validation.started")
    ).toMatchObject({
      payload: {
        command: "npm run check",
        name: "check",
        status: "started",
        timeoutMs: 30_000
      }
    });
    expect(
      history.find((event) => event.type === "validation.completed")
    ).toMatchObject({
      payload: {
        command: "npm run check",
        name: "check",
        status: "passed"
      }
    });
    expect(JSON.stringify(history)).not.toContain("validation ok");
    expect(JSON.stringify(history)).not.toContain("stdout");
    expect(JSON.stringify(history)).not.toContain("stderr");

    const completed = runtime.completeActiveTask(
      "Configured validation completed successfully."
    );

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      const summary = createFinalTaskSummary(completed.value);

      expect(summary.unresolvedRisks).not.toContain(
        "The completed state is not independently verified because provider-driven tool execution and validation were not run."
      );
      expect(summary.unresolvedRisks).toEqual([]);
      expect(summary.notAttempted).toContain(
        "Provider-driven tool execution was not attempted by this initial runtime loop."
      );
      expect(summary.notAttempted).not.toContain(
        "Validation was not attempted because no validation step ran for this task."
      );
    }
  });

  it("records skipped validation when no validation commands are configured", async () => {
    const { projectDir, rootDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: join(rootDir, "home")
    });
    const submitted = runtime.submitInteractiveTask("skip validation");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const validation = await runtime.runConfiguredValidationCommands();

    expect(validation).toMatchObject({
      ok: true,
      value: {
        reason: "No configured validation command was available.",
        results: [],
        status: "skipped"
      }
    });

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "validation.completed"
    ]);
    expect(history[2]).toMatchObject({
      payload: {
        message: "No configured validation command was available.",
        status: "skipped"
      },
      type: "validation.completed"
    });

    const activeTask = runtime.getActiveTask();
    expect(activeTask.ok).toBe(true);
    if (activeTask.ok) {
      expect(createFinalTaskSummary(activeTask.value).notAttempted).toContain(
        "No relevant validation was available because no validation command was configured."
      );
    }
  });

  it("records failed validation recovery with summarized validation linkage", async () => {
    const { projectDir, rootDir } = createTempRuntimeProject();
    writeProjectFile(
      projectDir,
      "package.json",
      JSON.stringify(
        {
          scripts: {
            test: 'node -e "process.exit(1)"'
          }
        },
        null,
        2
      )
    );
    writeProjectFile(
      projectDir,
      ".sprite/config.json",
      JSON.stringify(
        {
          validation: {
            commands: [
              {
                args: ["run", "test"],
                command: "npm",
                name: "test"
              }
            ]
          }
        },
        null,
        2
      )
    );
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: join(rootDir, "home")
    });
    const submitted = runtime.submitInteractiveTask("fail validation");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const validation = await runtime.runConfiguredValidationCommands();

    expect(validation).toMatchObject({
      ok: true,
      value: {
        results: [
          {
            errorCode: "TOOL_COMMAND_FAILED",
            name: "test",
            status: "failed"
          }
        ],
        status: "failed"
      }
    });
    const validationEvent = runtime
      .getEventHistory(submitted.value.taskId)
      .find((event) => event.type === "validation.completed");

    expect(validationEvent).toMatchObject({
      payload: {
        errorCode: "TOOL_COMMAND_FAILED",
        message: "Validation command failed.",
        status: "failed"
      }
    });
    expect(validationEvent?.payload).toMatchObject({
      outputReference: {
        fullOutputStored: false
      }
    });

    const failedResult = validation.value.results[0];
    const recovery = runtime.recordRecoveryAction({
      decision: "retry_with_fix",
      errorCode: failedResult?.errorCode,
      message: failedResult?.message,
      nextAction:
        "Inspect the failing validation output summary, fix the cause, and rerun validation.",
      sourceEventId: validationEvent?.eventId,
      summary: "Recovery recorded after configured validation failed.",
      toolCallId: failedResult?.toolCallId,
      trigger: "validation_failed",
      validationId: failedResult?.validationId
    });

    expect(recovery).toMatchObject({
      ok: true,
      value: {
        payload: {
          decision: "retry_with_fix",
          errorCode: "TOOL_COMMAND_FAILED",
          sourceEventId: validationEvent?.eventId,
          status: "recorded",
          trigger: "validation_failed"
        },
        type: "task.recovery.recorded"
      }
    });

    const activeTask = runtime.getActiveTask();
    expect(activeTask.ok).toBe(true);
    if (activeTask.ok) {
      const summary = createFinalTaskSummary(activeTask.value);

      expect(summary.importantEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            decision: "retry_with_fix",
            nextAction: expect.stringContaining("rerun validation"),
            trigger: "validation_failed",
            type: "task.recovery.recorded"
          })
        ])
      );
      expect(summary.unresolvedRisks).toContain(
        "At least one configured validation command failed."
      );
    }
  });

  it("does not trust caller-provided configuredValidation on public run_command input", async () => {
    const { projectDir, rootDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: join(rootDir, "home")
    });
    const submitted = runtime.submitInteractiveTask(
      "reject spoofed validation metadata"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const spoofedValidationCommand = {
      input: {
        args: ["run", "build"],
        command: "npm",
        configuredValidation: true,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    } as unknown as RuntimeToolCallRequest;

    const result = await runtime.executeToolCall(spoofedValidationCommand);

    expect(result).toMatchObject({
      error: { code: "COMMAND_REQUIRES_APPROVAL" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "approval.requested",
      "task.waiting"
    ]);
    expect(
      history.find((event) => event.type === "policy.decision.recorded")
    ).toMatchObject({
      payload: {
        action: "require_approval",
        command: "npm run build",
        requestType: "command",
        ruleId: "command.package.script"
      }
    });
    expect(
      history.find((event) => event.type === "approval.requested")
    ).toMatchObject({
      payload: {
        command: "npm run build",
        requestType: "command",
        ruleId: "command.package.script"
      }
    });
    expect(history.some((event) => event.type.startsWith("tool.call."))).toBe(
      false
    );
  });

  it("does not execute denied run_command requests and requests approval for risky commands", async () => {
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
    expect(runtime.getPendingApprovals()).toHaveLength(1);

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "policy.decision.recorded",
      "approval.requested",
      "task.waiting"
    ]);
    expect(history[4]).toMatchObject({
      correlationId: submitted.value.correlationId,
      payload: {
        allowedActions: ["allow", "deny", "edit"],
        approvalRequestId: expect.stringMatching(/^appr_/),
        command: "node",
        requestType: "command",
        riskLevel: "medium",
        ruleId: "command.unknown",
        status: "pending",
        timeoutMs: 30_000
      },
      type: "approval.requested"
    });
    const activeTask = runtime.getActiveTask();
    expect(activeTask.ok).toBe(true);
    if (activeTask.ok) {
      expect(activeTask.value.events.map((event) => event.type)).toEqual(
        history.map((event) => event.type)
      );
      expect(activeTask.value.waitingState).toMatchObject({
        reason: "approval-required"
      });
    }
    expect(history.some((event) => event.type.startsWith("tool.call."))).toBe(
      false
    );
  });

  it("records a safer-alternative recovery path after policy denies a command", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("recover from denied rm");

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

    expect(denied).toMatchObject({
      error: { code: "COMMAND_DENIED_BY_POLICY" },
      ok: false
    });

    const policyEvent = runtime
      .getEventHistory(submitted.value.taskId)
      .find((event) => event.type === "policy.decision.recorded");

    expect(policyEvent).toMatchObject({
      payload: {
        action: "deny",
        ruleId: "command.privilege"
      }
    });

    const recovery = runtime.recordRecoveryAction({
      decision: "choose_safer_alternative",
      errorCode: "COMMAND_DENIED_BY_POLICY",
      nextAction:
        "Use a project-bounded inspection command instead of a destructive sudo command.",
      ruleId:
        policyEvent?.type === "policy.decision.recorded"
          ? policyEvent.payload.ruleId
          : undefined,
      sourceEventId: policyEvent?.eventId,
      summary: "Recovery recorded after policy denied a destructive command.",
      trigger: "policy_denied"
    });

    expect(recovery).toMatchObject({
      ok: true,
      value: {
        payload: {
          decision: "choose_safer_alternative",
          errorCode: "COMMAND_DENIED_BY_POLICY",
          ruleId: "command.privilege",
          sourceEventId: policyEvent?.eventId,
          status: "recorded",
          trigger: "policy_denied"
        },
        type: "task.recovery.recorded"
      }
    });
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .some((event) => event.type.startsWith("tool.call."))
    ).toBe(false);
    expect(runtime.getActiveTask()).toMatchObject({
      ok: true,
      value: {
        waitingState: {
          reason: "steering-required"
        }
      }
    });
  });

  it("allows, denies, times out, and edits pending command approvals", async () => {
    const { projectDir } = createTempRuntimeProject();
    const allowRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const allowSubmitted = allowRuntime.submitInteractiveTask(
      "approve node version command"
    );

    expect(allowSubmitted.ok).toBe(true);
    if (!allowSubmitted.ok) {
      return;
    }

    const pending = await allowRuntime.executeToolCall({
      input: {
        args: ["--version"],
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    expect(pending.ok).toBe(false);
    const approval = allowRuntime.getPendingApprovals()[0];
    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const approved = await allowRuntime.respondToApproval({
      action: "allow",
      approvalRequestId: approval.approvalRequestId
    });

    expect(approved).toMatchObject({
      ok: true,
      value: {
        status: "completed",
        toolName: "run_command"
      }
    });
    expect(
      allowRuntime
        .getEventHistory(allowSubmitted.value.taskId)
        .map((event) => event.type)
    ).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "approval.requested",
      "task.waiting",
      "approval.resolved",
      "tool.call.requested",
      "tool.call.started",
      "tool.call.completed"
    ]);

    const denyRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const denySubmitted = denyRuntime.submitInteractiveTask("deny command");

    expect(denySubmitted.ok).toBe(true);
    if (!denySubmitted.ok) {
      return;
    }

    await denyRuntime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const deniedApproval = denyRuntime.getPendingApprovals()[0];

    expect(deniedApproval).toBeDefined();
    if (deniedApproval === undefined) {
      return;
    }

    const denied = await denyRuntime.respondToApproval({
      action: "deny",
      approvalRequestId: deniedApproval.approvalRequestId,
      reason: "Do not run this command."
    });

    expect(denied).toMatchObject({
      error: { code: "APPROVAL_DENIED" },
      ok: false
    });
    expect(denyRuntime.getActiveTask()).toMatchObject({
      ok: true,
      value: {
        waitingState: null
      }
    });
    expect(
      denyRuntime
        .getEventHistory(denySubmitted.value.taskId)
        .map((event) => event.type)
        .includes("approval.resolved")
    ).toBe(true);
    expect(
      denyRuntime
        .getEventHistory(denySubmitted.value.taskId)
        .some((event) => event.type.startsWith("tool.call."))
    ).toBe(false);

    const timeoutRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    timeoutRuntime.submitInteractiveTask("timeout command approval");
    await timeoutRuntime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const timedOutApproval = timeoutRuntime.getPendingApprovals()[0];

    expect(timedOutApproval).toBeDefined();
    if (timedOutApproval === undefined) {
      return;
    }

    const timedOut = await timeoutRuntime.respondToApproval({
      action: "timeout",
      approvalRequestId: timedOutApproval.approvalRequestId
    });

    expect(timedOut).toMatchObject({
      error: { code: "APPROVAL_TIMED_OUT" },
      ok: false
    });

    const editRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const editSubmitted = editRuntime.submitInteractiveTask("edit command");

    expect(editSubmitted.ok).toBe(true);
    if (!editSubmitted.ok) {
      return;
    }

    await editRuntime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const editedApproval = editRuntime.getPendingApprovals()[0];

    expect(editedApproval).toBeDefined();
    if (editedApproval === undefined) {
      return;
    }

    const edited = await editRuntime.respondToApproval({
      action: "edit",
      approvalRequestId: editedApproval.approvalRequestId,
      modifiedRequest: {
        command: "pwd",
        cwd: projectDir,
        timeoutMs: 30_000,
        type: "command"
      }
    });

    expect(edited).toMatchObject({
      ok: true,
      value: {
        command: "pwd",
        status: "completed",
        toolName: "run_command"
      }
    });
    expect(
      editRuntime
        .getEventHistory(editSubmitted.value.taskId)
        .filter((event) => event.type === "policy.decision.recorded")
    ).toHaveLength(2);
  });

  it("records ask-user recovery after an approval denial clears pending approval", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "recover from denied approval"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const denied = await runtime.respondToApproval({
      action: "deny",
      approvalRequestId: approval.approvalRequestId,
      reason: "Use a safer command first."
    });

    expect(denied).toMatchObject({
      error: { code: "APPROVAL_DENIED" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toEqual([]);

    const resolvedEvent = runtime
      .getEventHistory(submitted.value.taskId)
      .find((event) => event.type === "approval.resolved");
    const recovery = runtime.recordRecoveryAction({
      decision: "ask_user",
      errorCode: "APPROVAL_DENIED",
      nextAction:
        "Ask the user whether to run a safer read-only command instead.",
      sourceEventId: resolvedEvent?.eventId,
      summary: "Recovery recorded after approval was denied.",
      toolCallId: approval.toolCallId,
      trigger: "approval_denied"
    });

    expect(recovery).toMatchObject({
      ok: true,
      value: {
        payload: {
          decision: "ask_user",
          errorCode: "APPROVAL_DENIED",
          sourceEventId: resolvedEvent?.eventId,
          status: "recorded",
          toolCallId: approval.toolCallId,
          trigger: "approval_denied"
        }
      }
    });
    expect(runtime.getActiveTask()).toMatchObject({
      ok: true,
      value: {
        status: "waiting-for-input",
        waitingState: {
          reason: "user-input-required",
          message:
            "Ask the user whether to run a safer read-only command instead."
        }
      }
    });
    expect(
      runtime.getEventHistory(submitted.value.taskId).map((event) => event.type)
    ).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "approval.requested",
      "task.waiting",
      "approval.resolved",
      "task.recovery.recorded",
      "task.waiting"
    ]);
  });

  it("rejects approval edit responses with both modified payload shapes", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "reject ambiguous approval edit"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const rejected = await runtime.respondToApproval({
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      modifiedRequest: {
        command: "pwd",
        cwd: projectDir,
        timeoutMs: 30_000,
        type: "command"
      },
      modifiedToolCall: {
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
      }
    } as unknown as RuntimeApprovalResponse);

    expect(rejected).toMatchObject({
      error: { code: "APPROVAL_EDIT_PAYLOAD_INVALID" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .some((event) => event.type === "approval.resolved")
    ).toBe(false);
  });

  it("rejects approval edit responses without a modified payload", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask(
      "reject empty approval edit"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const rejected = await runtime.respondToApproval({
      action: "edit",
      approvalRequestId: approval.approvalRequestId
    } as unknown as RuntimeApprovalResponse);

    expect(rejected).toMatchObject({
      error: { code: "APPROVAL_EDIT_PAYLOAD_INVALID" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .some((event) => event.type === "approval.resolved")
    ).toBe(false);
  });

  it("rejects unoffered approval actions without consuming the pending approval", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("reject unoffered action");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const rejected = await runtime.respondToApproval({
      action: "alwaysAllowForSession",
      approvalRequestId: approval.approvalRequestId
    });

    expect(rejected).toMatchObject({
      error: { code: "APPROVAL_ACTION_NOT_ALLOWED" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .some((event) => event.type === "approval.resolved")
    ).toBe(false);
  });

  it("blocks tool execution while an approval is pending and clears stale approvals", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("block while pending");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    const blocked = await runtime.executeToolCall({
      input: { path: "package.json" },
      toolName: "read_file"
    });

    expect(blocked).toMatchObject({
      error: { code: "APPROVAL_PENDING" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);

    const cancelled = runtime.cancelActiveTask();
    expect(cancelled.ok).toBe(true);
    expect(runtime.getPendingApprovals()).toHaveLength(0);

    const runtimeWithReplacement = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    runtimeWithReplacement.submitInteractiveTask("create stale approval");
    await runtimeWithReplacement.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });
    expect(runtimeWithReplacement.getPendingApprovals()).toHaveLength(1);

    runtimeWithReplacement.submitInteractiveTask("replace active task");
    expect(runtimeWithReplacement.getPendingApprovals()).toHaveLength(0);
  });

  it("isolates approval event mutations from subscribers and history readers", async () => {
    const { projectDir } = createTempRuntimeProject();
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    let observedStatus: unknown;

    runtime.subscribeToEvents((event) => {
      if (event.type === "approval.requested") {
        event.payload.status = "mutated-by-subscriber";
      }
    });
    runtime.subscribeToEvents((event) => {
      if (event.type === "approval.requested") {
        observedStatus = event.payload.status;
      }
    });

    const submitted = runtime.submitInteractiveTask(
      "approval events are cloned"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        command: process.execPath,
        timeoutMs: 30_000
      },
      toolName: "run_command"
    });

    const approvalEvent = runtime
      .getEventHistory(submitted.value.taskId)
      .find((event) => event.type === "approval.requested");

    expect(observedStatus).toBe("pending");
    expect(approvalEvent?.payload.status).toBe("pending");

    if (approvalEvent !== undefined) {
      approvalEvent.payload.status = "mutated-by-history-reader";
    }

    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .find((event) => event.type === "approval.requested")?.payload.status
    ).toBe("pending");
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

    const failedEvent = history[5];
    const recovery = runtime.recordRecoveryAction({
      decision: "choose_safer_alternative",
      errorCode: "TOOL_COMMAND_FAILED",
      nextAction:
        "Use a repository inspection command that does not depend on git metadata.",
      sourceEventId: failedEvent?.eventId,
      summary: "Recovery recorded after command execution failed.",
      toolCallId:
        failedEvent?.type === "tool.call.failed"
          ? failedEvent.payload.toolCallId
          : undefined,
      trigger: "command_failed"
    });

    expect(recovery).toMatchObject({
      ok: true,
      value: {
        payload: {
          decision: "choose_safer_alternative",
          errorCode: "TOOL_COMMAND_FAILED",
          sourceEventId: failedEvent?.eventId,
          status: "recorded",
          trigger: "command_failed"
        },
        type: "task.recovery.recorded"
      }
    });
  });

  it("records file edit policy before safe apply_patch execution", async () => {
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
      "policy.decision.recorded",
      "tool.call.requested",
      "tool.call.started",
      "file.edit.requested",
      "tool.call.completed",
      "file.edit.applied",
      "file.activity.recorded"
    ]);
  });

  it("requires approval before applying broad or risky apply_patch edits", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "package.json", '{"name":"old"}\n');
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("approve package patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const pending = await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "package.json",
            oldText: '"old"',
            newText: '"new"'
          }
        ]
      },
      toolName: "apply_patch"
    });

    expect(pending).toMatchObject({
      error: { code: "FILE_EDIT_REQUIRES_APPROVAL" },
      ok: false
    });
    expect(readFileSync(join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"old"}\n'
    );

    const approval = runtime.getPendingApprovals()[0];
    expect(approval).toMatchObject({
      affectedFiles: ["package.json"],
      approvalRequestId: expect.stringMatching(/^appr_/),
      cwd: projectDir,
      envExposure: "none",
      requestType: "file_edit",
      riskLevel: "high",
      ruleId: "file_edit.package_config",
      timeoutMs: 30_000
    });

    const approved = await runtime.respondToApproval({
      action: "allow",
      approvalRequestId: approval?.approvalRequestId ?? ""
    });

    expect(approved).toMatchObject({
      ok: true,
      value: {
        affectedFiles: ["package.json"],
        status: "completed",
        toolName: "apply_patch"
      }
    });
    expect(readFileSync(join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"new"}\n'
    );

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(history.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "policy.decision.recorded",
      "approval.requested",
      "task.waiting",
      "approval.resolved",
      "tool.call.requested",
      "tool.call.started",
      "file.edit.requested",
      "tool.call.completed",
      "file.edit.applied",
      "file.activity.recorded"
    ]);
  });

  it("edits pending apply_patch approvals by reclassifying modified tool calls", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "package.json", '{"name":"old"}\n');
    writeProjectFile(projectDir, "src/edit.ts", "export const value = 1;\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("edit risky patch request");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "package.json",
            oldText: '"old"',
            newText: '"new"'
          }
        ]
      },
      toolName: "apply_patch"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const edited = await runtime.respondToApproval({
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      modifiedToolCall: {
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
      },
      reason: "Apply the safer source edit instead."
    });

    expect(edited).toMatchObject({
      ok: true,
      value: {
        affectedFiles: ["src/edit.ts"],
        toolName: "apply_patch"
      }
    });
    expect(readFileSync(join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"old"}\n'
    );
    expect(readFileSync(join(projectDir, "src/edit.ts"), "utf8")).toBe(
      "export const value = 2;\n"
    );

    const history = runtime.getEventHistory(submitted.value.taskId);
    expect(
      history.filter((event) => event.type === "policy.decision.recorded")
    ).toHaveLength(2);
    expect(
      history.find((event) => event.type === "approval.resolved")?.payload
    ).toMatchObject({
      decision: "edit",
      status: "resolved"
    });
  });

  it("rejects approval edits that switch request type", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, "package.json", '{"name":"old"}\n');
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("reject mismatched edit");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "package.json",
            oldText: '"old"',
            newText: '"new"'
          }
        ]
      },
      toolName: "apply_patch"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const rejected = await runtime.respondToApproval({
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      modifiedRequest: {
        command: "pwd",
        cwd: projectDir,
        timeoutMs: 30_000,
        type: "command"
      }
    });

    expect(rejected).toMatchObject({
      error: { code: "APPROVAL_TYPE_MISMATCH" },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
    expect(readFileSync(join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"old"}\n'
    );
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .some((event) => event.type === "approval.resolved")
    ).toBe(false);
  });

  it("does not apply denied risky apply_patch edits", async () => {
    const { projectDir } = createTempRuntimeProject();
    writeProjectFile(projectDir, ".env.local", "SECRET=old\n");
    const runtime = new AgentRuntime({
      cwd: projectDir,
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("deny secret patch");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const denied = await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: ".env.local",
            oldText: "old",
            newText: "new"
          }
        ]
      },
      toolName: "apply_patch"
    });

    expect(denied).toMatchObject({
      error: { code: "FILE_EDIT_DENIED_BY_POLICY" },
      ok: false
    });
    expect(readFileSync(join(projectDir, ".env.local"), "utf8")).toBe(
      "SECRET=old\n"
    );
    expect(
      runtime.getEventHistory(submitted.value.taskId).map((event) => event.type)
    ).toEqual(["task.started", "task.waiting", "policy.decision.recorded"]);
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
      "policy.decision.recorded",
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
