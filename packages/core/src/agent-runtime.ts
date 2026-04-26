import {
  resolveSpriteRuntimeConfig,
  toStartupConfig,
  type ConfigLoaderOptions,
  type ResolvedStartupConfig,
  type SpriteOutputFormat,
  type SpriteValidationCommand
} from "@sprite/config";
import {
  initializeProviderAdapter,
  type ProviderRuntimeOverride,
  type ResolvedProviderState
} from "@sprite/providers";
import {
  classifyPolicyRequest as classifySandboxPolicyRequest,
  summarizePolicyRequestForEvent,
  type ApprovalAction,
  type ApprovalRequest,
  type ApprovalResponse,
  type CommandPolicyRequest,
  type FileEditPolicyRequest,
  type PolicyDecision,
  type PolicyEventMetadata,
  type PolicyRequest
} from "@sprite/sandbox";
import { SpriteError, err, ok, type Result } from "@sprite/shared";
import {
  createToolRegistry,
  getRunCommandErrorMetadata,
  type RunCommandFailureMetadata,
  type ToolExecutionResult,
  type ToolInputMap,
  type ToolName
} from "@sprite/tools";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  containsSecretLikeValue,
  deriveFileActivityDrafts,
  findForbiddenFileActivityField,
  validateFileActivityPath,
  type FileActivityKind,
  type FileActivityRecord
} from "./file-activity.js";
import {
  createFinalTaskSummary,
  type FinalTaskSummary
} from "./final-task-summary.js";
import {
  createRuntimeEventRecord,
  RuntimeEventBus,
  type RuntimeEventListener,
  type RuntimeEventPayload,
  type RuntimeEventRecord
} from "./runtime-events.js";
import {
  applyTaskSteering,
  cancelTask,
  completeTask,
  createTaskRequest,
  failTask,
  runInitialPlanActObserveLoop,
  stopTaskForMaxIterations,
  waitForTaskInput
} from "./runtime-loop.js";
import type { PlannedExecutionFlow } from "./task-state.js";

export interface BootstrapState {
  implemented: false;
  message: string;
  interfaces: string[];
  startup: ResolvedStartupConfig;
  provider: ResolvedProviderState | null;
  warnings: string[];
}

export interface RuntimeStartupOptions extends ConfigLoaderOptions {
  env?: NodeJS.ProcessEnv;
  providerOverride?: ProviderRuntimeOverride;
}

export type OneShotPrintOutputFormat = SpriteOutputFormat;

export interface OneShotPrintTaskOptions extends RuntimeStartupOptions {
  outputFormat?: OneShotPrintOutputFormat;
  onEvent?: RuntimeEventListener;
}

export interface OneShotPrintTaskResult {
  task: string;
  outputFormat: OneShotPrintOutputFormat;
  status: PlannedExecutionFlow["status"];
  summary: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  provider: ResolvedProviderState | null;
  model: string | null;
  waitingState: PlannedExecutionFlow["waitingState"];
  terminalState: PlannedExecutionFlow["terminalState"];
  finalSummary: FinalTaskSummary;
  warnings: string[];
  events: RuntimeEventRecord[];
}

export type RuntimeToolCallRequest = {
  [Name in ToolName]: {
    input: ToolInputMap[Name];
    toolName: Name;
  };
}[ToolName];

export interface RuntimeFileActivityRequest {
  kind: Extract<FileActivityKind, "changed" | "proposed_change">;
  paths: string[];
  summary?: string;
  toolCallId?: string;
}

interface RuntimeFileEditMetadata {
  affectedFiles: string[];
  editId: string;
}

interface RuntimeCommandPolicyOptions {
  configuredValidation?: boolean;
}

export type RuntimeApprovalResponse =
  | Exclude<ApprovalResponse, { action: "edit" }>
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedRequest: CommandPolicyRequest;
      modifiedToolCall?: never;
      reason?: string;
    }
  | {
      action: "edit";
      approvalRequestId: string;
      modifiedRequest?: never;
      modifiedToolCall: Extract<
        RuntimeToolCallRequest,
        { toolName: "apply_patch" }
      >;
      reason?: string;
    };

export type RuntimeValidationCommandStatus = "blocked" | "failed" | "passed";
export type RuntimeValidationRunStatus =
  | RuntimeValidationCommandStatus
  | "skipped";

export interface RuntimeValidationCommandResult {
  command: string;
  cwd: string;
  durationMs?: number;
  errorCode?: string;
  exitCode?: number | null;
  message?: string;
  name?: string;
  outputReference?: RuntimeEventPayload<"validation.completed">["outputReference"];
  status: RuntimeValidationCommandStatus;
  timeoutMs?: number;
  toolCallId: string;
  validationId: string;
}

export interface RuntimeValidationRunSummary {
  reason?: string;
  results: RuntimeValidationCommandResult[];
  status: RuntimeValidationRunStatus;
}

export type RuntimeRecoveryTrigger =
  RuntimeEventPayload<"task.recovery.recorded">["trigger"];
export type RuntimeRecoveryDecision =
  RuntimeEventPayload<"task.recovery.recorded">["decision"];

export interface RuntimeRecoveryActionRequest {
  decision: RuntimeRecoveryDecision;
  errorCode?: string;
  message?: string;
  nextAction: string;
  ruleId?: string;
  sourceEventId?: string;
  summary: string;
  toolCallId?: string;
  trigger: RuntimeRecoveryTrigger;
  validationId?: string;
}

interface PendingApprovalRecord {
  approvalRequest: ApprovalRequest;
  policyRequest: PolicyRequest;
  toolCallId: string;
  toolCallRequest: RuntimeToolCallRequest;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 30_000;

export class AgentRuntime {
  private readonly sessionId = `session_${randomUUID()}`;
  private readonly eventBus = new RuntimeEventBus();
  private readonly emittedEventIds = new Set<string>();
  private readonly pendingApprovals = new Map<string, PendingApprovalRecord>();
  private readonly toolRegistry = createToolRegistry();
  private activeTask: PlannedExecutionFlow | null = null;

  constructor(private readonly options: RuntimeStartupOptions = {}) {}

  getBootstrapState(): Result<BootstrapState> {
    const runtimeConfig = resolveSpriteRuntimeConfig(this.options);
    const startup = toStartupConfig(runtimeConfig);
    const provider = initializeProviderAdapter(runtimeConfig, {
      env: this.options.env,
      homeDir: this.options.homeDir,
      override: this.options.providerOverride
    });
    const warnings = [...startup.warnings, ...provider.warnings];

    return ok({
      implemented: false,
      message:
        "Sprite Harness bootstrap workspace is ready. Interactive task planning is available through the shared runtime.",
      interfaces: ["cli"],
      startup,
      provider: provider.adapter?.getState() ?? null,
      warnings
    });
  }

  submitInteractiveTask(task: string): Result<PlannedExecutionFlow> {
    const bootstrapState = this.getBootstrapState();

    if (!bootstrapState.ok) {
      return bootstrapState;
    }

    this.pendingApprovals.clear();

    const request = createTaskRequest(task, bootstrapState.value);
    const taskId = this.nextId("task");
    const correlationId = this.nextId("corr");
    const createdAt = this.now();
    const taskState = runInitialPlanActObserveLoop(
      request,
      {
        sessionId: this.sessionId,
        taskId,
        correlationId
      },
      createdAt,
      this.nextEventId(),
      this.nextEventId(),
      [
        ...bootstrapState.value.warnings,
        "Interactive task planning is available; repository inspection tools are available through runtime/package APIs, while provider-driven tool use starts in later stories."
      ]
    );
    return this.setActiveTask(taskState);
  }

