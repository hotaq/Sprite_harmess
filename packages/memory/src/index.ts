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
  contentPreview: string;
  confidence: MemoryConfidence;
  content: string;
  createdAt: string;
  id: string;
  provenance: string;
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

  return {
    ok: true,
    value: {
      candidate: {
        contentPreview: createSafePreview(candidateContent),
        confidence: request.confidence,
        content: candidateContent,
        createdAt,
        id: request.candidateId ?? createMemoryCandidateId(),
        provenance: request.provenance,
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

export function createMemoryEntryFromCandidate(
  candidate: MemoryCandidate,
  options: CreateMemoryEntryOptions = {}
): Result<MemoryEntry, SpriteError> {
  if (!shouldAutoSaveMemoryCandidate(candidate)) {
    return err(
      new SpriteError(
        "MEMORY_ENTRY_INELIGIBLE_CANDIDATE",
        "Only high-confidence, non-sensitive episodic or semantic candidates can be converted to durable memory entries."
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
      reason: "Memory candidates must be bounded and shorter than the configured content limit.",
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
    .filter((line) =>
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
