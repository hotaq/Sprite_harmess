import { containsSecretLikeValue, createRedactedPreview } from "@sprite/shared";

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_SLASH_ARGUMENT_BYTES = 160;
const RESULT_VALUE_LIMIT = 96;

export type TuiLocalSlashCommandName =
  | "context"
  | "details"
  | "help"
  | "hide"
  | "runtime";

export type TuiRuntimeSlashCommandName =
  | "compact"
  | "memory"
  | "model"
  | "new"
  | "resume"
  | "review-learning"
  | "skills"
  | "tools";

export type TuiSlashCommandName =
  | TuiLocalSlashCommandName
  | TuiRuntimeSlashCommandName
  | "exit";

export type TuiSlashCommandStatus =
  | "ERROR"
  | "MISSING_ARG"
  | "OK"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export interface TuiSlashCommandSuggestion {
  command: TuiSlashCommandName;
  description: string;
}

export interface TuiSlashCommandArgs {
  sessionId?: string;
}

export type TuiSlashCommandIntent =
  | {
      command: TuiLocalSlashCommandName;
      raw: string;
      type: "local";
    }
  | {
      command: "exit";
      raw: string;
      type: "exit";
    }
  | {
      args: TuiSlashCommandArgs;
      command: TuiRuntimeSlashCommandName;
      raw: string;
      type: "runtime";
    };

export interface TuiSlashCommandResultItem {
  label: string;
  value: string;
}

export interface TuiSlashCommandResult {
  command: TuiSlashCommandName | string;
  items?: readonly TuiSlashCommandResultItem[];
  nextAction?: string;
  source?: string;
  status: TuiSlashCommandStatus;
  subsystem: string;
  summary: string;
}

export type TuiSlashCommandParseResult =
  | {
      ok: true;
      value: TuiSlashCommandIntent;
    }
  | {
      ok: false;
      result: TuiSlashCommandResult;
    };

const LOCAL_COMMANDS = new Set<TuiLocalSlashCommandName>([
  "context",
  "details",
  "help",
  "hide",
  "runtime"
]);

const RUNTIME_COMMANDS = new Set<TuiRuntimeSlashCommandName>([
  "compact",
  "memory",
  "model",
  "new",
  "resume",
  "review-learning",
  "skills",
  "tools"
]);

const COMMAND_SUGGESTIONS: readonly TuiSlashCommandSuggestion[] = [
  {
    command: "new",
    description: "start a new runtime session when supported"
  },
  {
    command: "resume",
    description: "resume a persisted session: /resume ses_..."
  },
  {
    command: "model",
    description: "show current provider, model, and auth state"
  },
  {
    command: "memory",
    description: "show bounded memory candidate metadata"
  },
  {
    command: "skills",
    description: "show manual skills and skill candidate metadata"
  },
  {
    command: "tools",
    description: "list registered runtime tools"
  },
  {
    command: "compact",
    description: "compact current or explicit session: /compact [ses_...]"
  },
  {
    command: "review-learning",
    description: "show bounded learning-review lesson metadata"
  },
  {
    command: "exit",
    description: "exit the live TUI"
  },
  {
    command: "runtime",
    description: "provider, sandbox, session, latest event"
  },
  {
    command: "context",
    description: "loaded guidance, skills, memory, warnings"
  },
  {
    command: "details",
    description: "runtime and context together"
  },
  {
    command: "hide",
    description: "collapse diagnostics"
  },
  {
    command: "help",
    description: "show command help"
  }
];

export function parseTuiSlashCommand(
  value: string
): TuiSlashCommandParseResult | null {
  const raw = value.trim();

  if (!raw.startsWith("/")) {
    return null;
  }

  const [commandToken = "", ...args] = raw.slice(1).split(/\s+/);
  const command = normalizeSlashCommandName(commandToken);

  if (command === null) {
    return errorResult(commandToken, "UNSUPPORTED", "slash-command", [
      `Unsupported slash command /${safeValue(commandToken)}.`,
      "Use /help to see available commands."
    ]);
  }

  if (command === "exit") {
    const argumentError = validateNoArguments(command, args);

    return (
      argumentError ?? {
        ok: true,
        value: {
          command,
          raw,
          type: "exit"
        }
      }
    );
  }

  if (LOCAL_COMMANDS.has(command as TuiLocalSlashCommandName)) {
    const localCommand = command as TuiLocalSlashCommandName;
    const argumentError = validateNoArguments(localCommand, args);

    return (
      argumentError ?? {
        ok: true,
        value: {
          command: localCommand,
          raw,
          type: "local"
        }
      }
    );
  }

  const runtimeCommand = command as TuiRuntimeSlashCommandName;
  const parsedArgs = parseRuntimeArguments(runtimeCommand, args);

  if (!parsedArgs.ok) {
    return parsedArgs;
  }

  return {
    ok: true,
    value: {
      args: parsedArgs.args,
      command: runtimeCommand,
      raw,
      type: "runtime"
    }
  };
}

export function createTuiSlashCommandSuggestions(
  value: string
): readonly TuiSlashCommandSuggestion[] {
  const normalized = value.trimStart().toLowerCase();

  if (
    !normalized.startsWith("/") ||
    normalized.includes("\n") ||
    normalized.includes(" ")
  ) {
    return [];
  }

  return COMMAND_SUGGESTIONS.filter((suggestion) =>
    `/${suggestion.command}`.startsWith(normalized)
  );
}

