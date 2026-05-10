import { createHash } from "node:crypto";
import {
  FORBIDDEN_SKILL_CANDIDATE_FIELDS,
  SpriteError,
  SKILL_CANDIDATE_ARRAY_MAX_LENGTH as ARRAY_MAX_LENGTH,
  SKILL_CANDIDATE_CONFIDENCE_VALUES,
  SKILL_CANDIDATE_CORRELATION_ID_PATTERN as CORRELATION_ID_PATTERN,
  SKILL_CANDIDATE_EVENT_ID_PATTERN as EVENT_ID_PATTERN,
  SKILL_CANDIDATE_ID_PATTERN as CANDIDATE_ID_PATTERN,
  SKILL_CANDIDATE_LIFECYCLE_STATUSES,
  SKILL_CANDIDATE_PROMOTION_TARGETS,
  SKILL_CANDIDATE_RAW_FILESYSTEM_PATH_PATTERN as RAW_FILESYSTEM_PATH_PATTERN,
  SKILL_CANDIDATE_REVIEW_ACTIONS,
  SKILL_CANDIDATE_SAFE_NAME_MAX_LENGTH as SAFE_NAME_MAX_LENGTH,
  SKILL_CANDIDATE_SAFE_TEXT_MAX_LENGTH as SAFE_TEXT_MAX_LENGTH,
  SKILL_CANDIDATE_SCHEMA_VERSION,
  SKILL_CANDIDATE_SESSION_ID_PATTERN as SESSION_ID_PATTERN,
  SKILL_CANDIDATE_SIGNAL_ID_PATTERN as SKILL_SIGNAL_ID_PATTERN,
  SKILL_CANDIDATE_SKIPPED_REASONS,
  SKILL_CANDIDATE_SOURCE_OUTCOMES,
  SKILL_CANDIDATE_SOURCE_STATUSES,
  SKILL_CANDIDATE_TASK_ID_PATTERN as TASK_ID_PATTERN,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  type Result,
  type SkillCandidateConfidence,
  type SkillCandidateLifecycleStatus,
  type SkillCandidatePromotionTarget,
  type SkillCandidateReviewAction,
  type SkillCandidateSkippedReason,
  type SkillCandidateSourceOutcome,
  type SkillCandidateSourceStatus
} from "@sprite/shared";

export {
  SKILL_CANDIDATE_CONFIDENCE_VALUES,
  SKILL_CANDIDATE_LIFECYCLE_STATUSES,
  SKILL_CANDIDATE_PROMOTION_TARGETS,
  SKILL_CANDIDATE_REVIEW_ACTIONS,
  SKILL_CANDIDATE_SCHEMA_VERSION,
  SKILL_CANDIDATE_SKIPPED_REASONS,
  SKILL_CANDIDATE_SOURCE_OUTCOMES,
  SKILL_CANDIDATE_SOURCE_STATUSES,
  type SkillCandidateConfidence,
  type SkillCandidateLifecycleStatus,
  type SkillCandidatePromotionTarget,
  type SkillCandidateReviewAction,
  type SkillCandidateSkippedReason,
  type SkillCandidateSourceOutcome,
  type SkillCandidateSourceStatus
} from "@sprite/shared";

export interface SkillCandidateSourceSignal {
  confidence?: "low" | "medium" | "high";
  evidenceEventIds: readonly string[];
  id: string;
  knownRisks?: readonly string[];
  outcome?: SkillCandidateSourceOutcome;
  signal?: string;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceTaskId: string;
  status?: SkillCandidateSourceStatus;
  toolSequence?: readonly string[];
  triggerReason: string;
  workflowSummary?: string;
}

export interface SkillCandidateSupportingEvidence {
  evidenceEventIds: string[];
  learningReviewArtifactPath: string;
  outcome: SkillCandidateSourceOutcome;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceSkillSignalId: string;
  sourceTaskId: string;
}

export interface SkillCandidate {
  candidateId: string;
  confidence: SkillCandidateConfidence;
  counterexamples: string[];
  createdAt: string;
  draftSavedAt?: string;
  examples: string[];
  id: string;
  intendedActivationConditions: string[];
  knownRisks: string[];
  learningReviewArtifactPath: string;
  lifecycleStatus: SkillCandidateLifecycleStatus;
  name: string;
  promotedAt?: string;
  promotedSkillReference?: string;
  promotionTarget?: SkillCandidatePromotionTarget;
  rejectionReason?: string;
  requiredTools: string[];
  reviewReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  schemaVersion: typeof SKILL_CANDIDATE_SCHEMA_VERSION;
  sourceCorrelationIds: string[];
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  summary: string;
  supportingEvidence: SkillCandidateSupportingEvidence[];
  triggerReason: string;
  updatedAt: string;
  workflowSteps: string[];
  workflowSummary: string;
}

export interface SkillCandidateGenerationRequest {
  correlationId: string;
  createdAt?: string;
  existingCandidateIds?: readonly string[];
  learningReviewArtifactPath: string;
  sessionId: string;
  signals: readonly SkillCandidateSourceSignal[];
  taskId: string;
}

export interface SkillCandidateSkippedGeneration {
  consideredSignalIds: string[];
  reason: SkillCandidateSkippedReason;
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceTaskIds: string[];
  status: "skipped";
  summary: string;
}

export interface SkillCandidateGenerationResult {
  candidates: SkillCandidate[];
  skipped: SkillCandidateSkippedGeneration[];
}

export interface SkillCandidateCreatedEventSummary {
  candidateArtifactPath: string;
  candidateId: string;
  confidence: SkillCandidateConfidence;
  intendedActivationSummary: string;
  knownRisks: string[];
  lifecycleStatus: SkillCandidateLifecycleStatus;
  name: string;
  requiredTools: string[];
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  status: "created";
  summary: string;
  triggerReason: string;
  workflowStepCount: number;
}

