import {
  createEffectiveSafetyRules,
  type SpriteSafetyRule,
  type SpriteSafetyRuleTarget
} from "@sprite/config";
import { randomUUID } from "node:crypto";
import {
  SECRET_REDACTION_MARKER,
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  redactSecretLikeValues,
  type Result
} from "@sprite/shared";

export const MEMORY_TYPES = [
  "episodic",
  "procedural",
  "self_model",
  "semantic",
  "working"
] as const;
export const MEMORY_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
export const MEMORY_SENSITIVITY_STATUSES = [
  "non_sensitive",
  "redacted"
] as const;
export const MEMORY_CANDIDATE_LIFECYCLE_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "edited",
  "auto_saved"
] as const;
export const MEMORY_CANDIDATE_RECOMMENDED_ACTIONS = [
  "accept",
  "review",
  "reject"
] as const;
export const MEMORY_CANDIDATE_REVIEW_ACTIONS = [
  "accept",
  "reject",
  "edit"
] as const;
export const DURABLE_MEMORY_TYPES = ["episodic", "semantic"] as const;
export const MEMORY_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const MEMORY_ENTRY_SCHEMA_VERSION = 1 as const;
const DEFAULT_PREVIEW_LIMIT = 160;
const MAX_MEMORY_CANDIDATE_CONTENT_LENGTH = 2_000;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type DurableMemoryType = (typeof DURABLE_MEMORY_TYPES)[number];
export type MemoryConfidence = (typeof MEMORY_CONFIDENCE_VALUES)[number];
export type MemorySensitivityStatus =
  (typeof MEMORY_SENSITIVITY_STATUSES)[number];
export type MemoryCandidateLifecycleStatus =
  (typeof MEMORY_CANDIDATE_LIFECYCLE_STATUSES)[number];
export type MemoryCandidateRecommendedAction =
  (typeof MEMORY_CANDIDATE_RECOMMENDED_ACTIONS)[number];
export type MemoryCandidateReviewAction =
  (typeof MEMORY_CANDIDATE_REVIEW_ACTIONS)[number];
export type SafetyEvaluationAction = "allow" | "block" | "redact";

export interface SafetySensitiveContentRequest {
  content: string;
  path?: string;
  previewLimit?: number;
  rules?: readonly SpriteSafetyRule[];
  target: SpriteSafetyRuleTarget;
}

export interface SafetyEvaluationDecision {
  action: SafetyEvaluationAction;
  matchedRuleIds: string[];
  reason: string;
  redactedPreview: string;
  target: SpriteSafetyRuleTarget;
}

export interface MemoryCandidateRequest {
  candidateId?: string;
  confidence: MemoryConfidence;
  content: string;
  createdAt?: string;
  path?: string;
  provenance: string;
  sourceEventIds?: readonly string[];
  sourceTaskId?: string;
  target?: SpriteSafetyRuleTarget;
  type: MemoryType;
}

export interface MemoryCandidate {
  acceptedEntryId?: string;
  contentPreview: string;
  confidence: MemoryConfidence;
  content: string;
  createdAt: string;
  id: string;
  lifecycleStatus: MemoryCandidateLifecycleStatus;
  originalCandidateId?: string;
  provenance: string;
  recommendedAction: MemoryCandidateRecommendedAction;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
  safetyDecision: SafetyEvaluationDecision;
  schemaVersion: typeof MEMORY_CANDIDATE_SCHEMA_VERSION;
  sensitivityStatus: MemorySensitivityStatus;
  sourceEventIds: readonly string[];
  sourceTaskId?: string;
  type: MemoryType;
  updatedAt: string;
}

export interface MemoryEntry {
  autoSaved: boolean;
  candidateId: string;
  confidence: MemoryConfidence;
  content: string;
  contentPreview: string;
  createdAt: string;
  id: string;
  provenance: string;
  schemaVersion: typeof MEMORY_ENTRY_SCHEMA_VERSION;
  sensitivityStatus: "non_sensitive";
  sourceEventIds: readonly string[];
  sourceTaskId?: string;
  type: DurableMemoryType;
  updatedAt: string;
}

