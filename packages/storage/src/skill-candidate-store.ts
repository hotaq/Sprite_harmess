import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import {
  FORBIDDEN_SKILL_CANDIDATE_FIELDS,
  SpriteError,
  SKILL_CANDIDATE_ARRAY_MAX_LENGTH as ARRAY_MAX_LENGTH,
  SKILL_CANDIDATE_CONFIDENCE_VALUES as CANDIDATE_CONFIDENCE_VALUES,
  SKILL_CANDIDATE_CORRELATION_ID_PATTERN as CORRELATION_ID_PATTERN,
  SKILL_CANDIDATE_EVENT_ID_PATTERN as EVENT_ID_PATTERN,
  SKILL_CANDIDATE_ID_PATTERN as CANDIDATE_ID_PATTERN,
  SKILL_CANDIDATE_LIFECYCLE_STATUSES as CANDIDATE_LIFECYCLE_STATUSES,
  SKILL_CANDIDATE_RAW_FILESYSTEM_PATH_PATTERN as RAW_FILESYSTEM_PATH_PATTERN,
  SKILL_CANDIDATE_SAFE_TEXT_MAX_LENGTH as SAFE_TEXT_MAX_LENGTH,
  SKILL_CANDIDATE_SCHEMA_VERSION as SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION,
  SKILL_CANDIDATE_SESSION_ID_PATTERN as SESSION_ID_PATTERN,
  SKILL_CANDIDATE_SIGNAL_ID_PATTERN as SKILL_SIGNAL_ID_PATTERN,
  SKILL_CANDIDATE_SOURCE_OUTCOMES as CANDIDATE_OUTCOMES,
  SKILL_CANDIDATE_TASK_ID_PATTERN as TASK_ID_PATTERN,
  containsSecretLikeValue,
  err,
  type Result
} from "@sprite/shared";

export {
  SKILL_CANDIDATE_SCHEMA_VERSION as SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION
} from "@sprite/shared";

export interface SkillCandidateArtifactPaths {
  candidatesDir: string;
  rootDir: string;
}

export interface StoredSkillCandidateSupportingEvidence {
  evidenceEventIds: string[];
  learningReviewArtifactPath: string;
  outcome: string;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceSkillSignalId: string;
  sourceTaskId: string;
}

export interface StoredSkillCandidate {
  candidateId: string;
  confidence: string;
  counterexamples: string[];
  createdAt: string;
  draftSavedAt?: string;
  examples: string[];
  id: string;
  intendedActivationConditions: string[];
  knownRisks: string[];
  learningReviewArtifactPath: string;
  lifecycleStatus: string;
  name: string;
  promotedAt?: string;
  promotedSkillReference?: string;
  promotionTarget?: string;
  rejectionReason?: string;
  requiredTools: string[];
  reviewReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  schemaVersion: typeof SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION;
  sourceCorrelationIds: string[];
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  summary: string;
  supportingEvidence: StoredSkillCandidateSupportingEvidence[];
  triggerReason: string;
  updatedAt: string;
  workflowSteps: string[];
  workflowSummary: string;
}

export interface SkillCandidateWriteResult {
  path: string;
}

export interface SkillCandidateStore {
  ensureSkillCandidateStore(
    cwd: string
  ): Result<SkillCandidateArtifactPaths, SpriteError>;
  listCandidates(cwd: string): Result<StoredSkillCandidate[], SpriteError>;
  readCandidate(
    cwd: string,
    candidateId: string
  ): Result<StoredSkillCandidate, SpriteError>;
  updateCandidate(
    cwd: string,
    candidate: StoredSkillCandidate
  ): Result<SkillCandidateWriteResult, SpriteError>;
  writeCandidate(
    cwd: string,
    candidate: StoredSkillCandidate
  ): Result<SkillCandidateWriteResult, SpriteError>;
}

export class LocalSkillCandidateStore implements SkillCandidateStore {
  ensureSkillCandidateStore(
    cwd: string
  ): Result<SkillCandidateArtifactPaths, SpriteError> {
    const paths = resolveSkillCandidateArtifactPaths(cwd);

    if (!paths.ok) {
      return paths;
    }

    const directoryReady = ensureDirectoryInsideRoot(
      path.resolve(cwd),
      paths.value.candidatesDir,
      "SKILL_CANDIDATE_PATH_ESCAPE",
      "Skill candidate artifacts must remain inside the project-local .sprite/skill-candidates directory."
    );

    if (!directoryReady.ok) {
      return err(directoryReady.error);
    }

    return paths;
  }

