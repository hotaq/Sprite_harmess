#!/usr/bin/env node

import {
  AgentRuntime,
  compactSessionManually,
  createBootstrapMessage,
  createFinalTaskSummary,
  createInteractiveTaskMessage,
  createRuntimeEventRecord,
  inspectSessionState,
  listToolNames,
  listSkills,
  readLearningReviewArtifacts,
  resolveOneShotPrintOutputFormat,
  runOneShotPrintTask,
  type FinalTaskSummary,
  type ListSkillsResult,
  type ManualSessionCompactionResult,
  type OneShotPrintOutputFormat,
  type OneShotPrintTaskResult,
  type PlannedExecutionFlow,
  type RuntimeSkillCandidateReviewRequest,
  type RuntimeSkillCandidateReviewResult,
  type RuntimeEventRecord,
  type SessionInspectionView,
  type SessionResumeResult,
  type SkillCandidateReviewView,
  type SkillRegistryEntry,
  type StoredLearningReviewArtifact,
  type StoredLearningReviewArtifactResult,
  type UnavailableSkillRegistryEntry
} from "@sprite/core";
import { runJsonRpcStdioServer } from "@sprite/rpc";
import {
  createTuiApprovalResponseIntent,
  createTuiCancelIntent,
  createTuiCommandPreview,
  createTuiInputDraft,
  createTuiLiveWorkbenchState,
  createTuiRuntimeState,
  createTuiStartupState,
  createTuiSubmitIntent,
  createTuiWorkbenchView,
  dispatchTuiUserIntent,
  isTuiSlashCommandResult,
  runTuiWorkbench,
  type TuiApprovalRequestSummary,
  type TuiDispatchResult,
  type TuiLearningReviewCommandEvidenceInput,
  type TuiLearningReviewDetailsInput,
  type TuiLearningReviewMemoryCandidateInput,
  type TuiLearningReviewProceduralOutputInput,
  type TuiLearningReviewSectionItemInput,
  type TuiLearningReviewSkillSignalInput,
  type TuiLiveWorkbenchInteraction,
  type TuiSafeString,
  type TuiSlashCommandIntent,
  type TuiSlashCommandResult,
  type TuiLiveWorkbenchState,
  type TuiWorkbenchStateSubscriber
} from "@sprite/tui";
import {
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  SpriteError,
  type Result
} from "@sprite/shared";
import { Command, CommanderError } from "commander";
import { realpathSync } from "node:fs";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const CLI_VERSION = packageJson.version;
const LIVE_TUI_APPROVAL_EDIT_MAX_BYTES = 4096;
const LIVE_TUI_APPROVAL_EDIT_MAX_FILE_EDITS = 10;

export interface CliIO {
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
}

function writeMessage(io: CliIO, message: string): void {
  io.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
}

export function createCliOutputWritable(output: CliIO["stdout"]): Writable {
  if (output instanceof Writable) {
    return output;
  }

  return new Writable({
    write(chunk, _encoding, callback) {
      try {
        output.write(chunk.toString());
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
}

const OUTPUT_FORMATS = ["text", "json", "ndjson"] as const;
const SESSION_TEXT_JSON_OUTPUT_FORMATS = ["text", "json"] as const;
const SKILL_CANDIDATE_REVIEW_ACTIONS = [
  "edit",
  "draft",
  "reject",
  "promote"
] as const;
type SessionTextJsonOutputFormat =
  (typeof SESSION_TEXT_JSON_OUTPUT_FORMATS)[number];
type SkillCandidateReviewAction =
  (typeof SKILL_CANDIDATE_REVIEW_ACTIONS)[number];

interface SkillCandidateReviewCliOptions {
  action?: string;
  activation?: string[];
  confirmPromotion?: boolean;
  counterexample?: string[];
  example?: string[];
  knownRisk?: string[];
  name?: string;
  output?: string;
  promotionTarget?: string;
  reason?: string;
  requiredTool?: string[];
  reviewedBy?: string;
  session?: string;
  summary?: string;
  triggerReason?: string;
  workflowStep?: string[];
  workflowSummary?: string;
}

function parseOutputFormat(
  value: string | undefined
): OneShotPrintOutputFormat | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!OUTPUT_FORMATS.includes(value as OneShotPrintOutputFormat)) {
    throw new Error(
      `Output format must be one of: ${OUTPUT_FORMATS.join(", ")}.`
    );
  }

  return value as OneShotPrintOutputFormat;
}

function parseSessionTextJsonOutputFormat(
  value: string | undefined,
  commandLabel: string
): SessionTextJsonOutputFormat {
  if (value === undefined) {
    return "text";
  }

  if (
    !SESSION_TEXT_JSON_OUTPUT_FORMATS.includes(
      value as SessionTextJsonOutputFormat
    )
  ) {
    throw new Error(
      `${commandLabel} output format must be one of: ${SESSION_TEXT_JSON_OUTPUT_FORMATS.join(", ")}.`
    );
  }

  return value as SessionTextJsonOutputFormat;
}

function parseRecentEventLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || !Number.isFinite(parsed)) {
    throw new Error("Recent events must be a non-negative integer.");
  }

  return parsed;
}

function parseSkillCandidateReviewAction(
  value: string | undefined
): SkillCandidateReviewAction {
  if (value === undefined) {
    throw new Error(
      `Skill candidate review action must be one of: ${SKILL_CANDIDATE_REVIEW_ACTIONS.join(", ")}.`
    );
  }

  if (
    !SKILL_CANDIDATE_REVIEW_ACTIONS.includes(
      value as SkillCandidateReviewAction
    )
  ) {
    throw new Error(
      `Skill candidate review action must be one of: ${SKILL_CANDIDATE_REVIEW_ACTIONS.join(", ")}.`
    );
  }

  return value as SkillCandidateReviewAction;
}

function collectRepeatableOption(
  value: string,
  previous: string[] = []
): string[] {
  return [...previous, value];
}

function buildSkillCandidateCliEdits(
  options: SkillCandidateReviewCliOptions
): RuntimeSkillCandidateReviewRequest["edits"] | undefined {
  const edits: RuntimeSkillCandidateReviewRequest["edits"] = {
    ...(options.activation === undefined
      ? {}
      : { intendedActivationConditions: options.activation }),
    ...(options.counterexample === undefined
      ? {}
      : { counterexamples: options.counterexample }),
    ...(options.example === undefined ? {} : { examples: options.example }),
    ...(options.knownRisk === undefined
      ? {}
      : { knownRisks: options.knownRisk }),
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.requiredTool === undefined
      ? {}
      : { requiredTools: options.requiredTool }),
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.triggerReason === undefined
      ? {}
      : { triggerReason: options.triggerReason }),
    ...(options.workflowStep === undefined
      ? {}
      : { workflowSteps: options.workflowStep }),
    ...(options.workflowSummary === undefined
      ? {}
      : { workflowSummary: options.workflowSummary })
  };

  return Object.keys(edits).length === 0 ? undefined : edits;
}

function collectSkillReference(
  value: string,
  previous: string[] = []
): string[] {
  return [...previous, value];
}

function renderOneShotText(result: OneShotPrintTaskResult): string {
  const providerLabel =
    result.provider === null
      ? "not configured"
      : `${result.provider.providerName} (${result.provider.model ?? "model not configured"})`;
  const waitingLine =
    result.waitingState === null
      ? []
      : [
          `- waiting: ${result.waitingState.reason} - ${result.waitingState.message}`
        ];
  const terminalLine =
    result.terminalState === null
      ? []
      : [
          `- terminal: ${result.terminalState.reason} - ${result.terminalState.message}`
        ];
  const warningLines = result.warnings.map(
    (warning) => `- warning: ${warning}`
  );
  const eventLines = result.events.map(
    (event, index) => `${index + 1}. ${event.type} (${event.eventId})`
  );

  return [
    "One-shot task result:",
    `- task: ${result.task}`,
    `- status: ${result.status}`,
    `- summary: ${result.summary}`,
    `- provider: ${providerLabel}`,
    `- session id: ${result.sessionId}`,
    `- task id: ${result.taskId}`,
    `- correlation id: ${result.correlationId}`,
    ...waitingLine,
    ...terminalLine,
    ...renderProjectContextText(result.projectContext),
    ...renderTaskContextText(result.contextPacket),
    ...renderFinalSummaryText(result.finalSummary),
    "Runtime events:",
    ...eventLines,
    ...warningLines
  ].join("\n");
}

function renderOneShotJson(result: OneShotPrintTaskResult): string {
  return JSON.stringify(result, null, 2);
}

function renderSkillsListJson(result: ListSkillsResult): string {
  return JSON.stringify(result, null, 2);
}

