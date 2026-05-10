import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  createFinalTaskSummary,
  runOneShotPrintTask
} from "@sprite/core";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTempProject(): { projectDir: string; rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-runtime-loop-"));
  const projectDir = join(rootDir, "project");

  mkdirSync(projectDir, { recursive: true });

  return { projectDir, rootDir };
}

describe("AgentRuntime interactive task flow", () => {
  it("creates a typed task request from runtime state and moves into a waiting state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const result = runtime.submitInteractiveTask("fix the failing smoke test");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.request.task).toBe("fix the failing smoke test");
    expect(result.value.request.cwd).toBe("/tmp/sprite-project");
    expect(result.value.request.allowedDefaults.toolExecutionEnabled).toBe(
      false
    );
    expect(
      result.value.request.contextPacket.sections.map(
        (section) => section.source
      )
    ).toEqual([
      "runtime-self-model",
      "working-memory",
      "provider-limits",
      "user-input",
      "session-state",
      "compacted-context",
      "project-context",
      "memory",
      "skills"
    ]);
    expect(
      result.value.request.contextPacket.sections.find(
        (section) => section.source === "working-memory"
      )
    ).toMatchObject({
      metadata: expect.objectContaining({
        scope: "task",
        sessionId: result.value.sessionId,
        taskId: result.value.taskId
      }),
      status: "included",
      trust: "trusted"
    });
    expect(
      result.value.request.contextPacket.sections.find(
        (section) => section.source === "working-memory"
      )?.content
    ).toContain("fix the failing smoke test");
    expect(
      result.value.request.contextPacket.sections.find(
        (section) => section.source === "session-state"
      )
    ).toMatchObject({
      status: "included",
      metadata: expect.objectContaining({
        correlationId: result.value.correlationId,
        sessionId: result.value.sessionId,
        taskId: result.value.taskId
      })
    });
    expect(result.value.request.stopConditions.maxIterations).toBe(1);
    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.currentPhase).toBe("act");
    expect(result.value.waitingState?.reason).toBe("steering-required");
    expect(result.value.events.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting"
    ]);
  });

  it("returns an initial plan-act-observe execution flow before tool work", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const result = runtime.submitInteractiveTask("add a provider health check");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.steps).toHaveLength(3);
    expect(result.value.steps[0]).toMatchObject({
      phase: "plan",
      status: "completed"
    });
    expect(result.value.steps[1]).toMatchObject({
      phase: "act",
      status: "pending"
    });
    expect(result.value.steps[2]).toMatchObject({
      phase: "observe",
      status: "pending"
    });
    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.currentPhase).toBe("act");
    expect(result.value.summary).toContain("planned the first loop");
  });

  it("records steering input through AgentRuntime without leaving runtime-owned waiting state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("tighten the provider bootstrap output");
    const result = runtime.steerActiveTask(
      "Focus on auth state rendering before adding more CLI flags."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.intents).toHaveLength(1);
    expect(result.value.intents[0]).toMatchObject({
      intent: "steer",
      note: "Focus on auth state rendering before adding more CLI flags."
    });
    expect(result.value.events.at(-2)?.type).toBe("task.steering.received");
    expect(result.value.events.at(-1)?.type).toBe("task.waiting");
  });

  it("cancels an active task through AgentRuntime and records a terminal event", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("cancel the in-flight task");
    const result = runtime.cancelActiveTask();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("cancelled");
    expect(result.value.terminalState?.reason).toBe("cancelled");
    expect(result.value.intents.at(-1)?.intent).toBe("cancel");
    expect(result.value.events.at(-1)?.type).toBe("task.cancelled");
  });

  it("does not allow steering after a task has already reached a terminal state", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("cancel then try to steer");
    runtime.cancelActiveTask();
    const result = runtime.steerActiveTask("Try to resume after cancellation.");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "TASK_TERMINAL"
    });
  });

  it("stops an active task at max iterations with an explicit failed event payload", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("hit the iteration ceiling");
    const result = runtime.stopActiveTaskForMaxIterations();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("max-iterations");
    expect(result.value.terminalState?.reason).toBe("max-iterations");
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.failed",
      payload: { reason: "max-iterations" }
    });
  });

  it("marks an active task as failed on an unrecoverable error", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("surface an unrecoverable runtime error");
    const result = runtime.failActiveTask(
      "Provider call failed in a non-recoverable way."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("failed");
    expect(result.value.terminalState?.reason).toBe("unrecoverable-error");
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.failed",
      payload: { reason: "unrecoverable-error" }
    });
  });

  it("can explicitly wait for approval-required input through AgentRuntime", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("pause for approval");
    const result = runtime.waitForInput(
      "approval-required",
      "Approval is required before the next runtime step can continue."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("waiting-for-input");
    expect(result.value.waitingState).toMatchObject({
      reason: "approval-required"
    });
    expect(result.value.events.at(-1)).toMatchObject({
      type: "task.waiting",
      payload: { reason: "approval-required" }
    });
  });

  it("generates unique session, task, correlation, and event ids across runtime instances", () => {
    const firstRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    const secondRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    const first = firstRuntime.submitInteractiveTask("first task");
    const second = secondRuntime.submitInteractiveTask("second task");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.sessionId).not.toBe(second.value.sessionId);
    expect(first.value.taskId).not.toBe(second.value.taskId);
    expect(first.value.correlationId).not.toBe(second.value.correlationId);
    expect(first.value.events[0]?.eventId).not.toBe(
      second.value.events[0]?.eventId
    );
  });

  it("generates a runtime-owned final summary for a max-iterations boundary", () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });

    runtime.submitInteractiveTask("summarize a stopped task");
    const stopped = runtime.stopActiveTaskForMaxIterations(
      "Stopped before provider-driven tool execution was connected."
    );

    expect(stopped.ok).toBe(true);
    if (!stopped.ok) {
      return;
    }

    const summary = createFinalTaskSummary(stopped.value);

    expect(summary).toMatchObject({
      status: "max-iterations",
      result: "Stopped before provider-driven tool execution was connected.",
      provider: null,
      model: null,
      sessionId: stopped.value.sessionId,
      taskId: stopped.value.taskId,
      correlationId: stopped.value.correlationId
    });
    expect(summary.importantEvents.map((event) => event.type)).toEqual([
      "task.started",
      "task.waiting",
      "task.failed"
    ]);
    expect(summary.notAttempted).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Provider-driven tool execution"),
        expect.stringContaining("Validation")
      ])
    );
    expect(summary.unresolvedRisks).toEqual(
      expect.arrayContaining([expect.stringContaining("not verified")])
    );
  });

  it("loads durable memory into a later task context without auto-marking influence used", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const first = runtime.submitInteractiveTask(
        "remember validation command preference"
      );

      expect(first.ok).toBe(true);
      if (!first.ok) {
        return;
      }

      const recorded = runtime.recordMemoryCandidate({
        confidence: "high",
        content: "Use rtk run for Story 4.5 validation commands.",
        provenance: "test durable memory",
        sourceEventIds: [first.value.events[0]?.eventId ?? "evt_started"],
        type: "semantic"
      });

      expect(recorded.ok).toBe(true);
      if (!recorded.ok || recorded.value.entry === null) {
        return;
      }

      const second = runtime.submitInteractiveTask(
        "validate Story 4.5 with rtk run"
      );

      expect(second.ok).toBe(true);
      if (!second.ok) {
        return;
      }

      const memorySection = second.value.request.contextPacket.sections.find(
        (section) => section.source === "memory"
      );

      expect(memorySection).toMatchObject({
        metadata: expect.objectContaining({
          sourceIds: [recorded.value.entry.id],
          sourceTypes: ["memory_entry"]
        }),
        status: "included"
      });
      expect(memorySection?.content).toContain(
        `memory_entry:${recorded.value.entry.id}`
      );
      expect(
        second.value.events.filter(
          (event) => event.type === "memory.influence.recorded"
        )
      ).toHaveLength(0);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("records used, ignored, and contradicted memory influence states in history and summary", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask(
        "apply prior memory influence safely"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const used = runtime.recordMemoryInfluence({
        evidenceEventIds: [submitted.value.events[0]?.eventId ?? "evt_started"],
        influenceSummary:
          "Used prior command memory to select rtk validation.",
        preview: "Use rtk run for validation commands.",
        sourceEventIds: ["evt_memory_saved"],
        sourceId: "mem_rtk",
        sourceTaskId: "task_4_2",
        sourceType: "memory_entry",
        status: "used"
      });
      const ignored = runtime.recordMemoryInfluence({
        evidenceEventIds: [submitted.value.events[1]?.eventId ?? "evt_waiting"],
        preview: "Use npm directly for every validation command.",
        reason: "The current repository instruction requires rtk.",
        sourceEventIds: ["evt_old_memory"],
        sourceId: "mem_old",
        sourceTaskId: "task_old",
        sourceType: "memory_entry",
        status: "ignored"
      });
      const contradicted = runtime.recordMemoryInfluence({
        evidenceEventIds: [submitted.value.events[1]?.eventId ?? "evt_waiting"],
        preview: "Prior lesson said validation can be skipped.",
        reason: "Current story requires full targeted validation evidence.",
        sourceEventIds: ["evt_learning_review"],
        sourceId: "lesson_story_4_4",
        sourceSessionId: "ses_prior",
        sourceTaskId: "task_4_4",
        sourceType: "learning_review_lesson",
        status: "contradicted"
      });
      const procedural = runtime.recordMemoryInfluence({
        evidenceEventIds: [submitted.value.events[1]?.eventId ?? "evt_waiting"],
        influenceSummary:
          "Used the prior procedural validation workflow signal.",
        preview: "Validation workflow succeeded.",
        sourceEventIds: ["evt_learning_review_created"],
        sourceId: "procout_task_learning_skillsig_validation",
        sourceSessionId: "ses_prior",
        sourceTaskId: "task_learning",
        sourceType: "procedural_learning_output",
        status: "used"
      });

      expect(used.ok).toBe(true);
      expect(ignored.ok).toBe(true);
      expect(contradicted.ok).toBe(true);
      expect(procedural.ok).toBe(true);
      if (!used.ok || !ignored.ok || !contradicted.ok || !procedural.ok) {
        return;
      }

      const active = runtime.getActiveTask();

      expect(active.ok).toBe(true);
      if (!active.ok) {
        return;
      }

      const influenceEvents = active.value.events.filter(
        (event) => event.type === "memory.influence.recorded"
      );
      const finalSummary = createFinalTaskSummary(active.value);

      expect(influenceEvents.map((event) => event.payload.status)).toEqual([
        "used",
        "ignored",
        "contradicted",
        "used"
      ]);
      expect(finalSummary.memoryInfluences).toEqual([
        expect.objectContaining({
          sourceId: "mem_rtk",
          sourceType: "memory_entry",
          status: "used",
          summary: "Used prior command memory to select rtk validation."
        }),
        expect.objectContaining({
          reason: "The current repository instruction requires rtk.",
          sourceId: "mem_old",
          status: "ignored"
        }),
        expect.objectContaining({
          reason: "Current story requires full targeted validation evidence.",
          sourceId: "lesson_story_4_4",
          sourceType: "learning_review_lesson",
          status: "contradicted"
        }),
        expect.objectContaining({
          sourceId: "procout_task_learning_skillsig_validation",
          sourceType: "procedural_learning_output",
          status: "used",
          summary: "Used the prior procedural validation workflow signal."
        })
      ]);
      expect(finalSummary.importantEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: "Used prior command memory to select rtk validation.",
            type: "memory.influence.recorded"
          })
        ])
      );
      expect(JSON.stringify(finalSummary)).not.toContain("sk-test-secret");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("records skill usage states in history and final summary", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      mkdirSync(join(projectDir, ".sprite", "skills", "review"), {
        recursive: true
      });
      writeFileSync(
        join(projectDir, ".sprite", "skills", "review", "SKILL.md"),
        `---
name: project-review
description: Review code before committing.
---

Check regressions before committing.
`
      );

      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home"),
        skillReferences: ["project-review"]
      });
      const submitted = runtime.submitInteractiveTask(
        "apply skill influence safely"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const initialSkillEvents = submitted.value.events.filter(
        (event) =>
          event.type === "skill.invoked" ||
          event.type === "skill.usage.recorded"
      );
      const invokedEvent = submitted.value.events.find(
        (event) => event.type === "skill.invoked"
      );
      const waitingEvent = submitted.value.events.find(
        (event) => event.type === "task.waiting"
      );

      expect(initialSkillEvents.map((event) => event.type)).toEqual([
        "skill.invoked",
        "skill.usage.recorded"
      ]);
      expect(initialSkillEvents[1]).toMatchObject({
        payload: {
          name: "project-review",
          source: "project",
          status: "loaded",
          trigger: "loaded"
        }
      });
      expect(invokedEvent?.type).toBe("skill.invoked");
      expect(waitingEvent?.type).toBe("task.waiting");
      if (
        invokedEvent?.type !== "skill.invoked" ||
        waitingEvent?.type !== "task.waiting"
      ) {
        return;
      }

      const used = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        influenceSummary:
          "Used project-review to choose regression and validation checks.",
        invocationMode: "manual",
        name: "project-review",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "used",
        trigger: "influenced"
      });
      const ignored = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        invocationMode: "manual",
        name: "project-review",
        reason: "The current task did not need the full review checklist.",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "ignored",
        trigger: "suggested"
      });
      const contradicted = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        invocationMode: "manual",
        name: "project-review",
        reason:
          "The skill suggested adding a dependency, but project rules forbid new dependencies.",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "contradicted",
        trigger: "influenced"
      });
      const suggestedIgnored = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        invocationMode: "manual",
        name: "test-plan",
        reason: "The suggested skill was not loaded because no tests changed.",
        skillId: "skill_project_test_plan_skill_md",
        source: "project",
        sourceEventIds: [waitingEvent.eventId],
        status: "ignored",
        trigger: "suggested"
      });
      const missingEvidence = runtime.recordSkillUsage({
        evidenceEventIds: ["evt_missing"],
        influenceSummary: "This should fail because evidence is missing.",
        invocationMode: "manual",
        name: "project-review",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "used",
        trigger: "influenced"
      });
      const rawPathUsage = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        influenceSummary:
          "Used guidance loaded from /Users/chinnaphat/private/SKILL.md.",
        invocationMode: "manual",
        name: "project-review",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "used",
        trigger: "influenced"
      });
      const unboundedUsage = runtime.recordSkillUsage({
        evidenceEventIds: [waitingEvent.eventId],
        influenceSummary: "x".repeat(321),
        invocationMode: "manual",
        name: "project-review",
        skillId: invokedEvent.payload.skillId,
        source: "project",
        sourceEventIds: [invokedEvent.eventId],
        status: "used",
        trigger: "influenced"
      });

      expect(used.ok).toBe(true);
      expect(ignored.ok).toBe(true);
      expect(contradicted.ok).toBe(true);
      expect(suggestedIgnored.ok).toBe(true);
      expect(missingEvidence.ok).toBe(false);
      expect(rawPathUsage.ok).toBe(false);
      expect(unboundedUsage.ok).toBe(false);
      if (
        !used.ok ||
        !ignored.ok ||
        !contradicted.ok ||
        !suggestedIgnored.ok
      ) {
        return;
      }

      const active = runtime.getActiveTask();

      expect(active.ok).toBe(true);
      if (!active.ok) {
        return;
      }

      const usageEvents = active.value.events.filter(
        (event) => event.type === "skill.usage.recorded"
      );
      const finalSummary = createFinalTaskSummary(active.value);

      expect(usageEvents.map((event) => event.payload.status)).toEqual([
        "loaded",
        "used",
        "ignored",
        "contradicted",
        "ignored"
      ]);
      expect(finalSummary.skillInfluences).toEqual([
        expect.objectContaining({
          skillId: invokedEvent.payload.skillId,
          source: "project",
          status: "loaded"
        }),
        expect.objectContaining({
          name: "project-review",
          status: "used",
          summary:
            "Used project-review to choose regression and validation checks."
        }),
        expect.objectContaining({
          reason: "The current task did not need the full review checklist.",
          status: "ignored"
        }),
        expect.objectContaining({
          reason:
            "The skill suggested adding a dependency, but project rules forbid new dependencies.",
          status: "contradicted"
        }),
        expect.objectContaining({
          name: "test-plan",
          status: "ignored",
          trigger: "suggested"
        })
      ]);
      expect(finalSummary.importantEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary:
              "Used project-review to choose regression and validation checks.",
            type: "skill.usage.recorded"
          })
        ])
      );
      expect(JSON.stringify(finalSummary)).not.toContain(
        "Check regressions before committing."
      );
      expect(JSON.stringify(finalSummary)).not.toContain("/Users/");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not turn skill usage records into learning review skill signals", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      mkdirSync(join(projectDir, ".sprite", "skills", "review"), {
        recursive: true
      });
      writeFileSync(
        join(projectDir, ".sprite", "skills", "review", "SKILL.md"),
        `---
name: project-review
description: Review code before committing.
---

Check regressions before committing.
`
      );

      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home"),
        skillReferences: ["project-review"]
      });
      const submitted = runtime.submitInteractiveTask(
        "complete a task with only skill usage evidence"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const completed = runtime.completeActiveTask(
        "Completed without validation or tool evidence."
      );

      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }

      expect(completed.value.events.map((event) => event.type)).toContain(
        "skill.usage.recorded"
      );
      expect(
        completed.value.events.some(
          (event) => event.type === "learning.review.created"
        )
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("summarizes cancelled, completed, failed, and approval-required runtime boundaries", () => {
    const cancelledRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    cancelledRuntime.submitInteractiveTask("cancel summary");
    const cancelled = cancelledRuntime.cancelActiveTask("No longer needed.");

    const completedRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    completedRuntime.submitInteractiveTask("completed summary");
    const completed = completedRuntime.completeActiveTask(
      "Task reached a minimal completed state."
    );

    const failedRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    failedRuntime.submitInteractiveTask("failed summary");
    const failed = failedRuntime.failActiveTask("Provider failed permanently.");

    const approvalRuntime = new AgentRuntime({
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home"
    });
    approvalRuntime.submitInteractiveTask("approval summary");
    const approvalRequired = approvalRuntime.waitForInput(
      "approval-required",
      "Approval is required before continuing."
    );

    expect(cancelled.ok).toBe(true);
    expect(completed.ok).toBe(true);
    expect(failed.ok).toBe(true);
    expect(approvalRequired.ok).toBe(true);
    if (!cancelled.ok || !completed.ok || !failed.ok || !approvalRequired.ok) {
      return;
    }

    expect(createFinalTaskSummary(cancelled.value)).toMatchObject({
      status: "cancelled",
      result: "Task cancelled before provider-driven tool execution began.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({ type: "task.cancelled" })
      ])
    });
    expect(createFinalTaskSummary(completed.value)).toMatchObject({
      status: "completed",
      result: "Task reached a minimal completed state.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({ type: "task.completed" })
      ])
    });
    expect(createFinalTaskSummary(failed.value)).toMatchObject({
      status: "failed",
      result: "Provider failed permanently.",
      unresolvedRisks: expect.arrayContaining([
        expect.stringContaining("failed")
      ])
    });
    expect(createFinalTaskSummary(approvalRequired.value)).toMatchObject({
      status: "waiting-for-input",
      result: "Approval is required before continuing.",
      importantEvents: expect.arrayContaining([
        expect.objectContaining({
          type: "task.waiting",
          reason: "approval-required"
        })
      ]),
      unresolvedRisks: expect.arrayContaining([
        expect.stringContaining("approval")
      ])
    });
  });

  it("exposes the runtime final summary through one-shot print results", () => {
    const result = runOneShotPrintTask("summarize one-shot output", {
      cwd: "/tmp/sprite-project",
      homeDir: "/tmp/sprite-home",
      outputFormat: "json"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.finalSummary).toMatchObject({
      status: "max-iterations",
      result: expect.stringContaining("One-shot print mode stopped"),
      taskId: result.value.taskId,
      correlationId: result.value.correlationId
    });
  });

  it("exposes untrusted project-context records through bootstrap state", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      writeFileSync(join(projectDir, "AGENTS.md"), "Use rtk in this repo.\n");

      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const result = runtime.getBootstrapState();

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.projectContext.warning).toContain("untrusted");
      expect(result.value.projectContext.records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Use rtk"),
            fileName: "AGENTS.md",
            relativePath: "AGENTS.md",
            status: "loaded",
            trust: "untrusted"
          })
        ])
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("carries project-context records into one-shot print results", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      writeFileSync(
        join(projectDir, "CLAUDE.md"),
        "Repository guidance is advisory.\n"
      );

      const result = runOneShotPrintTask("summarize context", {
        cwd: projectDir,
        homeDir: join(rootDir, "home"),
        outputFormat: "json"
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.projectContext.records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Repository guidance"),
            fileName: "CLAUDE.md",
            status: "loaded",
            trust: "untrusted"
          })
        ])
      );
      expect(result.value.contextPacket.summary.sources).toEqual([
        "runtime-self-model",
        "working-memory",
        "provider-limits",
        "user-input",
        "session-state",
        "compacted-context",
        "project-context",
        "memory",
        "skills"
      ]);
      expect(
        result.value.contextPacket.sections.find(
          (section) => section.source === "project-context"
        )
      ).toMatchObject({
        status: "included",
        trust: "untrusted"
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("uses one bootstrap state when creating one-shot print results", () => {
    const originalGetBootstrapState = AgentRuntime.prototype.getBootstrapState;
    let bootstrapReadCount = 0;

    AgentRuntime.prototype.getBootstrapState = function getBootstrapStateSpy() {
      bootstrapReadCount += 1;
      return originalGetBootstrapState.call(this);
    };

    try {
      const result = runOneShotPrintTask("avoid stale bootstrap reads", {
        cwd: "/tmp/sprite-project",
        homeDir: "/tmp/sprite-home",
        outputFormat: "json"
      });

      expect(result.ok).toBe(true);
      expect(bootstrapReadCount).toBe(1);
    } finally {
      AgentRuntime.prototype.getBootstrapState = originalGetBootstrapState;
    }
  });

  it("includes grouped file activity in final summaries", async () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      writeFileSync(join(projectDir, "package.json"), "{}\n");

      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: "/tmp/sprite-home"
      });
      const submitted = runtime.submitInteractiveTask(
        "summarize file activity"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const readResult = await runtime.executeToolCall({
        input: { path: "package.json" },
        toolName: "read_file"
      });
      const commandResult = await runtime.executeToolCall({
        input: {
          command: "pwd",
          timeoutMs: 30_000
        },
        toolName: "run_command"
      });
      const proposed = runtime.recordFileActivity({
        kind: "proposed_change",
        paths: ["README.md"]
      });
      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md"]
      });

      expect(readResult.ok).toBe(true);
      expect(commandResult.ok).toBe(true);
      expect(proposed.ok).toBe(true);
      expect(changed.ok).toBe(true);

      const activeTask = runtime.getActiveTask();

      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }

      const summary = createFinalTaskSummary(activeTask.value);

      expect(summary.filesRead).toEqual(["package.json"]);
      expect(summary.filesProposedForChange).toEqual(["README.md"]);
      expect(summary.filesChanged).toEqual(["README.md"]);

      const workingMemorySection =
        activeTask.value.request.contextPacket.sections.find(
          (section) => section.source === "working-memory"
        );

      expect(workingMemorySection?.content).toContain("package.json");
      expect(workingMemorySection?.content).toContain("README.md");
      expect(workingMemorySection?.content).toContain("pwd");
      expect(workingMemorySection?.metadata).toMatchObject({
        commandCount: 1,
        fileCount: 2,
        sourceEventCountTotal: expect.any(Number)
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("creates a persisted learning review for completed non-trivial tasks", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask(
        "complete learning review task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md"]
      });

      expect(changed.ok).toBe(true);

      const completed = runtime.completeActiveTask(
        "Task completed with file evidence."
      );

      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }

      const learningEvent = completed.value.events.find(
        (event) => event.type === "learning.review.created"
      );

      expect(learningEvent).toBeDefined();
      expect(learningEvent?.payload).toMatchObject({
        status: "recorded",
        mode: "compact",
        factCount: expect.any(Number),
        testGapCount: expect.any(Number)
      });

      if (learningEvent?.type !== "learning.review.created") {
        return;
      }

      const artifactPath = join(projectDir, learningEvent.payload.artifactPath);

      expect(existsSync(artifactPath)).toBe(true);

      const review = JSON.parse(readFileSync(artifactPath, "utf8")) as {
        evidence: { filesChanged: string[] };
        facts: unknown[];
        sessionId: string;
        taskId: string;
        terminalStatus: string;
        testGaps: unknown[];
      };

      expect(review).toMatchObject({
        sessionId: completed.value.sessionId,
        taskId: completed.value.taskId,
        terminalStatus: "completed"
      });
      expect(review.evidence.filesChanged).toEqual(["README.md"]);
      expect(review.facts.length).toBeGreaterThan(0);
      expect(review.testGaps.length).toBeGreaterThan(0);
      expect(JSON.stringify(review)).not.toContain("rawOutput");
      expect(JSON.stringify(review)).not.toContain("stdout");
      expect(JSON.stringify(review)).not.toContain("stderr");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("stores skill-linked procedural outputs in completed-task learning reviews", async () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              check: "node -e \"process.stdout.write('ok')\""
            }
          },
          null,
          2
        )
      );
      mkdirSync(join(projectDir, ".sprite"), { recursive: true });
      writeFileSync(
        join(projectDir, ".sprite", "config.json"),
        JSON.stringify(
          {
            validation: {
              commands: [
                {
                  args: ["run", "check"],
                  command: "npm",
                  name: "check",
                  timeoutMs: 30_000
                }
              ]
            }
          },
          null,
          2
        )
      );

      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask(
        "complete procedural learning review task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const validation = await runtime.runConfiguredValidationCommands();
      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md"]
      });

      expect(validation.ok).toBe(true);
      expect(changed.ok).toBe(true);

      const completed = runtime.completeActiveTask(
        "Task completed with procedural validation evidence."
      );

      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }

      const learningEvent = completed.value.events.find(
        (event) => event.type === "learning.review.created"
      );

      expect(learningEvent?.payload).toMatchObject({
        proceduralOutputIds: expect.arrayContaining([
          expect.stringMatching(/^procout_/)
        ]),
        skillSignalIds: expect.arrayContaining([
          expect.stringMatching(/^skillsig_/)
        ]),
        status: "recorded"
      });

      if (learningEvent?.type !== "learning.review.created") {
        return;
      }

      const review = JSON.parse(
        readFileSync(join(projectDir, learningEvent.payload.artifactPath), "utf8")
      ) as {
        proceduralOutputs: Array<{
          knownRisks: string[];
          memoryType: string;
          promotionStatus: string;
          sourceTaskId: string;
          status: string;
        }>;
      };

      expect(review.proceduralOutputs).toEqual([
        expect.objectContaining({
          memoryType: "procedural",
          promotionStatus: "not_promoted",
          sourceTaskId: completed.value.taskId,
          status: "candidate"
        })
      ]);
      expect(review.proceduralOutputs[0]?.knownRisks.length).toBeGreaterThan(0);
      expect(existsSync(join(projectDir, ".sprite", "skills"))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("honors the configured full learning review mode at runtime", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home"),
        learningReviewMode: "full"
      });
      const submitted = runtime.submitInteractiveTask(
        "complete full learning review task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md", "packages/core/src/agent-runtime.ts"]
      });

      expect(changed.ok).toBe(true);

      const completed = runtime.completeActiveTask(
        "Task completed with full-mode learning review evidence."
      );

      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }

      const learningEvent = completed.value.events.find(
        (event) => event.type === "learning.review.created"
      );

      expect(learningEvent?.payload).toMatchObject({
        mode: "full",
        status: "recorded"
      });

      if (learningEvent?.type !== "learning.review.created") {
        return;
      }

      const artifactPath = join(projectDir, learningEvent.payload.artifactPath);
      const review = JSON.parse(readFileSync(artifactPath, "utf8")) as {
        mode: string;
        evidence: { filesChanged: string[] };
        facts: unknown[];
        lessons: unknown[];
        memoryCandidates: unknown[];
        missedAssumptions: unknown[];
        mistakes: unknown[];
        skillSignals: unknown[];
        testGaps: unknown[];
      };

      expect(review.mode).toBe("full");
      expect(review.evidence.filesChanged).toEqual([
        "packages/core/src/agent-runtime.ts",
        "README.md"
      ]);
      expect(review).toMatchObject({
        facts: expect.any(Array),
        lessons: expect.any(Array),
        memoryCandidates: expect.any(Array),
        missedAssumptions: expect.any(Array),
        mistakes: expect.any(Array),
        skillSignals: expect.any(Array),
        testGaps: expect.any(Array)
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not fabricate learning reviews for trivial completed tasks", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask("complete trivial task");

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const completed = runtime.completeActiveTask(
        "Task completed without additional evidence."
      );

      expect(completed.ok).toBe(true);
      if (!completed.ok) {
        return;
      }
      expect(
        completed.value.events.some(
          (event) => event.type === "learning.review.created"
        )
      ).toBe(false);
      expect(
        existsSync(
          join(
            projectDir,
            ".sprite",
            "sessions",
            completed.value.sessionId,
            "learning-reviews",
            `${completed.value.taskId}.json`
          )
        )
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not fabricate successful-task reviews for failed, cancelled, or max-iteration tasks", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      for (const scenario of [
        {
          goal: "cancel with evidence",
          finish: (runtime: AgentRuntime) =>
            runtime.cancelActiveTask("User cancelled the task.")
        },
        {
          goal: "fail with evidence",
          finish: (runtime: AgentRuntime) =>
            runtime.failActiveTask("Provider failed before completion.")
        },
        {
          goal: "max iterations with evidence",
          finish: (runtime: AgentRuntime) =>
            runtime.stopActiveTaskForMaxIterations(
              "Task stopped at max iterations before successful completion."
            )
        }
      ]) {
        const runtime = new AgentRuntime({
          cwd: projectDir,
          homeDir: join(rootDir, "home")
        });
        const submitted = runtime.submitInteractiveTask(scenario.goal);

        expect(submitted.ok).toBe(true);
        if (!submitted.ok) {
          return;
        }

        const changed = runtime.recordFileActivity({
          kind: "changed",
          paths: ["README.md"]
        });

        expect(changed.ok).toBe(true);

        const terminal = scenario.finish(runtime);

        expect(terminal.ok).toBe(true);
        if (!terminal.ok) {
          return;
        }

        expect(
          terminal.value.events.some(
            (event) => event.type === "learning.review.created"
          )
        ).toBe(false);
        expect(
          existsSync(
            join(
              projectDir,
              ".sprite",
              "sessions",
              terminal.value.sessionId,
              "learning-reviews",
              `${terminal.value.taskId}.json`
            )
          )
        ).toBe(false);
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("creates a user-triggered retrospective review for failed terminal tasks with retained context", async () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask(
        "trigger retrospective for failed task"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const command = await runtime.executeToolCall({
        input: {
          command: "pwd",
          timeoutMs: 30_000
        },
        toolName: "run_command"
      });
      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md"]
      });

      expect(command.ok).toBe(true);
      expect(changed.ok).toBe(true);

      const failed = runtime.failActiveTask(
        "Provider failed before recovery completed."
      );

      expect(failed.ok).toBe(true);
      if (!failed.ok) {
        return;
      }

      const retrospective = runtime.createRetrospectiveReview();

      expect(retrospective.ok).toBe(true);
      if (!retrospective.ok) {
        return;
      }
      expect(retrospective.value.status).toBe("created");
      if (retrospective.value.status !== "created") {
        return;
      }

      expect(retrospective.value.review).toMatchObject({
        sessionId: failed.value.sessionId,
        taskId: failed.value.taskId,
        terminalStatus: "failed",
        finalStatus: "failed"
      });
      expect(retrospective.value.event.type).toBe(
        "retrospective.review.created"
      );
      expect(existsSync(retrospective.value.artifactPath)).toBe(true);
      expect(readFileSync(retrospective.value.artifactPath, "utf8")).toContain(
        "Provider failed before recovery completed."
      );

      const activeTask = runtime.getActiveTask();

      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }
      expect(
        activeTask.value.events.some(
          (event) => event.type === "retrospective.review.created"
        )
      ).toBe(true);
      expect(
        activeTask.value.events.some(
          (event) => event.type === "learning.review.created"
        )
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("creates user-triggered retrospectives for completed and aborted task states", async () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      for (const scenario of [
        {
          expectedStatus: "completed",
          finish: (runtime: AgentRuntime) =>
            runtime.completeActiveTask(
              "Task completed with command and file evidence."
            ),
          goal: "completed retrospective task"
        },
        {
          expectedStatus: "cancelled",
          finish: (runtime: AgentRuntime) =>
            runtime.cancelActiveTask("User cancelled after command evidence."),
          goal: "cancelled retrospective task"
        },
        {
          expectedStatus: "max-iterations",
          finish: (runtime: AgentRuntime) =>
            runtime.stopActiveTaskForMaxIterations(
              "Task stopped at max iterations after command evidence."
            ),
          goal: "max iteration retrospective task"
        }
      ] as const) {
        const runtime = new AgentRuntime({
          cwd: projectDir,
          homeDir: join(rootDir, `home-${scenario.expectedStatus}`)
        });
        const submitted = runtime.submitInteractiveTask(scenario.goal);

        expect(submitted.ok).toBe(true);
        if (!submitted.ok) {
          return;
        }

        const command = await runtime.executeToolCall({
          input: {
            command: "pwd",
            timeoutMs: 30_000
          },
          toolName: "run_command"
        });
        const changed = runtime.recordFileActivity({
          kind: "changed",
          paths: [`${scenario.expectedStatus}.md`]
        });

        expect(command.ok).toBe(true);
        expect(changed.ok).toBe(true);

        const terminal = scenario.finish(runtime);

        expect(terminal.ok).toBe(true);
        if (!terminal.ok) {
          return;
        }

        const retrospective = runtime.createRetrospectiveReview();

        expect(retrospective.ok).toBe(true);
        if (!retrospective.ok) {
          return;
        }
        expect(retrospective.value.status).toBe("created");
        if (retrospective.value.status !== "created") {
          return;
        }
        expect(retrospective.value.review.terminalStatus).toBe(
          scenario.expectedStatus
        );
        expect(retrospective.value.review.finalStatus).toBe(
          scenario.expectedStatus
        );
        expect(retrospective.value.event.payload.terminalStatus).toBe(
          scenario.expectedStatus
        );
        expect(existsSync(retrospective.value.artifactPath)).toBe(true);
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns structured missing retrospective context without writing artifacts", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: join(rootDir, "home")
      });
      const submitted = runtime.submitInteractiveTask(
        "missing retrospective context"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const failed = runtime.failActiveTask(
        "Provider failed before recovery completed."
      );

      expect(failed.ok).toBe(true);
      if (!failed.ok) {
        return;
      }

      const retrospective = runtime.createRetrospectiveReview();

      expect(retrospective.ok).toBe(true);
      if (!retrospective.ok) {
        return;
      }
      expect(retrospective.value).toMatchObject({
        status: "missing-context",
        missingFields: ["filesTouched", "commandsRun"]
      });
      expect(
        existsSync(
          join(
            projectDir,
            ".sprite",
            "sessions",
            failed.value.sessionId,
            "retrospectives",
            `${failed.value.taskId}.json`
          )
        )
      ).toBe(false);
      expect(
        failed.value.events.some(
          (event) => event.type === "retrospective.review.created"
        )
      ).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("includes apply_patch changed files in final summaries", async () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const runtime = new AgentRuntime({
        cwd: projectDir,
        homeDir: "/tmp/sprite-home"
      });
      const submitted = runtime.submitInteractiveTask(
        "summarize patch activity"
      );

      expect(submitted.ok).toBe(true);
      if (!submitted.ok) {
        return;
      }

      const proposed = runtime.recordFileActivity({
        kind: "proposed_change",
        paths: ["README.md"]
      });
      const changed = runtime.recordFileActivity({
        kind: "changed",
        paths: ["README.md"]
      });

      expect(proposed.ok).toBe(true);
      expect(changed.ok).toBe(true);

      const activeTask = runtime.getActiveTask();

      expect(activeTask.ok).toBe(true);
      if (!activeTask.ok) {
        return;
      }

      const summary = createFinalTaskSummary(activeTask.value);

      expect(summary.filesProposedForChange).toEqual(["README.md"]);
      expect(summary.filesChanged).toEqual(["README.md"]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
