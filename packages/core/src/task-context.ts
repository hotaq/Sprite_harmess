import type {
  ProjectContextFileRecord,
  ProjectContextLoadResult,
  ResolvedStartupConfig
} from "@sprite/config";
import type { CompactedSessionContext } from "./compaction.js";
import {
  evaluateSafetySensitiveContent,
  type MemoryType
} from "@sprite/memory";
import type { ResolvedProviderState } from "@sprite/providers";
import type { ToolName } from "@sprite/tools";
import { containsSecretLikeValue, createRedactedPreview } from "@sprite/shared";

export const TASK_CONTEXT_PACKET_SCHEMA_VERSION = 1 as const;
export const TASK_CONTEXT_SOURCE_ORDER = [
  "runtime-self-model",
  "working-memory",
  "provider-limits",
  "user-input",
  "session-state",
  "compacted-context",
  "project-context",
  "memory",
  "skills"
] as const;

const DEFAULT_SECTION_CONTENT_MAX_LENGTH = 480;
const DEFAULT_PROJECT_CONTEXT_CONTENT_MAX_LENGTH = 1_200;
const RUNTIME_TOOL_NAMES = [
  "apply_patch",
  "list_files",
  "read_file",
  "run_command",
  "search_files"
] as const satisfies readonly ToolName[];
const WORKING_MEMORY_SOURCE_EVENT_ID_LIMIT = 12;
const WORKING_MEMORY_LIST_ITEM_LIMIT = 2;
const WORKING_MEMORY_PREVIEW_MAX_LENGTH = 48;

export type TaskContextSourceKind = (typeof TASK_CONTEXT_SOURCE_ORDER)[number];
export type TaskContextSectionStatus =
  | "blocked"
  | "included"
  | "redacted"
  | "skipped";
export type TaskContextTrustLevel =
  | "governed"
  | "procedural"
  | "trusted"
  | "untrusted";

export type TaskContextSectionMetadataValue =
  | boolean
  | null
  | number
  | readonly string[]
  | string;
export type TaskContextSectionMetadata = Record<
  string,
  TaskContextSectionMetadataValue
>;

export interface TaskContextSection {
  content?: string;
  metadata: TaskContextSectionMetadata;
  priority: number;
  reason?: string;
  redacted: boolean;
  source: TaskContextSourceKind;
  status: TaskContextSectionStatus;
  summary: string;
  title: string;
  trust: TaskContextTrustLevel;
}

export interface TaskContextPacketSummarySection {
  redacted: boolean;
  source: TaskContextSourceKind;
  status: TaskContextSectionStatus;
  summary: string;
  trust: TaskContextTrustLevel;
}

export interface TaskContextPacketSummary {
  blockedCount: number;
  includedCount: number;
  redactedCount: number;
  sections: TaskContextPacketSummarySection[];
  skippedCount: number;
  sources: TaskContextSourceKind[];
}

export interface TaskContextPacket {
  schemaVersion: typeof TASK_CONTEXT_PACKET_SCHEMA_VERSION;
  sections: TaskContextSection[];
  sourceOrder: TaskContextSourceKind[];
  summary: TaskContextPacketSummary;
}

export interface TaskContextSessionStateInput {
  correlationId?: string;
  currentPhase?: string;
  filesChangedCount?: number;
  filesProposedForChangeCount?: number;
  filesReadCount?: number;
  lastError?: string;
  latestPlanStepCount?: number;
  nextStep?: string;
  pendingApprovalCount?: number;
  restoredEventCount?: number;
  resumed: boolean;
  sessionId?: string;
  status?: string;
  taskId?: string;
}

export interface TaskContextMemoryInput {
  content: string;
  path?: string;
  provenance: string;
  type: MemoryType;
}

export interface WorkingMemoryObservation {
  createdAt?: string;
  eventId?: string;
  kind: "constraint" | "decision" | "failure" | "observation" | "progress";
  summary: string;
}

export interface WorkingMemoryCommand {
  command: string;
  eventId?: string;
  status?:
    | "blocked"
    | "completed"
    | "failed"
    | "planned"
    | "skipped"
    | "started";
}

export interface WorkingMemorySnapshot {
  blockers: readonly string[];
  commandsRun: readonly WorkingMemoryCommand[];
  currentGoal: string;
  currentPlan: readonly string[];
  decisions: readonly string[];
  filesTouched: readonly string[];
  pendingConstraints: readonly string[];
  recentObservations: readonly WorkingMemoryObservation[];
  schemaVersion: 1;
  scope: "session" | "task";
  sessionId: string;
  sourceEventIds: readonly string[];
  sourceEventTotalCount?: number;
  taskId: string;
  updatedAt: string;
}

export interface TaskContextSkillInput {
  description?: string;
  name: string;
  source?: string;
}

