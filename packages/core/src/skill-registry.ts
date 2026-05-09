import {
  listAvailableSkills,
  type ListSkillsOptions,
  type ListSkillsResult
} from "@sprite/skills";

export {
  SKILL_LIFECYCLE_STATES,
  SKILL_REGISTRY_SCHEMA_VERSION,
  SKILL_REGISTRY_SOURCES,
  listAvailableSkills,
  parseSkillFrontmatter,
  resolveSkillRegistryRoots,
  validateSkillRegistryEntry
} from "@sprite/skills";

export type {
  ListSkillsOptions,
  ListSkillsResult,
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
