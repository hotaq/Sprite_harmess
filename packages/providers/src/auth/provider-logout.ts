import type { ResolvedSpriteRuntimeConfig } from "@sprite/config";
import { redactSecretLikeValues } from "@sprite/shared";
import { removeProviderAuthFile } from "./auth-store.js";
import type { ResolveApiKeyAuthOptions } from "./api-key-auth.js";

export type ProviderLogoutAuthMode =
  | "api-key"
  | "oauth-authorization-code"
  | "subscription-oauth"
  | "unsupported";

export type ProviderLogoutStatus = "removed" | "not-found" | "failed";

export type ProviderLogoutCode =
  | "LOGOUT_REMOVED"
  | "LOGOUT_NOT_FOUND"
  | "LOGOUT_FAILED";

export type ProviderLogoutSource =
  | "auth-file"
  | "provider-auth-module"
  | "missing";

export interface ProviderLogoutResult {
  ok: boolean;
  providerName: string;
  authMode: ProviderLogoutAuthMode;
  status: ProviderLogoutStatus;
  source: ProviderLogoutSource;
  recoverable: boolean;
  nextAction: string;
  warnings: string[];
  code: ProviderLogoutCode;
}

export interface ProviderLogoutAuthModule {
  authMode: Exclude<ProviderLogoutAuthMode, "api-key" | "unsupported">;
  logout(): ProviderLogoutResult;
}

export interface RunProviderLogoutOptions extends ResolveApiKeyAuthOptions {
  authModules?: Record<string, ProviderLogoutAuthModule>;
  providerName?: string;
}

const API_KEY_PROVIDERS = new Set(["openai", "openai-compatible", "deepseek"]);

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

  return redactSecretLikeValues(redacted)
    .replace(/SECRET_[A-Z0-9_]+/g, "[REDACTED]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|token|api[_-]?key|code|secret)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function sanitizeProviderLogoutResult(
  result: ProviderLogoutResult,
  privateFragments: string[]
): ProviderLogoutResult {
  return {
    ...result,
    providerName: redactText(result.providerName, privateFragments),
    nextAction: redactText(result.nextAction, privateFragments),
    warnings: result.warnings.map((warning) => redactText(warning, privateFragments))
  };
}

function createRemovedLogoutResult(
  providerName: string,
  privateFragments: string[]
): ProviderLogoutResult {
  return sanitizeProviderLogoutResult(
    {
      ok: true,
      providerName,
      authMode: "api-key",
      status: "removed",
      source: "auth-file",
      recoverable: false,
      code: "LOGOUT_REMOVED",
      nextAction:
        "Stored provider credentials were removed. Environment variables and provider config were not changed.",
      warnings: []
    },
    privateFragments
  );
}

function createNotFoundLogoutResult(
  providerName: string,
  privateFragments: string[]
): ProviderLogoutResult {
  return sanitizeProviderLogoutResult(
    {
      ok: true,
      providerName,
      authMode: "api-key",
      status: "not-found",
      source: "missing",
      recoverable: false,
      code: "LOGOUT_NOT_FOUND",
      nextAction:
        "No stored provider credentials were found. Environment variables and provider config were not changed.",
      warnings: []
    },
    privateFragments
  );
}

function createFailedLogoutResult(
  providerName: string,
  warning: string,
  privateFragments: string[]
): ProviderLogoutResult {
  return sanitizeProviderLogoutResult(
    {
      ok: false,
      providerName,
      authMode: "api-key",
      status: "failed",
      source: "auth-file",
      recoverable: true,
      code: "LOGOUT_FAILED",
      nextAction: "Inspect local auth storage permissions and retry provider logout.",
      warnings: [warning]
    },
    privateFragments
  );
}

function createUnsupportedLogoutResult(
  providerName: string,
  privateFragments: string[]
): ProviderLogoutResult {
  return sanitizeProviderLogoutResult(
    {
      ok: true,
      providerName,
      authMode: "unsupported",
      status: "not-found",
      source: "missing",
      recoverable: false,
      code: "LOGOUT_NOT_FOUND",
      nextAction:
        "No stored provider credentials were found. Add a provider auth module to support provider-specific logout.",
      warnings: []
    },
    privateFragments
  );
}

export function runProviderLogout(
  runtimeConfig: ResolvedSpriteRuntimeConfig,
  options: RunProviderLogoutOptions = {}
): ProviderLogoutResult {
  const providerName = normalizeProviderName(
    options.providerName ?? options.override?.providerName ?? runtimeConfig.config.provider?.name
  );
  const privateFragments = [options.homeDir ?? ""];
  const authModule = options.authModules?.[providerName];

  if (authModule !== undefined) {
    try {
      return sanitizeProviderLogoutResult(authModule.logout(), privateFragments);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return sanitizeProviderLogoutResult(
        {
          ok: false,
          providerName,
          authMode: authModule.authMode,
          status: "failed",
          source: "provider-auth-module",
          recoverable: true,
          code: "LOGOUT_FAILED",
          nextAction: "Retry provider logout or inspect provider auth configuration.",
          warnings: [message]
        },
        privateFragments
      );
    }
  }

  if (!API_KEY_PROVIDERS.has(providerName)) {
    return createUnsupportedLogoutResult(providerName, privateFragments);
  }

  const removal = removeProviderAuthFile(providerName, {
    homeDir: options.homeDir
  });

  if (removal.warning !== null) {
    return createFailedLogoutResult(providerName, removal.warning, [
      ...privateFragments,
      removal.path
    ]);
  }

  if (removal.removed) {
    return createRemovedLogoutResult(providerName, [...privateFragments, removal.path]);
  }

  return createNotFoundLogoutResult(providerName, [...privateFragments, removal.path]);
}
