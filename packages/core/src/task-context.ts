import type {
  ProjectContextFileRecord,
  ProjectContextLoadResult,
  ResolvedStartupConfig
} from "@sprite/config";
import {
  evaluateSafetySensitiveContent,
  type MemoryType
} from "@sprite/memory";
import type { ResolvedProviderState } from "@sprite/providers";
import { containsSecretLikeValue, createRedactedPreview } from "@sprite/shared";

export const TASK_CONTEXT_PACKET_SCHEMA_VERSION = 1 as const;
export const TASK_CONTEXT_SOURCE_ORDER = [
  "runtime-self-model",
  "provider-limits",
  "user-input",
  "session-state",
  "project-context",
  "memory",
  "skills"
] as const;

const DEFAULT_SECTION_CONTENT_MAX_LENGTH = 480;
const DEFAULT_PROJECT_CONTEXT_CONTENT_MAX_LENGTH = 1_200;

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

export interface TaskContextSkillInput {
  description?: string;
  name: string;
  source?: string;
}

export interface TaskContextAssemblyInput {
  memoryEntries?: readonly TaskContextMemoryInput[];
  projectContext: ProjectContextLoadResult;
  provider: ResolvedProviderState | null;
  sessionState?: TaskContextSessionStateInput;
  skillEntries?: readonly TaskContextSkillInput[];
  startup: ResolvedStartupConfig;
  task: string;
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

function createSection(
  source: TaskContextSourceKind,
  factoryInput: SectionFactoryInput
): TaskContextSection {
  switch (source) {
    case "runtime-self-model":
      return createRuntimeSelfModelSection(factoryInput);
    case "provider-limits":
      return createProviderLimitsSection(factoryInput);
    case "user-input":
      return createUserInputSection(factoryInput);
    case "session-state":
      return createSessionStateSection(factoryInput);
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
  const validationCommandCount = input.startup.validationCommands.length;

  return {
    content: createSafePreviewSection(
      [
        `Output format: ${input.startup.outputFormat}.`,
        `Sandbox mode: ${input.startup.sandboxMode}.`,
        "Provider-driven tool execution is not connected in this MVP loop.",
        `Configured validation commands: ${validationCommandCount}.`
      ].join(" "),
      options.sectionContentMaxLength
    ),
    metadata: {
      outputFormat: input.startup.outputFormat,
      providerDrivenToolExecution: "not-connected",
      sandboxMode: input.startup.sandboxMode,
      toolExecutionEnabled: false,
      validationCommandCount
    },
    priority,
    redacted: false,
    source: "runtime-self-model",
    status: "included",
    summary:
      "Runtime-owned operating constraints and current MVP limitations are included.",
    title: "Runtime self-model",
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
      metadata: {
        authenticated: false,
        authSource: "missing",
        contextWindowTokens: null,
        model: null,
        modelIdentity: null,
        providerName: "not-configured",
        supportsStreaming: false,
        supportsToolCalls: false
      },
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
    metadata: {
      authenticated: auth.authenticated,
      authSecretRedacted: auth.secretRedacted,
      authSource: auth.source,
      contextWindowTokens: capabilities.contextWindowTokens,
      model: model ?? null,
      modelIdentity: capabilities.modelIdentity,
      providerName,
      supportsStreaming: capabilities.supportsStreaming,
      supportsToolCalls: capabilities.supportsToolCalls
    },
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

function countSectionsByStatus(
  sections: readonly TaskContextSection[],
  status: TaskContextSectionStatus
): number {
  return sections.filter((section) => section.status === status).length;
}
