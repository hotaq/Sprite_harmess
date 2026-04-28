import { describe, expect, it } from "vitest";
import {
  createLocalSessionStore,
  createSessionId,
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
  unlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

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
});
