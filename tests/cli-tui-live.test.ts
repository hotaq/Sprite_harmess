import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntime } from "@sprite/core";
import {
  createTuiLiveWorkbenchState,
  createTuiStartupState
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
