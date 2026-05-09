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
export const LEARNING_REVIEW_SCHEMA_VERSION = 1 as const;
export const LEARNING_REVIEW_MODES = ["compact", "full"] as const;
export const PROCEDURAL_LEARNING_OUTPUT_SCHEMA_VERSION = 1 as const;
export const PROCEDURAL_LEARNING_OUTPUT_STATUSES = ["candidate"] as const;
export const PROCEDURAL_LEARNING_PROMOTION_STATUSES = [
  "not_promoted"
] as const;
export const MEMORY_INFLUENCE_SCHEMA_VERSION = 1 as const;
export const RETROSPECTIVE_REVIEW_SCHEMA_VERSION = 1 as const;
export const MEMORY_INFLUENCE_STATUSES = [
  "used",
  "ignored",
  "contradicted"
] as const;
export const MEMORY_INFLUENCE_SOURCE_TYPES = [
  "memory_entry",
  "learning_review_lesson",
  "procedural_learning_output"
] as const;
export const RETROSPECTIVE_TERMINAL_STATUSES = [
  "cancelled",
  "completed",
  "failed",
  "max-iterations"
] as const;
export const RETROSPECTIVE_CONTEXT_FIELDS = [
  "taskGoal",
  "eventHistory",
  "terminalState",
  "filesTouched",
  "commandsRun",
  "failureReasonOrOutcome",
  "finalStatus"
] as const;
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
export type LearningReviewMode = (typeof LEARNING_REVIEW_MODES)[number];
export type ProceduralLearningOutputStatus =
  (typeof PROCEDURAL_LEARNING_OUTPUT_STATUSES)[number];
export type ProceduralLearningPromotionStatus =
  (typeof PROCEDURAL_LEARNING_PROMOTION_STATUSES)[number];
export type MemoryInfluenceStatus =
  (typeof MEMORY_INFLUENCE_STATUSES)[number];
export type MemoryInfluenceSourceType =
  (typeof MEMORY_INFLUENCE_SOURCE_TYPES)[number];
export type RetrospectiveTerminalStatus =
  (typeof RETROSPECTIVE_TERMINAL_STATUSES)[number];
export type RetrospectiveContextField =
  (typeof RETROSPECTIVE_CONTEXT_FIELDS)[number];

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

export interface LearningReviewSectionItem {
  evidenceEventIds: string[];
  summary: string;
}

export interface LearningReviewValidationResult {
  command?: string;
  eventId: string;
  name?: string;
  status: string;
}

export interface LearningReviewCommandEvidence {
  command: string;
  eventId: string;
  status: string;
}

export interface LearningReviewEvidence {
  commandsRun: LearningReviewCommandEvidence[];
  eventIds: string[];
  filesChanged: string[];
  filesProposedForChange: string[];
  filesRead: string[];
  taskId: string;
  userCorrections: LearningReviewSectionItem[];
  validationResults: LearningReviewValidationResult[];
}

export interface LearningReviewMemoryCandidateReference {
  candidateId: string;
  confidence?: MemoryConfidence;
  eventId: string;
  memoryType?: MemoryType;
  status?: string;
}

export interface LearningReviewSkillSignal {
  evidenceEventIds: string[];
  id: string;
  signal: string;
  triggerReason: string;
}

export interface ProceduralLearningOutput {
  createdAt: string;
  evidenceEventIds: string[];
  id: string;
  knownRisks: string[];
  memoryType: "procedural";
  promotionStatus: ProceduralLearningPromotionStatus;
  schemaVersion: typeof PROCEDURAL_LEARNING_OUTPUT_SCHEMA_VERSION;
  sourceCorrelationId: string;
  sourceSessionId: string;
  sourceSkillSignalId: string;
  sourceTaskId: string;
  status: ProceduralLearningOutputStatus;
  toolSequence: string[];
  triggerReason: string;
  workflowSummary: string;
}

export interface LearningReview {
  correlationId: string;
  createdAt: string;
  evidence: LearningReviewEvidence;
  facts: LearningReviewSectionItem[];
  lessons: LearningReviewSectionItem[];
  memoryCandidates: LearningReviewMemoryCandidateReference[];
  missedAssumptions: LearningReviewSectionItem[];
  mistakes: LearningReviewSectionItem[];
  mode: LearningReviewMode;
  proceduralOutputs: ProceduralLearningOutput[];
  schemaVersion: typeof LEARNING_REVIEW_SCHEMA_VERSION;
  sessionId: string;
  skillSignals: LearningReviewSkillSignal[];
  summary: string;
  taskId: string;
  terminalStatus: "completed";
  testGaps: LearningReviewSectionItem[];
}

export interface LearningReviewEventInput {
  eventId: string;
  message?: string;
  reason?: string;
  summary?: string;
  type: string;
}

export interface LearningReviewGenerationRequest {
  commandsRun?: readonly LearningReviewCommandEvidence[];
  correlationId: string;
  createdAt?: string;
  events: readonly LearningReviewEventInput[];
  filesChanged?: readonly string[];
  filesProposedForChange?: readonly string[];
  filesRead?: readonly string[];
  memoryCandidates?: readonly LearningReviewMemoryCandidateReference[];
  mode?: LearningReviewMode;
  proceduralOutputs?: readonly ProceduralLearningOutput[];
  sessionId: string;
  skillSignals?: readonly LearningReviewSkillSignal[];
  taskGoal: string;
  taskId: string;
  terminalStatus: "completed";
  validationResults?: readonly LearningReviewValidationResult[];
}

export interface LearningReviewEventSummary {
  evidenceEventIds: string[];
  factCount: number;
  lessonCount: number;
  memoryCandidateIds: string[];
  missedAssumptionCount: number;
  mistakeCount: number;
  mode: LearningReviewMode;
  proceduralOutputIds: string[];
  skillSignalIds: string[];
  summary: string;
  testGapCount: number;
}

export interface ProceduralLearningGenerationRequest {
  commandsRun?: readonly LearningReviewCommandEvidence[];
  correlationId: string;
  createdAt?: string;
  sessionId: string;
  skillSignals: readonly LearningReviewSkillSignal[];
  taskGoal: string;
  taskId: string;
  validationResults?: readonly LearningReviewValidationResult[];
}

export interface RetrospectiveReviewEventInput
  extends LearningReviewEventInput {
  status?: string;
}

export interface RetrospectiveMemoryInfluenceReference {
  eventId: string;
  sourceId: string;
  sourceType: MemoryInfluenceSourceType;
  status: MemoryInfluenceStatus;
  summary?: string;
}

export interface RetrospectiveEligibilityReport {
  availableFields: RetrospectiveContextField[];
  eligible: boolean;
  missingFields: RetrospectiveContextField[];
  sourceSessionId: string;
  sourceTaskId: string;
  terminalStatus: RetrospectiveTerminalStatus;
}