  getActiveTask(): Result<PlannedExecutionFlow> {
    if (this.activeTask === null) {
      return err(new Error("No active task is available."));
    }

    return ok(this.activeTask);
  }

  subscribeToEvents(listener: RuntimeEventListener): () => void {
    return this.eventBus.subscribe(listener);
  }

  getEventHistory(taskId?: string): RuntimeEventRecord[] {
    return this.eventBus.getHistory(taskId);
  }

  getPendingApprovals(taskId?: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(
        (record) =>
          taskId === undefined || record.approvalRequest.taskId === taskId
      )
      .map((record) => cloneApprovalRequest(record.approvalRequest));
  }

  cancelActiveTask(
    note = "User cancelled the active task."
  ): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      cancelTask(activeTask.value, note, {
        sessionId: activeTask.value.sessionId,
        taskId: activeTask.value.taskId,
        correlationId: activeTask.value.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      })
    );
  }

  steerActiveTask(note: string): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      applyTaskSteering(
        activeTask.value,
        note,
        {
          sessionId: activeTask.value.sessionId,
          taskId: activeTask.value.taskId,
          correlationId: activeTask.value.correlationId,
          eventId: this.nextEventId(),
          createdAt: this.now()
        },
        {
          sessionId: activeTask.value.sessionId,
          taskId: activeTask.value.taskId,
          correlationId: activeTask.value.correlationId,
          eventId: this.nextEventId(),
          createdAt: this.now()
        }
      )
    );
  }

  waitForInput(
    reason: "approval-required" | "user-input-required",
    message: string
  ): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      waitForTaskInput(activeTask.value, reason, message, {
        sessionId: activeTask.value.sessionId,
        taskId: activeTask.value.taskId,
        correlationId: activeTask.value.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      })
    );
  }

  completeActiveTask(
    message = "Task reached a completed terminal state."
  ): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      completeTask(activeTask.value, message, {
        sessionId: activeTask.value.sessionId,
        taskId: activeTask.value.taskId,
        correlationId: activeTask.value.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      })
    );
  }

  stopActiveTaskForMaxIterations(
    message = "Task stopped after reaching the configured iteration limit."
  ): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      stopTaskForMaxIterations(activeTask.value, message, {
        sessionId: activeTask.value.sessionId,
        taskId: activeTask.value.taskId,
        correlationId: activeTask.value.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      })
    );
  }

  failActiveTask(
    message = "Task stopped because the runtime encountered an unrecoverable error."
  ): Result<PlannedExecutionFlow> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    return this.setActiveTask(
      failTask(activeTask.value, message, {
        sessionId: activeTask.value.sessionId,
        taskId: activeTask.value.taskId,
        correlationId: activeTask.value.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      })
    );
  }

  async executeToolCall(
    request: RuntimeToolCallRequest
  ): Promise<Result<ToolExecutionResult>> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    if (activeTask.value.waitingState?.reason === "approval-required") {
      return err(
        new SpriteError(
          "APPROVAL_PENDING",
          "Resolve the pending approval before executing another tool call."
        )
      );
    }

    const toolCallId = this.nextId("tool_call");
    return this.executeToolCallWithId(activeTask.value, request, toolCallId);
  }

  async runConfiguredValidationCommands(): Promise<
    Result<RuntimeValidationRunSummary>
  > {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    if (activeTask.value.waitingState?.reason === "approval-required") {
      return err(
        new SpriteError(
          "APPROVAL_PENDING",
          "Resolve the pending approval before running validation commands."
        )
      );
    }

    const validationCommands =
      activeTask.value.request.startup.validationCommands;

    if (validationCommands.length === 0) {
      const validationId = this.nextId("validation");
      const skippedEvent = this.createValidationCompletedEvent(
        activeTask.value,
        {
          message: "No configured validation command was available.",
          status: "skipped",
          summary: "Validation skipped: no configured command was available.",
          validationId
        }
      );
      const emitted = this.emitNewEvents([skippedEvent]);

      if (!emitted.ok) {
        return err(emitted.error);
      }

      this.refreshActiveTaskEvents(activeTask.value.taskId);
      return ok({
        reason: "No configured validation command was available.",
        results: [],
        status: "skipped"
      });
    }

    const results: RuntimeValidationCommandResult[] = [];

    for (const command of validationCommands) {
      const validationId = this.nextId("validation");
      const toolCallId = this.nextId("tool_call");
      const request = this.createValidationToolCall(activeTask.value, command);
      const startedEvent = this.createValidationStartedEvent(
        activeTask.value,
        command,
        request,
        validationId,
        toolCallId
      );
      const started = this.emitNewEvents([startedEvent]);

      if (!started.ok) {
        return err(started.error);
      }

      const result = await this.executeToolCallWithId(
        activeTask.value,
        request,
        toolCallId,
        { configuredValidation: true }
      );
      const commandResult = this.createValidationCommandResult(
        command,
        request,
        result,
        validationId,
        toolCallId
      );
      const latestTask = this.getMutableActiveTask();
      const eventTask = latestTask.ok ? latestTask.value : activeTask.value;
      const completedEvent = this.createValidationCompletedEvent(
        eventTask,
        commandResult
      );
      const completed = this.emitNewEvents([completedEvent]);

      if (!completed.ok) {
        return err(completed.error);
      }

      this.refreshActiveTaskEvents(eventTask.taskId);
      results.push(commandResult);

      if (commandResult.status !== "passed") {
        return ok({
          results,
          status: commandResult.status
        });
      }
    }

    return ok({
      results,
      status: "passed"
    });
  }

  recordRecoveryAction(
    request: RuntimeRecoveryActionRequest
  ): Result<RuntimeEventRecord<"task.recovery.recorded">> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    const recoveryEvent = this.createRecoveryRecordedEvent(
      activeTask.value,
      request
    );
    const recoveryEvents: RuntimeEventRecord[] = [recoveryEvent];

    if (request.decision === "ask_user") {
      recoveryEvents.push(
        this.createTaskWaitingEvent(
          activeTask.value,
          "user-input-required",
          request.nextAction
        )
      );
    }

    const emitted = this.emitNewEvents(recoveryEvents);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    const events = this.eventBus.getHistory(activeTask.value.taskId);
    this.activeTask = {
      ...activeTask.value,
      status:
        request.decision === "ask_user"
          ? "waiting-for-input"
          : activeTask.value.status,
      summary:
        request.decision === "ask_user" ? request.nextAction : request.summary,
      waitingState:
        request.decision === "ask_user"
          ? {
              reason: "user-input-required",
              message: request.nextAction
            }
          : activeTask.value.waitingState,
      terminalState:
        request.decision === "ask_user" ? null : activeTask.value.terminalState,
      events
    };

    return ok(recoveryEvent);
  }

  private executeToolCallWithId(
    task: PlannedExecutionFlow,
    request: RuntimeToolCallRequest,
    toolCallId: string,
    options: RuntimeCommandPolicyOptions = {}
  ): Promise<Result<ToolExecutionResult>> {
    const policyCheckedRequest = this.preparePolicyCheckedToolCall(
      task,
      request,
      toolCallId,
      options
    );

    if (!policyCheckedRequest.ok) {
      return Promise.resolve(err(policyCheckedRequest.error));
    }

    return this.executeApprovedToolCall(
      task,
      policyCheckedRequest.value,
      toolCallId
    );
  }

  async respondToApproval(
    response: RuntimeApprovalResponse
  ): Promise<Result<ToolExecutionResult>> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    const pending = this.pendingApprovals.get(response.approvalRequestId);

    if (pending === undefined) {
      return err(
        new SpriteError(
          "APPROVAL_NOT_FOUND",
          "No pending approval exists for the provided approvalRequestId."
        )
      );
    }

    if (pending.approvalRequest.taskId !== activeTask.value.taskId) {
      return err(
        new SpriteError(
          "APPROVAL_SCOPE_MISMATCH",
          "Approval response does not belong to the active task."
        )
      );
    }

    const actionValidation = this.validateApprovalResponseAction(
      pending.approvalRequest,
      response
    );

    if (!actionValidation.ok) {
      return err(actionValidation.error);
    }

    const editValidation = this.validateEditedApprovalResponse(
      pending.approvalRequest,
      response
    );

    if (!editValidation.ok) {
      return err(editValidation.error);
    }

    const resolvedEvent = this.createApprovalResolvedEvent(
      activeTask.value,
      pending.approvalRequest,
      response
    );
    const emitted = this.emitNewEvents([resolvedEvent]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.pendingApprovals.delete(response.approvalRequestId);
    this.activeTask = {
      ...activeTask.value,
      summary: `Approval ${response.action} recorded.`,
      waitingState: null,
      events: this.eventBus.getHistory(activeTask.value.taskId)
    };

    if (response.action === "deny") {
      return err(
        new SpriteError(
          "APPROVAL_DENIED",
          response.reason ?? "Approval was denied."
        )
      );
    }

    if (response.action === "timeout") {
      return err(
        new SpriteError(
          "APPROVAL_TIMED_OUT",
          "Approval timed out and defaulted to deny."
        )
      );
    }

    if (response.action === "edit") {
      if (
        "modifiedToolCall" in response &&
        response.modifiedToolCall !== undefined
      ) {
        return this.executeToolCall(response.modifiedToolCall);
      }

      if (
        "modifiedRequest" in response &&
        response.modifiedRequest !== undefined
      ) {
        return this.executeModifiedApprovalRequest(
          activeTask.value,
          response.modifiedRequest
        );
      }

      return err(
        new SpriteError(
          "APPROVAL_EDIT_PAYLOAD_INVALID",
          "Approval edit responses must provide exactly one modified request payload."
        )
      );
    }

    return this.executeApprovedToolCall(
      activeTask.value,
      pending.toolCallRequest,
      pending.toolCallId
    );
  }

  private async executeApprovedToolCall(
    task: PlannedExecutionFlow,
    executableRequest: RuntimeToolCallRequest,
    toolCallId: string
  ): Promise<Result<ToolExecutionResult>> {
    const requestedEvent = this.createToolLifecycleEvent(
      task,
      "tool.call.requested",
      executableRequest,
      {
        status: "requested",
        summary: `${executableRequest.toolName} requested.`
      },
      toolCallId
    );
    const startedEvent = this.createToolLifecycleEvent(
      task,
      "tool.call.started",
      executableRequest,
      {
        status: "started",
        summary: `${executableRequest.toolName} started.`
      },
      toolCallId
    );
    const requestedEmitted = this.emitNewEvents([requestedEvent, startedEvent]);

    if (!requestedEmitted.ok) {
      return err(requestedEmitted.error);
    }

    const fileEditMetadata = this.createFileEditMetadata(executableRequest);

    if (fileEditMetadata !== null) {
      const editRequested = this.createFileEditEvent(
        task,
        fileEditMetadata,
        "requested",
        toolCallId
      );
      const editRequestedEmitted = this.emitNewEvents([editRequested]);

      if (!editRequestedEmitted.ok) {
        return err(editRequestedEmitted.error);
      }
    }

    const result = await this.executeRegisteredTool(
      task.request.cwd,
      executableRequest
    );

    if (result.ok) {
      const completedEvent = this.createToolLifecycleEvent(
        task,
        "tool.call.completed",
        executableRequest,
        {
          ...this.createCommandResultEventMetadata(result.value),
          outputReference: result.value.output.reference,
          status: "completed",
          summary: result.value.summary
        },
        toolCallId
      );
      const fileActivity = this.createToolResultFileActivity(
        task,
        result.value,
        toolCallId
      );
      const activityEvents = fileActivity.map((record) =>
        this.createFileActivityEvent(task, record)
      );
      const fileEditAppliedEvent =
        result.value.toolName === "apply_patch"
          ? this.createFileEditEvent(
              task,
              {
                affectedFiles: result.value.affectedFiles,
                editId: fileEditMetadata?.editId ?? this.nextId("file_edit")
              },
              "applied",
              toolCallId
            )
          : undefined;
      const emitted = this.emitNewEvents([
        completedEvent,
        ...(fileEditAppliedEvent === undefined ? [] : [fileEditAppliedEvent]),
        ...activityEvents
      ]);

      if (!emitted.ok) {
        return err(emitted.error);
      }

      this.appendActiveTaskFileActivity(fileActivity);
      this.refreshActiveTaskEvents(task.taskId);
      return result;
    }

    const toolError =
      result.error instanceof SpriteError
        ? result.error
        : new SpriteError("TOOL_FAILED", result.error.message);
    const commandErrorMetadata =
      executableRequest.toolName === "run_command"
        ? getRunCommandErrorMetadata(toolError)
        : null;
    const failedEvent = this.createToolLifecycleEvent(
      task,
      "tool.call.failed",
      executableRequest,
      {
        ...this.createCommandFailureEventMetadata(commandErrorMetadata),
        errorCode: toolError.code,
        message: toolError.message,
        status: "failed",
        summary: `${executableRequest.toolName} failed with ${toolError.code}.`
      },
      toolCallId
    );
    const fileEditFailedEvent =
      fileEditMetadata === null
        ? undefined
        : this.createFileEditEvent(
            task,
            fileEditMetadata,
            "failed",
            toolCallId,
            toolError
          );
    const emitted = this.emitNewEvents([
      failedEvent,
      ...(fileEditFailedEvent === undefined ? [] : [fileEditFailedEvent])
    ]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.refreshActiveTaskEvents(task.taskId);
    return result;
  }

  classifyPolicyRequest(request: unknown): Result<PolicyDecision> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    const decision = classifySandboxPolicyRequest(request);

    if (!decision.ok) {
      return decision;
    }

    const eventMetadata = summarizePolicyRequestForEvent(
      decision.value.modifiedRequest ?? request
    );

    if (!eventMetadata.ok) {
      return eventMetadata;
    }

    const event = this.createPolicyDecisionEvent(
      activeTask.value,
      decision.value,
      eventMetadata.value
    );
    const emitted = this.emitNewEvents([event]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.refreshActiveTaskEvents(activeTask.value.taskId);
    return decision;
  }

  recordFileActivity(
    request: RuntimeFileActivityRequest
  ): Result<FileActivityRecord[]> {
    const activeTask = this.getMutableActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    const unsafeField = findForbiddenFileActivityField(
      request as unknown as Record<string, unknown>
    );

    if (unsafeField !== null) {
      return err(
        new SpriteError(
          "FILE_ACTIVITY_UNSAFE_METADATA",
          `File activity request must not include raw content field '${unsafeField}'.`
        )
      );
    }

    if (request.kind !== "changed" && request.kind !== "proposed_change") {
      return err(
        new SpriteError(
          "FILE_ACTIVITY_INVALID_KIND",
          "File activity request kind must be changed or proposed_change."
        )
      );
    }

    if (!Array.isArray(request.paths) || request.paths.length === 0) {
      return err(
        new SpriteError(
          "FILE_ACTIVITY_INVALID_PATH",
          "File activity request must include at least one path."
        )
      );
    }

    if (
      request.summary !== undefined &&
      containsSecretLikeValue(request.summary)
    ) {
      return err(
        new SpriteError(
          "FILE_ACTIVITY_UNSAFE_METADATA",
          "File activity summary must not include secret-looking values."
        )
      );
    }

    const records: FileActivityRecord[] = [];

    for (const requestedPath of request.paths) {
      const safePath = validateFileActivityPath(requestedPath);

      if (!safePath.ok) {
        return err(safePath.error);
      }

      records.push(
        this.createFileActivityRecord(
          activeTask.value,
          {
            kind: request.kind,
            path: safePath.value,
            summary: request.summary ?? `${request.kind} activity recorded.`
          },
          request.toolCallId
        )
      );
    }

    const events = records.map((record) =>
      this.createFileActivityEvent(activeTask.value, record)
    );
    const emitted = this.emitNewEvents(events);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.appendActiveTaskFileActivity(records);
    this.refreshActiveTaskEvents(activeTask.value.taskId);
    return ok(records);
  }

  private executeRegisteredTool(
    cwd: string,
    request: RuntimeToolCallRequest
  ): Promise<Result<ToolExecutionResult>> {
    switch (request.toolName) {
      case "apply_patch":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
      case "read_file":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
      case "list_files":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
      case "run_command":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
      case "search_files":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
    }
  }

  private preparePolicyCheckedToolCall(
    task: PlannedExecutionFlow,
    request: RuntimeToolCallRequest,
    toolCallId: string,
    options: RuntimeCommandPolicyOptions = {}
  ): Result<RuntimeToolCallRequest> {
    if (
      request.toolName !== "run_command" &&
      request.toolName !== "apply_patch"
    ) {
      return ok(request);
    }

    const policyRequest =
      request.toolName === "run_command"
        ? this.createCommandPolicyRequest(task, request, options)
        : this.createFileEditPolicyRequest(request);

    if (!policyRequest.ok) {
      return err(policyRequest.error);
    }

    if (policyRequest.value === null) {
      return ok(request);
    }

    const decision = classifySandboxPolicyRequest(policyRequest.value);

    if (!decision.ok) {
      return decision;
    }

    const eventMetadata = summarizePolicyRequestForEvent(
      decision.value.modifiedRequest ?? policyRequest.value
    );

    if (!eventMetadata.ok) {
      return eventMetadata;
    }

    const event = this.createPolicyDecisionEvent(
      task,
      decision.value,
      eventMetadata.value
    );
    const emitted = this.emitNewEvents([event]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.refreshActiveTaskEvents(task.taskId);

    if (decision.value.action === "deny") {
      const code =
        policyRequest.value.type === "command"
          ? "COMMAND_DENIED_BY_POLICY"
          : "FILE_EDIT_DENIED_BY_POLICY";

      return err(new SpriteError(code, decision.value.reason));
    }

    if (decision.value.action === "require_approval") {
      const approval = this.requestApproval(
        task,
        request,
        policyRequest.value,
        decision.value,
        eventMetadata.value,
        toolCallId
      );

      if (!approval.ok) {
        return err(approval.error);
      }

      const code =
        policyRequest.value.type === "command"
          ? "COMMAND_REQUIRES_APPROVAL"
          : "FILE_EDIT_REQUIRES_APPROVAL";

      return err(new SpriteError(code, decision.value.reason));
    }

    if (policyRequest.value.type === "file_edit") {
      return ok(request);
    }

    const commandRequest =
      decision.value.action === "modify"
        ? decision.value.modifiedRequest
        : policyRequest.value;

    if (commandRequest === undefined || commandRequest.type !== "command") {
      return err(
        new SpriteError(
          "COMMAND_POLICY_INVALID_MODIFICATION",
          "Policy did not provide an executable command request."
        )
      );
    }

    return ok({
      input: this.createRunCommandInput(commandRequest),
      toolName: "run_command"
    });
  }

  private createCommandPolicyRequest(
    task: PlannedExecutionFlow,
    request: Extract<RuntimeToolCallRequest, { toolName: "run_command" }>,
    options: RuntimeCommandPolicyOptions = {}
  ): Result<CommandPolicyRequest> {
    const input = request.input as unknown as Record<string, unknown>;
    const requestedCwd = input.cwd;

    if (requestedCwd !== undefined && typeof requestedCwd !== "string") {
      return err(
        new SpriteError(
          "TOOL_INVALID_INPUT",
          "run_command cwd must be a string when provided."
        )
      );
    }

    return ok({
      ...(input.args === undefined ? {} : { args: input.args as string[] }),
      command: input.command as string,
      ...(options.configuredValidation === undefined
        ? {}
        : { configuredValidation: options.configuredValidation }),
      cwd:
        requestedCwd === undefined
          ? task.request.cwd
          : path.resolve(task.request.cwd, requestedCwd),
      ...(input.env === undefined
        ? {}
        : { env: input.env as Record<string, string> }),
      ...(input.timeoutMs === undefined
        ? {}
        : { timeoutMs: input.timeoutMs as number }),
      type: "command"
    });
  }

  private createFileEditPolicyRequest(
    request: Extract<RuntimeToolCallRequest, { toolName: "apply_patch" }>
  ): Result<FileEditPolicyRequest | null> {
    const metadata = this.createFileEditMetadata(request);

    if (metadata === null) {
      return ok(null);
    }

    const summary =
      typeof request.input.summary === "string" &&
      request.input.summary.trim().length > 0
        ? request.input.summary.trim()
        : "apply_patch targeted patch request.";

    return ok({
      affectedFiles: metadata.affectedFiles,
      editKind: "targeted_patch",
      summary,
      type: "file_edit"
    });
  }

  private createRunCommandInput(
    request: CommandPolicyRequest
  ): ToolInputMap["run_command"] {
    return {
      ...(request.args === undefined ? {} : { args: request.args }),
      command: request.command,
      cwd: request.cwd,
      ...(request.env === undefined ? {} : { env: request.env }),
      ...(request.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.timeoutMs })
    };
  }

  private createValidationToolCall(
    task: PlannedExecutionFlow,
    command: SpriteValidationCommand
  ): Extract<RuntimeToolCallRequest, { toolName: "run_command" }> {
    const cwd =
      command.cwd === undefined
        ? task.request.cwd
        : path.resolve(task.request.cwd, command.cwd);

    return {
      input: {
        ...(command.args === undefined ? {} : { args: command.args }),
        command: command.command,
        cwd,
        ...(command.timeoutMs === undefined
          ? {}
          : { timeoutMs: command.timeoutMs })
      },
      toolName: "run_command"
    };
  }

  private createValidationCommandResult(
    command: SpriteValidationCommand,
    request: Extract<RuntimeToolCallRequest, { toolName: "run_command" }>,
    result: Result<ToolExecutionResult>,
    validationId: string,
    toolCallId: string
  ): RuntimeValidationCommandResult {
    const base = {
      command: summarizeRuntimeCommand(request.input),
      cwd: request.input.cwd ?? "",
      ...(command.name === undefined ? {} : { name: command.name }),
      ...(request.input.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.input.timeoutMs }),
      toolCallId,
      validationId
    };

    if (result.ok) {
      return {
        ...base,
        durationMs:
          result.value.toolName === "run_command"
            ? result.value.durationMs
            : undefined,
        exitCode:
          result.value.toolName === "run_command"
            ? result.value.exitCode
            : undefined,
        outputReference:
          result.value.toolName === "run_command"
            ? result.value.output.reference
            : undefined,
        status: "passed"
      };
    }

    const commandMetadata = getRunCommandErrorMetadata(result.error);
    const status = isValidationBlockedError(result.error)
      ? "blocked"
      : "failed";

    return {
      ...base,
      ...(commandMetadata === null
        ? {}
        : {
            durationMs: commandMetadata.durationMs,
            exitCode: commandMetadata.exitCode,
            outputReference: commandMetadata.outputReference,
            timeoutMs: commandMetadata.timeoutMs
          }),
      errorCode:
        result.error instanceof SpriteError ? result.error.code : "TOOL_FAILED",
      message:
        status === "blocked"
          ? "Validation command is blocked pending approval."
          : "Validation command failed.",
      status
    };
  }

  private executeModifiedApprovalRequest(
    task: PlannedExecutionFlow,
    request: CommandPolicyRequest
  ): Promise<Result<ToolExecutionResult>> {
    return this.executePolicyCheckedModifiedToolCall(task, {
      input: this.createRunCommandInput(request),
      toolName: "run_command"
    });
  }

  private executePolicyCheckedModifiedToolCall(
    task: PlannedExecutionFlow,
    request: RuntimeToolCallRequest
  ): Promise<Result<ToolExecutionResult>> {
    const toolCallId = this.nextId("tool_call");
    const policyCheckedRequest = this.preparePolicyCheckedToolCall(
      task,
      request,
      toolCallId
    );

    if (!policyCheckedRequest.ok) {
      return Promise.resolve(err(policyCheckedRequest.error));
    }

    return this.executeApprovedToolCall(
      task,
      policyCheckedRequest.value,
      toolCallId
    );
  }

  private getMutableActiveTask(): Result<PlannedExecutionFlow> {
    const activeTask = this.getActiveTask();

    if (!activeTask.ok) {
      return activeTask;
    }

    if (this.isTerminalState(activeTask.value)) {
      return err(
        new SpriteError(
          "TASK_TERMINAL",
          `Task ${activeTask.value.taskId} is already in terminal state '${activeTask.value.status}'.`
        )
      );
    }

    return activeTask;
  }

  private nextEventId(): string {
    return this.nextId("evt");
  }

  private createToolLifecycleEvent(
    task: PlannedExecutionFlow,
    type:
      | "tool.call.completed"
      | "tool.call.failed"
      | "tool.call.requested"
      | "tool.call.started",
    request: RuntimeToolCallRequest,
    detail: Record<string, unknown>,
    toolCallId: string
  ): RuntimeEventRecord {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      type,
      {
        cwd: task.request.cwd,
        ...this.safeToolTargetPayload(request),
        ...detail,
        toolCallId,
        toolName: request.toolName
      } as RuntimeEventPayload<typeof type>
    );
  }

  private createValidationStartedEvent(
    task: PlannedExecutionFlow,
    command: SpriteValidationCommand,
    request: Extract<RuntimeToolCallRequest, { toolName: "run_command" }>,
    validationId: string,
    toolCallId: string
  ): RuntimeEventRecord<"validation.started"> {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "validation.started",
      {
        command: summarizeRuntimeCommand(request.input),
        cwd: request.input.cwd ?? task.request.cwd,
        ...(command.name === undefined ? {} : { name: command.name }),
        status: "started",
        summary: `Validation ${command.name ?? validationId} started.`,
        ...(request.input.timeoutMs === undefined
          ? {}
          : { timeoutMs: request.input.timeoutMs }),
        toolCallId,
        validationId
      }
    );
  }

  private createValidationCompletedEvent(
    task: PlannedExecutionFlow,
    result:
      | RuntimeValidationCommandResult
      | {
          message: string;
          status: "skipped";
          summary: string;
          validationId: string;
        }
  ): RuntimeEventRecord<"validation.completed"> {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "validation.completed",
      {
        ...("command" in result ? { command: result.command } : {}),
        ...("cwd" in result ? { cwd: result.cwd } : {}),
        ...("durationMs" in result && result.durationMs !== undefined
          ? { durationMs: result.durationMs }
          : {}),
        ...("errorCode" in result && result.errorCode !== undefined
          ? { errorCode: result.errorCode }
          : {}),
        ...("exitCode" in result && result.exitCode !== undefined
          ? { exitCode: result.exitCode }
          : {}),
        ...("message" in result && result.message !== undefined
          ? { message: result.message }
          : {}),
        ...("name" in result && result.name !== undefined
          ? { name: result.name }
          : {}),
        ...("outputReference" in result && result.outputReference !== undefined
          ? { outputReference: result.outputReference }
          : {}),
        status: result.status,
        summary:
          result.status === "skipped"
            ? result.summary
            : `Validation ${result.name ?? result.validationId} ${result.status}.`,
        ...("timeoutMs" in result && result.timeoutMs !== undefined
          ? { timeoutMs: result.timeoutMs }
          : {}),
        ...("toolCallId" in result ? { toolCallId: result.toolCallId } : {}),
        validationId: result.validationId
      }
    );
  }

  private createFileEditMetadata(
    request: RuntimeToolCallRequest
  ): RuntimeFileEditMetadata | null {
    if (request.toolName !== "apply_patch") {
      return null;
    }

    const edits = (request.input as { edits?: unknown }).edits;

    if (!Array.isArray(edits)) {
      return null;
    }

    const affectedFiles: string[] = [];

    for (const edit of edits) {
      if (!hasStringPath(edit)) {
        return null;
      }

      const safePath = validateFileActivityPath(edit.path);

      if (!safePath.ok) {
        return null;
      }

      affectedFiles.push(safePath.value);
    }

    if (affectedFiles.length === 0) {
      return null;
    }

    return {
      affectedFiles: uniqueSortedValues(affectedFiles),
      editId: this.nextId("file_edit")
    };
  }

  private createFileEditEvent(
    task: PlannedExecutionFlow,
    metadata: RuntimeFileEditMetadata,
    status: "applied" | "failed" | "requested",
    toolCallId: string,
    error?: SpriteError
  ): RuntimeEventRecord {
    const type = `file.edit.${status}` as
      | "file.edit.applied"
      | "file.edit.failed"
      | "file.edit.requested";
    const basePayload = {
      affectedFiles: metadata.affectedFiles,
      editId: metadata.editId,
      status,
      summary: `apply_patch edit ${status}.`,
      toolCallId,
      toolName: "apply_patch" as const
    };

    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      type,
      (status === "failed"
        ? {
            ...basePayload,
            errorCode: error?.code ?? "TOOL_FAILED",
            message: `apply_patch failed with ${error?.code ?? "TOOL_FAILED"}.`
          }
        : basePayload) as RuntimeEventPayload<typeof type>
    );
  }

  private createPolicyDecisionEvent(
    task: PlannedExecutionFlow,
    decision: PolicyDecision,
    metadata: PolicyEventMetadata
  ): RuntimeEventRecord {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "policy.decision.recorded",
      {
        action: decision.action,
        ...metadata,
        reason: decision.reason,
        riskLevel: decision.riskLevel,
        ruleId: decision.ruleId,
        status: "recorded",
        summary:
          metadata.requestType === "command"
            ? "Command policy decision recorded."
            : "File edit policy decision recorded."
      }
    );
  }

  private requestApproval(
    task: PlannedExecutionFlow,
    toolCallRequest: RuntimeToolCallRequest,
    policyRequest: PolicyRequest,
    decision: PolicyDecision,
    metadata: PolicyEventMetadata,
    toolCallId: string
  ): Result<ApprovalRequest> {
    const approvalRequest = this.createApprovalRequest(
      task,
      decision,
      metadata,
      toolCallId
    );
    const requestedEvent = this.createApprovalRequestedEvent(
      task,
      approvalRequest
    );
    const waitingMessage =
      metadata.requestType === "command"
        ? "Runtime is waiting for approval before executing the requested command."
        : "Runtime is waiting for approval before applying the requested file edit.";
    const waitingEvent = this.createTaskWaitingEvent(
      task,
      "approval-required",
      waitingMessage
    );
    const emitted = this.emitNewEvents([requestedEvent, waitingEvent]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.pendingApprovals.set(approvalRequest.approvalRequestId, {
      approvalRequest,
      policyRequest,
      toolCallId,
      toolCallRequest
    });
    this.activeTask = {
      ...task,
      status: "waiting-for-input",
      summary: waitingMessage,
      waitingState: {
        reason: "approval-required",
        message: waitingMessage
      },
      terminalState: null,
      events: this.eventBus.getHistory(task.taskId)
    };

    return ok(approvalRequest);
  }

  private validateApprovalResponseAction(
    approvalRequest: ApprovalRequest,
    response: RuntimeApprovalResponse
  ): Result<void> {
    if (response.action === "timeout") {
      return ok(undefined);
    }

    if (
      !approvalRequest.allowedActions.includes(
        response.action as ApprovalAction
      )
    ) {
      return err(
        new SpriteError(
          "APPROVAL_ACTION_NOT_ALLOWED",
          `Approval action '${response.action}' is not allowed for this request.`
        )
      );
    }

    return ok(undefined);
  }

  private validateEditedApprovalResponse(
    approvalRequest: ApprovalRequest,
    response: RuntimeApprovalResponse
  ): Result<void> {
    if (response.action !== "edit") {
      return ok(undefined);
    }

    const hasModifiedRequest = Object.hasOwn(response, "modifiedRequest");
    const hasModifiedToolCall = Object.hasOwn(response, "modifiedToolCall");

    if (hasModifiedRequest === hasModifiedToolCall) {
      return err(
        new SpriteError(
          "APPROVAL_EDIT_PAYLOAD_INVALID",
          "Approval edit responses must provide exactly one modified request payload."
        )
      );
    }

    const modifiedRequest = hasModifiedRequest
      ? (response as { modifiedRequest?: unknown }).modifiedRequest
      : undefined;
    const modifiedToolCall = hasModifiedToolCall
      ? (response as { modifiedToolCall?: unknown }).modifiedToolCall
      : undefined;
    const isCommandEdit =
      typeof modifiedRequest === "object" &&
      modifiedRequest !== null &&
      (modifiedRequest as { type?: unknown }).type === "command";
    const isFileEditToolCall =
      typeof modifiedToolCall === "object" &&
      modifiedToolCall !== null &&
      (modifiedToolCall as { toolName?: unknown }).toolName === "apply_patch";

    if (approvalRequest.requestType === "command" && !isCommandEdit) {
      return err(
        new SpriteError(
          "APPROVAL_TYPE_MISMATCH",
          "Command approvals must be edited with a modified command request."
        )
      );
    }

    if (approvalRequest.requestType === "file_edit" && !isFileEditToolCall) {
      return err(
        new SpriteError(
          "APPROVAL_TYPE_MISMATCH",
          "File edit approvals must be edited with a modified apply_patch tool call."
        )
      );
    }

    return ok(undefined);
  }

  private createApprovalRequest(
    task: PlannedExecutionFlow,
    decision: PolicyDecision,
    metadata: PolicyEventMetadata,
    toolCallId: string
  ): ApprovalRequest {
    const allowedActions: ApprovalAction[] = ["allow", "deny", "edit"];
    const requestType = metadata.requestType;
    const cwd = metadata.cwd ?? task.request.cwd;
    const envExposure = metadata.envExposure ?? "none";

    return {
      ...(metadata.affectedFiles === undefined
        ? {}
        : { affectedFiles: [...metadata.affectedFiles] }),
      allowedActions,
      approvalRequestId: this.nextId("appr"),
      ...(metadata.command === undefined ? {} : { command: metadata.command }),
      correlationId: task.correlationId,
      cwd,
      envExposure,
      reason: decision.reason,
      requestType,
      riskLevel: decision.riskLevel,
      ruleId: decision.ruleId,
      summary:
        decision.approvalSummary ??
        (requestType === "command"
          ? "Command approval requested."
          : "File edit approval requested."),
      taskId: task.taskId,
      timeoutMs: metadata.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
      toolCallId
    };
  }

  private createApprovalRequestedEvent(
    task: PlannedExecutionFlow,
    request: ApprovalRequest
  ): RuntimeEventRecord {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "approval.requested",
      {
        ...(request.affectedFiles === undefined
          ? {}
          : { affectedFiles: request.affectedFiles }),
        allowedActions: request.allowedActions,
        approvalRequestId: request.approvalRequestId,
        ...(request.command === undefined ? {} : { command: request.command }),
        ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        ...(request.envExposure === undefined
          ? {}
          : { envExposure: request.envExposure }),
        reason: request.reason,
        requestType: request.requestType,
        riskLevel: request.riskLevel,
        ruleId: request.ruleId,
        status: "pending",
        summary: request.summary,
        timeoutMs: request.timeoutMs,
        ...(request.toolCallId === undefined
          ? {}
          : { toolCallId: request.toolCallId })
      }
    );
  }

  private createApprovalResolvedEvent(
    task: PlannedExecutionFlow,
    approvalRequest: ApprovalRequest,
    response: RuntimeApprovalResponse
  ): RuntimeEventRecord {
    const reason = "reason" in response ? response.reason : undefined;

    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "approval.resolved",
      {
        approvalRequestId: approvalRequest.approvalRequestId,
        decision: response.action,
        ...(reason === undefined ? {} : { reason }),
        requestType: approvalRequest.requestType,
        status: "resolved",
        summary: `Approval ${response.action}.`,
        ...(approvalRequest.toolCallId === undefined
          ? {}
          : { toolCallId: approvalRequest.toolCallId })
      }
    );
  }

  private createTaskWaitingEvent(
    task: PlannedExecutionFlow,
    reason: "approval-required" | "user-input-required",
    message: string
  ): RuntimeEventRecord {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "task.waiting",
      {
        reason,
        message
      }
    );
  }

  private createRecoveryRecordedEvent(
    task: PlannedExecutionFlow,
    request: RuntimeRecoveryActionRequest
  ): RuntimeEventRecord<"task.recovery.recorded"> {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "task.recovery.recorded",
      {
        decision: request.decision,
        ...(request.errorCode === undefined
          ? {}
          : { errorCode: request.errorCode }),
        ...(request.message === undefined ? {} : { message: request.message }),
        nextAction: request.nextAction,
        ...(request.ruleId === undefined ? {} : { ruleId: request.ruleId }),
        ...(request.sourceEventId === undefined
          ? {}
          : { sourceEventId: request.sourceEventId }),
        status: "recorded",
        summary: request.summary,
        ...(request.toolCallId === undefined
          ? {}
          : { toolCallId: request.toolCallId }),
        trigger: request.trigger,
        ...(request.validationId === undefined
          ? {}
          : { validationId: request.validationId })
      }
    );
  }

  private createToolResultFileActivity(
    task: PlannedExecutionFlow,
    result: ToolExecutionResult,
    toolCallId: string
  ): FileActivityRecord[] {
    return deriveFileActivityDrafts(result).map((draft) =>
      this.createFileActivityRecord(task, draft, toolCallId)
    );
  }

  private createCommandResultEventMetadata(
    result: ToolExecutionResult
  ): Record<string, unknown> {
    if (result.toolName !== "run_command") {
      return {};
    }

    return {
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      timeoutMs: result.timeoutMs
    };
  }

  private createCommandFailureEventMetadata(
    metadata: RunCommandFailureMetadata | null
  ): Record<string, unknown> {
    if (metadata === null) {
      return {};
    }

    return {
      durationMs: metadata.durationMs,
      exitCode: metadata.exitCode,
      outputReference: metadata.outputReference,
      timeoutMs: metadata.timeoutMs
    };
  }

  private createFileActivityRecord(
    task: PlannedExecutionFlow,
    draft: {
      kind: FileActivityKind;
      path: string;
      returnedItemCount?: number;
      summary: string;
      toolName?: ToolName;
      totalItemCount?: number;
    },
    toolCallId?: string
  ): FileActivityRecord {
    return {
      activityId: this.nextId("file_activity"),
      correlationId: task.correlationId,
      createdAt: this.now(),
      kind: draft.kind,
      path: draft.path,
      ...(draft.returnedItemCount === undefined
        ? {}
        : { returnedItemCount: draft.returnedItemCount }),
      sessionId: task.sessionId,
      status: "recorded",
      summary: draft.summary,
      taskId: task.taskId,
      ...(toolCallId === undefined ? {} : { toolCallId }),
      ...(draft.toolName === undefined ? {} : { toolName: draft.toolName }),
      ...(draft.totalItemCount === undefined
        ? {}
        : { totalItemCount: draft.totalItemCount })
    };
  }

  private createFileActivityEvent(
    task: PlannedExecutionFlow,
    record: FileActivityRecord
  ): RuntimeEventRecord {
    return createRuntimeEventRecord(
      {
        sessionId: task.sessionId,
        taskId: task.taskId,
        correlationId: task.correlationId,
        eventId: this.nextEventId(),
        createdAt: this.now()
      },
      "file.activity.recorded",
      {
        activityId: record.activityId,
        kind: record.kind,
        path: record.path,
        ...(record.returnedItemCount === undefined
          ? {}
          : { returnedItemCount: record.returnedItemCount }),
        status: record.status,
        summary: record.summary,
        ...(record.toolCallId === undefined
          ? {}
          : { toolCallId: record.toolCallId }),
        ...(record.toolName === undefined ? {} : { toolName: record.toolName }),
        ...(record.totalItemCount === undefined
          ? {}
          : { totalItemCount: record.totalItemCount })
      }
    );
  }

  private safeToolTargetPayload(
    request: RuntimeToolCallRequest
  ): Record<string, number | string> {
    const input = request.input as Record<string, unknown>;

    if (request.toolName === "run_command") {
      return safeCommandPayload(input);
    }

    const targetPath = input.path;

    if (
      typeof targetPath === "string" &&
      isSafeProjectRelativePath(targetPath)
    ) {
      return { targetPath };
    }

    return {};
  }

  private nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private setActiveTask(
    task: PlannedExecutionFlow
  ): Result<PlannedExecutionFlow> {
    const emitted = this.emitNewEvents(task.events);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    if (this.isTerminalState(task)) {
      this.clearPendingApprovalsForTask(task.taskId);
    }

    this.activeTask = {
      ...task,
      events: this.eventBus.getHistory(task.taskId)
    };

    return ok(this.activeTask);
  }

  private clearPendingApprovalsForTask(taskId: string): void {
    for (const [approvalRequestId, record] of this.pendingApprovals) {
      if (record.approvalRequest.taskId === taskId) {
        this.pendingApprovals.delete(approvalRequestId);
      }
    }
  }

  private refreshActiveTaskEvents(taskId: string): void {
    if (this.activeTask === null) {
      return;
    }

    this.activeTask = {
      ...this.activeTask,
      events: this.eventBus.getHistory(taskId)
    };
  }

  private appendActiveTaskFileActivity(records: FileActivityRecord[]): void {
    if (this.activeTask === null || records.length === 0) {
      return;
    }

    this.activeTask = {
      ...this.activeTask,
      fileActivity: [...this.activeTask.fileActivity, ...records]
    };
  }

  private emitNewEvents(events: RuntimeEventRecord[]): Result<void> {
    for (const event of events) {
      if (this.emittedEventIds.has(event.eventId)) {
        continue;
      }

      const emitted = this.eventBus.emit(event);

      if (!emitted.ok) {
        return err(emitted.error);
      }

      this.emittedEventIds.add(event.eventId);
    }

    return ok(undefined);
  }

  private isTerminalState(task: PlannedExecutionFlow): boolean {
    return (
      task.status === "completed" ||
      task.status === "cancelled" ||
      task.status === "max-iterations" ||
      task.status === "failed"
    );
  }
}