  writeCandidate(
    cwd: string,
    candidate: StoredSkillCandidate
  ): Result<SkillCandidateWriteResult, SpriteError> {
    const paths = this.ensureSkillCandidateStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const validation = validateStoredSkillCandidate(candidate);

    if (!validation.ok) {
      return err(validation.error);
    }

    const candidatePath = resolveSkillCandidateArtifactPath(
      paths.value.candidatesDir,
      candidate.id
    );

    if (!candidatePath.ok) {
      return err(candidatePath.error);
    }

    if (existsSync(candidatePath.value)) {
      return err(
        new SpriteError(
          "SKILL_CANDIDATE_ALREADY_EXISTS",
          "Skill candidate artifact already exists; use a new candidate ID."
        )
      );
    }

    return writeSkillCandidateArtifact(candidatePath.value, candidate);
  }

  updateCandidate(
    cwd: string,
    candidate: StoredSkillCandidate
  ): Result<SkillCandidateWriteResult, SpriteError> {
    const paths = this.ensureSkillCandidateStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const validation = validateStoredSkillCandidate(candidate);

    if (!validation.ok) {
      return err(validation.error);
    }

    const candidatePath = resolveSkillCandidateArtifactPath(
      paths.value.candidatesDir,
      candidate.id
    );

    if (!candidatePath.ok) {
      return err(candidatePath.error);
    }

    if (!existsSync(candidatePath.value)) {
      return err(
        new SpriteError(
          "SKILL_CANDIDATE_NOT_FOUND",
          "Skill candidate artifact was not found."
        )
      );
    }

    const existing = this.readCandidate(cwd, candidate.id);

    if (!existing.ok) {
      return err(existing.error);
    }

    const transition = validateStoredSkillCandidateTransition(
      existing.value,
      candidate
    );

    if (!transition.ok) {
      return err(transition.error);
    }

    return writeSkillCandidateArtifact(candidatePath.value, candidate);
  }

  listCandidates(cwd: string): Result<StoredSkillCandidate[], SpriteError> {
    const paths = this.ensureSkillCandidateStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    try {
      const candidates: StoredSkillCandidate[] = [];

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
      return err(
        toSkillCandidateStorageError("SKILL_CANDIDATE_READ_FAILED", error)
      );
    }
  }

  readCandidate(
    cwd: string,
    candidateId: string
  ): Result<StoredSkillCandidate, SpriteError> {
    const paths = this.ensureSkillCandidateStore(cwd);

    if (!paths.ok) {
      return err(paths.error);
    }

    const candidatePath = resolveSkillCandidateArtifactPath(
      paths.value.candidatesDir,
      candidateId
    );

    if (!candidatePath.ok) {
      return err(candidatePath.error);
    }

    if (!existsSync(candidatePath.value)) {
      return err(
        new SpriteError(
          "SKILL_CANDIDATE_NOT_FOUND",
          "Skill candidate artifact was not found."
        )
      );
    }

    try {
      const candidate = JSON.parse(
        readFileSync(candidatePath.value, "utf8")
      ) as StoredSkillCandidate;
      const validation = validateStoredSkillCandidate(candidate);

      if (!validation.ok) {
        return err(validation.error);
      }

      return { ok: true, value: candidate };
    } catch (error) {
      return err(
        toSkillCandidateStorageError("SKILL_CANDIDATE_READ_FAILED", error)
      );
    }
  }
}

export function createLocalSkillCandidateStore(): LocalSkillCandidateStore {
  return new LocalSkillCandidateStore();
}

export function resolveSkillCandidateArtifactPaths(
  cwd: string
): Result<SkillCandidateArtifactPaths, SpriteError> {
  const projectRoot = path.resolve(cwd);
  const rootDir = path.join(projectRoot, ".sprite", "skill-candidates");

  if (!isInsidePath(projectRoot, rootDir)) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_PATH_ESCAPE",
        "Skill candidate artifacts must remain inside the project-local .sprite/skill-candidates directory."
      )
    );
  }

  return {
    ok: true,
    value: {
      candidatesDir: rootDir,
      rootDir
    }
  };
}