export interface RuntimeSelfModelSnapshot {
  context: {
    compactedArtifactId?: string;
    compactedContextAvailable: boolean;
    packetSchemaVersion: typeof TASK_CONTEXT_PACKET_SCHEMA_VERSION;
    sourceOrder: readonly TaskContextSourceKind[];
  };
  generatedAt: string;
  limitations: readonly string[];
  memory: {
    candidateStoreAvailable: boolean;
    durableRetrievalAvailable: boolean;
    providerName: string;
    safetyRulesCount: number;
    workingMemoryAvailable: boolean;
  };
  provider: {
    auth: "configured-redacted" | "missing";
    configured: boolean;
    contextWindowTokens: number | null;
    model: string | null;
    modelIdentity: string | null;
    providerName: string;
    supportsStreaming: boolean;
    supportsToolCalls: boolean;
  };
  sandbox: {
    approvalPolicy: "policy-governed";
    cwd: string;
    fileEditApproval: "policy-governed";
    mode: string;
    outputFormat: string;
    pendingApprovalCount: number;
    riskyCommandApproval: "policy-governed";
    validationCommandCount: number;
  };
  skills: {
    loaded: boolean;
    names: readonly string[];
    source: string;
  };
  tools: {
    available: boolean;
    names: readonly string[];
    providerDrivenExecutionAvailable: boolean;
    unavailableReason: string;
  };
}

export interface TaskContextAssemblyInput {
  memoryEntries?: readonly TaskContextMemoryInput[];
  projectContext: ProjectContextLoadResult;
  compactedContext?: CompactedSessionContext;
  provider: ResolvedProviderState | null;
  sessionState?: TaskContextSessionStateInput;
  skillEntries?: readonly TaskContextSkillInput[];
  startup: ResolvedStartupConfig;
  task: string;
  workingMemory?: WorkingMemorySnapshot;
}

export interface TaskContextAssemblyOptions {
  projectContextContentMaxLength?: number;
  sectionContentMaxLength?: number;
}

interface SectionFactoryInput {
  input: TaskContextAssemblyInput;
  options: Required<TaskContextAssemblyOptions>;
  priority: number;
}

export function assembleTaskContextPacket(
  input: TaskContextAssemblyInput,
  options: TaskContextAssemblyOptions = {}
): TaskContextPacket {
  const resolvedOptions: Required<TaskContextAssemblyOptions> = {
    projectContextContentMaxLength:
      options.projectContextContentMaxLength ??
      DEFAULT_PROJECT_CONTEXT_CONTENT_MAX_LENGTH,
    sectionContentMaxLength:
      options.sectionContentMaxLength ?? DEFAULT_SECTION_CONTENT_MAX_LENGTH
  };
  const sections = TASK_CONTEXT_SOURCE_ORDER.map((source, priority) =>
    createSection(source, {
      input,
      options: resolvedOptions,
      priority
    })
  );
  const packet: TaskContextPacket = {
    schemaVersion: TASK_CONTEXT_PACKET_SCHEMA_VERSION,
    sections,
    sourceOrder: [...TASK_CONTEXT_SOURCE_ORDER],
    summary: {
      blockedCount: 0,
      includedCount: 0,
      redactedCount: 0,
      sections: [],
      skippedCount: 0,
      sources: [...TASK_CONTEXT_SOURCE_ORDER]
    }
  };

  return {
    ...packet,
    summary: summarizeTaskContextPacket(packet)
  };
}

export function summarizeTaskContextPacket(
  packet: TaskContextPacket
): TaskContextPacketSummary {
  return {
    blockedCount: countSectionsByStatus(packet.sections, "blocked"),
    includedCount: countSectionsByStatus(packet.sections, "included"),
    redactedCount: packet.sections.filter((section) => section.redacted).length,
    sections: packet.sections.map((section) => ({
      redacted: section.redacted,
      source: section.source,
      status: section.status,
      summary: section.summary,
      trust: section.trust
    })),
    skippedCount: countSectionsByStatus(packet.sections, "skipped"),
    sources: [...packet.sourceOrder]
  };
}

export function updateTaskContextWorkingMemory(
  packet: TaskContextPacket,
  workingMemory: WorkingMemorySnapshot,
  options: Pick<TaskContextAssemblyOptions, "sectionContentMaxLength"> = {}
): TaskContextPacket {
  const sectionContentMaxLength =
    options.sectionContentMaxLength ?? DEFAULT_SECTION_CONTENT_MAX_LENGTH;
  const sourceOrder = upsertTaskContextSourceOrder(
    packet.sourceOrder,
    "working-memory"
  );
  const workingMemorySection = createWorkingMemorySectionFromSnapshot(
    workingMemory,
    sourceOrder.indexOf("working-memory"),
    sectionContentMaxLength
  );
  let replaced = false;
  const replacedSections = packet.sections.map((section) => {
    if (section.source !== "working-memory") {
      return section;
    }

    replaced = true;
    return workingMemorySection;
  });
  const nextSections = replaced
    ? replacedSections
    : sortTaskContextSections([...replacedSections, workingMemorySection]);
  const nextPacket: TaskContextPacket = {
    ...packet,
    sections: nextSections,
    sourceOrder
  };

  return {
    ...nextPacket,
    summary: summarizeTaskContextPacket(nextPacket)
  };
}

function upsertTaskContextSourceOrder(
  sourceOrder: readonly TaskContextSourceKind[],
  source: TaskContextSourceKind
): TaskContextSourceKind[] {
  if (sourceOrder.includes(source)) {
    return [...sourceOrder];
  }

  return [...sourceOrder, source].sort(
    (left, right) =>
      TASK_CONTEXT_SOURCE_ORDER.indexOf(left) -
      TASK_CONTEXT_SOURCE_ORDER.indexOf(right)
  );
}

