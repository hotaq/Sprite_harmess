import { describe, expect, it } from "vitest";
import * as core from "@sprite/core";
import type { SessionEventRecord, SessionStateSnapshot } from "@sprite/storage";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync
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