export interface RetrospectiveReviewMemoryCandidate {
  candidateId: string;
  confidence: MemoryConfidence;
  evidenceEventIds: string[];
  memoryType: DurableMemoryType;
  summary: string;
}

export interface RetrospectiveReviewEvidence {
  commandsRun: LearningReviewCommandEvidence[];
  eventIds: string[];
  filesTouched: string[];
  memoryInfluenceEventIds: string[];
  terminalEventId: string;
  validationResults: LearningReviewValidationResult[];
}

export interface RetrospectiveReview {
  commandsRun: LearningReviewCommandEvidence[];
  context: RetrospectiveEligibilityReport;
  correlationId: string;
  createdAt: string;
  evidence: RetrospectiveReviewEvidence;
  eventHistoryReference: {
    eventCount: number;
    eventIds: string[];
  };
  failureReason?: string;
  filesTouched: string[];
  finalStatus: RetrospectiveTerminalStatus;
  memoryCandidates: RetrospectiveReviewMemoryCandidate[];
  missedAssumptions: LearningReviewSectionItem[];
  nextTimeImprovements: LearningReviewSectionItem[];
  outcome?: string;
  schemaVersion: typeof RETROSPECTIVE_REVIEW_SCHEMA_VERSION;
  sessionId: string;
  skillSignals: LearningReviewSkillSignal[];
  summary: string;
  taskGoal: string;
  taskId: string;
  terminalStatus: RetrospectiveTerminalStatus;
}

export interface RetrospectiveGenerationRequest {
  commandsRun?: readonly LearningReviewCommandEvidence[];
  correlationId: string;
  createdAt?: string;
  events: readonly RetrospectiveReviewEventInput[];
  filesChanged?: readonly string[];
  filesProposedForChange?: readonly string[];
  filesRead?: readonly string[];
  finalStatus: RetrospectiveTerminalStatus;
  memoryInfluences?: readonly RetrospectiveMemoryInfluenceReference[];
  sessionId: string;
  taskGoal: string;
  taskId: string;
  terminalMessage?: string;
  terminalReason?: string;
  terminalStatus: RetrospectiveTerminalStatus;
  validationResults?: readonly LearningReviewValidationResult[];
}

export interface RetrospectiveReviewEventSummary {
  commandCount: number;
  evidenceEventIds: string[];
  fileCount: number;
  finalStatus: RetrospectiveTerminalStatus;
  memoryCandidateCount: number;
  missedAssumptionCount: number;
  nextTimeImprovementCount: number;
  skillSignalCount: number;
  status: "recorded";
  summary: string;
  terminalStatus: RetrospectiveTerminalStatus;
}

export interface MemoryInfluenceSourceInput {
  confidence?: MemoryConfidence;
  content: string;
  createdAt?: string;
  provenance?: string;
  sourceEventIds?: readonly string[];
  sourceId: string;
  sourceSessionId?: string;
  sourceTaskId?: string;
  sourceType: MemoryInfluenceSourceType;
  type?: MemoryType | "lesson";
}

export interface MemoryInfluenceCandidate {
  confidence?: MemoryConfidence;
  preview: string;
  provenance?: string;
  retrievalReason: string;
  score: number;
  sourceEventIds: string[];
  sourceId: string;
  sourceSessionId?: string;
  sourceTaskId?: string;
  sourceType: MemoryInfluenceSourceType;
  type?: MemoryType | "lesson";
}

export interface MemoryInfluenceSelectionRequest {
  limit?: number;
  sources: readonly MemoryInfluenceSourceInput[];
  taskGoal: string;
}

export interface MemoryInfluenceRecord {
  correlationId: string;
  createdAt: string;
  evidenceEventIds: string[];
  influenceSummary?: string;
  preview: string;
  reason?: string;
  schemaVersion: typeof MEMORY_INFLUENCE_SCHEMA_VERSION;
  sessionId: string;
  sourceEventIds: string[];
  sourceId: string;
  sourceSessionId?: string;
  sourceTaskId?: string;
  sourceType: MemoryInfluenceSourceType;
  status: MemoryInfluenceStatus;
  taskId: string;
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
  acceptedEntryId?: string;
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
    ...(candidate.acceptedEntryId === undefined
      ? {}
      : { acceptedEntryId: candidate.acceptedEntryId }),
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
  const reviewedBy = sanitizeOptionalReviewText(request.reviewedBy);

  if (!reviewedBy.ok) {
    return err(reviewedBy.error);
  }