function sortTaskContextSections(
  sections: readonly TaskContextSection[]
): TaskContextSection[] {
  return [...sections].sort(
    (left, right) =>
      TASK_CONTEXT_SOURCE_ORDER.indexOf(left.source) -
      TASK_CONTEXT_SOURCE_ORDER.indexOf(right.source)
  );
}

function createSection(
  source: TaskContextSourceKind,
  factoryInput: SectionFactoryInput
): TaskContextSection {
  switch (source) {
    case "runtime-self-model":
      return createRuntimeSelfModelSection(factoryInput);
    case "working-memory":
      return createWorkingMemorySection(factoryInput);
    case "provider-limits":
      return createProviderLimitsSection(factoryInput);
    case "user-input":
      return createUserInputSection(factoryInput);
    case "session-state":
      return createSessionStateSection(factoryInput);
    case "compacted-context":
      return createCompactedContextSection(factoryInput);
    case "project-context":
      return createProjectContextSection(factoryInput);
    case "memory":
      return createMemorySection(factoryInput);
    case "skills":
      return createSkillsSection(factoryInput);
  }
}

function createRuntimeSelfModelSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const snapshot = createRuntimeSelfModelSnapshot(input);
  const redacted = runtimeSelfModelContainsSecret(snapshot);

  return {
    content: createSafePreviewSection(
      [
        `Output format: ${snapshot.sandbox.outputFormat}.`,
        `Sandbox mode: ${snapshot.sandbox.mode}.`,
        `Provider: ${snapshot.provider.configured ? snapshot.provider.providerName : "not configured"}.`,
        `Provider model: ${snapshot.provider.model ?? "not configured"}.`,
        `Provider auth: ${snapshot.provider.auth}.`,
        "Provider-driven tool execution is not connected in this MVP loop.",
        "Runtime tool registry is available through explicit runtime/package APIs.",
        "Risky commands and file edits remain policy-governed and may require approval.",
        "Durable memory retrieval is not implemented.",
        `Provider streaming: ${snapshot.provider.supportsStreaming}.`,
        `Provider tool calls: ${snapshot.provider.supportsToolCalls}.`,
        `Context schema: ${snapshot.context.packetSchemaVersion}.`,
        `Context sources: ${snapshot.context.sourceOrder.join(" > ")}.`,
        snapshot.memory.workingMemoryAvailable
          ? "Working memory is available for this task/session."
          : "Working memory is not available for this packet.",
        snapshot.skills.loaded
          ? `Loaded skills: ${snapshot.skills.names.join(", ")}.`
          : "Skill registry integration is not loaded for this packet.",
        `Configured validation commands: ${snapshot.sandbox.validationCommandCount}.`
      ].join(" "),
      options.sectionContentMaxLength
    ),
    metadata: createSafeMetadata({
      approvalPolicy: snapshot.sandbox.approvalPolicy,
      candidateStoreAvailable: snapshot.memory.candidateStoreAvailable,
      compactedContextAvailable: snapshot.context.compactedContextAvailable,
      contextPacketSchemaVersion: snapshot.context.packetSchemaVersion,
      contextSourceOrder: snapshot.context.sourceOrder,
      cwd: createSafePathLabel(snapshot.sandbox.cwd),
      cwdRedacted: containsSecretLikeValue(snapshot.sandbox.cwd),
      durableRetrievalAvailable: snapshot.memory.durableRetrievalAvailable,
      fileEditApproval: snapshot.sandbox.fileEditApproval,
      memoryProviderName: snapshot.memory.providerName,
      model: snapshot.provider.model,
      modelIdentity: snapshot.provider.modelIdentity,
      outputFormat: snapshot.sandbox.outputFormat,
      pendingApprovalCount: snapshot.sandbox.pendingApprovalCount,
      providerAuth: snapshot.provider.auth,
      providerConfigured: snapshot.provider.configured,
      providerDrivenToolExecution: "not-connected",
      providerDrivenToolExecutionAvailable:
        snapshot.tools.providerDrivenExecutionAvailable,
      providerName: snapshot.provider.providerName,
      providerSupportsStreaming: snapshot.provider.supportsStreaming,
      providerSupportsToolCalls: snapshot.provider.supportsToolCalls,
      providerContextWindowTokens: snapshot.provider.contextWindowTokens,
      riskyCommandApproval: snapshot.sandbox.riskyCommandApproval,
      safetyRulesCount: snapshot.memory.safetyRulesCount,
      sandboxMode: snapshot.sandbox.mode,
      skillNames: snapshot.skills.names,
      skillRegistryLoaded: snapshot.skills.loaded,
      toolNames: snapshot.tools.names,
      toolExecutionEnabled: false,
      toolsAvailable: snapshot.tools.available,
      validationCommandCount: snapshot.sandbox.validationCommandCount,
      workingMemoryAvailable: snapshot.memory.workingMemoryAvailable
    }),
    priority,
    redacted,
    source: "runtime-self-model",
    status: redacted ? "redacted" : "included",
    summary:
      "Runtime-owned capability state and current MVP limitations are included.",
    title: "Runtime self-model",
    trust: "trusted"
  };
}

