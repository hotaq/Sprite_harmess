import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime, createRuntimeEventRecord } from "@sprite/core";
import {
  createLocalSessionStore,
  type StoredLearningReviewArtifact
} from "@sprite/storage";
import {
  createTuiLiveWorkbenchState,
  createTuiStartupState,
  formatTuiFinalSummary,
  formatTuiLearningReview
} from "@sprite/tui";
import {
  createCurrentLiveTuiState,
  handleLiveTuiInteraction
} from "../packages/cli/src/index.js";

describe("live TUI CLI bridge", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("derives live state from runtime events and pending approvals", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask("inspect live TUI state");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await requestApproval(runtime, projectDir);

    const initial = createInitialState(runtime);
    const state = createCurrentLiveTuiState(
      runtime,
      initial,
      runtime.getEventHistory(submitted.value.taskId)
    );

    expect(state.messageStream.items.map((item) => item.eventType)).toContain(
      "approval.requested"
    );
    expect(state.workbench.mode).toBe("steer-task");
    expect(state.workbench.approvals).toHaveLength(1);
    expect(state.workbench.approvals[0]?.controlApprovalRequestId).toBe(
      runtime.getPendingApprovals()[0]?.approvalRequestId
    );
  });

  it("derives final summary and learning review views for terminal runtime state", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask(
      "complete live TUI state with outcomes"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const completed = runtime.completeActiveTask(
      "Live TUI terminal summary is ready."
    );

    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    const createdAt = "2026-05-13T16:00:00.000Z";
    const store = createLocalSessionStore();
    const ensured = store.ensureSession(
      submitted.value.sessionId,
      projectDir,
      createdAt
    );

    expect(ensured.ok).toBe(true);
    if (!ensured.ok) {
      return;
    }

    const written = store.writeLearningReview(
      submitted.value.sessionId,
      learningReviewArtifact(
        submitted.value.sessionId,
        submitted.value.taskId,
        createdAt,
        projectDir
      )
    );

    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }

    const learningEvent = createRuntimeEventRecord(
      {
        correlationId: submitted.value.correlationId,
        createdAt,
        eventId: "evt-learning-cli",
        sessionId: submitted.value.sessionId,
        taskId: submitted.value.taskId
      },
      "learning.review.created",
      {
        artifactPath: relative(projectDir, written.value.artifactPath),
        evidenceEventIds: ["evt-command", "evt-validation"],
        factCount: 1,
        lessonCount: 1,
        memoryCandidateIds: ["memcand_learning"],
        missedAssumptionCount: 1,
        mistakeCount: 1,
        mode: "compact",
        proceduralOutputIds: [],
        skillSignalIds: [],
        status: "recorded",
        summary: "Learning review recorded.",
        testGapCount: 1
      }
    );
    const initial = createInitialState(runtime);
    const state = createCurrentLiveTuiState(
      runtime,
      initial,
      [...runtime.getEventHistory(submitted.value.taskId), learningEvent]
    );

    expect(state.finalSummaryView?.status).toBe("completed");
    expect(formatTuiFinalSummary(state.finalSummaryView)).toContain(
      "Final summary · completed"
    );
    expect(state.learningReviewViews).toHaveLength(1);
    expect(formatTuiLearningReview(state.learningReviewViews[0])).toContain(
      "Learning review · recorded"
    );
    expect(formatTuiLearningReview(state.learningReviewViews[0])).toContain(
      "Renderer cards use typed events."
    );
  });

  it("dispatches exposed approval choices through the runtime approval path", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask("deny live TUI approval");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await requestApproval(runtime, projectDir);
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const result = await handleLiveTuiInteraction(runtime, {
      action: "deny",
      approvalRequestId: approval.approvalRequestId,
      type: "approval"
    });

    expect(result).toMatchObject({
      error: {
        code: "APPROVAL_DENIED"
      },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toEqual([]);
    expect(
      runtime.getEventHistory(submitted.value.taskId).map((event) => event.type)
    ).toContain("approval.resolved");
  });

  it("reports stale approval choices instead of silently ignoring them", async () => {
    const { runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const result = await handleLiveTuiInteraction(runtime, {
      action: "allow",
      approvalRequestId: "missing-approval",
      type: "approval"
    });

    expect(result).toMatchObject({
      error: {
        code: "TUI_APPROVAL_NOT_PENDING"
      },
      ok: false
    });
  });

  it("dispatches bounded command approval edits through modifiedRequest", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask(
      "edit live TUI command approval"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await requestApproval(runtime, projectDir);
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const result = await handleLiveTuiInteraction(runtime, {
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      editText: "pwd",
      type: "approval"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        intentType: "approval-response",
        status: "approval-recorded"
      }
    });
    expect(runtime.getPendingApprovals()).toEqual([]);
    expect(
      runtime
        .getEventHistory(submitted.value.taskId)
        .filter((event) => event.type === "policy.decision.recorded")
    ).toHaveLength(2);
  });

  it("rejects malformed command approval edit JSON instead of treating it as an executable", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask(
      "reject malformed live TUI command edit"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await requestApproval(runtime, projectDir);
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const result = await handleLiveTuiInteraction(runtime, {
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      editText: "{bad}",
      type: "approval"
    });

    expect(result).toMatchObject({
      error: {
        code: "TUI_APPROVAL_EDIT_JSON_INVALID"
      },
      ok: false
    });
    expect(runtime.getPendingApprovals()).toHaveLength(1);
  });

  it("dispatches bounded file approval edits through modifiedToolCall", async () => {
    const { projectDir, runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "package.json"), '{"name":"old"}\n');
    writeFileSync(
      join(projectDir, "src", "edit.ts"),
      "export const value = 1;\n"
    );
    const submitted = runtime.submitInteractiveTask(
      "edit live TUI file approval"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    await runtime.executeToolCall({
      input: {
        edits: [
          {
            path: "package.json",
            oldText: '"old"',
            newText: '"new"'
          }
        ]
      },
      toolName: "apply_patch"
    });
    const approval = runtime.getPendingApprovals()[0];

    expect(approval).toBeDefined();
    if (approval === undefined) {
      return;
    }

    const result = await handleLiveTuiInteraction(runtime, {
      action: "edit",
      approvalRequestId: approval.approvalRequestId,
      editText: JSON.stringify({
        edits: [
          {
            path: "src/edit.ts",
            oldText: "value = 1",
            newText: "value = 2"
          }
        ],
        summary: "Apply safer file edit."
      }),
      type: "approval"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        intentType: "approval-response",
        status: "approval-recorded"
      }
    });
    expect(runtime.getPendingApprovals()).toEqual([]);
  });

  it("dispatches runtime slash commands through safe CLI bridge results", async () => {
    const { runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);

    await expect(
      handleLiveTuiInteraction(runtime, {
        intent: {
          args: {},
          command: "model",
          raw: "/model",
          type: "runtime"
        },
        type: "slash-command"
      })
    ).resolves.toMatchObject({
      command: "model",
      status: "OK",
      subsystem: "provider"
    });

    await expect(
      handleLiveTuiInteraction(runtime, {
        intent: {
          args: {},
          command: "tools",
          raw: "/tools",
          type: "runtime"
        },
        type: "slash-command"
      })
    ).resolves.toMatchObject({
      command: "tools",
      items: expect.arrayContaining([
        expect.objectContaining({ value: "run_command" })
      ]),
      status: "OK",
      subsystem: "tools"
    });

    await expect(
      handleLiveTuiInteraction(runtime, {
        intent: {
          args: {},
          command: "compact",
          raw: "/compact",
          type: "runtime"
        },
        type: "slash-command"
      })
    ).resolves.toMatchObject({
      command: "compact",
      status: "MISSING_ARG",
      subsystem: "compaction"
    });
  });

  it("routes resume and visible-session compaction through runtime services", async () => {
    const { homeDir, projectDir, rootDir, runtime } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const submitted = runtime.submitInteractiveTask(
      "persist live slash session"
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const resumeRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir
    });

    await expect(
      handleLiveTuiInteraction(resumeRuntime, {
        intent: {
          args: {
            sessionId: submitted.value.sessionId
          },
          command: "resume",
          raw: `/resume ${submitted.value.sessionId}`,
          type: "runtime"
        },
        type: "slash-command"
      })
    ).resolves.toMatchObject({
      command: "resume",
      status: "OK",
      subsystem: "session"
    });

    const compactRuntime = new AgentRuntime({
      cwd: projectDir,
      homeDir
    });

    await expect(
      handleLiveTuiInteraction(compactRuntime, {
        intent: {
          args: {},
          command: "compact",
          raw: "/compact",
          type: "runtime"
        },
        type: "slash-command",
        visibleSessionId: submitted.value.sessionId
      })
    ).resolves.toMatchObject({
      command: "compact",
      status: "OK",
      subsystem: "compaction"
    });
  });

  it("keeps memory, skills, learning review, and unsupported slash results bounded", async () => {
    const { runtime, rootDir } = createRuntimeFixture();
    cleanupPaths.push(rootDir);

    for (const command of ["memory", "skills", "review-learning"] as const) {
      await expect(
        handleLiveTuiInteraction(runtime, {
          intent: {
            args: {},
            command,
            raw: `/${command}`,
            type: "runtime"
          },
          type: "slash-command"
        })
      ).resolves.toMatchObject({
        command,
        status: "OK"
      });
    }

    await expect(
      handleLiveTuiInteraction(runtime, {
        intent: {
          args: {},
          command: "new",
          raw: "/new",
          type: "runtime"
        },
        type: "slash-command"
      })
    ).resolves.toMatchObject({
      command: "new",
      status: "UNSUPPORTED",
      subsystem: "session"
    });
  });

  it("surfaces richer bounded learning review data through /review-learning", async () => {
    const { projectDir, rootDir, runtime } = createRuntimeFixture();
    cleanupPaths.push(rootDir);
    const store = createLocalSessionStore();
    const sessionId = "ses_learning";
    const taskId = "task_learning";
    const createdAt = "2026-05-13T16:00:00.000Z";
    const ensured = store.ensureSession(sessionId, projectDir, createdAt);

    expect(ensured.ok).toBe(true);
    if (!ensured.ok) {
      return;
    }

    const written = store.writeLearningReview(
      sessionId,
      learningReviewArtifact(sessionId, taskId, createdAt, projectDir)
    );

    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }

    const result = await handleLiveTuiInteraction(runtime, {
      intent: {
        args: {
          sessionId
        },
        command: "review-learning",
        raw: `/review-learning ${sessionId}`,
        type: "runtime"
      },
      type: "slash-command"
    });

    expect(result).toMatchObject({
      command: "review-learning",
      status: "OK",
      subsystem: "learning-review"
    });
    if (result === null || !("items" in result) || !("summary" in result)) {
      throw new Error("Expected review-learning result items.");
    }
    const slashResult = result as {
      items?: readonly { label: string; value: string }[];
      summary: string;
    };

    expect(slashResult.summary).toContain("1 learning review");
    expect(slashResult.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "facts",
          value: expect.stringContaining("Renderer cards use typed events")
        }),
        expect.objectContaining({
          label: "lessons",
          value: expect.stringContaining("Keep renderer file reads out")
        }),
        expect.objectContaining({
          label: "test gaps",
          value: expect.stringContaining("Add Ink regression")
        }),
        expect.objectContaining({
          label: "commands",
          value: expect.stringContaining("[REDACTED_PATH]")
        })
      ])
    );
    expect(JSON.stringify(result)).toContain("[REDACTED_PATH]");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(result)).not.toContain(projectDir);
   });
});

