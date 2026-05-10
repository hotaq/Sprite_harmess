import {
  SKILL_CANDIDATE_SCHEMA_VERSION as SHARED_SKILL_CANDIDATE_SCHEMA_VERSION
} from "@sprite/shared";
import {
  SKILL_CANDIDATE_SCHEMA_VERSION as SKILLS_SKILL_CANDIDATE_SCHEMA_VERSION,
  generateSkillCandidatesFromSignals,
  reviewSkillCandidate
} from "@sprite/skills";
import {
  SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION,
  createLocalSkillCandidateStore,
  resolveSkillCandidateArtifactPath,
  resolveSkillCandidateArtifactPaths
} from "@sprite/storage";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function createTempProject(): { projectDir: string; rootDir: string } {
  const rootDir = mkdtempSync(join(tmpdir(), "sprite-skill-candidates-"));

  return {
    projectDir: join(rootDir, "project"),
    rootDir
  };
}

function createCandidate() {
  const generated = generateSkillCandidatesFromSignals({
    correlationId: "corr_candidate_store",
    createdAt: "2026-05-10T14:40:00.000Z",
    learningReviewArtifactPath:
      ".sprite/sessions/ses_candidate_store/learning-reviews/task_candidate_store.json",
    sessionId: "ses_candidate_store",
    signals: [
      {
        confidence: "low",
        evidenceEventIds: ["evt_validation_one"],
        id: "skillsig_validation_one",
        knownRisks: [
          "This is signal-only evidence and must be reviewed before promotion."
        ],
        outcome: "successful_workflow",
        sourceCorrelationId: "corr_candidate_store",
        sourceSessionId: "ses_candidate_store",
        sourceTaskId: "task_candidate_store",
        status: "signal_only",
        toolSequence: ["npm test -- --run"],
        triggerReason: "A repeatable validation command passed.",
        workflowSummary: "Validation workflow succeeded: test."
      },
      {
        confidence: "low",
        evidenceEventIds: ["evt_validation_two"],
        id: "skillsig_validation_two",
        knownRisks: [
          "This is signal-only evidence and must be reviewed before promotion."
        ],
        outcome: "successful_workflow",
        sourceCorrelationId: "corr_candidate_store",
        sourceSessionId: "ses_candidate_store",
        sourceTaskId: "task_candidate_store",
        status: "signal_only",
        toolSequence: ["npm test -- --run"],
        triggerReason: "A repeatable validation command passed again.",
        workflowSummary: "Validation workflow succeeded: test."
      }
    ],
    taskId: "task_candidate_store"
  });

  expect(generated.ok).toBe(true);
  if (!generated.ok) {
    throw new Error("candidate generation failed");
  }

  return generated.value.candidates[0];
}