export interface SkillCandidateSkippedEventSummary {
  consideredSignalIds: string[];
  reason: SkillCandidateSkippedReason;
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceTaskIds: string[];
  status: "skipped";
  summary: string;
}

export interface SkillCandidateEditableFields {
  counterexamples?: readonly string[];
  examples?: readonly string[];
  intendedActivationConditions?: readonly string[];
  knownRisks?: readonly string[];
  name?: string;
  requiredTools?: readonly string[];
  summary?: string;
  triggerReason?: string;
  workflowSteps?: readonly string[];
  workflowSummary?: string;
}

export interface SkillCandidateReviewRequest {
  action: SkillCandidateReviewAction;
  candidateId: string;
  confirmPromotion?: boolean;
  edits?: SkillCandidateEditableFields;
  promotionTarget?: SkillCandidatePromotionTarget;
  reason: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface PromotedSkillManifest {
  content: string;
  name: string;
  reference: string;
  relativePath: string;
  source: SkillCandidatePromotionTarget;
}

export interface SkillCandidateReviewView {
  candidateId: string;
  confidence: SkillCandidateConfidence;
  counterexamples: string[];
  createdAt: string;
  draftSavedAt?: string;
  examples: string[];
  intendedActivationConditions: string[];
  knownRisks: string[];
  lifecycleStatus: SkillCandidateLifecycleStatus;
  name: string;
  promotedAt?: string;
  promotedSkillReference?: string;
  promotionTarget?: SkillCandidatePromotionTarget;
  rejectionReason?: string;
  requiredTools: string[];
  reviewReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  sourceEventIds: string[];
  sourceSessionIds: string[];
  sourceSkillSignalIds: string[];
  sourceTaskIds: string[];
  summary: string;
  triggerReason: string;
  updatedAt: string;
  workflowSteps: string[];
  workflowSummary: string;
}

export interface SkillCandidateReviewResult {
  action: SkillCandidateReviewAction;
  candidate: SkillCandidate;
  lifecycleStatus: SkillCandidateLifecycleStatus;
  promotedSkillManifest?: PromotedSkillManifest;
  promotedSkillReference?: string;
  summary: string;
  view: SkillCandidateReviewView;
}

interface NormalizedSkillCandidateSignal {
  confidence: "low" | "medium" | "high";
  evidenceEventIds: string[];
  id: string;
  knownRisks: string[];
  outcome: SkillCandidateSourceOutcome;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceTaskId: string;
  status: SkillCandidateSourceStatus;
  toolSequence: string[];
  triggerReason: string;
  workflowIdentity: string;
  workflowSummary: string;
}

export function generateSkillCandidatesFromSignals(
  request: SkillCandidateGenerationRequest
): Result<SkillCandidateGenerationResult, SpriteError> {
  const requestValidation = validateGenerationRequest(request);

  if (!requestValidation.ok) {
    return err(requestValidation.error);
  }

  const createdAt = request.createdAt ?? new Date().toISOString();
  const existingCandidateIds = new Set(request.existingCandidateIds ?? []);
  const skipped: SkillCandidateSkippedGeneration[] = [];
  const groupedSignals = new Map<string, NormalizedSkillCandidateSignal[]>();

  for (const signal of request.signals) {
    const normalized = normalizeCandidateSignal(signal);

    if (!normalized.ok) {
      skipped.push(createSkippedCandidateSummary(normalized.reason, [signal]));
      continue;
    }

    const group = groupedSignals.get(normalized.value.workflowIdentity) ?? [];
    group.push(normalized.value);
    groupedSignals.set(normalized.value.workflowIdentity, group);
  }

  const candidates: SkillCandidate[] = [];

  for (const signals of groupedSignals.values()) {
    const evidenceEventIds = uniqueStrings(
      signals.flatMap((signal) => signal.evidenceEventIds)
    );
    const hasContradictedGuidance = signals.some(
      (signal) => signal.outcome === "contradicted_guidance"
    );
    const hasRepeatedCompatibleEvidence = signals.length >= 2;
    const hasStrongCorrectionOrRecovery =
      signals.length === 1 &&
      (signals[0].outcome === "corrected_workflow" ||
        signals[0].outcome === "recovered_workflow") &&
        signals[0].evidenceEventIds.length >= 2 &&
        signals[0].toolSequence.length > 0;

    if (hasContradictedGuidance) {
      skipped.push(
        createSkippedCandidateSummary("conflicting_evidence", signals)
      );
      continue;
    }

    if (!hasRepeatedCompatibleEvidence && !hasStrongCorrectionOrRecovery) {
      skipped.push(
        createSkippedCandidateSummary("insufficient_evidence", signals)
      );
      continue;
    }

    const requiredTools = uniqueStrings(
      signals.flatMap((signal) => signal.toolSequence.map(extractRequiredTool))
    ).slice(0, ARRAY_MAX_LENGTH);
    const candidateId = createCandidateId(
      `${signals[0].workflowIdentity}:${requiredTools.join(",")}`
    );

    if (existingCandidateIds.has(candidateId)) {
      skipped.push(
        createSkippedCandidateSummary("duplicate_candidate", signals)
      );
      continue;
    }

    const candidate = createSkillCandidate({
      candidateId,
      confidence: hasRepeatedCompatibleEvidence ? "medium" : "low",
      createdAt,
      learningReviewArtifactPath: request.learningReviewArtifactPath,
      requiredTools,
      signals,
      workflowIdentity: signals[0].workflowIdentity
    });
    const validation = validateSkillCandidate(candidate);

    if (!validation.ok) {
      skipped.push(createSkippedCandidateSummary("unsafe_signal", signals));
      continue;
    }

    existingCandidateIds.add(candidateId);
    candidates.push(validation.value);
  }

  return {
    ok: true,
    value: {
      candidates,
      skipped
    }
  };
}

export function validateSkillCandidate(
  candidate: SkillCandidate
): Result<SkillCandidate, SpriteError> {
  if (!isPlainRecord(candidate)) {
    return invalidCandidate("Skill candidate must be a plain object.");
  }

  const forbiddenField = findForbiddenSkillCandidateField(
    candidate,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return invalidCandidate(
      `Skill candidate must not include raw or activation field '${forbiddenField}'.`
    );
  }

  if (candidate.schemaVersion !== SKILL_CANDIDATE_SCHEMA_VERSION) {
    return invalidCandidate("Skill candidate schemaVersion is unsupported.");
  }

  if (
    !CANDIDATE_ID_PATTERN.test(candidate.id) ||
    candidate.candidateId !== candidate.id
  ) {
    return invalidCandidate("Skill candidate ID must use skillcand_.");
  }

  if (!SKILL_CANDIDATE_CONFIDENCE_VALUES.includes(candidate.confidence)) {
    return invalidCandidate("Skill candidate confidence is unsupported.");
  }

  if (!SKILL_CANDIDATE_LIFECYCLE_STATUSES.includes(candidate.lifecycleStatus)) {
    return invalidCandidate("Skill candidate lifecycleStatus is unsupported.");
  }

  if (
    Number.isNaN(Date.parse(candidate.createdAt)) ||
    Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return invalidCandidate("Skill candidate timestamps must be valid ISO.");
  }

  if (!isSafeProjectRelativePath(candidate.learningReviewArtifactPath)) {
    return invalidCandidate(
      "Skill candidate learningReviewArtifactPath must be project-relative and safe."
    );
  }

  for (const field of [
    ["name", candidate.name, SAFE_NAME_MAX_LENGTH],
    ["summary", candidate.summary, SAFE_TEXT_MAX_LENGTH],
    ["triggerReason", candidate.triggerReason, SAFE_TEXT_MAX_LENGTH],
    ["workflowSummary", candidate.workflowSummary, SAFE_TEXT_MAX_LENGTH]
  ] as const) {
    if (!isSafeCandidateText(field[1], field[2])) {
      return invalidCandidate(`Skill candidate ${field[0]} must be safe.`);
    }
  }

  for (const field of [
    ["reviewReason", candidate.reviewReason],
    ["reviewedBy", candidate.reviewedBy],
    ["rejectionReason", candidate.rejectionReason],
    ["promotedSkillReference", candidate.promotedSkillReference]
  ] as const) {
    if (
      field[1] !== undefined &&
      !isSafeCandidateText(field[1], SAFE_TEXT_MAX_LENGTH)
    ) {
      return invalidCandidate(`Skill candidate ${field[0]} must be safe.`);
    }
  }

  for (const field of [
    ["draftSavedAt", candidate.draftSavedAt],
    ["reviewedAt", candidate.reviewedAt],
    ["promotedAt", candidate.promotedAt]
  ] as const) {
    if (field[1] !== undefined && Number.isNaN(Date.parse(field[1]))) {
      return invalidCandidate(
        `Skill candidate ${field[0]} must be a valid ISO timestamp.`
      );
    }
  }

  if (
    candidate.promotionTarget !== undefined &&
    !SKILL_CANDIDATE_PROMOTION_TARGETS.includes(candidate.promotionTarget)
  ) {
    return invalidCandidate("Skill candidate promotionTarget is unsupported.");
  }

  if (
    candidate.lifecycleStatus === "rejected" &&
    candidate.rejectionReason === undefined
  ) {
    return invalidCandidate("Rejected skill candidates require a reason.");
  }

  if (
    candidate.lifecycleStatus !== "rejected" &&
    candidate.rejectionReason !== undefined
  ) {
    return invalidCandidate(
      "Rejection metadata is only valid for rejected skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "draft" &&
    candidate.draftSavedAt === undefined
  ) {
    return invalidCandidate("Draft skill candidates require draft metadata.");
  }

  if (
    candidate.lifecycleStatus !== "draft" &&
    candidate.draftSavedAt !== undefined
  ) {
    return invalidCandidate(
      "Draft metadata is only valid for draft skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "promoted" &&
    (candidate.promotedAt === undefined ||
      candidate.promotedSkillReference === undefined ||
      candidate.promotionTarget === undefined)
  ) {
    return invalidCandidate(
      "Promoted skill candidates require promotion metadata."
    );
  }

  if (
    candidate.lifecycleStatus !== "promoted" &&
    (candidate.promotedAt !== undefined ||
      candidate.promotedSkillReference !== undefined ||
      candidate.promotionTarget !== undefined)
  ) {
    return invalidCandidate(
      "Promotion metadata is only valid for promoted skill candidates."
    );
  }

  if (
    candidate.lifecycleStatus === "proposed" &&
    (candidate.reviewReason !== undefined ||
      candidate.reviewedAt !== undefined ||
      candidate.reviewedBy !== undefined)
  ) {
    return invalidCandidate(
      "Review metadata is only valid after a skill candidate review."
    );
  }

  if (
    candidate.lifecycleStatus !== "proposed" &&
    (candidate.reviewReason === undefined ||
      candidate.reviewedAt === undefined ||
      candidate.reviewedBy === undefined)
  ) {
    return invalidCandidate(
      "Reviewed skill candidates require review metadata."
    );
  }

  for (const [field, values, allowEmpty] of [
    ["counterexamples", candidate.counterexamples, false],
    ["examples", candidate.examples, false],
    [
      "intendedActivationConditions",
      candidate.intendedActivationConditions,
      false
    ],
    ["knownRisks", candidate.knownRisks, false],
    ["requiredTools", candidate.requiredTools, false],
    ["sourceCorrelationIds", candidate.sourceCorrelationIds, false],
    ["sourceEventIds", candidate.sourceEventIds, false],
    ["sourceSessionIds", candidate.sourceSessionIds, false],
    ["sourceSkillSignalIds", candidate.sourceSkillSignalIds, false],
    ["sourceTaskIds", candidate.sourceTaskIds, false],
    ["workflowSteps", candidate.workflowSteps, false]
  ] as const) {
    if (!isSafeTextArray(values, { allowEmpty })) {
      return invalidCandidate(`Skill candidate ${field} must be safe.`);
    }
  }

  if (candidate.supportingEvidence.length === 0) {
    return invalidCandidate(
      "Skill candidate supportingEvidence must be non-empty."
    );
  }

  for (const evidence of candidate.supportingEvidence) {
    if (!isValidSupportingEvidence(evidence)) {
      return invalidCandidate(
        "Skill candidate supportingEvidence must include safe source metadata."
      );
    }
  }

  if (
    candidate.sourceSkillSignalIds.some(
      (id) => !SKILL_SIGNAL_ID_PATTERN.test(id)
    ) ||
    candidate.sourceSessionIds.some((id) => !SESSION_ID_PATTERN.test(id)) ||
    candidate.sourceTaskIds.some((id) => !TASK_ID_PATTERN.test(id)) ||
    candidate.sourceCorrelationIds.some(
      (id) => !CORRELATION_ID_PATTERN.test(id)
    ) ||
    candidate.sourceEventIds.some((id) => !EVENT_ID_PATTERN.test(id))
  ) {
    return invalidCandidate(
      "Skill candidate source identifiers must use runtime prefixes."
    );
  }

  if (containsUnsafeCandidateValue(candidate, new WeakSet())) {
    return invalidCandidate(
      "Skill candidate must not include secret-looking values, raw paths, or unbounded strings."
    );
  }

  return { ok: true, value: candidate };
}

export function summarizeSkillCandidateForEvent(
  candidate: SkillCandidate,
  candidateArtifactPath: string
): SkillCandidateCreatedEventSummary {
  return {
    candidateArtifactPath,
    candidateId: candidate.candidateId,
    confidence: candidate.confidence,
    intendedActivationSummary: createRedactedPreview(
      candidate.intendedActivationConditions.join(" "),
      SAFE_TEXT_MAX_LENGTH
    ),
    knownRisks: candidate.knownRisks,
    lifecycleStatus: candidate.lifecycleStatus,
    name: candidate.name,
    requiredTools: candidate.requiredTools,
    sourceEventIds: candidate.sourceEventIds,
    sourceSessionIds: candidate.sourceSessionIds,
    sourceSkillSignalIds: candidate.sourceSkillSignalIds,
    sourceTaskIds: candidate.sourceTaskIds,
    status: "created",
    summary: candidate.summary,
    triggerReason: candidate.triggerReason,
    workflowStepCount: candidate.workflowSteps.length
  };
}

export function summarizeSkillCandidateSkippedForEvent(
  skipped: SkillCandidateSkippedGeneration
): SkillCandidateSkippedEventSummary {
  return {
    consideredSignalIds: skipped.consideredSignalIds,
    reason: skipped.reason,
    sourceEventIds: skipped.sourceEventIds,
    sourceSessionIds: skipped.sourceSessionIds,
    sourceTaskIds: skipped.sourceTaskIds,
    status: "skipped",
    summary: skipped.summary
  };
}

export function summarizeSkillCandidateForReview(
  candidate: SkillCandidate
): SkillCandidateReviewView {
  return {
    candidateId: candidate.candidateId,
    confidence: candidate.confidence,
    counterexamples: candidate.counterexamples,
    createdAt: candidate.createdAt,
    draftSavedAt: candidate.draftSavedAt,
    examples: candidate.examples,
    intendedActivationConditions: candidate.intendedActivationConditions,
    knownRisks: candidate.knownRisks,
    lifecycleStatus: candidate.lifecycleStatus,
    name: candidate.name,
    promotedAt: candidate.promotedAt,
    promotedSkillReference: candidate.promotedSkillReference,
    promotionTarget: candidate.promotionTarget,
    rejectionReason: candidate.rejectionReason,
    requiredTools: candidate.requiredTools,
    reviewReason: candidate.reviewReason,
    reviewedAt: candidate.reviewedAt,
    reviewedBy: candidate.reviewedBy,
    sourceEventIds: candidate.sourceEventIds,
    sourceSessionIds: candidate.sourceSessionIds,
    sourceSkillSignalIds: candidate.sourceSkillSignalIds,
    sourceTaskIds: candidate.sourceTaskIds,
    summary: candidate.summary,
    triggerReason: candidate.triggerReason,
    updatedAt: candidate.updatedAt,
    workflowSteps: candidate.workflowSteps,
    workflowSummary: candidate.workflowSummary
  };
}

export function reviewSkillCandidate(
  candidate: SkillCandidate,
  request: SkillCandidateReviewRequest
): Result<SkillCandidateReviewResult, SpriteError> {
  const current = validateSkillCandidate(candidate);

  if (!current.ok) {
    return err(current.error);
  }

  const requestValidation = validateSkillCandidateReviewRequest(request);

  if (!requestValidation.ok) {
    return err(requestValidation.error);
  }

  if (request.candidateId !== current.value.id) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_REVIEW_INVALID",
        "Skill candidate review candidateId must match the candidate artifact."
      )
    );
  }

