import { describe, expect, it } from "vitest";
import {
  createMemoryCandidate,
  evaluateSafetySensitiveContent
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
        content: "token sk-test-secret",
        path: undefined,
        expectedRule: "safety.openai_token.block"
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
});