  if (request.action === "reject") {
    const rejectedCandidate = applyReviewMetadata(candidate, {
      lifecycleStatus: "rejected",
      recommendedAction: "reject",
      reviewReason: reviewReason.value,
      reviewedAt,
      reviewedBy: reviewedBy.value
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
    reviewedBy: reviewedBy.value
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

export function generateLearningReview(
  request: LearningReviewGenerationRequest
): Result<LearningReview, SpriteError> {
  const validation = validateLearningReviewGenerationRequest(request);

  if (!validation.ok) {
    return err(validation.error);
  }

  const mode = request.mode ?? "compact";
  const createdAt = request.createdAt ?? new Date().toISOString();
  const events = request.events.map((event) => ({
    ...event,
    ...(event.message === undefined
      ? {}
      : { message: createSafePreview(event.message) }),
    ...(event.reason === undefined
      ? {}
      : { reason: createSafePreview(event.reason) }),
    ...(event.summary === undefined
      ? {}
      : { summary: createSafePreview(event.summary) })
  }));
  const evidenceEventIds = uniqueStrings(events.map((event) => event.eventId));
  const commandsRun = normalizeLearningCommands(request.commandsRun ?? []);
  const validationResults = normalizeLearningValidations(
    request.validationResults ?? []
  );
  const memoryCandidates = normalizeLearningMemoryCandidates(
    request.memoryCandidates ?? [],
    mode
  );
  const skillSignals = normalizeLearningSkillSignals(
    request.skillSignals ?? [],
    mode
  );
  const proceduralOutputs =
    request.proceduralOutputs === undefined
      ? generateProceduralLearningOutputs({
          commandsRun,
          correlationId: request.correlationId,
          createdAt,
          sessionId: request.sessionId,
          skillSignals,
          taskGoal: request.taskGoal,
          taskId: request.taskId,
          validationResults
        })
      : normalizeProceduralLearningOutputs(request.proceduralOutputs, mode);

  if (!proceduralOutputs.ok) {
    return err(proceduralOutputs.error);
  }

  const filesRead = normalizeLearningStrings(request.filesRead ?? [], mode);
  const filesChanged = normalizeLearningStrings(
    request.filesChanged ?? [],
    mode
  );
  const filesProposedForChange = normalizeLearningStrings(
    request.filesProposedForChange ?? [],
    mode
  );
  const completedEvent = events.find((event) => event.type === "task.completed");
  const validationEventIds = validationResults.map((result) => result.eventId);
  const facts = limitLearningItems(
    [
      createLearningItem(
        `Task completed: ${request.taskGoal}`,
        completedEvent === undefined ? evidenceEventIds : [completedEvent.eventId]
      ),
      ...(filesChanged.length === 0
        ? []
        : [
            createLearningItem(
              `Changed files were recorded: ${filesChanged.join(", ")}`,
              evidenceEventIds
            )
          ]),
      ...(validationResults.length === 0
        ? []
        : [
            createLearningItem(
              `Validation results were recorded: ${validationResults
                .map((result) => `${result.name ?? result.command ?? result.eventId}:${result.status}`)
                .join(", ")}`,
              validationEventIds
            )
          ]),
      ...(memoryCandidates.length === 0
        ? []
        : [
            createLearningItem(
              `Memory candidate references were produced: ${memoryCandidates
                .map((candidate) => candidate.candidateId)
                .join(", ")}`,
              memoryCandidates.map((candidate) => candidate.eventId)
            )
          ])
    ],
    mode
  );
  const mistakes = limitLearningItems(
    [
      ...events
        .filter(
          (event) =>
            event.type === "task.recovery.recorded" ||
            event.type === "tool.call.failed" ||
            event.type === "file.edit.failed"
        )
        .map((event) =>
          createLearningItem(
            event.summary ?? event.message ?? `${event.type} was recorded.`,
            [event.eventId]
          )
        ),
      ...validationResults
        .filter((result) => result.status === "failed")
        .map((result) =>
          createLearningItem(
            `Validation failed: ${result.name ?? result.command ?? result.eventId}`,
            [result.eventId]
          )
        )
    ],
    mode
  );
  const missedAssumptions = limitLearningItems(
    events
      .filter((event) => event.type === "task.steering.received")
      .map((event) =>
        createLearningItem(
          `User steering changed or clarified the task: ${event.summary ?? event.message ?? event.reason ?? event.type}`,
          [event.eventId]
        )
      ),
    mode
  );
  const testGaps = limitLearningItems(
    validationResults.length === 0
      ? [
          createLearningItem(
            "No validation result was recorded for this completed task.",
            evidenceEventIds
          )
        ]
      : validationResults
          .filter((result) => result.status !== "passed")
          .map((result) =>
            createLearningItem(
              `Validation did not pass cleanly: ${result.name ?? result.command ?? result.eventId} ended as ${result.status}.`,
              [result.eventId]
            )
          ),
    mode
  );
  const lessons = limitLearningItems(
    [
      ...(commandsRun.length === 0
        ? []
        : [
            createLearningItem(
              "Command and validation evidence should remain linked to review outputs.",
              commandsRun.map((command) => command.eventId)
            )
          ]),
      ...(memoryCandidates.length === 0
        ? []
        : [
            createLearningItem(
              "Memory-related learning stays candidate-first and reviewable.",
              memoryCandidates.map((candidate) => candidate.eventId)
            )
          ]),
      ...(skillSignals.length === 0
        ? []
        : [
            createLearningItem(
              "Repeated or validated workflow behavior was captured as a skill signal only.",
              skillSignals.flatMap((signal) => signal.evidenceEventIds)
            )
          ]),
      ...(proceduralOutputs.value.length === 0
        ? []
        : [
            createLearningItem(
              "Procedural learning remains candidate-first until skill promotion is approved.",
              proceduralOutputs.value.flatMap((output) => output.evidenceEventIds)
            )
          ])
    ],
    mode
  );
  const review: LearningReview = {
    correlationId: createSafePreview(request.correlationId),
    createdAt,
    evidence: {
      commandsRun,
      eventIds: evidenceEventIds,
      filesChanged,
      filesProposedForChange,
      filesRead,
      taskId: createSafePreview(request.taskId),
      userCorrections: missedAssumptions,
      validationResults
    },
    facts,
    lessons,
    memoryCandidates,
    missedAssumptions,
    mistakes,
    mode,
    proceduralOutputs: proceduralOutputs.value,
    schemaVersion: LEARNING_REVIEW_SCHEMA_VERSION,
    sessionId: createSafePreview(request.sessionId),
    skillSignals,
    summary: createSafePreview(
      `Learning review for completed task ${request.taskId}: ${request.taskGoal}`,
      mode === "compact" ? 160 : 320
    ),
    taskId: createSafePreview(request.taskId),
    terminalStatus: request.terminalStatus,
    testGaps
  };

  return validateLearningReview(review);
}

export function summarizeLearningReviewForEvent(
  review: LearningReview
): LearningReviewEventSummary {
  return {
    evidenceEventIds: [...review.evidence.eventIds],
    factCount: review.facts.length,
    lessonCount: review.lessons.length,
    memoryCandidateIds: review.memoryCandidates.map(
      (candidate) => candidate.candidateId
    ),
    missedAssumptionCount: review.missedAssumptions.length,
    mistakeCount: review.mistakes.length,
    mode: review.mode,
    proceduralOutputIds: review.proceduralOutputs.map((output) => output.id),
    skillSignalIds: review.skillSignals.map((signal) => signal.id),
    summary: createSafePreview(review.summary),
    testGapCount: review.testGaps.length
  };
}

export function validateLearningReview(
  review: LearningReview
): Result<LearningReview, SpriteError> {
  if (review.schemaVersion !== LEARNING_REVIEW_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_SCHEMA_VERSION",
        "Learning review schemaVersion is unsupported."
      )
    );
  }

  if (!LEARNING_REVIEW_MODES.includes(review.mode)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_MODE",
        "Learning review mode is unsupported."
      )
    );
  }

