import type { BootstrapState } from "./agent-runtime.js";
import type {
  PlannedExecutionFlow,
  PlannedExecutionStep,
  RuntimeEventRecord,
  TaskIntentRecord,
  TaskRequest,
  TaskTerminalReason,
  TaskWaitingReason
} from "./task-state.js";

const DEFAULT_MAX_ITERATIONS = 1;

export function createTaskRequest(
  task: string,
  bootstrapState: BootstrapState
): TaskRequest {
  return {
    task,
    cwd: bootstrapState.startup.cwd,
    provider: bootstrapState.provider,
    startup: bootstrapState.startup,
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
        "Repository inspection and tool work are deferred to later stories, so no file search, edits, or command execution have been attempted yet."
    },
    {
      phase: "observe",
      status: "pending",
      summary:
        "Observation remains pending until tool execution, validation, and runtime events exist in later stories."
    }
  ];
}

interface RuntimeTaskIdentity {
  sessionId: string;
  taskId: string;
  correlationId: string;
}

interface RuntimeEventContext extends RuntimeTaskIdentity {
  eventId: string;
  createdAt: string;
}

function createRuntimeEvent(
  context: RuntimeEventContext,
  type: RuntimeEventRecord["type"],
  payload: Record<string, unknown>
): RuntimeEventRecord {
  return {
    schemaVersion: 1,
    eventId: context.eventId,
    sessionId: context.sessionId,
    taskId: context.taskId,
    correlationId: context.correlationId,
    type,
    createdAt: context.createdAt,
    payload
  };
}

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
      "Initial execution flow created. The runtime has planned the first loop and is now waiting for user input because repository inspection and tool work are not available yet.",
    warnings,
    waitingState: {
      reason: "steering-required",
      message:
        "Repository inspection and tool execution are deferred to later stories, so the runtime is waiting for steering or cancellation input."
    },
    terminalState: null,
    intents: [],
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
          status: "planned"
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
          reason: "steering-required"
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

  const steeringEvent = createRuntimeEvent(receivedEvent, "task.steering.received", {
    note
  });
  const waitingRecord = createRuntimeEvent(waitingEvent, "task.waiting", {
    reason: "steering-required"
  });

  return {
    ...state,
    status: "waiting-for-input",
    summary:
      "Steering input recorded. The runtime remains paused for follow-up input because repository inspection and tool work are not available yet.",
    waitingState: {
      reason: "steering-required",
      message:
        "Steering input was recorded, but the runtime is still waiting because tool execution starts in later stories."
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
    summary: "Task cancelled before repository inspection or tool execution began.",
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
        reason
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
        reason: "completed"
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
  return transitionTaskFailure(state, "unrecoverable-error", message, failedEvent);
}

function transitionTaskFailure(
  state: PlannedExecutionFlow,
  reason: TaskTerminalReason,
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
        reason
      })
    )
  };
}