function renderSkillsListText(result: ListSkillsResult): string {
  const projectSkills = result.skills.filter(
    (skill) => skill.source === "project"
  );
  const globalSkills = result.skills.filter(
    (skill) => skill.source === "global"
  );

  return [
    "Skills registry:",
    "Registry roots:",
    ...result.registryRoots.map(
      (root) =>
        `- ${root.source}: ${root.path} (${root.exists ? "found" : "missing"})`
    ),
    "Project skills:",
    ...renderAvailableSkills(projectSkills),
    "Global skills:",
    ...renderAvailableSkills(globalSkills),
    "Unavailable skills:",
    ...renderUnavailableSkills(result.unavailableSkills),
    "Warnings:",
    ...renderSkillWarnings(result)
  ].join("\n");
}

function renderAvailableSkills(skills: SkillRegistryEntry[]): string[] {
  if (skills.length === 0) {
    return ["- none"];
  }

  return skills.flatMap((skill) => [
    `- ${skill.name} [${skill.lifecycleState}]`,
    `  description: ${skill.description}`,
    `  source: ${skill.source}`,
    `  path: ${skill.relativePath}`,
    `  activation: ${skill.activationHint}`
  ]);
}

function renderUnavailableSkills(
  unavailableSkills: UnavailableSkillRegistryEntry[]
): string[] {
  if (unavailableSkills.length === 0) {
    return ["- none"];
  }

  return unavailableSkills.map((skill) => {
    const pathLabel = skill.relativePath ?? skill.registryRoot;

    return `- ${pathLabel} [${skill.lifecycleState}] - ${skill.warning.code}: ${skill.warning.message}`;
  });
}

function renderSkillWarnings(result: ListSkillsResult): string[] {
  if (result.warnings.length === 0) {
    return ["- none"];
  }

  return result.warnings.map((warning) => {
    const pathLabel =
      warning.relativePath === undefined ? "" : ` (${warning.relativePath})`;

    return `- ${warning.code}${pathLabel}: ${warning.message}`;
  });
}

function renderSkillCandidateListJson(
  candidates: SkillCandidateReviewView[]
): string {
  return JSON.stringify({ candidates }, null, 2);
}

function renderSkillCandidateListText(
  candidates: SkillCandidateReviewView[]
): string {
  return [
    "Skill candidates:",
    ...(candidates.length === 0
      ? ["- none"]
      : candidates.flatMap((candidate) => [
          `- ${candidate.candidateId} [${candidate.lifecycleStatus}]`,
          `  name: ${candidate.name}`,
          `  confidence: ${candidate.confidence}`,
          `  trigger: ${candidate.triggerReason}`,
          `  required tools: ${candidate.requiredTools.join(", ")}`
        ]))
  ].join("\n");
}

function renderSkillCandidateViewJson(
  candidate: SkillCandidateReviewView
): string {
  return JSON.stringify(candidate, null, 2);
}

function renderSkillCandidateViewText(
  candidate: SkillCandidateReviewView
): string {
  return [
    `Skill candidate ${candidate.candidateId}:`,
    `- name: ${candidate.name}`,
    `- lifecycle: ${candidate.lifecycleStatus}`,
    `- confidence: ${candidate.confidence}`,
    `- summary: ${candidate.summary}`,
    `- trigger: ${candidate.triggerReason}`,
    "Intended activation:",
    ...candidate.intendedActivationConditions.map((value) => `- ${value}`),
    "Workflow steps:",
    ...candidate.workflowSteps.map((value) => `- ${value}`),
    "Required tools:",
    ...candidate.requiredTools.map((value) => `- ${value}`),
    "Known risks:",
    ...candidate.knownRisks.map((value) => `- ${value}`),
    "Examples:",
    ...candidate.examples.map((value) => `- ${value}`),
    "Counterexamples:",
    ...candidate.counterexamples.map((value) => `- ${value}`),
    "Source evidence:",
    `- events: ${candidate.sourceEventIds.join(", ")}`,
    `- skill signals: ${candidate.sourceSkillSignalIds.join(", ")}`,
    `- sessions: ${candidate.sourceSessionIds.join(", ")}`,
    `- tasks: ${candidate.sourceTaskIds.join(", ")}`,
    ...(candidate.rejectionReason === undefined
      ? []
      : [`- rejection reason: ${candidate.rejectionReason}`]),
    ...(candidate.promotedSkillReference === undefined
      ? []
      : [`- promoted skill: ${candidate.promotedSkillReference}`])
  ].join("\n");
}

function renderSkillCandidateReviewJson(
  result: RuntimeSkillCandidateReviewResult
): string {
  return JSON.stringify(result, null, 2);
}

function renderSkillCandidateReviewText(
  result: RuntimeSkillCandidateReviewResult
): string {
  return [
    `Skill candidate ${result.view.candidateId} reviewed.`,
    `- lifecycle: ${result.view.lifecycleStatus}`,
    ...(result.promotedSkillReference === undefined
      ? []
      : [`- promoted skill: ${result.promotedSkillReference}`]),
    `- event: ${result.events[0]?.eventId ?? "not emitted"}`
  ].join("\n");
}

function renderProjectContextText(
  projectContext: OneShotPrintTaskResult["projectContext"]
): string[] {
  return [
    "Project context:",
    `- note: ${projectContext.warning}`,
    ...projectContext.records.map((record) => {
      const byteSummary =
        record.totalBytes === 0
          ? "0 bytes"
          : record.truncated
            ? `${record.bytesRead}/${record.totalBytes} bytes`
            : `${record.bytesRead} bytes`;
      const reason = record.reason === undefined ? "" : ` - ${record.reason}`;
      const preview =
        record.preview === undefined ? "" : ` - preview: ${record.preview}`;

      return `- ${record.fileName}: ${record.status}, ${record.trust}, ${byteSummary}${reason}${preview}`;
    })
  ];
}

function renderTaskContextText(
  contextPacket: OneShotPrintTaskResult["contextPacket"]
): string[] {
  return [
    "Task context:",
    `- summary: included=${contextPacket.summary.includedCount}, skipped=${contextPacket.summary.skippedCount}, blocked=${contextPacket.summary.blockedCount}, redacted=${contextPacket.summary.redactedCount}`,
    ...contextPacket.summary.sections.map(
      (section) =>
        `- ${section.source}: ${section.status}, ${section.trust}${section.redacted ? ", redacted" : ""} - ${section.summary}`
    )
  ];
}

function renderSessionInspectionJson(view: SessionInspectionView): string {
  return JSON.stringify(view, null, 2);
}

function renderSessionResumeJson(result: SessionResumeResult): string {
  return JSON.stringify(result, null, 2);
}

function renderSessionCompactionJson(
  result: ManualSessionCompactionResult
): string {
  return JSON.stringify(result, null, 2);
}

function renderSessionInspectionText(view: SessionInspectionView): string {
  const latestTask = view.latestTask;
  const latestTaskLines =
    latestTask === undefined
      ? [
          "- task id: none",
          "- correlation id: none",
          "- goal: none",
          "- status: unknown",
          "- current phase: unknown"
        ]
      : [
          `- task id: ${latestTask.taskId}`,
          `- correlation id: ${latestTask.correlationId}`,
          `- goal: ${latestTask.goal}`,
          `- status: ${latestTask.status}`,
          `- current phase: ${latestTask.currentPhase}`
        ];
  const latestPlanLines =
    latestTask?.latestPlan === undefined || latestTask.latestPlan.length === 0
      ? ["- none"]
      : latestTask.latestPlan.map(
          (step, index) =>
            `${index + 1}. [${step.phase}] ${step.status} - ${step.summary}`
        );
  const eventLines =
    view.recentEvents.length === 0
      ? ["- none"]
      : view.recentEvents.map(
          (event, index) =>
            `${index + 1}. ${event.type} (${event.eventId}) - ${event.summary}`
        );
  const commandLines =
    view.commandsRun.length === 0
      ? ["- none"]
      : view.commandsRun.map((command) => `- ${command}`);
  const warningLines =
    view.warnings.length === 0
      ? ["- none"]
      : view.warnings.map((warning) => `- ${warning}`);

  return [
    "Session state:",
    `- session id: ${view.sessionId}`,
    `- cwd: ${view.cwd}`,
    `- schema version: ${view.schemaVersion}`,
    `- event count: ${view.eventCount}`,
    `- persisted event count: ${view.persistedEventCount}`,
    ...latestTaskLines,
    `- execution state: ${view.executionState.kind} - ${view.executionState.detail}`,
    "Latest plan:",
    ...latestPlanLines,
    "Recent events:",
    ...eventLines,
    "Files read:",
    ...formatPathList(view.filesRead),
    "Files changed:",
    ...formatPathList(view.filesChanged),
    "Files proposed for change:",
    ...formatPathList(view.filesProposedForChange),
    "Commands run:",
    ...commandLines,
    `- pending approvals: ${view.pendingApprovalCount}`,
    "Last error:",
    view.lastError === undefined ? "- none" : `- ${view.lastError}`,
    "Next step:",
    view.nextStep === undefined ? "- none" : `- ${view.nextStep}`,
    "Warnings:",
    ...warningLines
  ].join("\n");
}

