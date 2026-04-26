export const SECRET_REDACTION_MARKER = "[REDACTED]";

const SECRET_LIKE_PATTERNS = [
  /\b[A-Z0-9_]*(API|TOKEN|SECRET|KEY)[A-Z0-9_]*\s*=/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{6,}/
] as const;

const SECRET_REDACTION_PATTERNS = [
  /\b[A-Z0-9_]*(API|TOKEN|SECRET|KEY)[A-Z0-9_]*\s*=\s*[^\s"'`]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /\bsk-[A-Za-z0-9_-]{6,}/g
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