function isSafeProjectRelativePath(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function uniqueSortedValues(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, "en")
  );
}

function hasStringPath(value: unknown): value is { path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string"
  );
}

function safeCommandPayload(
  input: Record<string, unknown>
): Record<string, number | string> {
  if (typeof input.command !== "string" || input.command.trim().length === 0) {
    return {};
  }

  const args = Array.isArray(input.args)
    ? input.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return {
    command: [input.command.trim(), ...args].join(" "),
    ...(typeof input.timeoutMs === "number" &&
    Number.isInteger(input.timeoutMs) &&
    input.timeoutMs > 0
      ? { timeoutMs: input.timeoutMs }
      : {})
  };
}

function summarizeRuntimeCommand(input: ToolInputMap["run_command"]): string {
  return [input.command.trim(), ...(input.args ?? [])]
    .filter((part) => part.length > 0)
    .join(" ");
}

function isValidationBlockedError(error: unknown): boolean {
  return (
    error instanceof SpriteError &&
    (error.code === "APPROVAL_PENDING" ||
      error.code === "COMMAND_REQUIRES_APPROVAL")
  );
}

function cloneApprovalRequest(request: ApprovalRequest): ApprovalRequest {
  return {
    ...request,
    ...(request.affectedFiles === undefined
      ? {}
      : { affectedFiles: [...request.affectedFiles] }),
    allowedActions: [...request.allowedActions]
  };
}

