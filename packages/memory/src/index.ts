import {
  createEffectiveSafetyRules,
  type SpriteSafetyRule,
  type SpriteSafetyRuleTarget
} from "@sprite/config";
import {
  SECRET_REDACTION_MARKER,
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  redactSecretLikeValues,
  type Result
} from "@sprite/shared";

const MEMORY_TYPES = [
  "episodic",
  "procedural",
  "self_model",
  "semantic",
  "working"
] as const;
const MEMORY_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
const DEFAULT_PREVIEW_LIMIT = 160;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryConfidence = (typeof MEMORY_CONFIDENCE_VALUES)[number];
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
  confidence: MemoryConfidence;
  content: string;
  createdAt?: string;
  path?: string;
  provenance: string;
  sourceTaskId?: string;
  target?: SpriteSafetyRuleTarget;
  type: MemoryType;
}

export interface MemoryCandidate {
  confidence: MemoryConfidence;
  content: string;
  createdAt: string;
  provenance: string;
  safetyDecision: SafetyEvaluationDecision;
  sourceTaskId?: string;
  type: MemoryType;
}

export interface MemoryCandidateEvaluation {
  candidate: MemoryCandidate | null;
  decision: SafetyEvaluationDecision;
}

export interface MemorySafetyOptions {
  rules?: readonly SpriteSafetyRule[];
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

  const candidateContent =
    safetyEvaluation.value.decision.action === "redact"
      ? safetyEvaluation.value.redactedContent
      : request.content;

  return {
    ok: true,
    value: {
      candidate: {
        confidence: request.confidence,
        content: candidateContent,
        createdAt: request.createdAt ?? new Date().toISOString(),
        provenance: request.provenance,
        safetyDecision: safetyEvaluation.value.decision,
        ...(request.sourceTaskId === undefined
          ? {}
          : { sourceTaskId: request.sourceTaskId }),
        type: request.type
      },
      decision: safetyEvaluation.value.decision
    }
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
