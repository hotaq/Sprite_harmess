export const SKILL_CANDIDATE_SCHEMA_VERSION = 1 as const;

export const SKILL_CANDIDATE_LIFECYCLE_STATUSES = [
  "proposed",
  "draft",
  "rejected",
  "promoted"
] as const;
export const SKILL_CANDIDATE_REVIEW_ACTIONS = [
  "edit",
  "draft",
  "reject",
  "promote"
] as const;
export const SKILL_CANDIDATE_PROMOTION_TARGETS = ["project"] as const;
export const SKILL_CANDIDATE_CONFIDENCE_VALUES = ["low", "medium"] as const;
export const SKILL_CANDIDATE_SKIPPED_REASONS = [
  "conflicting_evidence",
  "duplicate_candidate",
  "insufficient_evidence",
  "unsupported_signal_status",
  "unsafe_signal"
] as const;
export const SKILL_CANDIDATE_SOURCE_OUTCOMES = [
  "successful_workflow",
  "corrected_workflow",
  "recovered_workflow",
  "contradicted_guidance"
] as const;
export const SKILL_CANDIDATE_SOURCE_STATUSES = ["signal_only"] as const;

export type SkillCandidateLifecycleStatus =
  (typeof SKILL_CANDIDATE_LIFECYCLE_STATUSES)[number];
export type SkillCandidateReviewAction =
  (typeof SKILL_CANDIDATE_REVIEW_ACTIONS)[number];
export type SkillCandidatePromotionTarget =
  (typeof SKILL_CANDIDATE_PROMOTION_TARGETS)[number];
export type SkillCandidateConfidence =
  (typeof SKILL_CANDIDATE_CONFIDENCE_VALUES)[number];
export type SkillCandidateSkippedReason =
  (typeof SKILL_CANDIDATE_SKIPPED_REASONS)[number];
export type SkillCandidateSourceOutcome =
  (typeof SKILL_CANDIDATE_SOURCE_OUTCOMES)[number];
export type SkillCandidateSourceStatus =
  (typeof SKILL_CANDIDATE_SOURCE_STATUSES)[number];

export const SKILL_CANDIDATE_ID_PATTERN =
  /^skillcand_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_CANDIDATE_SIGNAL_ID_PATTERN =
  /^skillsig_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_CANDIDATE_SESSION_ID_PATTERN =
  /^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_CANDIDATE_TASK_ID_PATTERN =
  /^task_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_CANDIDATE_CORRELATION_ID_PATTERN =
  /^corr_[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const SKILL_CANDIDATE_EVENT_ID_PATTERN =
  /^evt_[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const SKILL_CANDIDATE_SAFE_TEXT_MAX_LENGTH = 320;
export const SKILL_CANDIDATE_SAFE_NAME_MAX_LENGTH = 80;
export const SKILL_CANDIDATE_ARRAY_MAX_LENGTH = 50;
export const SKILL_CANDIDATE_RAW_FILESYSTEM_PATH_PATTERN =
  /(?:^|[\s("'`])(?:~\/|\/(?:Applications|Users|Volumes|home|opt|private|tmp|var)\/|[A-Za-z]:\\)[^\s"'`)]+/;

export const FORBIDDEN_SKILL_CANDIDATE_FIELDS: ReadonlySet<string> = new Set([
  "activationGrant",
  "activationRule",
  "candidatePath",
  "commandOutput",
  "content",
  "diff",
  "env",
  "hunk",
  "newText",
  "oldText",
  "output",
  "patch",
  "promotedSkillPath",
  "rawCommandOutput",
  "rawContent",
  "rawOutput",
  "rawSkillContent",
  "rawSnippet",
  "routingRule",
  "secret",
  "skillCandidateId",
  "skillPath",
  "snippet",
  "snippets",
  "stderr",
  "stdout",
  "token"
]);

export const FORBIDDEN_SKILL_CANDIDATE_PAYLOAD_FIELDS: ReadonlySet<string> =
  new Set([
    "activationGrant",
    "activationRule",
    "candidatePath",
    "promotedSkillPath",
    "rawSkillContent",
    "routingRule",
    "skillPath"
  ]);