function formatOptionalValue(value: string | null): string {
  return value ?? "not configured";
}

function formatConfigStatus(loaded: boolean, path: string): string {
  return loaded ? `loaded (${path})` : `not loaded (${path})`;
}

function formatProviderAuth(provider: ResolvedProviderState | null): string {
  if (provider === null || !provider.auth.authenticated) {
    return "not configured";
  }

  return `${provider.auth.source} (secret redacted)`;
}

function formatProviderCapabilities(
  provider: ResolvedProviderState | null
): string {
  if (provider === null) {
    return "not available";
  }

  const contextWindow =
    provider.capabilities.contextWindowTokens === null
      ? "unknown"
      : String(provider.capabilities.contextWindowTokens);

  return `streaming=${provider.capabilities.supportsStreaming}, tool-calls=${provider.capabilities.supportsToolCalls}, context-window=${contextWindow}`;
}

export function createBootstrapMessage(
  options: RuntimeStartupOptions = {}
): string {
  const runtime = new AgentRuntime(options);
  const state = runtime.getBootstrapState();

  if (!state.ok) {
    throw state.error;
  }

  const { startup } = state.value;
  const warningLines = state.value.warnings.map(
    (warning) => `- warning: ${warning}`
  );

  return [
    state.value.message,
    "Startup state:",
    `- cwd: ${startup.cwd}`,
    `- provider: ${state.value.provider?.providerName ?? formatOptionalValue(startup.provider)}`,
    `- model: ${state.value.provider?.model ?? formatOptionalValue(startup.model)}`,
    `- provider auth: ${formatProviderAuth(state.value.provider)}`,
    `- provider capabilities: ${formatProviderCapabilities(state.value.provider)}`,
    `- output: ${startup.outputFormat}`,
    `- sandbox: ${startup.sandboxMode}`,
    `- global config: ${formatConfigStatus(
      startup.globalConfigLoaded,
      startup.globalConfigPath
    )}`,
    `- project config: ${formatConfigStatus(
      startup.projectConfigLoaded,
      startup.projectConfigPath
    )}`,
    ...warningLines,
    "Use --help to inspect the current CLI surface."
  ].join("\n");
}

