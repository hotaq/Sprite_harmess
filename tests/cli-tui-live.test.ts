import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
      runtime
        .getEventHistory(submitted.value.taskId)
        .map((event) => event.type)
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
});

function createRuntimeFixture(): {
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