export interface MemoryCandidateEvaluation {
  candidate: MemoryCandidate | null;
  decision: SafetyEvaluationDecision;
}

export interface MemoryAutoSavePolicy {
  enabled?: boolean;
  allowedTypes?: readonly DurableMemoryType[];
}

export interface MemorySafetyOptions {
  rules?: readonly SpriteSafetyRule[];
}

export interface CreateMemoryEntryOptions {
  autoSaved?: boolean;
  createdAt?: string;
  entryId?: string;
  requireHighConfidence?: boolean;
}

export interface MemoryCandidateReviewRequest {
  acceptedEntryId?: string;
  action: MemoryCandidateReviewAction;
  editedContent?: string;
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface MemoryCandidateReviewResult {
  action: MemoryCandidateReviewAction;
  candidate: MemoryCandidate;
}

export interface MemoryCandidateReviewView {
  candidateId: string;
  confidence: MemoryConfidence;
  contentSummary: string;
  createdAt: string;
  lifecycleStatus: MemoryCandidateLifecycleStatus;
  memoryType: MemoryType;
  provenance: string;
  recommendedAction: MemoryCandidateRecommendedAction;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
  sensitivityStatus: MemorySensitivityStatus;
  sourceEventIds: string[];
  sourceTaskId?: string;
  updatedAt: string;
}

export interface MemoryCandidateEditOptions extends MemorySafetyOptions {
  editedAt?: string;
}

interface SafetyEvaluationOutcome {
  decision: SafetyEvaluationDecision;
  redactedContent: string;
}

export function evaluateSafetySensitiveContent(
  request: SafetySensitiveContentRequest
): Result<SafetyEvaluationDecision, SpriteError> {
  const outcome = evaluateSafetySensitiveContentOutcome(request);

  if (!outcome.ok) {
    return outcome;
  }

  return { ok: true, value: outcome.value.decision };
}

function evaluateSafetySensitiveContentOutcome(
  request: SafetySensitiveContentRequest
): Result<SafetyEvaluationOutcome, SpriteError> {
  const requestValidation = validateSafetyRequest(request);

  if (!requestValidation.ok) {
    return requestValidation;
  }

  const rules = createEffectiveSafetyRules(request.rules ?? []);
  const matchedRules = rules.filter((rule) =>
    ruleMatchesRequest(rule, request)
  );
  const blockingRules = matchedRules.filter((rule) => rule.action === "block");
  const redactingRules = matchedRules.filter(
    (rule) => rule.action === "redact"
  );

  if (blockingRules.length > 0) {
    return {
      ok: true,
      value: {
        decision: {
          action: "block",
          matchedRuleIds: blockingRules.map((rule) => rule.id),
          reason: summarizeMatchedRules(blockingRules),
          redactedPreview: createSafePreview(
            request.content,
            request.previewLimit
          ),
          target: request.target
        },
        redactedContent: SECRET_REDACTION_MARKER
      }
    };
  }

  if (redactingRules.length > 0) {
    const redactedContent = redactContentWithRules(
      request.content,
      redactingRules,
      request.path
    );

    return {
      ok: true,
      value: {
        decision: {
          action: "redact",
          matchedRuleIds: redactingRules.map((rule) => rule.id),
          reason: summarizeMatchedRules(redactingRules),
          redactedPreview: createSafePreview(
            redactedContent,
            request.previewLimit
          ),
          target: request.target
        },
        redactedContent
      }
    };
  }

  return {
    ok: true,
    value: {
      decision: {
        action: "allow",
        matchedRuleIds: [],
        reason: "No safety rule matched.",
        redactedPreview: createSafePreview(
          request.content,
          request.previewLimit
        ),
        target: request.target
      },
      redactedContent: request.content
    }
  };
}

export function createMemoryCandidate(
  request: MemoryCandidateRequest,
  options: MemorySafetyOptions = {}
): Result<MemoryCandidateEvaluation, SpriteError> {
  const requestValidation = validateMemoryCandidateRequest(request);

  if (!requestValidation.ok) {
    return requestValidation;
  }

  const target = request.target ?? "memory_candidate";
  const safetyEvaluation = evaluateSafetySensitiveContentOutcome({
    content: request.content,
    ...(request.path === undefined ? {} : { path: request.path }),
    rules: options.rules,
    target
  });

  if (!safetyEvaluation.ok) {
    return safetyEvaluation;
  }

  if (safetyEvaluation.value.decision.action === "block") {
    return {
      ok: true,
      value: {
        candidate: null,
        decision: safetyEvaluation.value.decision
      }
    };
  }

  const boundaryDecision = evaluateMemoryCandidateBoundary(
    safetyEvaluation.value.redactedContent,
    target
  );

  if (boundaryDecision !== null) {
    return {
      ok: true,
      value: {
        candidate: null,
        decision: boundaryDecision
      }
    };
  }

  const candidateContent =
    safetyEvaluation.value.decision.action === "redact"
      ? safetyEvaluation.value.redactedContent
      : request.content;
  const createdAt = request.createdAt ?? new Date().toISOString();
  const candidate: MemoryCandidate = {
    contentPreview: createSafePreview(candidateContent),
    confidence: request.confidence,
    content: candidateContent,
    createdAt,
    id: request.candidateId ?? createMemoryCandidateId(),
    lifecycleStatus: "pending_review",
    provenance: request.provenance,
    recommendedAction: "review",
    safetyDecision: safetyEvaluation.value.decision,
    schemaVersion: MEMORY_CANDIDATE_SCHEMA_VERSION,
    sensitivityStatus:
      safetyEvaluation.value.decision.action === "redact"
        ? "redacted"
        : "non_sensitive",
    sourceEventIds: [...(request.sourceEventIds ?? [])],
    ...(request.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: request.sourceTaskId }),
    type: request.type,
    updatedAt: createdAt
  };

