import {
  resolveSpriteRuntimeConfig,
  toStartupConfig,
  type ConfigLoaderOptions,
  type ResolvedStartupConfig
} from "@sprite/config";
import {
  initializeProviderAdapter,
  type ProviderRuntimeOverride,
  type ResolvedProviderState
} from "@sprite/providers";
import { ok, type Result } from "@sprite/shared";

export interface BootstrapState {
  implemented: false;
  message: string;
  interfaces: string[];
  startup: ResolvedStartupConfig;
  provider: ResolvedProviderState | null;
  warnings: string[];
}

export interface RuntimeStartupOptions extends ConfigLoaderOptions {
  env?: NodeJS.ProcessEnv;
  providerOverride?: ProviderRuntimeOverride;
}

export class AgentRuntime {
  constructor(private readonly options: RuntimeStartupOptions = {}) {}

  getBootstrapState(): Result<BootstrapState> {
    const runtimeConfig = resolveSpriteRuntimeConfig(this.options);
    const startup = toStartupConfig(runtimeConfig);
    const provider = initializeProviderAdapter(runtimeConfig, {
      env: this.options.env,
      homeDir: this.options.homeDir,
      override: this.options.providerOverride
    });
    const warnings = [...startup.warnings, ...provider.warnings];

    return ok({
      implemented: false,
      message:
        "Sprite Harness bootstrap workspace is ready. Interactive task execution is not implemented yet.",
      interfaces: ["cli"],
      startup,
      provider: provider.adapter?.getState() ?? null,
      warnings
    });
  }
}

function formatOptionalValue(value: string | null): string {
  return value ?? "not configured";
}

function formatConfigStatus(loaded: boolean, path: string): string {
  return loaded ? `loaded (${path})` : `not loaded (${path})`;
}

function formatProviderAuth(provider: ResolvedProviderState | null): string {
  if (provider === null || !provider.auth.authenticated) {
    return "not configured";
  }

  return `${provider.auth.source} (secret redacted)`;
}

function formatProviderCapabilities(provider: ResolvedProviderState | null): string {
  if (provider === null) {
    return "not available";
  }

  const contextWindow =
    provider.capabilities.contextWindowTokens === null
      ? "unknown"
      : String(provider.capabilities.contextWindowTokens);

  return `streaming=${provider.capabilities.supportsStreaming}, tool-calls=${provider.capabilities.supportsToolCalls}, context-window=${contextWindow}`;
}

export function createBootstrapMessage(options: RuntimeStartupOptions = {}): string {
  const runtime = new AgentRuntime(options);
  const state = runtime.getBootstrapState();

  if (!state.ok) {
    throw state.error;
  }

  const { startup } = state.value;
  const warningLines = state.value.warnings.map((warning) => `- warning: ${warning}`);

  return [
    state.value.message,
    "Startup state:",
    `- cwd: ${startup.cwd}`,
    `- provider: ${state.value.provider?.providerName ?? formatOptionalValue(startup.provider)}`,
    `- model: ${state.value.provider?.model ?? formatOptionalValue(startup.model)}`,
    `- provider auth: ${formatProviderAuth(state.value.provider)}`,
    `- provider capabilities: ${formatProviderCapabilities(state.value.provider)}`,
    `- output: ${startup.outputFormat}`,
    `- sandbox: ${startup.sandboxMode}`,
    `- global config: ${formatConfigStatus(
      startup.globalConfigLoaded,
      startup.globalConfigPath
    )}`,
    `- project config: ${formatConfigStatus(
      startup.projectConfigLoaded,
      startup.projectConfigPath
    )}`,
    ...warningLines,
    "Use --help to inspect the current CLI surface."
  ].join("\n");
}