function createRuntimeFixture(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
  runtime: AgentRuntime;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-cli-tui-live-"));
  const projectDir = join(rootDir, "project");
  const homeDir = join(rootDir, "home");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  const runtime = new AgentRuntime({
    cwd: projectDir,
    homeDir
  });

  return {
    homeDir,
    projectDir,
    rootDir,
    runtime
  };
}

function createInitialState(runtime: AgentRuntime) {
  const bootstrapState = runtime.getBootstrapState();

  expect(bootstrapState.ok).toBe(true);
  if (!bootstrapState.ok) {
    throw bootstrapState.error;
  }

  return createTuiLiveWorkbenchState({
    runtimeState: createTuiStartupState({
      bootstrapState: bootstrapState.value
    })
  });
}

async function requestApproval(
  runtime: AgentRuntime,
  projectDir: string
): Promise<void> {
  const pending = await runtime.executeToolCall({
    input: {
      args: ["--version"],
      command: process.execPath,
      cwd: projectDir,
      timeoutMs: 30_000
    },
    toolName: "run_command"
  });

  expect(pending.ok).toBe(false);
  expect(runtime.getPendingApprovals()).toHaveLength(1);
}

function learningReviewArtifact(
  sessionId: string,
  taskId: string,
  createdAt: string,
  projectDir: string
): StoredLearningReviewArtifact {
  return {
    correlationId: "corr_learning",
    createdAt,
    evidence: {
      commandsRun: [
        {
          command: `npm test ${projectDir}`,
          eventId: "evt-command",
          status: "passed"
        }
      ],
      eventIds: ["evt-command", "evt-validation"],
      filesChanged: ["packages/tui/src/index.ts"],
      filesProposedForChange: [],
      filesRead: ["README.md"],
      taskId,
      userCorrections: [],
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
        evidenceEventIds: ["evt-command"],
        summary: "Renderer cards use typed events."
      }
    ],
    lessons: [
      {
        evidenceEventIds: ["evt-validation"],
        summary: "Keep renderer file reads out of React."
      }
    ],
    memoryCandidates: [
      {
        candidateId: "memcand_learning",
        eventId: "evt-memory",
        status: "recorded"
      }
    ],
    missedAssumptions: [
      {
        evidenceEventIds: ["evt-assumption"],
        summary: "Lesson metadata alone was too thin."
      }
    ],
    mistakes: [
      {
        evidenceEventIds: ["evt-mistake"],
        summary: "Almost parsed assistant prose."
      }
    ],
    mode: "compact",
    proceduralOutputs: [],
    schemaVersion: 1,
    sessionId,
    skillSignals: [],
    summary: "Captured bounded learning review details.",
    taskId,
    terminalStatus: "completed",
    testGaps: [
      {
        evidenceEventIds: ["evt-test-gap"],
        summary: "Add Ink regression coverage."
      }
    ]
  };
}
