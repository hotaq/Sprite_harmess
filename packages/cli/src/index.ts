#!/usr/bin/env node

import { createBootstrapMessage } from "@sprite/core";
import { Command, CommanderError } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLI_VERSION = "0.1.0";

export interface CliIO {
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
}

function writeMessage(io: CliIO, message: string): void {
  io.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
}

export function createProgram(io: CliIO, version = CLI_VERSION): Command {
  const program = new Command();

  program
    .name("sprite")
    .description("Sprite Harness local developer agent runtime")
    .version(version)
    .argument("[task...]", "optional task placeholder")
    .action((task: string[] = []) => {
      if (task.length === 0) {
        writeMessage(io, createBootstrapMessage());
        return;
      }

      writeMessage(
        io,
        `Task execution is not implemented in Story 1.1 yet.\nReceived task: ${task.join(" ")}`
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
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
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