  if (
    current.value.lifecycleStatus === "promoted" ||
    current.value.lifecycleStatus === "rejected"
  ) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_ALREADY_REVIEWED",
        "Skill candidate has already reached a terminal review state."
      )
    );
  }

  if (request.action === "promote" && request.confirmPromotion !== true) {
    return err(
      new SpriteError(
        "SKILL_CANDIDATE_PROMOTION_UNCONFIRMED",
        "Skill candidate promotion requires explicit confirmation."
      )
    );
  }

  const reviewedAt = request.reviewedAt ?? new Date().toISOString();
  const reviewedBy = request.reviewedBy ?? "human";
  const reason = createRedactedPreview(request.reason, SAFE_TEXT_MAX_LENGTH);
  const next = applySkillCandidateEdits(current.value, request.edits);

  if (!next.ok) {
    return err(next.error);
  }

  const lifecycleStatus = toReviewedLifecycleStatus(request.action);
  const reviewedCandidate: SkillCandidate = {
    ...next.value,
    lifecycleStatus,
    reviewReason: reason,
    reviewedAt,
    reviewedBy,
    updatedAt: reviewedAt
  };

  delete reviewedCandidate.promotedAt;
  delete reviewedCandidate.promotedSkillReference;
  delete reviewedCandidate.promotionTarget;
  delete reviewedCandidate.rejectionReason;

  let promotedSkillManifest: PromotedSkillManifest | undefined;

  if (request.action === "draft" || request.action === "edit") {
    reviewedCandidate.draftSavedAt = reviewedAt;
  }

  if (request.action === "reject") {
    delete reviewedCandidate.draftSavedAt;
    reviewedCandidate.rejectionReason = reason;
  }

  if (request.action === "promote") {
    delete reviewedCandidate.draftSavedAt;
    const promotionTarget = request.promotionTarget ?? "project";
    promotedSkillManifest = createPromotedSkillManifest(reviewedCandidate);
    reviewedCandidate.promotedAt = reviewedAt;
    reviewedCandidate.promotedSkillReference = promotedSkillManifest.reference;
    reviewedCandidate.promotionTarget = promotionTarget;
  }

  const validation = validateSkillCandidate(reviewedCandidate);

  if (!validation.ok) {
    return err(validation.error);
  }

  return {
    ok: true,
    value: {
      action: request.action,
      candidate: validation.value,
      lifecycleStatus: validation.value.lifecycleStatus,
      promotedSkillManifest,
      promotedSkillReference: validation.value.promotedSkillReference,
      summary: createRedactedPreview(
        `Skill candidate ${request.action} review saved as ${validation.value.lifecycleStatus}.`,
        SAFE_TEXT_MAX_LENGTH
      ),
      view: summarizeSkillCandidateForReview(validation.value)
    }
  };
}