  if (review.terminalStatus !== "completed") {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TERMINAL_STATUS",
        "Successful task learning reviews require completed terminal status."
      )
    );
  }

  for (const [field, value] of [
    ["sessionId", review.sessionId],
    ["taskId", review.taskId],
    ["correlationId", review.correlationId],
    ["summary", review.summary]
  ] as const) {
    if (!isNonEmptyString(value) || containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "LEARNING_REVIEW_UNSAFE_FIELD",
          `Learning review ${field} must be non-empty and safe.`
        )
      );
    }
  }

  if (Number.isNaN(Date.parse(review.createdAt))) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TIMESTAMP",
        "Learning review createdAt must be a valid timestamp."
      )
    );
  }

  if (!Array.isArray(review.proceduralOutputs)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_PROCEDURAL_OUTPUTS",
        "Learning review proceduralOutputs must be an array."
      )
    );
  }

  for (const output of review.proceduralOutputs) {
    const validation = validateProceduralLearningOutput(output);

    if (!validation.ok) {
      return err(validation.error);
    }
  }

  const forbiddenField = findForbiddenLearningReviewField(
    review as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_UNSAFE_FIELD",
        `Learning review must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findSecretLearningReviewString(
    review as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_UNSAFE_VALUE",
        "Learning review must not include secret-looking values."
      )
    );
  }

  return { ok: true, value: review };
}

export function generateProceduralLearningOutputs(
  request: ProceduralLearningGenerationRequest
): Result<ProceduralLearningOutput[], SpriteError> {
  const createdAt = request.createdAt ?? new Date().toISOString();
  const commandsRun = normalizeLearningCommands(request.commandsRun ?? []);
  const validationResults = normalizeLearningValidations(
    request.validationResults ?? []
  );
  const outputs = request.skillSignals.map((signal) => {
    const evidenceEventIds = uniqueStrings(
      signal.evidenceEventIds.map((eventId) => createSafePreview(eventId))
    );
    const matchingCommands = commandsRun.filter((command) =>
      evidenceEventIds.includes(command.eventId)
    );
    const toolSequence =
      matchingCommands.length === 0
        ? evidenceEventIds.map((eventId) => `event:${eventId}`)
        : matchingCommands.map((command) => command.command);
    const failedValidationCount = validationResults.filter(
      (result) => result.status !== "passed"
    ).length;
    const knownRisks = [
      "Do not promote this procedural output without explicit user approval.",
      ...(failedValidationCount === 0
        ? [
            "Re-run the supporting validation command before reusing this workflow in a different task."
          ]
        : [
            "Prior validation was not fully green; inspect validation evidence before reuse."
          ])
    ];
    const output: ProceduralLearningOutput = {
      createdAt,
      evidenceEventIds,
      id: `procout_${safeProceduralIdPart(request.taskId)}_${safeProceduralIdPart(signal.id)}`,
      knownRisks,
      memoryType: "procedural",
      promotionStatus: "not_promoted",
      schemaVersion: PROCEDURAL_LEARNING_OUTPUT_SCHEMA_VERSION,
      sourceCorrelationId: createSafePreview(request.correlationId),
      sourceSessionId: createSafePreview(request.sessionId),
      sourceSkillSignalId: createSafePreview(signal.id),
      sourceTaskId: createSafePreview(request.taskId),
      status: "candidate",
      toolSequence,
      triggerReason: createSafePreview(signal.triggerReason, 240),
      workflowSummary: createSafePreview(signal.signal, 240)
    };

    return output;
  });

  return normalizeProceduralLearningOutputs(outputs, "full");
}

export function normalizeProceduralLearningOutputs(
  outputs: readonly ProceduralLearningOutput[],
  mode: LearningReviewMode = "compact"
): Result<ProceduralLearningOutput[], SpriteError> {
  const normalized: ProceduralLearningOutput[] = [];

  for (const output of outputs.slice(0, mode === "compact" ? 5 : 20)) {
    const validation = validateProceduralLearningOutput(output);

    if (!validation.ok) {
      return err(validation.error);
    }

    normalized.push({
      ...validation.value,
      evidenceEventIds: uniqueStrings(
        validation.value.evidenceEventIds.map((eventId) =>
          createSafePreview(eventId)
        )
      ),
      id: createSafePreview(validation.value.id),
      knownRisks: normalizeLearningStrings(validation.value.knownRisks, mode),
      sourceCorrelationId: createSafePreview(
        validation.value.sourceCorrelationId
      ),
      sourceSessionId: createSafePreview(validation.value.sourceSessionId),
      sourceSkillSignalId: createSafePreview(
        validation.value.sourceSkillSignalId
      ),
      sourceTaskId: createSafePreview(validation.value.sourceTaskId),
      toolSequence: normalizeLearningStrings(
        validation.value.toolSequence,
        mode
      ),
      triggerReason: createSafePreview(
        validation.value.triggerReason,
        mode === "compact" ? 160 : 320
      ),
      workflowSummary: createSafePreview(
        validation.value.workflowSummary,
        mode === "compact" ? 160 : 320
      )
    });
  }

  return { ok: true, value: normalized };
}

export function summarizeProceduralLearningOutputsForEvent(
  outputs: readonly ProceduralLearningOutput[]
): string[] {
  return outputs.map((output) => createSafePreview(output.id));
}

export function validateProceduralLearningOutput(
  output: ProceduralLearningOutput
): Result<ProceduralLearningOutput, SpriteError> {
  if (
    output.schemaVersion !== PROCEDURAL_LEARNING_OUTPUT_SCHEMA_VERSION ||
    !PROCEDURAL_LEARNING_OUTPUT_STATUSES.includes(output.status) ||
    !PROCEDURAL_LEARNING_PROMOTION_STATUSES.includes(output.promotionStatus) ||
    output.memoryType !== "procedural"
  ) {
    return err(
      new SpriteError(
        "PROCEDURAL_LEARNING_OUTPUT_INVALID_SCHEMA",
        "Procedural learning output schema, status, promotion status, or memory type is unsupported."
      )
    );
  }

  if (!/^procout_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(output.id)) {
    return err(
      new SpriteError(
        "PROCEDURAL_LEARNING_OUTPUT_INVALID_ID",
        "Procedural learning output id must use the procout_ prefix."
      )
    );
  }

  if (Number.isNaN(Date.parse(output.createdAt))) {
    return err(
      new SpriteError(
        "PROCEDURAL_LEARNING_OUTPUT_INVALID_TIMESTAMP",
        "Procedural learning output createdAt must be a valid timestamp."
      )
    );
  }

  for (const [field, value] of [
    ["id", output.id],
    ["sourceCorrelationId", output.sourceCorrelationId],
    ["sourceSessionId", output.sourceSessionId],
    ["sourceSkillSignalId", output.sourceSkillSignalId],
    ["sourceTaskId", output.sourceTaskId],
    ["triggerReason", output.triggerReason],
    ["workflowSummary", output.workflowSummary]
  ] as const) {
    if (!isNonEmptyString(value) || containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "PROCEDURAL_LEARNING_OUTPUT_UNSAFE_FIELD",
          `Procedural learning output ${field} must be non-empty and safe.`
        )
      );
    }
  }

  for (const [field, values] of [
    ["evidenceEventIds", output.evidenceEventIds],
    ["knownRisks", output.knownRisks],
    ["toolSequence", output.toolSequence]
  ] as const) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some(
        (value) => !isNonEmptyString(value) || containsSecretLikeValue(value)
      )
    ) {
      return err(
        new SpriteError(
          "PROCEDURAL_LEARNING_OUTPUT_MISSING_EVIDENCE",
          `Procedural learning output ${field} must include non-empty safe values.`
        )
      );
    }
  }

  const forbiddenField = findForbiddenLearningReviewField(
    output as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "PROCEDURAL_LEARNING_OUTPUT_UNSAFE_FIELD",
        `Procedural learning output must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findSecretLearningReviewString(
    output as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "PROCEDURAL_LEARNING_OUTPUT_UNSAFE_VALUE",
        "Procedural learning output must not include secret-looking values."
      )
    );
  }

  return {
    ok: true,
    value: {
      ...output,
      evidenceEventIds: uniqueStrings(output.evidenceEventIds),
      knownRisks: uniqueStrings(output.knownRisks),
      toolSequence: uniqueStrings(output.toolSequence)
    }
  };
}

