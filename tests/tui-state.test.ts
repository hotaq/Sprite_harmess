import { describe, expect, it } from "vitest";
import {
  createTuiRuntimeState,
  createTuiStartupState,
  formatTuiStateSummary,
  type TuiSkillCandidateInput
} from "@sprite/tui";
import type {
  BootstrapState,
  PlannedExecutionFlow,
  RuntimeSelfModelSnapshot,
  TaskContextPacket
} from "@sprite/core";

describe("TUI state adapter", () => {
  it("derives startup state from bootstrap/runtime snapshots without leaking secrets", () => {
    const bootstrapState = createBootstrapState({
      cwd: "/tmp/project/OPENAI_API_KEY=sk-secret/Sprite_harmess",
      warnings: ["TOKEN=super-secret should be redacted"]
    });
    const runtimeSnapshot = createRuntimeSnapshot({
      cwd: "/tmp/project/OPENAI_API_KEY=sk-secret/Sprite_harmess",
      skillNames: ["manual-review", "OPENAI_API_KEY"]
    });

    const state = createTuiStartupState({
      bootstrapState,
      runtimeSnapshot,
      skillCandidates: [
        { lifecycleStatus: "draft", name: "extract-test-helper" }
      ]
    });
    const serialized = JSON.stringify(state);
    const summary = formatTuiStateSummary(state);

    expect(state.workspace.adapter).toBe("tui");
    expect(state.workspace.interfaces).toContain("tui");
    expect(state.workspace.cwd.redacted).toBe(true);
    expect(state.provider.auth).toBe("configured-redacted");
    expect(state.skills.activeCount).toBe(2);
    expect(state.skills.names.redactedCount).toBe(1);
    expect(state.skillCandidates.relationship).toBe(
      "candidates-not-active-skills"
    );
    expect(state.skillCandidates.totalCount).toBe(1);
    expect(summary).toContain("[REDACTED]");
    expect(serialized).not.toContain("sk-secret");
    expect(summary).not.toContain("sk-secret");
    expect(serialized).not.toContain("TOKEN=super-secret");
  });

  it("keeps runtime lifecycle derived from PlannedExecutionFlow and event input", () => {
    const packet = createTaskContextPacket();
    const flow = createPlannedExecutionFlow(packet);
    const runtimeSnapshot = createRuntimeSnapshot({
      skillNames: ["typescript-advanced-types"]
    });

    const state = createTuiRuntimeState({
      events: [
        {
          correlationId: "corr-1",
          createdAt: "2026-05-11T00:00:00.000Z",
          eventId: "evt-1",
          payload: {
            message: "Runtime is waiting for steering.",
            reason: "steering-required"
          },
          schemaVersion: 1,
          sessionId: "sess-1",
          taskId: "task-1",
          type: "task.waiting"
        }
      ],
      flow,
      runtimeSnapshot,
      taskContextPacket: packet
    });

    expect(state.session.status).toBe(flow.status);
    expect(state.session.currentPhase).toBe(flow.currentPhase);
    expect(state.events.count).toBe(1);
    expect(state.events.latestType).toBe("task.waiting");
    expect(state.context.loadedCount).toBe(1);
    expect(state.memory.entryCount).toBe(2);
    expect(state.warnings.count).toBe(0);
    expect(formatTuiStateSummary(state)).not.toMatch(/\u001b\[/u);
  });

  it("does not classify normal runtime event summaries as warnings", () => {
    const packet = createTaskContextPacket();
    const flow = createPlannedExecutionFlow(packet);

    const state = createTuiRuntimeState({
      events: [
        {
          correlationId: "corr-1",
          createdAt: "2026-05-11T00:00:00.000Z",
          eventId: "evt-1",
          payload: {
            command: "npm test",
            durationMs: 42,
            exitCode: 0,
            status: "passed",
            summary: "Validation completed successfully.",
            validationId: "validation-1"
          },
          schemaVersion: 1,
          sessionId: "sess-1",
          taskId: "task-1",
          type: "validation.completed"
        }
      ],
      flow,
      taskContextPacket: packet
    });

    expect(state.events.latestType).toBe("validation.completed");
    expect(state.warnings.count).toBe(0);
    expect(formatTuiStateSummary(state)).toContain("warnings: [OK] 0");
  });

  it("bounds broad status output and keeps candidates separate from active skills", () => {
    const candidateInputs: TuiSkillCandidateInput[] = [
      { lifecycleStatus: "draft", name: "candidate-1" },
      { lifecycleStatus: "draft", name: "candidate-2" },
      { lifecycleStatus: "pending-review", name: "candidate-3" },
      { lifecycleStatus: "rejected", name: "candidate-4" },
      { lifecycleStatus: "draft", name: "candidate-5" },
      { lifecycleStatus: "draft", name: "candidate-6" }
    ];

    const state = createTuiStartupState({
      bootstrapState: createBootstrapState({}),
      runtimeSnapshot: createRuntimeSnapshot({
        skillNames: ["promoted-skill"]
      }),
      skillCandidates: candidateInputs
    });
    const summary = formatTuiStateSummary(state);

    expect(state.skills.names.values).toEqual(["promoted-skill"]);
    expect(state.skillCandidates.names.values).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
      "candidate-4",
      "candidate-5"
    ]);
    expect(state.skillCandidates.names.hiddenCount).toBe(1);
    expect(state.skillCandidates.byStatus).toMatchObject({
      draft: 4,
      "pending-review": 1,
      rejected: 1
    });
    expect(summary).toContain("skills: [ACTIVE] 1 active / promoted-skill");
    expect(summary).toContain("candidates: [CANDIDATE] 6 candidates");
  });
});