function renderSessionResumeText(result: SessionResumeResult): string {
  const latestPlanLines =
    result.latestPlan.length === 0
      ? ["- none"]
      : result.latestPlan.map(
          (step, index) =>
            `${index + 1}. [${step.phase}] ${step.status} - ${step.summary}`
        );
  const commandLines =
    result.inspection.commandsRun.length === 0
      ? ["- none"]
      : result.inspection.commandsRun.map((command) => `- ${command}`);
  const warningLines =
    result.warnings.length === 0
      ? ["- none"]
      : result.warnings.map((warning) => `- ${warning}`);

  return [
    "Session resumed:",
    `- session id: ${result.sessionId}`,
    `- task id: ${result.taskId}`,
    `- correlation id: ${result.correlationId}`,
    `- goal: ${result.goal}`,
    `- status: ${result.status}`,
    `- current phase: ${result.currentPhase}`,
    `- restored event count: ${result.restoredEventCount}`,
    `- resume event id: ${result.resumeEventId}`,
    `- execution state: ${result.inspection.executionState.kind} - ${result.inspection.executionState.detail}`,
    "Latest plan:",
    ...latestPlanLines,
    "Files read:",
    ...formatPathList(result.inspection.filesRead),
    "Files changed:",
    ...formatPathList(result.inspection.filesChanged),
    "Files proposed for change:",
    ...formatPathList(result.inspection.filesProposedForChange),
    "Commands run:",
    ...commandLines,
    `- pending approvals: ${result.inspection.pendingApprovalCount}`,
    "Last error:",
    result.inspection.lastError === undefined
      ? "- none"
      : `- ${result.inspection.lastError}`,
    "Next step:",
    result.inspection.nextStep === undefined
      ? "- none"
      : `- ${result.inspection.nextStep}`,
    "Warnings:",
    ...warningLines
  ].join("\n");
}

function renderSessionCompactionText(
  result: ManualSessionCompactionResult
): string {
  const firstRetainedEventId =
    result.source.firstRetainedEventId ?? "not recorded";
  const previousArtifactId =
    result.source.previousCompactionArtifactId ?? "none";
  const warningLines =
    result.warnings === undefined || result.warnings.length === 0
      ? []
      : ["Warnings:", ...result.warnings.map((warning) => `- ${warning}`)];

  return [
    "Session compacted:",
    `- session id: ${result.sessionId}`,
    `- task id: ${result.taskId}`,
    `- artifact id: ${result.artifactId}`,
    `- artifact path: ${result.artifactPath}`,
    `- compaction event id: ${result.compactionEventId}`,
    `- trigger reason: ${result.triggerReason}`,
    `- created at: ${result.createdAt}`,
    `- source event count: ${result.source.eventCount}`,
    `- source event range: ${result.source.eventRange.firstEventId}..${result.source.eventRange.lastEventId}`,
    `- first retained event id: ${firstRetainedEventId}`,
    `- previous compaction artifact id: ${previousArtifactId}`,
    `- task goal: ${result.summary.continuity.taskGoal}`,
    `- decisions preserved: ${result.summary.continuity.decisions.length}`,
    `- files touched preserved: ${result.summary.continuity.filesTouched.length}`,
    `- commands preserved: ${result.summary.continuity.commandsRun.length}`,
    ...warningLines,
    "Next step:",
    `- inspect with: sprite session inspect ${result.sessionId}`
  ].join("\n");
}

function renderFinalSummaryText(summary: FinalTaskSummary): string[] {
  const providerLabel =
    summary.provider === null
      ? "not configured"
      : `${summary.provider.providerName} (${summary.provider.model ?? "model not configured"})`;
  const importantEventLines = summary.importantEvents.map((event) => {
    const reason = event.reason === undefined ? "" : ` - ${event.reason}`;
    return `- ${event.type} (${event.eventId})${reason}`;
  });
  const unresolvedRiskLines =
    summary.unresolvedRisks.length === 0
      ? ["- none"]
      : summary.unresolvedRisks.map((risk) => `- ${risk}`);
  const notAttemptedLines =
    summary.notAttempted.length === 0
      ? ["- none"]
      : summary.notAttempted.map((note) => `- ${note}`);
  const filesReadLines = formatPathList(summary.filesRead);
  const filesChangedLines = formatPathList(summary.filesChanged);
  const filesProposedLines = formatPathList(summary.filesProposedForChange);

  return [
    "Final summary:",
    `- status: ${summary.status}`,
    `- result: ${summary.result}`,
    `- provider: ${providerLabel}`,
    `- session id: ${summary.sessionId}`,
    `- task id: ${summary.taskId}`,
    `- correlation id: ${summary.correlationId}`,
    "Files read:",
    ...filesReadLines,
    "Files changed:",
    ...filesChangedLines,
    "Files proposed for change:",
    ...filesProposedLines,
    "Important events:",
    ...importantEventLines,
    "Unresolved risks:",
    ...unresolvedRiskLines,
    "Not attempted:",
    ...notAttemptedLines
  ];
}

interface InitialTuiStateOptions {
  demo?: boolean;
}

type RuntimePendingApproval = ReturnType<
  AgentRuntime["getPendingApprovals"]
>[number];
type LiveTuiRuntimeSlashIntent = Extract<
  TuiSlashCommandIntent,
  { type: "runtime" }
>;
type LiveTuiInteractionResult =
  | Result<TuiDispatchResult>
  | TuiSlashCommandResult
  | null;

function createInitialTuiPreview(
  runtime: AgentRuntime,
  options: InitialTuiStateOptions = {}
): string {
  return createTuiCommandPreview(createInitialTuiState(runtime, options));
}

function createInitialTuiState(
  runtime: AgentRuntime,
  options: InitialTuiStateOptions = {}
): TuiLiveWorkbenchState {
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    throw bootstrapState.error;
  }

  const runtimeState = createTuiStartupState({
    bootstrapState: bootstrapState.value
  });
  const demoEnabled = options.demo === true;

  return createTuiLiveWorkbenchState({
    events: demoEnabled
      ? createTuiDemoEvents(runtimeState.workspace.cwd.value)
      : [],
    runtimeState,
    workbench: createTuiWorkbenchView({
      pendingApprovals: demoEnabled ? createTuiDemoApprovals() : []
    })
  });
}

export function createCurrentLiveTuiState(
  runtime: AgentRuntime,
  previousState: TuiLiveWorkbenchState,
  events: readonly RuntimeEventRecord[]
): TuiLiveWorkbenchState {
  const activeTask = runtime.getActiveTask();
  const finalSummary =
    activeTask.ok &&
    activeTask.value !== null &&
    shouldShowLiveTuiFinalSummary(activeTask.value)
      ? createFinalTaskSummary({
          ...activeTask.value,
          events: [...events]
        })
      : undefined;
  const learningReviewDetails = createLiveTuiLearningReviewDetails(
    runtime,
    events
  );
  const runtimeState =
    activeTask.ok && activeTask.value !== null
      ? createTuiRuntimeState({
          events,
          flow: activeTask.value
        })
      : {
          ...previousState.runtimeState,
          events: {
            count: events.length,
            latestType: events.at(-1)?.type ?? null
          }
        };

  return createTuiLiveWorkbenchState({
    events,
    ...(finalSummary === undefined ? {} : { finalSummary }),
    latestDispatchError: previousState.latestDispatchError,
    latestDispatchResult: previousState.latestDispatchResult,
    learningReviewDetails,
    runtimeState,
    workbench: createTuiWorkbenchView({
      draft: previousState.workbench.input,
      mode:
        activeTask.ok &&
        activeTask.value !== null &&
        isSteerableTaskStatus(activeTask.value.status)
          ? "steer-task"
          : "submit-task",
      pendingApprovals: runtime
        .getPendingApprovals()
        .map(createTuiApprovalSummaryFromRuntimeApproval)
    })
  });
}

function shouldShowLiveTuiFinalSummary(flow: PlannedExecutionFlow): boolean {
  return (
    flow.status === "completed" ||
    flow.status === "failed" ||
    flow.status === "cancelled" ||
    flow.status === "max-iterations" ||
    flow.waitingState?.reason === "approval-required"
  );
}

function createLiveTuiLearningReviewDetails(
  runtime: AgentRuntime,
  events: readonly RuntimeEventRecord[]
): TuiLearningReviewDetailsInput[] {
  const learningEvents = events.filter(
    (event) => event.type === "learning.review.created"
  );

  if (learningEvents.length === 0) {
    return [];
  }

  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return learningEvents.map(() => ({}));
  }

  return learningEvents.map((event) => {
    const reviews = readLearningReviewArtifacts(
      bootstrapState.value.startup.cwd,
      {
        artifactLimit: 1,
        sessionId: event.sessionId,
        sessionLimit: 1,
        taskId: event.taskId
      }
    );

    if (!reviews.ok) {
      return {};
    }

    const review = reviews.value[0]?.review;

    return review === undefined ? {} : toTuiLearningReviewDetails(review);
  });
}

