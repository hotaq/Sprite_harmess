import { describe, expect, it } from "vitest";
import {
  createTuiFinalSummaryView,
  createTuiLearningReviewView,
  formatTuiFinalSummary,
  formatTuiLearningReview
} from "@sprite/tui";
import {
  createRuntimeEventRecord,
  type FinalTaskSummary,
  type RuntimeEventPayload,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "@sprite/core";

describe("TUI outcome panels", () => {
  it("formats final summaries from typed summary and runtime evidence without leaking secrets", () => {
    const summary = finalSummary({
      filesChanged: [
        "packages/tui/src/index.ts",
        "/Users/chinnaphat/private/project/secret.ts"
      ],
      filesProposedForChange: ["packages/cli/src/index.ts"],
      filesRead: ["README.md"],
      result: "Completed with OPENAI_API_KEY=sk-secret hidden.",
      status: "completed"
    });
    const events: RuntimeEventRecord[] = [
      event("tool.call.completed", {
        command: "npm test -- --run tests/tui-outcome-panels.test.ts",
        cwd: "/Users/chinnaphat/private/project",
        durationMs: 42,
        exitCode: 0,
        status: "completed",
        summary: "Tool completed.",
        toolCallId: "tool-1",
        toolName: "run_command"
      }),
      event("validation.completed", {
        command: "npm test",
        durationMs: 42,
        exitCode: 0,
        status: "passed",
        summary: "Validation passed.",
        toolCallId: "tool-1",
        validationId: "validation-1"
      }),
      event("task.completed", {
        message:
          "Final summary prose says validation failed but typed status is completed.",
        reason: "completed"
      })
    ];

    const view = createTuiFinalSummaryView(summary, { events });
    const formatted = formatTuiFinalSummary(view);

    expect(view.status).toBe("completed");
    expect(formatted).toContain("Final summary · completed");
    expect(formatted).toContain("result: Completed with [REDACTED] hidden.");
    expect(formatted).toContain("files changed:");
    expect(formatted).toContain("packages/tui/src/index.ts");
    expect(formatted).toContain("[REDACTED_PATH]");
    expect(formatted).toContain("commands run:");
    expect(formatted).toContain(
      "completed: npm test -- --run tests/tui-outcome-panels.test.ts"
    );
    expect(formatted).toContain("validation results:");
    expect(formatted).toContain("passed: npm test");
    expect(formatted).toContain("memory influences:");
    expect(formatted).toContain("skill influences:");
    expect(formatted).not.toContain("sk-secret");
    expect(formatted).not.toContain("/Users/chinnaphat");
    expect(formatted).not.toContain("validation failed");
    expect(formatted).not.toMatch(/\u001b\[/u);
  });

  it("formats learning review event metadata and richer sections as bounded safe output", () => {
    const learningEvent = event("learning.review.created", {
      artifactPath:
        "/Users/chinnaphat/private/project/.sprite/sessions/ses_1/learning-reviews/task_1.json",
      evidenceEventIds: ["evt-tool", "evt-validation"],
      factCount: 2,
      lessonCount: 1,
      memoryCandidateIds: ["mem_1", "mem_2"],
      missedAssumptionCount: 1,
      mistakeCount: 1,
      mode: "compact",
      proceduralOutputIds: ["procout_1"],
      skillSignalIds: ["skillsig_1"],
      status: "recorded",
      summary: "Learning review created with TOKEN=hidden.",
      testGapCount: 1
    });

    const view = createTuiLearningReviewView({
      event: learningEvent,
      review: {
        evidence: {
          commandsRun: [
            {
              command: "npm test",
              eventId: "evt-tool",
              status: "passed"
            }
          ],
          validationResults: [
            {
              command: "npm test",
              eventId: "evt-validation",
              status: "passed"
            }
          ]
        },
        facts: [
          {
            evidenceEventIds: ["evt-tool"],
            summary: "Final cards are derived from typed events."
          }
        ],
        lessons: [
          {
            evidenceEventIds: ["evt-validation"],
            summary: "Keep React renderers free of file reads."
          }
        ],
        memoryCandidates: [
          {
            candidateId: "mem_1",
            eventId: "evt-memory",
            status: "recorded"
          }
        ],
        missedAssumptions: [
          {
            evidenceEventIds: ["evt-gap"],
            summary: "Assumed lesson metadata was enough."
          }
        ],
        mistakes: [
          {
            evidenceEventIds: ["evt-mistake"],
            summary: "Almost parsed assistant prose."
          }
        ],
        proceduralOutputs: [
          {
            id: "procout_1",
            workflowSummary: "Reuse typed outcome view helpers."
          }
        ],
        skillSignals: [
          {
            evidenceEventIds: ["evt-skill"],
            id: "skillsig_1",
            triggerReason: "Repeated TUI outcome workflow.",
            workflowSummary: "Outcome panel workflow."
          }
        ],
        testGaps: [
          {
            evidenceEventIds: ["evt-test-gap"],
            summary: "Add Ink card placement coverage."
          }
        ]
      }
    });
    const formatted = formatTuiLearningReview(view);

    expect(formatted).toContain("Learning review · recorded");
    expect(formatted).toContain("facts:");
    expect(formatted).toContain("Final cards are derived from typed events.");
    expect(formatted).toContain("lessons:");
    expect(formatted).toContain("Keep React renderers free of file reads.");
    expect(formatted).toContain("missed assumptions:");
    expect(formatted).toContain("mistakes:");
    expect(formatted).toContain("test gaps:");
    expect(formatted).toContain("memory candidates:");
    expect(formatted).toContain("skill signals:");
    expect(formatted).toContain("procedural outputs:");
    expect(formatted).toContain("reuse evidence:");
    expect(formatted).toContain("[REDACTED]");
    expect(formatted).toContain("[REDACTED_PATH]");
    expect(formatted).not.toContain("TOKEN=hidden");
    expect(formatted).not.toContain("/Users/chinnaphat");
    expect(formatted).not.toMatch(/\u001b\[/u);
  });
});

function finalSummary(
  input: Partial<FinalTaskSummary> = {}
): FinalTaskSummary {
  return {
    correlationId: "corr_1",
    filesChanged: [],
    filesProposedForChange: [],
    filesRead: [],
    importantEvents: [],
    memoryInfluences: [
      {
        eventId: "evt-memory",
        reason: "Relevant prior lesson.",
        sourceId: "mem_1",
        sourceType: "learning_review_lesson",
        status: "used",
        summary: "Used bounded prior lesson."
      }
    ],
    model: "gpt-test",
    notAttempted: ["No network validation was attempted."],
    provider: {
      model: "gpt-test",
      providerName: "openai-compatible"
    },
    result: "Completed.",
    sessionId: "ses_1",
    skillInfluences: [
      {
        eventId: "evt-skill",
        evidenceEventIds: ["evt-skill"],
        invocationMode: "manual",
        name: "bmad-dev-story",
        skillId: "skill_1",
        source: "project",
        sourceEventIds: ["evt-skill"],
        status: "used",
        summary: "Used story execution workflow.",
        trigger: "invoked"
      }
    ],
    status: "completed",
    taskId: "task_1",
    unresolvedRisks: ["Manual UX smoke test still recommended."],
    ...input
  };
}

function event<T extends RuntimeEventType>(
  type: T,
  payload: RuntimeEventPayload<T>
): RuntimeEventRecord<T> {
  return createRuntimeEventRecord(
    {
      correlationId: "corr_1",
      createdAt: "2026-05-13T16:00:00.000Z",
      eventId: `evt-${type}`,
      sessionId: "ses_1",
      taskId: "task_1"
    },
    type,
    payload
  );
}
