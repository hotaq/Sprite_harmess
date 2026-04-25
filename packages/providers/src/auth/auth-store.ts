import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AuthStoreOptions {
  homeDir?: string;
}

export interface LoadedApiKeyAuthFile {
  apiKey: string | null;
  path: string;
  loaded: boolean;
  warning: string | null;
}

export function normalizeProviderAuthFileName(providerName: string): string {
  const normalizedName = providerName.toLowerCase();

  if (normalizedName === "openai") {
    return "openai-compatible";
  }

  return normalizedName.replace(/[^a-z0-9]+/g, "-");
}

function formatAuthStoreError(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to load auth file ${path}: ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveProviderAuthFilePath(
  providerName: string,
  options: AuthStoreOptions = {}
): string {
  const homeDir = options.homeDir ?? homedir();
  return resolve(
    homeDir,
    ".sprite/auth",
    `${normalizeProviderAuthFileName(providerName)}.json`
  );
}

export function loadApiKeyAuthFile(
  providerName: string,
  options: AuthStoreOptions = {}
): LoadedApiKeyAuthFile {
  const path = resolveProviderAuthFilePath(providerName, options);

  if (!existsSync(path)) {
    return {
      apiKey: null,
      path,
      loaded: false,
      warning: null
    };
  }

  try {
    const rawValue = JSON.parse(readFileSync(path, "utf8")) as unknown;

    if (!isRecord(rawValue)) {
      throw new Error("auth file must contain a JSON object.");
    }

    if (typeof rawValue.apiKey !== "string") {
      throw new Error("auth file apiKey must be a string.");
    }

    if (rawValue.apiKey.length === 0) {
      throw new Error("auth file apiKey must not be empty.");
    }

    return {
      apiKey: rawValue.apiKey,
      path,
      loaded: true,
      warning: null
    };
  } catch (error: unknown) {
    return {
      apiKey: null,
      path,
      loaded: false,
      warning: formatAuthStoreError(path, error)
    };
  }
}