function createBootstrapState(input: {
  cwd?: string;
  warnings?: readonly string[];
}): BootstrapState {
  const cwd = input.cwd ?? "/tmp/project/Sprite_harmess";

  return {
    implemented: false,
    interfaces: ["cli"],
    message: "Bootstrap state loaded.",
    projectContext: {
      blockedCount: 0,
      cwd,
      loadedCount: 1,
      records: [
        {
          absolutePath: `${cwd}/AGENTS.md`,
          bytesRead: 120,
          content: "Project instructions",
          fileName: "AGENTS.md",
          preview: "Project instructions",
          priority: 1,
          redacted: false,
          relativePath: "AGENTS.md",
          status: "loaded",
          totalBytes: 120,
          truncated: false,
          trust: "untrusted"
        }
      ],
      skippedCount: 2,
      truncatedCount: 0,
      warning: "Project context is untrusted."
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
        modelIdentity: "gpt-test",
        supportsStreaming: true,
        supportsToolCalls: true
      },
      model: "gpt-test",
      providerName: "openai-compatible"
    },
    startup: {
      cwd,
      globalConfigLoaded: false,
      globalConfigPath: "/tmp/home/.sprite/config.json",
      model: "gpt-test",
      outputFormat: "text",
      projectConfigLoaded: true,
      projectConfigPath: `${cwd}/.sprite/config.json`,
      provider: "openai-compatible",
      safetyRules: [],
      sandboxMode: "workspace-write",
      validationCommands: [{ command: "npm test", name: "test" }],
      warnings: [...(input.warnings ?? [])]
    },
    warnings: [...(input.warnings ?? [])]
  };
}

function createRuntimeSnapshot(input: {
  cwd?: string;
  skillNames?: readonly string[];
}): RuntimeSelfModelSnapshot {
  const skillNames = input.skillNames ?? [];

  return {
    context: {
      compactedContextAvailable: false,
      packetSchemaVersion: 1,
      sourceOrder: ["runtime-self-model", "project-context", "memory", "skills"]
    },
    generatedAt: "2026-05-11T00:00:00.000Z",
    limitations: [],
    memory: {
      candidateStoreAvailable: true,
      durableRetrievalAvailable: true,
      providerName: "local-artifact",
      safetyRulesCount: 0,
      workingMemoryAvailable: true
    },
    provider: {
      auth: "configured-redacted",
      configured: true,
      contextWindowTokens: 128_000,
      model: "gpt-test",
      modelIdentity: "gpt-test",
      providerName: "openai-compatible",
      supportsStreaming: true,
      supportsToolCalls: true
    },
    sandbox: {
      approvalPolicy: "policy-governed",
      cwd: input.cwd ?? "/tmp/project/Sprite_harmess",
      fileEditApproval: "policy-governed",
      mode: "workspace-write",
      outputFormat: "text",
      pendingApprovalCount: 0,
      riskyCommandApproval: "policy-governed",
      validationCommandCount: 1
    },
    skills: {
      invocationModes: skillNames.length > 0 ? ["manual"] : [],
      loaded: skillNames.length > 0,
      names: skillNames,
      source: skillNames.length > 0 ? "manual" : "not-loaded",
      sources: skillNames.length > 0 ? ["project"] : []
    },
    tools: {
      available: true,
      names: ["read_file", "search_files"],
      providerDrivenExecutionAvailable: false,
      unavailableReason: "Provider tool execution is disabled in test."
    }
  };
}

function createTaskContextPacket(): TaskContextPacket {
  return {
    schemaVersion: 1,
    sections: [
      {
        metadata: {
          blockedCount: 0,
          loadedCount: 1,
          skippedCount: 2,
          truncatedCount: 0
        },
        priority: 1,
        redacted: false,
        source: "project-context",
        status: "included",
        summary: "Project context loaded.",
        title: "Project context",
        trust: "untrusted"
      },
      {
        metadata: {
          entryCount: 2,
          includedCount: 2
        },
        priority: 2,
        redacted: false,
        source: "memory",
        status: "included",
        summary: "Memory summaries loaded.",
        title: "Memory",
        trust: "governed"
      },
      {
        metadata: {
          names: ["typescript-advanced-types"],
          skillCount: 1
        },
        priority: 3,
        redacted: false,
        source: "skills",
        status: "included",
        summary: "Skills loaded.",
        title: "Skills",
        trust: "procedural"
      }
    ],
    sourceOrder: ["project-context", "memory", "skills"],
    summary: {
      blockedCount: 0,
      includedCount: 3,
      redactedCount: 0,
      sections: [],
      skippedCount: 0,
      sources: ["project-context", "memory", "skills"]
    }
  };
}

function createPlannedExecutionFlow(
  packet: TaskContextPacket
): PlannedExecutionFlow {
  const bootstrapState = createBootstrapState({});

  return {
    correlationId: "corr-1",
    currentPhase: "act",
    events: [],
    fileActivity: [],
    intents: [],
    request: {
      allowedDefaults: {
        outputFormat: bootstrapState.startup.outputFormat,
        sandboxMode: bootstrapState.startup.sandboxMode,
        toolExecutionEnabled: false
      },
      contextPacket: packet,
      cwd: bootstrapState.startup.cwd,
      provider: bootstrapState.provider,
      startup: bootstrapState.startup,
      stopConditions: {
        maxIterations: 1,
        stopOnApprovalRequired: true,
        stopOnProviderError: true
      },
      task: "Show runtime state."
    },
    sessionId: "sess-1",
    status: "waiting-for-input",
    steps: [
      {
        phase: "plan",
        status: "completed",
        summary: "Plan created."
      }
    ],
    summary: "Waiting for user input.",
    taskId: "task-1",
    terminalState: null,
    waitingState: {
      message: "Runtime is waiting for steering.",
      reason: "steering-required"
    },
    warnings: []
  };
}
