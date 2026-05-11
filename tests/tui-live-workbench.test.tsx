import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import {
  createTuiInputDraft,
  createTuiApprovalResponseIntent,
  createTuiCommandPreview,
  createTuiLiveWorkbenchState,
  createTuiStartupState,
  createTuiWorkbenchView,
  reduceTuiLiveWorkbenchEvent,
  TuiWorkbenchApp,
  type TuiApprovalRequestSummary,
  type TuiLiveWorkbenchInteraction,
  type TuiRuntimeControlPort
} from "@sprite/tui";
import {
  createRuntimeEventRecord,
  type BootstrapState,
  type PlannedExecutionFlow,
  type RuntimeApprovalResponse,
  type RuntimeEventPayload,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "@sprite/core";

describe("live Ink TUI workbench", () => {
  it("renders runtime state, stream, input, approvals, and footer without leaking secrets", () => {
    const approval = approvalRequest({
      reason: "OPENAI_API_KEY=sk-secret requires approval",
      summary: "Apply risky patch with TOKEN=hidden"
    });
    const runtimeState = createTuiStartupState({
      bootstrapState: bootstrapState({
        cwd: "/tmp/OPENAI_API_KEY=sk-secret/project",
        warnings: ["TOKEN=hidden should be redacted"]
      })
    });
    const liveState = createTuiLiveWorkbenchState({
      events: [
        runtimeEvent("tool.call.completed", {
          cwd: "/tmp/sprite-live-tui",
          outputReference: {
            fullOutputStored: true,
            path: ".sprite/logs/tool-output.log",
            reason: "large output"
          },
          status: "completed",
          summary: "Tool completed with TOKEN=hidden",
          toolCallId: "tool-1",
          toolName: "run_command"
        })
      ],
      runtimeState,
      workbench: createTuiWorkbenchView({
        draft: createTuiInputDraft("line one\nOPENAI_API_KEY=sk-secret"),
        pendingApprovals: [approval]
      })
    });

    expect(liveState.runtimeState.events.count).toBe(1);

    const view = render(<TuiWorkbenchApp state={liveState} />);
    const frame = view.lastFrame() ?? "";

    expect(frame).toContain("Sprite Harness");
    expect(frame).toContain("live terminal");
    expect(frame).toContain("events 1");
    expect(frame).toContain(`${exitShortcutLabel()} exit`);
    expect(frame).toContain("Enter send");
    expect(frame).toContain("Shift+Enter/Ctrl+J newline");
    expect(frame).toContain("Esc cancel");
    expect(frame).not.toContain("details hidden");
    expect(frame).toContain("A approve · D deny · E edit · T timeout");
    expect(frame).not.toContain("[Runtime]");
    expect(frame).not.toContain("[Context]");
    expect(frame).not.toContain("[Activity]");
    expect(frame).not.toContain("[Approvals]");
    expect(frame).not.toContain("[Footer]");
    expect(frame).not.toContain("[PENDING] no runtime events yet");
    expect(frame).not.toContain("[PENDING] no approvals");
    expect(frame).not.toContain("actions:");
    expect(frame).not.toContain("Slash commands:");
    expect(frame).toContain("[REDACTED]");
    expect(frame).not.toContain("Cmd+D");
    expect(frame).not.toContain("sk-secret");
    expect(frame).not.toContain("TOKEN=hidden");
  });

  it("keeps diagnostics hidden until slash commands reveal or collapse them", async () => {
    const liveState = createTuiLiveWorkbenchState({
      runtimeState: createTuiStartupState({
        bootstrapState: bootstrapState({
          warnings: ["Project context guidance warning."]
        })
      }),
      workbench: createTuiWorkbenchView()
    });
    const interactions: TuiLiveWorkbenchInteraction[] = [];
    const view = render(
      <TuiWorkbenchApp
        onInteraction={(interaction) => interactions.push(interaction)}
        state={liveState}
      />
    );

    expect(view.lastFrame() ?? "").not.toContain("[Context]");
    expect(view.lastFrame() ?? "").not.toContain("[Runtime]");
    expect(view.lastFrame() ?? "").not.toContain("[PENDING] no runtime events yet");
    expect(view.lastFrame() ?? "").not.toContain("[PENDING] no approvals");
    expect(view.lastFrame() ?? "").not.toContain("details hidden");

    view.stdin.write("/");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("Command suggestions");
    expect(view.lastFrame() ?? "").toContain("/runtime");
    expect(view.lastFrame() ?? "").toContain("/context");
    expect(view.lastFrame() ?? "").toContain("/details");

    view.stdin.write("context");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("[Context]");
    expect(view.lastFrame() ?? "").toContain("warning: Project context guidance warning.");
    expect(interactions).toHaveLength(0);

    view.stdin.write("/hide");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").not.toContain("[Context]");
    expect(view.lastFrame() ?? "").not.toContain("details hidden");

    view.stdin.write("/runtime");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("[Runtime]");
    expect(view.lastFrame() ?? "").toContain("provider:");
    expect(interactions).toHaveLength(0);

    view.stdin.write("clear temporary panel");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").not.toContain("[Runtime]");
    expect(interactions).toHaveLength(1);

    view.stdin.write("/details");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("[Runtime]");
    expect(view.lastFrame() ?? "").toContain("[Context]");

    view.stdin.write("keep sticky details");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("[Runtime]");
    expect(view.lastFrame() ?? "").toContain("[Context]");
    expect(interactions).toHaveLength(2);
  });

  it("renders cancel interruption below the submitted prompt instead of inside the input box", async () => {
    const liveState = createTuiLiveWorkbenchState({
      runtimeState: createTuiStartupState({
        bootstrapState: bootstrapState({})
      }),
      workbench: createTuiWorkbenchView()
    });
    const interactions: TuiLiveWorkbenchInteraction[] = [];
    const view = render(
      <TuiWorkbenchApp
        onInteraction={(interaction) => interactions.push(interaction)}
        state={liveState}
      />
    );

    view.stdin.write("hello");
    view.stdin.write("\r");
    await waitForInkInput();
    view.stdin.write("\u001b");
    await waitForInkInput();

    const frame = view.lastFrame() ?? "";
    const submittedPromptIndex = frame.indexOf("hello");
    const interruptionIndex = frame.indexOf("Conversation interrupted");
    const inputIndex = frame.indexOf("Type a prompt…");

    expect(submittedPromptIndex).toBeGreaterThanOrEqual(0);
    expect(interruptionIndex).toBeGreaterThan(submittedPromptIndex);
    expect(inputIndex).toBeGreaterThan(interruptionIndex);
    expect(frame).toContain("warning: press Esc again to cancel · dismiss: N");
    expect(frame).not.toContain("Confirm action");
    expect(frame).not.toContain("Cancel active task?");
    expect(interactions).toHaveLength(1);
  });

  it("accepts multiline input and dispatches submit, cancel, approval, and exit interactions", async () => {
    const interactions: TuiLiveWorkbenchInteraction[] = [];
    const approval = approvalRequest({});
    const liveState = createTuiLiveWorkbenchState({
      runtimeState: createTuiStartupState({
        bootstrapState: bootstrapState({})
      }),
      workbench: createTuiWorkbenchView({
        pendingApprovals: [approval]
      })
    });
    const view = render(
      <TuiWorkbenchApp
        onInteraction={(interaction) => interactions.push(interaction)}
        state={liveState}
      />
    );

    view.stdin.write("first line");
    view.stdin.write("\u000a");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("first line");
    expect(view.lastFrame() ?? "").not.toContain("lines=2");
    expect(view.lastFrame() ?? "").not.toContain("↵");

    view.stdin.write("second line");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("first line");
    expect(view.lastFrame() ?? "").toContain("second line");
    expect(view.lastFrame() ?? "").toContain("Type a prompt…");
    expect(interactions).toHaveLength(1);

    view.stdin.write("\u001b");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("Conversation interrupted");
    expect(view.lastFrame() ?? "").not.toContain("Confirm action");
    expect(view.lastFrame() ?? "").not.toContain("Cancel active task?");
    expect(interactions).toHaveLength(1);

    view.stdin.write("\u001b");
    await waitForInkInput();
    view.stdin.write("a");
    await waitForInkInput();

    expect(view.lastFrame() ?? "").toContain("Send APPROVE for appr-live?");
    expect(interactions).toHaveLength(2);

    view.stdin.write("y");
    await waitForInkInput();
    view.stdin.write(exitShortcutInput());
    await waitForInkInput();

    expect(interactions).toEqual([
      {
        mode: "submit-task",
        text: "first line\nsecond line",
        type: "submit"
      },
      {
        type: "cancel"
      },
      {
        action: "allow",
        approvalRequestId: "appr-live",
        type: "approval"
      },
      {
        type: "exit"
      }
    ]);
  });

  it("echoes submitted prompts in the chat area without leaking secrets", async () => {
    const interactions: TuiLiveWorkbenchInteraction[] = [];
    const liveState = createTuiLiveWorkbenchState({
      runtimeState: createTuiStartupState({
        bootstrapState: bootstrapState({})
      }),
      workbench: createTuiWorkbenchView()
    });
    const view = render(
      <TuiWorkbenchApp
        onInteraction={(interaction) => interactions.push(interaction)}
        state={liveState}
      />
    );

    view.stdin.write("please use OPENAI_API_KEY=sk-secret");
    view.stdin.write("\r");
    await waitForInkInput();

    expect(interactions).toHaveLength(1);
    expect(view.lastFrame() ?? "").not.toContain("You");
    expect(view.lastFrame() ?? "").toContain("[REDACTED]");
    expect(view.lastFrame() ?? "").not.toContain("sk-secret");
    expect(view.lastFrame() ?? "").not.toContain("OPENAI_API_KEY");
  });

  it("labels command previews as static and non-interactive", () => {
    const preview = createTuiCommandPreview(
      createTuiLiveWorkbenchState({
        runtimeState: createTuiStartupState({
          bootstrapState: bootstrapState({})
        }),
        workbench: createTuiWorkbenchView()
      })
    );

    expect(preview).toContain("Sprite Harness TUI preview (static)");
    expect(preview).toContain("mode: static preview");
    expect(preview).toContain("not interactive");
    expect(preview).toContain("run `sprite tui` in a real TTY");
    expect(preview).toContain(`${exitShortcutLabel()} exit`);
    expect(preview).toContain("Enter send");
    expect(preview).toContain("Shift+Enter/Ctrl+J newline");
    expect(preview).toContain("Esc cancel");
    expect(preview).not.toContain("details hidden");
    expect(preview).toContain("/runtime · /context · /details");
    expect(preview).not.toContain("submit /runtime");
    expect(preview).not.toContain("[Runtime]");
    expect(preview).not.toContain("[Context]");
    expect(preview).not.toContain("[Activity]");
    expect(preview).not.toContain("[Approvals]");
    expect(preview).not.toContain("[Footer]");
    expect(preview).not.toContain("[PENDING] no runtime events yet");
    expect(preview).not.toContain("[PENDING] no approvals");
    expect(preview).not.toContain("Cmd+D");
    expect(preview).not.toContain("Esc/Ctrl+D/q");
    expect(preview).not.toContain("Ctrl+C opens cancel prompt");
  });

  it("reduces runtime events and dispatch results into display-only live state", async () => {
    const portCalls: string[] = [];
    const approvalResponses: RuntimeApprovalResponse[] = [];
    const port: TuiRuntimeControlPort = {
      cancelActiveTask(note) {
        portCalls.push(`cancel:${note ?? ""}`);
        return { ok: true, value: flow("cancelled") };
      },
      respondToApproval(response) {
        portCalls.push(`approval:${response.action}`);
        approvalResponses.push(response);
        return { ok: true, value: { recorded: true } };
      },
      steerActiveTask(note) {
        portCalls.push(`steer:${note}`);
        return { ok: true, value: flow("waiting-for-input") };
      },
      submitInteractiveTask(task) {
        portCalls.push(`submit:${task}`);
        return { ok: true, value: flow("waiting-for-input") };
      }
    };
    const initial = createTuiLiveWorkbenchState({
      runtimeState: createTuiStartupState({
        bootstrapState: bootstrapState({})
      }),
      workbench: createTuiWorkbenchView()
    });
    const next = await reduceTuiLiveWorkbenchEvent(initial, {
      event: runtimeEvent("task.waiting", {
        message: "Waiting for input.",
        reason: "steering-required"
      }),
      type: "runtime-event"
    });
    const submitted = await reduceTuiLiveWorkbenchEvent(
      next,
      {
        intent: {
          preview: { redacted: false, value: "hello" },
          text: "hello",
          type: "submit-task"
        },
        port,
        type: "dispatch-intent"
      }
    );

    expect(submitted.events).toHaveLength(1);
    expect(submitted.messageStream.totalCount).toBe(1);
    expect(submitted.workbench.input.text).toBe("");
    expect(submitted.latestDispatchResult).toMatchObject({
      intentType: "submit-task",
      status: "submitted"
    });

    const approvalIntent = createTuiApprovalResponseIntent(approvalRequest({}), {
      action: "edit",
      modifiedToolCall: {
        input: {
          edits: [{ newText: "new", oldText: "old", path: "README.md" }],
          summary: "Safe test edit."
        },
        toolName: "apply_patch"
      }
    });
    expect(approvalIntent.ok).toBe(true);
    if (!approvalIntent.ok) {
      return;
    }

    const approvalState = await reduceTuiLiveWorkbenchEvent(submitted, {
      intent: approvalIntent.value,
      port,
      type: "dispatch-intent"
    });

    expect(approvalState.latestDispatchResult).toMatchObject({
      intentType: "approval-response",
      status: "approval-recorded"
    });
    expect(approvalResponses[0]).toMatchObject({
      action: "edit",
      approvalRequestId: "appr-live",
      modifiedToolCall: {
        toolName: "apply_patch"
      }
    });
    expect(approvalResponses[0]).not.toHaveProperty("modifiedRequest");
    expect(portCalls).toEqual(["submit:hello", "approval:edit"]);
  });
});

async function waitForInkInput(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 25);
  });
}