export function createRuntimeSelfModelSnapshot(
  input: TaskContextAssemblyInput
): RuntimeSelfModelSnapshot {
  const provider = input.provider;
  const skillEntries = input.skillEntries ?? [];
  const providerConfigured = provider !== null;
  const limitations = [
    "Provider-driven tool execution is not connected in this MVP loop.",
    "Durable memory retrieval is not implemented.",
    "Memory candidate persistence is not implemented in Story 4.1.",
    skillEntries.length === 0
      ? "Skill registry integration is not loaded for this packet."
      : ""
  ].filter((value) => value.length > 0);

  return {
    context: {
      ...(input.compactedContext === undefined
        ? {}
        : { compactedArtifactId: input.compactedContext.artifactId }),
      compactedContextAvailable: input.compactedContext !== undefined,
      packetSchemaVersion: TASK_CONTEXT_PACKET_SCHEMA_VERSION,
      sourceOrder: [...TASK_CONTEXT_SOURCE_ORDER]
    },
    generatedAt: new Date().toISOString(),
    limitations,
    memory: {
      candidateStoreAvailable: false,
      durableRetrievalAvailable: false,
      providerName: "not-configured",
      safetyRulesCount: input.startup.safetyRules.length,
      workingMemoryAvailable: input.workingMemory !== undefined
    },
    provider: {
      auth:
        providerConfigured && provider.auth.authenticated
          ? "configured-redacted"
          : "missing",
      configured: providerConfigured,
      contextWindowTokens: provider?.capabilities.contextWindowTokens ?? null,
      model: provider?.model ?? null,
      modelIdentity: provider?.capabilities.modelIdentity ?? null,
      providerName: provider?.providerName ?? "not-configured",
      supportsStreaming: provider?.capabilities.supportsStreaming ?? false,
      supportsToolCalls: provider?.capabilities.supportsToolCalls ?? false
    },
    sandbox: {
      approvalPolicy: "policy-governed",
      cwd: input.startup.cwd,
      fileEditApproval: "policy-governed",
      mode: input.startup.sandboxMode,
      outputFormat: input.startup.outputFormat,
      pendingApprovalCount: input.sessionState?.pendingApprovalCount ?? 0,
      riskyCommandApproval: "policy-governed",
      validationCommandCount: input.startup.validationCommands.length
    },
    skills: {
      loaded: skillEntries.length > 0,
      names: skillEntries.map((entry) => entry.name),
      source: skillEntries.length > 0 ? "provided" : "not-loaded"
    },
    tools: {
      available: true,
      names: [...RUNTIME_TOOL_NAMES],
      providerDrivenExecutionAvailable: false,
      unavailableReason:
        "Provider-driven tool execution is not connected in this MVP loop."
    }
  };
}

function createWorkingMemorySection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const snapshot = input.workingMemory;

  if (snapshot === undefined) {
    return {
      metadata: {
        available: false
      },
      priority,
      reason:
        "No task-local working memory snapshot was available for this packet.",
      redacted: false,
      source: "working-memory",
      status: "skipped",
      summary: "No current-task working memory is included for this packet.",
      title: "Working memory",
      trust: "trusted"
    };
  }

  return createWorkingMemorySectionFromSnapshot(
    snapshot,
    priority,
    options.sectionContentMaxLength
  );
}

function createWorkingMemorySectionFromSnapshot(
  snapshot: WorkingMemorySnapshot,
  priority: number,
  sectionContentMaxLength: number
): TaskContextSection {
  const rawContent = formatWorkingMemoryContent(
    snapshot,
    sectionContentMaxLength
  );
  const redacted = workingMemoryContainsSecret(snapshot);
  const sourceEventIds = snapshot.sourceEventIds.slice(
    -WORKING_MEMORY_SOURCE_EVENT_ID_LIMIT
  );

  return {
    content: createSafePreviewSection(
      rawContent,
      sectionContentMaxLength
    ),
    metadata: createSafeMetadata({
      available: true,
      blockerCount: snapshot.blockers.length,
      commandCount: snapshot.commandsRun.length,
      containsUserDerivedContent: true,
      constraintCount: snapshot.pendingConstraints.length,
      decisionCount: snapshot.decisions.length,
      fileCount: snapshot.filesTouched.length,
      observationCount: snapshot.recentObservations.length,
      planStepCount: snapshot.currentPlan.length,
      schemaVersion: snapshot.schemaVersion,
      scope: snapshot.scope,
      sessionId: snapshot.sessionId,
      sourceEventCount: sourceEventIds.length,
      sourceEventCountTotal:
        snapshot.sourceEventTotalCount ?? snapshot.sourceEventIds.length,
      sourceEventIds,
      taskId: snapshot.taskId,
      trustBasis: "runtime-owned-current-task-snapshot",
      userDerivedFields: [
        "commandsRun.command",
        "currentGoal",
        "currentPlan",
        "filesTouched",
        "recentObservations.summary"
      ],
      updatedAt: snapshot.updatedAt
    }),
    priority,
    redacted,
    source: "working-memory",
    status: redacted ? "redacted" : "included",
    summary:
      "Task-local working memory is included as bounded runtime-owned context with user-derived fields labeled as descriptive.",
    title: "Working memory",
    trust: "trusted"
  };
}

function createProviderLimitsSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  if (input.provider === null) {
    return {
      content: createSafePreviewSection(
        "No active provider is configured; provider limits are unavailable.",
        options.sectionContentMaxLength
      ),
      metadata: createSafeMetadata({
        authenticated: false,
        authSource: "missing",
        contextWindowTokens: null,
        model: null,
        modelIdentity: null,
        providerName: "not-configured",
        supportsStreaming: false,
        supportsToolCalls: false
      }),
      priority,
      redacted: false,
      source: "provider-limits",
      status: "included",
      summary:
        "Provider is not configured; limits are recorded as unavailable.",
      title: "Provider limits",
      trust: "trusted"
    };
  }

  const { capabilities, providerName, model, auth } = input.provider;
  const contextWindow =
    capabilities.contextWindowTokens === null
      ? "unknown"
      : String(capabilities.contextWindowTokens);

  return {
    content: createSafePreviewSection(
      [
        `Provider: ${providerName}.`,
        `Model: ${model ?? "not configured"}.`,
        `Streaming: ${capabilities.supportsStreaming}.`,
        `Tool calls: ${capabilities.supportsToolCalls}.`,
        `Context window: ${contextWindow}.`,
        `Auth: ${auth.authenticated ? auth.source : "not configured"} (secret redacted).`
      ].join(" "),
      options.sectionContentMaxLength
    ),
    metadata: createSafeMetadata({
      authenticated: auth.authenticated,
      authSecretRedacted: auth.secretRedacted,
      authSource: auth.source,
      contextWindowTokens: capabilities.contextWindowTokens,
      model: model ?? null,
      modelIdentity: capabilities.modelIdentity,
      providerName,
      supportsStreaming: capabilities.supportsStreaming,
      supportsToolCalls: capabilities.supportsToolCalls
    }),
    priority,
    redacted: false,
    source: "provider-limits",
    status: "included",
    summary:
      "Provider capability and auth metadata are included without secrets.",
    title: "Provider limits",
    trust: "trusted"
  };
}

function createUserInputSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const redacted = containsSecretLikeValue(input.task);

  return {
    content: createSafePreviewSection(
      input.task,
      options.sectionContentMaxLength
    ),
    metadata: {
      rawLength: input.task.length
    },
    priority,
    redacted,
    source: "user-input",
    status: redacted ? "redacted" : "included",
    summary: redacted
      ? "Current user input is included as a redacted bounded preview."
      : "Current user input is included as a bounded preview.",
    title: "User input",
    trust: "trusted"
  };
}

function createSessionStateSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const sessionState = input.sessionState;

  if (sessionState === undefined) {
    return {
      metadata: {},
      priority,
      reason:
        "Session identity has not been assigned at this context assembly boundary.",
      redacted: false,
      source: "session-state",
      status: "skipped",
      summary: "No bounded session state was available for this packet.",
      title: "Session state",
      trust: "trusted"
    };
  }

  const content = createSafePreviewSection(
    [
      `Session: ${sessionState.sessionId ?? "not assigned"}.`,
      `Task: ${sessionState.taskId ?? "not assigned"}.`,
      `Correlation: ${sessionState.correlationId ?? "not assigned"}.`,
      `Status: ${sessionState.status ?? "not assigned"}.`,
      `Phase: ${sessionState.currentPhase ?? "not assigned"}.`,
      sessionState.resumed
        ? "This packet was assembled for a resumed session without replaying effects."
        : "This packet was assembled for a new task."
    ].join(" "),
    options.sectionContentMaxLength
  );
  const redacted = [sessionState.nextStep, sessionState.lastError].some(
    (value) => value !== undefined && containsSecretLikeValue(value)
  );

  return {
    content,
    metadata: {
      correlationId: sessionState.correlationId ?? null,
      currentPhase: sessionState.currentPhase ?? null,
      filesChangedCount: sessionState.filesChangedCount ?? 0,
      filesProposedForChangeCount:
        sessionState.filesProposedForChangeCount ?? 0,
      filesReadCount: sessionState.filesReadCount ?? 0,
      latestPlanStepCount: sessionState.latestPlanStepCount ?? 0,
      pendingApprovalCount: sessionState.pendingApprovalCount ?? 0,
      restoredEventCount: sessionState.restoredEventCount ?? 0,
      resumed: sessionState.resumed,
      sessionId: sessionState.sessionId ?? null,
      status: sessionState.status ?? null,
      taskId: sessionState.taskId ?? null
    },
    priority,
    redacted,
    source: "session-state",
    status: redacted ? "redacted" : "included",
    summary: sessionState.resumed
      ? "Bounded resumed session state is included without replaying prior work."
      : "Bounded current session identity and lifecycle state are included.",
    title: "Session state",
    trust: "trusted"
  };
}

function createCompactedContextSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const compactedContext = input.compactedContext;

  if (compactedContext === undefined) {
    return {
      metadata: {},
      priority,
      reason: "No compacted context summary was available for this session.",
      redacted: false,
      source: "compacted-context",
      status: "skipped",
      summary: "No compacted context is included for this packet.",
      title: "Compacted context",
      trust: "trusted"
    };
  }

  const continuity = compactedContext.summary.continuity;
  const noteMessages = compactedContext.notes.map((note) => note.message);
  const recentEventSummaries = compactedContext.recentEvents.map(
    (event) => `${event.eventId}: ${event.summary}`
  );
  const rawContent = [
    `Compacted artifact: ${compactedContext.artifactId}.`,
    `Compacted task goal: ${continuity.taskGoal}.`,
    compactedContext.omittedRecentEventCount === 0
      ? ""
      : `Omitted newer events after compaction: ${compactedContext.omittedRecentEventCount}.`,
    formatContextList("Recoverable assembly notes", noteMessages),
    formatContextList("Recent events after compaction", recentEventSummaries),
    formatContextList("Active constraints", continuity.activeConstraints),
    formatContextList("Decisions", continuity.decisions),
    formatContextList("Current plan", continuity.currentPlan),
    formatContextList("Progress", continuity.progress),
    formatContextList("Files touched", continuity.filesTouched),
    formatContextList("Commands run", continuity.commandsRun),
    formatContextList("Failures", continuity.failures),
    formatContextList("Pending approvals", continuity.pendingApprovals),
    formatContextList("Next steps", continuity.nextSteps)
  ]
    .filter((line) => line.length > 0)
    .join(" ");
  const redacted = containsSecretLikeValue(rawContent);
  const content = createSafePreviewSection(
    rawContent,
    options.projectContextContentMaxLength
  );

  return {
    content,
    metadata: {
      artifactId: compactedContext.artifactId,
      compactedAt: compactedContext.compactedAt,
      compactionEventId: compactedContext.compactionEventId,
      noteCodes: compactedContext.notes.map((note) => note.code),
      omittedRecentEventCount: compactedContext.omittedRecentEventCount,
      recentEventCount: compactedContext.recentEvents.length,
      sourceEventCount: compactedContext.source.eventCount,
      triggerReason: compactedContext.summary.triggerReason
    },
    priority,
    redacted,
    source: "compacted-context",
    status: redacted ? "redacted" : "included",
    summary:
      "Compacted session continuity is included with newer event-history notes.",
    title: "Compacted context",
    trust: "trusted"
  };
}

function createProjectContextSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const records = input.projectContext.records;
  const representedRecords = records
    .filter(
      (
        record
      ): record is Extract<
        ProjectContextFileRecord,
        { status: "loaded" | "truncated" }
      > => record.status === "loaded" || record.status === "truncated"
    )
    .map((record) => `${record.fileName}: ${record.preview}`);
  const redacted = records.some((record) => record.redacted);

  if (representedRecords.length > 0) {
    return {
      content: createSafePreviewSection(
        representedRecords.join("\n"),
        options.projectContextContentMaxLength
      ),
      metadata: {
        blockedCount: input.projectContext.blockedCount,
        loadedCount: input.projectContext.loadedCount,
        recordStatuses: records.map(
          (record) => `${record.fileName}:${record.status}`
        ),
        skippedCount: input.projectContext.skippedCount,
        truncatedCount: input.projectContext.truncatedCount
      },
      priority,
      redacted,
      source: "project-context",
      status: redacted ? "redacted" : "included",
      summary:
        "Bounded project context records are included as untrusted repository guidance.",
      title: "Project context",
      trust: "untrusted"
    };
  }

  if (input.projectContext.blockedCount > 0) {
    return {
      metadata: {
        blockedCount: input.projectContext.blockedCount,
        loadedCount: input.projectContext.loadedCount,
        recordStatuses: records.map(
          (record) => `${record.fileName}:${record.status}`
        ),
        skippedCount: input.projectContext.skippedCount,
        truncatedCount: input.projectContext.truncatedCount
      },
      priority,
      reason: "Project context candidates were blocked or unavailable.",
      redacted,
      source: "project-context",
      status: "blocked",
      summary:
        "Project context candidates were blocked or unavailable; no content is included.",
      title: "Project context",
      trust: "untrusted"
    };
  }

  return {
    metadata: {
      blockedCount: input.projectContext.blockedCount,
      loadedCount: input.projectContext.loadedCount,
      recordStatuses: records.map(
        (record) => `${record.fileName}:${record.status}`
      ),
      skippedCount: input.projectContext.skippedCount,
      truncatedCount: input.projectContext.truncatedCount
    },
    priority,
    reason: "No supported project context files were loaded.",
    redacted: false,
    source: "project-context",
    status: "skipped",
    summary: "No project context content is included for this packet.",
    title: "Project context",
    trust: "untrusted"
  };
}

