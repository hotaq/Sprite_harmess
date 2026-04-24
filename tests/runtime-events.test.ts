import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  createRuntimeEventRecord,
  validateRuntimeEvent
} from "@sprite/core";

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
    } as never);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME_EVENT"
    });
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
});