export function evaluateRetrospectiveEligibility(
  request: RetrospectiveGenerationRequest
): Result<RetrospectiveEligibilityReport, SpriteError> {
  if (!RETROSPECTIVE_TERMINAL_STATUSES.includes(request.terminalStatus)) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_INVALID_TERMINAL_STATUS",
        "Retrospective terminal status is unsupported."
      )
    );
  }

  const availableFields: RetrospectiveContextField[] = [];
  const missingFields: RetrospectiveContextField[] = [];
  const eventIds = uniqueStrings(
    request.events.flatMap((event) =>
      isNonEmptyString(event.eventId) ? [event.eventId] : []
    )
  );
  const filesTouched = collectRetrospectiveFiles(request);
  const commandsRun = normalizeLearningCommands(request.commandsRun ?? []);
  const failureReasonOrOutcome = createRetrospectiveReasonOrOutcome(request);
  const finalStatusAvailable = RETROSPECTIVE_TERMINAL_STATUSES.includes(
    request.finalStatus
  );
  const terminalEvent = findRetrospectiveTerminalEvent(
    request.events,
    request.terminalStatus
  );

  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "taskGoal",
    isNonEmptyString(request.taskGoal)
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "eventHistory",
    eventIds.length > 0
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "terminalState",
    terminalEvent !== undefined
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "filesTouched",
    filesTouched.length > 0
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "commandsRun",
    commandsRun.length > 0
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "failureReasonOrOutcome",
    isNonEmptyString(failureReasonOrOutcome)
  );
  addRetrospectiveContextField(
    availableFields,
    missingFields,
    "finalStatus",
    finalStatusAvailable
  );

  return {
    ok: true,
    value: {
      availableFields,
      eligible: missingFields.length === 0,
      missingFields,
      sourceSessionId: createSafePreview(request.sessionId),
      sourceTaskId: createSafePreview(request.taskId),
      terminalStatus: request.terminalStatus
    }
  };
}

export function generateRetrospectiveReview(
  request: RetrospectiveGenerationRequest
): Result<RetrospectiveReview, SpriteError> {
  const eligibility = evaluateRetrospectiveEligibility(request);

  if (!eligibility.ok) {
    return err(eligibility.error);
  }

  if (!eligibility.value.eligible) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        `Retrospective review is missing required context fields: ${eligibility.value.missingFields.join(", ")}.`
      )
    );
  }

  const createdAt = request.createdAt ?? new Date().toISOString();
  const events = request.events.map((event) => ({
    eventId: createSafePreview(event.eventId),
    ...(event.message === undefined
      ? {}
      : { message: createSafePreview(event.message) }),
    ...(event.reason === undefined
      ? {}
      : { reason: createSafePreview(event.reason) }),
    ...(event.status === undefined
      ? {}
      : { status: createSafePreview(event.status) }),
    ...(event.summary === undefined
      ? {}
      : { summary: createSafePreview(event.summary) }),
    type: createSafePreview(event.type)
  }));
  const commandsRun = normalizeLearningCommands(request.commandsRun ?? []);
  const validationResults = normalizeLearningValidations(
    request.validationResults ?? []
  );
  const memoryInfluences = normalizeRetrospectiveMemoryInfluences(
    request.memoryInfluences ?? []
  );
  const eventIds = uniqueStrings([
    ...events.map((event) => event.eventId),
    ...commandsRun.map((command) => command.eventId),
    ...validationResults.map((result) => result.eventId),
    ...memoryInfluences.map((influence) => influence.eventId)
  ]);
  const filesTouched = collectRetrospectiveFiles(request);
  const terminalEvent = findRetrospectiveTerminalEvent(
    events,
    request.terminalStatus
  );

  if (terminalEvent === undefined) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review requires a matching terminal event."
      )
    );
  }

  const reasonOrOutcome = createRetrospectiveReasonOrOutcome(request);
  const terminalEvidenceIds = [terminalEvent.eventId];
  const isFailureLike = request.terminalStatus !== "completed";
  const missedAssumptions = limitLearningItems(
    [
      ...events
        .filter((event) => event.type === "task.steering.received")
        .map((event) =>
          createLearningItem(
            `User steering changed or clarified the task: ${event.summary ?? event.message ?? event.reason ?? event.type}`,
            [event.eventId]
          )
        ),
      ...(isFailureLike
        ? [
            createLearningItem(
              `Terminal state '${request.terminalStatus}' means the original completion assumption did not hold: ${reasonOrOutcome}.`,
              terminalEvidenceIds
            )
          ]
        : [])
    ],
    "compact"
  );
  const memoryCandidates = createRetrospectiveMemoryCandidates(
    request,
    reasonOrOutcome,
    terminalEvidenceIds,
    memoryInfluences
  );
  const skillSignals = createRetrospectiveSkillSignals(
    request,
    terminalEvidenceIds,
    validationResults,
    memoryInfluences
  );
  const nextTimeImprovements = createRetrospectiveNextTimeImprovements(
    request,
    reasonOrOutcome,
    terminalEvidenceIds,
    validationResults
  );
  const review: RetrospectiveReview = {
    commandsRun,
    context: eligibility.value,
    correlationId: createSafePreview(request.correlationId),
    createdAt,
    evidence: {
      commandsRun,
      eventIds,
      filesTouched,
      memoryInfluenceEventIds: memoryInfluences.map(
        (influence) => influence.eventId
      ),
      terminalEventId: terminalEvent.eventId,
      validationResults
    },
    eventHistoryReference: {
      eventCount: events.length,
      eventIds: events.map((event) => event.eventId)
    },
    ...(isFailureLike
      ? { failureReason: createSafePreview(reasonOrOutcome, 240) }
      : { outcome: createSafePreview(reasonOrOutcome, 240) }),
    filesTouched,
    finalStatus: request.finalStatus,
    memoryCandidates,
    missedAssumptions,
    nextTimeImprovements,
    schemaVersion: RETROSPECTIVE_REVIEW_SCHEMA_VERSION,
    sessionId: createSafePreview(request.sessionId),
    skillSignals,
    summary: createSafePreview(
      `Retrospective review for ${request.terminalStatus} task ${request.taskId}.`
    ),
    taskGoal: createSafePreview(request.taskGoal, 240),
    taskId: createSafePreview(request.taskId),
    terminalStatus: request.terminalStatus
  };

  return validateRetrospectiveReview(review);
}

export function summarizeRetrospectiveReviewForEvent(
  review: RetrospectiveReview
): RetrospectiveReviewEventSummary {
  return {
    commandCount: review.commandsRun.length,
    evidenceEventIds: [...review.evidence.eventIds],
    fileCount: review.filesTouched.length,
    finalStatus: review.finalStatus,
    memoryCandidateCount: review.memoryCandidates.length,
    missedAssumptionCount: review.missedAssumptions.length,
    nextTimeImprovementCount: review.nextTimeImprovements.length,
    skillSignalCount: review.skillSignals.length,
    status: "recorded",
    summary: createSafePreview(review.summary),
    terminalStatus: review.terminalStatus
  };
}

