import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  type Dirent
} from "node:fs";
import path from "node:path";
import {
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  type Result
} from "@sprite/shared";

export const SESSION_STATE_SCHEMA_VERSION = 1 as const;
const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_TASK_ID_PATTERN = /^task_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_COMPACTION_ARTIFACT_ID_PATTERN = /^cmp-[a-z0-9][a-z0-9-]*$/;
const RETROSPECTIVE_TERMINAL_STATUSES = [
  "cancelled",
  "completed",
  "failed",
  "max-iterations"
] as const;
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
export const SESSION_SNAPSHOT_PLAN_STEP_STATUSES = [
  "completed",
  "pending"
] as const;
export const DEFAULT_SESSION_RECENT_EVENT_LIMIT = 20;
export const MAX_SESSION_RECENT_EVENT_LIMIT = 100;
export const DEFAULT_LEARNING_REVIEW_SESSION_SCAN_LIMIT = 20;
export const DEFAULT_LEARNING_REVIEW_ARTIFACT_SCAN_LIMIT = 50;
export const DEFAULT_LEARNING_REVIEW_CANDIDATE_LIMIT = 100;
const SESSION_SNAPSHOT_TASK_STATUS_SET: ReadonlySet<string> = new Set(
  SESSION_SNAPSHOT_TASK_STATUSES
);
const SESSION_SNAPSHOT_RUNTIME_PHASE_SET: ReadonlySet<string> = new Set(
  SESSION_SNAPSHOT_RUNTIME_PHASES
);
const SESSION_SNAPSHOT_PLAN_STEP_STATUS_SET: ReadonlySet<string> = new Set(
  SESSION_SNAPSHOT_PLAN_STEP_STATUSES
);

export type SessionSnapshotTaskStatus =
  (typeof SESSION_SNAPSHOT_TASK_STATUSES)[number];
export type SessionSnapshotRuntimePhase =
  (typeof SESSION_SNAPSHOT_RUNTIME_PHASES)[number];
export type SessionSnapshotPlanStepStatus =
  (typeof SESSION_SNAPSHOT_PLAN_STEP_STATUSES)[number];

export interface SessionArtifactPaths {
  rootDir: string;
  eventsPath: string;
  statePath: string;
  compactionsDir: string;
  learningReviewsDir: string;
  retrospectivesDir: string;
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

export interface SessionSnapshotPlanStep {
  phase: SessionSnapshotRuntimePhase;
  status: SessionSnapshotPlanStepStatus;
  summary: string;
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
    latestPlan?: SessionSnapshotPlanStep[];
  };
  nextStep?: string;
  pendingApprovalCount: number;
}

export interface ReadSessionArtifactsOptions {
  recentEventLimit?: number;
}

export interface ReadSessionArtifactsResult {
  events: SessionEventRecord[];
  paths: SessionArtifactPaths;
  persistedEventCount: number;
  recentEvents: SessionEventRecord[];
  state: SessionStateSnapshot;
}

export interface ReadLearningReviewLessonCandidateOptions {
  artifactLimit?: number;
  candidateLimit?: number;
  sessionLimit?: number;
}

export interface ReadSessionForResumeResult {
  paths: SessionArtifactPaths;
  persistedEventCount: number;
  events: SessionEventRecord[];
  state: SessionStateSnapshot;
}

export interface SessionCompactionArtifact {
  artifactId: string;
  sessionId: string;
  schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
  createdAt: string;
  summary: object;
}

export interface StoredLearningReviewArtifact {
  correlationId: string;
  createdAt: string;
  evidence: object;
  facts: readonly object[];
  lessons: readonly object[];
  memoryCandidates: readonly object[];
  missedAssumptions: readonly object[];
  mistakes: readonly object[];
  mode: string;
  schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
  sessionId: string;
  skillSignals: readonly object[];
  summary: string;
  taskId: string;
  terminalStatus: "completed";
  testGaps: readonly object[];
}

export interface StoredLearningReviewLessonCandidate {
  createdAt: string;
  mode: string;
  preview: string;
  section: "fact" | "lesson" | "test_gap";
  sourceEventIds: string[];
  sourceId: string;
  sourceSessionId: string;
  sourceTaskId: string;
}

export interface StoredRetrospectiveReviewArtifact {
  commandsRun: readonly object[];
  context: object;
  correlationId: string;
  createdAt: string;
  evidence: object;
  eventHistoryReference: object;
  failureReason?: string;
  filesTouched: readonly string[];
  finalStatus: (typeof RETROSPECTIVE_TERMINAL_STATUSES)[number];
  memoryCandidates: readonly object[];
  missedAssumptions: readonly object[];
  nextTimeImprovements: readonly object[];
  outcome?: string;
  schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
  sessionId: string;
  skillSignals: readonly object[];
  summary: string;
  taskGoal: string;
  taskId: string;
  terminalStatus: (typeof RETROSPECTIVE_TERMINAL_STATUSES)[number];
}