function validateGenerationRequest(
  request: SkillCandidateGenerationRequest
): Result<void, SpriteError> {
  if (
    !CORRELATION_ID_PATTERN.test(request.correlationId) ||
    !SESSION_ID_PATTERN.test(request.sessionId) ||
    !TASK_ID_PATTERN.test(request.taskId)
  ) {
    return invalidCandidate(
      "Skill candidate generation source identifiers must use runtime prefixes."
    );
  }

  if (!isSafeProjectRelativePath(request.learningReviewArtifactPath)) {
    return invalidCandidate(
      "Skill candidate generation learningReviewArtifactPath must be safe."
    );
  }

  if (
    request.createdAt !== undefined &&
    Number.isNaN(Date.parse(request.createdAt))
  ) {
    return invalidCandidate(
      "Skill candidate generation createdAt must be a valid ISO timestamp."
    );
  }

  for (const id of request.existingCandidateIds ?? []) {
    if (!CANDIDATE_ID_PATTERN.test(id)) {
      return invalidCandidate(
        "Skill candidate generation existingCandidateIds must use skillcand_."
      );
    }
  }

  return { ok: true, value: undefined };
}

function validateSkillCandidateReviewRequest(
  request: SkillCandidateReviewRequest
): Result<void, SpriteError> {
  if (!isPlainRecord(request)) {
    return invalidCandidate("Skill candidate review request must be an object.");
  }

  const forbiddenField = findForbiddenSkillCandidateField(
    request,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return invalidCandidate(
      `Skill candidate review must not include raw or activation field '${forbiddenField}'.`
    );
  }

  if (!SKILL_CANDIDATE_REVIEW_ACTIONS.includes(request.action)) {
    return invalidCandidate("Skill candidate review action is unsupported.");
  }

  if (!CANDIDATE_ID_PATTERN.test(request.candidateId)) {
    return invalidCandidate(
      "Skill candidate review candidateId must use skillcand_."
    );
  }

  if (!isSafeCandidateText(request.reason)) {
    return invalidCandidate("Skill candidate review reason must be safe.");
  }

  if (
    request.reviewedAt !== undefined &&
    Number.isNaN(Date.parse(request.reviewedAt))
  ) {
    return invalidCandidate(
      "Skill candidate review reviewedAt must be a valid ISO timestamp."
    );
  }

  if (
    request.reviewedBy !== undefined &&
    !isSafeCandidateText(request.reviewedBy, SAFE_NAME_MAX_LENGTH)
  ) {
    return invalidCandidate("Skill candidate review reviewedBy must be safe.");
  }

  if (
    request.promotionTarget !== undefined &&
    !SKILL_CANDIDATE_PROMOTION_TARGETS.includes(request.promotionTarget)
  ) {
    return invalidCandidate(
      "Skill candidate review promotionTarget is unsupported."
    );
  }

  if (
    request.action !== "promote" &&
    (request.confirmPromotion !== undefined ||
      request.promotionTarget !== undefined)
  ) {
    return invalidCandidate(
      "Skill candidate promotion metadata is only valid for promote reviews."
    );
  }

  if (
    request.edits !== undefined &&
    !validateSkillCandidateEdits(request.edits).ok
  ) {
    return invalidCandidate("Skill candidate review edits must be safe.");
  }

  if (containsUnsafeCandidateValue(request, new WeakSet())) {
    return invalidCandidate(
      "Skill candidate review must not include secret-looking values, raw paths, or unbounded strings."
    );
  }

  return { ok: true, value: undefined };
}

