const OUTPUT_FORMATS = ["text", "json", "ndjson"] as const;
const SANDBOX_MODES = ["workspace-write", "read-only", "full-access"] as const;

export type SpriteOutputFormat = (typeof OUTPUT_FORMATS)[number];
export type SpriteSandboxMode = (typeof SANDBOX_MODES)[number];

export interface SpriteConfig {
  provider?: {
    name?: string;
    model?: string;
  };
  output?: {
    format?: SpriteOutputFormat;
  };
  sandbox?: {
    mode?: SpriteSandboxMode;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  value: unknown,
  path: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
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
    throw new Error(
      `${path} must be one of: ${allowedValues.join(", ")}.`
    );
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

  if (providerValue !== undefined && !isRecord(providerValue)) {
    throw new Error(`${source}.provider must be an object.`);
  }

  if (outputValue !== undefined && !isRecord(outputValue)) {
    throw new Error(`${source}.output must be an object.`);
  }

  if (sandboxValue !== undefined && !isRecord(sandboxValue)) {
    throw new Error(`${source}.sandbox must be an object.`);
  }

  return {
    provider:
      providerValue === undefined
        ? undefined
        : {
            name: readOptionalString(providerValue.name, `${source}.provider.name`),
            model: readOptionalString(
              providerValue.model,
              `${source}.provider.model`
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
          }
  };
}
