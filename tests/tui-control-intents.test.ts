import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  type PlannedExecutionFlow,
  type RuntimeApprovalResponse
} from "@sprite/core";
import {
  createTuiApprovalResponseIntent,
  createTuiCancelIntent,
  createTuiInputDraft,
  createTuiSubmitIntent,
  createTuiWorkbenchView,
  dispatchTuiUserIntent,
  formatTuiWorkbenchView,
  updateTuiInputDraft,
  type TuiApprovalRequestSummary,
  type TuiRuntimeControlPort
} from "@sprite/tui";

describe("TUI control intents", () => {
  it("preserves multiline drafts and dispatches submit or steering through a runtime port", async () => {
    const calls: string[] = [];
    const port: TuiRuntimeControlPort = {
      cancelActiveTask(note) {
        calls.push(`cancel:${note ?? ""}`);
        return { ok: true, value: flow("cancelled") };
      },
      respondToApproval(response) {
        calls.push(`approval:${response.action}`);
        return Promise.resolve({ ok: true, value: { status: "completed" } });
      },
      steerActiveTask(note) {
        calls.push(`steer:${note}`);
        return { ok: true, value: flow("waiting-for-input") };
      },
      submitInteractiveTask(task) {
        calls.push(`submit:${task}`);
        return { ok: true, value: flow("waiting-for-input") };
      }
    };
    const draft = updateTuiInputDraft(
      updateTuiInputDraft(createTuiInputDraft("first line"), { type: "newline" }),
      { text: "second line", type: "append" }
    );

    expect(draft.text).toBe("first line\nsecond line");
    expect(draft.lineCount).toBe(2);

    const submitIntent = createTuiSubmitIntent(draft, { mode: "submit-task" });
    expect(submitIntent.ok).toBe(true);
    if (!submitIntent.ok) {
      return;
    }

    const submitResult = await dispatchTuiUserIntent(port, submitIntent.value);
    expect(submitResult).toMatchObject({
      ok: true,
      value: {
        intentType: "submit-task",
        status: "submitted"
      }
    });

    const steerIntent = createTuiSubmitIntent(draft, { mode: "steer-task" });
    expect(steerIntent.ok).toBe(true);
    if (!steerIntent.ok) {
      return;
    }

    const steerResult = await dispatchTuiUserIntent(port, steerIntent.value);
    expect(steerResult).toMatchObject({
      ok: true,
      value: {
        intentType: "steer-task",
        status: "steered"
      }
    });
    expect(calls).toEqual([
      "submit:first line\nsecond line",
      "steer:first line\nsecond line"
    ]);
  });

  it("records steering and cancellation through a real AgentRuntime fixture", async () => {
    const runtime = new AgentRuntime({
      cwd: "/tmp/sprite-tui-project",
      homeDir: "/tmp/sprite-tui-home"
    });
    const submitted = runtime.submitInteractiveTask("start from TUI");

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) {
      return;
    }

    const steerIntent = createTuiSubmitIntent(
      createTuiInputDraft("line one\nline two"),
      { mode: "steer-task" }
    );
    expect(steerIntent.ok).toBe(true);
    if (!steerIntent.ok) {
      return;
    }

    const steered = await dispatchTuiUserIntent(runtime, steerIntent.value);
    expect(steered).toMatchObject({
      ok: true,
      value: {
        intentType: "steer-task",
        status: "steered"
      }
    });
    expect(
      runtime.getEventHistory(submitted.value.taskId).map((event) => event.type)
    ).toContain("task.steering.received");

    const cancelled = await dispatchTuiUserIntent(
      runtime,
      createTuiCancelIntent("Stop from the TUI.")
    );

    expect(cancelled).toMatchObject({
      ok: true,
      value: {
        intentType: "cancel-task",
        status: "cancelled"
      }
    });
    expect(runtime.getActiveTask()).toMatchObject({
      ok: true,
      value: {
        status: "cancelled"
      }
    });
  });

  it("creates and dispatches approval responses without mixing command modifiedRequest and file-edit modifiedToolCall", async () => {
    const commandApproval = approvalRequest({
      approvalRequestId: "appr-command",
      requestType: "command"
    });
    const allowIntent = createTuiApprovalResponseIntent(commandApproval, {
      action: "allow"
    });
    const denyIntent = createTuiApprovalResponseIntent(commandApproval, {
      action: "deny",
      reason: "Not safe enough."
    });
    const timeoutIntent = createTuiApprovalResponseIntent(commandApproval, {
      action: "timeout"
    });
    const commandIntent = createTuiApprovalResponseIntent(commandApproval, {
      action: "edit",
      modifiedRequest: {
        command: "npm",
        args: ["test"],
        cwd: "/repo",
        timeoutMs: 30_000,
        type: "command"
      }
    });

    expect(allowIntent).toMatchObject({
      ok: true,
      value: {
        response: {
          action: "allow",
          approvalRequestId: "appr-command"
        },
        type: "approval-response"
      }
    });
    expect(denyIntent).toMatchObject({
      ok: true,
      value: {
        response: {
          action: "deny",
          approvalRequestId: "appr-command",
          reason: "Not safe enough."
        },
        type: "approval-response"
      }
    });
    expect(timeoutIntent).toMatchObject({
      ok: true,
      value: {
        response: {
          action: "timeout",
          approvalRequestId: "appr-command"
        },
        type: "approval-response"
      }
    });
    if (!timeoutIntent.ok) {
      return;
    }

    const approvalCalls: RuntimeApprovalResponse[] = [];
    const dispatched = await dispatchTuiUserIntent(
      {
        cancelActiveTask: () => ({ ok: true, value: flow("cancelled") }),
        respondToApproval: (response) => {
          approvalCalls.push(response);
          return { ok: true, value: { recorded: true } };
        },
        steerActiveTask: () => ({ ok: true, value: flow("waiting-for-input") }),
        submitInteractiveTask: () => ({
          ok: true,
          value: flow("waiting-for-input")
        })
      },
      timeoutIntent.value
    );

    expect(dispatched).toMatchObject({
      ok: true,
      value: {
        intentType: "approval-response",
        status: "approval-recorded"
      }
    });
    expect(approvalCalls).toEqual([
      {
        action: "timeout",
        approvalRequestId: "appr-command"
      }
    ]);
    expect(commandIntent.ok).toBe(true);
    if (!commandIntent.ok || commandIntent.value.type !== "approval-response") {
      return;
    }

    expect(commandIntent.value.response).toMatchObject({
      action: "edit",
      approvalRequestId: "appr-command",
      modifiedRequest: {
        command: "npm",
        type: "command"
      }
    });
    expect("modifiedToolCall" in commandIntent.value.response).toBe(false);

    const fileApproval = approvalRequest({
      approvalRequestId: "appr-file",
      requestType: "file_edit"
    });
    const fileIntent = createTuiApprovalResponseIntent(fileApproval, {
      action: "edit",
      modifiedToolCall: {
        input: {
          edits: [
            {
              newText: "new",
              oldText: "old",
              path: "README.md"
            }
          ],
          summary: "Update README."
        },
        toolName: "apply_patch"
      }
    });

    expect(fileIntent.ok).toBe(true);
    if (!fileIntent.ok || fileIntent.value.type !== "approval-response") {
      return;
    }

    expect(fileIntent.value.response).toMatchObject({
      action: "edit",
      approvalRequestId: "appr-file",
      modifiedToolCall: {
        toolName: "apply_patch"
      }
    });
    expect("modifiedRequest" in fileIntent.value.response).toBe(false);

    const invalidFileIntent = createTuiApprovalResponseIntent(fileApproval, {
      action: "edit",
      modifiedRequest: {
        command: "npm",
        cwd: "/repo",
        type: "command"
      }
    } as never);

    expect(invalidFileIntent).toMatchObject({
      ok: false,
      error: {
        code: "TUI_APPROVAL_EDIT_SHAPE_INVALID"
      }
    });
  });

  it("formats a safe prompt view without leaking secrets or control clutter", () => {
    const view = createTuiWorkbenchView({
      draft: createTuiInputDraft("OPENAI_API_KEY=sk-secret\nplease continue"),
      mode: "steer-task",
      pendingApprovals: [
        approvalRequest({
          approvalRequestId: "appr-secret",
          reason: "TOKEN=secret requires approval.",
          requestType: "file_edit",
          riskLevel: "high"
        })
      ]
    });
    const formatted = formatTuiWorkbenchView(view);

    expect(formatted).toContain("Prompt");
    expect(formatted).not.toContain("actions:");
    expect(formatted).not.toContain("[STEER]");
    expect(formatted).not.toContain("[CANCEL]");
    expect(formatted).toContain("[REDACTED]");
    expect(formatted).not.toContain("sk-secret");
    expect(formatted).not.toContain("TOKEN=secret");
  });
});

function approvalRequest(
  input: Partial<TuiApprovalRequestSummary>
): TuiApprovalRequestSummary {
  return {
    allowedActions: ["allow", "deny", "edit"],
    approvalRequestId: input.approvalRequestId ?? "appr-test",
    reason: input.reason ?? "Risky action requires approval.",
    requestType: input.requestType ?? "command",
    riskLevel: input.riskLevel ?? "medium",
    summary: input.summary ?? "Approval requested.",
    timeoutMs: input.timeoutMs ?? 30_000,
    ...(input.affectedFiles === undefined
      ? {}
      : { affectedFiles: input.affectedFiles }),
    ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId })
  };
}

function flow(status: PlannedExecutionFlow["status"]): PlannedExecutionFlow {
  return {
    currentPhase: "act",
    events: [],
    status
  } as unknown as PlannedExecutionFlow;
}
