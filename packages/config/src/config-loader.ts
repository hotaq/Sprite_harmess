import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  parseSpriteConfig,
  type SpriteConfig,
  type SpriteOutputFormat,
  type SpriteSandboxMode,
  type SpriteValidationCommand
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
  validationCommands: SpriteValidationCommand[];
  globalConfigPath: string;
  projectConfigPath: string;
  globalConfigLoaded: boolean;
  projectConfigLoaded: boolean;
  warnings: string[];
}

export interface ResolvedSpriteRuntimeConfig {
  cwd: string;
  config: SpriteConfig;
  globalConfigPath: string;
  projectConfigPath: string;
  globalConfigLoaded: boolean;
  projectConfigLoaded: boolean;
  warnings: string[];
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

export interface LoadedSpriteConfigFile {
  config: SpriteConfig | null;
  loaded: boolean;
  warning: string | null;
}

function formatConfigError(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to load ${path}: ${message}`;
}

export function loadSpriteConfigFile(path: string): LoadedSpriteConfigFile {
  if (!existsSync(path)) {
    return {
      config: null,
      loaded: false,
      warning: null
    };
  }

  try {
    const rawConfig = JSON.parse(readFileSync(path, "utf8")) as unknown;

    return {
      config: parseSpriteConfig(rawConfig, path),
      loaded: true,
      warning: null
    };
  } catch (error: unknown) {
    return {
      config: null,
      loaded: false,
      warning: formatConfigError(path, error)
    };
  }
}

export function resolveStartupConfig(
  options: ConfigLoaderOptions = {}
): ResolvedStartupConfig {
  return toStartupConfig(resolveSpriteRuntimeConfig(options));
}

export function resolveSpriteRuntimeConfig(
  options: ConfigLoaderOptions = {}
): ResolvedSpriteRuntimeConfig {
  const cwd = options.cwd ?? process.cwd();
  const paths = resolveSpriteConfigPaths(options);
  const globalConfig = loadSpriteConfigFile(paths.globalConfigPath);
  const projectConfig = loadSpriteConfigFile(paths.projectConfigPath);
  const config = mergeSpriteConfigs(globalConfig.config, projectConfig.config);
  const warnings = [globalConfig.warning, projectConfig.warning].filter(
    (warning): warning is string => warning !== null
  );

  return {
    cwd,
    config,
    globalConfigPath: paths.globalConfigPath,
    projectConfigPath: paths.projectConfigPath,
    globalConfigLoaded: globalConfig.loaded,
    projectConfigLoaded: projectConfig.loaded,
    warnings
  };
}

export function toStartupConfig(
  runtimeConfig: ResolvedSpriteRuntimeConfig
): ResolvedStartupConfig {
  const { cwd, config } = runtimeConfig;

  return {
    cwd,
    provider: config.provider?.name ?? null,
    model: config.provider?.model ?? null,
    outputFormat: config.output?.format ?? DEFAULT_OUTPUT_FORMAT,
    sandboxMode: config.sandbox?.mode ?? DEFAULT_SANDBOX_MODE,
    validationCommands: cloneValidationCommands(
      config.validation?.commands ?? []
    ),
    globalConfigPath: runtimeConfig.globalConfigPath,
    projectConfigPath: runtimeConfig.projectConfigPath,
    globalConfigLoaded: runtimeConfig.globalConfigLoaded,
    projectConfigLoaded: runtimeConfig.projectConfigLoaded,
    warnings: runtimeConfig.warnings
  };
}

function cloneValidationCommands(
  commands: readonly SpriteValidationCommand[]
): SpriteValidationCommand[] {
  return commands.map((command) => ({
    ...(command.args === undefined ? {} : { args: [...command.args] }),
    command: command.command,
    ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
    ...(command.name === undefined ? {} : { name: command.name }),
    ...(command.timeoutMs === undefined ? {} : { timeoutMs: command.timeoutMs })
  }));
}
