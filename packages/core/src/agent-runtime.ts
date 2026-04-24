import {
  resolveSpriteRuntimeConfig,
  toStartupConfig,
  type ConfigLoaderOptions,
  type ResolvedStartupConfig
} from "@sprite/config";
import {
  initializeProviderAdapter,
  type ProviderRuntimeOverride,
  type ResolvedProviderState
} from "@sprite/providers";
import { SpriteError, err, ok, type Result } from "@sprite/shared";
import { randomUUID } from "node:crypto";
import {
  RuntimeEventBus,
  type RuntimeEventListener,
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

export class AgentRuntime {
  private readonly sessionId = `session_${randomUUID()}`;
  private readonly eventBus = new RuntimeEventBus();
  private readonly emittedEventIds = new Set<string>();
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
        "Interactive task planning is available, but repository inspection and tool execution start in later stories."
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

  cancelActiveTask(note = "User cancelled the active task."): Result<PlannedExecutionFlow> {
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

  waitForInput(reason: "approval-required" | "user-input-required", message: string): Result<PlannedExecutionFlow> {
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

  private nextId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private setActiveTask(task: PlannedExecutionFlow): Result<PlannedExecutionFlow> {
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

function formatProviderCapabilities(provider: ResolvedProviderState | null): string {
  if (provider === null) {
    return "not available";
  }

  const contextWindow =
    provider.capabilities.contextWindowTokens === null
      ? "unknown"
      : String(provider.capabilities.contextWindowTokens);

  return `streaming=${provider.capabilities.supportsStreaming}, tool-calls=${provider.capabilities.supportsToolCalls}, context-window=${contextWindow}`;
}

export function createBootstrapMessage(options: RuntimeStartupOptions = {}): string {
  const runtime = new AgentRuntime(options);
  const state = runtime.getBootstrapState();

  if (!state.ok) {
    throw state.error;
  }

  const { startup } = state.value;
  const warningLines = state.value.warnings.map((warning) => `- warning: ${warning}`);

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
  const warningLines = state.value.warnings.map((warning) => `- warning: ${warning}`);
  const waitingLine =
    state.value.waitingState === null
      ? []
      : [`- waiting: ${state.value.waitingState.reason} - ${state.value.waitingState.message}`];
  const terminalLine =
    state.value.terminalState === null
      ? []
      : [`- terminal: ${state.value.terminalState.reason} - ${state.value.terminalState.message}`];
  const intentLines = state.value.intents.map(
    (intent, index) =>
      `${index + 1}. [${intent.intent}] ${intent.note}`
  );
  const eventLines = observedEvents.map(
    (event, index) =>
      `${index + 1}. ${event.type} (${event.eventId})`
  );

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
    "Task intents:",
    ...(intentLines.length === 0 ? ["- none"] : intentLines),
    "Runtime events:",
    ...eventLines,
    ...warningLines
  ].join("\n");
}
