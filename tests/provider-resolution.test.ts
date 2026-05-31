import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSpriteRuntimeConfig } from "@sprite/config";
import { initializeProviderAdapter, runProviderLogin } from "@sprite/providers";

const tempRoots: string[] = [];

function createTempWorkspace(): { homeDir: string; projectDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-provider-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  tempRoots.push(rootDir);

  return { homeDir, projectDir };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("initializeProviderAdapter", () => {
  it("uses provider config credentials when no stronger source exists", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4",
        apiKey: "sk-provider-config"
      }
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });
    const result = initializeProviderAdapter(runtimeConfig, { homeDir, env: {} });
    const state = result.adapter?.getState();

    expect(state?.providerName).toBe("openai-compatible");
    expect(state?.model).toBe("gpt-5.4");
    expect(state?.auth.source).toBe("provider-config");
    expect(state?.auth.authenticated).toBe(true);
    expect(state?.auth.secretRedacted).toBe(true);
    expect(JSON.stringify(state)).not.toContain("sk-provider-config");
  });

  it("resolves credentials in override, auth file, env, config precedence order", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4",
        apiKey: "sk-provider-config"
      }
    });
    writeJson(join(homeDir, ".sprite/auth/openai-compatible.json"), {
      apiKey: "sk-auth-file"
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });

    const envResult = initializeProviderAdapter(runtimeConfig, {
      homeDir,
      env: { OPENAI_API_KEY: "sk-env" }
    });
    expect(envResult.adapter?.getState().auth.source).toBe("auth-file");

    const overrideResult = initializeProviderAdapter(runtimeConfig, {
      homeDir,
      env: { OPENAI_API_KEY: "sk-env" },
      override: { apiKey: "sk-override" }
    });
    expect(overrideResult.adapter?.getState().auth.source).toBe("runtime-override");
  });

  it("uses the canonical auth file name for openai-compatible aliases", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai",
        model: "gpt-5.4"
      }
    });
    writeJson(join(homeDir, ".sprite/auth/openai-compatible.json"), {
      apiKey: "sk-auth-file"
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });
    const result = initializeProviderAdapter(runtimeConfig, { homeDir, env: {} });

    expect(result.adapter?.getState().auth.source).toBe("auth-file");
  });

  it("falls back from malformed auth file to environment credentials and warns safely", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4"
      }
    });
    mkdirSync(join(homeDir, ".sprite/auth"), { recursive: true });
    writeFileSync(join(homeDir, ".sprite/auth/openai-compatible.json"), '{"apiKey":');

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });
    const result = initializeProviderAdapter(runtimeConfig, {
      homeDir,
      env: { OPENAI_API_KEY: "sk-env" }
    });
    const state = result.adapter?.getState();

    expect(state?.auth.source).toBe("environment");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Failed to load auth file");
    expect(result.warnings[0]).not.toContain("sk-env");
  });

  it("treats blank high-priority credentials as missing and falls through to lower-priority sources", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4",
        apiKey: "sk-provider-config"
      }
    });
    writeJson(join(homeDir, ".sprite/auth/openai-compatible.json"), {
      apiKey: ""
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });

    const envResult = initializeProviderAdapter(runtimeConfig, {
      homeDir,
      env: { OPENAI_API_KEY: "sk-env" }
    });
    expect(envResult.adapter?.getState().auth.source).toBe("environment");
    expect(envResult.warnings).toHaveLength(1);

    const overrideBlankResult = initializeProviderAdapter(runtimeConfig, {
      homeDir,
      env: {},
      override: { apiKey: "" }
    });
    expect(overrideBlankResult.adapter?.getState().auth.source).toBe("provider-config");
  });

  it("exposes capability metadata for a valid openai-compatible provider", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "gpt-5.4",
        baseUrl: "https://example.test/v1"
      }
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({
      cwd: projectDir,
      homeDir
    });
    const result = initializeProviderAdapter(runtimeConfig, { homeDir, env: {} });
    const state = result.adapter?.getState();

    expect(state?.providerName).toBe("openai-compatible");
    expect(state?.baseUrl).toBe("https://example.test/v1");
    expect(state?.capabilities.supportsStreaming).toBe(true);
    expect(state?.capabilities.supportsToolCalls).toBe(true);
    expect(state?.capabilities.modelIdentity).toBe("gpt-5.4");
  });
});

describe("runProviderLogin", () => {
  it("returns safe unsupported-login guidance for API-key-only providers", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "openai-compatible",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.example/v1?token=SECRET_TOKEN_81",
        apiKey: "SECRET_API_KEY_81"
      }
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({ cwd: projectDir, homeDir });
    const result = runProviderLogin(runtimeConfig, {
      env: { OPENAI_API_KEY: "SECRET_ENV_KEY_81" },
      homeDir
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      providerName: "openai-compatible",
      authMode: "api-key",
      status: "unsupported",
      code: "LOGIN_UNSUPPORTED",
      recoverable: true,
      source: "environment"
    });
    expect(result.nextAction).toContain("API key");
    expect(result.warnings).toEqual([]);
    expect(serialized).not.toContain("SECRET_API_KEY_81");
    expect(serialized).not.toContain("SECRET_ENV_KEY_81");
    expect(serialized).not.toContain("SECRET_TOKEN_81");
    expect(serialized).not.toContain(homeDir);
  });

  it("redacts secret-looking provider names and provider-name warnings", () => {
    const { homeDir, projectDir } = createTempWorkspace();
    const runtimeConfig = resolveSpriteRuntimeConfig({ cwd: projectDir, homeDir });
    const secretProviderName = `${homeDir}/sk-reviewsecret123456`;

    const result = runProviderLogin(runtimeConfig, {
      providerName: secretProviderName,
      homeDir
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: false,
      authMode: "unsupported",
      status: "failed",
      code: "INVALID_PROVIDER",
      recoverable: true
    });
    expect(serialized).not.toContain(homeDir);
    expect(serialized).not.toContain("sk-reviewsecret123456");
    expect(result.providerName).toBe("[REDACTED]/[REDACTED]");
    expect(result.warnings.join("\n")).toContain("[REDACTED]");
  });

  it("delegates supported OAuth login through a provider auth module", () => {
    const { homeDir, projectDir } = createTempWorkspace();

    writeJson(join(projectDir, ".sprite/config.json"), {
      provider: {
        name: "test-oauth",
        model: "oauth-model"
      }
    });

    const runtimeConfig = resolveSpriteRuntimeConfig({ cwd: projectDir, homeDir });
    const result = runProviderLogin(runtimeConfig, {
      authModules: {
        "test-oauth": {
          authMode: "oauth-authorization-code",
          login() {
            return {
              ok: true,
              providerName: "test-oauth",
              authMode: "oauth-authorization-code",
              status: "started",
              source: "interactive-login",
              recoverable: true,
              nextAction: "Open the provider authorization URL.",
              warnings: ["callback secret SECRET_CALLBACK_81 was redacted"]
            };
          }
        }
      },
      homeDir
    });
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      ok: true,
      providerName: "test-oauth",
      authMode: "oauth-authorization-code",
      status: "started",
      source: "interactive-login",
      recoverable: true
    });
    expect(serialized).not.toContain("SECRET_CALLBACK_81");
  });
});
