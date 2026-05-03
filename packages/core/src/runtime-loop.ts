import type { BootstrapState } from "./agent-runtime.js";
import {
  createRuntimeEventRecord,
  type RuntimeEventPayload,
  type RuntimeEventContext,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "./runtime-events.js";
import type {
  PlannedExecutionFlow,
  PlannedExecutionStep,
  TaskIntentRecord,
  TaskRequest,
  TaskTerminalReason,
  TaskWaitingReason
} from "./task-state.js";
import {
  assembleTaskContextPacket,
  type TaskContextSessionStateInput
} from "./task-context.js";

const DEFAULT_MAX_ITERATIONS = 1;

export interface TaskRequestContextOptions {
  sessionState?: TaskContextSessionStateInput;
}

export function createTaskRequest(
  task: string,
  bootstrapState: BootstrapState,
  options: TaskRequestContextOptions = {}
): TaskRequest {
  return {
    task,
    cwd: bootstrapState.startup.cwd,
    provider: bootstrapState.provider,
    startup: bootstrapState.startup,
    contextPacket: assembleTaskContextPacket({
      projectContext: bootstrapState.projectContext,
      provider: bootstrapState.provider,
      sessionState: options.sessionState,
      startup: bootstrapState.startup,
      task
    }),
    allowedDefaults: {
      outputFormat: bootstrapState.startup.outputFormat,
      sandboxMode: bootstrapState.startup.sandboxMode,
      toolExecutionEnabled: false
    },
    stopConditions: {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      stopOnApprovalRequired: true,
      stopOnProviderError: true
    }
  };
}

function createPlanSteps(request: TaskRequest): PlannedExecutionStep[] {
  const providerSummary =
    request.provider === null
      ? "no active provider is configured yet"
      : `active provider is ${request.provider.providerName} (${request.provider.model ?? "model not configured"})`;

  return [
    {
      phase: "plan",
      status: "completed",
      summary: `Interpret the task goal and confirm runtime constraints; ${providerSummary}.`
    },
    {
      phase: "act",
      status: "pending",
      summary:
        "Provider-driven tool work is not connected to this initial loop yet, so no file search, edits, or command execution have been attempted automatically."
    },
    {
      phase: "observe",
      status: "pending",
      summary:
        "Observation remains pending until the agent loop can consume tool results and validation events automatically."
    }
  ];
}

interface RuntimeTaskIdentity {
  sessionId: string;
  taskId: string;
  correlationId: string;
}

type TaskFailureReason = Extract<
  TaskTerminalReason,
  "max-iterations" | "unrecoverable-error"
>;

export function runInitialPlanActObserveLoop(
  request: TaskRequest,
  identity: RuntimeTaskIdentity,
  createdAt: string,
  startedEventId: string,
  waitingEventId: string,
  warnings: string[] = []
): PlannedExecutionFlow {
  return {
    status: "waiting-for-input",
    sessionId: identity.sessionId,
    taskId: identity.taskId,
    correlationId: identity.correlationId,
    request,
    currentPhase: "act",
    steps: createPlanSteps(request),
    summary:
      "Initial execution flow created. The runtime has planned the first loop and is now waiting for user input because provider-driven tool work is not connected yet.",
    warnings,
    waitingState: {
      reason: "steering-required",
      message:
        "Provider-driven tool execution is not connected to this initial loop yet, so the runtime is waiting for steering or cancellation input."
    },
    terminalState: null,
    intents: [],
    fileActivity: [],
    events: [
      createRuntimeEvent(
        {
          ...identity,
          eventId: startedEventId,
          createdAt
        },
        "task.started",
        {
          phase: "plan",
          status: "planned",
          providerName: request.provider?.providerName ?? "not-configured",
          model: request.provider?.model ?? "not-configured"
        }
      ),
      createRuntimeEvent(
        {
          ...identity,
          eventId: waitingEventId,
          createdAt
        },
        "task.waiting",
        {
          reason: "steering-required",
          message:
            "Provider-driven tool execution is not connected to this initial loop yet, so the runtime is waiting for steering or cancellation input."
        }
      )
    ]
  };
}

function appendIntent(
  state: PlannedExecutionFlow,
  intent: TaskIntentRecord
): TaskIntentRecord[] {
  return [...state.intents, intent];
}

function appendEvent(
  state: PlannedExecutionFlow,
  event: RuntimeEventRecord
): RuntimeEventRecord[] {
  return [...state.events, event];
}

export function applyTaskSteering(
  state: PlannedExecutionFlow,
  note: string,
  receivedEvent: RuntimeEventContext,
  waitingEvent: RuntimeEventContext
): PlannedExecutionFlow {
  const intentRecord: TaskIntentRecord = {
    intent: "steer",
    note,
    createdAt: receivedEvent.createdAt
  };

  const steeringEvent = createRuntimeEvent(
    receivedEvent,
    "task.steering.received",
    {
      note
    }
  );
  const waitingRecord = createRuntimeEvent(waitingEvent, "task.waiting", {
    reason: "steering-required",
    message:
      "Steering input was recorded, but the runtime is still waiting because provider-driven tool execution is not connected yet."
  });

  return {
    ...state,
    status: "waiting-for-input",
    summary:
      "Steering input recorded. The runtime remains paused for follow-up input because provider-driven tool work is not connected yet.",
    waitingState: {
      reason: "steering-required",
      message:
        "Steering input was recorded, but the runtime is still waiting because provider-driven tool execution is not connected yet."
    },
    terminalState: null,
    intents: appendIntent(state, intentRecord),
    events: appendEvent(
      {
        ...state,
        events: appendEvent(state, steeringEvent)
      },
      waitingRecord
    )
  };
}

export function cancelTask(
  state: PlannedExecutionFlow,
  note: string,
  cancelledEvent: RuntimeEventContext
): PlannedExecutionFlow {
  const intentRecord: TaskIntentRecord = {
    intent: "cancel",
    note,
    createdAt: cancelledEvent.createdAt
  };

  return {
    ...state,
    status: "cancelled",
    summary: "Task cancelled before provider-driven tool execution began.",
    waitingState: null,
    terminalState: {
      reason: "cancelled",
      message: note
    },
    intents: appendIntent(state, intentRecord),
    events: appendEvent(
      state,
      createRuntimeEvent(cancelledEvent, "task.cancelled", {
        reason: "cancelled",
        message: "Task cancelled before provider-driven tool execution began.",
        note
      })
    )
  };
}

export function waitForTaskInput(
  state: PlannedExecutionFlow,
  reason: TaskWaitingReason,
  message: string,
  waitingEvent: RuntimeEventContext
): PlannedExecutionFlow {
  return {
    ...state,
    status: "waiting-for-input",
    summary: message,
    waitingState: {
      reason,
      message
    },
    terminalState: null,
    events: appendEvent(
      state,
      createRuntimeEvent(waitingEvent, "task.waiting", {
        reason,
        message
      })
    )
  };
}

export function completeTask(
  state: PlannedExecutionFlow,
  message: string,
  completedEvent: RuntimeEventContext
): PlannedExecutionFlow {
  return {
    ...state,
    status: "completed",
    summary: message,
    waitingState: null,
    terminalState: {
      reason: "completed",
      message
    },
    currentPhase: "observe",
    events: appendEvent(
      state,
      createRuntimeEvent(completedEvent, "task.completed", {
        reason: "completed",
        message
      })
    )
  };
}

export function stopTaskForMaxIterations(
  state: PlannedExecutionFlow,
  message: string,
  failedEvent: RuntimeEventContext
): PlannedExecutionFlow {
  return transitionTaskFailure(state, "max-iterations", message, failedEvent);
}

export function failTask(
  state: PlannedExecutionFlow,
  message: string,
  failedEvent: RuntimeEventContext
): PlannedExecutionFlow {
  return transitionTaskFailure(
    state,
    "unrecoverable-error",
    message,
    failedEvent
  );
}

function transitionTaskFailure(
  state: PlannedExecutionFlow,
  reason: TaskFailureReason,
  message: string,
  failedEvent: RuntimeEventContext
): PlannedExecutionFlow {
  return {
    ...state,
    status: reason === "max-iterations" ? "max-iterations" : "failed",
    summary: message,
    waitingState: null,
    terminalState: {
      reason,
      message
    },
    events: appendEvent(
      state,
      createRuntimeEvent(failedEvent, "task.failed", {
        reason,
        message
      })
    )
  };
}

function createRuntimeEvent<T extends RuntimeEventType>(
  context: RuntimeTaskIdentity &
    Pick<RuntimeEventContext, "eventId" | "createdAt">,
  type: T,
  payload: RuntimeEventPayload<T>
): RuntimeEventRecord<T> {
  return createRuntimeEventRecord(context, type, payload);
}
