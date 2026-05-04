import {
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  type Result
} from "@sprite/shared";
import {
  readSessionArtifacts,
  writeSessionCompactionArtifact,
  type SessionCompactionArtifact,
  type SessionEventRecord,
  type SessionStateSnapshot
} from "@sprite/storage";
import {
  inspectSessionState,
  type SessionInspectionView
} from "./session-inspection.js";
import type { TaskContextPacket } from "./task-context.js";

export const COMPACTION_SUMMARY_SCHEMA_VERSION = 1 as const;
export const DEFAULT_COMPACTION_MAX_LARGE_OUTPUT_PREVIEW_CHARS = 2_000;

export const COMPACTION_TRIGGER_REASONS = [
  "manual",
  "threshold",
  "context-overflow",
  "recovery"
] as const;
export const COMPACTION_SUMMARY_STATUSES = ["created"] as const;

export type CompactionTriggerReason =
  (typeof COMPACTION_TRIGGER_REASONS)[number];
export type CompactionSummaryStatus =
  (typeof COMPACTION_SUMMARY_STATUSES)[number];

export interface CompactionSummaryContinuity {
  taskGoal: string;
  activeConstraints: string[];
  decisions: string[];
  currentPlan: string[];
  progress: string[];
  filesTouched: string[];
  commandsRun: string[];
  failures: string[];
  pendingApprovals: string[];
  nextSteps: string[];
}

export interface CompactionSummaryMetrics {
  estimatedContextTokens?: number;
  reserveTokens?: number;
  thresholdTokens?: number;
}

export interface CompactionSummarySource {
  eventCount: number;
  eventRange: {
    firstEventId: string;
    lastEventId: string;
  };
  firstRetainedEventId?: string;
  previousCompactionArtifactId?: string;
}

export interface CompactionLargeOutputInput {
  artifactPath?: string;
  content: string;
  label: string;
  sourceEventId: string;
  toolCallId?: string;
}

export interface CompactionLargeOutputReference {
  artifactPath?: string;
  omittedBytes: number;
  preview: string;
  sourceEventId: string;
  toolCallId?: string;
}

export interface CompactionSafetyMetadata {
  largeRawOutputsEmbedded: false;
  redacted: boolean;
}

export interface CompactionSummary {
  schemaVersion: typeof COMPACTION_SUMMARY_SCHEMA_VERSION;
  kind: "session.compaction.summary";
  sessionId: string;
  createdAt: string;
  triggerReason: CompactionTriggerReason;
  status: CompactionSummaryStatus;
  continuity: CompactionSummaryContinuity;
  metrics: CompactionSummaryMetrics;
  source: CompactionSummarySource;
  largeOutputReferences: CompactionLargeOutputReference[];
  safety: CompactionSafetyMetadata;
}

export interface CompactionSummaryInput {
  activeConstraints: string[];
  commandsRun?: string[];
  createdAt: string;
  currentPlan: string[];
  decisions: string[];
  events: SessionEventRecord[];
  failures?: string[];
  filesTouched?: string[];
  firstRetainedEventId?: string;
  largeOutputs?: CompactionLargeOutputInput[];
  metrics?: CompactionSummaryMetrics;
  nextSteps: string[];
  pendingApprovals?: string[];
  previousCompactionArtifactId?: string;
  progress: string[];
  sessionId: string;
  state: SessionStateSnapshot;
  taskGoal: string;
  triggerReason: CompactionTriggerReason;
}

export interface CompactionSummaryOptions {
  maxLargeOutputPreviewChars?: number;
}

export interface CompactSessionArtifactsOptions extends CompactionSummaryOptions {
  artifactId?: string;
  contextPacket?: TaskContextPacket;
  createdAt?: string;
  firstRetainedEventId?: string;
  previousCompactionArtifactId?: string;
  triggerReason?: CompactionTriggerReason;
}

export interface CompactSessionArtifactsResult {
  artifact: SessionCompactionArtifact;
  artifactPath: string;
  summary: CompactionSummary;
}

