import { beforeEach, describe, expect, it } from "vitest";
import {
  TUI_OUTPUT_PREVIEW_MAX_BYTES,
  TUI_OUTPUT_PREVIEW_MAX_LINES,
  createTuiMessageStream,
  formatTuiMessageStream
} from "@sprite/tui";
import {
  createRuntimeEventRecord,
  type RuntimeEventPayload,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "@sprite/core";

describe("TUI message stream adapter", () => {
  beforeEach(() => {
    currentEventIndex = 0;
  });

  it("maps runtime event families from typed events without parsing final summary text", () => {
    const events: RuntimeEventRecord[] = [
      event("task.started", {
        model: "gpt-test",
        phase: "plan",
        providerName: "openai-compatible",
        status: "planned"
      }),
      event("tool.call.completed", {
        command: "npm test",
        cwd: "/repo",
        durationMs: 123,
        exitCode: 0,
        outputReference: {
          fullOutputStored: true,
          path: ".sprite/logs/tool-output.log",
          reason: "large-output"
        },
        status: "completed",
        summary: "Tool completed; this word warning is normal prose.",
        toolCallId: "tool-1",
        toolName: "run_command"
      }),
      event("validation.completed", {
        command: "npm test",
        durationMs: 123,
        exitCode: 0,
        status: "passed",
        summary: "Validation passed; do not parse this as a warning.",
        toolCallId: "tool-1",
        validationId: "validation-1"
      }),
      event("policy.decision.recorded", {
        action: "deny",
        reason: "Command is outside sandbox.",
        requestType: "command",
        riskLevel: "critical",
        ruleId: "sandbox-boundary",
        status: "recorded",
        summary: "Policy denied risky command.",
        timeoutMs: 1_000
      }),
      event("approval.requested", {
        allowedActions: ["allow", "deny"],
        approvalRequestId: "approval-1",
        reason: "Risky command requires approval.",
        requestType: "command",
        riskLevel: "high",
        ruleId: "risky-command",
        status: "pending",
        summary: "Approval requested.",
        timeoutMs: 30_000,
        toolCallId: "tool-2"
      }),
      event("approval.resolved", {
        approvalRequestId: "approval-1",
        decision: "deny",
        reason: "User rejected the risky command.",
        requestType: "command",
        status: "resolved",
        summary: "Approval denied.",
        toolCallId: "tool-2"
      }),
      event("file.edit.applied", {
        affectedFiles: ["packages/tui/src/index.ts"],
        editId: "edit-1",
        status: "applied",
        summary: "Patch applied.",
        toolCallId: "tool-3",
        toolName: "apply_patch"
      }),
      event("memory.candidate.created", {
        candidateId: "memory-1",
        confidence: "medium",
        contentPreview: "Remember the TUI stream contract.",
        memoryType: "episodic",
        provenance: "learning-review",
        sensitivityStatus: "non_sensitive",
        sourceEventIds: ["evt-1"],
        status: "recorded",
        summary: "Memory candidate created."
      }),
      event("skill.invoked", {
        contentLength: 128,
        contentTruncated: false,
        invocationMode: "manual",
        invokedBy: "user",
        name: "typescript-advanced-types",
        skillId: "skill-1",
        source: "project",
        status: "loaded",
        summary: "Skill loaded."
      }),
      event("session.resumed", {
        currentPhase: "act",
        restoredEventCount: 8,
        restoredTaskStatus: "waiting-for-input",
        status: "recorded",
        summary: "Session resumed."
      }),
      event("session.compacted", {
        artifactId: "compaction-1",
        sourceEventCount: 10,
        sourceFirstEventId: "evt-1",
        sourceLastEventId: "evt-10",
        status: "recorded",
        summary: "Session compacted.",
        triggerReason: "manual"
      }),
      event("retrospective.review.created", {
        artifactPath: ".sprite/retrospectives/review.md",
        commandCount: 1,
        evidenceEventIds: ["evt-1"],
        fileCount: 1,
        finalStatus: "completed",
        memoryCandidateCount: 1,
        missedAssumptionCount: 0,
        nextTimeImprovementCount: 1,
        skillSignalCount: 0,
        status: "recorded",
        summary: "Retrospective created.",
        terminalStatus: "completed"
      }),
      event("learning.review.created", {
        artifactPath: ".sprite/learning/review.md",
        evidenceEventIds: ["evt-1"],
        factCount: 1,
        lessonCount: 1,
        memoryCandidateIds: ["memory-1"],
        missedAssumptionCount: 0,
        mistakeCount: 0,
        mode: "compact",
        proceduralOutputIds: [],
        skillSignalIds: [],
        status: "recorded",
        summary: "Learning review created.",
        testGapCount: 0
      })
    ];

    const stream = createTuiMessageStream(events);
    const formatted = formatTuiMessageStream(stream);

    expect(stream.items.map((item) => item.kind)).toEqual([
      "task",
      "tool",
      "validation",
      "policy",
      "approval",
      "approval",
      "file",
      "memory",
      "skill",
      "session",
      "session",
      "retrospective",
      "learning"
    ]);
    expect(stream.items[1]).toMatchObject({
      eventType: "tool.call.completed",
      kind: "tool",
      severity: "success",
      status: "completed"
    });
    expect(stream.items[1]?.metadata).toMatchObject({
      toolCallId: "tool-1",
      toolName: "run_command"
    });
    expect(stream.items[1]?.output).toMatchObject({
      fullOutputStored: true,
      reference: {
        value: ".sprite/logs/tool-output.log"
      }
    });
    expect(stream.items[2]).toMatchObject({
      kind: "validation",
      severity: "success",
      status: "passed"
    });
    expect(stream.items[3]).toMatchObject({
      kind: "policy",
      severity: "error",
      status: "deny"
    });
    expect(stream.items[4]).toMatchObject({
      kind: "approval",
      severity: "pending",
      status: "pending"
    });
    expect(
      stream.items.find((item) => item.eventType === "approval.resolved")
    ).toMatchObject({
      kind: "approval",
      severity: "error",
      status: "deny"
    });
    expect(formatted).toContain("[TOOL][SUCCESS] tool.call.completed completed");
    expect(formatted).toContain("toolCallId=tool-1");
    expect(formatted).toContain("output=stored reference=.sprite/logs/tool-output.log");
    expect(formatted).toContain("[VALIDATION][SUCCESS] validation.completed passed");
    expect(formatted).not.toMatch(/\u001b\[/u);
  });

  it("truncates large output previews and keeps local output references safe", () => {
    const largeOutput = Array.from(
      { length: TUI_OUTPUT_PREVIEW_MAX_LINES + 5 },
      (_, index) => `line-${index + 1}-${"x".repeat(80)}`
    ).join("\n");
    const secretOutput = `${largeOutput}\nOPENAI_API_KEY=sk-secret`;
    const events = [
      event("tool.call.failed", {
        command: "npm test",
        cwd: "/repo",
        durationMs: 999,
        errorCode: "COMMAND_FAILED",
        exitCode: 1,
        message: "Command failed.",
        outputReference: {
          fullOutputStored: true,
          path: ".sprite/logs/OPENAI_API_KEY=sk-secret.log",
          reason: "captured-output"
        },
        status: "failed",
        summary: "Command failed with large output.",
        toolCallId: "tool-large",
        toolName: "run_command"
      })
    ];

    const stream = createTuiMessageStream(events, {
      outputPreviews: {
        "evt-1": secretOutput
      }
    });
    const item = stream.items[0];
    const formatted = formatTuiMessageStream(stream);

    expect(secretOutput.length).toBeGreaterThan(TUI_OUTPUT_PREVIEW_MAX_BYTES);
    expect(item?.severity).toBe("error");
    expect(item?.output).toMatchObject({
      fullOutputStored: true,
      hiddenLineCount: 6,
      isTruncated: true,
      originalLineCount: TUI_OUTPUT_PREVIEW_MAX_LINES + 6
    });
    expect(item?.output?.preview?.redacted).toBe(true);
    expect(item?.output?.reference?.redacted).toBe(true);
    expect(formatted).toContain("output=truncated");
    expect(formatted).toContain(`lines=${TUI_OUTPUT_PREVIEW_MAX_LINES + 6}`);
    expect(formatted).not.toContain("sk-secret");
    expect(formatted).not.toContain(`line-${TUI_OUTPUT_PREVIEW_MAX_LINES + 5}`);
  });

  it("keeps task messages independent from tool and validation summary wording", () => {
    const stream = createTuiMessageStream([
      event("task.completed", {
        message: "Final summary says tool.call.failed and validation failed.",
        reason: "completed"
      })
    ]);

    expect(stream.items).toHaveLength(1);
    expect(stream.items[0]).toMatchObject({
      eventType: "task.completed",
      kind: "task",
      severity: "success",
      status: "completed"
    });
    expect(formatTuiMessageStream(stream)).toContain(
      "[TASK][SUCCESS] task.completed completed"
    );
  });
});

function event<T extends RuntimeEventType>(
  type: T,
  payload: RuntimeEventPayload<T>
): RuntimeEventRecord<T> {
  const eventIndex = nextEventIndex();
  return createRuntimeEventRecord(
    {
      correlationId: "corr-1",
      createdAt: `2026-05-11T00:00:${eventIndex.toString().padStart(2, "0")}.000Z`,
      eventId: `evt-${eventIndex}`,
      sessionId: "sess-1",
      taskId: "task-1"
    },
    type,
    payload
  );
}

let currentEventIndex = 0;

function nextEventIndex(): number {
  currentEventIndex += 1;
  return currentEventIndex;
}
