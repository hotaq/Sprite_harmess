import {
  Box,
  Text,
  render,
  useApp,
  useInput,
  useWindowSize,
  type Instance,
  type RenderOptions
} from "ink";
import { useEffect, useRef, useState } from "react";
import { containsSecretLikeValue, createRedactedPreview } from "@sprite/shared";
import type {
  TuiLiveWorkbenchState,
  TuiMessageStreamItem,
  TuiSubmitIntentMode
} from "./index.js";

const BLANK_DRAFT_LINE = " ";
const EMPTY_DRAFT_PLACEHOLDER = "Type a prompt…";

export type TuiLiveWorkbenchApprovalAction =
  | "allow"
  | "deny"
  | "edit"
  | "timeout";

export type TuiLiveWorkbenchInteraction =
  | {
      mode: TuiSubmitIntentMode;
      text: string;
      type: "submit";
    }
  | {
      note?: string;
      type: "cancel";
    }
  | {
      action: TuiLiveWorkbenchApprovalAction;
      approvalRequestId: string;
      type: "approval";
    }
  | {
      type: "exit";
    };

export interface TuiWorkbenchAppProps {
  onInteraction?: (interaction: TuiLiveWorkbenchInteraction) => void;
  state: TuiLiveWorkbenchState;
}

export interface RunTuiWorkbenchOptions extends TuiWorkbenchAppProps {
  renderOptions?: RenderOptions;
}

type TuiActionPrompt =
  | {
      type: "cancel";
    }
  | {
      action: TuiLiveWorkbenchApprovalAction;
      approvalRequestId: string;
      type: "approval";
    };

type TuiDetailPanel = "context" | "details" | "help" | "runtime";

type TuiSlashCommand = TuiDetailPanel | "hide";

interface TuiSlashCommandSuggestion {
  command: TuiSlashCommand;
  description: string;
}

interface TuiSubmittedPrompt {
  id: string;
  mode: TuiSubmitIntentMode;
  text: string;
}