describe("LocalSkillCandidateStore", () => {
  it("keeps storage and skills candidate schema versions on the shared contract", () => {
    expect(SKILL_CANDIDATE_ARTIFACT_SCHEMA_VERSION).toBe(
      SHARED_SKILL_CANDIDATE_SCHEMA_VERSION
    );
    expect(SKILLS_SKILL_CANDIDATE_SCHEMA_VERSION).toBe(
      SHARED_SKILL_CANDIDATE_SCHEMA_VERSION
    );
  });

  it("lists, reads, and atomically writes skill candidates outside active skills", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalSkillCandidateStore();
      const candidate = createCandidate();
      const paths = resolveSkillCandidateArtifactPaths(projectDir);

      expect(paths.ok).toBe(true);
      const written = store.writeCandidate(projectDir, candidate);

      expect(written.ok).toBe(true);
      if (!written.ok || !paths.ok) {
        return;
      }

      expect(written.value.path).toBe(
        join(paths.value.candidatesDir, `${candidate.id}.json`)
      );
      expect(written.value.path).toContain(".sprite/skill-candidates");
      expect(written.value.path).not.toContain(".sprite/skills");
      expect(existsSync(written.value.path)).toBe(true);

      const listed = store.listCandidates(projectDir);
      expect(listed.ok).toBe(true);
      if (!listed.ok) {
        return;
      }
      expect(listed.value).toEqual([
        expect.objectContaining({
          id: candidate.id,
          lifecycleStatus: "proposed",
          schemaVersion: 1
        })
      ]);

      const read = store.readCandidate(projectDir, candidate.id);
      expect(read.ok).toBe(true);
      if (!read.ok) {
        return;
      }
      expect(read.value).toMatchObject({
        id: candidate.id,
        sourceEventIds: ["evt_validation_one", "evt_validation_two"]
      });
      expect(JSON.stringify(read.value)).not.toContain("rawSkillContent");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects path escapes, duplicate writes, and unsafe serialized artifacts", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalSkillCandidateStore();
      const candidate = createCandidate();
      const firstWrite = store.writeCandidate(projectDir, candidate);

      expect(firstWrite.ok).toBe(true);
      expect(store.readCandidate(projectDir, "../skillcand_escape").ok).toBe(
        false
      );
      expect(
        resolveSkillCandidateArtifactPath(
          join(projectDir, ".sprite", "skill-candidates"),
          "../skillcand_escape"
        ).ok
      ).toBe(false);
      expect(store.writeCandidate(projectDir, candidate).ok).toBe(false);

      const unsafe = store.writeCandidate(projectDir, {
        ...candidate,
        candidateId: "skillcand_unsafe_storage",
        id: "skillcand_unsafe_storage",
        name: "OPENAI_API_KEY=sk-test-secret"
      });

      expect(unsafe.ok).toBe(false);
      if (!unsafe.ok) {
        expect(unsafe.error.code).toBe("SKILL_CANDIDATE_ARTIFACT_INVALID");
      }
      if (firstWrite.ok) {
        expect(readFileSync(firstWrite.value.path, "utf8")).not.toContain(
          "sk-test-secret"
        );
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("updates reviewed candidates in-place without allowing missing artifacts or unsafe metadata", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalSkillCandidateStore();
      const candidate = createCandidate();
      const written = store.writeCandidate(projectDir, candidate);

      expect(written.ok).toBe(true);
      const draft = reviewSkillCandidate(candidate, {
        action: "draft",
        candidateId: candidate.id,
        reason: "Keep this candidate inert until another human review.",
        reviewedAt: "2026-05-10T15:20:00.000Z",
        reviewedBy: "human"
      });

      expect(draft.ok).toBe(true);
      if (!draft.ok) {
        return;
      }

      const updated = store.updateCandidate(projectDir, draft.value.candidate);

      expect(updated.ok).toBe(true);
      const read = store.readCandidate(projectDir, candidate.id);
      expect(read.ok).toBe(true);
      if (!read.ok) {
        return;
      }
      expect(read.value).toMatchObject({
        draftSavedAt: "2026-05-10T15:20:00.000Z",
        lifecycleStatus: "draft",
        reviewReason: "Keep this candidate inert until another human review.",
        reviewedBy: "human"
      });

      const missingUpdate = store.updateCandidate(projectDir, {
        ...draft.value.candidate,
        candidateId: "skillcand_missing_update",
        id: "skillcand_missing_update"
      });
      const unsafeUpdate = store.updateCandidate(projectDir, {
        ...draft.value.candidate,
        reviewReason: "OPENAI_API_KEY=sk-test-secret"
      });

      expect(missingUpdate.ok).toBe(false);
      if (!missingUpdate.ok) {
        expect(missingUpdate.error.code).toBe("SKILL_CANDIDATE_NOT_FOUND");
      }
      expect(unsafeUpdate.ok).toBe(false);
      if (!unsafeUpdate.ok) {
        expect(unsafeUpdate.error.code).toBe(
          "SKILL_CANDIDATE_ARTIFACT_INVALID"
        );
      }

      const inconsistentPromotion = store.updateCandidate(projectDir, {
        ...draft.value.candidate,
        promotedAt: "2026-05-10T15:21:00.000Z",
        promotedSkillReference: "project:Validation Workflow",
        promotionTarget: "project"
      });

      expect(inconsistentPromotion.ok).toBe(false);

      const rejected = reviewSkillCandidate(draft.value.candidate, {
        action: "reject",
        candidateId: candidate.id,
        reason: "Reject after draft review.",
        reviewedAt: "2026-05-10T15:22:00.000Z",
        reviewedBy: "human"
      });

      expect(rejected.ok).toBe(true);
      if (!rejected.ok) {
        return;
      }
      expect(store.updateCandidate(projectDir, rejected.value.candidate).ok).toBe(
        true
      );

      const terminalRewrite = store.updateCandidate(projectDir, {
        ...rejected.value.candidate,
        lifecycleStatus: "promoted",
        promotedAt: "2026-05-10T15:23:00.000Z",
        promotedSkillReference: "project:Validation Workflow",
        promotionTarget: "project",
        rejectionReason: undefined
      });

      expect(terminalRewrite.ok).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked candidate storage roots before writing artifacts", () => {
    const { projectDir, rootDir } = createTempProject();

    try {
      const store = createLocalSkillCandidateStore();
      const candidate = createCandidate();
      const outsideDir = join(rootDir, "outside-candidates");

      mkdirSync(join(projectDir, ".sprite"), { recursive: true });
      mkdirSync(outsideDir, { recursive: true });
      symlinkSync(outsideDir, join(projectDir, ".sprite", "skill-candidates"));

      const written = store.writeCandidate(projectDir, candidate);

      expect(written.ok).toBe(false);
      expect(existsSync(join(outsideDir, `${candidate.id}.json`))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