function createMemorySection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const entries = input.memoryEntries ?? [];

  if (entries.length === 0) {
    return {
      metadata: {
        entryCount: 0
      },
      priority,
      reason:
        "Durable memory retrieval is not implemented yet; no raw memory was loaded.",
      redacted: false,
      source: "memory",
      status: "skipped",
      summary:
        "Memory source is represented as skipped until durable retrieval is implemented.",
      title: "Memory",
      trust: "governed"
    };
  }

  const evaluatedEntries = entries.map((entry) => ({
    entry,
    evaluation: evaluateSafetySensitiveContent({
      content: entry.content,
      path: entry.path,
      previewLimit: options.sectionContentMaxLength,
      rules: input.startup.safetyRules,
      target: "memory_candidate"
    })
  }));
  const blockedEntries = evaluatedEntries.filter(
    (entry) => !entry.evaluation.ok || entry.evaluation.value.action === "block"
  );
  const allowedEntries = evaluatedEntries.filter(
    (entry) => entry.evaluation.ok && entry.evaluation.value.action !== "block"
  );
  const redacted =
    blockedEntries.length > 0 ||
    allowedEntries.some(
      (entry) =>
        entry.evaluation.ok && entry.evaluation.value.action === "redact"
    );

  if (blockedEntries.length > 0) {
    return {
      metadata: {
        blockedCount: blockedEntries.length,
        entryCount: entries.length,
        includedCount: allowedEntries.length,
        types: Array.from(new Set(entries.map((entry) => entry.type)))
      },
      priority,
      reason:
        "One or more memory entries matched safety policy and were excluded.",
      redacted,
      source: "memory",
      status: "blocked",
      summary: "Unsafe memory entries were excluded from the context packet.",
      title: "Memory",
      trust: "governed"
    };
  }

  return {
    content: createSafePreviewSection(
      allowedEntries
        .map((entry) =>
          entry.evaluation.ok
            ? `${entry.entry.type}: ${entry.evaluation.value.redactedPreview}`
            : `${entry.entry.type}: [blocked]`
        )
        .join("\n"),
      options.sectionContentMaxLength
    ),
    metadata: {
      blockedCount: 0,
      entryCount: entries.length,
      includedCount: allowedEntries.length,
      types: Array.from(new Set(entries.map((entry) => entry.type)))
    },
    priority,
    redacted,
    source: "memory",
    status: redacted ? "redacted" : "included",
    summary: "Safe memory summaries are included after safety evaluation.",
    title: "Memory",
    trust: "governed"
  };
}

function createSkillsSection({
  input,
  options,
  priority
}: SectionFactoryInput): TaskContextSection {
  const entries = input.skillEntries ?? [];

  if (entries.length === 0) {
    return {
      metadata: {
        skillCount: 0
      },
      priority,
      reason:
        "Manual skill registry integration is not implemented yet; no skills were loaded.",
      redacted: false,
      source: "skills",
      status: "skipped",
      summary:
        "Skills source is represented as skipped until the skill registry is implemented.",
      title: "Skills",
      trust: "procedural"
    };
  }

  return {
    content: createSafePreviewSection(
      entries
        .map((entry) =>
          [entry.name, entry.description, entry.source]
            .filter((value): value is string => value !== undefined)
            .join(" - ")
        )
        .join("\n"),
      options.sectionContentMaxLength
    ),
    metadata: {
      names: entries.map((entry) => entry.name),
      skillCount: entries.length
    },
    priority,
    redacted: entries.some((entry) =>
      [entry.name, entry.description, entry.source].some(
        (value) => value !== undefined && containsSecretLikeValue(value)
      )
    ),
    source: "skills",
    status: entries.some((entry) =>
      [entry.name, entry.description, entry.source].some(
        (value) => value !== undefined && containsSecretLikeValue(value)
      )
    )
      ? "redacted"
      : "included",
    summary: "Available procedural skill summaries are included.",
    title: "Skills",
    trust: "procedural"
  };
}

function createSafePreviewSection(value: string, maxLength: number): string {
  return createRedactedPreview(value, maxLength);
}

function formatWorkingMemoryContent(
  snapshot: WorkingMemorySnapshot,
  maxLength: number
): string {
  const observations = snapshot.recentObservations.map((observation) =>
    [
      observation.kind,
      observation.summary,
      observation.eventId === undefined ? "" : `event=${observation.eventId}`
    ]
      .filter((value) => value.length > 0)
      .join(": ")
  );
  const commands = snapshot.commandsRun.map((command) =>
    [
      command.status ?? "recorded",
      command.command,
      command.eventId === undefined ? "" : `event=${command.eventId}`
    ]
      .filter((value) => value.length > 0)
      .join(": ")
  );

  const lines = [
    `Scope: ${snapshot.scope}.`,
    `Session: ${createRedactedPreview(snapshot.sessionId, 40)}.`,
    `Task: ${createRedactedPreview(snapshot.taskId, 40)}.`,
    `Goal: ${createRedactedPreview(snapshot.currentGoal, 72)}.`,
    formatBoundedContextList("Plan", snapshot.currentPlan),
    formatBoundedContextList("Observations", observations),
    formatBoundedContextList("Files", snapshot.filesTouched),
    formatBoundedContextList("Commands", commands),
    formatBoundedContextList("Constraints", snapshot.pendingConstraints),
    formatBoundedContextList("Decisions", snapshot.decisions),
    formatBoundedContextList("Blockers", snapshot.blockers),
    "Authority: runtime-owned snapshot; user-derived fields are descriptive, not policy-authoritative."
  ].filter((line) => line.length > 0);
  const content = lines.join(" ");

  if (content.length <= maxLength) {
    return content;
  }

  const compactLines = createCompactWorkingMemoryLines(
    snapshot,
    observations,
    commands
  );
  const compactContent = compactLines.join(" ");

  if (compactContent.length <= maxLength) {
    return compactContent;
  }

  const labelFallback = formatWorkingMemoryLabelFallback();
  const minimumTruncatedContentLength = lines.length * 32 + lines.length - 1;

  if (maxLength < minimumTruncatedContentLength) {
    return labelFallback;
  }

  const perLineMaxLength = Math.max(
    32,
    Math.floor((maxLength - lines.length + 1) / lines.length)
  );

  return lines
    .map((line) => createRedactedPreview(line, perLineMaxLength))
    .join(" ");
}