const SLASH_COMMAND_SUGGESTIONS: readonly TuiSlashCommandSuggestion[] = [
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

export function TuiWorkbenchApp({
  onInteraction,
  state
}: TuiWorkbenchAppProps): React.JSX.Element {
  const { exit } = useApp();
  const { rows } = useWindowSize();
  const [draftText, setDraftTextState] = useState(state.workbench.input.text);
  const [detailPanel, setDetailPanel] = useState<TuiDetailPanel | null>(null);
  const [actionPrompt, setActionPrompt] = useState<TuiActionPrompt | null>(
    null
  );
  const [submittedPrompts, setSubmittedPrompts] = useState<
    readonly TuiSubmittedPrompt[]
  >([]);
  const draftRef = useRef(draftText);
  const submittedPromptIdRef = useRef(0);

  useEffect(() => {
    draftRef.current = state.workbench.input.text;
    setDraftTextState(state.workbench.input.text);
  }, [state.workbench.input.text]);

  const setDraftText = (value: string): void => {
    draftRef.current = value;
    setDraftTextState(value);
  };

  useInput((input, key) => {
    if (actionPrompt !== null) {
      handleActionPromptInput({
        actionPrompt,
        input,
        key,
        onConfirm: (confirmedPrompt) => {
          if (confirmedPrompt.type === "cancel") {
            onInteraction?.({ type: "cancel" });
            return;
          }

          onInteraction?.({
            action: confirmedPrompt.action,
            approvalRequestId: confirmedPrompt.approvalRequestId,
            type: "approval"
          });
        },
        onDismiss: () => setActionPrompt(null)
      });
      return;
    }

    if (isExitInput(input, key, draftRef.current)) {
      onInteraction?.({ type: "exit" });
      exit();
      return;
    }

    const approvalAction = readApprovalAction(input);
    if (
      approvalAction !== null &&
      draftRef.current.length === 0 &&
      state.workbench.approvals.length > 0
    ) {
      setActionPrompt({
        action: approvalAction,
        approvalRequestId: state.workbench.approvals[0]?.approvalRequestId.value ?? "",
        type: "approval"
      });
      return;
    }

    if (key.escape === true) {
      setActionPrompt({ type: "cancel" });
      return;
    }

    if (isCtrlCInput(input, key)) {
      return;
    }

    if (isNewlineInput(input, key)) {
      setDraftText(`${draftRef.current}\n`);
      return;
    }

    if (isSendInput(input, key)) {
      const slashCommand = parseSlashCommand(draftRef.current);

      if (slashCommand !== null) {
        setDetailPanel(resolveDetailPanel(slashCommand));
        setDraftText("");
        return;
      }

      if (draftRef.current.trim().length === 0) {
        return;
      }

      const submittedText = draftRef.current;
      const submittedPrompt: TuiSubmittedPrompt = {
        id: `submitted-prompt-${submittedPromptIdRef.current++}`,
        mode: state.workbench.mode,
        text: submittedText
      };

      setSubmittedPrompts((currentPrompts) =>
        [...currentPrompts, submittedPrompt].slice(-5)
      );
      onInteraction?.({
        mode: state.workbench.mode,
        text: submittedText,
        type: "submit"
      });
      setDraftText("");
      return;
    }

    if (key.backspace || input === "\u007f") {
      setDraftText(Array.from(draftRef.current).slice(0, -1).join(""));
      return;
    }

    if (isPrintableInput(input)) {
      setDraftText(`${draftRef.current}${input}`);
    }
  });
  const slashCommandSuggestions = getSlashCommandSuggestions(draftText);

  return (
    <Box flexDirection="column" minHeight={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <HeaderSection state={state} />
        <DetailsSection detailPanel={detailPanel} state={state} />
        <SubmittedPromptsSection prompts={submittedPrompts} />
        <ActivitySection state={state} />
        <ApprovalsSection state={state} />
        <ActionPromptSection prompt={actionPrompt} />
      </Box>
      <Box flexDirection="column">
        <SlashCommandSuggestionsSection suggestions={slashCommandSuggestions} />
        <InputSection draftText={draftText} />
        <FooterSection state={state} />
      </Box>
    </Box>
  );
}

export function runTuiWorkbench({
  renderOptions,
  ...props
}: RunTuiWorkbenchOptions): Instance {
  return render(<TuiWorkbenchApp {...props} />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    ...renderOptions
  });
}

function HeaderSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="cyan">
          Sprite Harness
        </Text>
        <Text dimColor> live terminal</Text>
      </Text>
      <Text dimColor>
        {`Enter send · Shift+Enter/Ctrl+J newline · Esc cancel · ${getExitShortcutLabel()} exit · / commands`}
      </Text>
      <Text dimColor>
        {`session ${state.runtimeState.session.status} · events ${state.runtimeState.events.count} · approvals ${state.workbench.approvals.length} · press /help for commands and resources`}
      </Text>
    </Box>
  );
}

function DetailsSection({
  detailPanel,
  state
}: {
  detailPanel: TuiDetailPanel | null;
  state: TuiLiveWorkbenchState;
}): React.JSX.Element | null {
  if (detailPanel === null) {
    return null;
  }

  if (detailPanel === "help") {
    return <SlashCommandHelpSection />;
  }

  return (
    <Box flexDirection="column">
      {detailPanel === "runtime" || detailPanel === "details" ? (
        <ResourceSection title="Runtime" lines={createRuntimeLines(state)} />
      ) : null}
      {detailPanel === "context" || detailPanel === "details" ? (
        <ResourceSection title="Context" lines={createContextLines(state)} />
      ) : null}
    </Box>
  );
}

