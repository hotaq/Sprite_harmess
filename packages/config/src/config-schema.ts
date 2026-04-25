const OUTPUT_FORMATS = ["text", "json", "ndjson"] as const;
const SANDBOX_MODES = ["workspace-write", "read-only", "full-access"] as const;

export type SpriteOutputFormat = (typeof OUTPUT_FORMATS)[number];
export type SpriteSandboxMode = (typeof SANDBOX_MODES)[number];

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
}

export interface SpriteValidationCommand {
  args?: string[];
  command: string;
  cwd?: string;
  name?: string;
  timeoutMs?: number;
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
