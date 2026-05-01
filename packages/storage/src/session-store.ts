import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SpriteError, err, type Result } from "@sprite/shared";

export const SESSION_STATE_SCHEMA_VERSION = 1 as const;
const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SESSION_SNAPSHOT_TASK_STATUSES = [
  "planned",
  "waiting-for-input",
  "completed",
  "cancelled",
  "max-iterations",
  "failed"
] as const;
export const SESSION_SNAPSHOT_RUNTIME_PHASES = [
  "plan",
  "act",
  "observe"
] as const;
const SESSION_SNAPSHOT_TASK_STATUS_SET: ReadonlySet<string> = new Set(
  SESSION_SNAPSHOT_TASK_STATUSES
);
const SESSION_SNAPSHOT_RUNTIME_PHASE_SET: ReadonlySet<string> = new Set(
  SESSION_SNAPSHOT_RUNTIME_PHASES
);

export type SessionSnapshotTaskStatus =
  (typeof SESSION_SNAPSHOT_TASK_STATUSES)[number];
export type SessionSnapshotRuntimePhase =
  (typeof SESSION_SNAPSHOT_RUNTIME_PHASES)[number];

export interface SessionArtifactPaths {
  rootDir: string;
  eventsPath: string;
  statePath: string;
}

export interface SessionEventRecord {
  schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
  sessionId: string;
  taskId: string;
  correlationId: string;
  eventId: string;
  type: string;
  createdAt: string;
  payload: object;
}

export interface SessionStateSnapshot {
  schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
  sessionId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  filesChanged: string[];
  filesProposedForChange: string[];
  filesRead: string[];
  lastError?: string;
  lastEventId?: string;
  lastEventType?: string;
  latestTask?: {
    taskId: string;
    correlationId: string;
    status: SessionSnapshotTaskStatus;
    currentPhase: SessionSnapshotRuntimePhase;
    goal: string;
  };
  nextStep?: string;
  pendingApprovalCount: number;
}

export interface SessionStore {
  ensureSession(
    sessionId: string,
    cwd: string,
    createdAt: string
  ): Result<SessionArtifactPaths, SpriteError>;
  appendEvents(
    sessionId: string,
    events: readonly SessionEventRecord[]
  ): Result<void, SpriteError>;
  writeStateSnapshot(snapshot: SessionStateSnapshot): Result<void, SpriteError>;
}

export class LocalSessionStore implements SessionStore {
  private readonly sessionPaths = new Map<string, SessionArtifactPaths>();

  ensureSession(
    sessionId: string,
    cwd: string,
    createdAt: string
  ): Result<SessionArtifactPaths, SpriteError> {
    const existingPaths = this.sessionPaths.get(sessionId);

    if (existingPaths !== undefined) {
      return { ok: true, value: { ...existingPaths } };
    }

    const paths = resolveSessionArtifactPaths(cwd, sessionId);

    if (!paths.ok) {
      return paths;
    }

    try {
      mkdirSync(paths.value.rootDir, { recursive: true });
      writeFileSync(paths.value.eventsPath, "", { flag: "a" });
      this.sessionPaths.set(sessionId, paths.value);

      if (!existsSync(paths.value.statePath)) {
        const initialSnapshot = this.writeStateSnapshot({
          schemaVersion: SESSION_STATE_SCHEMA_VERSION,
          sessionId,
          cwd: path.resolve(cwd),
          createdAt,
          updatedAt: createdAt,
          eventCount: 0,
          filesChanged: [],
          filesProposedForChange: [],
          filesRead: [],
          pendingApprovalCount: 0
        });

        if (!initialSnapshot.ok) {
          this.sessionPaths.delete(sessionId);
          return err(initialSnapshot.error);
        }
      }

      return { ok: true, value: { ...paths.value } };
    } catch (error: unknown) {
      this.sessionPaths.delete(sessionId);
      return err(toSessionStorageError("SESSION_STORAGE_ERROR", error));
    }
  }

  appendEvents(
    sessionId: string,
    events: readonly SessionEventRecord[]
  ): Result<void, SpriteError> {
    if (events.length === 0) {
      return { ok: true, value: undefined };
    }

    const paths = this.getKnownSessionPaths(sessionId);

    if (!paths.ok) {
      return paths;
    }

    try {
      const lines = events.map((event) => {
        const validation = validateSessionEventRecord(sessionId, event);

        if (!validation.ok) {
          throw validation.error;
        }

        return JSON.stringify(event);
      });

      if (lines.some((line) => line === undefined)) {
        return err(
          new SpriteError(
            "SESSION_EVENT_INVALID",
            "Session event records must be JSON serializable."
          )
        );
      }

      const payload = lines.join("\n");
      writeFileSync(paths.value.eventsPath, `${payload}\n`, { flag: "a" });

      return { ok: true, value: undefined };
    } catch (error: unknown) {
      return err(toSessionStorageError("SESSION_EVENT_APPEND_FAILED", error));
    }
  }