  return {
    ok: true,
    value: {
      candidate: {
        ...candidate,
        recommendedAction: getMemoryCandidateRecommendedAction(candidate)
      },
      decision: safetyEvaluation.value.decision
    }
  };
}

export function shouldAutoSaveMemoryCandidate(
  candidate: MemoryCandidate,
  policy: MemoryAutoSavePolicy = {}
): boolean {
  const enabled = policy.enabled ?? true;
  const allowedTypes = policy.allowedTypes ?? DURABLE_MEMORY_TYPES;

  return (
    enabled &&
    candidate.confidence === "high" &&
    candidate.sensitivityStatus === "non_sensitive" &&
    isDurableMemoryType(candidate.type) &&
    allowedTypes.includes(candidate.type)
  );
}

export function getMemoryCandidateLifecycleStatus(
  candidate: Pick<MemoryCandidate, "lifecycleStatus">
): MemoryCandidateLifecycleStatus {
  return MEMORY_CANDIDATE_LIFECYCLE_STATUSES.includes(candidate.lifecycleStatus)
    ? candidate.lifecycleStatus
    : "pending_review";
}

export function getMemoryCandidateRecommendedAction(
  candidate: Pick<
    MemoryCandidate,
    | "confidence"
    | "lifecycleStatus"
    | "safetyDecision"
    | "sensitivityStatus"
    | "type"
  >
): MemoryCandidateRecommendedAction {
  const lifecycleStatus = getMemoryCandidateLifecycleStatus(candidate);

  if (lifecycleStatus === "accepted" || lifecycleStatus === "auto_saved") {
    return "accept";
  }

  if (lifecycleStatus === "rejected") {
    return "reject";
  }

  if (
    candidate.safetyDecision.action !== "allow" ||
    candidate.sensitivityStatus !== "non_sensitive" ||
    !isDurableMemoryType(candidate.type)
  ) {
    return "reject";
  }

  return candidate.confidence === "high" ? "accept" : "review";
}