function SlashCommandHelpSection(): React.JSX.Element {
  return (
    <Box
      borderColor="yellow"
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text bold color="yellow">
        Commands
      </Text>
      <Text>{`/runtime  provider, sandbox, session, latest event`}</Text>
      <Text>{`/context  loaded guidance, skills, memory, warnings`}</Text>
      <Text>{`/details  runtime and context together`}</Text>
      <Text>{`/hide     collapse diagnostics`}</Text>
    </Box>
  );
}

function SlashCommandSuggestionsSection({
  suggestions
}: {
  suggestions: readonly TuiSlashCommandSuggestion[];
}): React.JSX.Element | null {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Box
      borderColor="gray"
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text dimColor>Command suggestions</Text>
      {suggestions.map((suggestion) => (
        <Text key={suggestion.command}>
          <Text color="cyan">{`/${suggestion.command}`}</Text>
          <Text dimColor>{`  ${suggestion.description}`}</Text>
        </Text>
      ))}
    </Box>
  );
}

function ResourceSection({
  lines,
  title
}: {
  lines: readonly string[];
  title: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow">{`[${title}]`}</Text>
      {lines.slice(0, 6).map((line, index) => (
        <Text key={`${title}-${index}`}>{`  ${line}`}</Text>
      ))}
      {lines.length > 6 ? (
        <Text dimColor>{`  ... ${lines.length - 6} more`}</Text>
      ) : null}
    </Box>
  );
}

function SubmittedPromptsSection({
  prompts
}: {
  prompts: readonly TuiSubmittedPrompt[];
}): React.JSX.Element | null {
  if (prompts.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {prompts.map((prompt) => (
        <SubmittedPromptCard key={prompt.id} prompt={prompt} />
      ))}
    </Box>
  );
}