export interface WriteSessionCompactionArtifactResult {
  artifactId: string;
  artifactPath: string;
}

export interface WriteLearningReviewArtifactResult {
  artifactPath: string;
  taskId: string;
}

export interface WriteRetrospectiveReviewArtifactResult {
  artifactPath: string;
  taskId: string;
}

interface ReadSessionArtifactBundle {
  paths: SessionArtifactPaths;
  events: SessionEventRecord[];
  state: SessionStateSnapshot;
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
  writeLearningReview?(
    sessionId: string,
    review: StoredLearningReviewArtifact
  ): Result<WriteLearningReviewArtifactResult, SpriteError>;
  writeRetrospectiveReview?(
    sessionId: string,
    review: StoredRetrospectiveReviewArtifact
  ): Result<WriteRetrospectiveReviewArtifactResult, SpriteError>;
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
      mkdirSync(paths.value.compactionsDir, { recursive: true });
      mkdirSync(paths.value.learningReviewsDir, { recursive: true });
      mkdirSync(paths.value.retrospectivesDir, { recursive: true });
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

  writeLearningReview(
    sessionId: string,
    review: StoredLearningReviewArtifact
  ): Result<WriteLearningReviewArtifactResult, SpriteError> {
    const paths = this.getKnownSessionPaths(sessionId);

    if (!paths.ok) {
      return err(paths.error);
    }

    const validation = validateStoredLearningReviewArtifact(sessionId, review);

    if (!validation.ok) {
      return err(validation.error);
    }

    const artifactPath = resolveLearningReviewArtifactPath(
      paths.value,
      validation.value.taskId
    );

    if (!artifactPath.ok) {
      return err(artifactPath.error);
    }

    try {
      mkdirSync(paths.value.learningReviewsDir, { recursive: true });
      const tempPath = path.join(
        paths.value.learningReviewsDir,
        `.${validation.value.taskId}.json.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
      );
      writeFileSync(
        tempPath,
        `${JSON.stringify(validation.value, null, 2)}\n`
      );
      renameSync(tempPath, artifactPath.value);

      return okSession({
        artifactPath: artifactPath.value,
        taskId: validation.value.taskId
      });
    } catch (error: unknown) {
      return err(
        toSessionStorageError("SESSION_LEARNING_REVIEW_WRITE_FAILED", error)
      );
    }
  }

  writeRetrospectiveReview(
    sessionId: string,
    review: StoredRetrospectiveReviewArtifact
  ): Result<WriteRetrospectiveReviewArtifactResult, SpriteError> {
    const paths = this.getKnownSessionPaths(sessionId);

    if (!paths.ok) {
      return err(paths.error);
    }

    const validation = validateStoredRetrospectiveReviewArtifact(
      sessionId,
      review
    );

    if (!validation.ok) {
      return err(validation.error);
    }

    const artifactPath = resolveRetrospectiveReviewArtifactPath(
      paths.value,
      validation.value.taskId
    );

    if (!artifactPath.ok) {
      return err(artifactPath.error);
    }

    try {
      mkdirSync(paths.value.retrospectivesDir, { recursive: true });
      const tempPath = path.join(
        paths.value.retrospectivesDir,
        `.${validation.value.taskId}.json.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
      );
      writeFileSync(
        tempPath,
        `${JSON.stringify(validation.value, null, 2)}\n`
      );
      renameSync(tempPath, artifactPath.value);

      return okSession({
        artifactPath: artifactPath.value,
        taskId: validation.value.taskId
      });
    } catch (error: unknown) {
      return err(
        toSessionStorageError("SESSION_RETROSPECTIVE_REVIEW_WRITE_FAILED", error)
      );
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

export function isValidCompactionArtifactId(artifactId: string): boolean {
  return SESSION_COMPACTION_ARTIFACT_ID_PATTERN.test(artifactId);
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
      statePath: path.join(rootDir, "state.json"),
      compactionsDir: path.join(rootDir, "compactions"),
      learningReviewsDir: path.join(rootDir, "learning-reviews"),
      retrospectivesDir: path.join(rootDir, "retrospectives")
    }
  };
}

export function resolveLearningReviewArtifactPath(
  paths: SessionArtifactPaths,
  taskId: string
): Result<string, SpriteError> {
  if (!SESSION_TASK_ID_PATTERN.test(taskId)) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_TASK_ID_INVALID",
        "Learning review task ID must use the task_ prefix and contain only safe identifier characters."
      )
    );
  }

  const learningReviewsDir = path.resolve(paths.learningReviewsDir);
  const artifactPath = path.resolve(learningReviewsDir, `${taskId}.json`);
  const relative = path.relative(learningReviewsDir, artifactPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_PATH_ESCAPE",
        "Learning review artifact path must remain inside the session learning-reviews directory."
      )
    );
  }

  return okSession(artifactPath);
}

