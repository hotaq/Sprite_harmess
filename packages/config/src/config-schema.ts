import { containsSecretLikeValue } from "@sprite/shared";

const OUTPUT_FORMATS = ["text", "json", "ndjson"] as const;
const SANDBOX_MODES = ["workspace-write", "read-only", "full-access"] as const;
export const SAFETY_RULE_ACTIONS = ["block", "redact"] as const;
export const SAFETY_RULE_TARGETS = [
  "tool_output",
  "file_content",
  "command_output",
  "learning_material",
  "memory_candidate"
] as const;

const MAX_SAFETY_RULES = 50;
const MAX_SAFETY_RULE_FIELD_LENGTH = 500;

export const DEFAULT_SAFETY_RULES = [
  {
    action: "block",
    id: "safety.secret.assignment",
    pattern:
      "\\b[A-Z0-9_]*(API|TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Z0-9_]*\\s*=\\s*[^\\s]+",
    reason: "Secret-like credential assignments must not be saved to memory.",
    targets: SAFETY_RULE_TARGETS
  },
  {
    action: "block",
    id: "safety.private_key.block",
    pattern:
      "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
    reason: "Private key material must not be saved to memory.",
    targets: SAFETY_RULE_TARGETS
  },
  {
    action: "block",
    id: "safety.openai_token.block",
    pattern: "\\bsk-[A-Za-z0-9_-]{6,}",
    reason: "Provider tokens must not be saved to memory.",
    targets: SAFETY_RULE_TARGETS
  },
  {
    action: "block",
    id: "safety.provider_key_name.block",
    pattern:
      "\\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|AZURE_OPENAI|OPENROUTER|MISTRAL|COHERE|GROQ|XAI)_(?:API_)?KEY\\b",
    reason: "Provider API key variable names must not become durable memory.",
    targets: SAFETY_RULE_TARGETS
  },
  {
    action: "block",
    id: "safety.env_path.block",
    pathPattern: "(^|/)\\.env($|[./_-])|(^|/)\\.env\\.",
    reason: ".env-style files must not be saved to memory.",
    targets: SAFETY_RULE_TARGETS
  },
  {
    action: "block",
    id: "safety.private_key_path.block",
    pathPattern:
      "(^|/)(id_rsa|id_ed25519|id_ecdsa)$|\\.(?:pem|key|p12|pfx|crt|cer)$",
    reason: "Private key and certificate paths must not be saved to memory.",
    targets: SAFETY_RULE_TARGETS
  }
] as const satisfies readonly SpriteSafetyRule[];

export type SpriteOutputFormat = (typeof OUTPUT_FORMATS)[number];
export type SpriteSandboxMode = (typeof SANDBOX_MODES)[number];
export type SpriteSafetyRuleAction = (typeof SAFETY_RULE_ACTIONS)[number];
export type SpriteSafetyRuleTarget = (typeof SAFETY_RULE_TARGETS)[number];

export interface SpriteConfig {
  provider?: {
    name?: string;
    model?: string;
    baseUrl?: string;
    apiKeyEnvVar?: string;
    apiKey?: string;
  };
  output?: {
    format?: SpriteOutputFormat;
  };
  sandbox?: {
    mode?: SpriteSandboxMode;
  };
  validation?: {
    commands?: SpriteValidationCommand[];
  };
  safety?: {
    rules?: SpriteSafetyRule[];
  };
}

export interface SpriteValidationCommand {
  args?: string[];
  command: string;
  cwd?: string;
  name?: string;
  timeoutMs?: number;
}

export interface SpriteSafetyRule {
  action: SpriteSafetyRuleAction;
  id: string;
  pattern?: string;
  pathPattern?: string;
  reason: string;
  targets: readonly SpriteSafetyRuleTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }

  return value;
}

function readRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalStringArray(
  value: unknown,
  path: string
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} must be an array of strings.`);
  }

  return value;
}

function readOptionalPositiveInteger(
  value: unknown,
  path: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer.`);
  }

  return value;
}

function readOptionalEnum<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  path: string
): T[number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${path} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value as T[number];
}

function readRequiredEnumArray<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  path: string
): T[number][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !allowedValues.includes(item)) {
      throw new Error(
        `${path}[${String(index)}] must be one of: ${allowedValues.join(", ")}.`
      );
    }

    return item as T[number];
  });
}

export function parseSpriteConfig(
  value: unknown,
  source = "config"
): SpriteConfig {
  if (!isRecord(value)) {
    throw new Error(`${source} must contain a JSON object.`);
  }

  const providerValue = value.provider;
  const outputValue = value.output;
  const sandboxValue = value.sandbox;
  const validationValue = value.validation;
  const safetyValue = value.safety;

  if (providerValue !== undefined && !isRecord(providerValue)) {
    throw new Error(`${source}.provider must be an object.`);
  }

  if (outputValue !== undefined && !isRecord(outputValue)) {
    throw new Error(`${source}.output must be an object.`);
  }

  if (sandboxValue !== undefined && !isRecord(sandboxValue)) {
    throw new Error(`${source}.sandbox must be an object.`);
  }

  if (validationValue !== undefined && !isRecord(validationValue)) {
    throw new Error(`${source}.validation must be an object.`);
  }

  if (safetyValue !== undefined && !isRecord(safetyValue)) {
    throw new Error(`${source}.safety must be an object.`);
  }

  return {
    provider:
      providerValue === undefined
        ? undefined
        : {
            name: readOptionalString(
              providerValue.name,
              `${source}.provider.name`
            ),
            model: readOptionalString(
              providerValue.model,
              `${source}.provider.model`
            ),
            baseUrl: readOptionalString(
              providerValue.baseUrl,
              `${source}.provider.baseUrl`
            ),
            apiKeyEnvVar: readOptionalString(
              providerValue.apiKeyEnvVar,
              `${source}.provider.apiKeyEnvVar`
            ),
            apiKey: readOptionalString(
              providerValue.apiKey,
              `${source}.provider.apiKey`
            )
          },
    output:
      outputValue === undefined
        ? undefined
        : {
            format: readOptionalEnum(
              outputValue.format,
              OUTPUT_FORMATS,
              `${source}.output.format`
            )
          },
    sandbox:
      sandboxValue === undefined
        ? undefined
        : {
            mode: readOptionalEnum(
              sandboxValue.mode,
              SANDBOX_MODES,
              `${source}.sandbox.mode`
            )
          },
    validation:
      validationValue === undefined
        ? undefined
        : {
            commands: readOptionalValidationCommands(
              validationValue.commands,
              `${source}.validation.commands`
            )
          },
    safety:
      safetyValue === undefined
        ? undefined
        : {
            rules: readOptionalSafetyRules(
              safetyValue.rules,
              `${source}.safety.rules`
            )
          }
  };
}