export function resolveSkillCandidateArtifactPath(
  candidatesDir: string,
  candidateId: string
): Result<string, SpriteError> {
  if (!CANDIDATE_ID_PATTERN.test(candidateId)) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_INVALID_ID",
        "Skill candidate ID must use the skillcand_ prefix and safe identifier characters."
      )
    );
  }

  const candidatePath = path.join(candidatesDir, `${candidateId}.json`);

  if (!isInsidePath(candidatesDir, candidatePath)) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_PATH_ESCAPE",
        "Skill candidate artifact path must remain inside the candidates directory."
      )
    );
  }

  return { ok: true, value: candidatePath };
}

function writeSkillCandidateArtifact(
  candidatePath: string,
  candidate: StoredSkillCandidate
): Result<SkillCandidateWriteResult, SpriteError> {
  const tempPath = `${candidatePath}.tmp-${process.pid}-${Date.now()}`;

  try {
    writeFileSync(tempPath, `${JSON.stringify(candidate, null, 2)}\n`);
    renameSync(tempPath, candidatePath);
  } catch (error) {
    return err(
      toSkillCandidateStorageError("SKILL_CANDIDATE_WRITE_FAILED", error)
    );
  }

  return { ok: true, value: { path: candidatePath } };
}

function validateStoredSkillCandidate(
  candidate: StoredSkillCandidate
): Result<void, SpriteError> {
  if (!isPlainRecord(candidate)) {
    return invalidSkillCandidate("Skill candidate must be a plain object.");
  }

  const forbiddenField = findForbiddenSkillCandidateField(
    candidate,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return invalidSkillCandidate(
      `Skill candidate must not include raw or activation field '${forbiddenField}'.`
    );
  }

  if (
    candidate.schemaVersion !== SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION ||
    !CANDIDATE_ID_PATTERN.test(candidate.id) ||
    candidate.candidateId !== candidate.id ||
    !CANDIDATE_CONFIDENCE_VALUES.includes(
      candidate.confidence as (typeof CANDIDATE_CONFIDENCE_VALUES)[number]
    ) ||
    !CANDIDATE_LIFECYCLE_STATUSES.includes(
      candidate.lifecycleStatus as (typeof CANDIDATE_LIFECYCLE_STATUSES)[number]
    )
  ) {
    return invalidSkillCandidate(
      "Skill candidate schema, id, confidence, or lifecycle is unsupported."
    );
  }

  if (
    Number.isNaN(Date.parse(candidate.createdAt)) ||
    Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return invalidSkillCandidate(
      "Skill candidate timestamps must be valid ISO timestamps."
    );
  }

  if (!isSafeProjectRelativePath(candidate.learningReviewArtifactPath)) {
    return invalidSkillCandidate(
      "Skill candidate learningReviewArtifactPath must be project-relative and safe."
    );
  }

  for (const value of [
    candidate.name,
    candidate.summary,
    candidate.triggerReason,
    candidate.workflowSummary
  ]) {
    if (!isSafeCandidateText(value)) {
      return invalidSkillCandidate(
        "Skill candidate required string fields must be safe."
      );
    }
  }

  for (const value of [
    candidate.promotedSkillReference,
    candidate.rejectionReason,
    candidate.reviewReason,
    candidate.reviewedBy
  ]) {
    if (value !== undefined && !isSafeCandidateText(value)) {
      return invalidSkillCandidate(
        "Skill candidate review metadata fields must be safe."
      );
    }
  }

  for (const value of [
    candidate.draftSavedAt,
    candidate.promotedAt,
    candidate.reviewedAt
  ]) {
    if (value !== undefined && Number.isNaN(Date.parse(value))) {
      return invalidSkillCandidate(
        "Skill candidate review timestamps must be valid ISO timestamps."
      );
    }
  }

  if (
    candidate.promotionTarget !== undefined &&
    candidate.promotionTarget !== "project"
  ) {
    return invalidSkillCandidate(
      "Skill candidate promotionTarget is unsupported."
    );
  }

  if (
    candidate.lifecycleStatus === "rejected" &&
    candidate.rejectionReason === undefined
  ) {
    return invalidSkillCandidate("Rejected skill candidates require a reason.");
  }

  if (
    candidate.lifecycleStatus !== "rejected" &&
    candidate.rejectionReason !== undefined
  ) {
    return invalidSkillCandidate(
      "Rejection metadata is only valid for rejected skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "draft" &&
    candidate.draftSavedAt === undefined
  ) {
    return invalidSkillCandidate("Draft skill candidates require draft metadata.");
  }

  if (
    candidate.lifecycleStatus !== "draft" &&
    candidate.draftSavedAt !== undefined
  ) {
    return invalidSkillCandidate(
      "Draft metadata is only valid for draft skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "promoted" &&
    (candidate.promotedAt === undefined ||
      candidate.promotedSkillReference === undefined ||
      candidate.promotionTarget === undefined)
  ) {
    return invalidSkillCandidate(
      "Promoted skill candidates require promotion metadata."
    );
  }

  if (
    candidate.lifecycleStatus !== "promoted" &&
    (candidate.promotedAt !== undefined ||
      candidate.promotedSkillReference !== undefined ||
      candidate.promotionTarget !== undefined)
  ) {
    return invalidSkillCandidate(
      "Promotion metadata is only valid for promoted skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "proposed" &&
    (candidate.reviewReason !== undefined ||
      candidate.reviewedAt !== undefined ||
      candidate.reviewedBy !== undefined)
  ) {
    return invalidSkillCandidate(
      "Review metadata is only valid after a skill candidate review."
    );
  }

  if (
    candidate.lifecycleStatus !== "proposed" &&
    (candidate.reviewReason === undefined ||
      candidate.reviewedAt === undefined ||
      candidate.reviewedBy === undefined)
  ) {
    return invalidSkillCandidate(
      "Reviewed skill candidates require review metadata."
    );
  }

  for (const values of [
    candidate.counterexamples,
    candidate.examples,
    candidate.intendedActivationConditions,
    candidate.knownRisks,
    candidate.requiredTools,
    candidate.sourceCorrelationIds,
    candidate.sourceEventIds,
    candidate.sourceSessionIds,
    candidate.sourceSkillSignalIds,
    candidate.sourceTaskIds,
    candidate.workflowSteps
  ]) {
    if (!isSafeTextArray(values)) {
      return invalidSkillCandidate(
        "Skill candidate required arrays must be non-empty and safe."
      );
    }
  }

  if (
    candidate.sourceCorrelationIds.some(
      (id) => !CORRELATION_ID_PATTERN.test(id)
    ) ||
    candidate.sourceEventIds.some((id) => !EVENT_ID_PATTERN.test(id)) ||
    candidate.sourceSessionIds.some((id) => !SESSION_ID_PATTERN.test(id)) ||
    candidate.sourceSkillSignalIds.some(
      (id) => !SKILL_SIGNAL_ID_PATTERN.test(id)
    ) ||
    candidate.sourceTaskIds.some((id) => !TASK_ID_PATTERN.test(id))
  ) {
    return invalidSkillCandidate(
      "Skill candidate source identifiers must use runtime prefixes."
    );
  }

  if (
    !Array.isArray(candidate.supportingEvidence) ||
    candidate.supportingEvidence.length === 0 ||
    candidate.supportingEvidence.some((evidence) => !isValidEvidence(evidence))
  ) {
    return invalidSkillCandidate(
      "Skill candidate supportingEvidence must include safe source metadata."
    );
  }

  if (containsUnsafeSkillCandidateValue(candidate, new WeakSet())) {
    return invalidSkillCandidate(
      "Skill candidate must not include secret-looking values, raw filesystem paths, or unbounded strings."
    );
  }

  return { ok: true, value: undefined };
}

function validateStoredSkillCandidateTransition(
  existing: StoredSkillCandidate,
  next: StoredSkillCandidate
): Result<void, SpriteError> {
  if (existing.id !== next.id || existing.candidateId !== next.candidateId) {
    return invalidSkillCandidate(
      "Skill candidate update must preserve the existing artifact identity."
    );
  }

  if (
    existing.lifecycleStatus === "rejected" ||
    existing.lifecycleStatus === "promoted"
  ) {
    return invalidSkillCandidate(
      "Skill candidate has already reached a terminal review state."
    );
  }

  return { ok: true, value: undefined };
}

function isValidEvidence(
  evidence: StoredSkillCandidateSupportingEvidence
): boolean {
  return (
    isPlainRecord(evidence) &&
    isSafeTextArray(evidence.evidenceEventIds) &&
    evidence.evidenceEventIds.every((id) => EVENT_ID_PATTERN.test(id)) &&
    isSafeProjectRelativePath(evidence.learningReviewArtifactPath) &&
    CANDIDATE_OUTCOMES.includes(
      evidence.outcome as (typeof CANDIDATE_OUTCOMES)[number]
    ) &&
    CORRELATION_ID_PATTERN.test(evidence.sourceCorrelationId) &&
    SESSION_ID_PATTERN.test(evidence.sourceSessionId) &&
    SKILL_SIGNAL_ID_PATTERN.test(evidence.sourceSkillSignalId) &&
    TASK_ID_PATTERN.test(evidence.sourceTaskId)
  );
}

function invalidSkillCandidate(message: string): Result<never, SpriteError> {
  return err(new SpriteError("SKILL_CANDIDATE_ARTIFACT_INVALID", message));
}

function toSkillCandidateStorageError(
  code: string,
  error: unknown
): SpriteError {
  return new SpriteError(
    code,
    error instanceof Error ? error.message : String(error)
  );
}

function isSafeCandidateText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= SAFE_TEXT_MAX_LENGTH &&
    !containsSecretLikeValue(value) &&
    !RAW_FILESYSTEM_PATH_PATTERN.test(value)
  );
}

function isSafeTextArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= ARRAY_MAX_LENGTH &&
    value.every((item) => isSafeCandidateText(item))
  );
}

function isSafeProjectRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= SAFE_TEXT_MAX_LENGTH &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.split(/[\\/]+/).includes("..") &&
    !containsSecretLikeValue(value)
  );
}

function containsUnsafeSkillCandidateValue(
  value: unknown,
  seen: WeakSet<object>
): boolean {
  if (typeof value === "string") {
    return (
      value.length > SAFE_TEXT_MAX_LENGTH ||
      containsSecretLikeValue(value) ||
      RAW_FILESYSTEM_PATH_PATTERN.test(value)
    );
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);

    return value.some((item) => containsUnsafeSkillCandidateValue(item, seen));
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  return Object.values(value).some((nested) =>
    containsUnsafeSkillCandidateValue(nested, seen)
  );
}

function findForbiddenSkillCandidateField(
  value: unknown,
  seen: WeakSet<object>
): string | null {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null;
    }

    seen.add(value);

    for (const item of value) {
      const nested = findForbiddenSkillCandidateField(item, seen);

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
    if (FORBIDDEN_SKILL_CANDIDATE_FIELDS.has(key)) {
      return key;
    }

    const nested = findForbiddenSkillCandidateField(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function isInsidePath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function ensureDirectoryInsideRoot(
  root: string,
  directory: string,
  errorCode: string,
  errorMessage: string
): Result<void, SpriteError> {
  const rootPath = path.resolve(root);
  const directoryPath = path.resolve(directory);

  if (!isInsidePath(rootPath, directoryPath)) {
    return err(new SpriteError(errorCode, errorMessage));
  }

  if (!existsSync(rootPath)) {
    try {
      mkdirSync(rootPath, { recursive: true });
    } catch (error) {
      return err(
        toSkillCandidateStorageError("SKILL_CANDIDATE_STORAGE_ERROR", error)
      );
    }
  }

  const relativePath = path.relative(rootPath, directoryPath);
  const segments =
    relativePath.length === 0 ? [] : relativePath.split(path.sep).filter(Boolean);
  let currentPath = rootPath;

  try {
    for (const segment of segments) {
      currentPath = path.join(currentPath, segment);

      if (!existsSync(currentPath)) {
        mkdirSync(currentPath);
        continue;
      }

      const stats = lstatSync(currentPath);

      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return err(new SpriteError(errorCode, errorMessage));
      }
    }
  } catch (error) {
    return err(toSkillCandidateStorageError("SKILL_CANDIDATE_STORAGE_ERROR", error));
  }

  return { ok: true, value: undefined };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
