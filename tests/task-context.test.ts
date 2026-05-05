import { describe, expect, it } from "vitest";
import {
  assembleTaskContextPacket,
  TASK_CONTEXT_PACKET_SCHEMA_VERSION,
  TASK_CONTEXT_SOURCE_ORDER,
  summarizeTaskContextPacket,
  type CompactedSessionContext,
  type TaskContextAssemblyInput
} from "@sprite/core";
import type { ProjectContextLoadResult } from "@sprite/config";

function createAssemblyInput(
  overrides: Partial<TaskContextAssemblyInput> = {}
): TaskContextAssemblyInput {
  return {
    task: "inspect the runtime context packet",
    startup: {
      cwd: "/tmp/sprite-project",
      globalConfigLoaded: false,
      globalConfigPath: "/tmp/sprite-home/.sprite/config.json",
      model: "gpt-5.4",
      outputFormat: "json",
      projectConfigLoaded: true,
      projectConfigPath: "/tmp/sprite-project/.sprite/config.json",
      provider: "openai-compatible",
      safetyRules: [],
      sandboxMode: "workspace-write",
      validationCommands: [{ command: "npm", args: ["test"] }],
      warnings: []
    },
    provider: {
      auth: {
        authenticated: true,
        secretRedacted: true,
        source: "environment"
      },
      baseUrl: null,
      capabilities: {
        contextWindowTokens: 128_000,
        modelIdentity: "gpt-5.4",
        supportsStreaming: true,
        supportsToolCalls: false
      },
      model: "gpt-5.4",
      providerName: "openai-compatible"
    },
    projectContext: createProjectContext(),
    sessionState: {
      correlationId: "corr_test",
      currentPhase: "plan",
      restoredEventCount: 0,
      resumed: false,
      sessionId: "ses_test",
      status: "planned",
      taskId: "task_test"
    },
    ...overrides
  };
}

function createProjectContext(): ProjectContextLoadResult {
  return {
    blockedCount: 0,
    cwd: "/tmp/sprite-project",
    loadedCount: 1,
    records: [
      {
        absolutePath: "/tmp/sprite-project/AGENTS.md",
        bytesRead: 21,
        content: "Use rtk for commands.",
        fileName: "AGENTS.md",
        preview: "Use rtk for commands.",
        priority: 1,
        redacted: false,
        relativePath: "AGENTS.md",
        status: "loaded",
        totalBytes: 21,
        truncated: false,
        trust: "untrusted"
      }
    ],
    skippedCount: 3,
    truncatedCount: 0,
    warning:
      "Project context files are untrusted repository guidance with lower priority than runtime/system policy."
  };
}

