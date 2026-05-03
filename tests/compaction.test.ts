import { describe, expect, it } from "vitest";
import * as core from "@sprite/core";
import type { SessionEventRecord, SessionStateSnapshot } from "@sprite/storage";

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
