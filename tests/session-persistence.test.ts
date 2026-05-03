import { describe, expect, it } from "vitest";
import { AgentRuntime, validateRuntimeEvent } from "@sprite/core";
import { SpriteError, err } from "@sprite/shared";
import type { SessionStore } from "@sprite/storage";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

function createTempWorkspace(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-session-runtime-"));

  return {
    homeDir: join(rootDir, "home"),
    projectDir: join(rootDir, "project"),
    rootDir
  };
}

function readNdjson(path: string): Record<string, unknown>[] {
  const content = readFileSync(path, "utf8").trim();

  return content.length === 0
    ? []
    : content
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function getRuntimeSessionStore(runtime: AgentRuntime): SessionStore {
  return (runtime as unknown as { sessionStore: SessionStore }).sessionStore;
}

type ResumeSessionResult = {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    inspection: {
      latestTask?: {
        goal: string;
        latestPlan?: Array<{ status: string; summary: string }>;
        status: string;
      };
      pendingApprovalCount: number;
    };
    restoredEventCount: number;
    resumeEventId: string;
    sessionId: string;
    status: string;
    taskId: string;
  };
};

type ResumableRuntime = AgentRuntime & {
  resumeSession?: (sessionId: string) => ResumeSessionResult;
};

function resumeSession(
  runtime: AgentRuntime,
  sessionId: string
): ResumeSessionResult {
  const resume = (runtime as ResumableRuntime).resumeSession;

  if (resume === undefined) {
    throw new Error("Expected AgentRuntime.resumeSession(sessionId) to exist.");
  }

  return resume.call(runtime, sessionId);
}

