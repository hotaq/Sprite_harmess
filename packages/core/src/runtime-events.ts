import { SpriteError, err, type Result } from "@sprite/shared";
import type {
  RuntimeLoopPhase,
  TaskExecutionStatus,
  TaskTerminalReason,
  TaskWaitingReason
} from "./task-state.js";

export const RUNTIME_EVENT_SCHEMA_VERSION = 1 as const;

const RUNTIME_LOOP_PHASES = [
  "plan",
  "act",
  "observe"
] as const satisfies readonly RuntimeLoopPhase[];
const TASK_STARTED_STATUSES = [
  "planned"
] as const satisfies readonly TaskExecutionStatus[];
const TASK_WAITING_REASONS = [
  "steering-required",
  "approval-required",
  "user-input-required"
] as const satisfies readonly TaskWaitingReason[];
const TASK_COMPLETED_REASONS = [
  "completed"
] as const satisfies readonly TaskTerminalReason[];
const TASK_FAILED_REASONS = [
  "max-iterations",
  "unrecoverable-error"
] as const satisfies readonly TaskTerminalReason[];
const TASK_CANCELLED_REASONS = [
  "cancelled"
] as const satisfies readonly TaskTerminalReason[];
const TOOL_NAMES = ["read_file", "list_files", "search_files"] as const;

const RUNTIME_EVENT_TYPES = [
  "task.started",
  "task.waiting",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "task.steering.received",
  "tool.call.requested",
  "tool.call.started",
  "tool.call.completed",
  "tool.call.failed"
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];
export type RuntimeToolName = (typeof TOOL_NAMES)[number];

export interface RuntimeEventOutputReference {
  fullOutputStored: boolean;
  reason: string;
  path?: string;
}

export interface RuntimeEventPayloadMap {
  "task.started": {
    phase: (typeof RUNTIME_LOOP_PHASES)[number];
    status: (typeof TASK_STARTED_STATUSES)[number];
    providerName: string;
    model: string;
  };
  "task.waiting": {
    reason: (typeof TASK_WAITING_REASONS)[number];
    message: string;
  };
  "task.completed": {
    reason: (typeof TASK_COMPLETED_REASONS)[number];
    message: string;
  };
  "task.failed": {
    reason: (typeof TASK_FAILED_REASONS)[number];
    message: string;
  };
  "task.cancelled": {
    reason: (typeof TASK_CANCELLED_REASONS)[number];
    message: string;
    note: string;
  };
  "task.steering.received": {
    note: string;
  };
  "tool.call.requested": {
    cwd: string;
    query?: string;
    status: "requested";
    summary: string;
    targetPath?: string;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.started": {
    cwd: string;
    query?: string;
    status: "started";
    summary: string;
    targetPath?: string;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.completed": {
    cwd: string;
    outputReference?: RuntimeEventOutputReference;
    query?: string;
    status: "completed";
    summary: string;
    targetPath?: string;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
  "tool.call.failed": {
    cwd: string;
    errorCode: string;
    message: string;
    query?: string;
    status: "failed";
    summary: string;
    targetPath?: string;
    toolCallId: string;
    toolName: RuntimeToolName;
  };
}

export type RuntimeEventPayload<T extends RuntimeEventType> =
  RuntimeEventPayloadMap[T];

export interface RuntimeEventContext {
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  createdAt: string;
}

interface RuntimeEventBase<T extends RuntimeEventType> {
  schemaVersion: typeof RUNTIME_EVENT_SCHEMA_VERSION;
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  type: T;
  createdAt: string;
  payload: RuntimeEventPayload<T>;
}

export type RuntimeEventRecord<T extends RuntimeEventType = RuntimeEventType> =
  {
    [EventType in T]: RuntimeEventBase<EventType>;
  }[T];

export type RuntimeEventListener = (event: RuntimeEventRecord) => void;

export function createRuntimeEventRecord<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: RuntimeEventPayload<T>
): RuntimeEventRecord<T> {
  return {
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    eventId: context.eventId,
    sessionId: context.sessionId,
    taskId: context.taskId,
    correlationId: context.correlationId,
    type,
    createdAt: context.createdAt,
    payload
  };
}

