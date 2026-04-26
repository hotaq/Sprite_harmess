export const SECRET_REDACTION_MARKER = "[REDACTED]";

export const SECRET_ASSIGNMENT_PATTERN_SOURCE =
  "\\b[A-Z0-9_]*(API|TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Z0-9_]*\\s*=\\s*[^\\s]+";
export const PRIVATE_KEY_PATTERN_SOURCE =
  "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----";
export const OPENAI_TOKEN_PATTERN_SOURCE = "\\bsk-[A-Za-z0-9_-]{6,}";
export const PROVIDER_API_KEY_NAME_PATTERN_SOURCE =
  "\\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|AZURE_OPENAI|OPENROUTER|MISTRAL|COHERE|GROQ|XAI)_(?:API_)?KEY\\b";

const SECRET_LIKE_PATTERNS = [
  new RegExp(SECRET_ASSIGNMENT_PATTERN_SOURCE, "i"),
  new RegExp(PRIVATE_KEY_PATTERN_SOURCE, "i"),
  new RegExp(OPENAI_TOKEN_PATTERN_SOURCE),
  new RegExp(PROVIDER_API_KEY_NAME_PATTERN_SOURCE, "i")
] as const;

const SECRET_REDACTION_PATTERNS = [
  new RegExp(SECRET_ASSIGNMENT_PATTERN_SOURCE, "gi"),
  new RegExp(PRIVATE_KEY_PATTERN_SOURCE, "gi"),
  new RegExp(OPENAI_TOKEN_PATTERN_SOURCE, "g"),
  new RegExp(PROVIDER_API_KEY_NAME_PATTERN_SOURCE, "gi")
] as const;

export function containsSecretLikeValue(value: string): boolean {
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

export function redactSecretLikeValues(
  value: string,
  marker = SECRET_REDACTION_MARKER
): string {
  return SECRET_REDACTION_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, marker),
    value
  );
}

export function createRedactedPreview(value: string, maxLength = 160): string {
  const redacted = redactSecretLikeValues(value).replace(/\s+/g, " ").trim();

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
