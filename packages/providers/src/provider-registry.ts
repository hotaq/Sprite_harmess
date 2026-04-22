import type { ResolvedSpriteRuntimeConfig } from "@sprite/config";
import {
  createOpenAiCompatibleProviderAdapter,
  type OpenAiCompatibleProviderOptions
} from "./openai-compatible-provider.js";
import type { ProviderAdapter } from "./provider-capabilities.js";
import type { ProviderRuntimeOverride } from "./auth/api-key-auth.js";

export interface ProviderInitializationOptions extends OpenAiCompatibleProviderOptions {
  override?: ProviderRuntimeOverride;
}

export interface ProviderInitializationResult {
  adapter: ProviderAdapter | null;
  warnings: string[];
}

const OPENAI_COMPATIBLE_PROVIDER_NAMES = new Set([
  "openai",
  "openai-compatible"
]);

export function initializeProviderAdapter(
  runtimeConfig: ResolvedSpriteRuntimeConfig,
  options: ProviderInitializationOptions = {}
): ProviderInitializationResult {
  const providerName =
    options.override?.providerName ?? runtimeConfig.config.provider?.name;

  if (providerName === undefined) {
    return {
      adapter: null,
      warnings: []
    };
  }

  if (OPENAI_COMPATIBLE_PROVIDER_NAMES.has(providerName)) {
    return createOpenAiCompatibleProviderAdapter(runtimeConfig, options);
  }

  return {
    adapter: null,
    warnings: [
      `Unsupported provider '${providerName}'. MVP currently supports OpenAI-compatible providers only.`
    ]
  };
}
