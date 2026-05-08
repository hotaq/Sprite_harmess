import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import {
  SpriteError,
  containsSecretLikeValue,
  err,
  type Result
} from "@sprite/shared";

export const MEMORY_ARTIFACT_SCHEMA_VERSION = 1 as const;
const MEMORY_CANDIDATE_LIFECYCLE_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "edited",
  "auto_saved"
] as const;
const MEMORY_CANDIDATE_RECOMMENDED_ACTIONS = [
  "accept",
  "review",
  "reject"
] as const;

export interface MemoryArtifactPaths {
  candidatesDir: string;
  entriesPath: string;
  rootDir: string;
}

export interface StoredMemoryCandidate {
  acceptedEntryId?: string;
  confidence: string;
  content: string;
  contentPreview: string;
  createdAt: string;
  id: string;
  lifecycleStatus: string;
  originalCandidateId?: string;
  provenance: string;
  recommendedAction: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
  safetyDecision?: {
    action: string;
    matchedRuleIds: string[];
    reason: string;
    redactedPreview: string;
    target: string;
  };
  schemaVersion: typeof MEMORY_ARTIFACT_SCHEMA_VERSION;
  sensitivityStatus: string;
  sourceEventIds: readonly string[];
  sourceTaskId?: string;
  type: string;
  updatedAt: string;
}

export interface StoredMemoryEntry {
  autoSaved: boolean;
  candidateId: string;
  confidence: string;
  content: string;
  contentPreview: string;
  createdAt: string;
  id: string;
  provenance: string;
  schemaVersion: typeof MEMORY_ARTIFACT_SCHEMA_VERSION;
  sensitivityStatus: "non_sensitive";
  sourceEventIds: readonly string[];
  sourceTaskId?: string;
  type: string;
  updatedAt: string;
}

export interface MemoryCandidateWriteResult {
  path: string;
}

export interface MemoryCandidateUpdateResult {
  path: string;
}

export interface MemoryEntryAppendResult {
  path: string;
}

export interface MemoryStore {
  appendEntry(
    cwd: string,
    entry: StoredMemoryEntry
  ): Result<MemoryEntryAppendResult, SpriteError>;
  ensureMemoryStore(cwd: string): Result<MemoryArtifactPaths, SpriteError>;
  listCandidates(cwd: string): Result<StoredMemoryCandidate[], SpriteError>;
  readCandidate(
    cwd: string,
    candidateId: string
  ): Result<StoredMemoryCandidate, SpriteError>;
  updateCandidate(
    cwd: string,
    candidate: StoredMemoryCandidate
  ): Result<MemoryCandidateUpdateResult, SpriteError>;
  writeCandidate(
    cwd: string,
    candidate: StoredMemoryCandidate
  ): Result<MemoryCandidateWriteResult, SpriteError>;
}

export class LocalMemoryStore implements MemoryStore {
  ensureMemoryStore(cwd: string): Result<MemoryArtifactPaths, SpriteError> {
    const paths = resolveMemoryArtifactPaths(cwd);

    if (!paths.ok) {
      return paths;
    }

    try {
      mkdirSync(paths.value.candidatesDir, { recursive: true });
      writeFileSync(paths.value.entriesPath, "", { flag: "a" });
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_STORAGE_ERROR", error));
    }

    return paths;
  }

