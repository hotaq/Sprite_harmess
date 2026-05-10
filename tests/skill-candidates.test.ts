import {
  generateSkillCandidatesFromSignals,
  reviewSkillCandidate,
  summarizeSkillCandidateForReview,
  summarizeSkillCandidateForEvent,
  validateSkillCandidate,
  type SkillCandidateSourceSignal
} from "@sprite/skills";
import { describe, expect, it } from "vitest";

function createSignal(
  overrides: Partial<SkillCandidateSourceSignal> = {}
): SkillCandidateSourceSignal {
  return {
    confidence: "low",
    evidenceEventIds: ["evt_validation_one"],
    id: "skillsig_validation_one",
    knownRisks: [
      "This is signal-only evidence and must be reviewed before promotion."
    ],
    outcome: "successful_workflow",
    sourceCorrelationId: "corr_candidate",
    sourceSessionId: "ses_candidate",
    sourceTaskId: "task_candidate",
    status: "signal_only",
    toolSequence: ["npm test -- --run"],
    triggerReason: "A repeatable validation command passed.",
    workflowSummary: "Validation workflow succeeded: test.",
    ...overrides
  };
}

describe("skill candidate generation", () => {
  it("proposes a bounded medium-confidence candidate from repeated compatible signals", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate",
      createdAt: "2026-05-10T14:30:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate/learning-reviews/task_candidate.json",
      sessionId: "ses_candidate",
      signals: [
        createSignal(),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          sourceTaskId: "task_candidate_two"
        })
      ],
      taskId: "task_candidate"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.skipped).toEqual([]);
    expect(result.value.candidates).toHaveLength(1);

    const [candidate] = result.value.candidates;
    expect(candidate).toMatchObject({
      candidateId: candidate.id,
      confidence: "medium",
      lifecycleStatus: "proposed",
      schemaVersion: 1,
      sourceCorrelationIds: ["corr_candidate"],
      sourceEventIds: ["evt_validation_one", "evt_validation_two"],
      sourceSessionIds: ["ses_candidate"],
      sourceSkillSignalIds: [
        "skillsig_validation_one",
        "skillsig_validation_two"
      ],
      sourceTaskIds: ["task_candidate", "task_candidate_two"]
    });
    expect(candidate.id).toMatch(/^skillcand_[A-Za-z0-9][A-Za-z0-9_-]*$/);
    expect(candidate.supportingEvidence).toHaveLength(2);
    expect(candidate.intendedActivationConditions.length).toBeGreaterThan(0);
    expect(candidate.workflowSteps.length).toBeGreaterThan(0);
    expect(candidate.requiredTools).toContain("npm");
    expect(JSON.stringify(candidate)).not.toContain("rawSkillContent");
    expect(JSON.stringify(candidate)).not.toContain("promotedSkillPath");

    expect(validateSkillCandidate(candidate).ok).toBe(true);

    const eventSummary = summarizeSkillCandidateForEvent(
      candidate,
      `.sprite/skill-candidates/${candidate.id}.json`
    );

    expect(eventSummary).toMatchObject({
      candidateArtifactPath: `.sprite/skill-candidates/${candidate.id}.json`,
      candidateId: candidate.id,
      confidence: "medium",
      lifecycleStatus: "proposed",
      sourceEventIds: ["evt_validation_one", "evt_validation_two"],
      status: "created"
    });
  });

  it("allows one strong correction/recovery signal but keeps confidence low", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate",
      createdAt: "2026-05-10T14:31:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate/learning-reviews/task_candidate.json",
      sessionId: "ses_candidate",
      signals: [
        createSignal({
          evidenceEventIds: ["evt_steering", "evt_recovery"],
          id: "skillsig_correction",
          outcome: "corrected_workflow",
          toolSequence: ["event:evt_steering", "recovery:validation_failed"],
          triggerReason:
            "User corrected the workflow and recovery evidence confirmed it.",
          workflowSummary: "User steering corrected or clarified execution."
        })
      ],
      taskId: "task_candidate"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.candidates[0]).toMatchObject({
      confidence: "low",
      sourceEventIds: ["evt_steering", "evt_recovery"],
      sourceSkillSignalIds: ["skillsig_correction"]
    });
  });

  it("skips weak, duplicate, unsupported, and unsafe signals fail-closed", () => {
    const baseRequest = {
      correlationId: "corr_candidate",
      createdAt: "2026-05-10T14:32:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate/learning-reviews/task_candidate.json",
      sessionId: "ses_candidate",
      taskId: "task_candidate"
    } as const;

    const weak = generateSkillCandidatesFromSignals({
      ...baseRequest,
      signals: [createSignal()]
    });
    const unsupported = generateSkillCandidatesFromSignals({
      ...baseRequest,
      signals: [
        createSignal({
          status: "promoted" as "signal_only"
        })
      ]
    });
    const unsafe = generateSkillCandidatesFromSignals({
      ...baseRequest,
      signals: [
        createSignal({
          workflowSummary: "Read /Users/chinnaphat/private/SKILL.md."
        })
      ]
    });
    const missingSourceSignal = { ...createSignal() } as Record<string, unknown>;
    delete missingSourceSignal.sourceCorrelationId;
    const missingSource = generateSkillCandidatesFromSignals({
      ...baseRequest,
      signals: [missingSourceSignal as unknown as SkillCandidateSourceSignal]
    });

    expect(weak.ok).toBe(true);
    expect(unsupported.ok).toBe(true);
    expect(unsafe.ok).toBe(true);
    expect(missingSource.ok).toBe(true);
    if (!weak.ok || !unsupported.ok || !unsafe.ok || !missingSource.ok) {
      return;
    }

    expect(weak.value.candidates).toEqual([]);
    expect(weak.value.skipped).toEqual([
      expect.objectContaining({ reason: "insufficient_evidence" })
    ]);
    expect(unsupported.value.candidates).toEqual([]);
    expect(unsupported.value.skipped).toEqual([
      expect.objectContaining({ reason: "unsupported_signal_status" })
    ]);
    expect(unsafe.value.candidates).toEqual([]);
    expect(unsafe.value.skipped).toEqual([
      expect.objectContaining({ reason: "unsafe_signal" })
    ]);
    expect(missingSource.value.candidates).toEqual([]);
    expect(missingSource.value.skipped).toEqual([
      expect.objectContaining({ reason: "unsafe_signal" })
    ]);

    const created = generateSkillCandidatesFromSignals({
      ...baseRequest,
      signals: [
        createSignal(),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two"
        })
      ]
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const duplicate = generateSkillCandidatesFromSignals({
      ...baseRequest,
      existingCandidateIds: [created.value.candidates[0].id],
      signals: [
        createSignal(),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two"
        })
      ]
    });

    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) {
      return;
    }
    expect(duplicate.value.candidates).toEqual([]);
    expect(duplicate.value.skipped).toEqual([
      expect.objectContaining({ reason: "duplicate_candidate" })
    ]);
  });

  it("skips contradicted guidance instead of creating a candidate", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate",
      createdAt: "2026-05-10T14:33:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate/learning-reviews/task_candidate.json",
      sessionId: "ses_candidate",
      signals: [
        createSignal(),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          outcome: "contradicted_guidance"
        })
      ],
      taskId: "task_candidate"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.candidates).toEqual([]);
    expect(result.value.skipped).toEqual([
      expect.objectContaining({ reason: "conflicting_evidence" })
    ]);
  });

  it("reviews a proposed candidate as an editable inert draft", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate_review",
      createdAt: "2026-05-10T15:00:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate_review/learning-reviews/task_candidate_review.json",
      sessionId: "ses_candidate_review",
      signals: [
        createSignal({
          sourceCorrelationId: "corr_candidate_review",
          sourceSessionId: "ses_candidate_review",
          sourceTaskId: "task_candidate_review"
        }),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          sourceCorrelationId: "corr_candidate_review",
          sourceSessionId: "ses_candidate_review",
          sourceTaskId: "task_candidate_review_two"
        })
      ],
      taskId: "task_candidate_review"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const candidate = result.value.candidates[0];
    const review = reviewSkillCandidate(candidate, {
      action: "edit",
      candidateId: candidate.id,
      edits: {
        intendedActivationConditions: [
          "Use only after repeated project validation passes."
        ],
        name: "Reviewed Validation Workflow",
        summary: "Reviewed candidate remains a draft until explicit promotion."
      },
      reason: "Human review narrowed the activation conditions.",
      reviewedAt: "2026-05-10T15:01:00.000Z",
      reviewedBy: "human"
    });

    expect(review.ok).toBe(true);
    if (!review.ok) {
      return;
    }

    expect(review.value.candidate).toMatchObject({
      id: candidate.id,
      lifecycleStatus: "draft",
      name: "Reviewed Validation Workflow",
      reviewReason: "Human review narrowed the activation conditions.",
      reviewedAt: "2026-05-10T15:01:00.000Z",
      reviewedBy: "human",
      summary: "Reviewed candidate remains a draft until explicit promotion."
    });
    expect(review.value.promotedSkillManifest).toBeUndefined();
    expect(validateSkillCandidate(review.value.candidate).ok).toBe(true);

    const view = summarizeSkillCandidateForReview(review.value.candidate);
    expect(view).toMatchObject({
      candidateId: candidate.id,
      lifecycleStatus: "draft",
      name: "Reviewed Validation Workflow",
      sourceEventIds: ["evt_validation_one", "evt_validation_two"]
    });
    expect(JSON.stringify(view)).not.toContain("rawSkillContent");
  });

  it("rejects candidates with an auditable reason without creating promotion metadata", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate_reject",
      createdAt: "2026-05-10T15:05:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate_reject/learning-reviews/task_candidate_reject.json",
      sessionId: "ses_candidate_reject",
      signals: [
        createSignal({
          sourceCorrelationId: "corr_candidate_reject",
          sourceSessionId: "ses_candidate_reject",
          sourceTaskId: "task_candidate_reject"
        }),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          sourceCorrelationId: "corr_candidate_reject",
          sourceSessionId: "ses_candidate_reject",
          sourceTaskId: "task_candidate_reject_two"
        })
      ],
      taskId: "task_candidate_reject"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const rejected = reviewSkillCandidate(result.value.candidates[0], {
      action: "reject",
      candidateId: result.value.candidates[0].id,
      reason: "The candidate is too broad for a reusable workflow.",
      reviewedAt: "2026-05-10T15:06:00.000Z",
      reviewedBy: "human"
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) {
      return;
    }

    expect(rejected.value.candidate).toMatchObject({
      lifecycleStatus: "rejected",
      rejectionReason: "The candidate is too broad for a reusable workflow.",
      reviewedBy: "human"
    });
    expect(rejected.value.promotedSkillManifest).toBeUndefined();
    expect(JSON.stringify(rejected.value.candidate)).not.toContain(
      "promotedSkillPath"
    );

    const secondReview = reviewSkillCandidate(rejected.value.candidate, {
      action: "promote",
      candidateId: rejected.value.candidate.id,
      confirmPromotion: true,
      reason: "Try to promote after rejection.",
      reviewedAt: "2026-05-10T15:07:00.000Z"
    });
    expect(secondReview.ok).toBe(false);
  });

  it("requires explicit safe promotion confirmation before producing a manual skill manifest", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate_promote",
      createdAt: "2026-05-10T15:10:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate_promote/learning-reviews/task_candidate_promote.json",
      sessionId: "ses_candidate_promote",
      signals: [
        createSignal({
          sourceCorrelationId: "corr_candidate_promote",
          sourceSessionId: "ses_candidate_promote",
          sourceTaskId: "task_candidate_promote"
        }),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          sourceCorrelationId: "corr_candidate_promote",
          sourceSessionId: "ses_candidate_promote",
          sourceTaskId: "task_candidate_promote_two"
        })
      ],
      taskId: "task_candidate_promote"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const candidate = result.value.candidates[0];
    const unconfirmed = reviewSkillCandidate(candidate, {
      action: "promote",
      candidateId: candidate.id,
      reason: "Manual review accepts this reusable validation workflow.",
      reviewedAt: "2026-05-10T15:11:00.000Z"
    });
    const unsafe = reviewSkillCandidate(candidate, {
      action: "promote",
      candidateId: candidate.id,
      confirmPromotion: true,
      reason: "Promote from /Users/chinnaphat/private/SKILL.md.",
      reviewedAt: "2026-05-10T15:11:00.000Z"
    });
    const promoted = reviewSkillCandidate(candidate, {
      action: "promote",
      candidateId: candidate.id,
      confirmPromotion: true,
      promotionTarget: "project",
      reason: "Manual review accepts this reusable validation workflow.",
      reviewedAt: "2026-05-10T15:12:00.000Z",
      reviewedBy: "human"
    });

    expect(unconfirmed.ok).toBe(false);
    expect(unsafe.ok).toBe(false);
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) {
      return;
    }

    expect(promoted.value.candidate).toMatchObject({
      lifecycleStatus: "promoted",
      promotedAt: "2026-05-10T15:12:00.000Z",
      promotionTarget: "project",
      reviewedBy: "human"
    });
    expect(promoted.value.promotedSkillManifest).toMatchObject({
      name: promoted.value.candidate.name,
      reference: `project:${promoted.value.candidate.name}`,
      relativePath: expect.stringMatching(/SKILL\.md$/),
      source: "project"
    });
    expect(promoted.value.promotedSkillManifest?.content).toContain(
      "activationHint:"
    );
    expect(promoted.value.promotedSkillManifest?.content).toContain(
      "## Trigger reason"
    );
    expect(promoted.value.promotedSkillManifest?.content).toContain(
      "## Examples"
    );
    expect(promoted.value.promotedSkillManifest?.content).toContain(
      "## Source evidence"
    );
    expect(JSON.stringify(promoted.value)).not.toContain("rawSkillContent");
    expect(JSON.stringify(promoted.value)).not.toContain("activationGrant");
  });

  it("rejects lifecycle metadata that does not match candidate state", () => {
    const result = generateSkillCandidatesFromSignals({
      correlationId: "corr_candidate_invariants",
      createdAt: "2026-05-10T15:15:00.000Z",
      learningReviewArtifactPath:
        ".sprite/sessions/ses_candidate_invariants/learning-reviews/task_candidate_invariants.json",
      sessionId: "ses_candidate_invariants",
      signals: [
        createSignal({
          sourceCorrelationId: "corr_candidate_invariants",
          sourceSessionId: "ses_candidate_invariants",
          sourceTaskId: "task_candidate_invariants"
        }),
        createSignal({
          evidenceEventIds: ["evt_validation_two"],
          id: "skillsig_validation_two",
          sourceCorrelationId: "corr_candidate_invariants",
          sourceSessionId: "ses_candidate_invariants",
          sourceTaskId: "task_candidate_invariants_two"
        })
      ],
      taskId: "task_candidate_invariants"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const candidate = result.value.candidates[0];
    const draft = reviewSkillCandidate(candidate, {
      action: "draft",
      candidateId: candidate.id,
      reason: "Keep this workflow inert for later review.",
      reviewedAt: "2026-05-10T15:16:00.000Z",
      reviewedBy: "human"
    });

    expect(
      validateSkillCandidate({
        ...candidate,
        promotedAt: "2026-05-10T15:17:00.000Z",
        promotedSkillReference: "project:Validation Workflow",
        promotionTarget: "project"
      }).ok
    ).toBe(false);
    expect(
      validateSkillCandidate({
        ...candidate,
        reviewReason: "Reviewed before lifecycle changed.",
        reviewedAt: "2026-05-10T15:17:00.000Z",
        reviewedBy: "human"
      }).ok
    ).toBe(false);
    expect(draft.ok).toBe(true);
    if (!draft.ok) {
      return;
    }
    expect(
      validateSkillCandidate({
        ...draft.value.candidate,
        promotedAt: "2026-05-10T15:18:00.000Z",
        promotedSkillReference: "project:Validation Workflow",
        promotionTarget: "project"
      }).ok
    ).toBe(false);
  });
});