describe("task context packet assembly", () => {
  it("assembles sections in canonical order with safe summaries", () => {
    const packet = assembleTaskContextPacket(createAssemblyInput());

    expect(packet.schemaVersion).toBe(TASK_CONTEXT_PACKET_SCHEMA_VERSION);
    expect(packet.sourceOrder).toEqual(TASK_CONTEXT_SOURCE_ORDER);
    expect(packet.sections.map((section) => section.source)).toEqual(
      TASK_CONTEXT_SOURCE_ORDER
    );
    expect(packet.summary.sources).toEqual(TASK_CONTEXT_SOURCE_ORDER);
    expect(packet.summary.includedCount).toBe(5);
    expect(packet.summary.skippedCount).toBe(3);

    expect(packet.sections[0]).toMatchObject({
      source: "runtime-self-model",
      status: "included",
      trust: "trusted"
    });
    expect(packet.sections[1]).toMatchObject({
      source: "provider-limits",
      status: "included",
      trust: "trusted"
    });
    expect(packet.sections[4]).toMatchObject({
      source: "compacted-context",
      status: "skipped"
    });
    expect(packet.sections[5]).toMatchObject({
      source: "project-context",
      status: "included",
      trust: "untrusted"
    });
    expect(packet.sections[6]).toMatchObject({
      source: "memory",
      status: "skipped"
    });
    expect(packet.sections[7]).toMatchObject({
      source: "skills",
      status: "skipped"
    });
  });

  it("includes compacted continuity and bounded newer event notes when available", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        compactedContext: createCompactedContext()
      })
    );
    const compactedSection = packet.sections.find(
      (section) => section.source === "compacted-context"
    );

    expect(compactedSection).toMatchObject({
      metadata: expect.objectContaining({
        artifactId: "cmp-context-001",
        compactionEventId: "evt_context_compacted",
        noteCodes: ["COMPACTED_CONTEXT_SUPERSEDED"],
        omittedRecentEventCount: 0,
        recentEventCount: 1
      }),
      status: "included",
      trust: "trusted"
    });
    expect(compactedSection?.content).toContain(
      "Continue the compacted task goal."
    );
    expect(compactedSection?.content).toContain("newer steering event");
    expect(JSON.stringify(compactedSection)).not.toContain("sk-test-secret");
  });

  it("redacts secret-looking compacted context values", () => {
    const compactedContext = createCompactedContext();
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        compactedContext: {
          ...compactedContext,
          recentEvents: [
            {
              ...compactedContext.recentEvents[0],
              summary:
                "task.steering.received: newer steering event with OPENAI_API_KEY=sk-test-secret"
            }
          ]
        }
      })
    );
    const compactedSection = packet.sections.find(
      (section) => section.source === "compacted-context"
    );

    expect(compactedSection).toMatchObject({
      redacted: true,
      status: "redacted"
    });
    expect(JSON.stringify(compactedSection)).not.toContain("sk-test-secret");
    expect(JSON.stringify(compactedSection)).toContain("[REDACTED]");
  });

  it("redacts secret-like user input and blocks unsafe memory entries", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        memoryEntries: [
          {
            content: "Remember OPENAI_API_KEY=sk-test-secret for later.",
            provenance: "unit-test",
            type: "working"
          }
        ],
        task: "debug OPENAI_API_KEY=sk-test-secret without leaking it"
      })
    );

    const serialized = JSON.stringify(packet);

    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).toContain("[REDACTED]");
    expect(
      packet.sections.find((section) => section.source === "user-input")
    ).toMatchObject({
      redacted: true,
      status: "redacted"
    });
    expect(
      packet.sections.find((section) => section.source === "memory")
    ).toMatchObject({
      redacted: true,
      status: "blocked"
    });
  });

  it("summarizes packets without exposing raw section content", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        task: "debug OPENAI_API_KEY=sk-test-secret without leaking it"
      })
    );
    const summary = summarizeTaskContextPacket(packet);

    expect(summary.sources).toEqual(TASK_CONTEXT_SOURCE_ORDER);
    expect(summary.redactedCount).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("sk-test-secret");
  });
});

function createCompactedContext(): CompactedSessionContext {
  return {
    artifactId: "cmp-context-001",
    artifactPath:
      "/tmp/sprite-project/.sprite/sessions/ses_test/compactions/cmp-context-001.json",
    compactionEventId: "evt_context_compacted",
    compactedAt: "2026-05-04T01:05:00.000Z",
    notes: [
      {
        code: "COMPACTED_CONTEXT_SUPERSEDED",
        field: "nextSteps",
        message:
          "Newer session state superseded compacted next steps during context assembly."
      }
    ],
    omittedRecentEventCount: 0,
    recentEvents: [
      {
        createdAt: "2026-05-04T01:06:00.000Z",
        eventId: "evt_newer_steering",
        summary: "task.steering.received: newer steering event",
        type: "task.steering.received"
      }
    ],
    source: {
      eventCount: 2,
      eventRange: {
        firstEventId: "evt_started",
        lastEventId: "evt_waiting"
      }
    },
    summary: {
      schemaVersion: 1,
      kind: "session.compaction.summary",
      sessionId: "ses_test",
      createdAt: "2026-05-04T01:05:00.000Z",
      triggerReason: "manual",
      status: "created",
      continuity: {
        taskGoal: "Continue the compacted task goal.",
        activeConstraints: ["Use rtk for commands."],
        decisions: ["Use compacted context as resume continuity."],
        currentPlan: ["Resume from compacted context."],
        progress: ["Compaction summary exists."],
        filesTouched: ["packages/core/src/compaction.ts"],
        commandsRun: ["rtk run npm test -- --run tests/compaction.test.ts"],
        failures: ["Previous validation failed before compaction."],
        pendingApprovals: ["Approval metadata only; do not replay payloads."],
        nextSteps: ["Continue implementation from compacted context."]
      },
      metrics: {},
      source: {
        eventCount: 2,
        eventRange: {
          firstEventId: "evt_started",
          lastEventId: "evt_waiting"
        }
      },
      largeOutputReferences: [],
      safety: {
        largeRawOutputsEmbedded: false,
        redacted: false
      }
    }
  };
}