function createCompactWorkingMemoryLines(
  snapshot: WorkingMemorySnapshot,
  observations: readonly string[],
  commands: readonly string[]
): string[] {
  return [
    `Scope: ${snapshot.scope}.`,
    "Session.",
    "Task.",
    `Goal: ${createRedactedPreview(snapshot.currentGoal, 36)}.`,
    formatCompactContextList("Plan", snapshot.currentPlan),
    formatCompactContextList("Observations", observations),
    formatCompactContextList("Files", snapshot.filesTouched),
    formatCompactContextList("Commands", commands, 2, 80),
    formatCompactContextList("Constraints", snapshot.pendingConstraints, 1, 80),
    formatCompactContextList("Decisions", snapshot.decisions),
    formatCompactContextList("Blockers", snapshot.blockers, 1, 80),
    "Authority."
  ];
}

function formatWorkingMemoryLabelFallback(): string {
  return [
    "Scope.",
    "Session.",
    "Task.",
    "Goal.",
    "Plan.",
    "Observations.",
    "Files.",
    "Commands.",
    "Constraints.",
    "Decisions.",
    "Blockers.",
    "Authority."
  ].join(" ");
}

function formatContextList(label: string, values: readonly string[]): string {
  return values.length === 0 ? "" : `${label}: ${values.join(" | ")}.`;
}

function formatBoundedContextList(
  label: string,
  values: readonly string[]
): string {
  const visibleValues = values
    .slice(-WORKING_MEMORY_LIST_ITEM_LIMIT)
    .map((value) => createRedactedPreview(value, WORKING_MEMORY_PREVIEW_MAX_LENGTH));
  const omittedCount = Math.max(0, values.length - visibleValues.length);
  const omittedSuffix =
    omittedCount === 0 ? "" : ` (${omittedCount} older omitted)`;
  const representedValues =
    visibleValues.length === 0 ? "none" : visibleValues.join(" | ");

  return `${label}${omittedSuffix}: ${representedValues}.`;
}

function formatCompactContextList(
  label: string,
  values: readonly string[],
  visibleLimit = 1,
  previewMaxLength = 48
): string {
  const visibleValues = values
    .slice(-visibleLimit)
    .map((value) => createRedactedPreview(value, previewMaxLength));
  const omittedCount = Math.max(0, values.length - visibleValues.length);
  const omittedSuffix =
    omittedCount === 0 ? "" : ` (${omittedCount} older omitted)`;
  const representedValues =
    visibleValues.length === 0 ? "none" : visibleValues.join(" | ");

  return `${label}${omittedSuffix}: ${representedValues}.`;
}

function runtimeSelfModelContainsSecret(
  snapshot: RuntimeSelfModelSnapshot
): boolean {
  return containsSecretLikeValue(
    [
      snapshot.provider.providerName,
      snapshot.provider.model ?? "",
      snapshot.provider.modelIdentity ?? "",
      snapshot.sandbox.cwd,
      ...snapshot.skills.names,
      ...snapshot.tools.names
    ].join(" ")
  );
}

function workingMemoryContainsSecret(snapshot: WorkingMemorySnapshot): boolean {
  return containsSecretLikeValue(
    [
      snapshot.currentGoal,
      snapshot.sessionId,
      snapshot.taskId,
      ...snapshot.blockers,
      ...snapshot.commandsRun.map((command) => command.command),
      ...snapshot.currentPlan,
      ...snapshot.decisions,
      ...snapshot.filesTouched,
      ...snapshot.pendingConstraints,
      ...snapshot.recentObservations.map((observation) => observation.summary),
      ...snapshot.sourceEventIds
    ].join(" ")
  );
}

function createSafePathLabel(pathValue: string): string {
  if (containsSecretLikeValue(pathValue)) {
    return createRedactedPreview(pathValue, 80);
  }

  const segments = pathValue.split(/[\\/]+/).filter((segment) => segment.length > 0);

  return segments.at(-1) ?? ".";
}

function createSafeMetadata(
  metadata: TaskContextSectionMetadata
): TaskContextSectionMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      createSafeMetadataValue(value)
    ])
  );
}

function createSafeMetadataValue(
  value: TaskContextSectionMetadataValue
): TaskContextSectionMetadataValue {
  if (typeof value === "string") {
    return createRedactedPreview(value, 160);
  }

  if (Array.isArray(value)) {
    return value.map((item) => createRedactedPreview(item, 120));
  }

  return value;
}

function countSectionsByStatus(
  sections: readonly TaskContextSection[],
  status: TaskContextSectionStatus
): number {
  return sections.filter((section) => section.status === status).length;
}
