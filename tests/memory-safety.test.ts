import { describe, expect, it } from "vitest";
import {
  MEMORY_INFLUENCE_SCHEMA_VERSION,
  RETROSPECTIVE_REVIEW_SCHEMA_VERSION,
  createMemoryCandidate,
  createMemoryEntryFromCandidate,
  evaluateSafetySensitiveContent,
  evaluateRetrospectiveEligibility,
  generateLearningReview,
  generateRetrospectiveReview,
  getMemoryCandidateLifecycleStatus,
  reviewMemoryCandidate,
  selectMemoryInfluenceCandidates,
  shouldAutoSaveMemoryCandidate,
  summarizeLearningReviewForEvent,
  summarizeMemoryCandidateForReview,
  summarizeRetrospectiveReviewForEvent,
  validateLearningReview,
  validateMemoryCandidateEdit,
  validateMemoryInfluenceRecord,
  validateRetrospectiveReview
} from "@sprite/memory";

describe("memory safety evaluation", () => {
  it("blocks default credential, token, private-key, env-path, and key-path matches", () => {
    const cases = [
      {
        content: "OPENAI_API_KEY=sk-test-secret",
        path: undefined,
        expectedRule: "safety.secret.assignment"
      },
      {
        content: "PASSWORD=hunter2",
        path: undefined,
        expectedRule: "safety.secret.assignment"
      },
      {
        content: "token sk-test-secret",
        path: undefined,
        expectedRule: "safety.openai_token.block"
      },
      {
        content: "Set OPENAI_API_KEY before running the tool.",
        path: undefined,
        expectedRule: "safety.provider_key_name.block"
      },
      {
        content:
          "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
        path: undefined,
        expectedRule: "safety.private_key.block"
      },
      {
        content: "safe placeholder",
        path: ".env.local",
        expectedRule: "safety.env_path.block"
      },
      {
        content: "safe placeholder",
        path: "certs/client.pem",
        expectedRule: "safety.private_key_path.block"
      }
    ];

    for (const item of cases) {
      const result = createMemoryCandidate({
        confidence: "high",
        content: item.content,
        path: item.path,
        provenance: "memory safety test",
        sourceTaskId: "task_test",
        target: "memory_candidate",
        type: "working"
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }

      expect(result.value.candidate).toBeNull();
      expect(result.value.decision).toMatchObject({
        action: "block",
        target: "memory_candidate"
      });
      expect(result.value.decision.matchedRuleIds).toContain(item.expectedRule);
      expect(JSON.stringify(result.value.decision)).not.toContain(
        "sk-test-secret"
      );
      expect(JSON.stringify(result.value.decision)).not.toContain(
        "OPENAI_API_KEY="
      );
      expect(JSON.stringify(result.value.decision)).not.toContain("hunter2");
      expect(JSON.stringify(result.value.decision)).not.toContain(
        "OPENAI_API_KEY"
      );
    }
  });

  it("redacts custom rule matches without returning raw matched content", () => {
    const result = createMemoryCandidate(
      {
        confidence: "medium",
        content: "Remember ticket TICKET-12345 for follow-up.",
        provenance: "support note",
        sourceTaskId: "task_test",
        target: "learning_material",
        type: "semantic"
      },
      {
        rules: [
          {
            action: "redact",
            id: "custom.ticket-id",
            pattern: "TICKET-[0-9]+",
            reason: "Ticket IDs are customer metadata.",
            targets: ["learning_material"]
          }
        ]
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.decision).toMatchObject({
      action: "redact",
      matchedRuleIds: ["custom.ticket-id"],
      target: "learning_material"
    });
    expect(result.value.candidate?.content).toBe(
      "Remember ticket [REDACTED] for follow-up."
    );
    expect(JSON.stringify(result.value)).not.toContain("TICKET-12345");
  });

  it("uses the same redacted content for path-only redact decisions and stored candidates", () => {
    const result = createMemoryCandidate(
      {
        confidence: "medium",
        content: "Customer import notes live in the configured file.",
        path: "customers/export.json",
        provenance: "support note",
        target: "memory_candidate",
        type: "semantic"
      },
      {
        rules: [
          {
            action: "redact",
            id: "custom.customer-export-path",
            pathPattern: "customers/export\\.json$",
            reason: "Customer export files are sensitive.",
            targets: ["memory_candidate"]
          }
        ]
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.decision).toMatchObject({
      action: "redact",
      matchedRuleIds: ["custom.customer-export-path"],
      redactedPreview: "[REDACTED]",
      target: "memory_candidate"
    });
    expect(result.value.candidate?.content).toBe("[REDACTED]");
    expect(JSON.stringify(result.value)).not.toContain("Customer import notes");
  });

  it("allows safe candidates with provenance and confidence metadata", () => {
    const result = createMemoryCandidate({
      confidence: "high",
      content: "Config loader rules merge by stable rule ID.",
      createdAt: "2026-04-26T09:00:00.000Z",
      provenance: "story 2.9 implementation note",
      sourceTaskId: "task_test",
      type: "procedural"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.decision).toMatchObject({
      action: "allow",
      matchedRuleIds: [],
      target: "memory_candidate"
    });
    expect(result.value.candidate).toMatchObject({
      confidence: "high",
      content: "Config loader rules merge by stable rule ID.",
      provenance: "story 2.9 implementation note",
      sourceTaskId: "task_test",
      type: "procedural"
    });
  });

  it("creates bounded semantic memory candidates with sensitivity metadata and entry conversion", () => {
    const result = createMemoryCandidate({
      confidence: "high",
      content: "Project shell commands should be run through rtk run.",
      createdAt: "2026-05-08T10:00:00.000Z",
      provenance: "user preference from story 4.2",
      sourceEventIds: ["evt_user_preference"],
      sourceTaskId: "task_story_4_2",
      type: "semantic"
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.candidate === null) {
      return;
    }

    expect(result.value.candidate).toMatchObject({
      confidence: "high",
      content: "Project shell commands should be run through rtk run.",
      contentPreview: "Project shell commands should be run through rtk run.",
      createdAt: "2026-05-08T10:00:00.000Z",
      provenance: "user preference from story 4.2",
      schemaVersion: 1,
      sensitivityStatus: "non_sensitive",
      sourceEventIds: ["evt_user_preference"],
      sourceTaskId: "task_story_4_2",
      type: "semantic",
      updatedAt: "2026-05-08T10:00:00.000Z"
    });
    expect(result.value.candidate.id).toEqual(
      expect.stringMatching(/^memcand_/)
    );
    expect(shouldAutoSaveMemoryCandidate(result.value.candidate)).toBe(true);

    const entry = createMemoryEntryFromCandidate(result.value.candidate, {
      createdAt: "2026-05-08T10:01:00.000Z"
    });

    expect(entry.ok).toBe(true);
    if (!entry.ok) {
      return;
    }

    expect(entry.value).toMatchObject({
      autoSaved: true,
      candidateId: result.value.candidate.id,
      confidence: "high",
      content: "Project shell commands should be run through rtk run.",
      contentPreview: "Project shell commands should be run through rtk run.",
      createdAt: "2026-05-08T10:01:00.000Z",
      provenance: "user preference from story 4.2",
      schemaVersion: 1,
      sensitivityStatus: "non_sensitive",
      sourceEventIds: ["evt_user_preference"],
      sourceTaskId: "task_story_4_2",
      type: "semantic",
      updatedAt: "2026-05-08T10:01:00.000Z"
    });
    expect(entry.value.id).toEqual(expect.stringMatching(/^mem_/));
  });

  it("blocks raw logs and large code chunks from memory candidates by default", () => {
    const rawLog = Array.from(
      { length: 6 },
      (_, index) =>
        `2026-05-08T10:00:0${index}.000Z ERROR failed request ${index}`
    ).join("\n");
    const logResult = createMemoryCandidate({
      confidence: "high",
      content: rawLog,
      provenance: "raw command output",
      sourceTaskId: "task_test",
      type: "episodic"
    });

    expect(logResult.ok).toBe(true);
    if (!logResult.ok) {
      return;
    }

    expect(logResult.value.candidate).toBeNull();
    expect(logResult.value.decision).toMatchObject({
      action: "block",
      matchedRuleIds: ["memory.candidate.raw_log"]
    });

    const codeResult = createMemoryCandidate({
      confidence: "high",
      content:
        "```ts\nexport function rememberRuntimeMode() {\n  return process.env.RUNTIME_MODE;\n}\n```",
      provenance: "large code snippet",
      sourceTaskId: "task_test",
      type: "semantic"
    });

    expect(codeResult.ok).toBe(true);
    if (!codeResult.ok) {
      return;
    }

    expect(codeResult.value.candidate).toBeNull();
    expect(codeResult.value.decision).toMatchObject({
      action: "block",
      matchedRuleIds: ["memory.candidate.code_chunk"]
    });
    expect(JSON.stringify(codeResult.value)).not.toContain("RUNTIME_MODE");
  });

  it("does not auto-save redacted, low-confidence, or non-durable memory candidates", () => {
    const redacted = createMemoryCandidate(
      {
        confidence: "high",
        content: "Remember customer ticket TICKET-12345.",
        provenance: "support note",
        target: "memory_candidate",
        type: "semantic"
      },
      {
        rules: [
          {
            action: "redact",
            id: "custom.ticket-id",
            pattern: "TICKET-[0-9]+",
            reason: "Ticket IDs are customer metadata.",
            targets: ["memory_candidate"]
          }
        ]
      }
    );
    const lowConfidence = createMemoryCandidate({
      confidence: "low",
      content: "Maybe the project prefers npm test.",
      provenance: "uncertain note",
      type: "semantic"
    });
    const working = createMemoryCandidate({
      confidence: "high",
      content: "Current task has three remaining checklist items.",
      provenance: "working-memory snapshot",
      type: "working"
    });

    expect(redacted.ok).toBe(true);
    expect(lowConfidence.ok).toBe(true);
    expect(working.ok).toBe(true);
    if (!redacted.ok || !lowConfidence.ok || !working.ok) {
      return;
    }

    expect(redacted.value.candidate?.sensitivityStatus).toBe("redacted");
    expect(shouldAutoSaveMemoryCandidate(redacted.value.candidate!)).toBe(
      false
    );
    expect(shouldAutoSaveMemoryCandidate(lowConfidence.value.candidate!)).toBe(
      false
    );
    expect(shouldAutoSaveMemoryCandidate(working.value.candidate!)).toBe(false);
  });

  it("returns an audit-safe decision for direct safety-sensitive evaluation", () => {
    const result = evaluateSafetySensitiveContent({
      content: "ANTHROPIC_API_KEY=sk-test-secret",
      target: "command_output"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.action).toBe("block");
    expect(result.value.matchedRuleIds).toContain("safety.secret.assignment");
    expect(result.value.target).toBe("command_output");
    expect(JSON.stringify(result.value)).not.toContain("sk-test-secret");
    expect(JSON.stringify(result.value)).not.toContain("ANTHROPIC_API_KEY=");
  });

  it("derives lifecycle state and bounded review summaries for candidates", () => {
    const result = createMemoryCandidate({
      confidence: "medium",
      content:
        "Story 4.3 review flow should keep candidate previews bounded and safe.",
      createdAt: "2026-05-08T12:00:00.000Z",
      provenance: "story 4.3 design note",
      sourceEventIds: ["evt_review_source"],
      sourceTaskId: "task_story_4_3",
      type: "semantic"
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.candidate === null) {
      return;
    }

    expect(getMemoryCandidateLifecycleStatus(result.value.candidate)).toBe(
      "pending_review"
    );
    expect(result.value.candidate).toMatchObject({
      lifecycleStatus: "pending_review",
      recommendedAction: "review"
    });

    const summary = summarizeMemoryCandidateForReview(result.value.candidate);

    expect(summary).toMatchObject({
      candidateId: result.value.candidate.id,
      confidence: "medium",
      contentSummary:
        "Story 4.3 review flow should keep candidate previews bounded and safe.",
      lifecycleStatus: "pending_review",
      memoryType: "semantic",
      provenance: "story 4.3 design note",
      recommendedAction: "review",
      sensitivityStatus: "non_sensitive",
      sourceEventIds: ["evt_review_source"],
      sourceTaskId: "task_story_4_3"
    });
    expect(summary).not.toHaveProperty("content");
    expect(JSON.stringify(summary)).not.toContain("rawContent");
  });

  it("validates accept, reject, and edit review actions without bypassing safety", () => {
    const result = createMemoryCandidate({
      confidence: "medium",
      content: "Manual review can promote a safe semantic candidate.",
      createdAt: "2026-05-08T12:05:00.000Z",
      provenance: "manual review test",
      sourceTaskId: "task_story_4_3",
      type: "semantic"
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.candidate === null) {
      return;
    }

    const accepted = reviewMemoryCandidate(result.value.candidate, {
      action: "accept",
      reviewedAt: "2026-05-08T12:06:00.000Z",
      reviewedBy: "tester",
      reason: "Accurate project preference."
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(accepted.value.candidate).toMatchObject({
      lifecycleStatus: "accepted",
      reviewedAt: "2026-05-08T12:06:00.000Z",
      reviewedBy: "tester",
      reviewReason: "Accurate project preference."
    });

    const rejected = reviewMemoryCandidate(result.value.candidate, {
      action: "reject",
      reviewedAt: "2026-05-08T12:07:00.000Z",
      reviewedBy: "tester",
      reason: "Too vague."
    });

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) {
      return;
    }
    expect(rejected.value.candidate).toMatchObject({
      lifecycleStatus: "rejected",
      reviewReason: "Too vague."
    });

    const safeEdit = validateMemoryCandidateEdit(
      result.value.candidate,
      "Manual review can promote a safe semantic candidate after user approval."
    );

    expect(safeEdit.ok).toBe(true);
    if (!safeEdit.ok || safeEdit.value.candidate === null) {
      return;
    }
    expect(safeEdit.value.candidate).toMatchObject({
      content:
        "Manual review can promote a safe semantic candidate after user approval.",
      lifecycleStatus: "pending_review",
      type: "semantic"
    });

    const unsafeEdit = validateMemoryCandidateEdit(
      result.value.candidate,
      "OPENAI_API_KEY=sk-test-secret"
    );

    expect(unsafeEdit.ok).toBe(true);
    if (!unsafeEdit.ok) {
      return;
    }
    expect(unsafeEdit.value.candidate).toBeNull();
    expect(JSON.stringify(unsafeEdit.value)).not.toContain("sk-test-secret");
    expect(JSON.stringify(unsafeEdit.value)).not.toContain("OPENAI_API_KEY=");
  });

  it("generates compact and full learning reviews with required safe sections", () => {
    const compact = generateLearningReview({
      commandsRun: [
        {
          command: "npm test -- --run",
          eventId: "evt_validation_completed",
          status: "passed"
        }
      ],
      correlationId: "corr_learning",
      createdAt: "2026-05-09T12:00:00.000Z",
      events: [
        {
          eventId: "evt_started",
          type: "task.started"
        },
        {
          eventId: "evt_validation_completed",
          summary: "Validation passed.",
          type: "validation.completed"
        },
        {
          eventId: "evt_completed",
          message: "Task completed with validation.",
          type: "task.completed"
        }
      ],
      filesChanged: ["packages/core/src/agent-runtime.ts"],
      filesRead: ["packages/memory/src/index.ts"],
      memoryCandidates: [
        {
          candidateId: "memcand_learning",
          confidence: "medium",
          eventId: "evt_memory_candidate",
          memoryType: "semantic",
          status: "recorded"
        }
      ],
      sessionId: "ses_learning",
      skillSignals: [
        {
          evidenceEventIds: ["evt_validation_completed"],
          id: "skillsig_validation",
          signal: "Validation workflow succeeded.",
          triggerReason: "A repeatable validation command passed."
        }
      ],
      taskGoal: "Generate a post-task learning review",
      taskId: "task_learning",
      terminalStatus: "completed",
      validationResults: [
        {
          command: "npm test -- --run",
          eventId: "evt_validation_completed",
          name: "test",
          status: "passed"
        }
      ]
    });

    expect(compact.ok).toBe(true);
    if (!compact.ok) {
      return;
    }

    expect(compact.value).toMatchObject({
      mode: "compact",
      schemaVersion: 1,
      sessionId: "ses_learning",
      taskId: "task_learning",
      terminalStatus: "completed"
    });
    expect(compact.value.facts.length).toBeGreaterThan(0);
    expect(compact.value.lessons.length).toBeGreaterThan(0);
    expect(compact.value.evidence.validationResults).toEqual([
      expect.objectContaining({ status: "passed" })
    ]);
    expect(compact.value.memoryCandidates).toEqual([
      expect.objectContaining({ candidateId: "memcand_learning" })
    ]);
    expect(compact.value.skillSignals).toEqual([
      expect.objectContaining({ id: "skillsig_validation" })
    ]);

    const summary = summarizeLearningReviewForEvent(compact.value);

    expect(summary).toMatchObject({
      factCount: compact.value.facts.length,
      memoryCandidateIds: ["memcand_learning"],
      mode: "compact",
      skillSignalIds: ["skillsig_validation"]
    });

    const full = generateLearningReview({
      ...compact.value,
      events: [
        {
          eventId: "evt_started",
          type: "task.started"
        },
        {
          eventId: "evt_completed",
          message: "Task completed with validation.",
          type: "task.completed"
        }
      ],
      mode: "full",
      taskGoal: "Generate a post-task learning review"
    });

    expect(full.ok).toBe(true);
    if (!full.ok) {
      return;
    }
    expect(full.value.mode).toBe("full");
    expect(full.value).toHaveProperty("facts");
    expect(full.value).toHaveProperty("lessons");
    expect(full.value).toHaveProperty("mistakes");
    expect(full.value).toHaveProperty("missedAssumptions");
    expect(full.value).toHaveProperty("testGaps");
  });

  it("redacts or rejects unsafe learning review material", () => {
    const generated = generateLearningReview({
      correlationId: "corr_learning_secret",
      createdAt: "2026-05-09T12:00:00.000Z",
      events: [
        {
          eventId: "evt_completed",
          message: "OPENAI_API_KEY=sk-test-secret",
          type: "task.completed"
        }
      ],
      sessionId: "ses_learning_secret",
      taskGoal: "Review secret-looking output OPENAI_API_KEY=sk-test-secret",
      taskId: "task_learning_secret",
      terminalStatus: "completed"
    });

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }
    expect(JSON.stringify(generated.value)).not.toContain("sk-test-secret");
    expect(JSON.stringify(generated.value)).not.toContain("OPENAI_API_KEY=");

    const unsafe = validateLearningReview({
      ...generated.value,
      facts: [
        {
          evidenceEventIds: ["evt_completed"],
          summary: "OPENAI_API_KEY=sk-test-secret"
        }
      ]
    });

    expect(unsafe.ok).toBe(false);
  });

  it("generates deterministic retrospective reviews for failed tasks with retained context", () => {
    const request = {
      commandsRun: [
        {
          command: "npm test -- --run tests/runtime-loop.test.ts",
          eventId: "evt_command_completed",
          status: "completed"
        }
      ],
      correlationId: "corr_retrospective",
      createdAt: "2026-05-09T13:00:00.000Z",
      events: [
        {
          eventId: "evt_started",
          type: "task.started"
        },
        {
          eventId: "evt_command_completed",
          summary: "Command completed.",
          type: "tool.call.completed"
        },
        {
          eventId: "evt_failed",
          message: "Provider failed before recovery completed.",
          reason: "unrecoverable-error",
          type: "task.failed"
        }
      ],
      filesChanged: ["packages/core/src/agent-runtime.ts"],
      filesRead: ["packages/memory/src/index.ts"],
      finalStatus: "failed" as const,
      memoryInfluences: [
        {
          eventId: "evt_memory_influence",
          sourceId: "mem_rtk",
          sourceType: "memory_entry" as const,
          status: "used" as const,
          summary: "Prior memory shaped validation command selection."
        }
      ],
      sessionId: "ses_retrospective",
      taskGoal: "Trigger retrospective review for failed tasks",
      taskId: "task_retrospective",
      terminalMessage: "Provider failed before recovery completed.",
      terminalReason: "unrecoverable-error",
      terminalStatus: "failed" as const,
      validationResults: [
        {
          command: "npm test -- --run tests/runtime-loop.test.ts",
          eventId: "evt_validation_failed",
          name: "targeted tests",
          status: "failed"
        }
      ]
    };

    const eligibility = evaluateRetrospectiveEligibility(request);

    expect(eligibility.ok).toBe(true);
    if (!eligibility.ok) {
      return;
    }
    expect(eligibility.value).toMatchObject({
      eligible: true,
      missingFields: [],
      terminalStatus: "failed"
    });

    const generated = generateRetrospectiveReview(request);

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    expect(generated.value).toMatchObject({
      schemaVersion: RETROSPECTIVE_REVIEW_SCHEMA_VERSION,
      sessionId: "ses_retrospective",
      taskId: "task_retrospective",
      terminalStatus: "failed",
      finalStatus: "failed",
      failureReason: "unrecoverable-error: Provider failed before recovery completed."
    });
    expect(generated.value.evidence.eventIds).toEqual([
      "evt_started",
      "evt_command_completed",
      "evt_failed",
      "evt_validation_failed",
      "evt_memory_influence"
    ]);
    expect(generated.value.evidence.filesTouched).toEqual([
      "packages/core/src/agent-runtime.ts",
      "packages/memory/src/index.ts"
    ]);
    expect(generated.value.memoryCandidates.length).toBeGreaterThan(0);
    expect(generated.value.skillSignals.length).toBeGreaterThan(0);
    expect(generated.value.nextTimeImprovements.length).toBeGreaterThan(0);
    expect(JSON.stringify(generated.value)).not.toContain("rawOutput");

    const summary = summarizeRetrospectiveReviewForEvent(generated.value);

    expect(summary).toMatchObject({
      commandCount: 1,
      fileCount: 2,
      finalStatus: "failed",
      memoryCandidateCount: generated.value.memoryCandidates.length,
      skillSignalCount: generated.value.skillSignals.length,
      status: "recorded",
      terminalStatus: "failed"
    });
  });

  it("returns exact missing retrospective context fields instead of fabricating learning", () => {
    const request = {
      commandsRun: [],
      correlationId: "corr_missing",
      events: [],
      filesChanged: [],
      finalStatus: "failed" as const,
      sessionId: "ses_missing",
      taskGoal: "",
      taskId: "task_missing",
      terminalStatus: "failed" as const
    };

    const eligibility = evaluateRetrospectiveEligibility(request);

    expect(eligibility.ok).toBe(true);
    if (!eligibility.ok) {
      return;
    }
    expect(eligibility.value).toMatchObject({
      eligible: false,
      terminalStatus: "failed"
    });
    expect(eligibility.value.missingFields).toEqual([
      "taskGoal",
      "eventHistory",
      "terminalState",
      "filesTouched",
      "commandsRun",
      "failureReasonOrOutcome"
    ]);

    const generated = generateRetrospectiveReview(request);

    expect(generated.ok).toBe(false);
    if (generated.ok) {
      return;
    }
    expect(generated.error?.code).toBe(
      "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT"
    );
  });

  it("requires a matching terminal event before generating retrospective reviews", () => {
    const request = {
      commandsRun: [
        {
          command: "npm test -- --run tests/runtime-loop.test.ts",
          eventId: "evt_command_completed",
          status: "completed"
        }
      ],
      correlationId: "corr_retrospective_missing_terminal",
      createdAt: "2026-05-09T13:00:00.000Z",
      events: [
        {
          eventId: "evt_started",
          type: "task.started"
        },
        {
          eventId: "evt_command_completed",
          summary: "Command completed.",
          type: "tool.call.completed"
        }
      ],
      filesChanged: ["packages/core/src/agent-runtime.ts"],
      finalStatus: "failed" as const,
      sessionId: "ses_retrospective_missing_terminal",
      taskGoal: "Trigger retrospective review only after terminal evidence",
      taskId: "task_retrospective_missing_terminal",
      terminalMessage: "Provider failed before recovery completed.",
      terminalReason: "unrecoverable-error",
      terminalStatus: "failed" as const
    };

    const eligibility = evaluateRetrospectiveEligibility(request);

    expect(eligibility.ok).toBe(true);
    if (!eligibility.ok) {
      return;
    }
    expect(eligibility.value.eligible).toBe(false);
    expect(eligibility.value.missingFields).toContain("terminalState");

    const generated = generateRetrospectiveReview(request);

    expect(generated.ok).toBe(false);
    if (generated.ok) {
      return;
    }
    expect(generated.error?.code).toBe(
      "RETROSPECTIVE_REVIEW_CONTEXT_INSUFFICIENT"
    );
  });

  it("rejects unsafe retrospective review material before persistence or events", () => {
    const generated = generateRetrospectiveReview({
      commandsRun: [
        {
          command: "npm test -- --run",
          eventId: "evt_command_completed",
          status: "completed"
        }
      ],
      correlationId: "corr_retrospective_secret",
      createdAt: "2026-05-09T13:00:00.000Z",
      events: [
        {
          eventId: "evt_completed",
          message: "Task completed with enough evidence.",
          type: "task.completed"
        }
      ],
      filesChanged: ["packages/core/src/agent-runtime.ts"],
      finalStatus: "completed" as const,
      sessionId: "ses_retrospective_secret",
      taskGoal: "Create safe retrospective",
      taskId: "task_retrospective_secret",
      terminalMessage: "Task completed with enough evidence.",
      terminalReason: "completed",
      terminalStatus: "completed" as const
    });

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    expect(
      validateRetrospectiveReview({
        ...generated.value,
        nextTimeImprovements: [
          {
            evidenceEventIds: ["evt_completed"],
            summary: "OPENAI_API_KEY=sk-test-secret"
          }
        ]
      }).ok
    ).toBe(false);
    expect(
      validateRetrospectiveReview({
        ...generated.value,
        rawOutput: "provider stdout"
      } as unknown as Parameters<typeof validateRetrospectiveReview>[0]).ok
    ).toBe(false);
  });

  it("selects bounded deterministic memory influence candidates without exposing secrets", () => {
    const result = selectMemoryInfluenceCandidates({
      limit: 2,
      taskGoal: "validate story 4.5 memory influence with rtk commands",
      sources: [
        {
          confidence: "medium",
          content: "Use rtk run for validation commands in this repository.",
          provenance: "durable project memory",
          sourceEventIds: ["evt_memory_saved"],
          sourceId: "mem_rtk",
          sourceTaskId: "task_4_2",
          sourceType: "memory_entry",
          type: "semantic"
        },
        {
          content:
            "Story 4.4 lesson: memory influence should cite event evidence.",
          provenance: "learning review lesson",
          sourceEventIds: ["evt_learning_review"],
          sourceId: "lesson_story_4_4",
          sourceSessionId: "ses_prior",
          sourceTaskId: "task_4_4",
          sourceType: "learning_review_lesson",
          type: "lesson"
        },
        {
          confidence: "high",
          content: "OPENAI_API_KEY=sk-test-secret should never leak.",
          sourceEventIds: ["evt_secret"],
          sourceId: "mem_secret",
          sourceType: "memory_entry",
          type: "semantic"
        },
        {
          confidence: "high",
          content: "Completely unrelated release note.",
          sourceId: "mem_unrelated",
          sourceType: "memory_entry",
          type: "semantic"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.map((candidate) => candidate.sourceId)).toEqual([
      "lesson_story_4_4",
      "mem_rtk"
    ]);
    expect(result.value).toHaveLength(2);
    expect(JSON.stringify(result.value)).not.toContain("sk-test-secret");
    expect(JSON.stringify(result.value)).not.toContain("OPENAI_API_KEY=");
  });

  it("does not select influence candidates that have no task-term overlap", () => {
    const result = selectMemoryInfluenceCandidates({
      taskGoal: "validate runtime event evidence",
      sources: [
        {
          confidence: "high",
          content: "Completely unrelated release note.",
          sourceEventIds: ["evt_unrelated_memory"],
          sourceId: "mem_unrelated_high",
          sourceType: "memory_entry",
          type: "semantic"
        },
        {
          content: "Prior lesson about visual polish and copywriting.",
          sourceEventIds: ["evt_unrelated_lesson"],
          sourceId: "lesson_unrelated",
          sourceSessionId: "ses_prior",
          sourceTaskId: "task_prior",
          sourceType: "learning_review_lesson",
          type: "lesson"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual([]);
  });

  it("validates memory influence records by status and rejects raw or secret-looking values", () => {
    const baseRecord = {
      correlationId: "corr_memory_influence",
      createdAt: "2026-05-09T12:30:00.000Z",
      evidenceEventIds: ["evt_current_plan"],
      preview: "Use rtk run for validation commands.",
      schemaVersion: MEMORY_INFLUENCE_SCHEMA_VERSION,
      sessionId: "ses_memory_influence",
      sourceEventIds: ["evt_memory_saved"],
      sourceId: "mem_rtk",
      sourceTaskId: "task_4_2",
      sourceType: "memory_entry" as const,
      taskId: "task_4_5"
    };

    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        influenceSummary:
          "The plan selected rtk validation because memory said so.",
        status: "used"
      }).ok
    ).toBe(true);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        reason: "The stored hint did not apply to this runtime path.",
        status: "ignored"
      }).ok
    ).toBe(true);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        reason: "Current evidence showed direct npm execution was unsafe here.",
        sourceType: "learning_review_lesson",
        status: "contradicted"
      }).ok
    ).toBe(true);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        status: "used"
      }).ok
    ).toBe(false);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        status: "ignored"
      }).ok
    ).toBe(false);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        influenceSummary: "OPENAI_API_KEY=sk-test-secret",
        status: "used"
      }).ok
    ).toBe(false);
    expect(
      validateMemoryInfluenceRecord({
        ...baseRecord,
        influenceSummary: "Unsafe raw field should be rejected.",
        rawOutput: "provider stdout",
        status: "used"
      } as unknown as Parameters<typeof validateMemoryInfluenceRecord>[0]).ok
    ).toBe(false);
  });
});