  writeCandidate(
    cwd: string,
    candidate: StoredMemoryCandidate
  ): Result<MemoryCandidateWriteResult, SpriteError> {
    const paths = this.ensureMemoryStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const normalizedCandidate = normalizeStoredMemoryCandidate(candidate);
    const validation = validateStoredMemoryCandidate(normalizedCandidate);

    if (!validation.ok) {
      return validation;
    }

    const candidatePath = path.join(
      paths.value.candidatesDir,
      `${normalizedCandidate.id}.json`
    );

    if (!isInsidePath(paths.value.candidatesDir, candidatePath)) {
      return err(
        new SpriteError(
          "MEMORY_CANDIDATE_PATH_ESCAPE",
          "Memory candidate artifact path must remain inside the candidates directory."
        )
      );
    }

    if (existsSync(candidatePath)) {
      return err(
        new SpriteError(
          "MEMORY_CANDIDATE_ALREADY_EXISTS",
          "Memory candidate artifact already exists; use a new candidate ID."
        )
      );
    }

    const tempPath = `${candidatePath}.tmp`;

    try {
      writeFileSync(
        tempPath,
        `${JSON.stringify(normalizedCandidate, null, 2)}\n`
      );
      renameSync(tempPath, candidatePath);
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_CANDIDATE_WRITE_FAILED", error));
    }

    return { ok: true, value: { path: candidatePath } };
  }

  listCandidates(cwd: string): Result<StoredMemoryCandidate[], SpriteError> {
    const paths = this.ensureMemoryStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    try {
      const candidates: StoredMemoryCandidate[] = [];

      for (const fileName of readdirSync(paths.value.candidatesDir)
        .filter((fileName) => fileName.endsWith(".json"))
        .sort()) {
        const candidateId = fileName.slice(0, -".json".length);
        const candidate = this.readCandidate(cwd, candidateId);

        if (!candidate.ok) {
          return err(candidate.error);
        }

        candidates.push(candidate.value);
      }

      return { ok: true, value: candidates };
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_CANDIDATES_READ_FAILED", error));
    }
  }

  readCandidate(
    cwd: string,
    candidateId: string
  ): Result<StoredMemoryCandidate, SpriteError> {
    const paths = this.ensureMemoryStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const candidatePath = resolveCandidateArtifactPath(
      paths.value.candidatesDir,
      candidateId
    );

    if (!candidatePath.ok) {
      return err(candidatePath.error);
    }

    if (!existsSync(candidatePath.value)) {
      return err(
        new SpriteError(
          "MEMORY_CANDIDATE_NOT_FOUND",
          "Memory candidate artifact was not found."
        )
      );
    }

    try {
      const candidate = normalizeStoredMemoryCandidate(
        JSON.parse(
          readFileSync(candidatePath.value, "utf8")
        ) as Partial<StoredMemoryCandidate>
      );
      const validation = validateStoredMemoryCandidate(candidate);

      if (!validation.ok) {
        return err(validation.error);
      }

      return { ok: true, value: candidate };
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_CANDIDATE_READ_FAILED", error));
    }
  }

  updateCandidate(
    cwd: string,
    candidate: StoredMemoryCandidate
  ): Result<MemoryCandidateUpdateResult, SpriteError> {
    const paths = this.ensureMemoryStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const normalizedCandidate = normalizeStoredMemoryCandidate(candidate);
    const validation = validateStoredMemoryCandidate(normalizedCandidate);

    if (!validation.ok) {
      return validation;
    }

    const candidatePath = resolveCandidateArtifactPath(
      paths.value.candidatesDir,
      normalizedCandidate.id
    );

    if (!candidatePath.ok) {
      return err(candidatePath.error);
    }

    if (!existsSync(candidatePath.value)) {
      return err(
        new SpriteError(
          "MEMORY_CANDIDATE_NOT_FOUND",
          "Memory candidate artifact was not found."
        )
      );
    }

    const tempPath = `${candidatePath.value}.tmp`;

    try {
      writeFileSync(
        tempPath,
        `${JSON.stringify(normalizedCandidate, null, 2)}\n`
      );
      renameSync(tempPath, candidatePath.value);
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_CANDIDATE_UPDATE_FAILED", error));
    }

    return { ok: true, value: { path: candidatePath.value } };
  }

