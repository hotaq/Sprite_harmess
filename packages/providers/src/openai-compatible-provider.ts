import type { ResolvedSpriteRuntimeConfig } from "@sprite/config";
import {
  resolveApiKeyAuth,
  type ProviderRuntimeOverride,
  type ResolveApiKeyAuthOptions
} from "./auth/api-key-auth.js";
import {
  type ProviderAdapter,
  type ProviderCapabilities,
  type ResolvedProviderState
} from "./provider-capabilities.js";

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";

export interface OpenAiCompatibleProviderOptions extends ResolveApiKeyAuthOptions {
  override?: ProviderRuntimeOverride;
}

export interface OpenAiCompatibleProviderResult {
  adapter: OpenAiCompatibleProviderAdapter;
  warnings: string[];
}

function createOpenAiCompatibleCapabilities(model: string | null): ProviderCapabilities {
  return {
    supportsStreaming: true,
    supportsToolCalls: true,
    contextWindowTokens: null,
    modelIdentity: model
  };
}

export class OpenAiCompatibleProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly state: ResolvedProviderState,
    private readonly apiKey: string | null
  ) {}

  getState(): ResolvedProviderState {
    return this.state;
  }

  createRequestHeaders(): Record<string, string> {
    if (this.apiKey === null) {
      return {};
    }

    return {
      authorization: `Bearer ${this.apiKey}`
    };
  }
}

export function createOpenAiCompatibleProviderAdapter(
  runtimeConfig: ResolvedSpriteRuntimeConfig,
  options: OpenAiCompatibleProviderOptions = {}
): OpenAiCompatibleProviderResult {
  const providerName =
    options.override?.providerName ??
    runtimeConfig.config.provider?.name ??
    "openai-compatible";
  const model = options.override?.model ?? runtimeConfig.config.provider?.model ?? null;
  const baseUrl =
    options.override?.baseUrl ??
    runtimeConfig.config.provider?.baseUrl ??
    DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const auth = resolveApiKeyAuth(runtimeConfig, options);

  return {
    adapter: new OpenAiCompatibleProviderAdapter(
      {
        providerName,
        model,
        baseUrl,
        auth: auth.state,
        capabilities: createOpenAiCompatibleCapabilities(model)
      },
      auth.apiKey
    ),
    warnings: auth.warnings
  };
}
