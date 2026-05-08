import { describe, expect, it } from "vitest";
import {
  assembleTaskContextPacket,
  TASK_CONTEXT_PACKET_SCHEMA_VERSION,
  TASK_CONTEXT_SOURCE_ORDER,
  summarizeTaskContextPacket,
  updateTaskContextWorkingMemory,
  type CompactedSessionContext,
  type TaskContextAssemblyInput,
  type WorkingMemorySnapshot
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

function createWorkingMemorySnapshot(
  overrides: Partial<WorkingMemorySnapshot> = {}
): WorkingMemorySnapshot {
  return {
    blockers: [],
    commandsRun: [],
    currentGoal: "Maintain working memory and runtime self-model.",
    currentPlan: ["Add working-memory source."],
    decisions: [],
    filesTouched: [],
    pendingConstraints: [],
    recentObservations: [],
    schemaVersion: 1,
    scope: "task",
    sessionId: "ses_test",
    sourceEventIds: [],
    taskId: "task_test",
    updatedAt: "2026-05-08T01:10:00.000Z",
    ...overrides
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
    expect(packet.summary.skippedCount).toBe(4);

    expect(packet.sections[0]).toMatchObject({
      source: "runtime-self-model",
      status: "included",
      trust: "trusted"
    });
    expect(packet.sections[1]).toMatchObject({
      source: "working-memory",
      status: "skipped",
      trust: "trusted"
    });
    expect(packet.sections[2]).toMatchObject({
      source: "provider-limits",
      status: "included",
      trust: "trusted"
    });
    expect(packet.sections[5]).toMatchObject({
      source: "compacted-context",
      status: "skipped"
    });
    expect(packet.sections[6]).toMatchObject({
      source: "project-context",
      status: "included",
      trust: "untrusted"
    });
    expect(packet.sections[7]).toMatchObject({
      source: "memory",
      status: "skipped"
    });
    expect(packet.sections[8]).toMatchObject({
      source: "skills",
      status: "skipped"
    });
  });

  it("includes task-scoped working memory as a first-class trusted section", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        workingMemory: createWorkingMemorySnapshot({
          blockers: ["Need user steering before risky work."],
          commandsRun: [
            {
              command: "rtk run 'npm test -- --run tests/task-context.test.ts'",
              eventId: "evt_validation_started",
              status: "planned"
            }
          ],
          currentGoal: "Maintain working memory and runtime self-model.",
          currentPlan: [
            "Add working-memory source.",
            "Expand runtime self-model."
          ],
          decisions: ["Keep durable memory retrieval out of Story 4.1."],
          filesTouched: ["packages/core/src/task-context.ts"],
          pendingConstraints: [
            "Do not promote working memory to durable memory."
          ],
          recentObservations: [
            {
              createdAt: "2026-05-08T01:10:00.000Z",
              eventId: "evt_plan_observed",
              kind: "observation",
              summary: "Task context assembly needs a dedicated source."
            }
          ],
          sourceEventIds: ["evt_plan_observed", "evt_validation_started"],
          updatedAt: "2026-05-08T01:10:00.000Z"
        })
      })
    );
    const workingMemorySection = packet.sections.find(
      (section) => section.source === "working-memory"
    );

    expect(workingMemorySection).toMatchObject({
      metadata: expect.objectContaining({
        available: true,
        blockerCount: 1,
        commandCount: 1,
        containsUserDerivedContent: true,
        constraintCount: 1,
        decisionCount: 1,
        fileCount: 1,
        observationCount: 1,
        planStepCount: 2,
        scope: "task",
        sessionId: "ses_test",
        sourceEventCount: 2,
        sourceEventCountTotal: 2,
        taskId: "task_test"
      }),
      status: "included",
      trust: "trusted"
    });
    expect(workingMemorySection?.content).toContain(
      "Maintain working memory"
    );
    expect(workingMemorySection?.content).toContain(
      "packages/core/src/task-context"
    );
    expect(workingMemorySection?.content).toContain("Commands:");
    expect(workingMemorySection?.content).toContain("Constraints:");
    expect(workingMemorySection?.content).toContain("Authority:");
    expect(packet.summary.sources).toEqual(TASK_CONTEXT_SOURCE_ORDER);
  });

  it("upserts working memory when refreshing an older packet without that section", () => {
    const packet = assembleTaskContextPacket(createAssemblyInput());
    const olderPacket = {
      ...packet,
      sections: packet.sections.filter(
        (section) => section.source !== "working-memory"
      ),
      sourceOrder: packet.sourceOrder.filter(
        (source) => source !== "working-memory"
      )
    };
    const updatedPacket = updateTaskContextWorkingMemory(
      olderPacket,
      createWorkingMemorySnapshot({
        currentGoal: "Refresh a restored packet safely.",
        sourceEventIds: ["evt_restored"]
      })
    );

    expect(updatedPacket.sourceOrder).toEqual(TASK_CONTEXT_SOURCE_ORDER);
    expect(updatedPacket.sections.map((section) => section.source)).toEqual(
      TASK_CONTEXT_SOURCE_ORDER
    );
    expect(
      updatedPacket.sections.find((section) => section.source === "working-memory")
    ).toMatchObject({
      metadata: expect.objectContaining({
        sourceEventIds: ["evt_restored"]
      }),
      status: "included"
    });
  });

  it("redacts secret-looking working memory values", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        workingMemory: {
          blockers: [],
          commandsRun: [],
          currentGoal: "Debug OPENAI_API_KEY=sk-test-secret safely.",
          currentPlan: ["Redact the secret from working memory context."],
          decisions: [],
          filesTouched: [],
          pendingConstraints: [],
          recentObservations: [],
          schemaVersion: 1,
          scope: "session",
          sessionId: "ses_test",
          sourceEventIds: [],
          taskId: "task_test",
          updatedAt: "2026-05-08T01:12:00.000Z"
        }
      })
    );
    const serialized = JSON.stringify(packet);
    const workingMemorySection = packet.sections.find(
      (section) => section.source === "working-memory"
    );

    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).toContain("[REDACTED]");
    expect(workingMemorySection).toMatchObject({
      redacted: true,
      status: "redacted"
    });
  });

  it("bounds working-memory provenance metadata and preserves required category labels", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        workingMemory: {
          blockers: ["wait for approval before applying the risky edit"],
          commandsRun: Array.from({ length: 6 }, (_, index) => ({
            command: `rtk run 'npm test -- test-${index}'`,
            eventId: `evt_command_${index}`,
            status: "completed" as const
          })),
          currentGoal: "x".repeat(600),
          currentPlan: Array.from(
            { length: 6 },
            (_, index) => `plan step ${index}`
          ),
          decisions: ["keep durable memory out of this story"],
          filesTouched: ["packages/core/src/task-context.ts"],
          pendingConstraints: ["do not store raw command output"],
          recentObservations: Array.from({ length: 6 }, (_, index) => ({
            eventId: `evt_observation_${index}`,
            kind: "observation" as const,
            summary: `observation ${index}`
          })),
          schemaVersion: 1,
          scope: "task",
          sessionId: "ses_test",
          sourceEventIds: Array.from(
            { length: 30 },
            (_, index) => `evt_${index}`
          ),
          sourceEventTotalCount: 30,
          taskId: "task_test",
          updatedAt: "2026-05-08T01:12:00.000Z"
        }
      })
    );
    const workingMemorySection = packet.sections.find(
      (section) => section.source === "working-memory"
    );

    expect(workingMemorySection?.metadata).toMatchObject({
      sourceEventCount: 12,
      sourceEventCountTotal: 30
    });
    expect(
      workingMemorySection?.metadata.sourceEventIds as readonly string[]
    ).toHaveLength(12);
    expect(workingMemorySection?.content).toContain("Plan");
    expect(workingMemorySection?.content).toContain("Observations");
    expect(workingMemorySection?.content).toContain("Files");
    expect(workingMemorySection?.content).toContain("Commands");
    expect(workingMemorySection?.content).toContain("Constraints");
    expect(workingMemorySection?.content).toContain("Decisions");
    expect(workingMemorySection?.content).toContain("Blockers");
  });

  it("preserves working-memory category labels under a tight content budget", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        workingMemory: createWorkingMemorySnapshot({
          blockers: ["wait for approval before applying the risky edit"],
          commandsRun: Array.from({ length: 6 }, (_, index) => ({
            command: `rtk run 'npm test -- test-${index}'`,
            eventId: `evt_command_${index}`,
            status: "completed" as const
          })),
          currentGoal: "x".repeat(600),
          currentPlan: Array.from(
            { length: 6 },
            (_, index) => `plan step ${index}`
          ),
          decisions: ["keep durable memory out of this story"],
          filesTouched: ["packages/core/src/task-context.ts"],
          pendingConstraints: ["do not store raw command output"],
          recentObservations: Array.from({ length: 6 }, (_, index) => ({
            eventId: `evt_observation_${index}`,
            kind: "observation" as const,
            summary: `observation ${index}`
          }))
        })
      }),
      { sectionContentMaxLength: 160 }
    );
    const workingMemorySection = packet.sections.find(
      (section) => section.source === "working-memory"
    );

    expect(workingMemorySection?.content).toContain("Plan");
    expect(workingMemorySection?.content).toContain("Observations");
    expect(workingMemorySection?.content).toContain("Files");
    expect(workingMemorySection?.content).toContain("Commands");
    expect(workingMemorySection?.content).toContain("Constraints");
    expect(workingMemorySection?.content).toContain("Decisions");
    expect(workingMemorySection?.content).toContain("Blockers");
    expect(workingMemorySection?.content).toContain("Authority");
  });

  it("reports runtime self-model state without overclaiming unavailable capabilities", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        provider: null,
        skillEntries: []
      })
    );
    const selfModelSection = packet.sections.find(
      (section) => section.source === "runtime-self-model"
    );

    expect(selfModelSection).toMatchObject({
      metadata: expect.objectContaining({
        approvalPolicy: "policy-governed",
        candidateStoreAvailable: false,
        durableRetrievalAvailable: false,
        fileEditApproval: "policy-governed",
        pendingApprovalCount: 0,
        providerConfigured: false,
        providerDrivenToolExecution: "not-connected",
        providerDrivenToolExecutionAvailable: false,
        riskyCommandApproval: "policy-governed",
        skillRegistryLoaded: false,
        toolExecutionEnabled: false,
        toolNames: [
          "apply_patch",
          "list_files",
          "read_file",
          "run_command",
          "search_files"
        ],
        toolsAvailable: true,
        workingMemoryAvailable: false
      }),
      status: "included",
      trust: "trusted"
    });
    expect(selfModelSection?.content).toContain(
      "Provider-driven tool execution is not connected"
    );
    expect(selfModelSection?.content).toContain(
      "Durable memory retrieval is not implemented"
    );
    expect(selfModelSection?.content).toContain(
      "Risky commands and file edits remain policy-governed"
    );
  });

  it("redacts secret-looking runtime self-model metadata", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        provider: {
          auth: {
            authenticated: true,
            secretRedacted: true,
            source: "environment"
          },
          baseUrl: null,
          capabilities: {
            contextWindowTokens: 128_000,
            modelIdentity: "OPENAI_API_KEY=sk-test-secret",
            supportsStreaming: true,
            supportsToolCalls: false
          },
          model: "OPENAI_API_KEY=sk-test-secret",
          providerName: "OPENAI_API_KEY=sk-test-secret"
        },
        skillEntries: [
          {
            name: "OPENAI_API_KEY=sk-test-secret"
          }
        ],
        startup: {
          ...createAssemblyInput().startup,
          cwd: "/tmp/OPENAI_API_KEY=sk-test-secret/project"
        }
      })
    );
    const selfModelSection = packet.sections.find(
      (section) => section.source === "runtime-self-model"
    );
    const serialized = JSON.stringify(selfModelSection);

    expect(selfModelSection).toMatchObject({
      redacted: true,
      status: "redacted"
    });
    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redacts secret-looking provider limits metadata in the full packet", () => {
    const packet = assembleTaskContextPacket(
      createAssemblyInput({
        provider: {
          auth: {
            authenticated: true,
            secretRedacted: true,
            source: "environment"
          },
          baseUrl: null,
          capabilities: {
            contextWindowTokens: 128_000,
            modelIdentity: "OPENAI_API_KEY=sk-test-secret",
            supportsStreaming: true,
            supportsToolCalls: false
          },
          model: "OPENAI_API_KEY=sk-test-secret",
          providerName: "OPENAI_API_KEY=sk-test-secret"
        }
      })
    );
    const providerSection = packet.sections.find(
      (section) => section.source === "provider-limits"
    );
    const serialized = JSON.stringify(providerSection);

    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).toContain("[REDACTED]");
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