function toTuiLearningReviewDetails(
  review: StoredLearningReviewArtifact
): TuiLearningReviewDetailsInput {
  return {
    evidence: {
      commandsRun: readReviewEvidenceArray(review, "commandsRun").flatMap(
        toTuiLearningReviewCommandEvidence
      ),
      eventIds: readReviewEvidenceStringArray(review, "eventIds"),
      validationResults: readReviewEvidenceArray(
        review,
        "validationResults"
      ).flatMap(toTuiLearningReviewCommandEvidence)
    },
    facts: toTuiLearningReviewSectionItems(review.facts),
    lessons: toTuiLearningReviewSectionItems(review.lessons),
    memoryCandidates: review.memoryCandidates.flatMap(
      toTuiLearningReviewMemoryCandidate
    ),
    missedAssumptions: toTuiLearningReviewSectionItems(
      review.missedAssumptions
    ),
    mistakes: toTuiLearningReviewSectionItems(review.mistakes),
    proceduralOutputs: (review.proceduralOutputs ?? []).flatMap(
      toTuiLearningReviewProceduralOutput
    ),
    skillSignals: review.skillSignals.flatMap(toTuiLearningReviewSkillSignal),
    summary: review.summary,
    testGaps: toTuiLearningReviewSectionItems(review.testGaps)
  };
}

function toTuiLearningReviewSectionItems(
  items: readonly object[]
): TuiLearningReviewSectionItemInput[] {
  return items.flatMap((item) => {
    const summary = readObjectString(item, "summary");

    if (summary === undefined) {
      return [];
    }

    const evidenceEventIds = readObjectStringArray(item, "evidenceEventIds");

    return [
      {
        ...(evidenceEventIds.length === 0 ? {} : { evidenceEventIds }),
        summary
      }
    ];
  });
}

function toTuiLearningReviewCommandEvidence(
  item: object
): TuiLearningReviewCommandEvidenceInput[] {
  const command = readObjectString(item, "command");
  const eventId = readObjectString(item, "eventId");
  const name = readObjectString(item, "name");

  if (command === undefined && eventId === undefined && name === undefined) {
    return [];
  }

  return [
    {
      ...(command === undefined ? {} : { command }),
      ...(eventId === undefined ? {} : { eventId }),
      ...(name === undefined ? {} : { name }),
      status: readObjectString(item, "status") ?? "unknown"
    }
  ];
}

function toTuiLearningReviewMemoryCandidate(
  item: object
): TuiLearningReviewMemoryCandidateInput[] {
  const candidateId = readObjectString(item, "candidateId");

  if (candidateId === undefined) {
    return [];
  }

  const eventId = readObjectString(item, "eventId");
  const status = readObjectString(item, "status");

  return [
    {
      candidateId,
      ...(eventId === undefined ? {} : { eventId }),
      ...(status === undefined ? {} : { status })
    }
  ];
}

function toTuiLearningReviewSkillSignal(
  item: object
): TuiLearningReviewSkillSignalInput[] {
  const id = readObjectString(item, "id");

  if (id === undefined) {
    return [];
  }

  const evidenceEventIds = readObjectStringArray(item, "evidenceEventIds");
  const triggerReason = readObjectString(item, "triggerReason");
  const workflowSummary = readObjectString(item, "workflowSummary");

  return [
    {
      ...(evidenceEventIds.length === 0 ? {} : { evidenceEventIds }),
      id,
      ...(triggerReason === undefined ? {} : { triggerReason }),
      ...(workflowSummary === undefined ? {} : { workflowSummary })
    }
  ];
}

function toTuiLearningReviewProceduralOutput(
  item: object
): TuiLearningReviewProceduralOutputInput[] {
  const id = readObjectString(item, "id");

  if (id === undefined) {
    return [];
  }

  const workflowSummary = readObjectString(item, "workflowSummary");

  return [
    {
      id,
      ...(workflowSummary === undefined ? {} : { workflowSummary })
    }
  ];
}

function isSteerableTaskStatus(status: string): boolean {
  return status === "planned" || status === "waiting-for-input";
}

function createTuiApprovalSummaryFromRuntimeApproval(
  approval: RuntimePendingApproval
): TuiApprovalRequestSummary {
  return {
    ...(approval.affectedFiles === undefined
      ? {}
      : { affectedFiles: approval.affectedFiles }),
    allowedActions: approval.allowedActions,
    approvalRequestId: approval.approvalRequestId,
    reason: approval.reason,
    requestType: approval.requestType,
    riskLevel: approval.riskLevel,
    summary: approval.summary,
    timeoutMs: approval.timeoutMs,
    ...(approval.toolCallId === undefined
      ? {}
      : { toolCallId: approval.toolCallId })
  };
}

function createTuiDemoEvents(cwd: string): RuntimeEventRecord[] {
  return [
    createRuntimeEventRecord(
      {
        correlationId: "demo-correlation",
        createdAt: new Date(0).toISOString(),
        eventId: "demo-event-1",
        sessionId: "demo-session",
        taskId: "demo-task"
      },
      "tool.call.completed",
      {
        cwd,
        outputReference: {
          fullOutputStored: true,
          path: ".sprite/logs/demo-tool-output.log",
          reason: "large demo output"
        },
        status: "completed",
        summary:
          "Demo tool completed; OPENAI_API_KEY=sk-demo-secret is redacted.",
        toolCallId: "demo-tool-call",
        toolName: "run_command"
      }
    )
  ];
}

function createTuiDemoApprovals(): TuiApprovalRequestSummary[] {
  return [
    {
      affectedFiles: ["README.md"],
      allowedActions: ["allow", "deny", "edit"],
      approvalRequestId: "demo-approval",
      reason:
        "Demo approval for a file edit; OPENAI_API_KEY=sk-demo-secret is redacted.",
      requestType: "file_edit",
      riskLevel: "medium",
      summary: "Demo apply_patch request with TOKEN=sk-demo-secret.",
      timeoutMs: 30_000,
      toolCallId: "demo-tool-call"
    }
  ];
}

function isInteractiveStdout(): boolean {
  return process.stdout.isTTY === true;
}

function createTuiCommandOptions(options: {
  demo?: boolean;
  preview?: boolean;
}): InitialTuiStateOptions {
  return {
    demo: options.demo === true
  };
}

function shouldRenderStaticTuiPreview(options: { preview?: boolean }): boolean {
  return options.preview === true || !isInteractiveStdout();
}

function createTuiNonInteractiveNotice(): string {
  return [
    "note: stdout is not a TTY, so Sprite rendered the static preview instead of the live Ink session.",
    "manual live test: run `sprite tui --demo` in a real terminal."
  ].join("\n");
}

function createTuiPreviewOutput(
  runtime: AgentRuntime,
  options: InitialTuiStateOptions,
  includeNonInteractiveNotice: boolean
): string {
  const preview = createInitialTuiPreview(runtime, options);

  return includeNonInteractiveNotice
    ? `${preview}\n${createTuiNonInteractiveNotice()}`
    : preview;
}

async function runLiveTuiCommand(
  runtime: AgentRuntime,
  options: InitialTuiStateOptions
): Promise<void> {
  let liveState = createInitialTuiState(runtime, options);
  const liveEvents = [...liveState.events];
  let stateListener: ((state: TuiLiveWorkbenchState) => void) | undefined;
  const publishLiveState = (result?: LiveTuiInteractionResult): void => {
    liveState = createCurrentLiveTuiState(runtime, liveState, liveEvents);
    liveState = applyLiveTuiDispatchResult(liveState, result);
    stateListener?.(liveState);
  };
  const subscribeToState: TuiWorkbenchStateSubscriber = (listener) => {
    stateListener = listener;
    const unsubscribe = runtime.subscribeToEvents((event) => {
      liveEvents.push(event);
      queueMicrotask(publishLiveState);
    });

    return () => {
      stateListener = undefined;
      unsubscribe();
    };
  };
  const instance = runTuiWorkbench({
    onInteraction: (interaction) => {
      const handled = handleLiveTuiInteraction(runtime, interaction);

      void handled
        .then((result) => publishLiveState(result))
        .catch((error: unknown) => {
          publishLiveState(err(toLiveTuiDispatchError(error)));
        });

      return interaction.type === "slash-command"
        ? handled.then((result) =>
            isTuiSlashCommandResult(result) ? result : undefined
          )
        : undefined;
    },
    state: liveState,
    subscribeToState
  });

  await instance.waitUntilExit();
}

export function handleLiveTuiInteraction(
  runtime: AgentRuntime,
  interaction: TuiLiveWorkbenchInteraction
): Promise<LiveTuiInteractionResult> {
  if (interaction.type === "exit") {
    return Promise.resolve(null);
  }

  if (interaction.type === "slash-command") {
    return dispatchLiveTuiSlashCommand(
      runtime,
      interaction.intent,
      interaction.visibleSessionId
    );
  }

  if (interaction.type === "cancel") {
    return dispatchTuiUserIntent(
      runtime,
      createTuiCancelIntent(interaction.note)
    );
  }

  if (interaction.type === "approval") {
    return dispatchLiveTuiApprovalInteraction(runtime, interaction);
  }

  const intent = createTuiSubmitIntent(createTuiInputDraft(interaction.text), {
    mode: interaction.mode
  });

  if (!intent.ok) {
    return Promise.resolve(err(intent.error));
  }

  return dispatchTuiUserIntent(runtime, intent.value);
}

