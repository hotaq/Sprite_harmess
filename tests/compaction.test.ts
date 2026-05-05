import { describe, expect, it } from "vitest";
import * as core from "@sprite/core";
import { createLocalSessionStore } from "@sprite/storage";
import type {
  SessionEventRecord,
  SessionStateSnapshot,
  SessionStore
} from "@sprite/storage";
import { SpriteError } from "@sprite/shared";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CompactionTriggerReason =
  | "manual"
  | "threshold"
  | "context-overflow"
  | "recovery";

type CreateCompactionSummary = (
  input: {
    activeConstraints: string[];
    commandsRun?: string[];
    createdAt: string;
    currentPlan: string[];
    decisions: string[];
    events: SessionEventRecord[];
    failures?: string[];
    filesTouched?: string[];
    firstRetainedEventId?: string;
    largeOutputs?: Array<{
      artifactPath?: string;
      content: string;
      label: string;
      sourceEventId: string;
      toolCallId?: string;
    }>;
    metrics?: {
      estimatedContextTokens?: number;
      reserveTokens?: number;
      thresholdTokens?: number;
    };
    nextSteps: string[];
    pendingApprovals?: string[];
    previousCompactionArtifactId?: string;
    progress: string[];
    sessionId: string;
    state: SessionStateSnapshot;
    taskGoal: string;
    triggerReason: CompactionTriggerReason;
  },
  options?: {
    maxLargeOutputPreviewChars?: number;
  }
) => {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    continuity: {
      activeConstraints: string[];
      commandsRun: string[];
      currentPlan: string[];
      decisions: string[];
      failures: string[];
      filesTouched: string[];
      nextSteps: string[];
      pendingApprovals: string[];
      progress: string[];
      taskGoal: string;
    };
    createdAt: string;
    kind: "session.compaction.summary";
    largeOutputReferences: Array<{
      artifactPath?: string;
      omittedBytes: number;
      preview: string;
      sourceEventId: string;
      toolCallId?: string;
    }>;
    metrics: {
      estimatedContextTokens?: number;
      reserveTokens?: number;
      thresholdTokens?: number;
    };
    schemaVersion: 1;
    sessionId: string;
    source: {
      eventCount: number;
      eventRange: {
        firstEventId: string;
        lastEventId: string;
      };
      firstRetainedEventId?: string;
      previousCompactionArtifactId?: string;
    };
    status: "created";
    safety: {
      largeRawOutputsEmbedded: false;
      redacted: boolean;
    };
    triggerReason: CompactionTriggerReason;
  };
};

type CompactionSummaryValue = NonNullable<
  ReturnType<CreateCompactionSummary>["value"]
>;

type CompactSessionArtifacts = (
  cwd: string,
  sessionId: string,
  options?: {
    artifactId?: string;
    contextPacket?: unknown;
    createdAt?: string;
    firstRetainedEventId?: string;
    previousCompactionArtifactId?: string;
    triggerReason?: CompactionTriggerReason;
  }
) => {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    artifact: {
      artifactId: string;
      createdAt: string;
      schemaVersion: 1;
      sessionId: string;
      summary: CompactionSummaryValue;
    };
    artifactPath: string;
    summary: CompactionSummaryValue;
  };
};

type CompactSessionManually = (
  cwd: string,
  sessionId: string,
  options?: {
    artifactId?: string;
    createdAt?: string;
    eventId?: string;
    previousCompactionArtifactId?: string;
    sessionStore?: SessionStore;
    triggerReason?: CompactionTriggerReason;
  }
) => {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    artifactId: string;
    artifactPath: string;
    compactionEventId: string;
    createdAt: string;
    sessionId: string;
    source: {
      eventCount: number;
      eventRange: {
        firstEventId: string;
        lastEventId: string;
      };
      firstRetainedEventId?: string;
      previousCompactionArtifactId?: string;
    };
    summary: CompactionSummaryValue;
    taskId: string;
    triggerReason: CompactionTriggerReason;
    warnings?: string[];
  };
};

type ReadLatestCompactedSessionContext = (
  cwd: string,
  sessionId: string
) => {
  error?: { code: string; message: string };
  ok: boolean;
  value?: {
    artifactId: string;
    compactionEventId: string;
    compactedAt: string;
    notes: Array<{
      code: string;
      field?: string;
      message: string;
    }>;
    omittedRecentEventCount: number;
    recentEvents: Array<{
      createdAt: string;
      eventId: string;
      summary: string;
      type: string;
    }>;
    summary: CompactionSummaryValue;
  };
};

