#!/usr/bin/env node

import {
  AgentRuntime,
  createBootstrapMessage,
  createInteractiveTaskMessage,
  inspectSessionState,
  resolveOneShotPrintOutputFormat,
  runOneShotPrintTask,
  type FinalTaskSummary,
  type OneShotPrintOutputFormat,
  type OneShotPrintTaskResult,
  type SessionInspectionView,
  type SessionResumeResult
} from "@sprite/core";
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
const SESSION_INSPECT_OUTPUT_FORMATS = ["text", "json"] as const;
type SessionInspectOutputFormat =
  (typeof SESSION_INSPECT_OUTPUT_FORMATS)[number];

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

function parseSessionInspectOutputFormat(
  value: string | undefined
): SessionInspectOutputFormat {
  if (value === undefined) {
    return "text";
  }

  if (
    !SESSION_INSPECT_OUTPUT_FORMATS.includes(
      value as SessionInspectOutputFormat
    )
  ) {
    throw new Error(
      `Session inspect output format must be one of: ${SESSION_INSPECT_OUTPUT_FORMATS.join(", ")}.`
    );
  }

  return value as SessionInspectOutputFormat;
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
    ...renderFinalSummaryText(result.finalSummary),
    "Runtime events:",
    ...eventLines,
    ...warningLines
  ].join("\n");
}

function renderOneShotJson(result: OneShotPrintTaskResult): string {
  return JSON.stringify(result, null, 2);
}

function renderSessionInspectionJson(view: SessionInspectionView): string {
  return JSON.stringify(view, null, 2);
}

function renderSessionResumeJson(result: SessionResumeResult): string {
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
    .option("-p, --print <task>", "run a one-shot non-interactive task")
    .option("--output <format>", "print output format: text, json, or ndjson")
    .argument("[task...]", "optional interactive task")
    .action((task: string[] = []) => {
      const options = program.opts<{
        cancel?: boolean;
        steer?: string;
        print?: string;
        output?: string;
      }>();

      if (options.print !== undefined) {
        const outputFormat = parseOutputFormat(options.output);
        const resolvedOutputFormat = resolveOneShotPrintOutputFormat({
          outputFormat
        });

        if (!resolvedOutputFormat.ok) {
          throw resolvedOutputFormat.error;
        }

        const result = runOneShotPrintTask(options.print, {
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
          steer: options.steer
        })
      );
    });

  program
    .command("session")
    .description("inspect local session state")
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
        const outputFormat = parseSessionInspectOutputFormat(
          options.output ?? optionValues.output
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
        const outputFormat = parseSessionInspectOutputFormat(
          options.output ?? optionValues.output
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