async function dispatchLiveTuiSlashCommand(
  runtime: AgentRuntime,
  intent: LiveTuiRuntimeSlashIntent,
  visibleSessionId?: string
): Promise<TuiSlashCommandResult> {
  switch (intent.command) {
    case "new":
      return createLiveTuiSlashResult(
        intent.command,
        "UNSUPPORTED",
        "session",
        {
          nextAction:
            "Exit and run `sprite tui` again, or use a future runtime-owned reset API.",
          summary:
            "/new is not available until a runtime-owned session reset API exists."
        }
      );
    case "model":
      return createLiveTuiModelResult(runtime, intent.command);
    case "memory":
      return createLiveTuiMemoryResult(runtime, intent.command);
    case "skills":
      return createLiveTuiSkillsResult(runtime, intent.command);
    case "tools":
      return createLiveTuiToolsResult(intent.command);
    case "compact":
      return createLiveTuiCompactionResult(runtime, intent, visibleSessionId);
    case "resume":
      return createLiveTuiResumeResult(runtime, intent);
    case "review-learning":
      return createLiveTuiLearningReviewResult(
        runtime,
        intent.command,
        intent.args
      );
  }
}

function createLiveTuiModelResult(
  runtime: AgentRuntime,
  command: LiveTuiRuntimeSlashIntent["command"]
): TuiSlashCommandResult {
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return createLiveTuiSlashErrorResult(
      command,
      "provider",
      bootstrapState.error
    );
  }

  const provider = bootstrapState.value.provider;

  return createLiveTuiSlashResult(command, "OK", "provider", {
    items: [
      {
        label: "provider",
        value:
          provider?.providerName ??
          bootstrapState.value.startup.provider ??
          "unknown"
      },
      {
        label: "model",
        value:
          provider?.model ?? bootstrapState.value.startup.model ?? "unknown"
      },
      {
        label: "auth",
        value:
          provider?.auth.authenticated === true
            ? provider.auth.secretRedacted
              ? "configured-redacted"
              : "configured"
            : "missing"
      }
    ],
    nextAction:
      "Use provider configuration commands for changes; switching is out of scope here.",
    summary: "Current provider and model state loaded."
  });
}

function createLiveTuiMemoryResult(
  runtime: AgentRuntime,
  command: LiveTuiRuntimeSlashIntent["command"]
): TuiSlashCommandResult {
  const candidates = runtime.listMemoryCandidates();

  if (!candidates.ok) {
    return createLiveTuiSlashErrorResult(command, "memory", candidates.error);
  }

  return createLiveTuiSlashResult(command, "OK", "memory", {
    items: candidates.value.slice(0, 5).map((candidate) => ({
      label: candidate.candidateId,
      value: `${candidate.memoryType} · ${candidate.lifecycleStatus} · ${candidate.confidence}`
    })),
    nextAction:
      candidates.value.length === 0
        ? "No memory candidates are waiting for review."
        : "Use the dedicated memory review workflow for accept/edit/reject actions.",
    summary: `${candidates.value.length} memory candidate${candidates.value.length === 1 ? "" : "s"} available.`
  });
}

function createLiveTuiSkillsResult(
  runtime: AgentRuntime,
  command: LiveTuiRuntimeSlashIntent["command"]
): TuiSlashCommandResult {
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return createLiveTuiSlashErrorResult(
      command,
      "skills",
      bootstrapState.error
    );
  }

  const skillList = listSkills({
    cwd: bootstrapState.value.startup.cwd
  });
  const candidates = runtime.listSkillCandidates();

  if (!candidates.ok) {
    return createLiveTuiSlashErrorResult(command, "skills", candidates.error);
  }

  const manualSkillItems = skillList.skills.slice(0, 3).map((skill) => ({
    label: skill.name,
    value: `${skill.source} · ${skill.lifecycleState}`
  }));
  const candidateItems = candidates.value.slice(0, 3).map((candidate) => ({
    label: candidate.name,
    value: `${candidate.lifecycleStatus} · ${candidate.confidence}`
  }));

  return createLiveTuiSlashResult(command, "OK", "skills", {
    items: [...manualSkillItems, ...candidateItems],
    nextAction:
      "Use manual skill invocation or skill candidate review commands for mutations.",
    summary: `${skillList.skills.length} manual skill${skillList.skills.length === 1 ? "" : "s"} and ${candidates.value.length} skill candidate${candidates.value.length === 1 ? "" : "s"} available.`
  });
}

function createLiveTuiToolsResult(
  command: LiveTuiRuntimeSlashIntent["command"]
): TuiSlashCommandResult {
  const toolNames = listToolNames();

  return createLiveTuiSlashResult(command, "OK", "tools", {
    items: toolNames.map((toolName) => ({
      label: "tool",
      value: toolName
    })),
    nextAction:
      "Slash command lists tools only; tool execution still goes through runtime policy.",
    summary: `${toolNames.length} registered tool${toolNames.length === 1 ? "" : "s"} available.`
  });
}

function createLiveTuiCompactionResult(
  runtime: AgentRuntime,
  intent: LiveTuiRuntimeSlashIntent,
  visibleSessionId?: string
): TuiSlashCommandResult {
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return createLiveTuiSlashErrorResult(
      intent.command,
      "compaction",
      bootstrapState.error
    );
  }

  const sessionId =
    intent.args.sessionId ?? visibleSessionId ?? readActiveSessionId(runtime);

  if (sessionId === undefined) {
    return createLiveTuiSlashResult(
      intent.command,
      "MISSING_ARG",
      "compaction",
      {
        nextAction:
          "Run /compact ses_... after copying a persisted session id.",
        summary: "No current session id is visible for compaction."
      }
    );
  }

  const compacted = compactSessionManually(
    bootstrapState.value.startup.cwd,
    sessionId
  );

  if (!compacted.ok) {
    return createLiveTuiSlashErrorResult(
      intent.command,
      "compaction",
      compacted.error
    );
  }

  return createLiveTuiSlashResult(intent.command, "OK", "compaction", {
    items: [
      {
        label: "session",
        value: compacted.value.sessionId
      },
      {
        label: "artifact",
        value: compacted.value.artifactId
      },
      {
        label: "event",
        value: compacted.value.compactionEventId
      }
    ],
    nextAction:
      "Resume or continue the session with compacted context available.",
    summary: "Manual session compaction completed."
  });
}

function createLiveTuiResumeResult(
  runtime: AgentRuntime,
  intent: LiveTuiRuntimeSlashIntent
): TuiSlashCommandResult {
  const resumed = runtime.resumeSession(intent.args.sessionId ?? "");

  if (!resumed.ok) {
    return createLiveTuiSlashErrorResult(
      intent.command,
      "session",
      resumed.error
    );
  }

  return createLiveTuiSlashResult(intent.command, "OK", "session", {
    items: [
      {
        label: "session",
        value: resumed.value.sessionId
      },
      {
        label: "task",
        value: resumed.value.taskId
      },
      {
        label: "status",
        value: resumed.value.status
      },
      {
        label: "events",
        value: String(resumed.value.restoredEventCount)
      }
    ],
    nextAction: "Continue from the restored runtime state.",
    summary: "Session resumed from local persisted state."
  });
}

function createLiveTuiLearningReviewResult(
  runtime: AgentRuntime,
  command: LiveTuiRuntimeSlashIntent["command"],
  args: { sessionId?: string }
): TuiSlashCommandResult {
  const bootstrapState = runtime.getBootstrapState();

  if (!bootstrapState.ok) {
    return createLiveTuiSlashErrorResult(
      command,
      "learning-review",
      bootstrapState.error
    );
  }

  const reviews = readLearningReviewArtifacts(
    bootstrapState.value.startup.cwd,
    {
      artifactLimit: 5,
      ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
      sessionLimit: 20
    }
  );

  if (!reviews.ok) {
    return createLiveTuiSlashErrorResult(
      command,
      "learning-review",
      reviews.error
    );
  }

  return createLiveTuiSlashResult(command, "OK", "learning-review", {
    items: reviews.value.flatMap(toLearningReviewResultItems).slice(0, 12),
    nextAction:
      reviews.value.length === 0
        ? "Run a task to completion so Sprite can create a learning review."
        : "Use these bounded review details to decide what to reuse next.",
    summary: `${reviews.value.length} learning review${reviews.value.length === 1 ? "" : "s"} available.`
  });
}