export function summarizeMemoryCandidateForReview(
  candidate: MemoryCandidate
): MemoryCandidateReviewView {
  const lifecycleStatus = getMemoryCandidateLifecycleStatus(candidate);

  return {
    candidateId: candidate.id,
    confidence: candidate.confidence,
    contentSummary: createSafePreview(candidate.contentPreview),
    createdAt: candidate.createdAt,
    lifecycleStatus,
    memoryType: candidate.type,
    provenance: createSafePreview(candidate.provenance),
    recommendedAction: getMemoryCandidateRecommendedAction({
      ...candidate,
      lifecycleStatus
    }),
    ...(candidate.reviewedAt === undefined
      ? {}
      : { reviewedAt: candidate.reviewedAt }),
    ...(candidate.reviewedBy === undefined
      ? {}
      : { reviewedBy: createSafePreview(candidate.reviewedBy) }),
    ...(candidate.reviewReason === undefined
      ? {}
      : { reviewReason: createSafePreview(candidate.reviewReason) }),
    sensitivityStatus: candidate.sensitivityStatus,
    sourceEventIds: [...candidate.sourceEventIds],
    ...(candidate.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: candidate.sourceTaskId }),
    updatedAt: candidate.updatedAt
  };
}

export function validateMemoryCandidateEdit(
  candidate: MemoryCandidate,
  editedContent: string,
  options: MemoryCandidateEditOptions = {}
): Result<MemoryCandidateEvaluation, SpriteError> {
  const evaluation = createMemoryCandidate(
    {
      candidateId: candidate.id,
      confidence: candidate.confidence,
      content: editedContent,
      createdAt: candidate.createdAt,
      provenance: candidate.provenance,
      sourceEventIds: candidate.sourceEventIds,
      ...(candidate.sourceTaskId === undefined
        ? {}
        : { sourceTaskId: candidate.sourceTaskId }),
      type: candidate.type
    },
    { rules: options.rules }
  );

  if (!evaluation.ok || evaluation.value.candidate === null) {
    return evaluation;
  }

  const editedAt = options.editedAt ?? new Date().toISOString();
  const editedCandidate: MemoryCandidate = {
    ...evaluation.value.candidate,
    originalCandidateId: candidate.originalCandidateId ?? candidate.id,
    updatedAt: editedAt
  };

  return {
    ok: true,
    value: {
      candidate: {
        ...editedCandidate,
        recommendedAction: getMemoryCandidateRecommendedAction(editedCandidate)
      },
      decision: evaluation.value.decision
    }
  };
}

export function reviewMemoryCandidate(
  candidate: MemoryCandidate,
  request: MemoryCandidateReviewRequest,
  options: MemorySafetyOptions = {}
): Result<MemoryCandidateReviewResult, SpriteError> {
  const validation = validateMemoryCandidateReviewRequest(request);

  if (!validation.ok) {
    return validation;
  }

  const reviewedAt = request.reviewedAt ?? new Date().toISOString();
  const reviewReason = sanitizeOptionalReviewText(request.reason);

  if (!reviewReason.ok) {
    return reviewReason;
  }

  if (request.action === "reject") {
    const rejectedCandidate = applyReviewMetadata(candidate, {
      lifecycleStatus: "rejected",
      recommendedAction: "reject",
      reviewReason: reviewReason.value,
      reviewedAt,
      reviewedBy: request.reviewedBy
    });

    return {
      ok: true,
      value: {
        action: request.action,
        candidate: rejectedCandidate
      }
    };
  }

  const targetCandidateResult: Result<MemoryCandidateEvaluation, SpriteError> =
    request.action === "edit"
      ? validateMemoryCandidateEdit(candidate, request.editedContent ?? "", {
          editedAt: reviewedAt,
          rules: options.rules
        })
      : {
          ok: true,
          value: { candidate, decision: candidate.safetyDecision }
        };

  if (!targetCandidateResult.ok) {
    return err(targetCandidateResult.error);
  }

  const targetCandidate = targetCandidateResult.value.candidate;

  if (targetCandidate === null) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_EDIT_BLOCKED",
        "Edited memory candidate failed safety validation."
      )
    );
  }

  if (!canBecomeDurableMemoryEntry(targetCandidate)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INELIGIBLE",
        "Only safe non-sensitive episodic or semantic candidates can be accepted."
      )
    );
  }

  const reviewedCandidate = applyReviewMetadata(targetCandidate, {
    acceptedEntryId: request.acceptedEntryId,
    lifecycleStatus: request.action === "edit" ? "edited" : "accepted",
    recommendedAction: "accept",
    reviewReason: reviewReason.value,
    reviewedAt,
    reviewedBy: request.reviewedBy
  });

  return {
    ok: true,
    value: {
      action: request.action,
      candidate: reviewedCandidate
    }
  };
}

