import type { ResolvedSpriteRuntimeConfig } from "@sprite/config";
import {
  type ProviderAuthSource,
  type ProviderAuthState
} from "../provider-capabilities.js";
import { loadApiKeyAuthFile } from "./auth-store.js";

export interface ProviderRuntimeOverride {
  providerName?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ResolveApiKeyAuthOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  override?: ProviderRuntimeOverride;
}

export interface ResolvedApiKeyAuth {
  apiKey: string | null;
  state: ProviderAuthState;
  warnings: string[];
}

function isConfiguredSecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function createAuthState(source: ProviderAuthSource): ProviderAuthState {
  return {
    authenticated: source !== "missing",
    source,
    secretRedacted: true
  };
}

function defaultEnvVarName(providerName: string): string {
  return providerName === "openai" || providerName === "openai-compatible"
    ? "OPENAI_API_KEY"
    : `${providerName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

export function resolveApiKeyAuth(
  runtimeConfig: ResolvedSpriteRuntimeConfig,
  options: ResolveApiKeyAuthOptions = {}
): ResolvedApiKeyAuth {
  const providerName = options.override?.providerName ?? runtimeConfig.config.provider?.name;
  const warnings: string[] = [];

  if (providerName === undefined) {
    return {
      apiKey: null,
      state: createAuthState("missing"),
      warnings
    };
  }

  const authFile = loadApiKeyAuthFile(providerName, { homeDir: options.homeDir });

  if (authFile.warning !== null) {
    warnings.push(authFile.warning);
  }

  if (options.override?.apiKey !== undefined) {
    if (!isConfiguredSecret(options.override.apiKey)) {
      warnings.push("Ignoring empty runtime override API key.");
    } else {
      return {
        apiKey: options.override.apiKey,
        state: createAuthState("runtime-override"),
        warnings
      };
    }
  }

  if (authFile.apiKey !== null) {
    return {
      apiKey: authFile.apiKey,
      state: createAuthState("auth-file"),
      warnings
    };
  }

  const envVarName =
    runtimeConfig.config.provider?.apiKeyEnvVar ?? defaultEnvVarName(providerName);
  const environmentApiKey = options.env?.[envVarName] ?? process.env[envVarName];

  if (typeof environmentApiKey === "string" && environmentApiKey.length > 0) {
    return {
      apiKey: environmentApiKey,
      state: createAuthState("environment"),
      warnings
    };
  }

  if (isConfiguredSecret(runtimeConfig.config.provider?.apiKey)) {
    return {
      apiKey: runtimeConfig.config.provider.apiKey,
      state: createAuthState("provider-config"),
      warnings
    };
  }

  return {
    apiKey: null,
    state: createAuthState("missing"),
    warnings
  };
}