describe("AgentRuntime session persistence", () => {
  it("creates a project-local session and persists started/waiting events in order", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = runtime.submitInteractiveTask("persist this task");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.sessionId).toEqual(expect.stringMatching(/^ses_/));

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        result.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting"
      ]);
      for (const event of persistedEvents) {
        expect(validateRuntimeEvent(event).ok).toBe(true);
      }

      expect(readJson(join(sessionDir, "state.json"))).toMatchObject({
        schemaVersion: 1,
        sessionId: result.value.sessionId,
        cwd: projectDir,
        eventCount: 2,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        lastEventId: result.value.events.at(-1)?.eventId,
        lastEventType: "task.waiting",
        latestTask: {
          taskId: result.value.taskId,
          correlationId: result.value.correlationId,
          status: "waiting-for-input",
          currentPhase: result.value.currentPhase,
          goal: "persist this task"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("appends initial task events as one batch before publishing subscribers", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const sessionStore = getRuntimeSessionStore(runtime);
      const appendEvents = sessionStore.appendEvents.bind(sessionStore);
      const batchSizes: number[] = [];
      const observedTypes: string[] = [];

      sessionStore.appendEvents = ((sessionId, events) => {
        batchSizes.push(events.length);
        expect(runtime.getEventHistory()).toEqual([]);

        return appendEvents(sessionId, events);
      }) satisfies SessionStore["appendEvents"];

      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const result = runtime.submitInteractiveTask("batch persist task start");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(batchSizes[0]).toBe(2);
      expect(observedTypes).toEqual(["task.started", "task.waiting"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not publish initial task events when batch append fails", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const sessionStore = getRuntimeSessionStore(runtime);
      const observedTypes: string[] = [];

      sessionStore.appendEvents = (() =>
        err(
          new SpriteError(
            "TEST_BATCH_APPEND_FAILED",
            "Batch append failed for regression coverage."
          )
        )) satisfies SessionStore["appendEvents"];

      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const result = runtime.submitInteractiveTask("fail before publish");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toMatchObject({
        code: "TEST_BATCH_APPEND_FAILED"
      });
      expect(observedTypes).toEqual([]);
      expect(runtime.getEventHistory()).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("persists state snapshot cwd as an absolute project path", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const relativeProjectDir = relative(process.cwd(), projectDir);
      const runtime = new AgentRuntime({
        cwd: relativeProjectDir,
        homeDir
      });
      const result = runtime.submitInteractiveTask("normalize cwd");

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      const state = readJson(
        join(
          projectDir,
          ".sprite",
          "sessions",
          result.value.sessionId,
          "state.json"
        )
      );

      expect(state).toMatchObject({
        cwd: resolve(relativeProjectDir),
        sessionId: result.value.sessionId
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("appends only newly emitted runtime events when task state transitions", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("stop after first loop");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      expect(readNdjson(join(sessionDir, "events.ndjson"))).toHaveLength(2);

      const stopped = runtime.stopActiveTaskForMaxIterations(
        "Stop for persistence test."
      );

      expect(stopped.ok).toBe(true);
      if (!stopped.ok) {
        return;
      }

      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "task.failed"
      ]);
      expect(readJson(join(sessionDir, "state.json"))).toMatchObject({
        eventCount: 3,
        lastError: expect.stringContaining("max-iterations"),
        lastEventId: stopped.value.events.at(-1)?.eventId,
        lastEventType: "task.failed",
        latestTask: {
          taskId: stopped.value.taskId,
          status: "max-iterations",
          currentPhase: stopped.value.currentPhase,
          goal: "stop after first loop"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("keeps snapshot eventCount aligned with the session-wide event log", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const first = runtime.submitInteractiveTask("first task in session");
      const second = runtime.submitInteractiveTask("second task in session");

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }

      expect(second.value.sessionId).toBe(first.value.sessionId);

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        first.value.sessionId
      );
      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));
      const state = readJson(join(sessionDir, "state.json"));

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "task.started",
        "task.waiting"
      ]);
      expect(state).toMatchObject({
        eventCount: persistedEvents.length,
        lastEventId: second.value.events.at(-1)?.eventId,
        lastEventType: "task.waiting",
        latestTask: {
          taskId: second.value.taskId,
          goal: "second task in session"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not publish runtime events when disk persistence fails", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("guard disk ordering");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const eventsPath = join(sessionDir, "events.ndjson");
      rmSync(eventsPath, { force: true });
      mkdirSync(eventsPath);

      const observedTypes: string[] = [];
      runtime.subscribeToEvents((event) => {
        observedTypes.push(event.type);
      });

      const steered = runtime.steerActiveTask(
        "this should not reach subscribers"
      );

      expect(steered.ok).toBe(false);
      if (steered.ok) {
        return;
      }

      expect(steered.error).toMatchObject({
        code: "SESSION_EVENT_APPEND_FAILED"
      });
      expect(observedTypes).toEqual([]);
      expect(
        runtime
          .getEventHistory(submitted.value.taskId)
          .map((event) => event.type)
      ).toEqual(["task.started", "task.waiting"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("refreshes bounded snapshot metadata after safe file activity", async () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "package.json"), "{}\n");

      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("summarize files");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const readResult = await runtime.executeToolCall({
        input: { path: "package.json" },
        toolName: "read_file"
      });

      expect(readResult.ok).toBe(true);
      if (!readResult.ok) {
        return;
      }

      const state = readJson(
        join(
          projectDir,
          ".sprite",
          "sessions",
          submitted.value.sessionId,
          "state.json"
        )
      );

      expect(state).toMatchObject({
        eventCount: 6,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: ["package.json"],
        lastEventType: "file.activity.recorded",
        pendingApprovalCount: 0
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("resumes a persisted session conservatively and records a resume event", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume this persisted task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionDir = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId
      );
      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }

      const persistedEvents = readNdjson(join(sessionDir, "events.ndjson"));
      const state = readJson(join(sessionDir, "state.json"));
      const resumeEvent = persistedEvents.at(-1);

      expect(persistedEvents.map((event) => event.type)).toEqual([
        "task.started",
        "task.waiting",
        "session.resumed"
      ]);
      expect(validateRuntimeEvent(resumeEvent).ok).toBe(true);
      expect(resumeEvent).toMatchObject({
        eventId: resumed.value?.resumeEventId,
        payload: {
          restoredEventCount: 2,
          restoredTaskStatus: "waiting-for-input",
          status: "recorded"
        },
        sessionId: submitted.value.sessionId,
        taskId: submitted.value.taskId,
        type: "session.resumed"
      });
      expect(state).toMatchObject({
        eventCount: persistedEvents.length,
        lastEventId: resumed.value?.resumeEventId,
        lastEventType: "session.resumed",
        latestTask: {
          goal: "resume this persisted task",
          status: "waiting-for-input",
          taskId: submitted.value.taskId
        }
      });
      expect(resumed.value).toMatchObject({
        restoredEventCount: 2,
        sessionId: submitted.value.sessionId,
        status: "waiting-for-input",
        taskId: submitted.value.taskId
      });
      expect(resumed.value?.inspection.pendingApprovalCount).toBe(0);
      expect(
        resumedRuntime
          .getEventHistory(submitted.value.taskId)
          .map((event) => event.type)
      ).toEqual(["task.started", "task.waiting", "session.resumed"]);

      const activeTask = resumedRuntime.getActiveTask();
      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }
      expect(
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "session-state"
        )
      ).toMatchObject({
        metadata: expect.objectContaining({
          restoredEventCount: 2,
          resumed: true,
          sessionId: submitted.value.sessionId,
          taskId: submitted.value.taskId
        }),
        status: "included"
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("clears restored pending approval counts when a resumed task becomes terminal", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume task with stale approval"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const statePath = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId,
        "state.json"
      );
      const stateBeforeResume = readJson(statePath);

      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            ...stateBeforeResume,
            pendingApprovalCount: 1
          },
          null,
          2
        )}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const resumed = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) {
        return;
      }
      expect(resumed.value?.inspection.pendingApprovalCount).toBe(1);

      const cancelled = resumedRuntime.cancelActiveTask(
        "Stop resumed task after clearing stale approvals."
      );

      expect(cancelled.ok).toBe(true);
      const stateAfterCancel = readJson(statePath);

      expect(stateAfterCancel).toMatchObject({
        latestTask: {
          status: "cancelled"
        },
        pendingApprovalCount: 0
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns a structured error when resuming a missing session", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const runtime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = resumeSession(runtime, "ses_missing");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "SESSION_NOT_FOUND"
        });
      }
      expect(
        existsSync(join(projectDir, ".sprite", "sessions", "ses_missing"))
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns a structured error when resumed event history violates runtime contracts", () => {
    const { homeDir, projectDir, rootDir } = createTempWorkspace();

    try {
      const originalRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = originalRuntime.submitInteractiveTask(
        "resume invalid event"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const eventsPath = join(
        projectDir,
        ".sprite",
        "sessions",
        submitted.value.sessionId,
        "events.ndjson"
      );
      const events = readNdjson(eventsPath);
      writeFileSync(
        eventsPath,
        `${events
          .map((event, index) =>
            JSON.stringify(
              index === 0 ? { ...event, type: "task.started.raw" } : event
            )
          )
          .join("\n")}\n`
      );

      const resumedRuntime = new AgentRuntime({ cwd: projectDir, homeDir });
      const result = resumeSession(resumedRuntime, submitted.value.sessionId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "SESSION_EVENT_RUNTIME_INVALID"
        });
      }
      expect(readNdjson(eventsPath).map((event) => event.type)).toEqual([
        "task.started.raw",
        "task.waiting"
      ]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