function readOptionalValidationCommands(
  value: unknown,
  path: string
): SpriteValidationCommand[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  return value.map((item, index) => {
    const itemPath = `${path}[${String(index)}]`;

    if (!isRecord(item)) {
      throw new Error(`${itemPath} must be an object.`);
    }

    return {
      ...(item.args === undefined
        ? {}
        : { args: readOptionalStringArray(item.args, `${itemPath}.args`) }),
      command: readRequiredString(item.command, `${itemPath}.command`),
      ...(item.cwd === undefined
        ? {}
        : { cwd: readRequiredString(item.cwd, `${itemPath}.cwd`) }),
      ...(item.name === undefined
        ? {}
        : { name: readRequiredString(item.name, `${itemPath}.name`) }),
      ...(item.timeoutMs === undefined
        ? {}
        : {
            timeoutMs: readOptionalPositiveInteger(
              item.timeoutMs,
              `${itemPath}.timeoutMs`
            )
          })
    };
  });
}

function readOptionalSafetyRules(
  value: unknown,
  path: string
): SpriteSafetyRule[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  if (value.length > MAX_SAFETY_RULES) {
    throw new Error(`${path} must contain at most ${MAX_SAFETY_RULES} rules.`);
  }

  return value.map((item, index) => {
    const itemPath = `${path}[${String(index)}]`;

    if (!isRecord(item)) {
      throw new Error(`${itemPath} must be an object.`);
    }

    const id = readSafetyMetadataString(item.id, `${itemPath}.id`);
    const action = readOptionalEnum(
      item.action,
      SAFETY_RULE_ACTIONS,
      `${itemPath}.action`
    );
    const pattern =
      item.pattern === undefined
        ? undefined
        : readSafetyPattern(item.pattern, `${itemPath}.pattern`);
    const pathPattern =
      item.pathPattern === undefined
        ? undefined
        : readSafetyPattern(item.pathPattern, `${itemPath}.pathPattern`);
    const reason = readSafetyMetadataString(item.reason, `${itemPath}.reason`);
    const targets = readRequiredEnumArray(
      item.targets,
      SAFETY_RULE_TARGETS,
      `${itemPath}.targets`
    );

    if (action === undefined) {
      throw new Error(
        `${itemPath}.action must be one of: ${SAFETY_RULE_ACTIONS.join(", ")}.`
      );
    }

    if (pattern === undefined && pathPattern === undefined) {
      throw new Error(
        `${itemPath} must include at least one of pattern or pathPattern.`
      );
    }

    return {
      action,
      id,
      ...(pattern === undefined ? {} : { pattern }),
      ...(pathPattern === undefined ? {} : { pathPattern }),
      reason,
      targets
    };
  });
}

function readSafetyMetadataString(value: unknown, path: string): string {
  const metadata = readRequiredString(value, path);

  if (metadata.length > MAX_SAFETY_RULE_FIELD_LENGTH) {
    throw new Error(
      `${path} must be at most ${MAX_SAFETY_RULE_FIELD_LENGTH} characters.`
    );
  }

  if (containsSecretLikeValue(metadata)) {
    throw new Error(`${path} must not include secret-looking values.`);
  }

  return metadata;
}

function readSafetyPattern(value: unknown, path: string): string {
  const pattern = readSafetyMetadataString(value, path);

  try {
    new RegExp(pattern);
  } catch {
    throw new Error(`${path} must be a valid regular expression.`);
  }

  return pattern;
}

export function cloneSafetyRules(
  rules: readonly SpriteSafetyRule[]
): SpriteSafetyRule[] {
  return rules.map((rule) => ({
    action: rule.action,
    id: rule.id,
    ...(rule.pattern === undefined ? {} : { pattern: rule.pattern }),
    ...(rule.pathPattern === undefined
      ? {}
      : { pathPattern: rule.pathPattern }),
    reason: rule.reason,
    targets: [...rule.targets]
  }));
}

export function createEffectiveSafetyRules(
  configuredRules: readonly SpriteSafetyRule[] = []
): SpriteSafetyRule[] {
  return mergeSafetyRuleLists(DEFAULT_SAFETY_RULES, configuredRules);
}

export function mergeSafetyRuleLists(
  baseRules: readonly SpriteSafetyRule[] = [],
  overrideRules: readonly SpriteSafetyRule[] = []
): SpriteSafetyRule[] {
  const merged = new Map<string, SpriteSafetyRule>();

  for (const rule of baseRules) {
    merged.set(rule.id, cloneSafetyRules([rule])[0]);
  }

  for (const rule of overrideRules) {
    merged.set(rule.id, cloneSafetyRules([rule])[0]);
  }

  return Array.from(merged.values());
}