export function createMemoryEntryFromCandidate(
  candidate: MemoryCandidate,
  options: CreateMemoryEntryOptions = {}
): Result<MemoryEntry, SpriteError> {
  if (!canCreateDurableMemoryEntry(candidate, options)) {
    return err(
      new SpriteError(
        "MEMORY_ENTRY_INELIGIBLE_CANDIDATE",
        "Only safe non-sensitive episodic or semantic candidates can be converted to durable memory entries."
      )
    );
  }

  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    ok: true,
    value: {
      autoSaved: options.autoSaved ?? true,
      candidateId: candidate.id,
      confidence: candidate.confidence,
      content: candidate.content,
      contentPreview: candidate.contentPreview,
      createdAt,
      id: options.entryId ?? createMemoryEntryId(),
      provenance: candidate.provenance,
      schemaVersion: MEMORY_ENTRY_SCHEMA_VERSION,
      sensitivityStatus: "non_sensitive",
      sourceEventIds: [...candidate.sourceEventIds],
      ...(candidate.sourceTaskId === undefined
        ? {}
        : { sourceTaskId: candidate.sourceTaskId }),
      type: candidate.type as DurableMemoryType,
      updatedAt: createdAt
    }
  };
}

export function createMemoryCandidateId(): string {
  return `memcand_${randomUUID()}`;
}

export function createMemoryEntryId(): string {
  return `mem_${randomUUID()}`;
}

function canCreateDurableMemoryEntry(
  candidate: MemoryCandidate,
  options: CreateMemoryEntryOptions
): boolean {
  const requireHighConfidence = options.requireHighConfidence ?? true;

  return (
    canBecomeDurableMemoryEntry(candidate) &&
    (!requireHighConfidence || candidate.confidence === "high")
  );
}

function canBecomeDurableMemoryEntry(candidate: MemoryCandidate): boolean {
  return (
    candidate.safetyDecision.action === "allow" &&
    candidate.sensitivityStatus === "non_sensitive" &&
    isDurableMemoryType(candidate.type)
  );
}

function validateMemoryCandidateReviewRequest(
  request: MemoryCandidateReviewRequest
): Result<void, SpriteError> {
  if (!MEMORY_CANDIDATE_REVIEW_ACTIONS.includes(request.action)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INVALID_ACTION",
        "Memory candidate review action is unsupported."
      )
    );
  }

  if (
    request.reviewedAt !== undefined &&
    Number.isNaN(Date.parse(request.reviewedAt))
  ) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INVALID_TIMESTAMP",
        "Memory candidate review timestamp must be valid when provided."
      )
    );
  }

  if (request.action === "edit" && !isNonEmptyString(request.editedContent)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INVALID_EDIT",
        "Edited memory candidate content must be a non-empty string."
      )
    );
  }

  if (
    request.acceptedEntryId !== undefined &&
    !/^mem_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(request.acceptedEntryId)
  ) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INVALID_ENTRY_ID",
        "Accepted entry ID must use the mem_ prefix."
      )
    );
  }

  return { ok: true, value: undefined };
}