export function validateRetrospectiveReview(
  review: RetrospectiveReview
): Result<RetrospectiveReview, SpriteError> {
  if (review.schemaVersion !== RETROSPECTIVE_REVIEW_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_INVALID_SCHEMA_VERSION",
        "Retrospective review schemaVersion is unsupported."
      )
    );
  }

  if (!RETROSPECTIVE_TERMINAL_STATUSES.includes(review.terminalStatus)) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_INVALID_TERMINAL_STATUS",
        "Retrospective terminalStatus is unsupported."
      )
    );
  }

  if (!RETROSPECTIVE_TERMINAL_STATUSES.includes(review.finalStatus)) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_INVALID_FINAL_STATUS",
        "Retrospective finalStatus is unsupported."
      )
    );
  }

  for (const [field, value] of [
    ["sessionId", review.sessionId],
    ["taskId", review.taskId],
    ["correlationId", review.correlationId],
    ["taskGoal", review.taskGoal],
    ["summary", review.summary]
  ] as const) {
    if (!isNonEmptyString(value) || containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "RETROSPECTIVE_REVIEW_UNSAFE_FIELD",
          `Retrospective review ${field} must be non-empty and safe.`
        )
      );
    }
  }

  if (Number.isNaN(Date.parse(review.createdAt))) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_INVALID_TIMESTAMP",
        "Retrospective review createdAt must be a valid timestamp."
      )
    );
  }

  if (!review.context.eligible || review.context.missingFields.length > 0) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review artifacts require eligible context."
      )
    );
  }

  if (
    review.evidence.eventIds.length === 0 ||
    review.evidence.filesTouched.length === 0 ||
    review.evidence.commandsRun.length === 0 ||
    !isNonEmptyString(review.evidence.terminalEventId)
  ) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT",
        "Retrospective review evidence must include events, files, commands, and a terminal event."
      )
    );
  }

  if (review.terminalStatus === "completed") {
    if (!isNonEmptyString(review.outcome)) {
      return err(
        new SpriteError(
          "RETROSPECTIVE_REVIEW_MISSING_OUTCOME",
          "Completed task retrospectives require an outcome."
        )
      );
    }
  } else if (!isNonEmptyString(review.failureReason)) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_MISSING_FAILURE_REASON",
        "Failed or aborted task retrospectives require a failure reason."
      )
    );
  }

  const forbiddenField = findForbiddenLearningReviewField(
    review as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_UNSAFE_FIELD",
        `Retrospective review must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findSecretLearningReviewString(
    review as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "RETROSPECTIVE_REVIEW_UNSAFE_VALUE",
        "Retrospective review must not include secret-looking values."
      )
    );
  }

  return { ok: true, value: review };
}

export function selectMemoryInfluenceCandidates(
  request: MemoryInfluenceSelectionRequest
): Result<MemoryInfluenceCandidate[], SpriteError> {
  if (!isNonEmptyString(request.taskGoal)) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_TASK_GOAL",
        "Memory influence selection requires a non-empty task goal."
      )
    );
  }

  if (
    request.limit !== undefined &&
    (!Number.isInteger(request.limit) || request.limit <= 0)
  ) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_LIMIT",
        "Memory influence selection limit must be a positive integer."
      )
    );
  }

  const goalTerms = tokenizeInfluenceText(request.taskGoal);
  const limit = request.limit ?? 5;
  const candidates = request.sources.flatMap((source) => {
    const normalized = normalizeMemoryInfluenceSource(source, goalTerms);

    return normalized === null ? [] : [normalized];
  });

  return {
    ok: true,
    value: candidates
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.sourceId.localeCompare(right.sourceId);
      })
      .slice(0, limit)
  };
}

export function validateMemoryInfluenceRecord(
  record: MemoryInfluenceRecord
): Result<MemoryInfluenceRecord, SpriteError> {
  if (record.schemaVersion !== MEMORY_INFLUENCE_SCHEMA_VERSION) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_SCHEMA_VERSION",
        "Memory influence schemaVersion is unsupported."
      )
    );
  }

  if (!MEMORY_INFLUENCE_STATUSES.includes(record.status)) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_STATUS",
        "Memory influence status is unsupported."
      )
    );
  }

  if (!MEMORY_INFLUENCE_SOURCE_TYPES.includes(record.sourceType)) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_SOURCE_TYPE",
        "Memory influence source type is unsupported."
      )
    );
  }

  if (record.sourceType === "procedural_learning_output") {
    if (!/^procout_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.sourceId)) {
      return err(
        new SpriteError(
          "MEMORY_INFLUENCE_INVALID_SOURCE_ID",
          "Procedural memory influence sourceId must reference a procout_ procedural output."
        )
      );
    }

    if (
      !isNonEmptyString(record.sourceSessionId) ||
      !isNonEmptyString(record.sourceTaskId)
    ) {
      return err(
        new SpriteError(
          "MEMORY_INFLUENCE_MISSING_SOURCE_REFERENCE",
          "Procedural memory influence records require sourceSessionId and sourceTaskId."
        )
      );
    }
  }

  const requiredStrings = [
    ["sessionId", record.sessionId],
    ["taskId", record.taskId],
    ["correlationId", record.correlationId],
    ["sourceId", record.sourceId],
    ["preview", record.preview]
  ] as const;

  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value) || containsSecretLikeValue(value)) {
      return err(
        new SpriteError(
          "MEMORY_INFLUENCE_UNSAFE_FIELD",
          `Memory influence ${field} must be non-empty and safe.`
        )
      );
    }
  }

  if (record.status === "used" && !isNonEmptyString(record.influenceSummary)) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_MISSING_SUMMARY",
        "Used memory influence records require an influence summary."
      )
    );
  }

  if (
    (record.status === "ignored" || record.status === "contradicted") &&
    !isNonEmptyString(record.reason)
  ) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_MISSING_REASON",
        "Ignored or contradicted memory influence records require a reason."
      )
    );
  }

  if (Number.isNaN(Date.parse(record.createdAt))) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_TIMESTAMP",
        "Memory influence createdAt must be a valid timestamp."
      )
    );
  }

  if (
    record.sourceEventIds.length === 0 ||
    record.sourceEventIds.some((eventId) => !isNonEmptyString(eventId))
  ) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_SOURCE_EVENTS",
        "Memory influence source event IDs must be non-empty strings."
      )
    );
  }

  if (
    record.evidenceEventIds.length === 0 ||
    record.evidenceEventIds.some((eventId) => !isNonEmptyString(eventId))
  ) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_INVALID_EVIDENCE_EVENTS",
        "Memory influence evidence event IDs must be non-empty strings."
      )
    );
  }

  const forbiddenField = findForbiddenLearningReviewField(
    record as unknown,
    new WeakSet()
  );

  if (forbiddenField !== null) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_UNSAFE_FIELD",
        `Memory influence records must not include raw or secret-bearing field '${forbiddenField}'.`
      )
    );
  }

  const unsafeString = findSecretLearningReviewString(
    record as unknown,
    new WeakSet()
  );

  if (unsafeString !== null) {
    return err(
      new SpriteError(
        "MEMORY_INFLUENCE_UNSAFE_VALUE",
        "Memory influence records must not include secret-looking values."
      )
    );
  }

  return {
    ok: true,
    value: {
      ...record,
      evidenceEventIds: uniqueStrings(record.evidenceEventIds),
      sourceEventIds: uniqueStrings(record.sourceEventIds)
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

function validateLearningReviewGenerationRequest(
  request: LearningReviewGenerationRequest
): Result<void, SpriteError> {
  if (!isNonEmptyString(request.sessionId)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_SESSION_ID",
        "Learning review sessionId must be provided."
      )
    );
  }

  if (!isNonEmptyString(request.taskId)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TASK_ID",
        "Learning review taskId must be provided."
      )
    );
  }

  if (!isNonEmptyString(request.correlationId)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_CORRELATION_ID",
        "Learning review correlationId must be provided."
      )
    );
  }

  if (!isNonEmptyString(request.taskGoal)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TASK_GOAL",
        "Learning review task goal must be provided."
      )
    );
  }

  if (request.mode !== undefined && !LEARNING_REVIEW_MODES.includes(request.mode)) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_MODE",
        "Learning review mode is unsupported."
      )
    );
  }

  if (
    request.createdAt !== undefined &&
    Number.isNaN(Date.parse(request.createdAt))
  ) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TIMESTAMP",
        "Learning review createdAt must be a valid timestamp when provided."
      )
    );
  }

  if (request.terminalStatus !== "completed") {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_INVALID_TERMINAL_STATUS",
        "Learning review generation only supports completed task state."
      )
    );
  }

  if (request.events.length === 0) {
    return err(
      new SpriteError(
        "LEARNING_REVIEW_MISSING_EVIDENCE",
        "Learning review generation requires at least one source event."
      )
    );
  }

  return { ok: true, value: undefined };
}

function normalizeMemoryInfluenceSource(
  source: MemoryInfluenceSourceInput,
  goalTerms: ReadonlySet<string>
): MemoryInfluenceCandidate | null {
  if (
    !isNonEmptyString(source.sourceId) ||
    !MEMORY_INFLUENCE_SOURCE_TYPES.includes(source.sourceType) ||
    !isNonEmptyString(source.content)
  ) {
    return null;
  }

  const searchable = [
    source.content,
    source.provenance,
    source.sourceTaskId,
    source.type
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const sourceTerms = tokenizeInfluenceText(searchable);
  const overlap = [...goalTerms].filter((term) => sourceTerms.has(term)).length;

  if (overlap === 0) {
    return null;
  }

  const confidenceScore =
    source.confidence === "high" ? 2 : source.confidence === "medium" ? 1 : 0;
  const lessonScore = source.sourceType === "learning_review_lesson" ? 1 : 0;
  const score = overlap * 10 + confidenceScore + lessonScore;

  if (score <= 0) {
    return null;
  }

  return {
    ...(source.confidence === undefined ? {} : { confidence: source.confidence }),
    preview: createSafePreview(source.content),
    ...(source.provenance === undefined
      ? {}
      : { provenance: createSafePreview(source.provenance) }),
    retrievalReason: createSafePreview(
      `Matched ${String(overlap)} task term${overlap === 1 ? "" : "s"} with ${source.sourceType.replace(/_/g, " ")}.`
    ),
    score,
    sourceEventIds: uniqueStrings(
      (source.sourceEventIds ?? []).map((eventId) => createSafePreview(eventId))
    ),
    sourceId: createSafePreview(source.sourceId),
    ...(source.sourceSessionId === undefined
      ? {}
      : { sourceSessionId: createSafePreview(source.sourceSessionId) }),
    ...(source.sourceTaskId === undefined
      ? {}
      : { sourceTaskId: createSafePreview(source.sourceTaskId) }),
    sourceType: source.sourceType,
    ...(source.type === undefined ? {} : { type: source.type })
  };
}

function tokenizeInfluenceText(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function normalizeLearningCommands(
  commands: readonly LearningReviewCommandEvidence[]
): LearningReviewCommandEvidence[] {
  return commands.map((command) => ({
    command: createSafePreview(command.command),
    eventId: createSafePreview(command.eventId),
    status: createSafePreview(command.status)
  }));
}

function normalizeLearningValidations(
  validations: readonly LearningReviewValidationResult[]
): LearningReviewValidationResult[] {
  return validations.map((validation) => ({
    ...(validation.command === undefined
      ? {}
      : { command: createSafePreview(validation.command) }),
    eventId: createSafePreview(validation.eventId),
    ...(validation.name === undefined
      ? {}
      : { name: createSafePreview(validation.name) }),
    status: createSafePreview(validation.status)
  }));
}

function normalizeRetrospectiveMemoryInfluences(
  influences: readonly RetrospectiveMemoryInfluenceReference[]
): RetrospectiveMemoryInfluenceReference[] {
  return influences.slice(0, 20).map((influence) => ({
    eventId: createSafePreview(influence.eventId),
    sourceId: createSafePreview(influence.sourceId),
    sourceType: influence.sourceType,
    status: influence.status,
    ...(influence.summary === undefined
      ? {}
      : { summary: createSafePreview(influence.summary, 240) })
  }));
}

function collectRetrospectiveFiles(
  request: RetrospectiveGenerationRequest
): string[] {
  return normalizeLearningStrings(
    [
      ...(request.filesChanged ?? []),
      ...(request.filesProposedForChange ?? []),
      ...(request.filesRead ?? [])
    ],
    "compact"
  );
}

function addRetrospectiveContextField(
  availableFields: RetrospectiveContextField[],
  missingFields: RetrospectiveContextField[],
  field: RetrospectiveContextField,
  available: boolean
): void {
  if (available) {
    availableFields.push(field);
  } else {
    missingFields.push(field);
  }
}

function createRetrospectiveReasonOrOutcome(
  request: RetrospectiveGenerationRequest
): string {
  const reason = isNonEmptyString(request.terminalReason)
    ? createSafePreview(request.terminalReason)
    : undefined;
  const message = isNonEmptyString(request.terminalMessage)
    ? createSafePreview(request.terminalMessage)
    : undefined;

  if (reason !== undefined && message !== undefined) {
    return `${reason}: ${message}`;
  }

  return reason ?? message ?? "";
}

function findRetrospectiveTerminalEvent(
  events: readonly RetrospectiveReviewEventInput[],
  terminalStatus: RetrospectiveTerminalStatus
): RetrospectiveReviewEventInput | undefined {
  const terminalTypes = new Set([
    "task.cancelled",
    "task.completed",
    "task.failed"
  ]);

  return [...events].reverse().find((event) => {
    if (!terminalTypes.has(event.type)) {
      return false;
    }

    if (terminalStatus === "completed") {
      return event.type === "task.completed";
    }

    if (terminalStatus === "cancelled") {
      return event.type === "task.cancelled";
    }

    return event.type === "task.failed";
  });
}

function createRetrospectiveMemoryCandidates(
  request: RetrospectiveGenerationRequest,
  reasonOrOutcome: string,
  terminalEvidenceIds: readonly string[],
  memoryInfluences: readonly RetrospectiveMemoryInfluenceReference[]
): RetrospectiveReviewMemoryCandidate[] {
  return [
    {
      candidateId: `retromem_${safeRetrospectiveIdPart(request.taskId)}_terminal`,
      confidence: request.terminalStatus === "completed" ? "low" : "medium",
      evidenceEventIds: [...terminalEvidenceIds],
      memoryType: "episodic",
      summary: createSafePreview(
        `Task '${request.taskGoal}' ended as ${request.terminalStatus}: ${reasonOrOutcome}.`,
        240
      )
    },
    ...memoryInfluences.slice(0, 4).map((influence, index) => ({
      candidateId: `retromem_${safeRetrospectiveIdPart(request.taskId)}_influence_${index + 1}`,
      confidence: "medium" as const,
      evidenceEventIds: [influence.eventId],
      memoryType: "semantic" as const,
      summary: createSafePreview(
        `Memory influence ${influence.sourceId} was ${influence.status}${influence.summary === undefined ? "" : `: ${influence.summary}`}.`,
        240
      )
    }))
  ];
}

function createRetrospectiveSkillSignals(
  request: RetrospectiveGenerationRequest,
  terminalEvidenceIds: readonly string[],
  validationResults: readonly LearningReviewValidationResult[],
  memoryInfluences: readonly RetrospectiveMemoryInfluenceReference[]
): LearningReviewSkillSignal[] {
  return limitLearningItems(
    [
      ...(request.terminalStatus === "completed"
        ? []
        : [
            createLearningItem(
              `Terminal ${request.terminalStatus} tasks should be routed through retrospective review before retrying.`,
              terminalEvidenceIds
            )
          ]),
      ...validationResults
        .filter((result) => result.status !== "passed")
        .map((result) =>
          createLearningItem(
            `Validation follow-up pattern detected: ${result.name ?? result.command ?? result.eventId} ended as ${result.status}.`,
            [result.eventId]
          )
        ),
      ...(memoryInfluences.length === 0
        ? []
        : [
            createLearningItem(
              "Retrospectives should include prior memory influence evidence when it shaped or contradicted the task.",
              memoryInfluences.map((influence) => influence.eventId)
            )
          ])
    ],
    "compact"
  ).map((item, index) => ({
    evidenceEventIds: item.evidenceEventIds,
    id: `skillsig_retrospective_${safeRetrospectiveIdPart(request.taskId)}_${index + 1}`,
    signal: item.summary,
    triggerReason: item.summary
  }));
}

function createRetrospectiveNextTimeImprovements(
  request: RetrospectiveGenerationRequest,
  reasonOrOutcome: string,
  terminalEvidenceIds: readonly string[],
  validationResults: readonly LearningReviewValidationResult[]
): LearningReviewSectionItem[] {
  return limitLearningItems(
    [
      createLearningItem(
        request.terminalStatus === "completed"
          ? "Keep task outcome, command evidence, and touched files linked when reusing this result."
          : `Before retrying, review the terminal reason and recovery path: ${reasonOrOutcome}.`,
        terminalEvidenceIds
      ),
      ...validationResults
        .filter((result) => result.status !== "passed")
        .map((result) =>
          createLearningItem(
            `Resolve or document validation result '${result.status}' for ${result.name ?? result.command ?? result.eventId} before considering the next attempt complete.`,
            [result.eventId]
          )
        )
    ],
    "compact"
  );
}

function safeRetrospectiveIdPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_");

  return sanitized.length === 0 ? "task" : sanitized;
}

function safeProceduralIdPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_");

  return sanitized.length === 0 ? "signal" : sanitized;
}

function normalizeLearningMemoryCandidates(
  candidates: readonly LearningReviewMemoryCandidateReference[],
  mode: LearningReviewMode
): LearningReviewMemoryCandidateReference[] {
  return candidates.slice(0, mode === "compact" ? 5 : 20).map((candidate) => ({
    candidateId: createSafePreview(candidate.candidateId),
    ...(candidate.confidence === undefined
      ? {}
      : { confidence: candidate.confidence }),
    eventId: createSafePreview(candidate.eventId),
    ...(candidate.memoryType === undefined
      ? {}
      : { memoryType: candidate.memoryType }),
    ...(candidate.status === undefined
      ? {}
      : { status: createSafePreview(candidate.status) })
  }));
}

function normalizeLearningSkillSignals(
  signals: readonly LearningReviewSkillSignal[],
  mode: LearningReviewMode
): LearningReviewSkillSignal[] {
  return signals.slice(0, mode === "compact" ? 5 : 20).map((signal) => ({
    evidenceEventIds: uniqueStrings(
      signal.evidenceEventIds.map((eventId) => createSafePreview(eventId))
    ),
    id: createSafePreview(signal.id),
    signal: createSafePreview(signal.signal, mode === "compact" ? 160 : 320),
    triggerReason: createSafePreview(
      signal.triggerReason,
      mode === "compact" ? 160 : 320
    )
  }));
}

function normalizeLearningStrings(
  values: readonly string[],
  mode: LearningReviewMode
): string[] {
  return uniqueStrings(values.map((value) => createSafePreview(value))).slice(
    0,
    mode === "compact" ? 10 : 50
  );
}

function createLearningItem(
  summary: string,
  evidenceEventIds: readonly string[]
): LearningReviewSectionItem {
  return {
    evidenceEventIds: uniqueStrings(
      evidenceEventIds.map((eventId) => createSafePreview(eventId))
    ),
    summary: createSafePreview(summary, 240)
  };
}

function limitLearningItems(
  items: readonly LearningReviewSectionItem[],
  mode: LearningReviewMode
): LearningReviewSectionItem[] {
  return items.slice(0, mode === "compact" ? 5 : 20);
}

function findForbiddenLearningReviewField(
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
      const nested = findForbiddenLearningReviewField(item, seen);

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

    const nested = findForbiddenLearningReviewField(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function findSecretLearningReviewString(
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
      const nested = findSecretLearningReviewString(item, seen);

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
    const nested = findSecretLearningReviewString(nestedValue, seen);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function summarizeMatchedRules(rules: readonly SpriteSafetyRule[]): string {
  const reasons = Array.from(new Set(rules.map((rule) => rule.reason)));
  return reasons.join(" ");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