export function validateRuntimeEvent(
  event: unknown
): Result<RuntimeEventRecord, SpriteError> {
  if (!isPlainObject(event)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event must be a plain object."
      )
    );
  }

  if (event.schemaVersion !== RUNTIME_EVENT_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unsupported runtime event schemaVersion '${String(event.schemaVersion)}'.`
      )
    );
  }

  const eventId = requireStringField(event, "eventId");
  const sessionId = requireStringField(event, "sessionId");
  const taskId = requireStringField(event, "taskId");
  const correlationId = requireStringField(event, "correlationId");
  const createdAt = requireStringField(event, "createdAt");
  const eventType = requireStringField(event, "type");

  if (eventId.ok === false) {
    return err(eventId.error);
  }

  if (sessionId.ok === false) {
    return err(sessionId.error);
  }

  if (taskId.ok === false) {
    return err(taskId.error);
  }

  if (correlationId.ok === false) {
    return err(correlationId.error);
  }

  if (createdAt.ok === false) {
    return err(createdAt.error);
  }

  if (eventType.ok === false) {
    return err(eventType.error);
  }

  if (!isRuntimeEventType(eventType.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unknown runtime event type '${eventType.value}'.`
      )
    );
  }

  if (!isIsoUtcTimestamp(createdAt.value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event createdAt '${createdAt.value}' must be a valid ISO 8601 UTC timestamp.`
      )
    );
  }

  if (!isPlainObject(event.payload)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event payload must be a plain object."
      )
    );
  }

  const context: RuntimeEventContext = {
    eventId: eventId.value,
    sessionId: sessionId.value,
    taskId: taskId.value,
    correlationId: correlationId.value,
    createdAt: createdAt.value
  };

  switch (eventType.value) {
    case "task.started": {
      const phase = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "phase",
        RUNTIME_LOOP_PHASES
      );
      const status = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "status",
        TASK_STARTED_STATUSES
      );
      const providerName = requirePayloadString(
        eventType.value,
        event.payload,
        "providerName"
      );
      const model = requirePayloadString(
        eventType.value,
        event.payload,
        "model"
      );

      if (phase.ok === false) {
        return err(phase.error);
      }

      if (status.ok === false) {
        return err(status.error);
      }

      if (providerName.ok === false) {
        return err(providerName.error);
      }

      if (model.ok === false) {
        return err(model.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        phase: phase.value,
        status: status.value,
        providerName: providerName.value,
        model: model.value
      });
    }
    case "task.waiting": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_WAITING_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.completed": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_COMPLETED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.failed": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_FAILED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value
      });
    }
    case "task.cancelled": {
      const reason = requirePayloadLiteral(
        eventType.value,
        event.payload,
        "reason",
        TASK_CANCELLED_REASONS
      );
      const message = requirePayloadString(
        eventType.value,
        event.payload,
        "message"
      );
      const note = requirePayloadString(eventType.value, event.payload, "note");

      if (reason.ok === false) {
        return err(reason.error);
      }

      if (message.ok === false) {
        return err(message.error);
      }

      if (note.ok === false) {
        return err(note.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        reason: reason.value,
        message: message.value,
        note: note.value
      });
    }
    case "task.steering.received": {
      const note = requirePayloadString(eventType.value, event.payload, "note");

      if (note.ok === false) {
        return err(note.error);
      }

      return okRuntimeEvent(context, eventType.value, {
        note: note.value
      });
    }
    case "tool.call.requested": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "requested"
      );
    }
    case "tool.call.started": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "started"
      );
    }
    case "tool.call.completed": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "completed"
      );
    }
    case "tool.call.failed": {
      return validateToolLifecycleEvent(
        context,
        eventType.value,
        event.payload,
        "failed"
      );
    }
  }

  return err(
    new SpriteError(
      "INVALID_RUNTIME_EVENT",
      `Unknown runtime event type '${eventType.value}'.`
    )
  );
}

function validateToolLifecycleEvent<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: Record<string, unknown>,
  expectedStatus: string
): Result<RuntimeEventRecord<T>, SpriteError> {
  const forbiddenField = findForbiddenToolPayloadField(payload);

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload must not include raw content field '${forbiddenField}'.`
      )
    );
  }

  const cwd = requirePayloadString(type, payload, "cwd");
  const status = requirePayloadLiteral(type, payload, "status", [
    expectedStatus
  ] as const);
  const summary = requirePayloadString(type, payload, "summary");
  const toolCallId = requirePayloadString(type, payload, "toolCallId");
  const toolName = requirePayloadLiteral(type, payload, "toolName", TOOL_NAMES);

  if (cwd.ok === false) {
    return err(cwd.error);
  }

  if (status.ok === false) {
    return err(status.error);
  }

  if (summary.ok === false) {
    return err(summary.error);
  }

  if (toolCallId.ok === false) {
    return err(toolCallId.error);
  }

  if (toolName.ok === false) {
    return err(toolName.error);
  }

  const targetPath = optionalPayloadString(type, payload, "targetPath");
  const query = optionalPayloadString(type, payload, "query");

  if (targetPath.ok === false) {
    return err(targetPath.error);
  }

  if (query.ok === false) {
    return err(query.error);
  }

  const basePayload = {
    cwd: cwd.value,
    ...(query.value === undefined ? {} : { query: query.value }),
    status: status.value,
    summary: summary.value,
    ...(targetPath.value === undefined ? {} : { targetPath: targetPath.value }),
    toolCallId: toolCallId.value,
    toolName: toolName.value
  };

  if (type === "tool.call.completed") {
    const outputReference = optionalOutputReference(type, payload);

    if (outputReference.ok === false) {
      return err(outputReference.error);
    }

    return okRuntimeEvent(context, type, {
      ...basePayload,
      ...(outputReference.value === undefined
        ? {}
        : { outputReference: outputReference.value })
    } as RuntimeEventPayload<T>);
  }

  if (type === "tool.call.failed") {
    const errorCode = requirePayloadString(type, payload, "errorCode");
    const message = requirePayloadString(type, payload, "message");

    if (errorCode.ok === false) {
      return err(errorCode.error);
    }

    if (message.ok === false) {
      return err(message.error);
    }

    return okRuntimeEvent(context, type, {
      ...basePayload,
      errorCode: errorCode.value,
      message: message.value
    } as RuntimeEventPayload<T>);
  }

  return okRuntimeEvent(context, type, basePayload as RuntimeEventPayload<T>);
}