function toLearningReviewResultItems(
  artifact: StoredLearningReviewArtifactResult
): { label: string; value: string }[] {
  const review = artifact.review;

  return [
    {
      label: "summary",
      value: review.summary
    },
    {
      label: "status",
      value: `${review.terminalStatus} · ${review.mode} · ${review.sessionId} · ${review.taskId}`
    },
    {
      label: "facts",
      value: formatReviewSectionSummaries(review.facts)
    },
    {
      label: "lessons",
      value: formatReviewSectionSummaries(review.lessons)
    },
    {
      label: "missed assumptions",
      value: formatReviewSectionSummaries(review.missedAssumptions)
    },
    {
      label: "mistakes",
      value: formatReviewSectionSummaries(review.mistakes)
    },
    {
      label: "test gaps",
      value: formatReviewSectionSummaries(review.testGaps)
    },
    {
      label: "memory candidates",
      value: formatReviewObjectIds(review.memoryCandidates, "candidateId")
    },
    {
      label: "skill signals",
      value: formatReviewObjectIds(review.skillSignals, "id")
    },
    {
      label: "procedural outputs",
      value: formatReviewObjectIds(review.proceduralOutputs ?? [], "id")
    },
    {
      label: "commands",
      value: formatReviewCommands(review)
    },
    {
      label: "validation",
      value: formatReviewValidationResults(review)
    }
  ];
}

function formatReviewSectionSummaries(items: readonly object[]): string {
  return formatBoundedReviewValues(
    items.flatMap((item) => {
      const summary = readObjectString(item, "summary");
      return summary === undefined ? [] : [summary];
    })
  );
}

function formatReviewObjectIds(
  items: readonly object[],
  key: string
): string {
  return formatBoundedReviewValues(
    items.flatMap((item) => {
      const value = readObjectString(item, key);
      return value === undefined ? [] : [value];
    })
  );
}

function formatReviewCommands(review: StoredLearningReviewArtifact): string {
  return formatBoundedReviewValues(
    readReviewEvidenceArray(review, "commandsRun").flatMap((item) => {
      const command = readObjectString(item, "command");
      const status = readObjectString(item, "status");

      if (command === undefined) {
        return [];
      }

      return [`${status ?? "unknown"}: ${command}`];
    })
  );
}

function formatReviewValidationResults(
  review: StoredLearningReviewArtifact
): string {
  return formatBoundedReviewValues(
    readReviewEvidenceArray(review, "validationResults").flatMap((item) => {
      const command = readObjectString(item, "command");
      const name = readObjectString(item, "name");
      const status = readObjectString(item, "status");
      const label = command ?? name;

      if (label === undefined) {
        return [];
      }

      return [`${status ?? "unknown"}: ${label}`];
    })
  );
}

function readReviewEvidenceArray(
  review: StoredLearningReviewArtifact,
  key: string
): readonly object[] {
  const evidence = review.evidence;

  if (typeof evidence !== "object" || evidence === null) {
    return [];
  }

  const value = (evidence as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is object =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  );
}

function readReviewEvidenceStringArray(
  review: StoredLearningReviewArtifact,
  key: string
): string[] {
  const evidence = review.evidence;

  if (typeof evidence !== "object" || evidence === null) {
    return [];
  }

  const value = (evidence as Record<string, unknown>)[key];

  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function readObjectString(item: object, key: string): string | undefined {
  const value = (item as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readObjectStringArray(item: object, key: string): string[] {
  const value = (item as Record<string, unknown>)[key];

  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0
      )
    : [];
}

function formatBoundedReviewValues(
  values: readonly string[],
  limit = 3
): string {
  if (values.length === 0) {
    return "none";
  }

  const visibleValues = values.slice(0, limit);
  const hidden = values.length - visibleValues.length;

  return `${visibleValues.join(" | ")}${hidden === 0 ? "" : ` | +${hidden} more`}`;
}

function readActiveSessionId(runtime: AgentRuntime): string | undefined {
  const activeTask = runtime.getActiveTask();

  return activeTask.ok && activeTask.value !== null
    ? activeTask.value.sessionId
    : undefined;
}

function createLiveTuiSlashResult(
  command: TuiSlashCommandResult["command"],
  status: TuiSlashCommandResult["status"],
  subsystem: string,
  options: {
    items?: readonly { label: string; value: string }[];
    nextAction?: string;
    source?: string;
    summary: string;
  }
): TuiSlashCommandResult {
  return {
    command,
    ...(options.items === undefined
      ? {}
      : {
          items: options.items.map((item) => ({
            label: createLiveTuiSafeString(item.label).value,
            value: createLiveTuiSafeString(item.value).value
          }))
        }),
    ...(options.nextAction === undefined
      ? {}
      : { nextAction: createLiveTuiSafeString(options.nextAction).value }),
    source: options.source ?? "runtime",
    status,
    subsystem: createLiveTuiSafeString(subsystem).value,
    summary: createLiveTuiSafeString(options.summary).value
  };
}

function createLiveTuiSlashErrorResult(
  command: TuiSlashCommandResult["command"],
  subsystem: string,
  error: Error
): TuiSlashCommandResult {
  const codePrefix = error instanceof SpriteError ? `${error.code}: ` : "";

  return createLiveTuiSlashResult(command, "ERROR", subsystem, {
    nextAction: "Check command arguments and runtime state, then try again.",
    source: "runtime",
    summary: `${codePrefix}${error.message}`
  });
}

async function dispatchLiveTuiApprovalInteraction(
  runtime: AgentRuntime,
  interaction: Extract<TuiLiveWorkbenchInteraction, { type: "approval" }>
): Promise<Result<TuiDispatchResult>> {
  const approval = runtime
    .getPendingApprovals()
    .find(
      (pendingApproval) =>
        pendingApproval.approvalRequestId === interaction.approvalRequestId
    );

  if (approval === undefined) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_NOT_PENDING",
        "Approval is no longer pending."
      )
    );
  }

  const selection = createLiveTuiApprovalSelection(approval, interaction);

  if (!selection.ok) {
    return err(selection.error);
  }

  const intent = createTuiApprovalResponseIntent(
    createTuiApprovalSummaryFromRuntimeApproval(approval),
    selection.value
  );

  if (!intent.ok) {
    return err(intent.error);
  }

  return dispatchTuiUserIntent(runtime, intent.value);
}

function createLiveTuiApprovalSelection(
  approval: RuntimePendingApproval,
  interaction: Extract<TuiLiveWorkbenchInteraction, { type: "approval" }>
) {
  switch (interaction.action) {
    case "allow":
      return {
        ok: true as const,
        value: { action: "allow" as const }
      };
    case "deny":
      return {
        ok: true as const,
        value: { action: "deny" as const }
      };
    case "timeout":
      return {
        ok: true as const,
        value: { action: "timeout" as const }
      };
    case "edit":
      return createLiveTuiApprovalEditSelection(approval, interaction.editText);
  }
}

function createLiveTuiApprovalEditSelection(
  approval: RuntimePendingApproval,
  editText: string | undefined
) {
  const boundedText = validateLiveTuiApprovalEditText(editText);

  if (!boundedText.ok) {
    return err(boundedText.error);
  }

  return approval.requestType === "command"
    ? createLiveTuiCommandEditSelection(approval, boundedText.value)
    : createLiveTuiFileEditSelection(boundedText.value);
}

function validateLiveTuiApprovalEditText(
  editText: string | undefined
): Result<string> {
  if (editText === undefined || editText.trim().length === 0) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_EMPTY",
        "Approval edit payload cannot be empty."
      )
    );
  }

  if (Buffer.byteLength(editText, "utf8") > LIVE_TUI_APPROVAL_EDIT_MAX_BYTES) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_TOO_LARGE",
        `Approval edit payload is limited to ${LIVE_TUI_APPROVAL_EDIT_MAX_BYTES} bytes.`
      )
    );
  }

  return { ok: true, value: editText.trim() };
}

function createLiveTuiCommandEditSelection(
  approval: RuntimePendingApproval,
  editText: string
) {
  const parsedJson = tryParseJsonObject(editText);
  const cwd = approval.cwd;

  if (cwd === undefined || cwd.trim().length === 0) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_CWD_MISSING",
        "Command approval edits require the original approval cwd."
      )
    );
  }

  if (parsedJson !== null) {
    const command = readRequiredString(parsedJson, "command");

    if (!command.ok) {
      return err(command.error);
    }

    const args = readOptionalStringArray(parsedJson, "args");

    if (!args.ok) {
      return err(args.error);
    }

    const timeoutMs = readOptionalPositiveInteger(parsedJson, "timeoutMs");

    if (!timeoutMs.ok) {
      return err(timeoutMs.error);
    }

    const editedCwd = readOptionalString(parsedJson, "cwd");

    if (!editedCwd.ok) {
      return err(editedCwd.error);
    }

    return {
      ok: true as const,
      value: {
        action: "edit" as const,
        modifiedRequest: {
          ...(args.value === undefined ? {} : { args: args.value }),
          command: command.value,
          cwd: editedCwd.value ?? cwd,
          timeoutMs: timeoutMs.value ?? approval.timeoutMs,
          type: "command" as const
        }
      }
    };
  }

  if (editText.trimStart().startsWith("{")) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_JSON_INVALID",
        "Command approval edit JSON must be a valid object."
      )
    );
  }

  if (/\s/u.test(editText)) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_COMMAND_JSON_REQUIRED",
        'Command edits with arguments must use JSON, for example {"command":"node","args":["--version"]}.'
      )
    );
  }

  return {
    ok: true as const,
    value: {
      action: "edit" as const,
      modifiedRequest: {
        command: editText,
        cwd,
        timeoutMs: approval.timeoutMs,
        type: "command" as const
      }
    }
  };
}

