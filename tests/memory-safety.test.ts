import { describe, expect, it } from "vitest";
import {
  createMemoryCandidate,
  createMemoryEntryFromCandidate,
  evaluateSafetySensitiveContent,
  getMemoryCandidateLifecycleStatus,
  reviewMemoryCandidate,
  shouldAutoSaveMemoryCandidate,
  summarizeMemoryCandidateForReview,
  validateMemoryCandidateEdit
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
});