export function resolveRetrospectiveReviewArtifactPath(
  paths: SessionArtifactPaths,
  taskId: string
): Result<string, SpriteError> {
  if (!SESSION_TASK_ID_PATTERN.test(taskId)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_TASK_ID_INVALID",
        "Retrospective review task ID must use the task_ prefix and contain only safe identifier characters."
      )
    );
  }

  const retrospectivesDir = path.resolve(paths.retrospectivesDir);
  const artifactPath = path.resolve(retrospectivesDir, `${taskId}.json`);
  const relative = path.relative(retrospectivesDir, artifactPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_PATH_ESCAPE",
        "Retrospective review artifact path must remain inside the session retrospectives directory."
      )
    );
  }

  return okSession(artifactPath);
}

export function resolveSessionCompactionArtifactPath(
  paths: SessionArtifactPaths,
  artifactId: string
): Result<string, SpriteError> {
  if (!isValidCompactionArtifactId(artifactId)) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_ID_INVALID",
        "Compaction artifact ID must use the cmp- prefix and contain only kebab-case identifier characters."
      )
    );
  }

  const compactionsDir = path.resolve(paths.compactionsDir);
  const artifactPath = path.resolve(compactionsDir, `${artifactId}.json`);
  const relative = path.relative(compactionsDir, artifactPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_PATH_ESCAPE",
        "Compaction artifact path must remain inside the session compactions directory."
      )
    );
  }

  return okSession(artifactPath);
}