export function createInteractiveTaskMessage(
  task: string,
  options: RuntimeStartupOptions & {
    cancel?: boolean;
    steer?: string;
  } = {}
): string {
  const runtime = new AgentRuntime(options);
  const observedEvents: RuntimeEventRecord[] = [];
  const unsubscribe = runtime.subscribeToEvents((event) => {
    observedEvents.push(event);
  });
  const initialState = runtime.submitInteractiveTask(task);

  if (!initialState.ok) {
    throw initialState.error;
  }

  if (options.steer !== undefined) {
    const steeredState = runtime.steerActiveTask(options.steer);

    if (!steeredState.ok) {
      throw steeredState.error;
    }
  }

  if (options.cancel === true) {
    const cancelledState = runtime.cancelActiveTask();

    if (!cancelledState.ok) {
      throw cancelledState.error;
    }
  }

  const state = runtime.getActiveTask();
  unsubscribe();

  if (!state.ok) {
    throw state.error;
  }

  const providerLabel =
    state.value.request.provider === null
      ? "not configured"
      : `${state.value.request.provider.providerName} (${state.value.request.provider.model ?? "model not configured"})`;
  const stepLines = state.value.steps.map(
    (step, index) =>
      `${index + 1}. [${step.phase}] ${step.status} - ${step.summary}`
  );
  const warningLines = state.value.warnings.map(
    (warning) => `- warning: ${warning}`
  );
  const waitingLine =
    state.value.waitingState === null
      ? []
      : [
          `- waiting: ${state.value.waitingState.reason} - ${state.value.waitingState.message}`
        ];
  const terminalLine =
    state.value.terminalState === null
      ? []
      : [
          `- terminal: ${state.value.terminalState.reason} - ${state.value.terminalState.message}`
        ];
  const intentLines = state.value.intents.map(
    (intent, index) => `${index + 1}. [${intent.intent}] ${intent.note}`
  );
  const eventLines = observedEvents.map(
    (event, index) => `${index + 1}. ${event.type} (${event.eventId})`
  );
  const finalSummaryLines = shouldRenderFinalSummary(state.value)
    ? formatFinalSummaryLines(createFinalTaskSummary(state.value))
    : [];

  return [
    `Task received: ${state.value.request.task}`,
    "Planned execution flow:",
    `- task state: ${state.value.status}`,
    `- cwd: ${state.value.request.cwd}`,
    `- provider: ${providerLabel}`,
    `- output: ${state.value.request.allowedDefaults.outputFormat}`,
    `- sandbox: ${state.value.request.allowedDefaults.sandboxMode}`,
    `- max iterations: ${state.value.request.stopConditions.maxIterations}`,
    ...waitingLine,
    ...terminalLine,
    ...stepLines,
    state.value.summary,
    ...finalSummaryLines,
    "Task intents:",
    ...(intentLines.length === 0 ? ["- none"] : intentLines),
    "Runtime events:",
    ...eventLines,
    ...warningLines
  ].join("\n");
}

