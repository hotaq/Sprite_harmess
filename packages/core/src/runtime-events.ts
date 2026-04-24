import { SpriteError, err, type Result } from "@sprite/shared";

export const RUNTIME_EVENT_SCHEMA_VERSION = 1 as const;

const RUNTIME_EVENT_TYPES = [
  "task.started",
  "task.waiting",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "task.steering.received"
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export interface RuntimeEventContext {
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  createdAt: string;
}

export interface RuntimeEventRecord {
  schemaVersion: typeof RUNTIME_EVENT_SCHEMA_VERSION;
  eventId: string;
  sessionId: string;
  taskId: string;
  correlationId: string;
  type: RuntimeEventType;
  createdAt: string;
  payload: Record<string, unknown>;
}

export type RuntimeEventListener = (event: RuntimeEventRecord) => void;

export function createRuntimeEventRecord(
  context: RuntimeEventContext,
  type: RuntimeEventType,
  payload: Record<string, unknown>
): RuntimeEventRecord {
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
  event: RuntimeEventRecord
): Result<RuntimeEventRecord, SpriteError> {
  if (event.schemaVersion !== RUNTIME_EVENT_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unsupported runtime event schemaVersion '${String(event.schemaVersion)}'.`
      )
    );
  }

  const stringFields: Array<[string, string]> = [
    ["eventId", event.eventId],
    ["sessionId", event.sessionId],
    ["taskId", event.taskId],
    ["correlationId", event.correlationId],
    ["createdAt", event.createdAt],
    ["type", event.type]
  ];

  for (const [field, value] of stringFields) {
    if (value.trim().length === 0) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event field '${field}' must be a non-empty string.`
        )
      );
    }
  }

  if (!RUNTIME_EVENT_TYPES.includes(event.type)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Unknown runtime event type '${event.type}'.`
      )
    );
  }

  if (!isIsoUtcTimestamp(event.createdAt)) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        `Runtime event createdAt '${event.createdAt}' must be a valid ISO 8601 UTC timestamp.`
      )
    );
  }

  if (
    typeof event.payload !== "object" ||
    event.payload === null ||
    Array.isArray(event.payload)
  ) {
    return err(
      new SpriteError(
        "INVALID_RUNTIME_EVENT",
        "Runtime event payload must be a plain object."
      )
    );
  }

  switch (event.type) {
    case "task.started":
      return requirePayloadKeys(event, ["phase", "status"]);
    case "task.waiting":
      return requirePayloadKeys(event, ["reason", "message"]);
    case "task.completed":
    case "task.failed":
      return requirePayloadKeys(event, ["reason", "message"]);
    case "task.cancelled":
      return requirePayloadKeys(event, ["reason", "message", "note"]);
    case "task.steering.received":
      return requirePayloadKeys(event, ["note"]);
  }
}

function requirePayloadKeys(
  event: RuntimeEventRecord,
  keys: string[]
): Result<RuntimeEventRecord, SpriteError> {
  for (const key of keys) {
    const value = event.payload[key];

    if (typeof value !== "string" || value.trim().length === 0) {
      return err(
        new SpriteError(
          "INVALID_RUNTIME_EVENT",
          `Runtime event '${event.type}' is missing required payload field '${key}'.`
        )
      );
    }
  }

  return { ok: true, value: event };
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

function cloneRuntimeEventRecord(
  event: RuntimeEventRecord
): RuntimeEventRecord {
  return {
    ...event,
    payload: clonePayloadObject(event.payload)
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
