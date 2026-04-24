#!/usr/bin/env node

import {
  createBootstrapMessage,
  createInteractiveTaskMessage,
  resolveOneShotPrintOutputFormat,
  runOneShotPrintTask,
  type OneShotPrintOutputFormat,
  type OneShotPrintTaskResult
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
    "Runtime events:",
    ...eventLines,
    ...warningLines
  ].join("\n");
}

function renderOneShotJson(result: OneShotPrintTaskResult): string {
  return JSON.stringify(result, null, 2);
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

  program.configureOutput({
    writeOut: (value) => io.stdout.write(value),
    writeErr: (value) => io.stderr.write(value)
  });
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