function shouldRenderFinalSummary(state: PlannedExecutionFlow): boolean {
  return (
    state.terminalState !== null ||
    state.waitingState?.reason === "approval-required"
  );
}

function formatFinalSummaryLines(summary: FinalTaskSummary): string[] {
  const providerLabel =
    summary.provider === null
      ? "not configured"
      : `${summary.provider.providerName} (${summary.provider.model ?? "model not configured"})`;
  const importantEventLines = summary.importantEvents.map((event) => {
    const reason = event.reason === undefined ? "" : ` - ${event.reason}`;
    return `- ${event.type} (${event.eventId})${reason}`;
  });
  const unresolvedRiskLines =
    summary.unresolvedRisks.length === 0
      ? ["- none"]
      : summary.unresolvedRisks.map((risk) => `- ${risk}`);
  const notAttemptedLines =
    summary.notAttempted.length === 0
      ? ["- none"]
      : summary.notAttempted.map((note) => `- ${note}`);
  const filesReadLines = formatPathList(summary.filesRead);
  const filesChangedLines = formatPathList(summary.filesChanged);
  const filesProposedLines = formatPathList(summary.filesProposedForChange);

  return [
    "Final summary:",
    `- status: ${summary.status}`,
    `- result: ${summary.result}`,
    `- provider: ${providerLabel}`,
    `- session id: ${summary.sessionId}`,
    `- task id: ${summary.taskId}`,
    `- correlation id: ${summary.correlationId}`,
    "Files read:",
    ...filesReadLines,
    "Files changed:",
    ...filesChangedLines,
    "Files proposed for change:",
    ...filesProposedLines,
    "Important events:",
    ...importantEventLines,
    "Unresolved risks:",
    ...unresolvedRiskLines,
    "Not attempted:",
    ...notAttemptedLines
  ];
}