function validateSkillCandidateEdits(
  edits: SkillCandidateEditableFields
): Result<void, SpriteError> {
  if (!isPlainRecord(edits)) {
    return invalidCandidate("Skill candidate review edits must be an object.");
  }

  const allowedFields = new Set([
    "counterexamples",
    "examples",
    "intendedActivationConditions",
    "knownRisks",
    "name",
    "requiredTools",
    "summary",
    "triggerReason",
    "workflowSteps",
    "workflowSummary"
  ]);

  for (const field of Object.keys(edits)) {
    if (!allowedFields.has(field)) {
      return invalidCandidate(
        `Skill candidate review edit field '${field}' is unsupported.`
      );
    }
  }

  for (const [field, value, maxLength] of [
    ["name", edits.name, SAFE_NAME_MAX_LENGTH],
    ["summary", edits.summary, SAFE_TEXT_MAX_LENGTH],
    ["triggerReason", edits.triggerReason, SAFE_TEXT_MAX_LENGTH],
    ["workflowSummary", edits.workflowSummary, SAFE_TEXT_MAX_LENGTH]
  ] as const) {
    if (
      value !== undefined &&
      !isSafeCandidateText(value, maxLength)
    ) {
      return invalidCandidate(`Skill candidate edit ${field} must be safe.`);
    }
  }

  for (const [field, values] of [
    ["counterexamples", edits.counterexamples],
    ["examples", edits.examples],
    ["intendedActivationConditions", edits.intendedActivationConditions],
    ["knownRisks", edits.knownRisks],
    ["requiredTools", edits.requiredTools],
    ["workflowSteps", edits.workflowSteps]
  ] as const) {
    if (
      values !== undefined &&
      !isSafeTextArray(values, { allowEmpty: false })
    ) {
      return invalidCandidate(`Skill candidate edit ${field} must be safe.`);
    }
  }

  return { ok: true, value: undefined };
}