  writeStateSnapshot(
    snapshot: SessionStateSnapshot
  ): Result<void, SpriteError> {
    const paths = this.getKnownSessionPaths(snapshot.sessionId);

    if (!paths.ok) {
      return paths;
    }

    try {
      const validation = validateSessionStateSnapshot(snapshot);

      if (!validation.ok) {
        return err(validation.error);
      }

      const normalizedSnapshot = normalizeSessionStateSnapshot(snapshot);
      const tempPath = path.join(
        paths.value.rootDir,
        `.state.json.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
      );
      writeFileSync(
        tempPath,
        `${JSON.stringify(normalizedSnapshot, null, 2)}\n`
      );
      renameSync(tempPath, paths.value.statePath);

      return { ok: true, value: undefined };
    } catch (error: unknown) {
      return err(toSessionStorageError("SESSION_STATE_WRITE_FAILED", error));
    }
  }

  private getKnownSessionPaths(
    sessionId: string
  ): Result<SessionArtifactPaths, SpriteError> {
    const paths = this.sessionPaths.get(sessionId);

    if (paths === undefined) {
      return err(
        new SpriteError(
          "SESSION_NOT_INITIALIZED",
          `Session ${sessionId} has not been initialized.`
        )
      );
    }

    return { ok: true, value: { ...paths } };
  }
}

export function createSessionId(): string {
  return `ses_${randomUUID()}`;
}

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

export function createLocalSessionStore(): LocalSessionStore {
  return new LocalSessionStore();
}

export function resolveSessionArtifactPaths(
  cwd: string,
  sessionId: string
): Result<SessionArtifactPaths, SpriteError> {
  if (!isValidSessionId(sessionId)) {
    return err(
      new SpriteError(
        "SESSION_ID_INVALID",
        "Session ID must use the ses_ prefix and contain only safe identifier characters."
      )
    );
  }

  const projectRoot = path.resolve(cwd);
  const sessionsRoot = path.resolve(projectRoot, ".sprite", "sessions");
  const rootDir = path.resolve(sessionsRoot, sessionId);
  const relative = path.relative(sessionsRoot, rootDir);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return err(
      new SpriteError(
        "SESSION_PATH_ESCAPE",
        "Session artifact path must remain inside the project-local session root."
      )
    );
  }

  return {
    ok: true,
    value: {
      rootDir,
      eventsPath: path.join(rootDir, "events.ndjson"),
      statePath: path.join(rootDir, "state.json")
    }
  };
}

function toSessionStorageError(code: string, error: unknown): SpriteError {
  if (error instanceof SpriteError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new SpriteError(code, message);
}

function normalizeSessionStateSnapshot(
  snapshot: SessionStateSnapshot
): SessionStateSnapshot {
  return {
    ...snapshot,
    cwd: path.resolve(snapshot.cwd)
  };
}

function validateSessionStateSnapshot(
  snapshot: SessionStateSnapshot
): Result<void, SpriteError> {
  if (snapshot.latestTask === undefined) {
    return { ok: true, value: undefined };
  }

  if (!SESSION_SNAPSHOT_TASK_STATUS_SET.has(snapshot.latestTask.status)) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session snapshot latestTask.status is not supported."
      )
    );
  }

  if (
    !SESSION_SNAPSHOT_RUNTIME_PHASE_SET.has(snapshot.latestTask.currentPhase)
  ) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session snapshot latestTask.currentPhase is not supported."
      )
    );
  }

  return { ok: true, value: undefined };
}

function validateSessionEventRecord(
  sessionId: string,
  event: SessionEventRecord
): Result<void, SpriteError> {
  if (event.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "SESSION_EVENT_INVALID",
        "Session event schemaVersion is not supported."
      )
    );
  }

  if (event.sessionId !== sessionId) {
    return err(
      new SpriteError(
        "SESSION_EVENT_SCOPE_MISMATCH",
        "Session event sessionId must match the destination session."
      )
    );
  }

  for (const field of [
    "createdAt",
    "correlationId",
    "eventId",
    "taskId",
    "type"
  ] as const) {
    if (typeof event[field] !== "string" || event[field].length === 0) {
      return err(
        new SpriteError(
          "SESSION_EVENT_INVALID",
          `Session event ${field} must be a non-empty string.`
        )
      );
    }
  }

  if (!isPlainPayloadObject(event.payload)) {
    return err(
      new SpriteError(
        "SESSION_EVENT_INVALID",
        "Session event payload must be a plain object."
      )
    );
  }

  return { ok: true, value: undefined };
}

function isPlainPayloadObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
