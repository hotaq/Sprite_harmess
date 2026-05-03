import { describe, expect, it } from "vitest";
import {
  assembleTaskContextPacket,
  TASK_CONTEXT_PACKET_SCHEMA_VERSION,
  TASK_CONTEXT_SOURCE_ORDER,
  summarizeTaskContextPacket,
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
    expect(packet.summary.skippedCount).toBe(2);

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
      source: "project-context",
      status: "included",
      trust: "untrusted"
    });
    expect(packet.sections[5]).toMatchObject({
      source: "memory",
      status: "skipped"
    });
    expect(packet.sections[6]).toMatchObject({
      source: "skills",
      status: "skipped"
    });
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