function createLiveTuiFileEditSelection(editText: string) {
  const parsedJson = tryParseJsonObject(editText);

  if (parsedJson === null) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_JSON_REQUIRED",
        "File edit approvals require bounded JSON with an edits array."
      )
    );
  }

  const editsInput = parsedJson.edits;

  if (
    !Array.isArray(editsInput) ||
    editsInput.length === 0 ||
    editsInput.length > LIVE_TUI_APPROVAL_EDIT_MAX_FILE_EDITS
  ) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_EDITS_INVALID",
        `File edit approvals require 1-${LIVE_TUI_APPROVAL_EDIT_MAX_FILE_EDITS} edits.`
      )
    );
  }

  const edits = [];

  for (const editInput of editsInput) {
    if (!isPlainObject(editInput)) {
      return err(
        new SpriteError(
          "TUI_APPROVAL_EDIT_EDIT_INVALID",
          "Each file edit entry must be an object."
        )
      );
    }

    const path = readRequiredString(editInput, "path");
    const oldText = readStringField(editInput, "oldText", true);
    const newText = readStringField(editInput, "newText", true);

    if (!path.ok) {
      return err(path.error);
    }

    if (!oldText.ok) {
      return err(oldText.error);
    }

    if (!newText.ok) {
      return err(newText.error);
    }

    edits.push({
      newText: newText.value,
      oldText: oldText.value,
      path: path.value
    });
  }

  const summary = readOptionalString(parsedJson, "summary");

  if (!summary.ok) {
    return err(summary.error);
  }

  return {
    ok: true as const,
    value: {
      action: "edit" as const,
      modifiedToolCall: {
        input: {
          edits,
          ...(summary.value === undefined ? {} : { summary: summary.value })
        },
        toolName: "apply_patch" as const
      }
    }
  };
}

function applyLiveTuiDispatchResult(
  state: TuiLiveWorkbenchState,
  result: LiveTuiInteractionResult | undefined
): TuiLiveWorkbenchState {
  if (result === undefined || result === null) {
    return state;
  }

  if (isTuiSlashCommandResult(result)) {
    return state;
  }

  if (!result.ok) {
    return createTuiLiveWorkbenchState({
      ...state,
      latestDispatchError: createLiveTuiSafeString(
        formatLiveTuiDispatchError(result.error)
      ),
      latestDispatchResult: undefined
    });
  }

  return createTuiLiveWorkbenchState({
    ...state,
    latestDispatchError: undefined,
    latestDispatchResult: result.value
  });
}

function formatLiveTuiDispatchError(error: Error): string {
  return error instanceof SpriteError
    ? `${error.code}: ${error.message}`
    : error.message;
}

const PRIVATE_PATH_PATTERN =
  /(?:~\/[^\s,;:)]+|\/(?:Applications|Users|Volumes|home|opt|private|tmp|var)\/[^\s,;:)]+|[A-Za-z]:\\Users\\[^\s,;:)]+)/gu;
const PRIVATE_PATH_REDACTION_MARKER = "[REDACTED_PATH]";

function createLiveTuiSafeString(value: string): TuiSafeString {
  const pathRedacted = value.replace(
    PRIVATE_PATH_PATTERN,
    PRIVATE_PATH_REDACTION_MARKER
  );
  const preview = createRedactedPreview(pathRedacted, 96);

  return {
    redacted: containsSecretLikeValue(value) || pathRedacted !== value,
    value: preview.length === 0 ? "unknown" : preview
  };
}

function toLiveTuiDispatchError(error: unknown): SpriteError {
  if (error instanceof SpriteError) {
    return error;
  }

  if (error instanceof Error) {
    return new SpriteError("TUI_LIVE_DISPATCH_FAILED", error.message);
  }

  return new SpriteError(
    "TUI_LIVE_DISPATCH_FAILED",
    `Live TUI dispatch failed: ${String(error)}`
  );
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string
): Result<string> {
  return readStringField(value, key, false);
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string
): Result<string | undefined> {
  if (value[key] === undefined) {
    return { ok: true, value: undefined };
  }

  return readStringField(value, key, false);
}

function readStringField(
  value: Record<string, unknown>,
  key: string,
  allowEmpty: boolean
): Result<string> {
  const field = value[key];

  if (typeof field !== "string" || (!allowEmpty && field.trim().length === 0)) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_FIELD_INVALID",
        `Approval edit field '${key}' must be a${allowEmpty ? "" : " non-empty"} string.`
      )
    );
  }

  return { ok: true, value: allowEmpty ? field : field.trim() };
}

function readOptionalStringArray(
  value: Record<string, unknown>,
  key: string
): Result<string[] | undefined> {
  const field = value[key];

  if (field === undefined) {
    return { ok: true, value: undefined };
  }

  if (
    !Array.isArray(field) ||
    !field.every((item) => typeof item === "string")
  ) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_FIELD_INVALID",
        `Approval edit field '${key}' must be an array of strings.`
      )
    );
  }

  return { ok: true, value: field };
}

function readOptionalPositiveInteger(
  value: Record<string, unknown>,
  key: string
): Result<number | undefined> {
  const field = value[key];

  if (field === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof field !== "number" || !Number.isInteger(field) || field <= 0) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_FIELD_INVALID",
        `Approval edit field '${key}' must be a positive integer.`
      )
    );
  }

  return { ok: true, value: field };
}

function formatPathList(paths: string[]): string[] {
  return paths.length === 0
    ? ["- none"]
    : paths.map((pathValue) => `- ${pathValue}`);
}

