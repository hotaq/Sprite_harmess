import {
  SpriteError,
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  type Result
} from "@sprite/shared";
import type { SessionEventRecord, SessionStateSnapshot } from "@sprite/storage";

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