function okRuntimeEvent<T extends RuntimeEventType>(
  context: RuntimeEventContext,
  type: T,
  payload: RuntimeEventPayload<T>
): Result<RuntimeEventRecord<T>, SpriteError> {
  return { ok: true, value: createRuntimeEventRecord(context, type, payload) };
}

function requireStringField(
  event: Record<string, unknown>,
  field: string
): Result<string, SpriteError> {
  const value = event[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event field '${field}' must be a non-empty string.`
      )
    );
  }

  return { ok: true, value };
}

function requirePayloadString(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string, SpriteError> {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' is missing required payload field '${key}'.`
      )
    );
  }

  return { ok: true, value };
}

function optionalPayloadString(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string
): Result<string | undefined, SpriteError> {
  const value = payload[key];

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' optional payload field '${key}' must be a non-empty string when provided.`
      )
    );
  }

  return { ok: true, value };
}

function optionalOutputReference(
  type: RuntimeEventType,
  payload: Record<string, unknown>
): Result<RuntimeEventOutputReference | undefined, SpriteError> {
  const value = payload.outputReference;

  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!isPlainObject(value)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' outputReference must be a plain object.`
      )
    );
  }

  if (typeof value.fullOutputStored !== "boolean") {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' outputReference.fullOutputStored must be a boolean.`
      )
    );
  }

  const reason = requirePayloadString(type, value, "reason");
  const outputPath = optionalPayloadString(type, value, "path");

  if (reason.ok === false) {
    return err(reason.error);
  }

  if (outputPath.ok === false) {
    return err(outputPath.error);
  }

  return {
    ok: true,
    value: {
      fullOutputStored: value.fullOutputStored,
      reason: reason.value,
      ...(outputPath.value === undefined ? {} : { path: outputPath.value })
    }
  };
}

function requirePayloadLiteral<T extends string>(
  type: RuntimeEventType,
  payload: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[]
): Result<T, SpriteError> {
  const value = requirePayloadString(type, payload, key);

  if (value.ok === false) {
    return err(value.error);
  }

  if (!allowedValues.includes(value.value as T)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event '${type}' payload field '${key}' has unsupported value '${value.value}'.`
      )
    );
  }

  return { ok: true, value: value.value as T };
}

function isRuntimeEventType(value: string): value is RuntimeEventType {
  return RUNTIME_EVENT_TYPES.includes(value as RuntimeEventType);
}

function findForbiddenToolPayloadField(
  payload: Record<string, unknown>
): string | null {
  const forbiddenFields = new Set([
    "content",
    "matches",
    "rawContent",
    "rawSnippet",
    "snippet",
    "snippets"
  ]);

  for (const key of Object.keys(payload)) {
    if (forbiddenFields.has(key)) {
      return key;
    }
  }

  return null;
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!value.endsWith("Z")) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

export class RuntimeEventBus {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly history: RuntimeEventRecord[] = [];

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: RuntimeEventRecord): Result<RuntimeEventRecord, SpriteError> {
    const validation = validateRuntimeEvent(event);

    if (!validation.ok) {
      return validation;
    }

    const storedEvent = cloneRuntimeEventRecord(validation.value);
    this.history.push(storedEvent);

    for (const listener of this.listeners) {
      try {
        listener(cloneRuntimeEventRecord(storedEvent));
      } catch {
        // Subscriber failures must not control runtime state transitions.
      }
    }

    return { ok: true, value: cloneRuntimeEventRecord(storedEvent) };
  }

  getHistory(taskId?: string): RuntimeEventRecord[] {
    if (taskId === undefined) {
      return this.history.map(cloneRuntimeEventRecord);
    }

    return this.history
      .filter((event) => event.taskId === taskId)
      .map(cloneRuntimeEventRecord);
  }
}

function cloneRuntimeEventRecord<T extends RuntimeEventRecord>(event: T): T {
  return {
    ...event,
    payload: clonePayloadObject(event.payload) as T["payload"]
  };
}

function clonePayloadObject(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return clonePayloadValue(payload, new WeakMap()) as Record<string, unknown>;
}

function clonePayloadValue(
  value: unknown,
  seen: WeakMap<object, unknown>
): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const clone: unknown[] = [];
    seen.set(value, clone);

    for (const item of value) {
      clone.push(clonePayloadValue(item, seen));
    }

    return clone;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const clone: Record<string, unknown> = {};
    seen.set(value, clone);

    for (const [key, nestedValue] of Object.entries(value)) {
      clone[key] = clonePayloadValue(nestedValue, seen);
    }

    return clone;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