export function createProgram(io: CliIO, version = CLI_VERSION): Command {
  const program = new Command();

  program
    .name("sprite")
    .description("Sprite Harness local developer agent runtime")
    .version(version)
    .option("--cancel", "cancel the task after runtime planning")
    .option("--steer <message>", "record steering input after runtime planning")
    .option(
      "--skill <name>",
      "manually load a project/global skill for the task",
      collectSkillReference
    )
    .option("-p, --print <task>", "run a one-shot non-interactive task")
    .option("--output <format>", "print output format: text, json, or ndjson")
    .argument("[task...]", "optional interactive task")
    .action((task: string[] = []) => {
      const options = program.opts<{
        cancel?: boolean;
        steer?: string;
        print?: string;
        output?: string;
        skill?: string[];
      }>();
      const runtimeOptions = {
        homeDir: process.env.HOME ?? process.env.USERPROFILE,
        skillReferences: options.skill ?? []
      };

      if (options.print !== undefined) {
        const outputFormat = parseOutputFormat(options.output);
        const resolvedOutputFormat = resolveOneShotPrintOutputFormat({
          ...runtimeOptions,
          outputFormat
        });

        if (!resolvedOutputFormat.ok) {
          throw resolvedOutputFormat.error;
        }

        const result = runOneShotPrintTask(options.print, {
          ...runtimeOptions,
          outputFormat,
          onEvent:
            resolvedOutputFormat.value === "ndjson"
              ? (event) => writeMessage(io, JSON.stringify(event))
              : undefined
        });

        if (!result.ok) {
          throw result.error;
        }

        if (resolvedOutputFormat.value === "text") {
          writeMessage(io, renderOneShotText(result.value));
          return;
        }

        if (resolvedOutputFormat.value === "json") {
          writeMessage(io, renderOneShotJson(result.value));
          return;
        }

        return;
      }

      if (task.length === 0) {
        writeMessage(io, createBootstrapMessage());
        return;
      }

      writeMessage(
        io,
        createInteractiveTaskMessage(task.join(" "), {
          cancel: options.cancel,
          ...runtimeOptions,
          steer: options.steer
        })
      );
    });

  program
    .command("tui")
    .description("launch the live Ink TUI workbench")
    .option(
      "--preview",
      "render a static TUI preview and exit (not interactive)"
    )
    .option("--demo", "seed the TUI with local demo events and approvals")
    .action(async (options: { demo?: boolean; preview?: boolean }) => {
      const runtime = new AgentRuntime({
        homeDir: process.env.HOME ?? process.env.USERPROFILE
      });
      const tuiOptions = createTuiCommandOptions(options);

      if (shouldRenderStaticTuiPreview(options)) {
        writeMessage(
          io,
          createTuiPreviewOutput(
            runtime,
            tuiOptions,
            options.preview !== true && !isInteractiveStdout()
          )
        );
        return;
      }

      await runLiveTuiCommand(runtime, tuiOptions);
    });

  program
    .command("rpc")
    .description("start JSON-RPC mode over stdin/stdout")
    .action(async () => {
      const runtime = new AgentRuntime({
        homeDir: process.env.HOME ?? process.env.USERPROFILE
      });

      await runJsonRpcStdioServer({
        input: process.stdin,
        output: createCliOutputWritable(io.stdout),
        runtime
      });
    });

  const sessionCommand = program
    .command("session")
    .description("inspect or compact local session state");

  const skillsCommand = program
    .command("skills")
    .description("inspect manually registered reusable skills");

  skillsCommand
    .command("list")
    .description("list project and global manual skills")
    .option("--output <format>", "print output format: text or json")
    .action((options: { output?: string }, command: Command) => {
      const optionValues = command.optsWithGlobals<{ output?: string }>();
      const outputFormat = parseSessionTextJsonOutputFormat(
        options.output ?? optionValues.output,
        "Skills list"
      );
      const result = listSkills({
        cwd: process.cwd(),
        homeDir: process.env.HOME ?? process.env.USERPROFILE
      });

      writeMessage(
        io,
        outputFormat === "json"
          ? renderSkillsListJson(result)
          : renderSkillsListText(result)
      );
    });

  const skillCandidatesCommand = skillsCommand
    .command("candidates")
    .description("review inert skill candidates before promotion");

  skillCandidatesCommand
    .command("list")
    .description("list project-local inert skill candidates")
    .option("--output <format>", "print output format: text or json")
    .action((options: { output?: string }, command: Command) => {
      const optionValues = command.optsWithGlobals<{ output?: string }>();
      const outputFormat = parseSessionTextJsonOutputFormat(
        options.output ?? optionValues.output,
        "Skill candidates list"
      );
      const runtime = new AgentRuntime();
      const candidates = runtime.listSkillCandidates();

      if (!candidates.ok) {
        throw candidates.error;
      }

      writeMessage(
        io,
        outputFormat === "json"
          ? renderSkillCandidateListJson(candidates.value)
          : renderSkillCandidateListText(candidates.value)
      );
    });

  skillCandidatesCommand
    .command("show <candidateId>")
    .description("show a safe skill candidate review view")
    .option("--output <format>", "print output format: text or json")
    .action(
      (candidateId: string, options: { output?: string }, command: Command) => {
        const optionValues = command.optsWithGlobals<{ output?: string }>();
        const outputFormat = parseSessionTextJsonOutputFormat(
          options.output ?? optionValues.output,
          "Skill candidates show"
        );
        const runtime = new AgentRuntime();
        const candidate = runtime.openSkillCandidate(candidateId);

        if (!candidate.ok) {
          throw candidate.error;
        }

        writeMessage(
          io,
          outputFormat === "json"
            ? renderSkillCandidateViewJson(candidate.value)
            : renderSkillCandidateViewText(candidate.value)
        );
      }
    );

  skillCandidatesCommand
    .command("review <candidateId>")
    .description(
      "review a skill candidate as draft, reject, edit, or promote within a resumed session"
    )
    .requiredOption(
      "--action <action>",
      "review action: edit, draft, reject, promote"
    )
    .requiredOption("--reason <reason>", "bounded human review reason")
    .requiredOption(
      "--session <sessionId>",
      "session id that produced or owns the review audit context"
    )
    .option("--reviewed-by <label>", "bounded reviewer label")
    .option("--name <name>", "safe edited skill candidate name")
    .option("--summary <summary>", "safe edited skill candidate summary")
    .option(
      "--trigger-reason <reason>",
      "safe edited skill candidate trigger reason"
    )
    .option(
      "--workflow-summary <summary>",
      "safe edited skill candidate workflow summary"
    )
    .option(
      "--activation <condition>",
      "safe edited activation condition; repeatable",
      collectRepeatableOption
    )
    .option(
      "--workflow-step <step>",
      "safe edited workflow step; repeatable",
      collectRepeatableOption
    )
    .option(
      "--required-tool <tool>",
      "safe edited required tool; repeatable",
      collectRepeatableOption
    )
    .option(
      "--known-risk <risk>",
      "safe edited known risk; repeatable",
      collectRepeatableOption
    )
    .option(
      "--example <example>",
      "safe edited example; repeatable",
      collectRepeatableOption
    )
    .option(
      "--counterexample <counterexample>",
      "safe edited counterexample; repeatable",
      collectRepeatableOption
    )
    .option(
      "--confirm-promotion",
      "required when action is promote before writing a manual skill"
    )
    .option("--promotion-target <target>", "promotion target: project")
    .option("--output <format>", "print output format: text or json")
    .action(
      (
        candidateId: string,
        options: SkillCandidateReviewCliOptions,
        command: Command
      ) => {
        const optionValues = command.optsWithGlobals<{ output?: string }>();
        const outputFormat = parseSessionTextJsonOutputFormat(
          options.output ?? optionValues.output,
          "Skill candidates review"
        );
        const action = parseSkillCandidateReviewAction(options.action);
        const edits = buildSkillCandidateCliEdits(options);

        if (action === "edit" && edits === undefined) {
          throw new Error(
            "Skill candidate edit requires at least one safe edit option."
          );
        }

        const runtime = new AgentRuntime();
        const resumed = runtime.resumeSession(options.session ?? "");

        if (!resumed.ok) {
          throw resumed.error;
        }

        const reviewRequest: RuntimeSkillCandidateReviewRequest = {
          action,
          candidateId,
          ...(options.confirmPromotion === undefined
            ? {}
            : { confirmPromotion: options.confirmPromotion }),
          ...(options.promotionTarget === undefined
            ? {}
            : { promotionTarget: options.promotionTarget as "project" }),
          ...(edits === undefined ? {} : { edits }),
          reason: options.reason ?? "",
          ...(options.reviewedBy === undefined
            ? {}
            : { reviewedBy: options.reviewedBy })
        };
        const reviewed = runtime.reviewSkillCandidate(reviewRequest);

        if (!reviewed.ok) {
          throw reviewed.error;
        }

        writeMessage(
          io,
          outputFormat === "json"
            ? renderSkillCandidateReviewJson(reviewed.value)
            : renderSkillCandidateReviewText(reviewed.value)
        );
      }
    );

  sessionCommand
    .command("inspect <sessionId>")
    .description("inspect a project-local session without resuming it")
    .option("--output <format>", "print output format: text or json")
    .option("--recent-events <n>", "number of recent events to include")
    .action(
      (
        sessionId: string,
        options: {
          output?: string;
          recentEvents?: string;
        },
        command: Command
      ) => {
        const optionValues = command.optsWithGlobals<{
          output?: string;
          recentEvents?: string;
        }>();
        const outputFormat = parseSessionTextJsonOutputFormat(
          options.output ?? optionValues.output,
          "Session inspect"
        );
        const recentEventLimit = parseRecentEventLimit(options.recentEvents);
        const inspected = inspectSessionState(process.cwd(), sessionId, {
          recentEventLimit
        });

        if (!inspected.ok) {
          throw inspected.error;
        }

        writeMessage(
          io,
          outputFormat === "json"
            ? renderSessionInspectionJson(inspected.value)
            : renderSessionInspectionText(inspected.value)
        );
      }
    );

  sessionCommand
    .command("compact <sessionId>")
    .description("compact a project-local session without resuming it")
    .option("--output <format>", "print output format: text or json")
    .action(
      (sessionId: string, options: { output?: string }, command: Command) => {
        const optionValues = command.optsWithGlobals<{ output?: string }>();
        const outputFormat = parseSessionTextJsonOutputFormat(
          options.output ?? optionValues.output,
          "Session compact"
        );
        const compacted = compactSessionManually(process.cwd(), sessionId);

        if (!compacted.ok) {
          throw compacted.error;
        }

        writeMessage(
          io,
          outputFormat === "json"
            ? renderSessionCompactionJson(compacted.value)
            : renderSessionCompactionText(compacted.value)
        );
      }
    );

  program.configureOutput({
    writeOut: (value) => io.stdout.write(value),
    writeErr: (value) => io.stderr.write(value)
  });

  program
    .command("resume <sessionId>")
    .description("resume a project-local session")
    .option("--output <format>", "print output format: text or json")
    .action(
      (sessionId: string, options: { output?: string }, command: Command) => {
        const optionValues = command.optsWithGlobals<{ output?: string }>();
        const outputFormat = parseSessionTextJsonOutputFormat(
          options.output ?? optionValues.output,
          "Session resume"
        );
        const runtime = new AgentRuntime();
        const resumed = runtime.resumeSession(sessionId);

        if (!resumed.ok) {
          throw resumed.error;
        }

        writeMessage(
          io,
          outputFormat === "json"
            ? renderSessionResumeJson(resumed.value)
            : renderSessionResumeText(resumed.value)
        );
      }
    );

  program.exitOverride();

  return program;
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  io: CliIO = process,
  version = CLI_VERSION
): Promise<number> {
  try {
    await createProgram(io, version).parseAsync(["node", "sprite", ...argv], {
      from: "node"
    });
    return 0;
  } catch (error) {
    if (
      error instanceof CommanderError &&
      (error.code === "commander.helpDisplayed" ||
        error.code === "commander.version")
    ) {
      return 0;
    }

    throw error;
  }
}

const isEntrypoint = (() => {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
})();

if (isEntrypoint) {
  runCli().then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    }
  );
}
