import { describe, expect, it } from "vitest";
import { inspectSessionState } from "@sprite/core";
import { SECRET_REDACTION_MARKER } from "@sprite/shared";
import {
  createLocalSessionStore,
  createSessionId,
  type SessionEventRecord,
  type SessionStateSnapshot
} from "@sprite/storage";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTempProject(): string {
  return mkdtempSync(join(tmpdir(), "sprite-session-inspect-"));
}

function stringifyView(value: unknown): string {
  return JSON.stringify(value);
}

describe("session inspection view", () => {
  it("combines state and recent events into a bounded redacted adapter view", () => {
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

      const events = [
        {
          schemaVersion: 1,
          eventId: "evt_started",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "task.started",
          createdAt: "2026-04-26T12:00:01.000Z",
          payload: {
            phase: "plan",
            status: "planned",
            providerName: "not-configured",
            model: "not-configured"
          }
        },
        {
          schemaVersion: 1,
          eventId: "evt_validation",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "validation.started",
          createdAt: "2026-04-26T12:00:02.000Z",
          payload: {
            command: "echo safe",
            cwd: projectDir,
            status: "started",
            summary: "Validation started safely",
            toolCallId: "tool_call_1",
            validationId: "validation_1"
          }
        },
        {
          schemaVersion: 1,
          eventId: "evt_failed",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "task.failed",
          createdAt: "2026-04-26T12:00:03.000Z",
          payload: {
            reason: "max-iterations",
            message: "Failed after seeing sk-test-secret"
          }
        }
      ] satisfies SessionEventRecord[];
      const snapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:03.000Z",
        eventCount: 99,
        filesChanged: ["src/changed.ts"],
        filesProposedForChange: ["src/proposed.ts"],
        filesRead: ["src/read.ts"],
        lastError: "OPENAI_API_KEY=sk-test-secret failed",
        lastEventId: "evt_failed",
        lastEventType: "task.failed",
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "max-iterations",
          currentPhase: "observe",
          goal: "Inspect OPENAI_API_KEY=sk-test-secret",
          latestPlan: [
            {
              phase: "plan",
              status: "completed",
              summary: "Plan uses sk-test-secret"
            }
          ]
        },
        nextStep: "Retry without OPENAI_API_KEY=sk-test-secret",
        pendingApprovalCount: 0
      } satisfies SessionStateSnapshot;

      expect(store.appendEvents(sessionId, events).ok).toBe(true);
      expect(store.writeStateSnapshot(snapshot).ok).toBe(true);

      const inspected = inspectSessionState(projectDir, sessionId, {
        recentEventLimit: 2
      });

      expect(inspected.ok).toBe(true);
      if (!inspected.ok) {
        return;
      }

      expect(inspected.value).toMatchObject({
        sessionId,
        cwd: projectDir,
        schemaVersion: 1,
        eventCount: 99,
        persistedEventCount: 3,
        filesChanged: ["src/changed.ts"],
        filesProposedForChange: ["src/proposed.ts"],
        filesRead: ["src/read.ts"],
        pendingApprovalCount: 0,
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "max-iterations",
          currentPhase: "observe"
        },
        executionState: {
          kind: "terminal"
        }
      });
      expect(
        inspected.value.recentEvents.map((event) => event.eventId)
      ).toEqual(["evt_validation", "evt_failed"]);
      expect(inspected.value.commandsRun).toHaveLength(1);
      expect(inspected.value.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(".sprite/sessions"),
          expect.stringContaining("eventCount")
        ])
      );
      expect(stringifyView(inspected.value)).not.toContain("sk-test-secret");
      expect(stringifyView(inspected.value)).toContain(SECRET_REDACTION_MARKER);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("keeps command summaries outside the recent event display window", () => {
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

      const events = [
        {
          schemaVersion: 1,
          eventId: "evt_validation",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "validation.started",
          createdAt: "2026-04-26T12:00:01.000Z",
          payload: {
            command: "npm test -- --runInBand",
            cwd: projectDir,
            status: "started",
            summary: "Validation started",
            toolCallId: "tool_call_1",
            validationId: "validation_1"
          }
        },
        {
          schemaVersion: 1,
          eventId: "evt_waiting",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "task.waiting",
          createdAt: "2026-04-26T12:00:02.000Z",
          payload: {
            message: "Waiting for input",
            reason: "user-input-required",
            nextAction: "answer"
          }
        },
        {
          schemaVersion: 1,
          eventId: "evt_failed",
          sessionId,
          taskId: "task_test",
          correlationId: "corr_test",
          type: "task.failed",
          createdAt: "2026-04-26T12:00:03.000Z",
          payload: {
            reason: "max-iterations",
            message: "Stopped after validation"
          }
        }
      ] satisfies SessionEventRecord[];
      const snapshot = {
        schemaVersion: 1,
        sessionId,
        cwd: projectDir,
        createdAt: "2026-04-26T12:00:00.000Z",
        updatedAt: "2026-04-26T12:00:03.000Z",
        eventCount: events.length,
        filesChanged: [],
        filesProposedForChange: [],
        filesRead: [],
        latestTask: {
          taskId: "task_test",
          correlationId: "corr_test",
          status: "max-iterations",
          currentPhase: "observe",
          goal: "Inspect old command"
        },
        pendingApprovalCount: 0
      } satisfies SessionStateSnapshot;

      expect(store.appendEvents(sessionId, events).ok).toBe(true);
      expect(store.writeStateSnapshot(snapshot).ok).toBe(true);

      const inspected = inspectSessionState(projectDir, sessionId, {
        recentEventLimit: 1
      });

      expect(inspected.ok).toBe(true);
      if (!inspected.ok) {
        return;
      }

      expect(
        inspected.value.recentEvents.map((event) => event.eventId)
      ).toEqual(["evt_failed"]);
      expect(inspected.value.commandsRun).toEqual([
        "validation.started started: npm test -- --runInBand"
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