export function formatTuiSlashCommandResult(
  result: TuiSlashCommandResult | undefined
): string[] {
  if (result === undefined) {
    return [];
  }

  const lines = [
    `command: /${safeValue(result.command)}`,
    `status: ${result.status}`,
    `subsystem: ${safeValue(result.subsystem)}`,
    `summary: ${safeValue(result.summary)}`
  ];

  if (result.source !== undefined) {
    lines.push(`source: ${safeValue(result.source)}`);
  }

  for (const item of result.items ?? []) {
    lines.push(`${safeValue(item.label)}: ${safeValue(item.value)}`);
  }

  if (result.nextAction !== undefined) {
    lines.push(`next action: ${safeValue(result.nextAction)}`);
  }

  return lines;
}

export function isTuiSlashCommandResult(
  value: unknown
): value is TuiSlashCommandResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeResult = value as Partial<TuiSlashCommandResult>;

  return (
    typeof maybeResult.command === "string" &&
    typeof maybeResult.status === "string" &&
    typeof maybeResult.subsystem === "string" &&
    typeof maybeResult.summary === "string"
  );
}

function normalizeSlashCommandName(value: string): TuiSlashCommandName | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === "?") {
    return "help";
  }

  if (normalized === "exit") {
    return "exit";
  }

  if (LOCAL_COMMANDS.has(normalized as TuiLocalSlashCommandName)) {
    return normalized as TuiLocalSlashCommandName;
  }

  if (RUNTIME_COMMANDS.has(normalized as TuiRuntimeSlashCommandName)) {
    return normalized as TuiRuntimeSlashCommandName;
  }

  return null;
}

function validateNoArguments(
  command: TuiSlashCommandName,
  args: readonly string[]
): Extract<TuiSlashCommandParseResult, { ok: false }> | null {
  if (args.length === 0 || args.every((arg) => arg.length === 0)) {
    return null;
  }

  return errorResult(command, "ERROR", "slash-command", [
    `/${command} does not accept arguments.`,
    "Remove the extra text and run the command again."
  ]);
}

function parseRuntimeArguments(
  command: TuiRuntimeSlashCommandName,
  args: readonly string[]
):
  | {
      args: TuiSlashCommandArgs;
      ok: true;
    }
  | Extract<TuiSlashCommandParseResult, { ok: false }> {
  const compactArgs = args.filter((arg) => arg.length > 0);

  switch (command) {
    case "resume": {
      if (compactArgs.length === 0) {
        return errorResult(command, "MISSING_ARG", "session", [
          "/resume requires a session id.",
          "Run /resume ses_... with a persisted session id."
        ]);
      }

      return parseOptionalSessionId(command, compactArgs, false);
    }
    case "compact":
    case "review-learning": {
      return parseOptionalSessionId(command, compactArgs, true);
    }
    case "memory":
    case "model":
    case "new":
    case "skills":
    case "tools": {
      const argumentError = validateNoArguments(command, compactArgs);

      return argumentError ?? { args: {}, ok: true };
    }
  }
}

function parseOptionalSessionId(
  command: TuiRuntimeSlashCommandName,
  args: readonly string[],
  optional: boolean
):
  | {
      args: TuiSlashCommandArgs;
      ok: true;
    }
  | Extract<TuiSlashCommandParseResult, { ok: false }> {
  if (args.length === 0) {
    return optional
      ? { args: {}, ok: true }
      : errorResult(command, "MISSING_ARG", "session", [
          `/${command} requires a session id.`,
          `Run /${command} ses_... with a persisted session id.`
        ]);
  }

  if (args.length > 1) {
    return errorResult(command, "ERROR", "slash-command", [
      `/${command} accepts at most one session id.`,
      "Remove extra arguments and try again."
    ]);
  }

  const [sessionId] = args;

  if (sessionId === undefined || !isBoundedArgument(sessionId)) {
    return errorResult(command, "ERROR", "session", [
      "Slash command arguments must be short bounded values.",
      "Use a session id such as ses_abc123."
    ]);
  }

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return errorResult(command, "ERROR", "session", [
      `Session id must match ses_...; received ${safeValue(sessionId)}.`,
      "Copy a persisted session id and try again."
    ]);
  }

  return {
    args: {
      sessionId
    },
    ok: true
  };
}

function errorResult(
  command: string,
  status: Exclude<TuiSlashCommandStatus, "OK">,
  subsystem: string,
  lines: readonly [summary: string, nextAction: string]
): Extract<TuiSlashCommandParseResult, { ok: false }> {
  return {
    ok: false,
    result: {
      command: command.length === 0 ? "unknown" : command,
      nextAction: lines[1],
      source: "parser",
      status,
      subsystem,
      summary: lines[0]
    }
  };
}

function isBoundedArgument(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= MAX_SLASH_ARGUMENT_BYTES;
}

function safeValue(value: string): string {
  if (containsSecretLikeValue(value)) {
    return "[REDACTED]";
  }

  return createRedactedPreview(value, RESULT_VALUE_LIMIT);
}