function applySkillCandidateEdits(
  candidate: SkillCandidate,
  edits: SkillCandidateEditableFields | undefined
): Result<SkillCandidate, SpriteError> {
  if (edits === undefined) {
    return { ok: true, value: { ...candidate } };
  }

  const validation = validateSkillCandidateEdits(edits);

  if (!validation.ok) {
    return err(validation.error);
  }

  return {
    ok: true,
    value: {
      ...candidate,
      counterexamples:
        edits.counterexamples === undefined
          ? candidate.counterexamples
          : uniqueStrings([...edits.counterexamples]),
      examples:
        edits.examples === undefined
          ? candidate.examples
          : uniqueStrings([...edits.examples]),
      intendedActivationConditions:
        edits.intendedActivationConditions === undefined
          ? candidate.intendedActivationConditions
          : uniqueStrings([...edits.intendedActivationConditions]),
      knownRisks:
        edits.knownRisks === undefined
          ? candidate.knownRisks
          : uniqueStrings([...edits.knownRisks]),
      name: edits.name ?? candidate.name,
      requiredTools:
        edits.requiredTools === undefined
          ? candidate.requiredTools
          : uniqueStrings([...edits.requiredTools]),
      summary: edits.summary ?? candidate.summary,
      triggerReason: edits.triggerReason ?? candidate.triggerReason,
      workflowSteps:
        edits.workflowSteps === undefined
          ? candidate.workflowSteps
          : uniqueStrings([...edits.workflowSteps]),
      workflowSummary: edits.workflowSummary ?? candidate.workflowSummary
    }
  };
}

function toReviewedLifecycleStatus(
  action: SkillCandidateReviewAction
): SkillCandidateLifecycleStatus {
  if (action === "promote") {
    return "promoted";
  }

  if (action === "reject") {
    return "rejected";
  }

  return "draft";
}

function createPromotedSkillManifest(
  candidate: SkillCandidate
): PromotedSkillManifest {
  const skillDirectoryName = createSkillDirectoryName(candidate.name);
  const activationHint = toManifestLine(
    candidate.intendedActivationConditions.join(" ")
  );
  const description = toManifestLine(candidate.summary);
  const name = toManifestLine(candidate.name, SAFE_NAME_MAX_LENGTH);
  const content = `---\nname: ${name}\ndescription: ${description}\nactivationHint: ${activationHint}\n---\n\n# ${name}\n\n${candidate.workflowSummary}\n\n## When to use\n${formatMarkdownList(
    candidate.intendedActivationConditions
  )}\n\n## Trigger reason\n${createRedactedPreview(
    candidate.triggerReason,
    SAFE_TEXT_MAX_LENGTH
  )}\n\n## Workflow\n${formatMarkdownList(
    candidate.workflowSteps
  )}\n\n## Required tools\n${formatMarkdownList(
    candidate.requiredTools
  )}\n\n## Known risks\n${formatMarkdownList(
    candidate.knownRisks
  )}\n\n## Examples\n${formatMarkdownList(
    candidate.examples
  )}\n\n## Counterexamples\n${formatMarkdownList(
    candidate.counterexamples
  )}\n\n## Source evidence\n${formatMarkdownList(
    candidate.supportingEvidence.map(
      (evidence) =>
        `${evidence.sourceSkillSignalId} from ${evidence.sourceSessionId}/${evidence.sourceTaskId}`
    )
  )}\n`;

  return {
    content,
    name,
    reference: `project:${name}`,
    relativePath: `${skillDirectoryName}/SKILL.md`,
    source: "project"
  };
}