interface BuildCompactionInputFromSessionArtifactsInput {
  contextPacket?: TaskContextPacket;
  createdAt: string;
  events: SessionEventRecord[];
  firstRetainedEventId?: string;
  inspection: SessionInspectionView;
  previousCompactionArtifactId?: string;
  sessionId: string;
  state: SessionStateSnapshot;
  triggerReason: CompactionTriggerReason;
}

export function compactSessionArtifacts(
  cwd: string,
  sessionId: string,
  options: CompactSessionArtifactsOptions = {}
): Result<CompactSessionArtifactsResult, SpriteError> {
  const contextPacketValidation = validateContextPacketForSession(
    options.contextPacket,
    sessionId
  );

  if (!contextPacketValidation.ok) {
    return err(contextPacketValidation.error);
  }

  const artifacts = readSessionArtifacts(cwd, sessionId, {
    recentEventLimit: 0
  });

  if (!artifacts.ok) {
    return err(artifacts.error);
  }

  const inspection = inspectSessionState(cwd, sessionId, {
    recentEventLimit: 50
  });

  if (!inspection.ok) {
    return err(inspection.error);
  }

  if (inspection.value.persistedEventCount !== artifacts.value.events.length) {
    return err(
      new SpriteError(
        "COMPACTION_SESSION_CHANGED_DURING_READ",
        "Session artifacts changed while compaction evidence was being read; retry compaction."
      )
    );
  }

  const createdAt = options.createdAt ?? new Date().toISOString();
  const summary = createCompactionSummary(
    buildCompactionInputFromSessionArtifacts({
      contextPacket: options.contextPacket,
      createdAt,
      events: artifacts.value.events,
      firstRetainedEventId:
        options.firstRetainedEventId ??
        selectFirstRetainedEventId(artifacts.value.events),
      inspection: inspection.value,
      previousCompactionArtifactId: options.previousCompactionArtifactId,
      sessionId,
      state: artifacts.value.state,
      triggerReason: options.triggerReason ?? "manual"
    }),
    options
  );

  if (!summary.ok) {
    return err(summary.error);
  }

  const artifact = {
    artifactId: options.artifactId ?? createCompactionArtifactId(createdAt),
    createdAt,
    schemaVersion: COMPACTION_SUMMARY_SCHEMA_VERSION,
    sessionId,
    summary: summary.value
  } satisfies SessionCompactionArtifact;
  const written = writeSessionCompactionArtifact(
    artifacts.value.paths,
    artifact
  );

  if (!written.ok) {
    return err(written.error);
  }

  return {
    ok: true,
    value: {
      artifact,
      artifactPath: written.value.artifactPath,
      summary: summary.value
    }
  };
}

export function createCompactionSummary(
  input: CompactionSummaryInput,
  options: CompactionSummaryOptions = {}
): Result<CompactionSummary, SpriteError> {
  const eventRange = createSourceEventRange(input.events);

  if (!eventRange.ok) {
    return err(eventRange.error);
  }

  const continuity = {
    taskGoal: redactText(input.taskGoal),
    activeConstraints: compactTextList(input.activeConstraints),
    decisions: compactTextList(input.decisions),
    currentPlan: compactTextList(input.currentPlan),
    progress: compactTextList(input.progress),
    filesTouched: compactTextList([
      ...(input.filesTouched ?? []),
      ...input.state.filesChanged,
      ...input.state.filesProposedForChange,
      ...input.state.filesRead
    ]),
    commandsRun: compactTextList([
      ...(input.commandsRun ?? []),
      ...commandsFromEvents(input.events)
    ]),
    failures: compactTextList([
      ...(input.failures ?? []),
      ...(input.state.lastError === undefined ? [] : [input.state.lastError])
    ]),
    pendingApprovals: compactTextList(input.pendingApprovals ?? []),
    nextSteps: compactTextList([
      ...input.nextSteps,
      ...(input.state.nextStep === undefined ? [] : [input.state.nextStep])
    ])
  } satisfies CompactionSummaryContinuity;
  const largeOutputReferences = (input.largeOutputs ?? []).map((largeOutput) =>
    summarizeLargeOutputReference(largeOutput, options)
  );

  return {
    ok: true,
    value: {
      schemaVersion: COMPACTION_SUMMARY_SCHEMA_VERSION,
      kind: "session.compaction.summary",
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      triggerReason: input.triggerReason,
      status: "created",
      continuity,
      metrics: compactMetrics(input.metrics ?? {}),
      source: {
        eventCount: input.events.length,
        eventRange: eventRange.value,
        ...(input.firstRetainedEventId === undefined
          ? {}
          : { firstRetainedEventId: input.firstRetainedEventId }),
        ...(input.previousCompactionArtifactId === undefined
          ? {}
          : {
              previousCompactionArtifactId: input.previousCompactionArtifactId
            })
      },
      largeOutputReferences,
      safety: {
        largeRawOutputsEmbedded: false,
        redacted: didRedact(input, continuity, largeOutputReferences)
      }
    }
  };
}

