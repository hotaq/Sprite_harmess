import { describe, expect, it } from "vitest";
import {
  createTuiSlashCommandSuggestions,
  formatTuiSlashCommandResult,
  parseTuiSlashCommand
} from "@sprite/tui";

describe("TUI slash command contracts", () => {
  it("parses local diagnostics, exit, and runtime commands into typed intents", () => {
    for (const command of ["runtime", "context", "details", "hide", "help"]) {
      expect(parseTuiSlashCommand(`/${command}`)).toMatchObject({
        ok: true,
        value: {
          command,
          type: "local"
        }
      });
    }
    expect(parseTuiSlashCommand("/?")).toMatchObject({
      ok: true,
      value: {
        command: "help",
        type: "local"
      }
    });
    expect(parseTuiSlashCommand("/exit")).toMatchObject({
      ok: true,
      value: {
        command: "exit",
        type: "exit"
      }
    });
    for (const command of ["new", "model", "memory", "skills", "tools"]) {
      expect(parseTuiSlashCommand(`/${command}`)).toMatchObject({
        ok: true,
        value: {
          args: {},
          command,
          type: "runtime"
        }
      });
    }
    expect(parseTuiSlashCommand("/resume ses_abc-123")).toMatchObject({
      ok: true,
      value: {
        args: {
          sessionId: "ses_abc-123"
        },
        command: "resume",
        type: "runtime"
      }
    });
    expect(parseTuiSlashCommand("/compact")).toMatchObject({
      ok: true,
      value: {
        args: {},
        command: "compact",
        type: "runtime"
      }
    });
    expect(parseTuiSlashCommand("/compact ses_current")).toMatchObject({
      ok: true,
      value: {
        args: {
          sessionId: "ses_current"
        },
        command: "compact",
        type: "runtime"
      }
    });
    expect(parseTuiSlashCommand("/review-learning ses_review")).toMatchObject({
      ok: true,
      value: {
        args: {
          sessionId: "ses_review"
        },
        command: "review-learning",
        type: "runtime"
      }
    });
    expect(parseTuiSlashCommand("/review-learning")).toMatchObject({
      ok: true,
      value: {
        args: {},
        command: "review-learning",
        type: "runtime"
      }
    });
  });

  it("returns structured safe errors for unknown, missing, and unsafe arguments", () => {
    expect(parseTuiSlashCommand("normal prompt")).toBeNull();
    expect(parseTuiSlashCommand("/unknown")).toMatchObject({
      ok: false,
      result: {
        command: "unknown",
        status: "UNSUPPORTED",
        subsystem: "slash-command"
      }
    });
    expect(parseTuiSlashCommand("/resume")).toMatchObject({
      ok: false,
      result: {
        command: "resume",
        status: "MISSING_ARG"
      }
    });

    const invalidSecret = parseTuiSlashCommand(
      "/resume OPENAI_API_KEY=sk-secret"
    );

    expect(invalidSecret).toMatchObject({
      ok: false,
      result: {
        command: "resume",
        status: "ERROR"
      }
    });
    expect(invalidSecret?.ok).toBe(false);
    if (invalidSecret === null || invalidSecret.ok) {
      return;
    }

    expect(
      formatTuiSlashCommandResult(invalidSecret.result).join("\n")
    ).not.toContain("sk-secret");

    const unknownSecret = parseTuiSlashCommand("/OPENAI_API_KEY=sk-secret");

    expect(unknownSecret?.ok).toBe(false);
    if (unknownSecret === null || unknownSecret.ok) {
      return;
    }

    const formattedUnknown = formatTuiSlashCommandResult(
      unknownSecret.result
    ).join("\n");

    expect(formattedUnknown).toContain("[REDACTED]");
    expect(formattedUnknown).not.toContain("sk-secret");
    expect(formattedUnknown).not.toContain("OPENAI_API_KEY");
  });

  it("suggests runtime commands and diagnostics only for bounded slash prefixes", () => {
    const suggestions = createTuiSlashCommandSuggestions("/").map(
      (suggestion) => suggestion.command
    );

    expect(suggestions).toEqual(
      expect.arrayContaining([
        "new",
        "resume",
        "model",
        "memory",
        "skills",
        "tools",
        "compact",
        "review-learning",
        "exit",
        "runtime",
        "context",
        "details",
        "hide",
        "help"
      ])
    );
    expect(createTuiSlashCommandSuggestions("/re")).toEqual([
      expect.objectContaining({ command: "resume" }),
      expect.objectContaining({ command: "review-learning" })
    ]);
    expect(createTuiSlashCommandSuggestions("/resume ses_abc")).toEqual([]);
    expect(createTuiSlashCommandSuggestions("/resume\nses_abc")).toEqual([]);
  });

  it("formats command results as redacted, bounded display lines", () => {
    const lines = formatTuiSlashCommandResult({
      command: "memory",
      items: [
        {
          label: "secret",
          value: "OPENAI_API_KEY=sk-secret"
        }
      ],
      nextAction: "Review safe metadata only.",
      source: "runtime",
      status: "OK",
      subsystem: "memory",
      summary: "Memory candidates loaded."
    });

    expect(lines).toContain("command: /memory");
    expect(lines).toContain("status: OK");
    expect(lines.join("\n")).toContain("[REDACTED]");
    expect(lines.join("\n")).not.toContain("sk-secret");
  });
});
