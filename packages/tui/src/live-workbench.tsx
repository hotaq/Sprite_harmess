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
  TuiWorkbenchApprovalView,
  TuiWorkbenchActionLabel,
  TuiSubmitIntentMode
} from "./index.js";

const BLANK_DRAFT_LINE = " ";
const BRAND_ACCENT_COLOR = "cyan";
const EMPTY_DRAFT_PLACEHOLDER = "Type a prompt…";
const PROMPT_RULE_CHARACTER = "─";

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
      editText?: string;
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
  subscribeToState?: TuiWorkbenchStateSubscriber;
}

export type TuiWorkbenchStateSubscriber = (
  listener: (state: TuiLiveWorkbenchState) => void
) => () => void;

type TuiActionPrompt =
  | {
      type: "cancel";
    }
  | {
      action: TuiLiveWorkbenchApprovalAction;
      approvalRequestId: string;
      type: "approval";
    }
  | {
      approvalRequestId: string;
      type: "approval-edit";
    };

type TuiVisibleActionPrompt =
  | {
      type: "cancel";
    }
  | {
      action: TuiLiveWorkbenchApprovalAction;
      approvalRequestLabel: string;
      approvalRequestId: string;
      type: "approval";
    }
  | {
      approvalRequestId: string;
      approvalRequestLabel: string;
      editText: string;
      requestType: "command" | "file_edit";
      type: "approval-edit";
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
  const [editDraftText, setEditDraftTextState] = useState("");
  const editDraftRef = useRef(editDraftText);
  const externalDraftRef = useRef(state.workbench.input.text);
  const submittedPromptIdRef = useRef(0);

  useEffect(() => {
    if (externalDraftRef.current === state.workbench.input.text) {
      return;
    }

    externalDraftRef.current = state.workbench.input.text;

    if (draftRef.current.length === 0) {
      draftRef.current = state.workbench.input.text;
      setDraftTextState(state.workbench.input.text);
    }
  }, [state.workbench.input.text]);

  const setDraftText = (value: string): void => {
    draftRef.current = value;
    setDraftTextState(value);
  };

  const setEditDraftText = (value: string): void => {
    editDraftRef.current = value;
    setEditDraftTextState(value);
  };

  useEffect(() => {
    if (
      (actionPrompt?.type === "approval" ||
        actionPrompt?.type === "approval-edit") &&
      resolveVisibleActionPrompt(
        actionPrompt,
        state.workbench.approvals,
        editDraftText
      ) === null
    ) {
      setActionPrompt(null);
      setEditDraftText("");
    }
  }, [actionPrompt, state.workbench.approvals]);

  useInput((input, key) => {
    if (actionPrompt !== null) {
      if (actionPrompt.type === "approval-edit") {
        handleApprovalEditPromptInput({
          draftText: editDraftRef.current,
          input,
          key,
          onChange: setEditDraftText,
          onConfirm: () => {
            const currentApprovalPrompt = resolveVisibleActionPrompt(
              actionPrompt,
              state.workbench.approvals,
              editDraftRef.current
            );

            if (
              currentApprovalPrompt === null ||
              currentApprovalPrompt.type !== "approval-edit" ||
              editDraftRef.current.trim().length === 0
            ) {
              return;
            }

            onInteraction?.({
              action: "edit",
              approvalRequestId: currentApprovalPrompt.approvalRequestId,
              editText: editDraftRef.current,
              type: "approval"
            });
            setEditDraftText("");
          },
          onDismiss: () => {
            setActionPrompt(null);
            setEditDraftText("");
          }
        });
        return;
      }

      handleActionPromptInput({
        actionPrompt,
        input,
        key,
        onConfirm: (confirmedPrompt) => {
          if (confirmedPrompt.type === "cancel") {
            onInteraction?.({ type: "cancel" });
            return;
          }

          const currentApprovalPrompt = resolveVisibleActionPrompt(
            confirmedPrompt,
            state.workbench.approvals,
            editDraftText
          );

          if (
            currentApprovalPrompt === null ||
            currentApprovalPrompt.type !== "approval"
          ) {
            return;
          }

          onInteraction?.({
            action: currentApprovalPrompt.action,
            approvalRequestId: currentApprovalPrompt.approvalRequestId,
            type: "approval"
          });
        },
        onDismiss: () => {
          setActionPrompt(null);
          setEditDraftText("");
        }
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
      const approval = state.workbench.approvals[0];

      if (
        approval === undefined ||
        !approval.actions.includes(toApprovalActionLabel(approvalAction))
      ) {
        return;
      }

      setActionPrompt({
        approvalRequestId: approval.controlApprovalRequestId,
        ...(approvalAction === "edit"
          ? { type: "approval-edit" }
          : { action: approvalAction, type: "approval" })
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

      if (detailPanel !== "details") {
        setDetailPanel(null);
      }

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
  const visibleActionPrompt =
    actionPrompt?.type === "approval"
      ? resolveVisibleActionPrompt(
          actionPrompt,
          state.workbench.approvals,
          editDraftText
        )
      : actionPrompt?.type === "approval-edit"
        ? resolveVisibleActionPrompt(
            actionPrompt,
            state.workbench.approvals,
            editDraftText
          )
      : actionPrompt;
  const conversationActionPrompt =
    visibleActionPrompt?.type === "cancel" ? visibleActionPrompt : null;
  const dockActionPrompt =
    visibleActionPrompt?.type === "approval" ||
    visibleActionPrompt?.type === "approval-edit"
      ? visibleActionPrompt
      : null;

  return (
    <Box flexDirection="column" minHeight={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <HeaderSection state={state} />
        <DetailsSection detailPanel={detailPanel} state={state} />
        <SubmittedPromptsSection prompts={submittedPrompts} />
        <ActionPromptSection prompt={conversationActionPrompt} />
        <DispatchStatusSection state={state} />
        <ActivitySection state={state} />
        <ApprovalsSection state={state} />
      </Box>
      <Box flexDirection="column">
        <SlashCommandSuggestionsSection suggestions={slashCommandSuggestions} />
        <InputSection draftText={draftText} />
        <ActionPromptSection prompt={dockActionPrompt} />
        <FooterSection state={state} />
      </Box>
    </Box>
  );
}

export function runTuiWorkbench({
  renderOptions,
  subscribeToState,
  ...props
}: RunTuiWorkbenchOptions): Instance {
  return render(
    <TuiWorkbenchHost {...props} subscribeToState={subscribeToState} />,
    {
      alternateScreen: true,
      exitOnCtrlC: false,
      ...renderOptions
    }
  );
}

function TuiWorkbenchHost({
  onInteraction,
  state,
  subscribeToState
}: TuiWorkbenchAppProps & {
  subscribeToState?: TuiWorkbenchStateSubscriber;
}): React.JSX.Element {
  const [liveState, setLiveState] = useState(state);

  useEffect(() => {
    setLiveState(state);
  }, [state]);

  useEffect(() => {
    if (subscribeToState === undefined) {
      return;
    }

    return subscribeToState(setLiveState);
  }, [subscribeToState]);

  return <TuiWorkbenchApp onInteraction={onInteraction} state={liveState} />;
}

function HeaderSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element {
  const timelineLead = formatSessionTimelineLead(state);
  const timelineSummary = formatSessionTimelineSummary(state);

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={BRAND_ACCENT_COLOR}>
          Sprite Harness
        </Text>
        <Text dimColor> live terminal</Text>
      </Text>
      <Text>
        <Text color={BRAND_ACCENT_COLOR}>› </Text>
        {`session ${state.runtimeState.session.status}`}
      </Text>
      <Box flexDirection="column">
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│ </Text>
          {timelineLead}
        </Text>
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│   ✓ </Text>
          {`Loading workspace: ${state.runtimeState.workspace.cwd.value}`}
        </Text>
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│   ✓ </Text>
          {`Sandbox environment: ${state.runtimeState.sandbox.mode}`}
        </Text>
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│   ✓ </Text>
          {`Model: ${state.runtimeState.provider.model}`}
        </Text>
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│   ✓ </Text>
          {`Memory: ${
            state.runtimeState.memory.available ? "ready" : "missing"
          }`}
        </Text>
        <Text>
          <Text color={BRAND_ACCENT_COLOR}>│ </Text>
          {timelineSummary}
        </Text>
        <Text dimColor>
          <Text color={BRAND_ACCENT_COLOR}>│ </Text>
          Press /help for commands and resources.
        </Text>
      </Box>
    </Box>
  );
}

function formatSessionTimelineLead(state: TuiLiveWorkbenchState): string {
  if (state.runtimeState.events.latestType !== null) {
    return `Latest event: ${state.runtimeState.events.latestType}`;
  }

  return state.runtimeState.session.status === "startup"
    ? "Initializing session..."
    : `Monitoring session ${state.runtimeState.session.status}...`;
}

function formatSessionTimelineSummary(state: TuiLiveWorkbenchState): string {
  return `Session ${state.runtimeState.session.status}. events ${state.runtimeState.events.count} · approvals ${state.workbench.approvals.length}`;
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
    <Box flexDirection="column" marginTop={1}>
      {promptLines.map((line, index) => (
        <Text key={`${prompt.id}-line-${index}`}>
          <Text color={BRAND_ACCENT_COLOR}>{index === 0 ? "› " : "  "}</Text>
          <Text color="white">{line}</Text>
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
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={accentColor}>│ </Text>
        <Text bold color={accentColor}>
          {formatActivityTitle(item)}
        </Text>
        <Text dimColor>{` · ${item.createdAt}`}</Text>
      </Text>
      <Text>
        <Text color={accentColor}>│ </Text>
        {item.summary.value}
      </Text>
      {outputLine === undefined ? null : (
        <Text dimColor>
          <Text color={accentColor}>│ </Text>
          {outputLine}
        </Text>
      )}
    </Box>
  );
}

function DispatchStatusSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element | null {
  if (state.latestDispatchError !== undefined) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">
          <Text color="red">│ </Text>
          dispatch error
        </Text>
        <Text dimColor>
          <Text color="red">│ </Text>
          {state.latestDispatchError.value}
        </Text>
      </Box>
    );
  }

  if (state.latestDispatchResult !== undefined) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green">
          <Text color="green">│ </Text>
          {`dispatch ok · ${state.latestDispatchResult.intentType} -> ${state.latestDispatchResult.status}`}
        </Text>
      </Box>
    );
  }

  return null;
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
              {`${formatApprovalShortcutLabels(approval.actions)} · ${approval.approvalRequestId.value}`}
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
  prompt: TuiVisibleActionPrompt | null;
}): React.JSX.Element | null {
  if (prompt === null) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={prompt.type === "cancel" ? "red" : "yellow"}>
        {formatActionPromptTitle(prompt)}
      </Text>
      {prompt.type === "approval-edit"
        ? createApprovalEditHintLines(prompt.requestType).map((line) => (
            <Text dimColor key={`edit-hint-${line}`}>
              {line}
            </Text>
          ))
        : null}
      {prompt.type === "approval-edit"
        ? createVisibleDraftLines(prompt.editText).map((line, index) => (
            <Text key={`approval-edit-draft-${index}`}>
              <Text color="yellow">{index === 0 ? "› " : "  "}</Text>
              {line}
            </Text>
          ))
        : null}
      <Text dimColor>
        {formatActionPromptControls(prompt)}
      </Text>
    </Box>
  );
}

function formatActionPromptTitle(prompt: TuiVisibleActionPrompt): string {
  switch (prompt.type) {
    case "cancel":
      return "Conversation interrupted";
    case "approval":
      return `Send ${formatApprovalPromptAction(prompt.action)} for ${prompt.approvalRequestLabel}?`;
    case "approval-edit":
      return `Edit approval for ${prompt.approvalRequestLabel}`;
  }
}

function formatActionPromptControls(prompt: TuiVisibleActionPrompt): string {
  switch (prompt.type) {
    case "cancel":
      return "warning: press Esc again to cancel · dismiss: N";
    case "approval":
      return "confirm: Y / Enter · dismiss: N / Esc";
    case "approval-edit":
      return "Enter submit edit · Ctrl+J newline · Esc dismiss";
  }
}

function createApprovalEditHintLines(
  requestType: "command" | "file_edit"
): readonly string[] {
  if (requestType === "command") {
    return [
      'bounded command edit: type a single executable like "pwd", or JSON {"command":"node","args":["--version"]}'
    ];
  }

  return [
    'bounded file edit JSON: {"edits":[{"path":"src/file.ts","oldText":"old","newText":"new"}],"summary":"why"}'
  ];
}

function InputSection({
  draftText
}: {
  draftText: string;
}): React.JSX.Element {
  const { columns } = useWindowSize();
  const draftLines = createVisibleDraftLines(draftText);
  const isEmptyDraft = draftText.length === 0;
  const promptRule = createPromptRule(columns);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={BRAND_ACCENT_COLOR}>{promptRule}</Text>
      {draftLines.map((line, index) => (
        <Text dimColor={isEmptyDraft} key={`draft-${index}`}>
          {line}
        </Text>
      ))}
      <Text color={BRAND_ACCENT_COLOR}>{promptRule}</Text>
    </Box>
  );
}

function FooterSection({
  state
}: {
  state: TuiLiveWorkbenchState;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
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
    backspace?: boolean;
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

function handleApprovalEditPromptInput({
  draftText,
  input,
  key,
  onChange,
  onConfirm,
  onDismiss
}: {
  draftText: string;
  input: string;
  key: {
    backspace?: boolean;
    ctrl?: boolean;
    escape?: boolean;
    return?: boolean;
    shift?: boolean;
  };
  onChange: (value: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
}): void {
  if (key.escape === true || input.toLowerCase() === "n") {
    onDismiss();
    return;
  }

  if (isNewlineInput(input, key)) {
    onChange(`${draftText}\n`);
    return;
  }

  if (isSendInput(input, key)) {
    onConfirm();
    onDismiss();
    return;
  }

  if (key.backspace || input === "\u007f") {
    onChange(Array.from(draftText).slice(0, -1).join(""));
    return;
  }

  if (isPrintableInput(input)) {
    onChange(`${draftText}${input}`);
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

function formatApprovalShortcutLabels(
  actions: readonly TuiWorkbenchActionLabel[]
): string {
  const labels: string[] = [];

  if (actions.includes("APPROVE")) {
    labels.push("A approve");
  }

  if (actions.includes("DENY")) {
    labels.push("D deny");
  }

  if (actions.includes("EDIT")) {
    labels.push("E edit");
  }

  if (actions.includes("TIMEOUT")) {
    labels.push("T timeout");
  }

  return labels.join(" · ");
}

function resolveVisibleActionPrompt(
  actionPrompt: TuiActionPrompt,
  approvals: readonly TuiWorkbenchApprovalView[],
  editText: string
): TuiVisibleActionPrompt | null {
  if (actionPrompt.type === "cancel") {
    return actionPrompt;
  }

  const approval = approvals.find(
    (pendingApproval) =>
      pendingApproval.controlApprovalRequestId === actionPrompt.approvalRequestId
  );

  if (
    approval === undefined ||
    !approval.actions.includes(
      actionPrompt.type === "approval-edit"
        ? "EDIT"
        : toApprovalActionLabel(actionPrompt.action)
    )
  ) {
    return null;
  }

  if (actionPrompt.type === "approval-edit") {
    return {
      ...actionPrompt,
      approvalRequestLabel: approval.approvalRequestId.value,
      editText,
      requestType: approval.requestType
    };
  }

  return {
    ...actionPrompt,
    approvalRequestLabel: approval.approvalRequestId.value
  };
}

function toApprovalActionLabel(
  action: TuiLiveWorkbenchApprovalAction
): TuiWorkbenchActionLabel {
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

function createPromptRule(columns: number): string {
  return PROMPT_RULE_CHARACTER.repeat(Math.max(1, columns));
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
