import {
  resolveStartupConfig,
  type ConfigLoaderOptions,
  type ResolvedStartupConfig
} from "@sprite/config";
import { ok, type Result } from "@sprite/shared";

export interface BootstrapState {
  implemented: false;
  message: string;
  interfaces: string[];
  startup: ResolvedStartupConfig;
}

export interface RuntimeStartupOptions extends ConfigLoaderOptions {}

export class AgentRuntime {
  constructor(private readonly options: RuntimeStartupOptions = {}) {}

  getBootstrapState(): Result<BootstrapState> {
    const startup = resolveStartupConfig(this.options);

    return ok({
      implemented: false,
      message:
        "Sprite Harness bootstrap workspace is ready. Interactive task execution is not implemented yet.",
      interfaces: ["cli"],
      startup
    });
  }
}

function formatOptionalValue(value: string | null): string {
  return value ?? "not configured";
}

function formatConfigStatus(loaded: boolean, path: string): string {
  return loaded ? `loaded (${path})` : `not loaded (${path})`;
}

export function createBootstrapMessage(options: RuntimeStartupOptions = {}): string {
  const runtime = new AgentRuntime(options);
  const state = runtime.getBootstrapState();

  if (!state.ok) {
    throw state.error;
  }

  const { startup } = state.value;

  return [
    state.value.message,
    "Startup state:",
    `- cwd: ${startup.cwd}`,
    `- provider: ${formatOptionalValue(startup.provider)}`,
    `- model: ${formatOptionalValue(startup.model)}`,
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
    "Use --help to inspect the current CLI surface."
  ].join("\n");
}