  appendEntry(
    cwd: string,
    entry: StoredMemoryEntry
  ): Result<MemoryEntryAppendResult, SpriteError> {
    const paths = this.ensureMemoryStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const validation = validateStoredMemoryEntry(entry);

    if (!validation.ok) {
      return validation;
    }

    try {
      writeFileSync(paths.value.entriesPath, `${JSON.stringify(entry)}\n`, {
        flag: "a"
      });
    } catch (error) {
      return err(toMemoryStorageError("MEMORY_ENTRY_APPEND_FAILED", error));
    }

    return { ok: true, value: { path: paths.value.entriesPath } };
  }
}

export function createLocalMemoryStore(): LocalMemoryStore {
  return new LocalMemoryStore();
}

export function resolveMemoryArtifactPaths(
  cwd: string
): Result<MemoryArtifactPaths, SpriteError> {
  const projectRoot = path.resolve(cwd);
  const rootDir = path.join(projectRoot, ".sprite", "memory");
  const candidatesDir = path.join(rootDir, "candidates");
  const entriesPath = path.join(rootDir, "entries.ndjson");

  if (
    !isInsidePath(projectRoot, rootDir) ||
    !isInsidePath(rootDir, candidatesDir) ||
    !isInsidePath(rootDir, entriesPath)
  ) {
    return err(
      new SpriteError(
        "MEMORY_ARTIFACT_PATH_ESCAPE",
        "Memory artifact paths must remain inside the project-local .sprite/memory directory."
      )
    );
  }

  return {
    ok: true,
    value: {
      candidatesDir,
      entriesPath,
      rootDir
    }
  };
}

export function readMemoryEntries(
  cwd: string
): Result<StoredMemoryEntry[], SpriteError> {
  const paths = resolveMemoryArtifactPaths(cwd);

  if (!paths.ok) {
    return err(paths.error);
  }

  if (!existsSync(paths.value.entriesPath)) {
    return { ok: true, value: [] };
  }

  try {
    const content = readFileSync(paths.value.entriesPath, "utf8").trim();

    if (content.length === 0) {
      return { ok: true, value: [] };
    }

    return {
      ok: true,
      value: content
        .split("\n")
        .map((line) => JSON.parse(line) as StoredMemoryEntry)
    };
  } catch (error) {
    return err(toMemoryStorageError("MEMORY_ENTRIES_READ_FAILED", error));
  }
}

function resolveCandidateArtifactPath(
  candidatesDir: string,
  candidateId: string
): Result<string, SpriteError> {
  if (!/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidateId)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_ID",
        "Memory candidate ID must use the memcand_ prefix and safe identifier characters."
      )
    );
  }

  const candidatePath = path.join(candidatesDir, `${candidateId}.json`);

  if (!isInsidePath(candidatesDir, candidatePath)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_PATH_ESCAPE",
        "Memory candidate artifact path must remain inside the candidates directory."
      )
    );
  }

  return { ok: true, value: candidatePath };
}

function normalizeStoredMemoryCandidate(
  candidate: Partial<StoredMemoryCandidate>
): StoredMemoryCandidate {
  const lifecycleStatus =
    typeof candidate.lifecycleStatus === "string" &&
    (MEMORY_CANDIDATE_LIFECYCLE_STATUSES as readonly string[]).includes(
      candidate.lifecycleStatus
    )
      ? candidate.lifecycleStatus
      : "pending_review";
  const normalized = {
    ...candidate,
    lifecycleStatus,
    recommendedAction:
      typeof candidate.recommendedAction === "string" &&
      (MEMORY_CANDIDATE_RECOMMENDED_ACTIONS as readonly string[]).includes(
        candidate.recommendedAction
      )
        ? candidate.recommendedAction
        : getDefaultRecommendedAction(candidate, lifecycleStatus)
  } as StoredMemoryCandidate;

  return normalized;
}

function getDefaultRecommendedAction(
  candidate: Partial<StoredMemoryCandidate>,
  lifecycleStatus: string
): string {
  if (lifecycleStatus === "accepted" || lifecycleStatus === "auto_saved") {
    return "accept";
  }

  if (lifecycleStatus === "rejected") {
    return "reject";
  }

  if (
    candidate.safetyDecision?.action !== "allow" ||
    candidate.sensitivityStatus !== "non_sensitive" ||
    !["episodic", "semantic"].includes(candidate.type ?? "")
  ) {
    return "reject";
  }

  return candidate.confidence === "high" ? "accept" : "review";
}