function getCreateCompactionSummary(): CreateCompactionSummary {
  const createCompactionSummary = (
    core as typeof core & {
      createCompactionSummary?: CreateCompactionSummary;
    }
  ).createCompactionSummary;

  if (createCompactionSummary === undefined) {
    throw new Error("Expected @sprite/core to export createCompactionSummary.");
  }

  return createCompactionSummary;
}

function getCompactSessionArtifacts(): CompactSessionArtifacts {
  const compactSessionArtifacts = (
    core as typeof core & {
      compactSessionArtifacts?: CompactSessionArtifacts;
    }
  ).compactSessionArtifacts;

  if (compactSessionArtifacts === undefined) {
    throw new Error("Expected @sprite/core to export compactSessionArtifacts.");
  }

  return compactSessionArtifacts;
}

function getCompactSessionManually(): CompactSessionManually {
  const compactSessionManually = (
    core as typeof core & {
      compactSessionManually?: CompactSessionManually;
    }
  ).compactSessionManually;

  if (compactSessionManually === undefined) {
    throw new Error("Expected @sprite/core to export compactSessionManually.");
  }

  return compactSessionManually;
}

function getReadLatestCompactedSessionContext(): ReadLatestCompactedSessionContext {
  const readLatestCompactedSessionContext = (
    core as typeof core & {
      readLatestCompactedSessionContext?: ReadLatestCompactedSessionContext;
    }
  ).readLatestCompactedSessionContext;

  if (readLatestCompactedSessionContext === undefined) {
    throw new Error(
      "Expected @sprite/core to export readLatestCompactedSessionContext."
    );
  }

  return readLatestCompactedSessionContext;
}

function createSessionEvent(
  sessionId: string,
  eventId: string,
  type: string,
  payload: object
): SessionEventRecord {
  return {
    schemaVersion: 1,
    eventId,
    sessionId,
    taskId: "task_compact",
    correlationId: "corr_compact",
    type,
    createdAt: "2026-05-04T00:00:00.000Z",
    payload
  };
}

function createRuntimeSessionEvent(
  sessionId: string,
  taskId: string,
  correlationId: string,
  eventId: string,
  type: string,
  payload: object
): SessionEventRecord {
  return {
    schemaVersion: 1,
    eventId,
    sessionId,
    taskId,
    correlationId,
    type,
    createdAt: "2026-05-04T00:30:00.000Z",
    payload
  };
}

function readSessionEvents(path: string): SessionEventRecord[] {
  const content = readFileSync(path, "utf8").trim();

  return content.length === 0
    ? []
    : content.split("\n").map((line) => JSON.parse(line) as SessionEventRecord);
}

function createSnapshot(sessionId: string): SessionStateSnapshot {
  return {
    schemaVersion: 1,
    sessionId,
    cwd: "/tmp/sprite-compaction-test",
    createdAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:05:00.000Z",
    eventCount: 4,
    filesChanged: ["packages/core/src/compaction.ts"],
    filesProposedForChange: ["packages/storage/src/session-store.ts"],
    filesRead: ["packages/core/src/task-context.ts"],
    lastError: "provider timeout after large validation output",
    latestTask: {
      taskId: "task_compact",
      correlationId: "corr_compact",
      status: "waiting-for-input",
      currentPhase: "act",
      goal: "Compact long-running context into a resumable summary.",
      latestPlan: [
        {
          phase: "act",
          status: "pending",
          summary: "Write compaction artifact storage tests."
        }
      ]
    },
    nextStep: "Implement storage artifact persistence.",
    pendingApprovalCount: 1
  };
}

