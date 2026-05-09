import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  listAvailableSkills,
  resolveSkillRegistryRoots
} from "@sprite/skills";

function createTempSkillWorkspace(): {
  homeDir: string;
  projectDir: string;
  rootDir: string;
} {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-skills-"));
  const homeDir = join(rootDir, "home");
  const projectDir = join(rootDir, "project");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  return { homeDir, projectDir, rootDir };
}

function writeRaw(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeSkillManifest(
  registryRoot: string,
  skillDirectory: string,
  frontmatter: string
): void {
  writeRaw(
    join(registryRoot, skillDirectory, "SKILL.md"),
    `---\n${frontmatter.trim()}\n---\n\n# Body content must never be emitted by list output.\n`
  );
}

describe("manual skill registry listing", () => {
  it("resolves project and global roots and succeeds when registries are missing", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();

    try {
      const roots = resolveSkillRegistryRoots({ cwd: projectDir, homeDir });
      const result = listAvailableSkills({ cwd: projectDir, homeDir });

      expect(roots).toEqual([
        {
          source: "project",
          path: resolve(projectDir, ".sprite", "skills"),
          exists: false
        },
        {
          source: "global",
          path: resolve(homeDir, ".sprite", "skills"),
          exists: false
        }
      ]);
      expect(result).toMatchObject({
        schemaVersion: 1,
        registryRoots: roots,
        skills: [],
        unavailableSkills: [],
        warnings: []
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("lists valid project and global skills with stable source-distinguished manual entries", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");
    const globalSkillsRoot = join(homeDir, ".sprite", "skills");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "shared",
        `
name: shared-workflow
description: Prefer the project workflow when manually choosing a skill.
activationHint: sprite skills run shared-workflow
`
      );
      writeSkillManifest(
        projectSkillsRoot,
        "review",
        `
name: review-code
description: Review code for regressions before commit.
activationHint: Manually invoke when review is requested.
`
      );
      writeSkillManifest(
        globalSkillsRoot,
        "shared",
        `
name: shared-workflow
description: Global fallback workflow remains visible beside project skill.
activationHint: Manually invoke from the global registry.
`
      );
      writeSkillManifest(
        globalSkillsRoot,
        "test",
        `
name: test-plan
description: Build a focused test plan.
`
      );

      const result = listAvailableSkills({ cwd: projectDir, homeDir });

      expect(
        result.skills.map((skill) => ({
          activationHint: skill.activationHint,
          lifecycleState: skill.lifecycleState,
          name: skill.name,
          relativePath: skill.relativePath,
          source: skill.source
        }))
      ).toEqual([
        {
          activationHint: "Manually invoke when review is requested.",
          lifecycleState: "manual",
          name: "review-code",
          relativePath: "review/SKILL.md",
          source: "project"
        },
        {
          activationHint: "sprite skills run shared-workflow",
          lifecycleState: "manual",
          name: "shared-workflow",
          relativePath: "shared/SKILL.md",
          source: "project"
        },
        {
          activationHint: "Manually invoke from the global registry.",
          lifecycleState: "manual",
          name: "shared-workflow",
          relativePath: "shared/SKILL.md",
          source: "global"
        },
        {
          activationHint: "Manual invocation only.",
          lifecycleState: "manual",
          name: "test-plan",
          relativePath: "test/SKILL.md",
          source: "global"
        }
      ]);
      expect(result.unavailableSkills).toEqual([]);
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns unavailable warnings instead of throwing for malformed and unsafe manifests", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");

    try {
      mkdirSync(join(projectSkillsRoot, "missing-manifest"), {
        recursive: true
      });
      writeSkillManifest(
        projectSkillsRoot,
        "missing-description",
        `
name: incomplete-skill
`
      );
      writeSkillManifest(
        projectSkillsRoot,
        "unsafe-token",
        `
name: unsafe-token
description: OPENAI_API_KEY=sk-test-secret should never leave validation.
activationHint: Also avoid sk-test-secret in hints.
token: sk-test-secret
`
      );

      const result = listAvailableSkills({ cwd: projectDir, homeDir });
      const serialized = JSON.stringify(result);

      expect(result.skills).toEqual([]);
      expect(result.unavailableSkills).toHaveLength(3);
      expect(result.warnings.map((warning) => warning.code)).toEqual([
        "SKILL_MANIFEST_MALFORMED",
        "SKILL_MANIFEST_MISSING",
        "SKILL_MANIFEST_UNSAFE"
      ]);
      expect(serialized).not.toContain("sk-test-secret");
      expect(serialized).not.toContain("OPENAI_API_KEY");
      expect(() =>
        listAvailableSkills({ cwd: projectDir, homeDir })
      ).not.toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects compound unsafe metadata keys even when the value looks harmless", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "api-token-field",
        `
name: compound-unsafe
description: Compound sensitive metadata keys must be rejected.
apiToken: placeholder
clientSecret: placeholder
credentialFile: ./safe-looking-path
privateKeyPem: placeholder
rawOutputFile: output.txt
`
      );

      const result = listAvailableSkills({ cwd: projectDir, homeDir });

      expect(result.skills).toEqual([]);
      expect(result.unavailableSkills).toEqual([
        expect.objectContaining({
          lifecycleState: "unavailable",
          relativePath: "api-token-field/SKILL.md",
          warning: expect.objectContaining({
            code: "SKILL_MANIFEST_UNSAFE"
          })
        })
      ]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("redacts secret-like substrings from returned registry and manifest paths", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "sk-test-secret-skills-"));
    const homeDir = join(rootDir, "home");
    const projectDir = join(rootDir, "project");
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");

    try {
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });
      writeSkillManifest(
        projectSkillsRoot,
        "manual",
        `
name: safe-path-skill
description: Path metadata must not leak secret-like parent directories.
`
      );

      const result = listAvailableSkills({ cwd: projectDir, homeDir });
      const serialized = JSON.stringify(result);

      expect(result.skills).toHaveLength(1);
      expect(serialized).not.toContain("sk-test-secret");
      expect(result.registryRoots.every((root) => root.path.includes("[REDACTED]"))).toBe(
        true
      );
      expect(result.skills[0]?.registryRoot).toContain("[REDACTED]");
      expect(result.skills[0]?.manifestPath).toContain("[REDACTED]");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked registry entries that escape their expected root", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");
    const outsideSkill = join(rootDir, "outside-skill");

    try {
      writeSkillManifest(
        outsideSkill,
        ".",
        `
name: escaped-skill
description: This skill lives outside the trusted project registry root.
`
      );
      mkdirSync(projectSkillsRoot, { recursive: true });
      symlinkSync(outsideSkill, join(projectSkillsRoot, "escaped"), "dir");

      const result = listAvailableSkills({ cwd: projectDir, homeDir });

      expect(result.skills).toEqual([]);
      expect(result.unavailableSkills).toHaveLength(1);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: "SKILL_PATH_ESCAPE",
          source: "project"
        })
      ]);
      expect(JSON.stringify(result)).not.toContain("escaped-skill");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("scans only manual registries and does not create candidate or runtime artifacts", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "manual",
        `
name: manual-runtime-skill
description: Trusted manual registry skill.
`
      );
      writeSkillManifest(
        join(projectDir, ".codex", "skills"),
        "codex-only",
        `
name: codex-orchestration-skill
description: This must not be listed as a Sprite runtime skill.
`
      );
      writeSkillManifest(
        join(projectDir, ".agents", "skills"),
        "bmad-only",
        `
name: bmad-orchestration-skill
description: This must not be listed as a Sprite runtime skill.
`
      );
      writeRaw(
        join(projectDir, ".sprite", "learning-reviews", "procout_1.md"),
        "name: procedural-candidate\n"
      );

      const result = listAvailableSkills({ cwd: projectDir, homeDir });
      const listedNames = result.skills.map((skill) => skill.name);

      expect(listedNames).toEqual(["manual-runtime-skill"]);
      expect(listedNames).not.toContain("codex-orchestration-skill");
      expect(listedNames).not.toContain("bmad-orchestration-skill");
      expect(listedNames).not.toContain("procedural-candidate");
      expect(
        existsSync(join(projectDir, ".sprite", "skill-candidates"))
      ).toBe(false);
      expect(existsSync(join(projectDir, ".sprite", "sessions"))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