export function writeSessionCompactionArtifact(
  paths: SessionArtifactPaths,
  artifact: SessionCompactionArtifact
): Result<WriteSessionCompactionArtifactResult, SpriteError> {
  const validation = validateSessionCompactionArtifact(artifact);

  if (!validation.ok) {
    return err(validation.error);
  }

  const artifactPath = resolveSessionCompactionArtifactPath(
    paths,
    artifact.artifactId
  );

  if (!artifactPath.ok) {
    return err(artifactPath.error);
  }

  try {
    if (existsSync(artifactPath.value)) {
      return err(
        new SpriteError(
          "SESSION_COMPACTION_ARTIFACT_EXISTS",
          "Compaction artifact already exists; use a new artifact ID to preserve the audit trail."
        )
      );
    }

    mkdirSync(paths.compactionsDir, { recursive: true });
    const tempPath = path.join(
      paths.compactionsDir,
      `.${artifact.artifactId}.json.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
    );
    writeFileSync(tempPath, `${JSON.stringify(validation.value, null, 2)}\n`);
    renameSync(tempPath, artifactPath.value);

    return okSession({
      artifactId: artifact.artifactId,
      artifactPath: artifactPath.value
    });
  } catch (error: unknown) {
    return err(
      toSessionStorageError("SESSION_COMPACTION_ARTIFACT_WRITE_FAILED", error)
    );
  }
}

export function readSessionCompactionArtifact(
  paths: SessionArtifactPaths,
  artifactId: string
): Result<SessionCompactionArtifact, SpriteError> {
  const artifactPath = resolveSessionCompactionArtifactPath(paths, artifactId);

  if (!artifactPath.ok) {
    return err(artifactPath.error);
  }

  let raw: string;

  try {
    raw = readFileSync(artifactPath.value, "utf8");
  } catch (error: unknown) {
    return err(
      toSessionStorageError("SESSION_COMPACTION_ARTIFACT_READ_FAILED", error)
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    return err(
      toSessionStorageError("SESSION_COMPACTION_ARTIFACT_INVALID_JSON", error)
    );
  }

  const validation = validateSessionCompactionArtifact(parsed);

  if (!validation.ok) {
    return err(validation.error);
  }

  if (validation.value.artifactId !== artifactId) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_SCOPE_MISMATCH",
        "Compaction artifact ID must match the requested artifact."
      )
    );
  }

  return okSession(validation.value);
}

function readSessionArtifactBundle(
  cwd: string,
  sessionId: string
): Result<ReadSessionArtifactBundle, SpriteError> {
  const paths = resolveSessionArtifactPaths(cwd, sessionId);

  if (!paths.ok) {
    return paths;
  }

  if (!existsSync(paths.value.rootDir)) {
    return err(
      new SpriteError(
        "SESSION_NOT_FOUND",
        `Session ${sessionId} does not exist under the project-local session root.`
      )
    );
  }

  if (!existsSync(paths.value.statePath)) {
    return err(
      new SpriteError(
        "SESSION_STATE_MISSING",
        `Session state file not found for session ${sessionId}`
      )
    );
  }

  if (!existsSync(paths.value.eventsPath)) {
    return err(
      new SpriteError(
        "SESSION_EVENTS_MISSING",
        `Session events file not found for session ${sessionId}`
      )
    );
  }

  const state = readSessionStateSnapshot(paths.value.statePath);

  if (!state.ok) {
    return err(state.error);
  }

  if (state.value.sessionId !== sessionId) {
    return err(
      new SpriteError(
        "SESSION_STATE_SCOPE_MISMATCH",
        "Session state sessionId must match the requested session."
      )
    );
  }

  const events = readSessionEventLog(paths.value.eventsPath, sessionId);

  if (!events.ok) {
    return err(events.error);
  }

  return okSession({
    paths: { ...paths.value },
    events: events.value,
    state: state.value
  });
}

export function readSessionForResume(
  cwd: string,
  sessionId: string
): Result<ReadSessionForResumeResult, SpriteError> {
  const bundle = readSessionArtifactBundle(cwd, sessionId);

  if (!bundle.ok) {
    return err(bundle.error);
  }

  return okSession({
    paths: { ...bundle.value.paths },
    persistedEventCount: bundle.value.events.length,
    events: bundle.value.events,
    state: bundle.value.state
  });
}

export function readSessionArtifacts(
  cwd: string,
  sessionId: string,
  options: ReadSessionArtifactsOptions = {}
): Result<ReadSessionArtifactsResult, SpriteError> {
  const eventLimit = normalizeRecentEventLimit(options.recentEventLimit);

  if (!eventLimit.ok) {
    return err(eventLimit.error);
  }

  const bundle = readSessionArtifactBundle(cwd, sessionId);

  if (!bundle.ok) {
    return err(bundle.error);
  }

  const events = [...bundle.value.events];

  return okSession({
    events,
    paths: { ...bundle.value.paths },
    persistedEventCount: events.length,
    recentEvents: eventLimit.value === 0 ? [] : events.slice(-eventLimit.value),
    state: bundle.value.state
  });
}

export function readLearningReviewLessonCandidates(
  cwd: string,
  options: ReadLearningReviewLessonCandidateOptions = {}
): Result<StoredLearningReviewLessonCandidate[], SpriteError> {
  const sessionsDir = path.join(cwd, ".sprite", "sessions");
  const sessionLimit =
    options.sessionLimit ?? DEFAULT_LEARNING_REVIEW_SESSION_SCAN_LIMIT;
  const artifactLimit =
    options.artifactLimit ?? DEFAULT_LEARNING_REVIEW_ARTIFACT_SCAN_LIMIT;
  const candidateLimit =
    options.candidateLimit ?? DEFAULT_LEARNING_REVIEW_CANDIDATE_LIMIT;

  for (const [limitName, limitValue] of [
    ["sessionLimit", sessionLimit],
    ["artifactLimit", artifactLimit],
    ["candidateLimit", candidateLimit]
  ] as const) {
    if (!Number.isInteger(limitValue) || limitValue <= 0) {
      return err(
        new SpriteError(
          "SESSION_LEARNING_REVIEW_INVALID_READ_LIMIT",
          `Learning review ${limitName} must be a positive integer.`
        )
      );
    }
  }

  if (!existsSync(sessionsDir)) {
    return okSession([]);
  }

  try {
    const candidates: StoredLearningReviewLessonCandidate[] = [];
    let artifactsRead = 0;
    const sessionEntries = sortDirectoryEntriesByRecency(
      sessionsDir,
      readdirSync(sessionsDir, {
        withFileTypes: true
      }).filter((entry) => entry.isDirectory())
    ).slice(0, sessionLimit);

    readLoop: for (const sessionEntry of sessionEntries) {
      const sessionId = sessionEntry.name;
      const learningReviewsDir = path.join(
        sessionsDir,
        sessionId,
        "learning-reviews"
      );

      if (!existsSync(learningReviewsDir)) {
        continue;
      }

      const reviewEntries = sortDirectoryEntriesByRecency(
        learningReviewsDir,
        readdirSync(learningReviewsDir, {
          withFileTypes: true
        }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      );

      for (const reviewEntry of reviewEntries) {
        if (artifactsRead >= artifactLimit || candidates.length >= candidateLimit) {
          break readLoop;
        }

        artifactsRead += 1;
        const artifactPath = path.join(learningReviewsDir, reviewEntry.name);
        const parsed = parseLearningReviewArtifactSafely(artifactPath);

        if (parsed === null) {
          continue;
        }

        candidates.push(
          ...extractLearningReviewLessonCandidates(
            parsed,
            candidateLimit - candidates.length
          )
        );
      }
    }

    return okSession(candidates.slice(0, candidateLimit));
  } catch (error: unknown) {
    return err(
      toSessionStorageError("SESSION_LEARNING_REVIEW_LESSONS_READ_FAILED", error)
    );
  }
}

function parseLearningReviewArtifactSafely(
  artifactPath: string
): StoredLearningReviewArtifact | null {
  try {
    const parsed = JSON.parse(readFileSync(artifactPath, "utf8")) as unknown;

    if (!isLearningReviewArtifactRecord(parsed)) {
      return null;
    }

    if (
      containsSecretLikeValue(JSON.stringify(parsed)) ||
      findForbiddenLearningReviewArtifactField(parsed, new WeakSet()) !== null
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function extractLearningReviewLessonCandidates(
  review: StoredLearningReviewArtifact,
  limit = DEFAULT_LEARNING_REVIEW_CANDIDATE_LIMIT
): StoredLearningReviewLessonCandidate[] {
  const candidates: StoredLearningReviewLessonCandidate[] = [];
  const sections = [
    ["lesson", review.lessons, "lesson"] as const,
    ["fact", review.facts, "fact"] as const,
    ["test_gap", review.testGaps, "test_gap"] as const
  ];

  for (const [section, items, sourceIdPrefix] of sections) {
    for (const [index, item] of items.entries()) {
      if (candidates.length >= limit) {
        return candidates;
      }

      if (!isLearningReviewSectionItem(item)) {
        continue;
      }

      const preview = createRedactedPreview(item.summary, 240);

      if (preview.length === 0 || containsSecretLikeValue(preview)) {
        continue;
      }

      candidates.push({
        createdAt: review.createdAt,
        mode: review.mode,
        preview,
        section,
        sourceEventIds: item.evidenceEventIds,
        sourceId: `${sourceIdPrefix}_${review.sessionId}_${review.taskId}_${String(index + 1)}`,
        sourceSessionId: review.sessionId,
        sourceTaskId: review.taskId
      });
    }
  }

  return candidates;
}

function sortDirectoryEntriesByRecency(
  directoryPath: string,
  entries: readonly Dirent[]
): Dirent[] {
  return entries
    .map((entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      return {
        entry,
        mtimeMs: statSync(entryPath).mtimeMs
      };
    })
    .sort((left, right) => {
      if (right.mtimeMs !== left.mtimeMs) {
        return right.mtimeMs - left.mtimeMs;
      }

      return right.entry.name.localeCompare(left.entry.name);
    })
    .map(({ entry }) => entry);
}

function isLearningReviewArtifactRecord(
  value: unknown
): value is StoredLearningReviewArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<StoredLearningReviewArtifact>;

  return (
    record.schemaVersion === SESSION_STATE_SCHEMA_VERSION &&
    typeof record.sessionId === "string" &&
    typeof record.taskId === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.mode === "string" &&
    Array.isArray(record.lessons)
  );
}

function isLearningReviewSectionItem(
  value: object
): value is { evidenceEventIds: string[]; summary: string } {
  const item = value as Record<string, unknown>;

  return (
    typeof item.summary === "string" &&
    Array.isArray(item.evidenceEventIds) &&
    item.evidenceEventIds.every(
      (eventId) => typeof eventId === "string" && eventId.trim().length > 0
    )
  );
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

function validateStoredLearningReviewArtifact(
  sessionId: string,
  review: StoredLearningReviewArtifact
): Result<StoredLearningReviewArtifact, SpriteError> {
  if (review.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_INVALID_SCHEMA_VERSION",
        "Learning review artifact schemaVersion is unsupported."
      )
    );
  }

  if (review.sessionId !== sessionId) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_SCOPE_MISMATCH",
        "Learning review sessionId must match the active session."
      )
    );
  }

  if (!/^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(review.sessionId)) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_INVALID_SESSION_ID",
        "Learning review sessionId must use the ses_ prefix."
      )
    );
  }

  if (!/^task_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(review.taskId)) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_INVALID_TASK_ID",
        "Learning review taskId must use the task_ prefix."
      )
    );
  }

  if (review.terminalStatus !== "completed") {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_INVALID_TERMINAL_STATUS",
        "Learning review artifacts in this workflow require completed terminal status."
      )
    );
  }

  if (Number.isNaN(Date.parse(review.createdAt))) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_INVALID_TIMESTAMP",
        "Learning review createdAt must be a valid timestamp."
      )
    );
  }

  const forbiddenField = findForbiddenLearningReviewArtifactField(
    review as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_UNSAFE_FIELD",
        `Learning review artifact must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findUnsafeLearningReviewArtifactString(
    review as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "SESSION_LEARNING_REVIEW_UNSAFE_VALUE",
        "Learning review artifact must not include secret-looking values."
      )
    );
  }

  return okSession(review);
}