describe("compaction summary creation", () => {
  it("preserves required continuity fields and source boundaries", () => {
    const sessionId = "ses_compaction_red";
    const createCompactionSummary = getCreateCompactionSummary();
    const events = [
      createSessionEvent(sessionId, "evt_started", "task.started", {
        status: "planned"
      }),
      createSessionEvent(sessionId, "evt_validation", "validation.started", {
        command: "rtk run npm test -- --run tests/compaction.test.ts",
        status: "started"
      }),
      createSessionEvent(sessionId, "evt_waiting", "task.waiting", {
        reason: "approval-required",
        message: "Manual approval is pending."
      })
    ];

    const result = createCompactionSummary({
      activeConstraints: [
        "Answer in Thai.",
        "Use rtk for command execution and verification."
      ],
      commandsRun: ["rtk run npm test -- --run tests/compaction.test.ts"],
      createdAt: "2026-05-04T00:10:00.000Z",
      currentPlan: ["RED test first", "Implement smallest storage/core slice"],
      decisions: [
        "Use deterministic structured compaction, not provider summarization."
      ],
      events,
      failures: ["provider timeout after large validation output"],
      filesTouched: ["tests/compaction.test.ts"],
      firstRetainedEventId: "evt_waiting",
      metrics: {
        estimatedContextTokens: 82_000,
        reserveTokens: 16_000,
        thresholdTokens: 78_000
      },
      nextSteps: ["Implement storage artifact persistence."],
      pendingApprovals: ["Manual approval is pending."],
      previousCompactionArtifactId: "cmp-previous",
      progress: ["Story 3.6 research complete"],
      sessionId,
      state: createSnapshot(sessionId),
      taskGoal: "Compact long-running context into a resumable summary.",
      triggerReason: "threshold"
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) {
      return;
    }

    expect(result.value).toMatchObject({
      schemaVersion: 1,
      kind: "session.compaction.summary",
      sessionId,
      createdAt: "2026-05-04T00:10:00.000Z",
      triggerReason: "threshold",
      status: "created",
      source: {
        eventCount: 3,
        eventRange: {
          firstEventId: "evt_started",
          lastEventId: "evt_waiting"
        },
        firstRetainedEventId: "evt_waiting",
        previousCompactionArtifactId: "cmp-previous"
      },
      safety: {
        largeRawOutputsEmbedded: false
      },
      metrics: {
        estimatedContextTokens: 82_000,
        reserveTokens: 16_000,
        thresholdTokens: 78_000
      },
      continuity: {
        taskGoal: "Compact long-running context into a resumable summary."
      }
    });
    expect(result.value.continuity.activeConstraints).toEqual(
      expect.arrayContaining([
        "Answer in Thai.",
        "Use rtk for command execution and verification."
      ])
    );
    expect(result.value.continuity.decisions).toContain(
      "Use deterministic structured compaction, not provider summarization."
    );
    expect(result.value.continuity.currentPlan).toContain("RED test first");
    expect(result.value.continuity.progress).toContain(
      "Story 3.6 research complete"
    );
    expect(result.value.continuity.filesTouched).toEqual(
      expect.arrayContaining([
        "packages/core/src/compaction.ts",
        "packages/core/src/task-context.ts",
        "packages/storage/src/session-store.ts",
        "tests/compaction.test.ts"
      ])
    );
    expect(result.value.continuity.commandsRun).toContain(
      "rtk run npm test -- --run tests/compaction.test.ts"
    );
    expect(result.value.continuity.failures).toEqual(
      expect.arrayContaining(["provider timeout after large validation output"])
    );
    expect(result.value.continuity.pendingApprovals).toContain(
      "Manual approval is pending."
    );
    expect(result.value.continuity.nextSteps).toContain(
      "Implement storage artifact persistence."
    );
  });

  it("stores large outputs as bounded references instead of raw transcript text", () => {
    const sessionId = "ses_compaction_large_output";
    const createCompactionSummary = getCreateCompactionSummary();
    const rawOutput = [
      "line 1: useful prefix",
      "RAW_OUTPUT_SHOULD_NOT_BE_EMBEDDED",
      "x".repeat(5_000),
      "line 999: useful suffix"
    ].join("\n");

    const result = createCompactionSummary(
      {
        activeConstraints: [],
        createdAt: "2026-05-04T00:15:00.000Z",
        currentPlan: [],
        decisions: [],
        events: [
          createSessionEvent(sessionId, "evt_tool", "validation.completed", {
            command: "rtk run npm test",
            status: "failed"
          })
        ],
        largeOutputs: [
          {
            artifactPath:
              ".sprite/sessions/ses_compaction_large_output/logs/validation.log",
            content: rawOutput,
            label: "validation stdout",
            sourceEventId: "evt_tool",
            toolCallId: "tool_validation"
          }
        ],
        nextSteps: [],
        progress: [],
        sessionId,
        state: createSnapshot(sessionId),
        taskGoal: "Compact large validation output safely.",
        triggerReason: "manual"
      },
      { maxLargeOutputPreviewChars: 120 }
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) {
      return;
    }

    expect(result.value.largeOutputReferences).toHaveLength(1);
    expect(result.value.largeOutputReferences[0]).toMatchObject({
      artifactPath:
        ".sprite/sessions/ses_compaction_large_output/logs/validation.log",
      sourceEventId: "evt_tool",
      toolCallId: "tool_validation"
    });
    expect(
      result.value.largeOutputReferences[0]?.preview.length
    ).toBeLessThanOrEqual(120);
    expect(result.value.largeOutputReferences[0]?.omittedBytes).toBeGreaterThan(
      0
    );
    expect(JSON.stringify(result.value)).not.toContain(
      "RAW_OUTPUT_SHOULD_NOT_BE_EMBEDDED"
    );
    expect(JSON.stringify(result.value)).not.toContain("x".repeat(1_000));
  });
});

describe("compaction runtime boundary", () => {
  it("writes a session compaction artifact without rewriting the event log", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-session-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "compact this running task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const artifactPath = join(
        sessionDir,
        "compactions",
        "cmp-runtime-001.json"
      );
      const recordedFiles = runtime.recordFileActivity({
        kind: "changed",
        paths: ["package.json"],
        summary: "Updated package metadata during compaction setup."
      });
      expect(recordedFiles.ok).toBe(true);

      const policyDecision = createRuntimeSessionEvent(
        sessionId,
        submitted.value.taskId,
        submitted.value.correlationId,
        "evt_compaction_policy",
        "policy.decision.recorded",
        {
          action: "require_approval",
          command: "rtk run npm test -- --run",
          reason: "Project validation command requires user approval.",
          requestType: "command",
          riskLevel: "medium",
          ruleId: "command-approval",
          status: "recorded",
          summary: "Command policy decision recorded.",
          timeoutMs: 30_000
        }
      );
      const recoveryDecision = createRuntimeSessionEvent(
        sessionId,
        submitted.value.taskId,
        submitted.value.correlationId,
        "evt_compaction_recovery",
        "task.recovery.recorded",
        {
          decision: "retry_with_fix",
          message: "Validation failed before compaction.",
          nextAction: "Fix validation failure before resume.",
          sourceEventId: "evt_compaction_policy",
          status: "recorded",
          summary: "Retry with a narrower validation command.",
          trigger: "validation_failed",
          validationId: "val_compaction"
        }
      );
      const approvalDecision = createRuntimeSessionEvent(
        sessionId,
        submitted.value.taskId,
        submitted.value.correlationId,
        "evt_compaction_approval",
        "approval.resolved",
        {
          approvalRequestId: "approval_compaction",
          decision: "allow",
          reason: "User approved validation command.",
          requestType: "command",
          status: "resolved",
          summary: "Approval resolved for validation command."
        }
      );

      appendFileSync(
        eventsPath,
        [policyDecision, recoveryDecision, approvalDecision]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n"
      );

      const eventsBefore = readFileSync(eventsPath, "utf8");
      const persistedEvents = readSessionEvents(eventsPath);
      const compactSessionArtifacts = getCompactSessionArtifacts();

      const compacted = compactSessionArtifacts(projectDir, sessionId, {
        artifactId: "cmp-runtime-001",
        contextPacket: submitted.value.request.contextPacket,
        createdAt: "2026-05-04T00:50:00.000Z",
        triggerReason: "manual"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      expect(readFileSync(eventsPath, "utf8")).toBe(eventsBefore);
      expect(existsSync(artifactPath)).toBe(true);
      expect(compacted.value.artifactPath).toBe(artifactPath);
      expect(compacted.value.artifact).toMatchObject({
        artifactId: "cmp-runtime-001",
        createdAt: "2026-05-04T00:50:00.000Z",
        schemaVersion: 1,
        sessionId
      });
      expect(compacted.value.summary).toMatchObject({
        schemaVersion: 1,
        kind: "session.compaction.summary",
        sessionId,
        createdAt: "2026-05-04T00:50:00.000Z",
        triggerReason: "manual",
        source: {
          eventCount: persistedEvents.length,
          eventRange: {
            firstEventId: persistedEvents[0]?.eventId,
            lastEventId: persistedEvents.at(-1)?.eventId
          },
          firstRetainedEventId: persistedEvents.at(-1)?.eventId
        },
        continuity: {
          taskGoal: "compact this running task"
        },
        safety: {
          largeRawOutputsEmbedded: false
        }
      });
      expect(compacted.value.summary.continuity.progress).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Context packet included sections:"),
          expect.stringContaining("Context packet sources:")
        ])
      );
      expect(compacted.value.summary.continuity.activeConstraints).toEqual(
        expect.arrayContaining([expect.stringContaining("Runtime self-model:")])
      );
      expect(compacted.value.summary.continuity.decisions).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Policy command require_approval"),
          expect.stringContaining("Recovery retry_with_fix"),
          expect.stringContaining("Approval command allow")
        ])
      );
      expect(compacted.value.summary.continuity.commandsRun).toContain(
        "rtk run npm test -- --run"
      );
      expect(compacted.value.summary.continuity.filesTouched).toContain(
        "package.json"
      );
      expect(readFileSync(artifactPath, "utf8")).toContain(
        '"kind": "session.compaction.summary"'
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manual compaction writes an artifact, appends one event, and updates the snapshot", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("manual compact now");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const statePath = join(sessionDir, "state.json");
      const compactSessionManually = getCompactSessionManually();
      const beforeEvents = readSessionEvents(eventsPath);
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-manual-001",
        createdAt: "2026-05-04T01:00:00.000Z",
        eventId: "evt_session_compacted_manual"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      const afterEvents = readSessionEvents(eventsPath);
      const state = JSON.parse(readFileSync(statePath, "utf8")) as {
        eventCount: number;
        lastEventId?: string;
        lastEventType?: string;
      };

      expect(afterEvents).toHaveLength(beforeEvents.length + 1);
      expect(afterEvents.at(-1)).toMatchObject({
        eventId: "evt_session_compacted_manual",
        sessionId,
        taskId: submitted.value.taskId,
        correlationId: submitted.value.correlationId,
        type: "session.compacted",
        payload: {
          artifactId: "cmp-manual-001",
          sourceEventCount: beforeEvents.length,
          sourceFirstEventId: beforeEvents[0]?.eventId,
          sourceLastEventId: beforeEvents.at(-1)?.eventId,
          status: "recorded",
          triggerReason: "manual"
        }
      });
      expect(compacted.value).toMatchObject({
        artifactId: "cmp-manual-001",
        compactionEventId: "evt_session_compacted_manual",
        sessionId,
        taskId: submitted.value.taskId,
        triggerReason: "manual",
        source: {
          eventCount: beforeEvents.length,
          eventRange: {
            firstEventId: beforeEvents[0]?.eventId,
            lastEventId: beforeEvents.at(-1)?.eventId
          }
        }
      });
      expect(existsSync(compacted.value.artifactPath)).toBe(true);
      expect(state).toMatchObject({
        eventCount: afterEvents.length,
        lastEventId: "evt_session_compacted_manual",
        lastEventType: "session.compacted"
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("reads the latest compacted context with bounded events after compaction", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "continue from compacted context"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-read-latest-001",
        createdAt: "2026-05-04T01:05:00.000Z",
        eventId: "evt_compacted_for_restore"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      const newerEvent = core.createRuntimeEventRecord(
        {
          correlationId: submitted.value.correlationId,
          createdAt: "2026-05-04T01:06:00.000Z",
          eventId: "evt_after_compaction_steering",
          sessionId,
          taskId: submitted.value.taskId
        },
        "task.steering.received",
        {
          note: "Continue with newer event history after compaction."
        }
      );

      expect(core.validateRuntimeEvent(newerEvent).ok).toBe(true);
      appendFileSync(eventsPath, `${JSON.stringify(newerEvent)}\n`);

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, sessionId);

      expect(restored.ok).toBe(true);
      if (!restored.ok || restored.value === undefined) {
        return;
      }

      expect(restored.value).toMatchObject({
        artifactId: "cmp-read-latest-001",
        compactionEventId: "evt_compacted_for_restore",
        compactedAt: "2026-05-04T01:05:00.000Z",
        omittedRecentEventCount: 0,
        summary: {
          continuity: {
            taskGoal: "continue from compacted context"
          }
        }
      });
      expect(restored.value.recentEvents).toEqual([
        expect.objectContaining({
          eventId: "evt_after_compaction_steering",
          summary: expect.stringContaining("newer event history"),
          type: "task.steering.received"
        })
      ]);
      expect(JSON.stringify(restored.value)).not.toContain("sk-test");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("bounds post-compaction recent events to the latest restore window", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "bound compacted recent events"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-bounded-recent-events",
        createdAt: "2026-05-04T01:05:00.000Z",
        eventId: "evt_bounded_recent_events_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok) {
        return;
      }

      for (let index = 0; index < 25; index += 1) {
        const event = core.createRuntimeEventRecord(
          {
            correlationId: submitted.value.correlationId,
            createdAt: `2026-05-04T01:${String(10 + index).padStart(2, "0")}:00.000Z`,
            eventId: `evt_after_compaction_${String(index).padStart(2, "0")}`,
            sessionId,
            taskId: submitted.value.taskId
          },
          "task.steering.received",
          {
            note: `newer steering event ${index}`
          }
        );

        expect(core.validateRuntimeEvent(event).ok).toBe(true);
        appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
      }

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, sessionId);

      expect(restored.ok).toBe(true);
      if (!restored.ok || restored.value === undefined) {
        return;
      }

      expect(restored.value.recentEvents).toHaveLength(
        core.DEFAULT_COMPACTED_CONTEXT_RECENT_EVENT_LIMIT
      );
      expect(restored.value.omittedRecentEventCount).toBe(5);
      expect(restored.value.recentEvents[0]?.eventId).toBe(
        "evt_after_compaction_05"
      );
      expect(restored.value.recentEvents.at(-1)?.eventId).toBe(
        "evt_after_compaction_24"
      );
      expect(restored.value.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "progress",
            message: expect.stringContaining("5 newer event(s)")
          })
        ])
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("records recoverable notes for newer state and event-history conflicts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "detect compacted context conflicts"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const statePath = join(sessionDir, "state.json");
      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-conflict-notes",
        createdAt: "2026-05-04T01:05:00.000Z",
        eventId: "evt_conflict_notes_compacted"
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok) {
        return;
      }

      const validationEvent = core.createRuntimeEventRecord(
        {
          correlationId: submitted.value.correlationId,
          createdAt: "2026-05-04T01:06:00.000Z",
          eventId: "evt_newer_validation_command",
          sessionId,
          taskId: submitted.value.taskId
        },
        "validation.started",
        {
          command: "rtk run npm test -- --run tests/compaction.test.ts",
          cwd: projectDir,
          status: "started",
          summary: "Started newer validation command after compaction.",
          toolCallId: "tool_newer_validation",
          validationId: "val_newer_validation"
        }
      );

      expect(core.validateRuntimeEvent(validationEvent).ok).toBe(true);
      appendFileSync(eventsPath, `${JSON.stringify(validationEvent)}\n`);

      const state = JSON.parse(
        readFileSync(statePath, "utf8")
      ) as Record<string, unknown>;
      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            ...state,
            filesChanged: [
              ...((state.filesChanged as string[] | undefined) ?? []),
              "packages/core/src/newer-conflict.ts"
            ],
            lastError: "Newer failure OPENAI_API_KEY=sk-test-secret",
            latestTask: {
              ...(state.latestTask as Record<string, unknown>),
              currentPhase: "act",
              goal: "newer goal after compaction",
              latestPlan: [
                {
                  phase: "act",
                  status: "pending",
                  summary: "Use newer plan after compaction."
                }
              ]
            },
            nextStep: "Use newer next step after compaction.",
            pendingApprovalCount: 2
          },
          null,
          2
        )}\n`
      );

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, sessionId);

      expect(restored.ok).toBe(true);
      if (!restored.ok || restored.value === undefined) {
        return;
      }

      expect(restored.value.notes.map((note) => note.field)).toEqual(
        expect.arrayContaining([
          "taskGoal",
          "currentPlan",
          "progress",
          "nextSteps",
          "failures",
          "filesTouched",
          "pendingApprovals",
          "commandsRun"
        ])
      );
      expect(JSON.stringify(restored.value)).not.toContain("sk-test-secret");
      expect(JSON.stringify(restored.value)).toContain("[REDACTED]");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns no compacted context for sessions without a compaction event", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("resume without compact");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, submitted.value.sessionId);

      expect(restored.ok).toBe(true);
      expect(restored.value).toBeUndefined();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("uses the latest compaction event when multiple compactions exist", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("compact more than once");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const compactSessionManually = getCompactSessionManually();
      const first = compactSessionManually(projectDir, submitted.value.sessionId, {
        artifactId: "cmp-restore-first",
        createdAt: "2026-05-04T01:08:00.000Z",
        eventId: "evt_first_restore_compaction"
      });
      const second = compactSessionManually(
        projectDir,
        submitted.value.sessionId,
        {
          artifactId: "cmp-restore-second",
          createdAt: "2026-05-04T01:09:00.000Z",
          eventId: "evt_second_restore_compaction",
          previousCompactionArtifactId: "cmp-restore-first"
        }
      );

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, submitted.value.sessionId);

      expect(restored.ok).toBe(true);
      expect(restored.value).toMatchObject({
        artifactId: "cmp-restore-second",
        compactionEventId: "evt_second_restore_compaction",
        source: {
          previousCompactionArtifactId: "cmp-restore-first"
        }
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails with structured storage evidence when the latest compaction artifact is missing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "compact then remove artifact"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(
        projectDir,
        submitted.value.sessionId,
        {
          artifactId: "cmp-missing-restore",
          createdAt: "2026-05-04T01:10:00.000Z",
          eventId: "evt_missing_restore_compaction"
        }
      );

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      rmSync(compacted.value.artifactPath, { force: true });

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, submitted.value.sessionId);

      expect(restored.ok).toBe(false);
      expect(restored.error?.code).toBe(
        "SESSION_COMPACTION_ARTIFACT_READ_FAILED"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails when the latest compaction artifact wrapper belongs to another session", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "reject cross-session compaction artifact"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(
        projectDir,
        submitted.value.sessionId,
        {
          artifactId: "cmp-scope-mismatch",
          createdAt: "2026-05-04T01:11:00.000Z",
          eventId: "evt_scope_mismatch_compaction"
        }
      );

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      const artifact = JSON.parse(
        readFileSync(compacted.value.artifactPath, "utf8")
      ) as Record<string, unknown>;
      writeFileSync(
        compacted.value.artifactPath,
        `${JSON.stringify(
          {
            ...artifact,
            sessionId: "ses_other_session"
          },
          null,
          2
        )}\n`
      );

      const readLatest = getReadLatestCompactedSessionContext();
      const restored = readLatest(projectDir, submitted.value.sessionId);

      expect(restored.ok).toBe(false);
      expect(restored.error?.code).toBe(
        "SESSION_COMPACTION_ARTIFACT_SCOPE_MISMATCH"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manual compaction rejects duplicate artifact IDs before appending another event", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask("manual compact twice");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const compactSessionManually = getCompactSessionManually();
      const first = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-duplicate-001",
        createdAt: "2026-05-04T01:02:00.000Z",
        eventId: "evt_first_compaction"
      });

      expect(first.ok).toBe(true);

      const eventsBeforeDuplicate = readFileSync(eventsPath, "utf8");
      const duplicate = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-duplicate-001",
        createdAt: "2026-05-04T01:03:00.000Z",
        eventId: "evt_duplicate_compaction"
      });

      expect(duplicate.ok).toBe(false);
      expect(duplicate.error?.code).toBe("SESSION_COMPACTION_ARTIFACT_EXISTS");
      expect(readFileSync(eventsPath, "utf8")).toBe(eventsBeforeDuplicate);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manual compaction reports a warning when snapshot update fails after event append", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "manual compact snapshot warning"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const realStore = createLocalSessionStore();
      let snapshotWriteAttempts = 0;
      const warningStore: SessionStore = {
        ensureSession: realStore.ensureSession.bind(realStore),
        appendEvents: realStore.appendEvents.bind(realStore),
        writeStateSnapshot: (snapshot) => {
          snapshotWriteAttempts += 1;

          if (snapshotWriteAttempts === 1) {
            return realStore.writeStateSnapshot(snapshot);
          }

          return {
            ok: false,
            error: new SpriteError(
              "SESSION_STATE_WRITE_FAILED",
              "simulated snapshot write failure"
            )
          };
        }
      };
      const beforeEvents = readSessionEvents(eventsPath);
      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-snapshot-warning",
        createdAt: "2026-05-04T01:04:00.000Z",
        eventId: "evt_snapshot_warning",
        sessionStore: warningStore
      });

      expect(compacted.ok).toBe(true);
      if (!compacted.ok || compacted.value === undefined) {
        return;
      }

      expect(compacted.value.warnings).toEqual([
        expect.stringContaining("state snapshot could not be updated")
      ]);
      expect(readSessionEvents(eventsPath)).toHaveLength(
        beforeEvents.length + 1
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manual compaction fails recoverably before writing an artifact when latest task metadata is missing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "manual compact missing task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const statePath = join(sessionDir, "state.json");
      const compactionsDir = join(sessionDir, "compactions");
      const state = JSON.parse(
        readFileSync(statePath, "utf8")
      ) as SessionStateSnapshot;
      const { latestTask: _latestTask, ...stateWithoutLatestTask } = state;

      writeFileSync(
        statePath,
        `${JSON.stringify(stateWithoutLatestTask, null, 2)}\n`
      );

      const beforeEvents = readFileSync(eventsPath, "utf8");
      const compactSessionManually = getCompactSessionManually();
      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-should-not-exist",
        createdAt: "2026-05-04T01:05:00.000Z",
        eventId: "evt_should_not_append"
      });

      expect(compacted.ok).toBe(false);
      expect(compacted.error?.code).toBe("MANUAL_COMPACTION_UNAVAILABLE");
      expect(compacted.error?.message).toContain("state.latestTask");
      expect(readFileSync(eventsPath, "utf8")).toBe(beforeEvents);
      expect(existsSync(join(compactionsDir, "cmp-should-not-exist.json"))).toBe(
        false
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manual compaction removes the artifact if event validation fails after artifact write", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-manual-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "manual compact append failure"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const sessionId = submitted.value.sessionId;
      const sessionDir = join(projectDir, ".sprite", "sessions", sessionId);
      const eventsPath = join(sessionDir, "events.ndjson");
      const artifactPath = join(
        sessionDir,
        "compactions",
        "cmp-event-validation-failure.json"
      );
      const beforeEvents = readFileSync(eventsPath, "utf8");
      const compactSessionManually = getCompactSessionManually();

      const compacted = compactSessionManually(projectDir, sessionId, {
        artifactId: "cmp-event-validation-failure",
        createdAt: "not-a-date",
        eventId: "evt_event_validation_failure"
      });

      expect(compacted.ok).toBe(false);
      expect(compacted.error?.code).toBe("INVALID_RUNTIME_EVENT");
      expect(readFileSync(eventsPath, "utf8")).toBe(beforeEvents);
      expect(existsSync(artifactPath)).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects a live context packet from a different session", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sprite-session-compact-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");

    try {
      const runtime = new core.AgentRuntime({ cwd: projectDir, homeDir });
      const submitted = runtime.submitInteractiveTask(
        "reject mismatched context"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const mismatchedContextPacket = JSON.parse(
        JSON.stringify(submitted.value.request.contextPacket)
      ) as {
        sections: Array<{
          metadata: Record<string, unknown>;
          source: string;
        }>;
      };
      const sessionSection = mismatchedContextPacket.sections.find(
        (section) => section.source === "session-state"
      );

      if (sessionSection !== undefined) {
        sessionSection.metadata.sessionId = "ses_other_session";
      }

      const compactSessionArtifacts = getCompactSessionArtifacts();
      const compacted = compactSessionArtifacts(
        projectDir,
        submitted.value.sessionId,
        {
          artifactId: "cmp-context-mismatch",
          contextPacket: mismatchedContextPacket,
          createdAt: "2026-05-04T00:55:00.000Z",
          triggerReason: "manual"
        }
      );

      expect(compacted.ok).toBe(false);
      expect(compacted.error?.code).toBe(
        "COMPACTION_CONTEXT_PACKET_SESSION_MISMATCH"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
