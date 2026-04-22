export type ProviderAuthSource =
  | "runtime-override"
  | "auth-file"
  | "environment"
  | "provider-config"
  | "missing";

export interface ProviderAuthState {
  authenticated: boolean;
  source: ProviderAuthSource;
  secretRedacted: true;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  contextWindowTokens: number | null;
  modelIdentity: string | null;
}

export interface ResolvedProviderState {
  providerName: string;
  model: string | null;
  baseUrl: string | null;
  auth: ProviderAuthState;
  capabilities: ProviderCapabilities;
}

export interface ProviderAdapter {
  getState(): ResolvedProviderState;
  createRequestHeaders(): Record<string, string>;
}