function validateStoredMemoryCandidate(
  candidate: StoredMemoryCandidate
): Result<void, SpriteError> {
  if (!/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidate.id)) {
    return invalidMemoryArtifact("Memory candidate ID must use memcand_.");
  }

  if (
    !(MEMORY_CANDIDATE_LIFECYCLE_STATUSES as readonly string[]).includes(
      candidate.lifecycleStatus
    )
  ) {
    return invalidMemoryArtifact(
      "Memory candidate lifecycleStatus is unsupported."
    );
  }

  if (
    !(MEMORY_CANDIDATE_RECOMMENDED_ACTIONS as readonly string[]).includes(
      candidate.recommendedAction
    )
  ) {
    return invalidMemoryArtifact(
      "Memory candidate recommendedAction is unsupported."
    );
  }

  if (
    candidate.acceptedEntryId !== undefined &&
    !/^mem_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(candidate.acceptedEntryId)
  ) {
    return invalidMemoryArtifact(
      "Memory candidate acceptedEntryId must use mem_."
    );
  }

  if (
    candidate.reviewedAt !== undefined &&
    Number.isNaN(Date.parse(candidate.reviewedAt))
  ) {
    return invalidMemoryArtifact(
      "Memory candidate reviewedAt must be a valid ISO timestamp."
    );
  }

  return validateMemoryArtifactBase(candidate);
}

function validateStoredMemoryEntry(
  entry: StoredMemoryEntry
): Result<void, SpriteError> {
  if (!/^mem_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.id)) {
    return invalidMemoryArtifact("Memory entry ID must use mem_.");
  }

  if (!/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.candidateId)) {
    return invalidMemoryArtifact("Memory entry candidateId must use memcand_.");
  }

  if (entry.sensitivityStatus !== "non_sensitive") {
    return invalidMemoryArtifact("Memory entries must be non-sensitive.");
  }

  return validateMemoryArtifactBase(entry);
}

function validateMemoryArtifactBase(
  artifact: StoredMemoryCandidate | StoredMemoryEntry
): Result<void, SpriteError> {
  if (artifact.schemaVersion !== MEMORY_ARTIFACT_SCHEMA_VERSION) {
    return invalidMemoryArtifact("Memory artifact schemaVersion is invalid.");
  }

  const requiredStrings = [
    artifact.confidence,
    artifact.content,
    artifact.contentPreview,
    artifact.createdAt,
    artifact.provenance,
    artifact.sensitivityStatus,
    artifact.type,
    artifact.updatedAt
  ];

  if (!requiredStrings.every(isNonEmptyString)) {
    return invalidMemoryArtifact(
      "Memory artifact required string fields must be non-empty."
    );
  }

  if (
    Number.isNaN(Date.parse(artifact.createdAt)) ||
    Number.isNaN(Date.parse(artifact.updatedAt))
  ) {
    return invalidMemoryArtifact(
      "Memory artifact timestamps must be valid ISO timestamps."
    );
  }

  if (!Array.isArray(artifact.sourceEventIds)) {
    return invalidMemoryArtifact(
      "Memory artifact sourceEventIds must be an array."
    );
  }

  const serialized = JSON.stringify(artifact);

  if (containsSecretLikeValue(serialized)) {
    return invalidMemoryArtifact(
      "Memory artifact must not include secret-looking values."
    );
  }

  return { ok: true, value: undefined };
}

function invalidMemoryArtifact(message: string): Result<never, SpriteError> {
  return err(new SpriteError("MEMORY_ARTIFACT_INVALID", message));
}

function toMemoryStorageError(code: string, error: unknown): SpriteError {
  return new SpriteError(
    code,
    error instanceof Error ? error.message : String(error)
  );
}

function isInsidePath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