export function summarizeLargeOutputReference(
  output: CompactionLargeOutputInput,
  options: CompactionSummaryOptions = {}
): CompactionLargeOutputReference {
  const maxPreviewChars =
    options.maxLargeOutputPreviewChars ??
    DEFAULT_COMPACTION_MAX_LARGE_OUTPUT_PREVIEW_CHARS;
  const omittedBytes = Buffer.byteLength(output.content, "utf8");
  const source = output.artifactPath ?? output.sourceEventId;
  const preview = createRedactedPreview(
    `${output.label}: ${omittedBytes} bytes omitted; see ${source}.`,
    maxPreviewChars
  );

  return {
    ...(output.artifactPath === undefined
      ? {}
      : { artifactPath: output.artifactPath }),
    omittedBytes,
    preview,
    sourceEventId: output.sourceEventId,
    ...(output.toolCallId === undefined
      ? {}
      : { toolCallId: output.toolCallId })
  };
}

function buildCompactionInputFromSessionArtifacts(
  input: BuildCompactionInputFromSessionArtifactsInput
): CompactionSummaryInput {
  const latestTask = input.inspection.latestTask ?? input.state.latestTask;
  const nextStep = input.inspection.nextStep ?? input.state.nextStep;
  const progress = compactTextList([
    ...(input.state.lastEventType === undefined
      ? []
      : [`Latest event: ${input.state.lastEventType}`]),
    `Execution state: ${input.inspection.executionState.kind} - ${input.inspection.executionState.detail}`,
    ...contextPacketProgress(input.contextPacket),
    ...(latestTask === undefined
      ? []
      : [
          `Task status: ${latestTask.status}`,
          `Current phase: ${latestTask.currentPhase}`
        ])
  ]);

  return {
    activeConstraints: activeConstraintsFromContextPacket(input.contextPacket),
    commandsRun: input.inspection.commandsRun,
    createdAt: input.createdAt,
    currentPlan: latestTask?.latestPlan?.map((step) => step.summary) ?? [],
    decisions: decisionsFromEvents(input.events),
    events: input.events,
    failures:
      input.inspection.lastError === undefined
        ? []
        : [input.inspection.lastError],
    filesTouched: [
      ...input.inspection.filesChanged,
      ...input.inspection.filesProposedForChange,
      ...input.inspection.filesRead
    ],
    firstRetainedEventId: input.firstRetainedEventId,
    nextSteps: nextStep === undefined ? [] : [nextStep],
    pendingApprovals:
      input.inspection.pendingApprovalCount > 0
        ? [`${input.inspection.pendingApprovalCount} pending approval(s)`]
        : [],
    previousCompactionArtifactId: input.previousCompactionArtifactId,
    progress,
    sessionId: input.sessionId,
    state: input.state,
    taskGoal: latestTask?.goal ?? "No active task goal recorded.",
    triggerReason: input.triggerReason
  };
}

