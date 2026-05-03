import { describe, expect, it } from "vitest";
import * as storage from "@sprite/storage";
import {
  createLocalSessionStore,
  createSessionId,
  readSessionArtifacts,
  resolveSessionArtifactPaths,
  type SessionEventRecord,
  type SessionStateSnapshot
} from "@sprite/storage";
import { SpriteError, err } from "@sprite/shared";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

type ReadSessionForResume = (
  cwd: string,
  sessionId: string
) => {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    events: SessionEventRecord[];
    paths: { eventsPath: string; rootDir: string; statePath: string };
    persistedEventCount: number;
    state: SessionStateSnapshot;
  };
};

function getReadSessionForResume(): ReadSessionForResume {
  const readSessionForResume = (
    storage as typeof storage & {
      readSessionForResume?: ReadSessionForResume;
    }
  ).readSessionForResume;

  if (readSessionForResume === undefined) {
    throw new Error("Expected @sprite/storage to export readSessionForResume.");
  }

  return readSessionForResume;
}

function createTempProject(): string {
  return mkdtempSync(join(tmpdir(), "sprite-session-store-"));
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

function createSessionEvent(
  sessionId: string,
  index: number,
  overrides: Partial<SessionEventRecord> = {}
): SessionEventRecord {
  return {
    schemaVersion: 1,
    eventId: `evt_${String(index).padStart(3, "0")}`,
    sessionId,
    taskId: "task_test",
    correlationId: "corr_test",
    type: "task.waiting",
    createdAt: `2026-04-26T12:00:${String(index).padStart(2, "0")}.000Z`,
    payload: { reason: "steering-required", message: `waiting ${index}` },
    ...overrides
  };
}

describe("local session store", () => {
  it("creates project-local session artifacts with an initial recoverable snapshot", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const result = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.rootDir).toBe(
        join(projectDir, ".sprite", "sessions", sessionId)
      );
      expect(existsSync(result.value.eventsPath)).toBe(true);
      expect(existsSync(result.value.statePath)).toBe(true);
      expect(readNdjson(result.value.eventsPath)).toEqual([]);
      expect(readJson(result.value.statePath)).toMatchObject({
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:00.000Z",
        eventCount: 0
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe session ids before constructing artifact paths", () => {
    const projectDir = createTempProject();

    try {
      const result = resolveSessionArtifactPaths(projectDir, "ses_../escape");

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toMatchObject({ code: "SESSION_ID_INVALID" });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("normalizes snapshot cwd to the absolute project path", () => {
    const projectDir = createTempProject();

    try {
      const relativeProjectDir = relative(process.cwd(), projectDir);
      const normalizedProjectDir = resolve(relativeProjectDir);
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        relativeProjectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      expect(readJson(ensured.value.statePath)).toMatchObject({
        cwd: normalizedProjectDir
      });

      const snapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: relativeProjectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:01.000Z",
        eventCount: 0,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        pendingApprovalCount: 0
      } satisfies SessionStateSnapshot;

      expect(store.writeStateSnapshot(snapshot).ok).toBe(true);
      expect(readJson(ensured.value.statePath)).toMatchObject({
        cwd: normalizedProjectDir
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("does not cache an initialized session when initial snapshot creation fails", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const writeStateSnapshot = store.writeStateSnapshot.bind(store);
      let writeAttempts = 0;

      store.writeStateSnapshot = ((snapshot: SessionStateSnapshot) => {
        writeAttempts += 1;

        if (writeAttempts === 1) {
          return err(
            new SpriteError(
              "TEST_INITIAL_SNAPSHOT_FAILED",
              "Initial snapshot write failed for regression coverage."
            )
          );
        }

        return writeStateSnapshot(snapshot);
      }) satisfies typeof store.writeStateSnapshot;

      const failed = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(failed.ok).toBe(false);
      if (failed.ok) {
        return;
      }

      expect(failed.error).toMatchObject({
        code: "TEST_INITIAL_SNAPSHOT_FAILED"
      });

      const recovered = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:01.000Z"
      );

      expect(recovered.ok).toBe(true);
      if (!recovered.ok) {
        return;
      }

      expect(readJson(recovered.value.statePath)).toMatchObject({
        eventCount: 0,
        sessionId
      });
      expect(writeAttempts).toBe(2);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("appends events as ordered ndjson and replaces snapshots without rewriting events", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const firstEvent = {
        schemaVersion: 1,
        eventId: "evt_first",
        sessionId,
        taskId: "task_test",
        correlationId: "corr_test",
        type: "task.started",
        createdAt: "2026-04-26T12:00:01.000Z",
        payload: { status: "planned" }
      } satisfies SessionEventRecord;
      const secondEvent = {
        ...firstEvent,
        eventId: "evt_second",
        type: "task.waiting",
        createdAt: "2026-04-26T12:00:02.000Z",
        payload: { reason: "steering-required" }
      } satisfies SessionEventRecord;

      expect(store.appendEvents(sessionId, [firstEvent, secondEvent]).ok).toBe(
        true
      );
      const snapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:02.000Z",
        eventCount: 2,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        lastEventId: "evt_second",
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "waiting-for-input",
          currentPhase: "act",
          goal: "persist session"
        },
        pendingApprovalCount: 0
      } satisfies SessionStateSnapshot;

      expect(store.writeStateSnapshot(snapshot).ok).toBe(true);

      expect(
        readNdjson(ensured.value.eventsPath).map((event) => event.eventId)
      ).toEqual(["evt_first", "evt_second"]);
      expect(readJson(ensured.value.statePath)).toMatchObject({
        eventCount: 2,
        lastEventId: "evt_second"
      });

      unlinkSync(ensured.value.statePath);
      expect(readNdjson(ensured.value.eventsPath)).toHaveLength(2);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported latest task snapshot status and phase", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const baseSnapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:02.000Z",
        eventCount: 1,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "planned",
          currentPhase: "plan",
          goal: "persist session"
        },
        pendingApprovalCount: 0
      } satisfies SessionStateSnapshot;
      const unsupportedStatus = {
        ...baseSnapshot,
        latestTask: {
          ...baseSnapshot.latestTask,
          status: "paused"
        }
      } as unknown as SessionStateSnapshot;
      const statusResult = store.writeStateSnapshot(unsupportedStatus);

      expect(statusResult.ok).toBe(false);
      if (statusResult.ok) {
        return;
      }

      expect(statusResult.error).toMatchObject({
        code: "SESSION_STATE_INVALID"
      });

      const unsupportedPhase = {
        ...baseSnapshot,
        latestTask: {
          ...baseSnapshot.latestTask,
          currentPhase: "review"
        }
      } as unknown as SessionStateSnapshot;
      const phaseResult = store.writeStateSnapshot(unsupportedPhase);

      expect(phaseResult.ok).toBe(false);
      if (phaseResult.ok) {
        return;
      }

      expect(phaseResult.error).toMatchObject({
        code: "SESSION_STATE_INVALID"
      });
      expect(readJson(ensured.value.statePath)).toMatchObject({
        eventCount: 0,
        sessionId
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects malformed session events before appending", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const invalidEvent = {
        schemaVersion: 1,
        eventId: "evt_invalid",
        sessionId,
        taskId: "task_test",
        correlationId: "corr_test",
        type: "task.waiting",
        createdAt: "2026-04-26T12:00:01.000Z",
        payload: ["not", "an", "object"]
      } as unknown as SessionEventRecord;
      const result = store.appendEvents(sessionId, [invalidEvent]);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toMatchObject({ code: "SESSION_EVENT_INVALID" });
      expect(readNdjson(ensured.value.eventsPath)).toEqual([]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects non-plain session event payload objects before appending", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const invalidEvent = {
        schemaVersion: 1,
        eventId: "evt_invalid_plain_object",
        sessionId,
        taskId: "task_test",
        correlationId: "corr_test",
        type: "task.waiting",
        createdAt: "2026-04-26T12:00:01.000Z",
        payload: new Date("2026-04-26T12:00:01.000Z")
      } as unknown as SessionEventRecord;
      const result = store.appendEvents(sessionId, [invalidEvent]);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toMatchObject({ code: "SESSION_EVENT_INVALID" });
      expect(readNdjson(ensured.value.eventsPath)).toEqual([]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("reads existing session artifacts without mutating state or event files", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const events = [1, 2, 3].map((index) =>
        createSessionEvent(sessionId, index)
      );
      const snapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:03.000Z",
        eventCount: events.length,
        filesChanged: ["src/changed.ts"],
        filesProposedForChange: ["src/proposed.ts"],
        filesRead: ["src/read.ts"],
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "waiting-for-input",
          currentPhase: "act",
          goal: "inspect session"
        },
        pendingApprovalCount: 1
      } satisfies SessionStateSnapshot;

      expect(store.appendEvents(sessionId, events).ok).toBe(true);
      expect(store.writeStateSnapshot(snapshot).ok).toBe(true);

      const stateBefore = readFileSync(ensured.value.statePath, "utf8");
      const eventsBefore = readFileSync(ensured.value.eventsPath, "utf8");
      const inspected = readSessionArtifacts(projectDir, sessionId, {
        recentEventLimit: 2
      });

      expect(inspected.ok).toBe(true);
      if (!inspected.ok) {
        return;
      }

      expect(inspected.value.persistedEventCount).toBe(3);
      expect(
        inspected.value.recentEvents.map((event) => event.eventId)
      ).toEqual(["evt_002", "evt_003"]);
      expect(inspected.value.state).toMatchObject({
        sessionId,
        eventCount: 3,
        filesChanged: ["src/changed.ts"],
        pendingApprovalCount: 1
      });
      expect(readFileSync(ensured.value.statePath, "utf8")).toBe(stateBefore);
      expect(readFileSync(ensured.value.eventsPath, "utf8")).toBe(eventsBefore);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns structured errors for missing, invalid, and malformed artifacts", () => {
    const projectDir = createTempProject();

    try {
      const missing = readSessionArtifacts(projectDir, "ses_missing");

      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.error).toMatchObject({ code: "SESSION_NOT_FOUND" });
      }

      const invalidId = readSessionArtifacts(projectDir, "ses_../escape");

      expect(invalidId.ok).toBe(false);
      if (!invalidId.ok) {
        expect(invalidId.error).toMatchObject({ code: "SESSION_ID_INVALID" });
      }

      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      writeFileSync(ensured.value.statePath, "{invalid-json");
      const invalidState = readSessionArtifacts(projectDir, sessionId);

      expect(invalidState.ok).toBe(false);
      if (!invalidState.ok) {
        expect(invalidState.error).toMatchObject({
          code: "SESSION_STATE_INVALID_JSON"
        });
      }

      writeFileSync(
        ensured.value.statePath,
        `${JSON.stringify({
          schemaVersion: 1,
          sessionId,
          cwd: projectDir,
          createdAt: "2026-04-26T12:00:00.000Z",
          updatedAt: "2026-04-26T12:00:00.000Z",
          eventCount: 0,
          filesChanged: [],
          filesProposedForChange: [],
          filesRead: [],
          pendingApprovalCount: 0
        })}\n`
      );
      writeFileSync(ensured.value.eventsPath, "{invalid-json\n");
      const invalidEventLog = readSessionArtifacts(projectDir, sessionId);

      expect(invalidEventLog.ok).toBe(false);
      if (!invalidEventLog.ok) {
        expect(invalidEventLog.error).toMatchObject({
          code: "SESSION_EVENT_LOG_INVALID_JSON"
        });
      }

      const invalidLimit = readSessionArtifacts(projectDir, sessionId, {
        recentEventLimit: -1
      });

      expect(invalidLimit.ok).toBe(false);
      if (!invalidLimit.ok) {
        expect(invalidLimit.error).toMatchObject({
          code: "SESSION_RECENT_EVENT_LIMIT_INVALID"
        });
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("caps recent event reads to a safe maximum", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const events = Array.from({ length: 105 }, (_, index) =>
        createSessionEvent(sessionId, index + 1)
      );

      expect(store.appendEvents(sessionId, events).ok).toBe(true);
      expect(
        store.writeStateSnapshot({
          schemaVersion: 1,
          sessionId,
          cwd: projectDir,
          createdAt: "2026-04-26T12:00:00.000Z",
          updatedAt: "2026-04-26T12:02:00.000Z",
          eventCount: events.length,
          filesChanged: [],
          filesProposedForChange: [],
          filesRead: [],
          pendingApprovalCount: 0
        }).ok
      ).toBe(true);

      const inspected = readSessionArtifacts(projectDir, sessionId, {
        recentEventLimit: 1_000
      });

      expect(inspected.ok).toBe(true);
      if (!inspected.ok) {
        return;
      }

      expect(inspected.value.persistedEventCount).toBe(105);
      expect(inspected.value.recentEvents).toHaveLength(100);
      expect(inspected.value.recentEvents[0]?.eventId).toBe("evt_006");
      expect(inspected.value.recentEvents.at(-1)?.eventId).toBe("evt_105");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("reads the full event history for resume without changing display limits", () => {
    const projectDir = createTempProject();

    try {
      const sessionId = createSessionId();
      const store = createLocalSessionStore();
      const ensured = store.ensureSession(
        sessionId,
        projectDir,
        "2026-04-26T12:00:00.000Z"
      );

      expect(ensured.ok).toBe(true);
      if (!ensured.ok) {
        return;
      }

      const events = Array.from({ length: 105 }, (_, index) =>
        createSessionEvent(sessionId, index + 1)
      );

      expect(store.appendEvents(sessionId, events).ok).toBe(true);
      expect(
        store.writeStateSnapshot({
          schemaVersion: 1,
          sessionId,
          cwd: projectDir,
          createdAt: "2026-04-26T12:00:00.000Z",
          updatedAt: "2026-04-26T12:02:00.000Z",
          eventCount: events.length,
          filesChanged: ["src/changed.ts"],
          filesProposedForChange: ["src/proposed.ts"],
          filesRead: ["src/read.ts"],
          latestTask: {
            correlationId: "corr_test",
            currentPhase: "act",
            goal: "resume session",
            latestPlan: [
              {
                phase: "act",
                status: "pending",
                summary: "Continue from persisted waiting state."
              }
            ],
            status: "waiting-for-input",
            taskId: "task_test"
          },
          pendingApprovalCount: 1
        }).ok
      ).toBe(true);

      const stateBefore = readFileSync(ensured.value.statePath, "utf8");
      const eventsBefore = readFileSync(ensured.value.eventsPath, "utf8");
      const resumeRead = getReadSessionForResume()(projectDir, sessionId);
      const inspectRead = readSessionArtifacts(projectDir, sessionId, {
        recentEventLimit: 2
      });

      expect(resumeRead.ok).toBe(true);
      expect(inspectRead.ok).toBe(true);
      if (!resumeRead.ok || !inspectRead.ok) {
        return;
      }

      expect(resumeRead.value?.persistedEventCount).toBe(105);
      expect(resumeRead.value?.events).toHaveLength(105);
      expect(resumeRead.value?.events[0]?.eventId).toBe("evt_001");
      expect(resumeRead.value?.events.at(-1)?.eventId).toBe("evt_105");
      expect(resumeRead.value?.state.latestTask).toMatchObject({
        goal: "resume session",
        status: "waiting-for-input"
      });
      expect(
        inspectRead.value.recentEvents.map((event) => event.eventId)
      ).toEqual(["evt_104", "evt_105"]);
      expect(readFileSync(ensured.value.statePath, "utf8")).toBe(stateBefore);
      expect(readFileSync(ensured.value.eventsPath, "utf8")).toBe(eventsBefore);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns structured resume-read errors without creating missing session artifacts", () => {
    const projectDir = createTempProject();

    try {
      const readSessionForResume = getReadSessionForResume();
      const invalid = readSessionForResume(projectDir, "not-a-session");

      expect(invalid.ok).toBe(false);
      if (!invalid.ok) {
        expect(invalid.error).toMatchObject({
          code: "SESSION_ID_INVALID"
        });
      }

      const missing = readSessionForResume(projectDir, "ses_missing");

      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.error).toMatchObject({
          code: "SESSION_NOT_FOUND"
        });
      }
      expect(
        existsSync(join(projectDir, ".sprite", "sessions", "ses_missing"))
      ).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