function sanitizeOptionalReviewText(
  value: string | undefined
): Result<string | undefined, SpriteError> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!isNonEmptyString(value)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_INVALID_REASON",
        "Memory candidate review reason must be non-empty when provided."
      )
    );
  }

  const preview = createSafePreview(value);

  if (containsSecretLikeValue(preview) || preview === SECRET_REDACTION_MARKER) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_REVIEW_UNSAFE_REASON",
        "Memory candidate review reason must not contain secret-looking values."
      )
    );
  }

  return { ok: true, value: preview };
}

function applyReviewMetadata(
  candidate: MemoryCandidate,
  input: {
    acceptedEntryId?: string;
    lifecycleStatus: MemoryCandidateLifecycleStatus;
    recommendedAction: MemoryCandidateRecommendedAction;
    reviewReason?: string;
    reviewedAt: string;
    reviewedBy?: string;
  }
): MemoryCandidate {
  return {
    ...candidate,
    ...(input.acceptedEntryId === undefined
      ? {}
      : { acceptedEntryId: input.acceptedEntryId }),
    lifecycleStatus: input.lifecycleStatus,
    recommendedAction: input.recommendedAction,
    ...(input.reviewReason === undefined
      ? {}
      : { reviewReason: input.reviewReason }),
    reviewedAt: input.reviewedAt,
    ...(input.reviewedBy === undefined ? {} : { reviewedBy: input.reviewedBy }),
    updatedAt: input.reviewedAt
  };
}

function validateSafetyRequest(
  request: SafetySensitiveContentRequest
): Result<void, SpriteError> {
  if (!isNonEmptyString(request.content)) {
    return err(
      new SpriteError(
        "MEMORY_SAFETY_INVALID_CONTENT",
        "Safety evaluation content must be a non-empty string."
      )
    );
  }

  if (!isNonEmptyString(request.target)) {
    return err(
      new SpriteError(
        "MEMORY_SAFETY_INVALID_TARGET",
        "Safety evaluation target must be provided."
      )
    );
  }

  if (
    request.previewLimit !== undefined &&
    (!Number.isInteger(request.previewLimit) || request.previewLimit <= 0)
  ) {
    return err(
      new SpriteError(
        "MEMORY_SAFETY_INVALID_PREVIEW_LIMIT",
        "Safety evaluation previewLimit must be a positive integer when provided."
      )
    );
  }

  return { ok: true, value: undefined };
}

function validateMemoryCandidateRequest(
  request: MemoryCandidateRequest
): Result<void, SpriteError> {
  if (!MEMORY_TYPES.includes(request.type)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_TYPE",
        "Memory candidate type is unsupported."
      )
    );
  }

  if (
    request.candidateId !== undefined &&
    !/^memcand_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(request.candidateId)
  ) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_ID",
        "Memory candidate ID must use the memcand_ prefix and safe identifier characters."
      )
    );
  }

  if (!MEMORY_CONFIDENCE_VALUES.includes(request.confidence)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_CONFIDENCE",
        "Memory candidate confidence is unsupported."
      )
    );
  }

  if (!isNonEmptyString(request.provenance)) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_PROVENANCE",
        "Memory candidate provenance must be a non-empty string."
      )
    );
  }

  if (request.sourceEventIds !== undefined) {
    for (const eventId of request.sourceEventIds) {
      if (!isNonEmptyString(eventId)) {
        return err(
          new SpriteError(
            "MEMORY_CANDIDATE_INVALID_SOURCE_EVENT",
            "Memory candidate sourceEventIds must contain non-empty strings."
          )
        );
      }
    }
  }

  if (
    request.createdAt !== undefined &&
    Number.isNaN(Date.parse(request.createdAt))
  ) {
    return err(
      new SpriteError(
        "MEMORY_CANDIDATE_INVALID_TIMESTAMP",
        "Memory candidate createdAt must be a valid timestamp when provided."
      )
    );
  }

  return validateSafetyRequest({
    content: request.content,
    ...(request.path === undefined ? {} : { path: request.path }),
    target: request.target ?? "memory_candidate"
  });
}

