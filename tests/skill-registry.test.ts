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
  invokeManualSkill,
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
  frontmatter: string,
  body = "# Body content must never be emitted by list output."
): void {
  writeRaw(
    join(registryRoot, skillDirectory, "SKILL.md"),
    `---\n${frontmatter.trim()}\n---\n\n${body}\n`
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
      expect(
        result.registryRoots.every((root) => root.path.includes("[REDACTED]"))
      ).toBe(true);
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
      expect(existsSync(join(projectDir, ".sprite", "skill-candidates"))).toBe(
        false
      );
      expect(existsSync(join(projectDir, ".sprite", "sessions"))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("manually invokes a valid project skill and loads bounded body context", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "review",
        `
name: project-review
description: Review code before committing.
activationHint: Manually invoke when review is requested.
`,
        "# Review workflow\n- Check regressions.\n- Run focused tests."
      );

      const result = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "project-review"
      });
      const serialized = JSON.stringify(result);

      expect(result).toMatchObject({
        ok: true,
        status: "loaded",
        skill: expect.objectContaining({
          content: expect.stringContaining("Check regressions."),
          contentTruncated: false,
          description: "Review code before committing.",
          invocationMode: "manual",
          invokedBy: "user",
          lifecycleState: "manual",
          name: "project-review",
          source: "project"
        })
      });
      expect(serialized).not.toContain("activationHint:");
      expect(serialized).not.toContain(projectDir);
      expect(serialized).not.toContain(homeDir);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("requires source qualification for duplicate manual skill names", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");
    const globalSkillsRoot = join(homeDir, ".sprite", "skills");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "shared",
        `
name: shared-workflow
description: Project workflow.
`,
        "Project workflow body."
      );
      writeSkillManifest(
        globalSkillsRoot,
        "shared",
        `
name: shared-workflow
description: Global workflow.
`,
        "Global workflow body."
      );

      const ambiguous = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "shared-workflow"
      });
      const projectQualified = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "project:shared-workflow"
      });
      const globalQualified = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "global:shared-workflow"
      });

      expect(ambiguous).toMatchObject({
        ok: false,
        status: "failed",
        error: expect.objectContaining({
          code: "SKILL_AMBIGUOUS",
          recoverable: true
        })
      });
      expect(projectQualified).toMatchObject({
        ok: true,
        skill: expect.objectContaining({
          content: expect.stringContaining("Project workflow body."),
          source: "project"
        })
      });
      expect(globalQualified).toMatchObject({
        ok: true,
        skill: expect.objectContaining({
          content: expect.stringContaining("Global workflow body."),
          source: "global"
        })
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("returns structured recoverable errors for missing, malformed, policy-blocked, and escaped skills", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");
    const outsideSkill = join(rootDir, "outside-skill");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "unsafe",
        `
name: unsafe-body
description: Metadata is safe but body is not.
`,
        "Do not load OPENAI_API_KEY=sk-test-secret into context."
      );
      writeSkillManifest(
        projectSkillsRoot,
        "unsafe-metadata",
        `
name: unsafe-metadata
description: Unsafe metadata should be policy-blocked.
apiToken: placeholder
`,
        "Metadata blocked before this body can load."
      );
      writeRaw(
        join(projectSkillsRoot, "malformed", "SKILL.md"),
        `---
name: malformed-skill
description: Missing closing frontmatter.
`
      );
      writeSkillManifest(
        outsideSkill,
        ".",
        `
name: escaped-skill
description: This skill is outside the trusted root.
`,
        "Escaped body."
      );
      mkdirSync(projectSkillsRoot, { recursive: true });
      symlinkSync(outsideSkill, join(projectSkillsRoot, "escaped"), "dir");

      const missing = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "missing-skill"
      });
      const unsafe = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "unsafe-body"
      });
      const unsafeMetadata = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "unsafe-metadata"
      });
      const malformed = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "malformed"
      });
      const escaped = invokeManualSkill({
        cwd: projectDir,
        homeDir,
        reference: "escaped"
      });
      const serialized = JSON.stringify({
        escaped,
        malformed,
        missing,
        unsafe,
        unsafeMetadata
      });

      expect(missing).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_NOT_FOUND",
          recoverable: true
        })
      });
      expect(unsafe).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_BLOCKED_BY_POLICY",
          recoverable: true
        })
      });
      expect(unsafeMetadata).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_BLOCKED_BY_POLICY",
          recoverable: true
        })
      });
      expect(malformed).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_UNAVAILABLE",
          recoverable: true
        })
      });
      expect(escaped).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_PATH_ESCAPE",
          recoverable: true
        })
      });
      expect(serialized).not.toContain("sk-test-secret");
      expect(serialized).not.toContain("OPENAI_API_KEY");
      expect(serialized).not.toContain(outsideSkill);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("does not list or invoke skill candidate artifacts as active skills", () => {
    const { homeDir, projectDir, rootDir } = createTempSkillWorkspace();
    const projectSkillsRoot = join(projectDir, ".sprite", "skills");
    const candidateRoot = join(projectDir, ".sprite", "skill-candidates");

    try {
      writeSkillManifest(
        projectSkillsRoot,
        "active-review",
        `
name: active-review
description: Active review skill remains the only invokable skill.
`
      );
      writeSkillManifest(
        projectSkillsRoot,
        "candidate-promoted",
        `
name: candidate-promoted
description: Promoted candidate is available only through its manual skill.
`
      );
      const candidateFixtures = [
        {
          id: "skillcand_candidate_proposed",
          lifecycleStatus: "proposed",
          name: "candidate-proposed"
        },
        {
          draftSavedAt: "2026-05-11T03:00:00.000Z",
          id: "skillcand_candidate_draft",
          lifecycleStatus: "draft",
          name: "candidate-draft",
          reviewReason: "Keep as draft until narrower evidence exists."
        },
        {
          id: "skillcand_candidate_rejected",
          lifecycleStatus: "rejected",
          name: "candidate-rejected",
          rejectionReason: "Too broad for promotion.",
          reviewReason: "Reject broad workflow."
        },
        {
          id: "skillcand_candidate_promoted",
          lifecycleStatus: "promoted",
          name: "candidate-promoted",
          promotedSkillReference: "project:candidate-promoted"
        }
      ];

      for (const fixture of candidateFixtures) {
        writeRaw(
          join(candidateRoot, `${fixture.id}.json`),
          JSON.stringify(
            {
              ...fixture,
              rawSkillContent: "sk-test-secret must never leak",
              routingRule: "always activate candidate guidance",
              schemaVersion: 1
            },
            null,
            2
          )
        );
      }

      const listed = listAvailableSkills({ cwd: projectDir, homeDir });
      const serializedList = JSON.stringify(listed);

      expect(listed.skills.map((skill) => skill.name)).toEqual([
        "active-review",
        "candidate-promoted"
      ]);
      expect(serializedList).not.toContain(".sprite/skill-candidates");
      expect(serializedList).not.toContain("skillcand_candidate_");
      expect(serializedList).not.toContain("candidate-proposed");
      expect(serializedList).not.toContain("candidate-draft");
      expect(serializedList).not.toContain("candidate-rejected");
      expect(serializedList).not.toContain("sk-test-secret");
      expect(serializedList).not.toContain("rawSkillContent");
      expect(serializedList).not.toContain("routingRule");

      for (const fixture of candidateFixtures.filter(
        (candidate) => candidate.lifecycleStatus !== "promoted"
      )) {
        for (const reference of [
          fixture.name,
          fixture.id,
          `project:${fixture.name}`
        ]) {
          expect(
            invokeManualSkill({
              cwd: projectDir,
              homeDir,
              reference
            })
          ).toMatchObject({
            ok: false,
            error: expect.objectContaining({
              code: "SKILL_NOT_FOUND"
            })
          });
        }
      }

      expect(
        invokeManualSkill({
          cwd: projectDir,
          homeDir,
          reference: "skillcand_candidate_promoted"
        })
      ).toMatchObject({
        ok: false,
        error: expect.objectContaining({
          code: "SKILL_NOT_FOUND"
        })
      });
      expect(
        invokeManualSkill({
          cwd: projectDir,
          homeDir,
          reference: "project:candidate-promoted"
        })
      ).toMatchObject({
        ok: true,
        skill: expect.objectContaining({
          lifecycleState: "manual",
          name: "candidate-promoted",
          source: "project"
        })
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