function createSkillDirectoryName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized.length === 0 ? "promoted-skill-candidate" : normalized;
}

function toManifestLine(
  value: string,
  maxLength = SAFE_TEXT_MAX_LENGTH
): string {
  return createRedactedPreview(
    value.replace(/\s+/g, " ").trim(),
    maxLength
  );
}

function formatMarkdownList(values: readonly string[]): string {
  return values
    .map((value) => `- ${createRedactedPreview(value, SAFE_TEXT_MAX_LENGTH)}`)
    .join("\n");
}

function normalizeCandidateSignal(signal: SkillCandidateSourceSignal):
  | { ok: true; value: NormalizedSkillCandidateSignal }
  | { ok: false; reason: SkillCandidateSkippedReason } {
  const forbiddenField = findForbiddenSkillCandidateField(
    signal,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return { ok: false, reason: "unsafe_signal" };
  }

  if ((signal.status ?? "signal_only") !== "signal_only") {
    return { ok: false, reason: "unsupported_signal_status" };
  }

  const workflowSummary = createRedactedPreview(
    signal.workflowSummary ?? signal.signal ?? signal.triggerReason,
    SAFE_TEXT_MAX_LENGTH
  );
  const triggerReason = createRedactedPreview(
    signal.triggerReason,
    SAFE_TEXT_MAX_LENGTH
  );
  const toolSequence = uniqueStrings(
    (signal.toolSequence ?? signal.evidenceEventIds).map((tool) =>
      createRedactedPreview(tool, SAFE_TEXT_MAX_LENGTH)
    )
  );
  const sourceCorrelationId = signal.sourceCorrelationId;
  const sourceSessionId = signal.sourceSessionId;
  const sourceTaskId = signal.sourceTaskId;
  const outcome = signal.outcome ?? "successful_workflow";
  const confidence = signal.confidence ?? "low";
  const knownRisks = uniqueStrings([
    ...(signal.knownRisks ?? []),
    "Candidate generation is proposal-only; review before creating active skills."
  ]).map((risk) => createRedactedPreview(risk, SAFE_TEXT_MAX_LENGTH));
  const evidenceEventIds = uniqueStrings([...signal.evidenceEventIds]);

  if (
    !SKILL_SIGNAL_ID_PATTERN.test(signal.id) ||
    !CORRELATION_ID_PATTERN.test(sourceCorrelationId) ||
    !SESSION_ID_PATTERN.test(sourceSessionId) ||
    !TASK_ID_PATTERN.test(sourceTaskId) ||
    !SKILL_CANDIDATE_SOURCE_OUTCOMES.includes(outcome) ||
    !["low", "medium", "high"].includes(confidence) ||
    evidenceEventIds.length === 0 ||
    toolSequence.length === 0 ||
    evidenceEventIds.some((eventId) => !EVENT_ID_PATTERN.test(eventId)) ||
    !isSafeCandidateText(workflowSummary) ||
    !isSafeCandidateText(triggerReason) ||
    !isSafeTextArray(toolSequence, { allowEmpty: false }) ||
    !isSafeTextArray(knownRisks, { allowEmpty: false })
  ) {
    return { ok: false, reason: "unsafe_signal" };
  }

  return {
    ok: true,
    value: {
      confidence,
      evidenceEventIds,
      id: signal.id,
      knownRisks,
      outcome,
      sourceCorrelationId,
      sourceSessionId,
      sourceTaskId,
      status: "signal_only",
      toolSequence,
      triggerReason,
      workflowIdentity: normalizeWorkflowIdentity(workflowSummary),
      workflowSummary
    }
  };
}

function createSkillCandidate(input: {
  candidateId: string;
  confidence: SkillCandidateConfidence;
  createdAt: string;
  learningReviewArtifactPath: string;
  requiredTools: string[];
  signals: readonly NormalizedSkillCandidateSignal[];
  workflowIdentity: string;
}): SkillCandidate {
  const sourceEventIds = uniqueStrings(
    input.signals.flatMap((signal) => signal.evidenceEventIds)
  );
  const sourceSkillSignalIds = uniqueStrings(
    input.signals.map((signal) => signal.id)
  );
  const workflowSummary = createRedactedPreview(
    input.signals[0].workflowSummary,
    SAFE_TEXT_MAX_LENGTH
  );
  const triggerReason = createRedactedPreview(
    input.signals.map((signal) => signal.triggerReason).join(" "),
    SAFE_TEXT_MAX_LENGTH
  );
  const knownRisks = uniqueStrings(
    input.signals.flatMap((signal) => signal.knownRisks)
  ).slice(0, ARRAY_MAX_LENGTH);
  const requiredTools =
    input.requiredTools.length === 0 ? ["manual-review"] : input.requiredTools;

  return {
    candidateId: input.candidateId,
    confidence: input.confidence,
    counterexamples: [
      "Do not activate when evidence is a single weak signal.",
      "Do not activate if the workflow requires secrets, raw logs, or direct file patches."
    ],
    createdAt: input.createdAt,
    examples: [
      createRedactedPreview(`Use for: ${workflowSummary}`, SAFE_TEXT_MAX_LENGTH)
    ],
    id: input.candidateId,
    intendedActivationConditions: [
      createRedactedPreview(
        `Consider only after repeated or corrected signal evidence for: ${workflowSummary}`,
        SAFE_TEXT_MAX_LENGTH
      )
    ],
    knownRisks,
    learningReviewArtifactPath: input.learningReviewArtifactPath,
    lifecycleStatus: "proposed",
    name: createCandidateName(workflowSummary),
    requiredTools,
    schemaVersion: SKILL_CANDIDATE_SCHEMA_VERSION,
    sourceCorrelationIds: uniqueStrings(
      input.signals.map((signal) => signal.sourceCorrelationId)
    ),
    sourceEventIds,
    sourceSessionIds: uniqueStrings(
      input.signals.map((signal) => signal.sourceSessionId)
    ),
    sourceSkillSignalIds,
    sourceTaskIds: uniqueStrings(
      input.signals.map((signal) => signal.sourceTaskId)
    ),
    summary: createRedactedPreview(
      `Skill candidate proposed from ${sourceSkillSignalIds.length} signal(s) and ${sourceEventIds.length} supporting event(s).`,
      SAFE_TEXT_MAX_LENGTH
    ),
    supportingEvidence: input.signals.map((signal) => ({
      evidenceEventIds: signal.evidenceEventIds,
      learningReviewArtifactPath: input.learningReviewArtifactPath,
      outcome: signal.outcome,
      sourceCorrelationId: signal.sourceCorrelationId,
      sourceSessionId: signal.sourceSessionId,
      sourceSkillSignalId: signal.id,
      sourceTaskId: signal.sourceTaskId
    })),
    triggerReason,
    updatedAt: input.createdAt,
    workflowSteps: uniqueStrings(
      input.signals.flatMap((signal) =>
        signal.toolSequence.map((tool) =>
          createRedactedPreview(`Run or apply ${tool}.`, SAFE_TEXT_MAX_LENGTH)
        )
      )
    ).slice(0, ARRAY_MAX_LENGTH),
    workflowSummary
  };
}

