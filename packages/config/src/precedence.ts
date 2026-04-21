import type { SpriteConfig } from "./config-schema.js";

function mergeDefined<T extends Record<string, unknown>>(
  base: T | undefined,
  override: T | undefined
): T | undefined {
  if (base === undefined && override === undefined) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  if (base !== undefined) {
    Object.assign(result, base);
  }

  if (override !== undefined) {
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as T;
}

function mergeProvider(
  base: SpriteConfig["provider"],
  override: SpriteConfig["provider"]
): SpriteConfig["provider"] {
  return mergeDefined(base, override);
}

function mergeOutput(
  base: SpriteConfig["output"],
  override: SpriteConfig["output"]
): SpriteConfig["output"] {
  return mergeDefined(base, override);
}

function mergeSandbox(
  base: SpriteConfig["sandbox"],
  override: SpriteConfig["sandbox"]
): SpriteConfig["sandbox"] {
  return mergeDefined(base, override);
}

export function mergeSpriteConfigs(
  globalConfig?: SpriteConfig | null,
  projectConfig?: SpriteConfig | null
): SpriteConfig {
  return {
    provider: mergeProvider(globalConfig?.provider, projectConfig?.provider),
    output: mergeOutput(globalConfig?.output, projectConfig?.output),
    sandbox: mergeSandbox(globalConfig?.sandbox, projectConfig?.sandbox)
  };
}