function SubmittedPromptCard({
  prompt
}: {
  prompt: TuiSubmittedPrompt;
}): React.JSX.Element {
  const promptLines = createVisibleDraftLines(prompt.text);

  return (
    <Box
      alignSelf="stretch"
      backgroundColor="blackBright"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      paddingY={1}
    >
      {promptLines.map((line, index) => (
        <Text color="white" key={`${prompt.id}-line-${index}`}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function ActivitySection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element | null {
  const items = state.messageStream.items.slice(-3);

  if (items.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {items.map((item) => (
        <ActivityCard item={item} key={item.eventId} />
      ))}
    </Box>
  );
}

function ActivityCard({
  item
}: {
  item: TuiMessageStreamItem;
}): React.JSX.Element {
  const accentColor = getActivityAccentColor(item.severity);
  const outputLine =
    item.output?.reference === undefined
      ? undefined
      : `output: ${item.output.reference.value}${
          item.output.reason === undefined ? "" : ` (${item.output.reason.value})`
        }`;

  return (
    <Box
      borderColor={accentColor}
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text>
        <Text bold color={accentColor}>
          {formatActivityTitle(item)}
        </Text>
        <Text dimColor>{` · ${item.createdAt}`}</Text>
      </Text>
      <Text>{item.summary.value}</Text>
      {outputLine === undefined ? null : <Text dimColor>{outputLine}</Text>}
    </Box>
  );
}

function ApprovalsSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element | null {
  const approvals = state.workbench.approvals;

  if (approvals.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {approvals.map((approval) => {
        const accentColor = getApprovalAccentColor(approval.riskLevel);

        return (
          <Box
            borderColor={accentColor}
            borderStyle="round"
            flexDirection="column"
            key={approval.approvalRequestId.value}
            marginTop={1}
            paddingX={1}
          >
            <Text>
              <Text bold color={accentColor}>
                Approval required
              </Text>
              {` · ${approval.requestType} · ${approval.riskLevel}`}
            </Text>
            <Text>{approval.summary.value}</Text>
            <Text dimColor>{`reason: ${approval.reason.value}`}</Text>
            <Text dimColor>
              {`A approve · D deny · E edit · T timeout · ${approval.approvalRequestId.value}`}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function ActionPromptSection({
  prompt
}: {
  prompt: TuiActionPrompt | null;
}): React.JSX.Element | null {
  if (prompt === null) {
    return null;
  }

  return (
    <Box
      borderColor="yellow"
      borderStyle="double"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text bold color="yellow">
        Confirm action
      </Text>
      <Text>
        {prompt.type === "cancel"
          ? "Cancel active task?"
          : `Send ${formatApprovalPromptAction(prompt.action)} for ${prompt.approvalRequestId}?`}
      </Text>
      <Text dimColor>
        {prompt.type === "cancel"
          ? "warning: press Esc again to cancel · dismiss: N"
          : "confirm: Y / Enter · dismiss: N / Esc"}
      </Text>
    </Box>
  );
}

function InputSection({
  draftText
}: {
  draftText: string;
}): React.JSX.Element {
  const draftLines = createVisibleDraftLines(draftText);
  const isEmptyDraft = draftText.length === 0;

  return (
    <Box
      borderColor="cyan"
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      {draftLines.map((line, index) => (
        <Text
          dimColor={isEmptyDraft}
          key={`draft-${index}`}
        >
          {line}
        </Text>
      ))}
    </Box>
  );
}

function FooterSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>
        {`Enter send · Shift+Enter/Ctrl+J newline · Esc cancel · ${getExitShortcutLabel()} exit · /help`}
      </Text>
      <Text dimColor>
        {`${state.runtimeState.workspace.cwd.value} · session ${state.runtimeState.session.status} · sandbox ${state.runtimeState.sandbox.mode}`}
      </Text>
    </Box>
  );
}

function createRuntimeLines(state: TuiLiveWorkbenchState): string[] {
  return [
    `cwd: ${state.runtimeState.workspace.cwd.value}`,
    `provider: ${formatStateToken(state.runtimeState.provider.token)} ${state.runtimeState.provider.name} / model ${state.runtimeState.provider.model} / auth ${state.runtimeState.provider.auth}`,
    `sandbox: ${state.runtimeState.sandbox.mode} / output ${state.runtimeState.sandbox.outputFormat} / validations ${state.runtimeState.sandbox.validationCommandCount}`,
    `session: ${state.runtimeState.session.status} / latest event ${state.runtimeState.events.latestType ?? "none"}`
  ];
}

function createContextLines(state: TuiLiveWorkbenchState): string[] {
  const warningLines = state.runtimeState.warnings.previews.values.map(
    (warning) => `warning: ${warning}`
  );

  return [
    `context: ${state.runtimeState.context.loadedCount} loaded, ${state.runtimeState.context.skippedCount} skipped, ${state.runtimeState.context.truncatedCount} truncated`,
    `skills: ${formatStateToken(state.runtimeState.skills.token)} ${state.runtimeState.skills.activeCount} active`,
    `candidates: ${formatStateToken(state.runtimeState.skillCandidates.token)} ${state.runtimeState.skillCandidates.totalCount} candidates`,
    `memory: ${formatStateToken(state.runtimeState.memory.token)} ${
      state.runtimeState.memory.available ? "available" : "missing"
    }`,
    ...warningLines
  ];
}

function formatActivityTitle(item: TuiMessageStreamItem): string {
  return `${item.order}. ${item.kind} · ${item.severity} · ${item.eventType}`;
}

function formatStateToken(token: string): string {
  return `[${token}]`;
}

function getActivityAccentColor(
  severity: TuiMessageStreamItem["severity"]
): "gray" | "green" | "red" | "yellow" {
  switch (severity) {
    case "error":
      return "red";
    case "success":
      return "green";
    case "warning":
      return "yellow";
    case "info":
    case "pending":
      return "gray";
  }
}

function getApprovalAccentColor(riskLevel: string): "cyan" | "red" | "yellow" {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "red";
    case "medium":
      return "yellow";
    default:
      return "cyan";
  }
}

function handleActionPromptInput({
  actionPrompt,
  input,
  key,
  onConfirm,
  onDismiss
}: {
  actionPrompt: TuiActionPrompt;
  input: string;
  key: {
    ctrl?: boolean;
    escape?: boolean;
    return?: boolean;
  };
  onConfirm: (prompt: TuiActionPrompt) => void;
  onDismiss: () => void;
}): void {
  const normalizedInput = input.toLowerCase();
  const isDismiss =
    normalizedInput === "n" ||
    (actionPrompt.type === "approval" && key.escape === true);

  if (isDismiss) {
    onDismiss();
    return;
  }

  const confirmCancel =
    actionPrompt.type === "cancel" && key.escape === true;
  const confirmApproval =
    actionPrompt.type === "approval" &&
    (key.return === true || normalizedInput === "y");

  if (confirmCancel || confirmApproval) {
    onConfirm(actionPrompt);
    onDismiss();
  }
}

function formatApprovalPromptAction(
  action: TuiLiveWorkbenchApprovalAction
): string {
  switch (action) {
    case "allow":
      return "APPROVE";
    case "deny":
      return "DENY";
    case "edit":
      return "EDIT";
    case "timeout":
      return "TIMEOUT";
  }
}

function createVisibleDraftLines(value: string): string[] {
  if (value.length === 0) {
    return [EMPTY_DRAFT_PLACEHOLDER];
  }

  if (containsSecretLikeValue(value)) {
    return ["[REDACTED]"];
  }

  return value
    .split("\n")
    .slice(0, 4)
    .map((line) =>
      line.length === 0
        ? BLANK_DRAFT_LINE
        : createRedactedPreview(line, 96)
    );
}

function readApprovalAction(
  input: string
): TuiLiveWorkbenchApprovalAction | null {
  switch (input.toLowerCase()) {
    case "a":
      return "allow";
    case "d":
      return "deny";
    case "e":
      return "edit";
    case "t":
      return "timeout";
    default:
      return null;
  }
}

function parseSlashCommand(value: string): TuiSlashCommand | null {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "/context":
      return "context";
    case "/details":
      return "details";
    case "/help":
    case "/?":
      return "help";
    case "/hide":
      return "hide";
    case "/runtime":
      return "runtime";
    default:
      return null;
  }
}

function getSlashCommandSuggestions(
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

  return SLASH_COMMAND_SUGGESTIONS.filter((suggestion) =>
    `/${suggestion.command}`.startsWith(normalized)
  );
}

function resolveDetailPanel(command: TuiSlashCommand): TuiDetailPanel | null {
  return command === "hide" ? null : command;
}

function isSendInput(
  input: string,
  key: {
    ctrl?: boolean;
    return?: boolean;
  }
): boolean {
  return (
    key.return === true ||
    input === "\r" ||
    input === "\u0013" ||
    (key.ctrl === true && input.toLowerCase() === "s")
  );
}

function isNewlineInput(
  input: string,
  key: {
    ctrl?: boolean;
    return?: boolean;
    shift?: boolean;
  }
): boolean {
  return (
    (key.return === true && key.shift === true) ||
    input === "\n" ||
    (key.ctrl === true && input.toLowerCase() === "j")
  );
}

function isExitInput(
  input: string,
  key: {
    ctrl?: boolean;
    escape?: boolean;
  },
  draftText: string
): boolean {
  if (draftText.length > 0) {
    return false;
  }

  const inputIsD = input.toLowerCase() === "d";

  return input === "\u0004" || (inputIsD && key.ctrl === true);
}

function getExitShortcutLabel(): string {
  return "Ctrl+D";
}

function isCtrlCInput(
  input: string,
  key: {
    ctrl?: boolean;
  }
): boolean {
  return input === "\u0003" || (key.ctrl === true && input.toLowerCase() === "c");
}

function isPrintableInput(input: string): boolean {
  return (
    input.length > 0 &&
    !Array.from(input).some((char) => char.charCodeAt(0) < 32)
  );
}
