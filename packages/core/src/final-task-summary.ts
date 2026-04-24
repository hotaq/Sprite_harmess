import type { ResolvedProviderState } from "@sprite/providers";
import type { RuntimeEventRecord, RuntimeEventType } from "./runtime-events.js";
import type { PlannedExecutionFlow } from "./task-state.js";

export interface FinalTaskSummaryProvider {
  providerName: string;
  model: string | null;
}

export interface FinalTaskSummaryEvent {
  eventId: string;
  type: RuntimeEventType;
  createdAt: string;
  reason?: string;
  message?: string;
}

export interface FinalTaskSummary {
  status: PlannedExecutionFlow["status"];
  result: string;
  provider: FinalTaskSummaryProvider | null;
  model: string | null;
  importantEvents: FinalTaskSummaryEvent[];
  unresolvedRisks: string[];
  notAttempted: string[];
  sessionId: string;
  taskId: string;
  correlationId: string;
}

export function createFinalTaskSummary(
  state: PlannedExecutionFlow
): FinalTaskSummary {
  return {
    status: state.status,
    result: state.summary,
    provider: summarizeProvider(state.request.provider),
    model: state.request.provider?.model ?? null,
    importantEvents: state.events.map(summarizeEvent),
    unresolvedRisks: collectUnresolvedRisks(state),
    notAttempted: collectNotAttempted(state),
    sessionId: state.sessionId,
    taskId: state.taskId,
    correlationId: state.correlationId
  };
}

function summarizeProvider(
  provider: ResolvedProviderState | null
): FinalTaskSummaryProvider | null {
  if (provider === null) {
    return null;
  }

  return {
    providerName: provider.providerName,
    model: provider.model
  };
}

function summarizeEvent(event: RuntimeEventRecord): FinalTaskSummaryEvent {
  const summary: FinalTaskSummaryEvent = {
    eventId: event.eventId,
    type: event.type,
    createdAt: event.createdAt
  };

  if (
    event.type === "task.waiting" ||
    event.type === "task.completed" ||
    event.type === "task.failed" ||
    event.type === "task.cancelled"
  ) {
    return {
      ...summary,
      reason: event.payload.reason,
      message: event.payload.message
    };
  }

  return summary;
}

function collectNotAttempted(state: PlannedExecutionFlow): string[] {
  const notes: string[] = [];

  if (!state.request.allowedDefaults.toolExecutionEnabled) {
    notes.push(
      "Provider-driven tool execution was not attempted by this initial runtime loop."
    );
  }

  notes.push(
    "Validation was not attempted because command execution and validation are not available in the first minimal runtime."
  );

  return notes;
}

function collectUnresolvedRisks(state: PlannedExecutionFlow): string[] {
  const risks: string[] = [];

  if (state.waitingState?.reason === "approval-required") {
    risks.push(
      "Task is waiting for approval-required input before more work can continue."
    );
  }

  if (state.status === "waiting-for-input") {
    risks.push(
      "The task is paused and remains incomplete until user input is provided."
    );
  }

  if (state.status === "max-iterations") {
    risks.push(
      "The requested task is not verified because the runtime stopped before provider-driven tool execution or validation."
    );
  }

  if (state.status === "failed") {
    risks.push(
      "The task failed before recovery and validation could complete."
    );
  }

  if (
    state.status === "completed" &&
    !state.request.allowedDefaults.toolExecutionEnabled
  ) {
    risks.push(
      "The completed state is not independently verified because provider-driven tool execution and validation were not run."
    );
  }

  return risks;
}
