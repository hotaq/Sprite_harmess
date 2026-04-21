import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  parseSpriteConfig,
  type SpriteConfig,
  type SpriteOutputFormat,
  type SpriteSandboxMode
} from "./config-schema.js";
import { mergeSpriteConfigs } from "./precedence.js";

const DEFAULT_OUTPUT_FORMAT: SpriteOutputFormat = "text";
const DEFAULT_SANDBOX_MODE: SpriteSandboxMode = "workspace-write";

export interface ConfigLoaderOptions {
  cwd?: string;
  homeDir?: string;
}

export interface SpriteConfigPaths {
  globalConfigPath: string;
  projectConfigPath: string;
}

export interface ResolvedStartupConfig {
  cwd: string;
  provider: string | null;
  model: string | null;
  outputFormat: SpriteOutputFormat;
  sandboxMode: SpriteSandboxMode;
  globalConfigPath: string;
  projectConfigPath: string;
  globalConfigLoaded: boolean;
  projectConfigLoaded: boolean;
}

export function resolveSpriteConfigPaths(
  options: ConfigLoaderOptions = {}
): SpriteConfigPaths {
  const homeDir = options.homeDir ?? homedir();
  const cwd = options.cwd ?? process.cwd();

  return {
    globalConfigPath: resolve(homeDir, ".sprite/config.json"),
    projectConfigPath: resolve(cwd, ".sprite/config.json")
  };
}

export function loadSpriteConfigFile(path: string): SpriteConfig | null {
  if (!existsSync(path)) {
    return null;
  }

  const rawConfig = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseSpriteConfig(rawConfig, path);
}

export function resolveStartupConfig(
  options: ConfigLoaderOptions = {}
): ResolvedStartupConfig {
  const cwd = options.cwd ?? process.cwd();
  const paths = resolveSpriteConfigPaths(options);
  const globalConfig = loadSpriteConfigFile(paths.globalConfigPath);
  const projectConfig = loadSpriteConfigFile(paths.projectConfigPath);
  const mergedConfig = mergeSpriteConfigs(globalConfig, projectConfig);

  return {
    cwd,
    provider: mergedConfig.provider?.name ?? null,
    model: mergedConfig.provider?.model ?? null,
    outputFormat: mergedConfig.output?.format ?? DEFAULT_OUTPUT_FORMAT,
    sandboxMode: mergedConfig.sandbox?.mode ?? DEFAULT_SANDBOX_MODE,
    globalConfigPath: paths.globalConfigPath,
    projectConfigPath: paths.projectConfigPath,
    globalConfigLoaded: globalConfig !== null,
    projectConfigLoaded: projectConfig !== null
  };
}
