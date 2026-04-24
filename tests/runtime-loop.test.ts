import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  createFinalTaskSummary,
  runOneShotPrintTask
} from "@sprite/core";

describe("AgentRuntime interactive task flow", () => {
  it("creates a typed task request from runtime state and moves into a waiting state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const result = runtime.submitInteractiveTask("fix the failing smoke test");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.request.task).toBe("fix the failing smoke test");
    expect(result.value.request.cwd).toBe("/tmp/sprite-project");
    expect(result.value.request.allowedDefaults.toolExecutionEnabled).toBe(
      false
    );
    expect(result.value.request.stopConditions.maxIterations).toBe(1);
    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.currentPhase).toBe("act");
    expect(result.value.waitingState?.reason).toBe("steering-required");
    expect(result.value.events.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting"
    ]);
  });

  it("returns an initial plan-act-observe execution flow before tool work", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const result = runtime.submitInteractiveTask("add a provider health check");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.steps).toHaveLength(3);
    expect(result.value.steps[0]).toMatchObject({
      phase: "plan",
      status: "completed"
    });
    expect(result.value.steps[1]).toMatchObject({
      phase: "act",
      status: "pending"
    });
    expect(result.value.steps[2]).toMatchObject({
      phase: "observe",
      status: "pending"
    });
    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.currentPhase).toBe("act");
    expect(result.value.summary).toContain("planned the first loop");
  });

  it("records steering input through AgentRuntime without leaving runtime-owned waiting state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("tighten the provider bootstrap output");
    const result = runtime.steerActiveTask(
      "Focus on auth state rendering before adding more CLI flags."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.intents).toHaveLength(1);
    expect(result.value.intents[0]).toMatchObject({
      intent: "steer",
      note: "Focus on auth state rendering before adding more CLI flags."
    });
    expect(result.value.events.at(-2)?.type).toBe("task.steering.received");
    expect(result.value.events.at(-1)?.type).toBe("task.waiting");
  });

  it("cancels an active task through AgentRuntime and records a terminal event", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("cancel the in-flight task");
    const result = runtime.cancelActiveTask();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("cancelled");
    expect(result.value.terminalState?.reason).toBe("cancelled");
    expect(result.value.intents.at(-1)?.intent).toBe("cancel");
    expect(result.value.events.at(-1)?.type).toBe("task.cancelled");
  });

  it("does not allow steering after a task has already reached a terminal state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("cancel then try to steer");
    runtime.cancelActiveTask();
    const result = runtime.steerActiveTask("Try to resume after cancellation.");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "TASK_TERMINAL"
    });
  });

  it("stops an active task at max iterations with an explicit failed event payload", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("hit the iteration ceiling");
    const result = runtime.stopActiveTaskForMaxIterations();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("max-iterations");
    expect(result.value.terminalState?.reason).toBe("max-iterations");
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.failed",
      payload: { reason: "max-iterations" }
    });
  });

  it("marks an active task as failed on an unrecoverable error", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("surface an unrecoverable runtime error");
    const result = runtime.failActiveTask(
      "Provider call failed in a non-recoverable way."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("failed");
    expect(result.value.terminalState?.reason).toBe("unrecoverable-error");
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.failed",
      payload: { reason: "unrecoverable-error" }
    });
  });

  it("can explicitly wait for approval-required input through AgentRuntime", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("pause for approval");
    const result = runtime.waitForInput(
      "approval-required",
      "Approval is required before the next runtime step can continue."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.waitingState).toMatchObject({
      reason: "approval-required"
    });
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.waiting",
      payload: { reason: "approval-required" }
    });
  });

  it("generates unique session, task, correlation, and event ids across runtime instances", () => {
    const firstRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    const secondRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const first = firstRuntime.submitInteractiveTask("first task");
    const second = secondRuntime.submitInteractiveTask("second task");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.sessionId).not.toBe(second.value.sessionId);
    expect(first.value.taskId).not.toBe(second.value.taskId);
    expect(first.value.correlationId).not.toBe(second.value.correlationId);
    expect(first.value.events[0]?.eventId).not.toBe(
      second.value.events[0]?.eventId
    );
  });

  it("generates a runtime-owned final summary for a max-iterations boundary", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("summarize a stopped task");
    const stopped = runtime.stopActiveTaskForMaxIterations(
      "Stopped before provider-driven tool execution was connected."
    );

    expect(stopped.ok).toBe(true);
    if (!stopped.ok) {
      return;
    }

    const summary = createFinalTaskSummary(stopped.value);

    expect(summary).toMatchObject({
      status: "max-iterations",
      result: "Stopped before provider-driven tool execution was connected.",
      provider: null,
      model: null,
      sessionId: stopped.value.sessionId,
      taskId: stopped.value.taskId,
      correlationId: stopped.value.correlationId
    });
    expect(summary.importantEvents.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "task.failed"
    ]);
    expect(summary.notAttempted).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Provider-driven tool execution"),
        expect.stringContaining("Validation")
      ])
    );
    expect(summary.unresolvedRisks).toEqual(
      expect.arrayContaining([expect.stringContaining("not verified")])
    );
  });

  it("summarizes cancelled, completed, failed, and approval-required runtime boundaries", () => {
    const cancelledRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    cancelledRuntime.submitInteractiveTask("cancel summary");
    const cancelled = cancelledRuntime.cancelActiveTask("No longer needed.");

    const completedRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    completedRuntime.submitInteractiveTask("completed summary");
    const completed = completedRuntime.completeActiveTask(
      "Task reached a minimal completed state."
    );

    const failedRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    failedRuntime.submitInteractiveTask("failed summary");
    const failed = failedRuntime.failActiveTask("Provider failed permanently.");

    const approvalRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    approvalRuntime.submitInteractiveTask("approval summary");
    const approvalRequired = approvalRuntime.waitForInput(
      "approval-required",
      "Approval is required before continuing."
    );

    expect(cancelled.ok).toBe(true);
    expect(completed.ok).toBe(true);
    expect(failed.ok).toBe(true);
    expect(approvalRequired.ok).toBe(true);
    if (!cancelled.ok || !completed.ok || !failed.ok || !approvalRequired.ok) {
      return;
    }

    expect(createFinalTaskSummary(cancelled.value)).toMatchObject({
      status: "cancelled",
      result: "Task cancelled before provider-driven tool execution began.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({ type: "task.cancelled" })
      ])
    });
    expect(createFinalTaskSummary(completed.value)).toMatchObject({
      status: "completed",
      result: "Task reached a minimal completed state.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({ type: "task.completed" })
      ])
    });
    expect(createFinalTaskSummary(failed.value)).toMatchObject({
      status: "failed",
      result: "Provider failed permanently.",
      unresolvedRisks: expect.arrayContaining([
        expect.stringContaining("failed")
      ])
    });
    expect(createFinalTaskSummary(approvalRequired.value)).toMatchObject({
      status: "waiting-for-input",
      result: "Approval is required before continuing.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({
          type: "task.waiting",
          reason: "approval-required"
        })
      ]),
      unresolvedRisks: expect.arrayContaining([
        expect.stringContaining("approval")
      ])
    });
  });

  it("exposes the runtime final summary through one-shot print results", () => {
    const result = runOneShotPrintTask("summarize one-shot output", {
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home",
      outputFormat: "json"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.finalSummary).toMatchObject({
      status: "max-iterations",
      result: expect.stringContaining("One-shot print mode stopped"),
      taskId: result.value.taskId,
      correlationId: result.value.correlationId
    });
  });

  it("includes grouped file activity in final summaries", async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("summarize file activity");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const readResult = await runtime.executeToolCall({
      input: { path: "package.json" },
      toolName: "read_file"
    });
    const proposed = runtime.recordFileActivity({
      kind: "proposed_change",
      paths: ["README.md"]
    });
    const changed = runtime.recordFileActivity({
      kind: "changed",
      paths: ["README.md"]
    });

    expect(readResult.ok).toBe(true);
    expect(proposed.ok).toBe(true);
    expect(changed.ok).toBe(true);

    const activeTask = runtime.getActiveTask();

    expect(activeTask.ok).toBe(true);
    if (!activeTask.ok) {
      return;
    }

    const summary = createFinalTaskSummary(activeTask.value);

    expect(summary.filesRead).toEqual(["package.json"]);
    expect(summary.filesProposedForChange).toEqual(["README.md"]);
    expect(summary.filesChanged).toEqual(["README.md"]);
  });

  it("includes apply_patch changed files in final summaries", async () => {
    const runtime = new AgentRuntime({
      cwd: process.cwd(),
      homeDir: "/tmp/sprite-home"
    });
    const submitted = runtime.submitInteractiveTask("summarize patch activity");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const proposed = runtime.recordFileActivity({
      kind: "proposed_change",
      paths: ["README.md"]
    });
    const changed = runtime.recordFileActivity({
      kind: "changed",
      paths: ["README.md"]
    });

    expect(proposed.ok).toBe(true);
    expect(changed.ok).toBe(true);

    const activeTask = runtime.getActiveTask();

    expect(activeTask.ok).toBe(true);
    if (!activeTask.ok) {
      return;
    }

    const summary = createFinalTaskSummary(activeTask.value);

    expect(summary.filesProposedForChange).toEqual(["README.md"]);
    expect(summary.filesChanged).toEqual(["README.md"]);
  });
});