function createSkippedCandidateSummary(
  reason: SkillCandidateSkippedReason,
  signals: readonly (
    | SkillCandidateSourceSignal
    | NormalizedSkillCandidateSignal
  )[]
): SkillCandidateSkippedGeneration {
  const consideredSignalIds = uniqueStrings(
    signals
      .map((signal) => signal.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const sourceEventIds = uniqueStrings(
    signals.flatMap((signal) => [...signal.evidenceEventIds])
  ).filter((eventId) => EVENT_ID_PATTERN.test(eventId));
  const sourceSessionIds = uniqueStrings(
    signals
      .map((signal) => signal.sourceSessionId)
      .filter((id): id is string => typeof id === "string")
  ).filter((id) => SESSION_ID_PATTERN.test(id));
  const sourceTaskIds = uniqueStrings(
    signals
      .map((signal) => signal.sourceTaskId)
      .filter((id): id is string => typeof id === "string")
  ).filter((id) => TASK_ID_PATTERN.test(id));

  return {
    consideredSignalIds,
    reason,
    sourceEventIds,
    sourceSessionIds,
    sourceTaskIds,
    status: "skipped",
    summary: createRedactedPreview(
      `Skill candidate skipped: ${reason.replaceAll("_", " ")}.`,
      SAFE_TEXT_MAX_LENGTH
    )
  };
}

function createCandidateId(identity: string): string {
  return `skillcand_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 16)}`;
}

function createCandidateName(workflowSummary: string): string {
  const label = workflowSummary
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");

  return createRedactedPreview(
    label || "Proposed Skill Candidate",
    SAFE_NAME_MAX_LENGTH
  );
}

function normalizeWorkflowIdentity(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length === 0 ? "workflow" : normalized.slice(0, 96);
}

function extractRequiredTool(toolSequenceItem: string): string {
  const firstToken = toolSequenceItem.trim().split(/\s+/)[0] ?? "manual-review";
  const normalized = firstToken
    .replace(/[^A-Za-z0-9_.:-]+/g, "")
    .replace(/:+$/g, "");

  if (normalized.startsWith("skill:")) {
    return "skill";
  }

  if (normalized.startsWith("event:")) {
    return "event";
  }

  if (normalized.startsWith("recovery:")) {
    return "recovery";
  }

  return normalized.length === 0 ? "manual-review" : normalized;
}

function isValidSupportingEvidence(
  evidence: SkillCandidateSupportingEvidence
): boolean {
  return (
    isPlainRecord(evidence) &&
    isSafeTextArray(evidence.evidenceEventIds, { allowEmpty: false }) &&
    evidence.evidenceEventIds.every((eventId) =>
      EVENT_ID_PATTERN.test(eventId)
    ) &&
    isSafeProjectRelativePath(evidence.learningReviewArtifactPath) &&
    SKILL_CANDIDATE_SOURCE_OUTCOMES.includes(evidence.outcome) &&
    CORRELATION_ID_PATTERN.test(evidence.sourceCorrelationId) &&
    SESSION_ID_PATTERN.test(evidence.sourceSessionId) &&
    SKILL_SIGNAL_ID_PATTERN.test(evidence.sourceSkillSignalId) &&
    TASK_ID_PATTERN.test(evidence.sourceTaskId)
  );
}

function isSafeCandidateText(
  value: unknown,
  maxLength = SAFE_TEXT_MAX_LENGTH
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !containsSecretLikeValue(value) &&
    !RAW_FILESYSTEM_PATH_PATTERN.test(value)
  );
}

function isSafeTextArray(
  value: unknown,
  options: { allowEmpty: boolean }
): value is string[] {
  return (
    Array.isArray(value) &&
    (options.allowEmpty || value.length > 0) &&
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

function containsUnsafeCandidateValue(
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

    return value.some((item) => containsUnsafeCandidateValue(item, seen));
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  return Object.values(value).some((nested) =>
    containsUnsafeCandidateValue(nested, seen)
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

function invalidCandidate(message: string): Result<never, SpriteError> {
  return err(new SpriteError("SKILL_CANDIDATE_ARTIFACT_INVALID", message));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
