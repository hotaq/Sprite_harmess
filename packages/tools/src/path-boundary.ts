import { SpriteError, err, type Result } from "@sprite/shared";
import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  createFilesystemSpriteError,
  isMissingFilesystemError
} from "./filesystem-error.js";

export interface ResolvedProjectPath {
  absolutePath: string;
  exists: boolean;
  projectRoot: string;
  relativePath: string;
  realPath: string | null;
  symbolicLink: boolean;
}

export async function resolveProjectPath(
  cwd: string,
  requestedPath = "."
): Promise<Result<ResolvedProjectPath, SpriteError>> {
  const projectRoot = await resolveProjectRoot(cwd);

  if (!projectRoot.ok) {
    return projectRoot;
  }

  const absolutePath = path.resolve(projectRoot.value, requestedPath);

  if (!isInsidePath(projectRoot.value, absolutePath)) {
    return outsideProjectError();
  }

  const stat = await safeLstat(absolutePath);

  if (!stat.ok) {
    return err(stat.error);
  }

  if (stat.value === null) {
    const parent = await nearestExistingParent(absolutePath, projectRoot.value);

    if (!parent.ok) {
      return parent;
    }

    return {
      ok: true,
      value: {
        absolutePath,
        exists: false,
        projectRoot: projectRoot.value,
        relativePath: toProjectRelativePath(projectRoot.value, absolutePath),
        realPath: null,
        symbolicLink: false
      }
    };
  }

  const finalRealPath = await safeRealpath(absolutePath);

  if (!finalRealPath.ok) {
    return err(finalRealPath.error);
  }

  if (!isInsidePath(projectRoot.value, finalRealPath.value)) {
    return outsideProjectError();
  }

  return {
    ok: true,
    value: {
      absolutePath,
      exists: true,
      projectRoot: projectRoot.value,
      relativePath: toProjectRelativePath(
        projectRoot.value,
        finalRealPath.value
      ),
      realPath: finalRealPath.value,
      symbolicLink: stat.value.isSymbolicLink()
    }
  };
}

export function isInsidePath(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function toProjectRelativePath(root: string, candidate: string): string {
  const relativePath = path.relative(root, candidate);

  if (relativePath.length === 0) {
    return ".";
  }

  return relativePath.split(path.sep).join("/");
}

function outsideProjectError(): Result<never, SpriteError> {
  return err(
    new SpriteError(
      "TOOL_PATH_OUTSIDE_PROJECT",
      "Tool path is outside the project boundary."
    )
  );
}

async function resolveProjectRoot(
  cwd: string
): Promise<Result<string, SpriteError>> {
  try {
    return { ok: true, value: await realpath(cwd) };
  } catch (error) {
    return err(
      createFilesystemSpriteError(
        "TOOL_PROJECT_ROOT_UNAVAILABLE",
        "Could not resolve project root",
        error
      )
    );
  }
}

async function nearestExistingParent(
  absolutePath: string,
  projectRoot: string
): Promise<Result<string, SpriteError>> {
  let current = path.dirname(absolutePath);

  while (isInsidePath(projectRoot, current)) {
    const stat = await safeLstat(current);

    if (!stat.ok) {
      return err(stat.error);
    }

    if (stat.value !== null) {
      const currentRealPath = await safeRealpath(current);

      if (!currentRealPath.ok) {
        return err(currentRealPath.error);
      }

      if (!isInsidePath(projectRoot, currentRealPath.value)) {
        return outsideProjectError();
      }

      return { ok: true, value: currentRealPath.value };
    }

    const next = path.dirname(current);

    if (next === current) {
      break;
    }

    current = next;
  }

  return outsideProjectError();
}

async function safeLstat(
  targetPath: string
): Promise<Result<Stats | null, SpriteError>> {
  try {
    return { ok: true, value: await lstat(targetPath) };
  } catch (error) {
    if (isMissingFilesystemError(error)) {
      return { ok: true, value: null };
    }

    return err(
      createFilesystemSpriteError(
        "TOOL_PATH_UNAVAILABLE",
        "Could not inspect requested path inside the project boundary",
        error
      )
    );
  }
}

async function safeRealpath(
  targetPath: string
): Promise<Result<string, SpriteError>> {
  try {
    return { ok: true, value: await realpath(targetPath) };
  } catch (error) {
    if (isMissingFilesystemError(error)) {
      return err(
        new SpriteError(
          "TOOL_PATH_UNAVAILABLE",
          "Requested path changed before it could be resolved."
        )
      );
    }

    return err(
      createFilesystemSpriteError(
        "TOOL_PATH_UNAVAILABLE",
        "Could not resolve requested path inside the project boundary",
        error
      )
    );
  }
}