function validateContextPacketForSession(
  contextPacket: TaskContextPacket | undefined,
  sessionId: string
): Result<void, SpriteError> {
  if (contextPacket === undefined) {
    return { ok: true, value: undefined };
  }

  const sessionSection = contextPacket.sections.find(
    (section) => section.source === "session-state"
  );
  const contextSessionId = sessionSection?.metadata.sessionId;

  if (sessionSection === undefined || typeof contextSessionId !== "string") {
    return err(
      new SpriteError(
        "COMPACTION_CONTEXT_PACKET_SESSION_MISSING",
        "Compaction context packet must include a session-state section with a concrete sessionId."
      )
    );
  }

  if (contextSessionId !== sessionId) {
    return err(
      new SpriteError(
        "COMPACTION_CONTEXT_PACKET_SESSION_MISMATCH",
        "Compaction context packet sessionId must match the compacted session."
      )
    );
  }

  return { ok: true, value: undefined };
}

function createCompactionArtifactId(createdAt: string): string {
  const normalized = createdAt
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return `cmp-${normalized.length === 0 ? "manual" : normalized}`;
}

function selectFirstRetainedEventId(
  events: readonly SessionEventRecord[]
): string | undefined {
  return events.at(-1)?.eventId;
}

function activeConstraintsFromContextPacket(
  contextPacket: TaskContextPacket | undefined
): string[] {
  if (contextPacket === undefined) {
    return [];
  }

  return contextPacket.sections
    .filter(
      (section) =>
        section.trust !== "untrusted" &&
        (section.status === "included" || section.status === "redacted") &&
        (section.source === "runtime-self-model" ||
          section.source === "provider-limits" ||
          section.source === "session-state")
    )
    .map((section) => `${section.title}: ${section.summary}`);
}

function decisionsFromEvents(events: readonly SessionEventRecord[]): string[] {
  return events.flatMap((event) => {
    switch (event.type) {
      case "task.recovery.recorded":
        return decisionFromTaskRecoveryEvent(event);
      case "policy.decision.recorded":
        return decisionFromPolicyEvent(event);
      case "approval.resolved":
        return decisionFromApprovalResolvedEvent(event);
      default:
        return [];
    }
  });
}

function decisionFromTaskRecoveryEvent(event: SessionEventRecord): string[] {
  const payload = event.payload as Record<string, unknown>;
  const decision = stringPayloadValue(payload, "decision");
  const trigger = stringPayloadValue(payload, "trigger");
  const summary = stringPayloadValue(payload, "summary");
  const nextAction = stringPayloadValue(payload, "nextAction");

  if (
    decision === undefined ||
    trigger === undefined ||
    summary === undefined
  ) {
    return [];
  }

  return [
    compactDecisionText([
      `Recovery ${decision} after ${trigger}`,
      summary,
      nextAction === undefined ? undefined : `next: ${nextAction}`
    ])
  ];
}

function decisionFromPolicyEvent(event: SessionEventRecord): string[] {
  const payload = event.payload as Record<string, unknown>;
  const action = stringPayloadValue(payload, "action");
  const requestType = stringPayloadValue(payload, "requestType");
  const riskLevel = stringPayloadValue(payload, "riskLevel");
  const ruleId = stringPayloadValue(payload, "ruleId");
  const summary = stringPayloadValue(payload, "summary");
  const reason = stringPayloadValue(payload, "reason");

  if (
    action === undefined ||
    requestType === undefined ||
    riskLevel === undefined ||
    ruleId === undefined ||
    summary === undefined
  ) {
    return [];
  }

  return [
    compactDecisionText([
      `Policy ${requestType} ${action}`,
      `risk: ${riskLevel}`,
      `rule: ${ruleId}`,
      summary,
      reason
    ])
  ];
}

