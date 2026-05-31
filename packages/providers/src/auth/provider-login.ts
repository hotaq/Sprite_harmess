import type { ResolvedSpriteRuntimeConfig } from "@sprite/config";
import { resolveApiKeyAuth, type ResolveApiKeyAuthOptions } from "./api-key-auth.js";
import type { ProviderAuthSource } from "../provider-capabilities.js";

export type ProviderLoginAuthMode =
  | "api-key"
  | "oauth-authorization-code"
  | "subscription-oauth"
  | "unsupported";

export type ProviderLoginStatus = "started" | "unsupported" | "failed";

export type ProviderLoginCode =
  | "LOGIN_UNSUPPORTED"
  | "LOGIN_FAILED"
  | "INVALID_PROVIDER";

export interface ProviderLoginResult {
  ok: boolean;
  providerName: string;
  authMode: ProviderLoginAuthMode;
  status: ProviderLoginStatus;
  source: ProviderAuthSource | "interactive-login" | "provider-auth-module";
  recoverable: boolean;
  nextAction: string;
  warnings: string[];
  code?: ProviderLoginCode;
}

export interface ProviderLoginAuthModule {
  authMode: Exclude<ProviderLoginAuthMode, "api-key" | "unsupported">;
  login(): ProviderLoginResult;
}

export interface RunProviderLoginOptions extends ResolveApiKeyAuthOptions {
  authModules?: Record<string, ProviderLoginAuthModule>;
  providerName?: string;
}

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "openai",
  "openai-compatible",
  "deepseek"
]);

function normalizeProviderName(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0
    ? "openai-compatible"
    : trimmed;
}

function redactText(value: string, privateFragments: string[]): string {
  let redacted = value;

  for (const fragment of privateFragments) {
    if (fragment.length > 0) {
      redacted = redacted.split(fragment).join("[REDACTED]");
    }
  }

  return redacted
    .replace(/SECRET_[A-Z0-9_]+/g, "[REDACTED]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|token|api[_-]?key|code|secret)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function sanitizeProviderLoginResult(
  result: ProviderLoginResult,
  privateFragments: string[]
): ProviderLoginResult {
  return {
    ...result,
    nextAction: redactText(result.nextAction, privateFragments),
    warnings: result.warnings.map((warning) => redactText(warning, privateFragments))
  };
}

function createUnsupportedApiKeyLoginResult(
  providerName: string,
  source: ProviderAuthSource,
  warnings: string[],
  privateFragments: string[]
): ProviderLoginResult {
  return sanitizeProviderLoginResult(
    {
      ok: false,
      providerName,
      authMode: "api-key",
      status: "unsupported",
      source,
      recoverable: true,
      code: "LOGIN_UNSUPPORTED",
      nextAction:
        "Interactive login is not supported for API-key providers. Configure an API key with the provider auth file, environment variable, or project provider config.",
      warnings
    },
    privateFragments
  );
}

function createInvalidProviderLoginResult(providerName: string): ProviderLoginResult {
  return {
    ok: false,
    providerName,
    authMode: "unsupported",
    status: "failed",
    source: "missing",
    recoverable: true,
    code: "INVALID_PROVIDER",
    nextAction:
      "Configure a supported provider or add a provider auth module for interactive login.",
    warnings: [`No provider login handler is registered for ${providerName}.`]
  };
}

export function runProviderLogin(
  runtimeConfig: ResolvedSpriteRuntimeConfig,
  options: RunProviderLoginOptions = {}
): ProviderLoginResult {
  const providerName = normalizeProviderName(
    options.providerName ?? options.override?.providerName ?? runtimeConfig.config.provider?.name
  );
  const privateFragments = [options.homeDir ?? ""];
  const authModule = options.authModules?.[providerName];

  if (authModule !== undefined) {
    try {
      return sanitizeProviderLoginResult(authModule.login(), privateFragments);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return sanitizeProviderLoginResult(
        {
          ok: false,
          providerName,
          authMode: authModule.authMode,
          status: "failed",
          source: "provider-auth-module",
          recoverable: true,
          code: "LOGIN_FAILED",
          nextAction: "Retry provider login or inspect provider auth configuration.",
          warnings: [message]
        },
        privateFragments
      );
    }
  }

  if (OPENAI_COMPATIBLE_PROVIDERS.has(providerName)) {
    const auth = resolveApiKeyAuth(runtimeConfig, {
      env: options.env,
      homeDir: options.homeDir,
      override: {
        ...options.override,
        providerName
      }
    });

    return createUnsupportedApiKeyLoginResult(
      providerName,
      auth.state.source,
      auth.warnings,
      privateFragments
    );
  }

  return sanitizeProviderLoginResult(
    createInvalidProviderLoginResult(providerName),
    privateFragments
  );
}
