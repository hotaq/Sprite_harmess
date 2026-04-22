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
import { createTaskRequest, runInitialPlanActObserveLoop } from "./runtime-loop.js";
import type { PlannedExecutionFlow } from "./task-state.js";

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

  submitInteractiveTask(task: string): Result<PlannedExecutionFlow> {
    const bootstrapState = this.getBootstrapState();

    if (!bootstrapState.ok) {
      return bootstrapState;
    }

    const request = createTaskRequest(task, bootstrapState.value);

    return ok(
      runInitialPlanActObserveLoop(request, [
        ...bootstrapState.value.warnings,
        "Interactive task planning is available, but repository inspection and tool execution start in later stories."
      ])
    );
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

export function createInteractiveTaskMessage(
  task: string,
  options: RuntimeStartupOptions = {}
): string {
  const runtime = new AgentRuntime(options);
  const state = runtime.submitInteractiveTask(task);

  if (!state.ok) {
    throw state.error;
  }

  const providerLabel =
    state.value.request.provider === null
      ? "not configured"
      : `${state.value.request.provider.providerName} (${state.value.request.provider.model ?? "model not configured"})`;
  const stepLines = state.value.steps.map(
    (step, index) =>
      `${index + 1}. [${step.phase}] ${step.status} - ${step.summary}`
  );
  const warningLines = state.value.warnings.map((warning) => `- warning: ${warning}`);

  return [
    `Task received: ${state.value.request.task}`,
    "Planned execution flow:",
    `- cwd: ${state.value.request.cwd}`,
    `- provider: ${providerLabel}`,
    `- output: ${state.value.request.allowedDefaults.outputFormat}`,
    `- sandbox: ${state.value.request.allowedDefaults.sandboxMode}`,
    `- max iterations: ${state.value.request.stopConditions.maxIterations}`,
    ...stepLines,
    state.value.summary,
    ...warningLines
  ].join("\n");
}
