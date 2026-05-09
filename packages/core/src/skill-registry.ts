import {
  invokeManualSkill,
  listAvailableSkills,
  type ManualSkillInvocationResult,
  type SkillInvocationRequest,
  type ListSkillsOptions,
  type ListSkillsResult
} from "@sprite/skills";

export {
  SKILL_LIFECYCLE_STATES,
  SKILL_INVOCATION_MODES,
  SKILL_INVOCATION_STATUSES,
  SKILL_REGISTRY_SCHEMA_VERSION,
  SKILL_REGISTRY_SOURCES,
  invokeManualSkill,
  listAvailableSkills,
  parseSkillFrontmatter,
  resolveSkillRegistryRoots,
  validateSkillRegistryEntry
} from "@sprite/skills";

export type {
  ListSkillsOptions,
  ListSkillsResult,
  InvokedSkillContext,
  ManualSkillInvocationResult,
  SkillInvocationErrorCode,
  SkillInvocationMode,
  SkillInvocationRecoverableError,
  SkillInvocationRequest,
  SkillInvocationStatus,
  SkillLifecycleState,
  SkillRegistryEntry,
  SkillRegistryRoot,
  SkillRegistrySource,
  SkillRegistryWarning,
  SkillRegistryWarningCode,
  UnavailableSkillRegistryEntry,
  ValidateSkillRegistryEntryInput,
  ValidateSkillRegistryEntryResult
} from "@sprite/skills";

export function listSkills(
  options: ListSkillsOptions = {}
): ListSkillsResult {
  return listAvailableSkills(options);
}

export function invokeSkill(
  request: SkillInvocationRequest
): ManualSkillInvocationResult {
  return invokeManualSkill(request);
}