function exitShortcutLabel(): string {
  return "Ctrl+D";
}

function exitShortcutInput(): string {
  return "\u0004";
}

function approvalRequest(
  input: Partial<TuiApprovalRequestSummary>
): TuiApprovalRequestSummary {
  return {
    allowedActions: ["allow", "deny", "edit"],
    approvalRequestId: "appr-live",
    reason: "Risky edit requires approval.",
    requestType: "file_edit",
    riskLevel: "high",
    summary: "Apply risky patch.",
    timeoutMs: 30_000,
    ...input
  };
}

function bootstrapState(input: {
  cwd?: string;
  warnings?: readonly string[];
}): BootstrapState {
  const cwd = input.cwd ?? "/tmp/sprite-live-tui";

  return {
    implemented: false,
    interfaces: ["cli"],
    message: "Bootstrap state loaded.",
    projectContext: {
      blockedCount: 0,
      cwd,
      loadedCount: 1,
      records: [
        {
          absolutePath: `${cwd}/AGENTS.md`,
          bytesRead: 120,
          content: "Project instructions",
          fileName: "AGENTS.md",
          preview: "Project instructions",
          priority: 1,
          redacted: false,
          relativePath: "AGENTS.md",
          status: "loaded",
          totalBytes: 120,
          truncated: false,
          trust: "untrusted"
        }
      ],
      skippedCount: 0,
      truncatedCount: 0,
      warning: "Project context is untrusted."
    },
    provider: {
      auth: {
        authenticated: true,
        secretRedacted: true,
        source: "environment"
      },
      baseUrl: null,
      capabilities: {
        contextWindowTokens: 128_000,
        modelIdentity: "gpt-test",
        supportsStreaming: true,
        supportsToolCalls: true
      },
      model: "gpt-test",
      providerName: "openai-compatible"
    },
    startup: {
      cwd,
      globalConfigLoaded: false,
      globalConfigPath: "/tmp/home/.sprite/config.json",
      model: "gpt-test",
      outputFormat: "text",
      projectConfigLoaded: false,
      projectConfigPath: `${cwd}/.sprite/config.json`,
      provider: "openai-compatible",
      safetyRules: [],
      sandboxMode: "workspace-write",
      validationCommands: [{ command: "npm test", name: "test" }],
      warnings: [...(input.warnings ?? [])]
    },
    warnings: [...(input.warnings ?? [])]
  };
}

function runtimeEvent<Type extends RuntimeEventType>(
  type: Type,
  payload: RuntimeEventPayload<Type>
): RuntimeEventRecord<Type> {
  return createRuntimeEventRecord(
    {
      createdAt: "2026-05-11T00:00:00.000Z",
      eventId: `evt-${type}`,
      correlationId: "corr-live",
      sessionId: "ses_live",
      taskId: "task_live"
    },
    type,
    payload
  );
}

function flow(status: "cancelled" | "waiting-for-input"): PlannedExecutionFlow {
  return {
    correlationId: "corr-live",
    currentPhase: "act",
    events: [],
    request: {
      contextPacket: {
        generatedAt: "2026-05-11T00:00:00.000Z",
        sections: [],
        tokenEstimate: 0
      },
      provider: null,
      startup: bootstrapState({}).startup,
      task: "test"
    },
    sessionId: "ses_live",
    status,
    taskId: "task_live",
    terminalState: null,
    warnings: [],
    waitingState: null
  } as unknown as PlannedExecutionFlow;
}