function validateStoredRetrospectiveReviewArtifact(
  sessionId: string,
  review: StoredRetrospectiveReviewArtifact
): Result<StoredRetrospectiveReviewArtifact, SpriteError> {
  if (review.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_SCHEMA_VERSION",
        "Retrospective review artifact schemaVersion is unsupported."
      )
    );
  }

  if (review.sessionId !== sessionId) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_SCOPE_MISMATCH",
        "Retrospective review sessionId must match the active session."
      )
    );
  }

  if (!SESSION_ID_PATTERN.test(review.sessionId)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_SESSION_ID",
        "Retrospective review sessionId must use the ses_ prefix."
      )
    );
  }

  if (!SESSION_TASK_ID_PATTERN.test(review.taskId)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_TASK_ID",
        "Retrospective review taskId must use the task_ prefix."
      )
    );
  }

  if (!RETROSPECTIVE_TERMINAL_STATUSES.includes(review.terminalStatus)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_TERMINAL_STATUS",
        "Retrospective review terminalStatus is unsupported."
      )
    );
  }

  if (!RETROSPECTIVE_TERMINAL_STATUSES.includes(review.finalStatus)) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_FINAL_STATUS",
        "Retrospective review finalStatus is unsupported."
      )
    );
  }

  if (
    review.terminalStatus === "completed"
      ? typeof review.outcome !== "string" || review.outcome.trim().length === 0
      : typeof review.failureReason !== "string" ||
        review.failureReason.trim().length === 0
  ) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_MISSING_OUTCOME",
        "Retrospective review must include an outcome or failure reason."
      )
    );
  }

  if (Number.isNaN(Date.parse(review.createdAt))) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_INVALID_TIMESTAMP",
        "Retrospective review createdAt must be a valid timestamp."
      )
    );
  }

  const context = isPlainRecord(review.context) ? review.context : null;
  const evidence = isPlainRecord(review.evidence) ? review.evidence : null;

  if (
    context === null ||
    context.eligible !== true ||
    !Array.isArray(context.missingFields) ||
    context.missingFields.length > 0
  ) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review artifact requires eligible context."
      )
    );
  }

  if (
    !Array.isArray(review.filesTouched) ||
    review.filesTouched.length === 0 ||
    !review.filesTouched.every(
      (filePath) => typeof filePath === "string" && filePath.trim().length > 0
    ) ||
    !Array.isArray(review.commandsRun) ||
    review.commandsRun.length === 0
  ) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review artifact requires files and command evidence."
      )
    );
  }

  if (
    evidence === null ||
    !Array.isArray(evidence.eventIds) ||
    evidence.eventIds.length === 0 ||
    !evidence.eventIds.every(
      (eventId) => typeof eventId === "string" && eventId.trim().length > 0
    ) ||
    !Array.isArray(evidence.filesTouched) ||
    evidence.filesTouched.length === 0 ||
    !evidence.filesTouched.every(
      (filePath) => typeof filePath === "string" && filePath.trim().length > 0
    ) ||
    !Array.isArray(evidence.commandsRun) ||
    evidence.commandsRun.length === 0 ||
    typeof evidence.terminalEventId !== "string" ||
    evidence.terminalEventId.trim().length === 0
  ) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review artifact evidence must include events, files, commands, and a terminal event."
      )
    );
  }

  for (const [field, value] of [
    ["correlationId", review.correlationId],
    ["summary", review.summary],
    ["taskGoal", review.taskGoal]
  ] as const) {
    if (value.trim().length === 0 || containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "SESSION_RETROSPECTIVE_REVIEW_UNSAFE_FIELD",
          `Retrospective review ${field} must be non-empty and safe.`
        )
      );
    }
  }

  const forbiddenField = findForbiddenLearningReviewArtifactField(
    review as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_UNSAFE_FIELD",
        `Retrospective review artifact must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findUnsafeLearningReviewArtifactString(
    review as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "SESSION_RETROSPECTIVE_REVIEW_UNSAFE_VALUE",
        "Retrospective review artifact must not include secret-looking values."
      )
    );
  }

  return okSession(review);
}

function findForbiddenLearningReviewArtifactField(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  const forbiddenFields = new Set([
    "accessToken",
    "apiKey",
    "api_key",
    "authorization",
    "commandOutput",
    "content",
    "credential",
    "credentials",
    "diff",
    "env",
    "hunk",
    "newText",
    "oldText",
    "output",
    "password",
    "patch",
    "privateKey",
    "private_key",
    "rawCommandOutput",
    "rawContent",
    "rawOutput",
    "rawSnippet",
    "secret",
    "snippet",
    "snippets",
    "stderr",
    "stdout",
    "token"
  ]);

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findForbiddenLearningReviewArtifactField(item, seen);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenFields.has(key)) {
      return key;
    }

    const nested = findForbiddenLearningReviewArtifactField(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function findUnsafeLearningReviewArtifactString(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  if (typeof value === "string") {
    return containsSecretLikeValue(value) ? value : null;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findUnsafeLearningReviewArtifactString(item, seen);

      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  for (const nestedValue of Object.values(value)) {
    const nested = findUnsafeLearningReviewArtifactString(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function readSessionStateSnapshot(
  statePath: string
): Result<SessionStateSnapshot, SpriteError> {
  let raw: string;

  try {
    raw = readFileSync(statePath, "utf8");
  } catch (error: unknown) {
    return err(toSessionStorageError("SESSION_STATE_READ_FAILED", error));
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    return err(toSessionStorageError("SESSION_STATE_INVALID_JSON", error));
  }

  const validation = validateSessionStateSnapshot(parsed);

  if (!validation.ok) {
    return err(validation.error);
  }

  return okSession(validation.value);
}

function readSessionEventLog(
  eventsPath: string,
  sessionId: string
): Result<SessionEventRecord[], SpriteError> {
  let raw: string;

  try {
    raw = readFileSync(eventsPath, "utf8");
  } catch (error: unknown) {
    return err(toSessionStorageError("SESSION_EVENTS_READ_FAILED", error));
  }

  const trimmed = raw.trimEnd();

  if (trimmed.length === 0) {
    return okSession([]);
  }

  const events: SessionEventRecord[] = [];
  const lines = trimmed.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      return err(
        new SpriteError(
          "SESSION_EVENT_LOG_INVALID_JSON",
          `Session event log line ${index + 1} is not valid JSON.`
        )
      );
    }

    const validation = validateSessionEventRecord(sessionId, parsed);

    if (!validation.ok) {
      return err(validation.error);
    }

    events.push(validation.value);
  }

  return okSession(events);
}

function normalizeRecentEventLimit(
  recentEventLimit: number | undefined
): Result<number, SpriteError> {
  if (recentEventLimit === undefined) {
    return okSession(DEFAULT_SESSION_RECENT_EVENT_LIMIT);
  }

  if (
    !Number.isInteger(recentEventLimit) ||
    !Number.isFinite(recentEventLimit) ||
    recentEventLimit < 0
  ) {
    return err(
      new SpriteError(
        "SESSION_RECENT_EVENT_LIMIT_INVALID",
        "Session recent event limit must be a non-negative integer."
      )
    );
  }

  return okSession(Math.min(recentEventLimit, MAX_SESSION_RECENT_EVENT_LIMIT));
}

function validateSessionStateSnapshot(
  snapshot: unknown
): Result<SessionStateSnapshot, SpriteError> {
  if (!isPlainRecord(snapshot)) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session state snapshot must be a plain object."
      )
    );
  }

  if (snapshot.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session state snapshot schemaVersion is not supported."
      )
    );
  }

  for (const field of ["sessionId", "cwd", "createdAt", "updatedAt"] as const) {
    if (typeof snapshot[field] !== "string" || snapshot[field].length === 0) {
      return err(
        new SpriteError(
          "SESSION_STATE_INVALID",
          `Session state snapshot ${field} must be a non-empty string.`
        )
      );
    }
  }

  const snapshotSessionId = snapshot.sessionId;

  if (
    typeof snapshotSessionId !== "string" ||
    !isValidSessionId(snapshotSessionId)
  ) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session state snapshot sessionId is not supported."
      )
    );
  }

  if (!isNonNegativeInteger(snapshot.eventCount)) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session state snapshot eventCount must be a non-negative integer."
      )
    );
  }

  if (!isNonNegativeInteger(snapshot.pendingApprovalCount)) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session state snapshot pendingApprovalCount must be a non-negative integer."
      )
    );
  }

  for (const field of [
    "filesChanged",
    "filesProposedForChange",
    "filesRead"
  ] as const) {
    if (!isStringArray(snapshot[field])) {
      return err(
        new SpriteError(
          "SESSION_STATE_INVALID",
          `Session state snapshot ${field} must be an array of strings.`
        )
      );
    }
  }

  for (const field of [
    "lastError",
    "lastEventId",
    "lastEventType",
    "nextStep"
  ] as const) {
    if (snapshot[field] !== undefined && typeof snapshot[field] !== "string") {
      return err(
        new SpriteError(
          "SESSION_STATE_INVALID",
          `Session state snapshot ${field} must be a string when provided.`
        )
      );
    }
  }

  if (snapshot.latestTask === undefined) {
    return okSession(snapshot as unknown as SessionStateSnapshot);
  }

  if (!isPlainRecord(snapshot.latestTask)) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session snapshot latestTask must be a plain object."
      )
    );
  }

  for (const field of ["taskId", "correlationId", "goal"] as const) {
    if (
      typeof snapshot.latestTask[field] !== "string" ||
      snapshot.latestTask[field].length === 0
    ) {
      return err(
        new SpriteError(
          "SESSION_STATE_INVALID",
          `Session snapshot latestTask.${field} must be a non-empty string.`
        )
      );
    }
  }

  const latestTask = snapshot.latestTask;

  if (
    typeof latestTask.status !== "string" ||
    !SESSION_SNAPSHOT_TASK_STATUS_SET.has(latestTask.status)
  ) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session snapshot latestTask.status is not supported."
      )
    );
  }

  if (
    typeof latestTask.currentPhase !== "string" ||
    !SESSION_SNAPSHOT_RUNTIME_PHASE_SET.has(latestTask.currentPhase)
  ) {
    return err(
      new SpriteError(
        "SESSION_STATE_INVALID",
        "Session snapshot latestTask.currentPhase is not supported."
      )
    );
  }

  if (latestTask.latestPlan !== undefined) {
    if (!Array.isArray(latestTask.latestPlan)) {
      return err(
        new SpriteError(
          "SESSION_STATE_INVALID",
          "Session snapshot latestTask.latestPlan must be an array when provided."
        )
      );
    }

    for (const step of latestTask.latestPlan) {
      if (!isPlainRecord(step)) {
        return err(
          new SpriteError(
            "SESSION_STATE_INVALID",
            "Session snapshot latestPlan entries must be plain objects."
          )
        );
      }

      if (
        typeof step.phase !== "string" ||
        !SESSION_SNAPSHOT_RUNTIME_PHASE_SET.has(step.phase)
      ) {
        return err(
          new SpriteError(
            "SESSION_STATE_INVALID",
            "Session snapshot latestPlan phase is not supported."
          )
        );
      }

      if (
        typeof step.status !== "string" ||
        !SESSION_SNAPSHOT_PLAN_STEP_STATUS_SET.has(step.status)
      ) {
        return err(
          new SpriteError(
            "SESSION_STATE_INVALID",
            "Session snapshot latestPlan status is not supported."
          )
        );
      }

      if (typeof step.summary !== "string" || step.summary.length === 0) {
        return err(
          new SpriteError(
            "SESSION_STATE_INVALID",
            "Session snapshot latestPlan summary must be a non-empty string."
          )
        );
      }
    }
  }

  return okSession(snapshot as unknown as SessionStateSnapshot);
}

function validateSessionEventRecord(
  sessionId: string,
  event: unknown
): Result<SessionEventRecord, SpriteError> {
  if (!isPlainRecord(event)) {
    return err(
      new SpriteError(
        "SESSION_EVENT_INVALID",
        "Session event records must be plain objects."
      )
    );
  }

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

  return okSession(event as unknown as SessionEventRecord);
}

function validateSessionCompactionArtifact(
  artifact: unknown
): Result<SessionCompactionArtifact, SpriteError> {
  if (!isPlainRecord(artifact)) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact must be a plain object."
      )
    );
  }

  if (artifact.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact schemaVersion is not supported."
      )
    );
  }

  if (
    typeof artifact.artifactId !== "string" ||
    !isValidCompactionArtifactId(artifact.artifactId)
  ) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact artifactId is not supported."
      )
    );
  }

  if (
    typeof artifact.sessionId !== "string" ||
    !isValidSessionId(artifact.sessionId)
  ) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact sessionId is not supported."
      )
    );
  }

  if (
    typeof artifact.createdAt !== "string" ||
    artifact.createdAt.length === 0
  ) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact createdAt must be a non-empty string."
      )
    );
  }

  if (!isPlainRecord(artifact.summary)) {
    return err(
      new SpriteError(
        "SESSION_COMPACTION_ARTIFACT_INVALID",
        "Compaction artifact summary must be a plain object."
      )
    );
  }

  return okSession(artifact as unknown as SessionCompactionArtifact);
}

function isPlainPayloadObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value as object);

  return prototype === Object.prototype || prototype === null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainPayloadObject(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function okSession<T>(value: T): Result<T, SpriteError> {
  return { ok: true, value };
}