function decisionFromApprovalResolvedEvent(
  event: SessionEventRecord
): string[] {
  const payload = event.payload as Record<string, unknown>;
  const decision = stringPayloadValue(payload, "decision");
  const requestType = stringPayloadValue(payload, "requestType");
  const summary = stringPayloadValue(payload, "summary");
  const reason = stringPayloadValue(payload, "reason");

  if (
    decision === undefined ||
    requestType === undefined ||
    summary === undefined
  ) {
    return [];
  }

  return [
    compactDecisionText([
      `Approval ${requestType} ${decision}`,
      summary,
      reason
    ])
  ];
}

function compactDecisionText(parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part) => part !== undefined && part.length > 0)
    .join(" — ");
}

function stringPayloadValue(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function contextPacketProgress(
  contextPacket: TaskContextPacket | undefined
): string[] {
  if (contextPacket === undefined) {
    return [];
  }

  return [
    `Context packet included sections: ${contextPacket.summary.includedCount}`,
    `Context packet sources: ${contextPacket.summary.sources.join(", ")}`,
    ...contextPacket.summary.sections
      .filter((section) => section.status === "included")
      .map((section) => `Context ${section.source}: ${section.summary}`)
  ];
}

function createSourceEventRange(
  events: readonly SessionEventRecord[]
): Result<CompactionSummarySource["eventRange"], SpriteError> {
  const firstEventId = events[0]?.eventId;
  const lastEventId = events.at(-1)?.eventId;

  if (firstEventId === undefined || lastEventId === undefined) {
    return err(
      new SpriteError(
        "COMPACTION_EVENTS_EMPTY",
        "Compaction summary requires at least one source event."
      )
    );
  }

  return {
    ok: true,
    value: {
      firstEventId,
      lastEventId
    }
  };
}

function commandsFromEvents(events: readonly SessionEventRecord[]): string[] {
  return events.flatMap((event) => {
    const command = (event.payload as { command?: unknown }).command;

    return typeof command === "string" && command.length > 0 ? [command] : [];
  });
}

function compactTextList(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => redactText(value))
        .filter((value) => value.length > 0)
    )
  );
}

function redactText(value: string): string {
  return createRedactedPreview(value, Math.max(value.length, 1));
}

function compactMetrics(
  metrics: CompactionSummaryMetrics
): CompactionSummaryMetrics {
  return {
    ...(metrics.estimatedContextTokens === undefined
      ? {}
      : { estimatedContextTokens: metrics.estimatedContextTokens }),
    ...(metrics.reserveTokens === undefined
      ? {}
      : { reserveTokens: metrics.reserveTokens }),
    ...(metrics.thresholdTokens === undefined
      ? {}
      : { thresholdTokens: metrics.thresholdTokens })
  };
}

function didRedact(
  input: CompactionSummaryInput,
  continuity: CompactionSummaryContinuity,
  largeOutputReferences: readonly CompactionLargeOutputReference[]
): boolean {
  const sourceValues = [
    input.taskGoal,
    ...input.activeConstraints,
    ...input.decisions,
    ...input.currentPlan,
    ...input.progress,
    ...(input.filesTouched ?? []),
    ...(input.commandsRun ?? []),
    ...(input.failures ?? []),
    ...(input.pendingApprovals ?? []),
    ...input.nextSteps,
    input.state.lastError ?? "",
    input.state.nextStep ?? "",
    ...input.state.filesChanged,
    ...input.state.filesProposedForChange,
    ...input.state.filesRead,
    ...(input.largeOutputs ?? []).map((output) => output.content)
  ];
  const summaryValues = [
    continuity.taskGoal,
    ...continuity.activeConstraints,
    ...continuity.decisions,
    ...continuity.currentPlan,
    ...continuity.progress,
    ...continuity.filesTouched,
    ...continuity.commandsRun,
    ...continuity.failures,
    ...continuity.pendingApprovals,
    ...continuity.nextSteps,
    ...largeOutputReferences.map((reference) => reference.preview)
  ];

  return (
    sourceValues.some(
      (value) => value.length > 0 && containsSecretLikeValue(value)
    ) && !summaryValues.some((value) => containsSecretLikeValue(value))
  );
}
