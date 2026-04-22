import { describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";

describe("AgentRuntime interactive task flow", () => {
  it("creates a typed task request from runtime state", () => {
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
    expect(result.value.currentPhase).toBe("act");
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
    expect(result.value.currentPhase).toBe("act");
    expect(result.value.summary).toContain("planned the first loop");
  });
});