function evaluateMemoryCandidateBoundary(
  content: string,
  target: SpriteSafetyRuleTarget
): SafetyEvaluationDecision | null {
  if (content.length > MAX_MEMORY_CANDIDATE_CONTENT_LENGTH) {
    return createBoundaryBlockDecision({
      content,
      matchedRuleId: "memory.candidate.large_content",
      reason:
        "Memory candidates must be bounded and shorter than the configured content limit.",
      target
    });
  }

  if (containsFencedCodeBlock(content) || looksLikeLargeCodeChunk(content)) {
    return createBoundaryBlockDecision({
      content,
      matchedRuleId: "memory.candidate.code_chunk",
      reason: "Memory candidates must not store raw or large code chunks.",
      target
    });
  }

  if (looksLikeRawLog(content)) {
    return createBoundaryBlockDecision({
      content,
      matchedRuleId: "memory.candidate.raw_log",
      reason: "Memory candidates must not store raw log or command output.",
      target
    });
  }

  return null;
}

function createBoundaryBlockDecision(input: {
  content: string;
  matchedRuleId: string;
  reason: string;
  target: SpriteSafetyRuleTarget;
}): SafetyEvaluationDecision {
  return {
    action: "block",
    matchedRuleIds: [input.matchedRuleId],
    reason: input.reason,
    redactedPreview: SECRET_REDACTION_MARKER,
    target: input.target
  };
}

function containsFencedCodeBlock(content: string): boolean {
  return /```[\s\S]*?```/.test(content);
}

function looksLikeLargeCodeChunk(content: string): boolean {
  const codeLikeLines = content
    .split(/\r?\n/)
    .filter(
      (line) =>
        /^\s*(?:import|export|const|let|var|function|class|interface|type|if|for|while|return)\b/.test(
          line
        ) || /[{};]/.test(line)
    );

  return codeLikeLines.length >= 8;
}

function looksLikeRawLog(content: string): boolean {
  const logLikeLines = content
    .split(/\r?\n/)
    .filter((line) =>
      /(?:\d{4}-\d{2}-\d{2}T[^\s]+|\b(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b|\s+at\s+\S+)/.test(
        line
      )
    );

  return logLikeLines.length >= 5;
}

function isDurableMemoryType(type: MemoryType): type is DurableMemoryType {
  return DURABLE_MEMORY_TYPES.includes(type as DurableMemoryType);
}

function ruleMatchesRequest(
  rule: SpriteSafetyRule,
  request: SafetySensitiveContentRequest
): boolean {
  if (!rule.targets.includes(request.target)) {
    return false;
  }

  return (
    matchesPattern(rule.pattern, request.content) ||
    (request.path !== undefined &&
      matchesPattern(rule.pathPattern, request.path))
  );
}

function matchesPattern(pattern: string | undefined, value: string): boolean {
  if (pattern === undefined) {
    return false;
  }

  return new RegExp(pattern, "i").test(value);
}

function redactContentWithRules(
  content: string,
  rules: readonly SpriteSafetyRule[],
  path: string | undefined
): string {
  let redacted = redactSecretLikeValues(content);
  let pathOnlyRedaction = false;

  for (const rule of rules) {
    if (rule.pattern !== undefined) {
      redacted = redacted.replace(
        new RegExp(rule.pattern, "gi"),
        SECRET_REDACTION_MARKER
      );
    }

    if (
      rule.pattern === undefined &&
      path !== undefined &&
      matchesPattern(rule.pathPattern, path)
    ) {
      pathOnlyRedaction = true;
    }
  }

  return pathOnlyRedaction && redacted === content
    ? SECRET_REDACTION_MARKER
    : redacted;
}

function createSafePreview(content: string, maxLength?: number): string {
  const preview = createRedactedPreview(
    content,
    maxLength ?? DEFAULT_PREVIEW_LIMIT
  );

  return containsSecretLikeValue(preview)
    ? SECRET_REDACTION_MARKER
    : preview || SECRET_REDACTION_MARKER;
}

function summarizeMatchedRules(rules: readonly SpriteSafetyRule[]): string {
  const reasons = Array.from(new Set(rules.map((rule) => rule.reason)));
  return reasons.join(" ");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
