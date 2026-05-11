#!/usr/bin/env node

import {
  AgentRuntime,
  compactSessionManually,
  createBootstrapMessage,
  createInteractiveTaskMessage,
  createRuntimeEventRecord,
  inspectSessionState,
  listSkills,
  resolveOneShotPrintOutputFormat,
  runOneShotPrintTask,
  type FinalTaskSummary,
  type ListSkillsResult,
  type ManualSessionCompactionResult,
  type OneShotPrintOutputFormat,
  type OneShotPrintTaskResult,
  type RuntimeSkillCandidateReviewRequest,
  type RuntimeSkillCandidateReviewResult,
  type RuntimeEventRecord,
  type SessionInspectionView,
  type SessionResumeResult,
  type SkillCandidateReviewView,
  type SkillRegistryEntry,
  type UnavailableSkillRegistryEntry
} from "@sprite/core";
import {
  createTuiCancelIntent,
  createTuiCommandPreview,
  createTuiInputDraft,
  createTuiLiveWorkbenchState,
  createTuiStartupState,
  createTuiSubmitIntent,
  createTuiWorkbenchView,
  dispatchTuiUserIntent,
  runTuiWorkbench,
  type TuiApprovalRequestSummary,
  type TuiLiveWorkbenchInteraction,
  type TuiLiveWorkbenchState
} from "@sprite/tui";
import { Command, CommanderError } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const CLI_VERSION = packageJson.version;

export interface CliIO {
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
}

function writeMessage(io: CliIO, message: string): void {
  io.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
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

  if (!SKILL_CANDIDATE_REVIEW_ACTIONS.includes(value as SkillCandidateReviewAction)) {
    throw new Error(
      `Skill candidate review action must be one of: ${SKILL_CANDIDATE_REVIEW_ACTIONS.join(", ")}.`
    );
  }

  return value as SkillCandidateReviewAction;
}

function collectRepeatableOption(value: string, previous: string[] = []): string[] {
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

function collectSkillReference(value: string, previous: string[] = []): string[] {
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
    events: demoEnabled ? createTuiDemoEvents(runtimeState.workspace.cwd.value) : [],
    runtimeState,
    workbench: createTuiWorkbenchView({
      pendingApprovals: demoEnabled ? createTuiDemoApprovals() : []
    })
  });
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
  const liveState = createInitialTuiState(runtime, options);
  const instance = runTuiWorkbench({
    onInteraction: (interaction) =>
      handleLiveTuiInteraction(runtime, interaction),
    state: liveState
  });

  await instance.waitUntilExit();
}

function handleLiveTuiInteraction(
  runtime: AgentRuntime,
  interaction: TuiLiveWorkbenchInteraction
): void {
  if (interaction.type === "exit") {
    return;
  }

  if (interaction.type === "cancel") {
    void dispatchTuiUserIntent(runtime, createTuiCancelIntent(interaction.note));
    return;
  }

  if (interaction.type === "approval") {
    return;
  }

  const intent = createTuiSubmitIntent(createTuiInputDraft(interaction.text), {
    mode: interaction.mode
  });

  if (!intent.ok) {
    return;
  }

  void dispatchTuiUserIntent(runtime, intent.value);
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
    .option("--preview", "render a static TUI preview and exit (not interactive)")
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
    .requiredOption("--action <action>", "review action: edit, draft, reject, promote")
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
