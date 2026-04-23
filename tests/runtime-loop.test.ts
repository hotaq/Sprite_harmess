import { describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";

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
    expect(result.value.request.allowedDefaults.toolExecutionEnabled).toBe(false);
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
    const result = runtime.steerActiveTask("Focus on auth state rendering before adding more CLI flags.");

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
    const result = runtime.failActiveTask("Provider call failed in a non-recoverable way.");

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
    expect(first.value.events[0]?.eventId).not.toBe(second.value.events[0]?.eventId);
  });
});
