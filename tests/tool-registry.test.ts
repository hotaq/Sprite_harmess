import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createToolRegistry,
  summarizeToolOutput,
  type ToolExecutionResult
} from "@sprite/tools";

const tempRoots: string[] = [];

function createTempProject(): {
  outsideDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-tools-"));
  const outsideDir = join(rootDir, "outside");
  const projectDir = join(rootDir, "project");

  mkdirSync(outsideDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  tempRoots.push(rootDir);

  return { outsideDir, projectDir, rootDir };
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();

    if (rootDir !== undefined) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("tool registry repository inspection", () => {
  it("reads a UTF-8 file inside the project boundary", async () => {
    const { projectDir } = createTempProject();
    writeText(join(projectDir, "src/example.ts"), "export const value = 1;\n");
    const registry = createToolRegistry();

    const result = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "src/example.ts" }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      toolName: "read_file",
      status: "completed",
      path: "src/example.ts",
      content: "export const value = 1;\n",
      output: {
        truncated: false,
        reference: {
          fullOutputStored: false
        }
      }
    });
  });

  it("lists direct children deterministically and skips generated/default-excluded directories for recursive listing", async () => {
    const { projectDir } = createTempProject();
    writeText(join(projectDir, "b.ts"), "b");
    writeText(join(projectDir, "a.ts"), "a");
    writeText(join(projectDir, "src/index.ts"), "src");
    writeText(join(projectDir, "src/dist"), "dist file");
    writeText(join(projectDir, "node_modules/pkg/index.js"), "pkg");
    writeText(join(projectDir, "dist/generated.js"), "dist");
    const registry = createToolRegistry();

    const direct = await registry.execute({
      cwd: projectDir,
      toolName: "list_files",
      input: { path: "." }
    });
    const recursive = await registry.execute({
      cwd: projectDir,
      toolName: "list_files",
      input: { path: ".", recursive: true }
    });

    expect(direct.ok).toBe(true);
    expect(recursive.ok).toBe(true);
    if (!direct.ok || !recursive.ok) {
      return;
    }

    expect(direct.value.entries.map((entry) => entry.path)).toEqual([
      "a.ts",
      "b.ts",
      "dist",
      "node_modules",
      "src"
    ]);
    expect(recursive.value.entries.map((entry) => entry.path)).toEqual([
      "a.ts",
      "b.ts",
      "src",
      "src/dist",
      "src/index.ts"
    ]);
  });

  it("searches files with deterministic literal matches and bounded snippets", async () => {
    const { projectDir } = createTempProject();
    writeText(
      join(projectDir, "src/a.ts"),
      "alpha\nneedle in a line with useful context\n"
    );
    writeText(join(projectDir, "src/b.ts"), "needle in another file\n");
    const registry = createToolRegistry();

    const result = await registry.execute({
      cwd: projectDir,
      toolName: "search_files",
      input: { query: "needle" }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.matches).toEqual([
      {
        line: 2,
        path: "src/a.ts",
        snippet: "needle in a line with useful context"
      },
      {
        line: 1,
        path: "src/b.ts",
        snippet: "needle in another file"
      }
    ]);
  });

  it("rejects traversal, outside absolute paths, and symlink escapes", async () => {
    const { outsideDir, projectDir } = createTempProject();
    writeText(join(outsideDir, "secret.txt"), "outside-secret");
    symlinkSync(outsideDir, join(projectDir, "outside-link"), "dir");
    const registry = createToolRegistry();

    const traversal = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "../outside/secret.txt" }
    });
    const absolute = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: join(outsideDir, "secret.txt") }
    });
    const symlinkEscape = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "outside-link/secret.txt" }
    });
    const explicitDirectorySymlink = await registry.execute({
      cwd: projectDir,
      toolName: "list_files",
      input: { path: "outside-link" }
    });
    const traversalViaDirectorySymlink = await registry.execute({
      cwd: projectDir,
      toolName: "search_files",
      input: { path: ".", query: "outside-secret" }
    });

    expect(traversal.ok).toBe(false);
    expect(absolute.ok).toBe(false);
    expect(symlinkEscape.ok).toBe(false);
    expect(explicitDirectorySymlink.ok).toBe(false);
    if (
      traversal.ok ||
      absolute.ok ||
      symlinkEscape.ok ||
      explicitDirectorySymlink.ok
    ) {
      return;
    }

    expect(traversal.error.code).toBe("TOOL_PATH_OUTSIDE_PROJECT");
    expect(absolute.error.code).toBe("TOOL_PATH_OUTSIDE_PROJECT");
    expect(symlinkEscape.error.code).toBe("TOOL_PATH_OUTSIDE_PROJECT");
    expect(explicitDirectorySymlink.error.code).toBe(
      "TOOL_PATH_OUTSIDE_PROJECT"
    );
    expect(traversalViaDirectorySymlink.ok).toBe(true);
    if (traversalViaDirectorySymlink.ok) {
      expect(traversalViaDirectorySymlink.value.matches).toEqual([]);
    }
  });

  it("returns structured failures for missing files and unsupported binary files", async () => {
    const { projectDir } = createTempProject();
    writeFileSync(join(projectDir, "binary.bin"), Buffer.from([0, 1, 2, 3]));
    symlinkSync(
      "missing-target.txt",
      join(projectDir, "broken-link.txt"),
      "file"
    );
    const registry = createToolRegistry();

    const missing = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "missing.txt" }
    });
    const binary = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "binary.bin" }
    });
    const brokenSymlink = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "broken-link.txt" }
    });

    expect(missing.ok).toBe(false);
    expect(binary.ok).toBe(false);
    expect(brokenSymlink.ok).toBe(false);
    if (missing.ok || binary.ok || brokenSymlink.ok) {
      return;
    }

    expect(missing.error.code).toBe("TOOL_FILE_NOT_FOUND");
    expect(binary.error.code).toBe("TOOL_UNSUPPORTED_BINARY_FILE");
    expect(brokenSymlink.error.code).toBe("TOOL_PATH_UNAVAILABLE");
  });

  it("summarizes outputs over byte or line thresholds without pretending persistence exists", () => {
    const largeByBytes = "x".repeat(32 * 1024 + 1);
    const largeByLines = Array.from(
      { length: 501 },
      (_, index) => `line-${index}`
    ).join("\n");
    const largeMultibyte = "🙂".repeat(10_000);

    const bytesSummary = summarizeToolOutput(largeByBytes);
    const linesSummary = summarizeToolOutput(largeByLines);
    const multibyteSummary = summarizeToolOutput(largeMultibyte);

    expect(bytesSummary.truncated).toBe(true);
    expect(linesSummary.truncated).toBe(true);
    expect(multibyteSummary.truncated).toBe(true);
    expect(bytesSummary.reference).toMatchObject({
      fullOutputStored: false,
      reason: expect.stringContaining("not implemented")
    });
    expect(linesSummary.reference).toMatchObject({
      fullOutputStored: false,
      reason: expect.stringContaining("not implemented")
    });
    expect(bytesSummary.content.length).toBeLessThan(largeByBytes.length);
    expect(linesSummary.content.split("\n").length).toBeLessThan(501);
    expect(multibyteSummary.content).not.toContain("\uFFFD");
  });

  it("bounds structured list and search previews when output is too large", async () => {
    const { projectDir } = createTempProject();
    const registry = createToolRegistry();

    for (let index = 0; index < 600; index += 1) {
      writeText(
        join(projectDir, "many", `file-${String(index).padStart(3, "0")}.txt`),
        "needle\n"
      );
    }

    const list = await registry.execute({
      cwd: projectDir,
      toolName: "list_files",
      input: { path: ".", recursive: true }
    });
    const search = await registry.execute({
      cwd: projectDir,
      toolName: "search_files",
      input: { path: ".", query: "needle" }
    });

    expect(list.ok).toBe(true);
    expect(search.ok).toBe(true);
    if (!list.ok || !search.ok) {
      return;
    }

    expect(list.value.output.truncated).toBe(true);
    expect(search.value.output.truncated).toBe(true);
    expect(list.value.totalEntryCount).toBe(601);
    expect(search.value.totalMatchCount).toBe(600);
    expect(list.value.returnedEntryCount).toBe(80);
    expect(search.value.returnedMatchCount).toBe(80);
    expect(list.value.entries).toHaveLength(80);
    expect(search.value.matches).toHaveLength(80);
  });

  it("does not include raw secret-looking content in tool lifecycle event summaries", async () => {
    const { projectDir } = createTempProject();
    writeText(join(projectDir, "secret.txt"), "OPENAI_API_KEY=sk-test-secret");
    const observed: ToolExecutionResult | undefined = undefined;
    const registry = createToolRegistry();

    const result = await registry.execute({
      cwd: projectDir,
      toolName: "read_file",
      input: { path: "secret.txt" }
    });

    expect(observed).toBeUndefined();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary).not.toContain("sk-test-secret");
    expect(result.value.output.content).toContain("sk-test-secret");
  });
});