function formatPathList(paths: string[]): string[] {
  return paths.length === 0
    ? ["- none"]
    : paths.map((pathValue) => `- ${pathValue}`);
}

export function resolveOneShotPrintOutputFormat(
  options: OneShotPrintTaskOptions = {}
): Result<OneShotPrintOutputFormat> {
  if (options.outputFormat !== undefined) {
    return ok(options.outputFormat);
  }

  const runtime = new AgentRuntime(options);
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return bootstrapState;
  }

  return ok(bootstrapState.value.startup.outputFormat);
}

export function runOneShotPrintTask(
  task: string,
  options: OneShotPrintTaskOptions = {}
): Result<OneShotPrintTaskResult> {
  const runtime = new AgentRuntime(options);
  const unsubscribe =
    options.onEvent === undefined
      ? undefined
      : runtime.subscribeToEvents(options.onEvent);

  try {
    const submittedState = runtime.submitInteractiveTask(task);

    if (!submittedState.ok) {
      return submittedState;
    }

    let finalState = submittedState.value;

    if (!isOneShotStopBoundary(finalState)) {
      const stoppedState = runtime.stopActiveTaskForMaxIterations(
        "One-shot print mode stopped after the first minimal runtime iteration because provider-driven tool execution is not connected yet."
      );

      if (!stoppedState.ok) {
        return stoppedState;
      }

      finalState = stoppedState.value;
    }

    return ok(
      createOneShotPrintTaskResult(
        finalState,
        options.outputFormat ?? finalState.request.allowedDefaults.outputFormat
      )
    );
  } finally {
    unsubscribe?.();
  }
}

function createOneShotPrintTaskResult(
  state: PlannedExecutionFlow,
  outputFormat: OneShotPrintOutputFormat
): OneShotPrintTaskResult {
  return {
    task: state.request.task,
    outputFormat,
    status: state.status,
    summary: state.summary,
    sessionId: state.sessionId,
    taskId: state.taskId,
    correlationId: state.correlationId,
    provider: state.request.provider,
    model: state.request.provider?.model ?? null,
    waitingState: state.waitingState,
    terminalState: state.terminalState,
    finalSummary: createFinalTaskSummary(state),
    warnings: state.warnings,
    events: state.events
  };
}

function isOneShotStopBoundary(state: PlannedExecutionFlow): boolean {
  if (
    state.status === "completed" ||
    state.status === "cancelled" ||
    state.status === "max-iterations" ||
    state.status === "failed"
  ) {
    return true;
  }

  return state.waitingState?.reason === "approval-required";
}
