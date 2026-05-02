import {
  readSessionArtifacts,
  type SessionSnapshotPlanStep,
  type SessionSnapshotRuntimePhase,
  type SessionSnapshotTaskStatus,
  type SessionStateSnapshot
} from "@sprite/storage";
import {
  SpriteError,
  createRedactedPreview,
  err,
  type Result
} from "@sprite/shared";
import {
  validateRuntimeEvent,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "./runtime-events.js";

export interface InspectSessionStateOptions {
  recentEventLimit?: number;
}

export interface SessionInspectionEventSummary {
  createdAt: string;
  eventId: string;
  taskId: string;
  type: RuntimeEventType;
  summary: string;
}

export interface SessionInspectionLatestTask {
  correlationId: string;
  currentPhase: SessionSnapshotRuntimePhase;
  goal: string;
  latestPlan?: SessionSnapshotPlanStep[];
  status: SessionSnapshotTaskStatus;
  taskId: string;
}

export interface SessionInspectionExecutionState {
  detail: string;
  kind: "active" | "terminal" | "unknown" | "waiting";
}

export interface SessionInspectionView {
  commandsRun: string[];
  cwd: string;
  eventCount: number;
  executionState: SessionInspectionExecutionState;
  filesChanged: string[];
  filesProposedForChange: string[];
  filesRead: string[];
  lastError?: string;
  latestTask?: SessionInspectionLatestTask;
  nextStep?: string;
  pendingApprovalCount: number;
  persistedEventCount: number;
  recentEvents: SessionInspectionEventSummary[];
  schemaVersion: 1;
  sessionId: string;
  warnings: string[];
}

const COMMAND_EVENT_TYPES: ReadonlySet<RuntimeEventType> = new Set([
  "approval.requested",
  "policy.decision.recorded",
  "tool.call.completed",
  "tool.call.failed",
  "tool.call.requested",
  "tool.call.started",
  "validation.completed",
  "validation.started"
]);

const TERMINAL_TASK_STATUSES: ReadonlySet<SessionSnapshotTaskStatus> = new Set([
  "cancelled",
  "completed",
  "failed",
  "max-iterations"
]);

export function inspectSessionState(
  cwd: string,
  sessionId: string,
  options: InspectSessionStateOptions = {}
): Result<SessionInspectionView, SpriteError> {
  const artifacts = readSessionArtifacts(cwd, sessionId, options);

  if (!artifacts.ok) {
    return err(artifacts.error);
  }

  const runtimeEvents: RuntimeEventRecord[] = [];

  for (const event of artifacts.value.recentEvents) {
    const validation = validateRuntimeEvent(event);

    if (!validation.ok) {
      return err(
        new SpriteError(
          "SESSION_EVENT_RUNTIME_INVALID",
          `Stored session event ${event.eventId} is not a valid runtime event: ${validation.error.message}`
        )
      );
    }

    runtimeEvents.push(validation.value);
  }

  const { state, persistedEventCount } = artifacts.value;
  const warnings = [
    ".sprite/sessions artifacts are local private state for this project cwd and should not be committed or treated as portable across machines.",
    ...(state.eventCount === persistedEventCount
      ? []
      : [
          `state.json eventCount (${state.eventCount}) does not match parsed events.ndjson count (${persistedEventCount}).`
        ])
  ].map((warning) => safePreview(warning, 240));

  const view: SessionInspectionView = {
    commandsRun: extractCommandSummaries(runtimeEvents),
    cwd: safePreview(state.cwd, 320),
    eventCount: state.eventCount,
    executionState: summarizeExecutionState(state.latestTask, runtimeEvents),
    filesChanged: redactList(state.filesChanged),
    filesProposedForChange: redactList(state.filesProposedForChange),
    filesRead: redactList(state.filesRead),
    ...(state.lastError === undefined
      ? {}
      : { lastError: safePreview(state.lastError, 320) }),
    ...(state.latestTask === undefined
      ? {}
      : { latestTask: redactLatestTask(state.latestTask) }),
    ...(state.nextStep === undefined
      ? {}
      : { nextStep: safePreview(state.nextStep, 320) }),
    pendingApprovalCount: state.pendingApprovalCount,
    persistedEventCount,
    recentEvents: runtimeEvents.map(summarizeRuntimeEvent),
    schemaVersion: 1,
    sessionId: state.sessionId,
    warnings
  };

  return { ok: true, value: view };
}

function redactLatestTask(
  latestTask: NonNullable<SessionStateSnapshot["latestTask"]>
): SessionInspectionLatestTask {
  return {
    correlationId: latestTask.correlationId,
    currentPhase: latestTask.currentPhase,
    goal: safePreview(latestTask.goal, 240),
    ...(latestTask.latestPlan === undefined
      ? {}
      : {
          latestPlan: latestTask.latestPlan.map((step) => ({
            phase: step.phase,
            status: step.status,
            summary: safePreview(step.summary, 240)
          }))
        }),
    status: latestTask.status,
    taskId: latestTask.taskId
  };
}

function summarizeExecutionState(
  latestTask: Parameters<typeof redactLatestTask>[0] | undefined,
  events: RuntimeEventRecord[]
): SessionInspectionExecutionState {
  if (latestTask === undefined) {
    return {
      detail: "No latest task snapshot is available.",
      kind: "unknown"
    };
  }

  const lastTaskEvent = [...events]
    .reverse()
    .find((event) => event.type.startsWith("task."));

  if (latestTask.status === "waiting-for-input") {
    return {
      detail: safePreview(
        lastTaskEvent?.type === "task.waiting"
          ? lastTaskEvent.payload.message
          : "Task is waiting for input.",
        240
      ),
      kind: "waiting"
    };
  }

  if (TERMINAL_TASK_STATUSES.has(latestTask.status)) {
    const terminalMessage =
      lastTaskEvent === undefined
        ? undefined
        : (lastTaskEvent.payload as Record<string, unknown>).message;

    return {
      detail: safePreview(
        typeof terminalMessage === "string"
          ? terminalMessage
          : `Task reached terminal status ${latestTask.status}.`,
        240
      ),
      kind: "terminal"
    };
  }

  return {
    detail: safePreview(`Task is active in ${latestTask.currentPhase} phase.`),
    kind: "active"
  };
}

function summarizeRuntimeEvent(
  event: RuntimeEventRecord
): SessionInspectionEventSummary {
  return {
    createdAt: event.createdAt,
    eventId: event.eventId,
    taskId: event.taskId,
    type: event.type,
    summary: safePreview(createEventSummary(event), 240)
  };
}

function createEventSummary(event: RuntimeEventRecord): string {
  const payload = event.payload as Record<string, unknown>;
  const details = [
    typeof payload.status === "string" ? `status=${payload.status}` : "",
    typeof payload.reason === "string" ? `reason=${payload.reason}` : "",
    typeof payload.summary === "string" ? payload.summary : "",
    typeof payload.message === "string" ? payload.message : "",
    typeof payload.nextAction === "string" ? `next=${payload.nextAction}` : ""
  ].filter((part) => part.length > 0);

  return details.length === 0
    ? event.type
    : `${event.type}: ${details.join(" | ")}`;
}

function extractCommandSummaries(events: RuntimeEventRecord[]): string[] {
  const commands = new Set<string>();

  for (const event of events) {
    if (!COMMAND_EVENT_TYPES.has(event.type)) {
      continue;
    }

    const payload = event.payload as Record<string, unknown>;

    if (typeof payload.command !== "string") {
      continue;
    }

    const status =
      typeof payload.status === "string" ? ` ${payload.status}` : "";
    commands.add(
      safePreview(`${event.type}${status}: ${payload.command}`, 240)
    );
  }

  return Array.from(commands);
}

function redactList(values: string[]): string[] {
  return values.map((value) => safePreview(value, 320));
}

function safePreview(value: string, maxLength = 160): string {
  return createRedactedPreview(value, maxLength);
}
