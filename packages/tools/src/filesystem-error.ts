import { SpriteError } from "@sprite/shared";

export function createFilesystemSpriteError(
  code: string,
  message: string,
  error: unknown
): SpriteError {
  const reason = filesystemErrorCode(error);

  return new SpriteError(
    code,
    reason === null ? `${message}.` : `${message} (${reason}).`
  );
}

export function isMissingFilesystemError(error: unknown): boolean {
  const code = filesystemErrorCode(error);

  return code === "ENOENT" || code === "ENOTDIR";
}

function filesystemErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim().length > 0
  ) {
    return error.code;
  }

  return null;
}
