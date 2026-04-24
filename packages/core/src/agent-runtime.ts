import {
  resolveSpriteRuntimeConfig,
  toStartupConfig,
  type ConfigLoaderOptions,
  type ResolvedStartupConfig,
  type SpriteOutputFormat
} from "@sprite/config";
import {
  initializeProviderAdapter,
  type ProviderRuntimeOverride,
  type ResolvedProviderState
} from "@sprite/providers";
import { SpriteError, err, ok, type Result } from "@sprite/shared";
import {
  createToolRegistry,
  type ToolExecutionResult,
  type ToolInputMap,
  type ToolName
} from "@sprite/tools";
import { randomUUID } from "node:crypto";
import path from "node:path";
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

export class AgentRuntime {
  private readonly sessionId = `session_${randomUUID()}`;
  private readonly eventBus = new RuntimeEventBus();
  private readonly emittedEventIds = new Set<string>();
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

    const toolCallId = this.nextId("tool_call");
    const requestedEvent = this.createToolLifecycleEvent(
      activeTask.value,
      "tool.call.requested",
      request,
      {
        status: "requested",
        summary: `${request.toolName} requested.`
      },
      toolCallId
    );
    const startedEvent = this.createToolLifecycleEvent(
      activeTask.value,
      "tool.call.started",
      request,
      {
        status: "started",
        summary: `${request.toolName} started.`
      },
      toolCallId
    );
    const requestedEmitted = this.emitNewEvents([requestedEvent, startedEvent]);

    if (!requestedEmitted.ok) {
      return err(requestedEmitted.error);
    }

    const result = await this.executeRegisteredTool(
      activeTask.value.request.cwd,
      request
    );

    if (result.ok) {
      const completedEvent = this.createToolLifecycleEvent(
        activeTask.value,
        "tool.call.completed",
        request,
        {
          outputReference: result.value.output.reference,
          status: "completed",
          summary: result.value.summary
        },
        toolCallId
      );
      const emitted = this.emitNewEvents([completedEvent]);

      if (!emitted.ok) {
        return err(emitted.error);
      }

      this.refreshActiveTaskEvents(activeTask.value.taskId);
      return result;
    }

    const toolError =
      result.error instanceof SpriteError
        ? result.error
        : new SpriteError("TOOL_FAILED", result.error.message);
    const failedEvent = this.createToolLifecycleEvent(
      activeTask.value,
      "tool.call.failed",
      request,
      {
        errorCode: toolError.code,
        message: toolError.message,
        status: "failed",
        summary: `${request.toolName} failed with ${toolError.code}.`
      },
      toolCallId
    );
    const emitted = this.emitNewEvents([failedEvent]);

    if (!emitted.ok) {
      return err(emitted.error);
    }

    this.refreshActiveTaskEvents(activeTask.value.taskId);
    return result;
  }

  private executeRegisteredTool(
    cwd: string,
    request: RuntimeToolCallRequest
  ): Promise<Result<ToolExecutionResult>> {
    switch (request.toolName) {
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
      case "search_files":
        return this.toolRegistry.execute({
          cwd,
          input: request.input,
          toolName: request.toolName
        });
    }
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

  private safeToolTargetPayload(
    request: RuntimeToolCallRequest
  ): Record<string, string> {
    const input = request.input as Record<string, unknown>;
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

    this.activeTask = {
      ...task,
      events: this.eventBus.getHistory(task.taskId)
    };

    return ok(this.activeTask);
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

  return [
    "Final summary:",
    `- status: ${summary.status}`,
    `- result: ${summary.result}`,
    `- provider: ${providerLabel}`,
    `- session id: ${summary.sessionId}`,
    `- task id: ${summary.taskId}`,
    `- correlation id: ${summary.correlationId}`,
    "Important events:",
    ...importantEventLines,
    "Unresolved risks:",
    ...unresolvedRiskLines,
    "Not attempted:",
    ...notAttemptedLines
  ];
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
