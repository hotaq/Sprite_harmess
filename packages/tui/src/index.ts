import type {
  BootstrapState,
  PlannedExecutionFlow,
  RuntimeEventOutputReference,
  RuntimeEventRecord,
  RuntimeApprovalResponse,
  RuntimeSelfModelSnapshot,
  TaskContextPacket,
  TaskContextSection,
  TaskExecutionStatus
} from "@sprite/core";
import {
  containsSecretLikeValue,
  createRedactedPreview,
  err,
  ok,
  SpriteError,
  type Result
} from "@sprite/shared";

const DEFAULT_STRING_LIMIT = 96;
const DEFAULT_LIST_LIMIT = 5;
const UNKNOWN_VALUE = "unknown";
export const TUI_OUTPUT_PREVIEW_MAX_BYTES = 32 * 1024;
export const TUI_OUTPUT_PREVIEW_MAX_LINES = 500;

export type TuiStateToken =
  | "ACTIVE"
  | "CANDIDATE"
  | "MISSING"
  | "OK"
  | "REDACTED"
  | "WARN";

export interface TuiSafeString {
  redacted: boolean;
  value: string;
}

export interface TuiBoundedList {
  hiddenCount: number;
  redactedCount: number;
  values: readonly string[];
}

export interface TuiWorkspaceState {
  adapter: "tui";
  cwd: TuiSafeString;
  interfaces: readonly string[];
}

export interface TuiSessionState {
  correlationId?: string;
  currentPhase?: string;
  resumed?: boolean;
  sessionId?: string;
  status: TaskExecutionStatus | "startup";
  taskId?: string;
}

export interface TuiProviderState {
  auth: "configured-redacted" | "missing";
  configured: boolean;
  model: string;
  name: string;
  token: TuiStateToken;
}

export interface TuiSandboxState {
  mode: string;
  outputFormat: string;
  pendingApprovalCount: number;
  policy: "policy-governed";
  validationCommandCount: number;
}

export interface TuiContextState {
  blockedCount: number;
  loadedCount: number;
  redacted: boolean;
  skippedCount: number;
  truncatedCount: number;
}

export interface TuiMemoryState {
  available: boolean;
  durableRetrievalAvailable?: boolean;
  entryCount?: number;
  providerName?: string;
  safetyRulesCount?: number;
  token: TuiStateToken;
  workingMemoryAvailable?: boolean;
}

export interface TuiSkillsState {
  activeCount: number;
  names: TuiBoundedList;
  source: string;
  token: TuiStateToken;
}

export interface TuiSkillCandidateInput {
  lifecycleStatus: string;
  name: string;
}

export interface TuiSkillCandidateState {
  byStatus: Readonly<Record<string, number>>;
  names: TuiBoundedList;
  relationship: "candidates-not-active-skills";
  token: TuiStateToken;
  totalCount: number;
}

export interface TuiWarningsState {
  count: number;
  previews: TuiBoundedList;
  token: TuiStateToken;
}

export interface TuiEventsState {
  count: number;
  latestType: string | null;
}

export interface TuiRuntimeViewState {
  context: TuiContextState;
  events: TuiEventsState;
  memory: TuiMemoryState;
  provider: TuiProviderState;
  sandbox: TuiSandboxState;
  session: TuiSessionState;
  skillCandidates: TuiSkillCandidateState;
  skills: TuiSkillsState;
  source: "runtime-state";
  warnings: TuiWarningsState;
  workspace: TuiWorkspaceState;
}

export interface CreateTuiStartupStateInput {
  bootstrapState: BootstrapState;
  runtimeSnapshot?: RuntimeSelfModelSnapshot;
  skillCandidates?: readonly TuiSkillCandidateInput[];
}

export interface CreateTuiRuntimeStateInput {
  events?: readonly RuntimeEventRecord[];
  flow: PlannedExecutionFlow;
  runtimeSnapshot?: RuntimeSelfModelSnapshot;
  skillCandidates?: readonly TuiSkillCandidateInput[];
  taskContextPacket?: TaskContextPacket;
}

export type TuiMessageStreamKind =
  | "approval"
  | "file"
  | "learning"
  | "memory"
  | "policy"
  | "retrospective"
  | "session"
  | "skill"
  | "task"
  | "tool"
  | "unknown"
  | "validation";

export type TuiMessageStreamSeverity =
  | "error"
  | "info"
  | "pending"
  | "success"
  | "warning";

export type TuiMessageStreamMetadataValue = boolean | number | string;

export interface TuiOutputPreview {
  fullOutputStored: boolean;
  hiddenByteCount?: number;
  hiddenLineCount?: number;
  isTruncated: boolean;
  originalByteLength?: number;
  originalLineCount?: number;
  preview?: TuiSafeString;
  reason?: TuiSafeString;
  reference?: TuiSafeString;
}

export interface TuiMessageStreamItem {
  correlationId: string;
  createdAt: string;
  eventId: string;
  eventType: RuntimeEventRecord["type"];
  kind: TuiMessageStreamKind;
  metadata: Readonly<Record<string, TuiMessageStreamMetadataValue>>;
  order: number;
  output?: TuiOutputPreview;
  schemaVersion: RuntimeEventRecord["schemaVersion"];
  sessionId: string;
  severity: TuiMessageStreamSeverity;
  status: string;
  summary: TuiSafeString;
  taskId: string;
}

export interface TuiMessageStream {
  items: readonly TuiMessageStreamItem[];
  source: "runtime-events";
  totalCount: number;
  truncatedOutputCount: number;
}

export interface CreateTuiMessageStreamOptions {
  outputPreviewMaxBytes?: number;
  outputPreviewMaxLines?: number;
  outputPreviews?: Readonly<Record<string, string>>;
  stringLimit?: number;
}

export interface CreateTuiEventStreamItemOptions
  extends CreateTuiMessageStreamOptions {
  order?: number;
}

export interface TuiInputDraft {
  isEmpty: boolean;
  lineCount: number;
  preview: TuiSafeString;
  text: string;
}

export type TuiInputDraftAction =
  | { text: string; type: "append" }
  | { text: string; type: "replace" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "newline" };

export type TuiSubmitIntentMode = "steer-task" | "submit-task";

export type TuiUserIntent =
  | {
      preview: TuiSafeString;
      text: string;
      type: "submit-task";
    }
  | {
      note: string;
      preview: TuiSafeString;
      type: "steer-task";
    }
  | {
      note?: string;
      type: "cancel-task";
    }
  | {
      response: RuntimeApprovalResponse;
      type: "approval-response";
    };

export interface TuiRuntimeControlPort {
  cancelActiveTask(note?: string): Result<PlannedExecutionFlow>;
  respondToApproval(
    response: RuntimeApprovalResponse
  ): Promise<Result<unknown>> | Result<unknown>;
  steerActiveTask(note: string): Result<PlannedExecutionFlow>;
  submitInteractiveTask(task: string): Result<PlannedExecutionFlow>;
}

export type TuiApprovalAction = "allow" | "alwaysAllowForSession" | "deny" | "edit";
export type TuiApprovalRequestType = "command" | "file_edit";
export type TuiRiskLevel = "critical" | "high" | "low" | "medium";

export interface TuiApprovalRequestSummary {
  affectedFiles?: readonly string[];
  allowedActions: readonly TuiApprovalAction[];
  approvalRequestId: string;
  reason: string;
  requestType: TuiApprovalRequestType;
  riskLevel: TuiRiskLevel;
  summary: string;
  timeoutMs: number;
  toolCallId?: string;
}

export interface TuiApprovalApplyPatchEdit {
  newText: string;
  oldText: string;
  path: string;
}

export interface TuiApprovalApplyPatchToolCall {
  input: {
    edits: readonly TuiApprovalApplyPatchEdit[];
    summary?: string;
  };
  toolName: "apply_patch";
}

export type TuiApprovalResponseSelection =
  | {
      action: Extract<TuiApprovalAction, "allow" | "alwaysAllowForSession">;
    }
  | {
      action: "deny";
      reason?: string;
    }
  | {
      action: "edit";
      modifiedRequest: Record<string, unknown>;
      modifiedToolCall?: never;
      reason?: string;
    }
  | {
      action: "edit";
      modifiedRequest?: never;
      modifiedToolCall: TuiApprovalApplyPatchToolCall;
      reason?: string;
    }
  | {
      action: "timeout";
    };

export interface TuiDispatchResult {
  approvalResult?: unknown;
  flow?: PlannedExecutionFlow;
  intentType: TuiUserIntent["type"];
  status: "approval-recorded" | "cancelled" | "steered" | "submitted";
}

export type TuiWorkbenchActionLabel =
  | "APPROVE"
  | "CANCEL"
  | "DENY"
  | "EDIT"
  | "STEER"
  | "SUBMIT"
  | "TIMEOUT";

export interface TuiWorkbenchApprovalView {
  actions: readonly TuiWorkbenchActionLabel[];
  approvalRequestId: TuiSafeString;
  controlApprovalRequestId: string;
  reason: TuiSafeString;
  requestType: TuiApprovalRequestType;
  riskLevel: TuiRiskLevel;
  summary: TuiSafeString;
  timeoutMs: number;
  toolCallId?: TuiSafeString;
}

export interface TuiWorkbenchView {
  actions: readonly TuiWorkbenchActionLabel[];
  approvals: readonly TuiWorkbenchApprovalView[];
  input: TuiInputDraft;
  mode: TuiSubmitIntentMode;
  source: "tui-workbench";
}

export interface CreateTuiSubmitIntentOptions {
  mode?: TuiSubmitIntentMode;
}

export interface CreateTuiWorkbenchViewInput {
  draft?: TuiInputDraft;
  mode?: TuiSubmitIntentMode;
  pendingApprovals?: readonly TuiApprovalRequestSummary[];
}

export function createTuiStartupState({
  bootstrapState,
  runtimeSnapshot,
  skillCandidates = []
}: CreateTuiStartupStateInput): TuiRuntimeViewState {
  return {
    context: createContextStateFromBootstrap(bootstrapState),
    events: {
      count: 0,
      latestType: null
    },
    memory: createMemoryState(runtimeSnapshot, undefined, {
      safetyRulesCount: bootstrapState.startup.safetyRules.length
    }),
    provider: createProviderState(
      runtimeSnapshot,
      bootstrapState.provider,
      bootstrapState.startup.provider,
      bootstrapState.startup.model
    ),
    sandbox: createSandboxState(runtimeSnapshot, {
      mode: bootstrapState.startup.sandboxMode,
      outputFormat: bootstrapState.startup.outputFormat,
      pendingApprovalCount: 0,
      validationCommandCount: bootstrapState.startup.validationCommands.length
    }),
    session: {
      status: "startup"
    },
    skillCandidates: createSkillCandidateState(skillCandidates),
    skills: createSkillsState(runtimeSnapshot, undefined),
    source: "runtime-state",
    warnings: createWarningsState([
      ...bootstrapState.warnings,
      ...bootstrapState.startup.warnings,
      bootstrapState.projectContext.warning
    ]),
    workspace: {
      adapter: "tui",
      cwd: createSafeString(
        runtimeSnapshot?.sandbox.cwd ?? bootstrapState.startup.cwd
      ),
      interfaces: uniqueStrings([...bootstrapState.interfaces, "tui"])
    }
  };
}

export function createTuiRuntimeState({
  events = [],
  flow,
  runtimeSnapshot,
  skillCandidates = [],
  taskContextPacket = flow.request.contextPacket
}: CreateTuiRuntimeStateInput): TuiRuntimeViewState {
  const contextSection = findTaskContextSection(
    taskContextPacket,
    "project-context"
  );
  const memorySection = findTaskContextSection(taskContextPacket, "memory");
  const skillsSection = findTaskContextSection(taskContextPacket, "skills");
  const warnings = uniqueStrings([
    ...flow.warnings,
    ...flow.request.startup.warnings
  ]);

  return {
    context: createContextStateFromSection(contextSection),
    events: {
      count: events.length,
      latestType: events.at(-1)?.type ?? null
    },
    memory: createMemoryState(runtimeSnapshot, memorySection, {
      safetyRulesCount: flow.request.startup.safetyRules.length
    }),
    provider: createProviderState(
      runtimeSnapshot,
      flow.request.provider,
      flow.request.startup.provider,
      flow.request.startup.model
    ),
    sandbox: createSandboxState(runtimeSnapshot, {
      mode: flow.request.startup.sandboxMode,
      outputFormat: flow.request.startup.outputFormat,
      pendingApprovalCount: flow.waitingState?.reason === "approval-required" ? 1 : 0,
      validationCommandCount: flow.request.startup.validationCommands.length
    }),
    session: {
      correlationId: flow.correlationId,
      currentPhase: flow.currentPhase,
      sessionId: flow.sessionId,
      status: flow.status,
      taskId: flow.taskId
    },
    skillCandidates: createSkillCandidateState(skillCandidates),
    skills: createSkillsState(runtimeSnapshot, skillsSection),
    source: "runtime-state",
    warnings: createWarningsState(warnings),
    workspace: {
      adapter: "tui",
      cwd: createSafeString(
        runtimeSnapshot?.sandbox.cwd ?? flow.request.startup.cwd
      ),
      interfaces: ["tui"]
    }
  };
}

export function formatTuiStateSummary(state: TuiRuntimeViewState): string {
  return [
    "Sprite Harness",
    `cwd: ${formatToken(state.workspace.cwd.redacted ? "REDACTED" : "OK")} ${state.workspace.cwd.value}`,
    `session: ${state.session.status}${formatOptional("phase", state.session.currentPhase)}${formatOptional("id", state.session.sessionId)}`,
    `provider: ${formatToken(state.provider.token)} ${state.provider.name} / model: ${state.provider.model} / auth: ${state.provider.auth}`,
    `sandbox: ${state.sandbox.mode} / output: ${state.sandbox.outputFormat} / validations: ${state.sandbox.validationCommandCount} / approvals: ${state.sandbox.pendingApprovalCount}`,
    `context: ${state.context.loadedCount} loaded, ${state.context.skippedCount} skipped, ${state.context.truncatedCount} truncated, ${state.context.blockedCount} blocked${state.context.redacted ? " / REDACTED" : ""}`,
    `memory: ${formatToken(state.memory.token)} ${state.memory.available ? "available" : "missing"}${state.memory.entryCount === undefined ? "" : ` / entries: ${state.memory.entryCount}`}`,
    `skills: ${formatToken(state.skills.token)} ${state.skills.activeCount} active${formatList(state.skills.names)}`,
    `candidates: ${formatToken(state.skillCandidates.token)} ${state.skillCandidates.totalCount} candidate${state.skillCandidates.totalCount === 1 ? "" : "s"}${formatStatusCounts(state.skillCandidates.byStatus)}`,
    `events: ${state.events.count}${state.events.latestType === null ? "" : ` / latest: ${state.events.latestType}`}`,
    `warnings: ${formatToken(state.warnings.token)} ${state.warnings.count}${formatList(state.warnings.previews)}`
  ].join("\n");
}

export function createTuiMessageStream(
  events: readonly RuntimeEventRecord[],
  options: CreateTuiMessageStreamOptions = {}
): TuiMessageStream {
  const items = events.map((event, index) =>
    createTuiEventStreamItem(event, { ...options, order: index })
  );

  return {
    items,
    source: "runtime-events",
    totalCount: events.length,
    truncatedOutputCount: items.filter((item) => item.output?.isTruncated === true)
      .length
  };
}

export function createTuiEventStreamItem(
  event: RuntimeEventRecord,
  options: CreateTuiEventStreamItemOptions = {}
): TuiMessageStreamItem {
  const payload = getPayloadRecord(event);
  const kind = getEventKind(event.type);
  const status = createSafeString(readEventStatus(event, payload)).value;

  return {
    correlationId: event.correlationId,
    createdAt: event.createdAt,
    eventId: event.eventId,
    eventType: event.type,
    kind,
    metadata: createMessageMetadata(payload, options),
    order: options.order ?? 0,
    output: createOutputPreview(event, options),
    schemaVersion: event.schemaVersion,
    sessionId: event.sessionId,
    severity: classifySeverity(event, payload, status),
    status,
    summary: createSafeString(readEventSummary(payload), options.stringLimit),
    taskId: event.taskId
  };
}

export function formatTuiMessageStream(stream: TuiMessageStream): string {
  return stream.items.map(formatTuiMessageStreamItem).join("\n");
}

export function createTuiInputDraft(
  text = "",
  options: { stringLimit?: number } = {}
): TuiInputDraft {
  const normalizedText = normalizeInputText(text);
  const lineCount =
    normalizedText.length === 0 ? 0 : splitLines(normalizedText).length;

  return {
    isEmpty: normalizedText.trim().length === 0,
    lineCount,
    preview: createSafeString(normalizedText, options.stringLimit),
    text: normalizedText
  };
}

export function updateTuiInputDraft(
  draft: TuiInputDraft,
  action: TuiInputDraftAction,
  options: { stringLimit?: number } = {}
): TuiInputDraft {
  switch (action.type) {
    case "append": {
      return createTuiInputDraft(`${draft.text}${action.text}`, options);
    }
    case "backspace": {
      return createTuiInputDraft(Array.from(draft.text).slice(0, -1).join(""), options);
    }
    case "clear": {
      return createTuiInputDraft("", options);
    }
    case "newline": {
      return createTuiInputDraft(`${draft.text}\n`, options);
    }
    case "replace": {
      return createTuiInputDraft(action.text, options);
    }
  }
}

export function createTuiSubmitIntent(
  draft: TuiInputDraft,
  options: CreateTuiSubmitIntentOptions = {}
): Result<TuiUserIntent, SpriteError> {
  if (draft.isEmpty) {
    return err(
      new SpriteError(
        "TUI_INPUT_EMPTY",
        "TUI input cannot be submitted while empty."
      )
    );
  }

  const mode = options.mode ?? "submit-task";
  if (mode === "steer-task") {
    return {
      ok: true,
      value: {
        note: draft.text,
        preview: draft.preview,
        type: "steer-task"
      }
    };
  }

  return {
    ok: true,
    value: {
      preview: draft.preview,
      text: draft.text,
      type: "submit-task"
    }
  };
}

export function createTuiCancelIntent(note?: string): TuiUserIntent {
  return {
    ...(note === undefined ? {} : { note }),
    type: "cancel-task"
  };
}

export function createTuiApprovalResponseIntent(
  approvalRequest: TuiApprovalRequestSummary,
  selection: TuiApprovalResponseSelection
): Result<TuiUserIntent, SpriteError> {
  const actionValidation = validateApprovalActionSelection(
    approvalRequest,
    selection
  );
  if (!actionValidation.ok) {
    return actionValidation;
  }

  switch (selection.action) {
    case "allow":
    case "alwaysAllowForSession": {
      return {
        ok: true,
        value: {
          response: {
            action: selection.action,
            approvalRequestId: approvalRequest.approvalRequestId
          },
          type: "approval-response"
        }
      };
    }
    case "deny": {
      return {
        ok: true,
        value: {
          response: {
            action: "deny",
            approvalRequestId: approvalRequest.approvalRequestId,
            ...(selection.reason === undefined ? {} : { reason: selection.reason })
          },
          type: "approval-response"
        }
      };
    }
    case "timeout": {
      return {
        ok: true,
        value: {
          response: {
            action: "timeout",
            approvalRequestId: approvalRequest.approvalRequestId
          },
          type: "approval-response"
        }
      };
    }
    case "edit": {
      if (approvalRequest.requestType === "command") {
        return {
          ok: true,
          value: {
            response: {
              action: "edit",
              approvalRequestId: approvalRequest.approvalRequestId,
              modifiedRequest: selection.modifiedRequest,
              ...(selection.reason === undefined ? {} : { reason: selection.reason })
            } as RuntimeApprovalResponse,
            type: "approval-response"
          }
        };
      }

      return {
        ok: true,
        value: {
          response: {
            action: "edit",
            approvalRequestId: approvalRequest.approvalRequestId,
            modifiedToolCall: selection.modifiedToolCall,
            ...(selection.reason === undefined ? {} : { reason: selection.reason })
          } as RuntimeApprovalResponse,
          type: "approval-response"
        }
      };
    }
  }
}

export async function dispatchTuiUserIntent(
  port: TuiRuntimeControlPort,
  intent: TuiUserIntent
): Promise<Result<TuiDispatchResult>> {
  switch (intent.type) {
    case "approval-response": {
      const result = await port.respondToApproval(intent.response);

      if (!result.ok) {
        return result;
      }

      return ok({
        approvalResult: result.value,
        intentType: intent.type,
        status: "approval-recorded"
      });
    }
    case "cancel-task": {
      const result = port.cancelActiveTask(intent.note);

      if (!result.ok) {
        return result;
      }

      return ok({
        flow: result.value,
        intentType: intent.type,
        status: "cancelled"
      });
    }
    case "steer-task": {
      const result = port.steerActiveTask(intent.note);

      if (!result.ok) {
        return result;
      }

      return ok({
        flow: result.value,
        intentType: intent.type,
        status: "steered"
      });
    }
    case "submit-task": {
      const result = port.submitInteractiveTask(intent.text);

      if (!result.ok) {
        return result;
      }

      return ok({
        flow: result.value,
        intentType: intent.type,
        status: "submitted"
      });
    }
  }
}

export function createTuiWorkbenchView({
  draft = createTuiInputDraft(),
  mode = "submit-task",
  pendingApprovals = []
}: CreateTuiWorkbenchViewInput = {}): TuiWorkbenchView {
  const approvalViews = pendingApprovals.map(createWorkbenchApprovalView);
  const approvalActions = approvalViews.flatMap((approval) => approval.actions);

  return {
    actions: uniqueWorkbenchActions([
      mode === "steer-task" ? "STEER" : "SUBMIT",
      "CANCEL",
      ...approvalActions
    ]),
    approvals: approvalViews,
    input: draft,
    mode,
    source: "tui-workbench"
  };
}

export function formatTuiWorkbenchView(view: TuiWorkbenchView): string {
  const preview = view.input.isEmpty
    ? "Type a prompt…"
    : view.input.preview.value;

  return [
    "╭─ Prompt",
    `│ ${preview}`,
    "╰─"
  ].join("\n");
}

export interface TuiLiveWorkbenchState {
  events: readonly RuntimeEventRecord[];
  latestDispatchError?: TuiSafeString;
  latestDispatchResult?: TuiDispatchResult;
  messageStream: TuiMessageStream;
  messageSummary: string;
  runtimeState: TuiRuntimeViewState;
  runtimeSummary: string;
  source: "tui-live-workbench";
  workbench: TuiWorkbenchView;
  workbenchSummary: string;
}

export interface CreateTuiLiveWorkbenchStateInput {
  events?: readonly RuntimeEventRecord[];
  latestDispatchError?: TuiSafeString;
  latestDispatchResult?: TuiDispatchResult;
  messageStream?: TuiMessageStream;
  runtimeState: TuiRuntimeViewState;
  streamOptions?: CreateTuiMessageStreamOptions;
  workbench?: TuiWorkbenchView;
}

export type TuiLiveWorkbenchAction =
  | {
      event: RuntimeEventRecord;
      streamOptions?: CreateTuiMessageStreamOptions;
      type: "runtime-event";
    }
  | {
      events: readonly RuntimeEventRecord[];
      streamOptions?: CreateTuiMessageStreamOptions;
      type: "replace-events";
    }
  | {
      action: TuiInputDraftAction;
      type: "update-draft";
    }
  | {
      intent: TuiUserIntent;
      port: TuiRuntimeControlPort;
      type: "dispatch-intent";
    }
  | {
      result: TuiDispatchResult;
      type: "record-dispatch-result";
    }
  | {
      workbench: TuiWorkbenchView;
      type: "set-workbench";
    };

export function createTuiLiveWorkbenchState({
  events = [],
  latestDispatchError,
  latestDispatchResult,
  messageStream,
  runtimeState,
  streamOptions = {},
  workbench = createTuiWorkbenchView()
}: CreateTuiLiveWorkbenchStateInput): TuiLiveWorkbenchState {
  const resolvedMessageStream =
    messageStream ?? createTuiMessageStream(events, streamOptions);
  const latestEventType =
    events.at(-1)?.type ?? runtimeState.events.latestType;
  const resolvedRuntimeState =
    runtimeState.events.count === events.length &&
    runtimeState.events.latestType === latestEventType
      ? runtimeState
      : {
          ...runtimeState,
          events: {
            count: events.length,
            latestType: latestEventType
          }
        };

  return {
    events,
    ...(latestDispatchError === undefined ? {} : { latestDispatchError }),
    ...(latestDispatchResult === undefined ? {} : { latestDispatchResult }),
    messageStream: resolvedMessageStream,
    messageSummary: formatTuiMessageStream(resolvedMessageStream),
    runtimeState: resolvedRuntimeState,
    runtimeSummary: formatTuiStateSummary(resolvedRuntimeState),
    source: "tui-live-workbench",
    workbench,
    workbenchSummary: formatTuiWorkbenchView(workbench)
  };
}

export async function reduceTuiLiveWorkbenchEvent(
  state: TuiLiveWorkbenchState,
  action: TuiLiveWorkbenchAction
): Promise<TuiLiveWorkbenchState> {
  switch (action.type) {
    case "dispatch-intent": {
      const dispatchResult = await dispatchTuiUserIntent(action.port, action.intent);

      if (!dispatchResult.ok) {
        return createTuiLiveWorkbenchState({
          ...state,
          latestDispatchError: createSafeString(dispatchResult.error.message)
        });
      }

      const shouldClearDraft =
        action.intent.type === "submit-task" || action.intent.type === "steer-task";
      return createTuiLiveWorkbenchState({
        ...state,
        latestDispatchError: undefined,
        latestDispatchResult: dispatchResult.value,
        workbench: shouldClearDraft
          ? {
              ...state.workbench,
              input: createTuiInputDraft()
            }
          : state.workbench
      });
    }
    case "record-dispatch-result": {
      return createTuiLiveWorkbenchState({
        ...state,
        latestDispatchError: undefined,
        latestDispatchResult: action.result
      });
    }
    case "replace-events": {
      return createTuiLiveWorkbenchState({
        ...state,
        events: action.events,
        messageStream: undefined,
        runtimeState: {
          ...state.runtimeState,
          events: {
            count: action.events.length,
            latestType: action.events.at(-1)?.type ?? null
          }
        },
        streamOptions: action.streamOptions
      });
    }
    case "runtime-event": {
      const events = [...state.events, action.event];
      return createTuiLiveWorkbenchState({
        ...state,
        events,
        messageStream: undefined,
        runtimeState: {
          ...state.runtimeState,
          events: {
            count: events.length,
            latestType: action.event.type
          }
        },
        streamOptions: action.streamOptions
      });
    }
    case "set-workbench": {
      return createTuiLiveWorkbenchState({
        ...state,
        workbench: action.workbench
      });
    }
    case "update-draft": {
      return createTuiLiveWorkbenchState({
        ...state,
        workbench: {
          ...state.workbench,
          input: updateTuiInputDraft(state.workbench.input, action.action)
        }
      });
    }
  }
}

export function formatTuiLiveWorkbenchPreview(
  state: TuiLiveWorkbenchState
): string {
  const activityLines = formatPreviewActivityLines(state);
  const approvalLines = formatPreviewApprovalLines(state);
  const dispatchLines =
    state.latestDispatchResult === undefined
      ? []
      : [
          `  dispatch: [OK] ${state.latestDispatchResult.intentType} -> ${state.latestDispatchResult.status}`
        ];
  const errorLines =
    state.latestDispatchError === undefined
      ? []
      : [`  dispatch: [ERROR] ${state.latestDispatchError.value}`];

  return [
    "Sprite Harness TUI preview (static)",
    "mode: static preview / not interactive / run `sprite tui` in a real TTY for live mode",
    "",
    "Sprite Harness · live terminal preview",
    `session ${state.runtimeState.session.status} · events ${state.runtimeState.events.count} · approvals ${state.workbench.approvals.length} · /runtime for details`,
    "commands: /runtime · /context · /details · /help in live mode",
    ...(activityLines.length === 0 ? [] : ["", ...activityLines]),
    ...(approvalLines.length === 0 ? [] : ["", ...approvalLines]),
    "",
    state.workbenchSummary,
    ...dispatchLines,
    ...errorLines,
    "",
    `Enter send · Shift+Enter/Ctrl+J newline · Esc cancel · ${getTuiExitShortcutLabel()} exit · /help`,
    `${state.runtimeState.workspace.cwd.value} · session ${state.runtimeState.session.status} · sandbox ${state.runtimeState.sandbox.mode}`
  ].join("\n");
}

export function createTuiCommandPreview(
  state: TuiLiveWorkbenchState
): string {
  return formatTuiLiveWorkbenchPreview(state);
}

function formatPreviewActivityLines(state: TuiLiveWorkbenchState): string[] {
  const items = state.messageStream.items.slice(-3);

  if (items.length === 0) {
    return [];
  }

  return items.flatMap((item) => {
    const outputLine =
      item.output?.reference === undefined
        ? []
        : [
            `│ output: ${item.output.reference.value}${
              item.output.reason === undefined
                ? ""
                : ` (${item.output.reason.value})`
            }`
          ];

    return [
      `╭─ ${item.order}. ${item.kind} · ${item.severity} · ${item.eventType}`,
      `│ ${item.summary.value}`,
      ...outputLine,
      "╰─"
    ];
  });
}

function formatPreviewApprovalLines(state: TuiLiveWorkbenchState): string[] {
  if (state.workbench.approvals.length === 0) {
    return [];
  }

  return state.workbench.approvals.flatMap((approval) => [
    `╭─ Approval required · ${approval.requestType} · ${approval.riskLevel}`,
    `│ ${approval.summary.value}`,
    `│ reason: ${approval.reason.value}`,
    `│ ${formatPreviewApprovalShortcuts(approval.actions)} · ${approval.approvalRequestId.value}`,
    approval.toolCallId === undefined
      ? "╰─"
      : `╰─ toolCallId: ${approval.toolCallId.value}`
  ]);
}

function formatPreviewApprovalShortcuts(
  actions: readonly TuiWorkbenchActionLabel[]
): string {
  const labels: string[] = [];

  if (actions.includes("APPROVE")) {
    labels.push("A approve");
  }

  if (actions.includes("DENY")) {
    labels.push("D deny");
  }

  if (actions.includes("TIMEOUT")) {
    labels.push("T timeout");
  }

  return labels.join(" · ");
}

function getTuiExitShortcutLabel(): string {
  return "Ctrl+D";
}

export { TuiWorkbenchApp, runTuiWorkbench } from "./live-workbench.js";
export type {
  RunTuiWorkbenchOptions,
  TuiLiveWorkbenchApprovalAction,
  TuiLiveWorkbenchInteraction,
  TuiWorkbenchAppProps,
  TuiWorkbenchStateSubscriber
} from "./live-workbench.js";

function normalizeInputText(text: string): string {
  return text.replace(/\r\n|\r/u, "\n");
}

function validateApprovalActionSelection(
  approvalRequest: TuiApprovalRequestSummary,
  selection: TuiApprovalResponseSelection
): Result<null, SpriteError> {
  if (
    selection.action !== "timeout" &&
    !approvalRequest.allowedActions.includes(selection.action)
  ) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_ACTION_UNAVAILABLE",
        `Approval action '${selection.action}' is not available for ${approvalRequest.approvalRequestId}.`
      )
    );
  }

  if (selection.action !== "edit") {
    return ok(null) as Result<null, SpriteError>;
  }

  const hasModifiedRequest =
    Object.hasOwn(selection, "modifiedRequest") &&
    selection.modifiedRequest !== undefined;
  const hasModifiedToolCall =
    Object.hasOwn(selection, "modifiedToolCall") &&
    selection.modifiedToolCall !== undefined;
  const fileEditToolCall =
    hasModifiedToolCall &&
    selection.modifiedToolCall?.toolName === "apply_patch";

  if (
    approvalRequest.requestType === "command" &&
    (!hasModifiedRequest || hasModifiedToolCall)
  ) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_SHAPE_INVALID",
        "Command approval edits must use modifiedRequest only."
      )
    );
  }

  if (
    approvalRequest.requestType === "file_edit" &&
    (!hasModifiedToolCall || hasModifiedRequest || !fileEditToolCall)
  ) {
    return err(
      new SpriteError(
        "TUI_APPROVAL_EDIT_SHAPE_INVALID",
        "File edit approval edits must use an apply_patch modifiedToolCall only."
      )
    );
  }

  return ok(null) as Result<null, SpriteError>;
}

function createWorkbenchApprovalView(
  approval: TuiApprovalRequestSummary
): TuiWorkbenchApprovalView {
  return {
    actions: uniqueWorkbenchActions([
      ...approval.allowedActions.map(toWorkbenchApprovalAction),
      "TIMEOUT"
    ]),
    approvalRequestId: createSafeString(approval.approvalRequestId),
    controlApprovalRequestId: approval.approvalRequestId,
    reason: createSafeString(approval.reason),
    requestType: approval.requestType,
    riskLevel: approval.riskLevel,
    summary: createSafeString(approval.summary),
    timeoutMs: approval.timeoutMs,
    ...(approval.toolCallId === undefined
      ? {}
      : { toolCallId: createSafeString(approval.toolCallId) })
  };
}

function toWorkbenchApprovalAction(
  action: TuiApprovalAction
): TuiWorkbenchActionLabel {
  switch (action) {
    case "allow":
    case "alwaysAllowForSession":
      return "APPROVE";
    case "deny":
      return "DENY";
    case "edit":
      return "EDIT";
  }
}

function uniqueWorkbenchActions(
  actions: readonly TuiWorkbenchActionLabel[]
): TuiWorkbenchActionLabel[] {
  return Array.from(new Set(actions));
}

function formatWorkbenchAction(action: TuiWorkbenchActionLabel): string {
  return `[${action}]`;
}

function getEventKind(eventType: RuntimeEventRecord["type"]): TuiMessageStreamKind {
  if (eventType.startsWith("approval.")) {
    return "approval";
  }

  if (eventType.startsWith("file.")) {
    return "file";
  }

  if (eventType.startsWith("learning.")) {
    return "learning";
  }

  if (eventType.startsWith("memory.")) {
    return "memory";
  }

  if (eventType.startsWith("policy.")) {
    return "policy";
  }

  if (eventType.startsWith("retrospective.")) {
    return "retrospective";
  }

  if (eventType.startsWith("session.")) {
    return "session";
  }

  if (eventType.startsWith("skill.")) {
    return "skill";
  }

  if (eventType.startsWith("task.")) {
    return "task";
  }

  if (eventType.startsWith("tool.")) {
    return "tool";
  }

  if (eventType.startsWith("validation.")) {
    return "validation";
  }

  return "unknown";
}

function readEventStatus(
  event: RuntimeEventRecord,
  payload: Readonly<Record<string, unknown>>
): string {
  if (event.type === "policy.decision.recorded") {
    return readString(payload, "action") ?? UNKNOWN_VALUE;
  }

  if (event.type === "approval.resolved") {
    return readString(payload, "decision") ?? UNKNOWN_VALUE;
  }

  return (
    readString(payload, "status") ??
    readString(payload, "decision") ??
    readString(payload, "reason") ??
    UNKNOWN_VALUE
  );
}

function readEventSummary(payload: Readonly<Record<string, unknown>>): string {
  return (
    readString(payload, "summary") ??
    readString(payload, "message") ??
    readString(payload, "note") ??
    readString(payload, "reason") ??
    UNKNOWN_VALUE
  );
}

function classifySeverity(
  event: RuntimeEventRecord,
  payload: Readonly<Record<string, unknown>>,
  status: string
): TuiMessageStreamSeverity {
  const normalizedStatus = status.toLowerCase();
  if (event.type === "task.waiting") {
    return "pending";
  }

  if (
    event.type.endsWith(".failed") ||
    event.type.endsWith(".cancelled") ||
    [
      "blocked",
      "cancelled",
      "contradicted",
      "critical",
      "deny",
      "denied",
      "failed",
      "max-iterations",
      "rejected",
      "timeout",
      "unrecoverable-error"
    ].includes(normalizedStatus)
  ) {
    return "error";
  }

  if (["pending", "planned", "requested", "started"].includes(normalizedStatus)) {
    return "pending";
  }

  if (["skipped", "warning"].includes(normalizedStatus)) {
    return "warning";
  }

  if (
    ["applied", "completed", "loaded", "passed", "resolved", "saved", "used"].includes(
      normalizedStatus
    )
  ) {
    return "success";
  }

  const riskLevel = readString(payload, "riskLevel")?.toLowerCase();
  if (riskLevel === "critical" || riskLevel === "high") {
    return "warning";
  }

  return "info";
}

function createMessageMetadata(
  payload: Readonly<Record<string, unknown>>,
  options: CreateTuiMessageStreamOptions
): Readonly<Record<string, TuiMessageStreamMetadataValue>> {
  const metadata: Record<string, TuiMessageStreamMetadataValue> = {};
  const fields = [
    "action",
    "activityId",
    "approvalRequestId",
    "artifactId",
    "artifactPath",
    "candidateArtifactPath",
    "candidateId",
    "decision",
    "durationMs",
    "editId",
    "entryId",
    "errorCode",
    "exitCode",
    "kind",
    "learningReviewArtifactPath",
    "memoryType",
    "path",
    "requestType",
    "riskLevel",
    "ruleId",
    "skillId",
    "skillSignalId",
    "toolCallId",
    "toolName",
    "returnedItemCount",
    "totalItemCount",
    "trigger",
    "validationId"
  ];

  for (const field of fields) {
    addMetadataField(metadata, field, payload[field], options.stringLimit);
  }

  const affectedFiles = readStringArray(payload, "affectedFiles");
  if (affectedFiles.length > 0) {
    const boundedFiles = createBoundedList(affectedFiles, 3);
    metadata.affectedFiles = `${boundedFiles.values.join(", ")}${boundedFiles.hiddenCount === 0 ? "" : ` (+${boundedFiles.hiddenCount} more)`}`;
  }

  return metadata;
}

function addMetadataField(
  metadata: Record<string, TuiMessageStreamMetadataValue>,
  key: string,
  value: unknown,
  stringLimit: number | undefined
): void {
  if (typeof value === "string") {
    metadata[key] = createSafeString(value, stringLimit).value;
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    metadata[key] = value;
    return;
  }

  if (typeof value === "boolean") {
    metadata[key] = value;
  }
}

function createOutputPreview(
  event: RuntimeEventRecord,
  options: CreateTuiMessageStreamOptions
): TuiOutputPreview | undefined {
  const payload = getPayloadRecord(event);
  const outputReference = readOutputReference(payload);
  const rawPreview = options.outputPreviews?.[event.eventId];

  if (outputReference === undefined && rawPreview === undefined) {
    return undefined;
  }

  const maxBytes = options.outputPreviewMaxBytes ?? TUI_OUTPUT_PREVIEW_MAX_BYTES;
  const maxLines = options.outputPreviewMaxLines ?? TUI_OUTPUT_PREVIEW_MAX_LINES;
  const preview = rawPreview === undefined
    ? undefined
    : createSafeOutputPreview(rawPreview, maxBytes, maxLines, options.stringLimit);

  return {
    fullOutputStored: outputReference?.fullOutputStored ?? false,
    hiddenByteCount: preview?.hiddenByteCount,
    hiddenLineCount: preview?.hiddenLineCount,
    isTruncated:
      preview?.isTruncated ??
      (outputReference?.fullOutputStored === true),
    originalByteLength: preview?.originalByteLength,
    originalLineCount: preview?.originalLineCount,
    preview: preview?.preview,
    reason:
      outputReference === undefined
        ? undefined
        : createSafeString(outputReference.reason, options.stringLimit),
    reference:
      outputReference?.path === undefined
        ? undefined
        : createSafeString(outputReference.path, options.stringLimit)
  };
}

function createSafeOutputPreview(
  rawOutput: string,
  maxBytes: number,
  maxLines: number,
  stringLimit = maxBytes
): Required<
  Pick<
    TuiOutputPreview,
    | "hiddenByteCount"
    | "hiddenLineCount"
    | "isTruncated"
    | "originalByteLength"
    | "originalLineCount"
    | "preview"
  >
> {
  const originalByteLength = byteLength(rawOutput);
  const lines = splitLines(rawOutput);
  const originalLineCount = lines.length;
  const lineLimitedOutput = lines.slice(0, maxLines).join("\n");
  const byteLimitedOutput =
    byteLength(lineLimitedOutput) > maxBytes
      ? sliceToByteLength(lineLimitedOutput, maxBytes)
      : lineLimitedOutput;
  const preview = createSafeString(
    byteLimitedOutput,
    Math.min(stringLimit, maxBytes)
  );
  const previewByteLength = byteLength(preview.value);
  const visibleLineCount = splitLines(byteLimitedOutput).length;
  const isTruncated =
    originalByteLength > byteLength(byteLimitedOutput) ||
    originalLineCount > maxLines ||
    preview.value.endsWith("…");

  return {
    hiddenByteCount: Math.max(0, originalByteLength - previewByteLength),
    hiddenLineCount: Math.max(
      0,
      originalLineCount - Math.min(originalLineCount, visibleLineCount)
    ),
    isTruncated,
    originalByteLength,
    originalLineCount,
    preview: {
      redacted: preview.redacted || containsSecretLikeValue(rawOutput),
      value: preview.value
    }
  };
}

function formatTuiMessageStreamItem(item: TuiMessageStreamItem): string {
  const sequence = `#${item.order + 1}`;
  const createdAt = createSafeString(item.createdAt).value;

  return [
    `${sequence} ${createdAt} ${formatMessageToken(item.kind)}${formatMessageToken(item.severity)} ${item.eventType} ${item.status}`,
    item.summary.value,
    formatMessageMetadata(item.metadata),
    item.output === undefined ? "" : formatMessageOutput(item.output)
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function formatMessageMetadata(
  metadata: Readonly<Record<string, TuiMessageStreamMetadataValue>>
): string {
  const entries = Object.entries(metadata).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length === 0) {
    return "";
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(" ");
}

function formatMessageOutput(output: TuiOutputPreview): string {
  const hasPreview = output.preview !== undefined;
  const state = hasPreview && output.isTruncated
    ? "truncated"
    : output.fullOutputStored && output.isTruncated
      ? "collapsed"
      : output.fullOutputStored
        ? "stored"
      : hasPreview
        ? "preview"
        : "stored";
  const parts = [`output=${state}`];

  if (output.originalLineCount !== undefined) {
    parts.push(`lines=${output.originalLineCount}`);
  }

  if (output.hiddenLineCount !== undefined && output.hiddenLineCount > 0) {
    parts.push(`hiddenLines=${output.hiddenLineCount}`);
  }

  if (output.originalByteLength !== undefined) {
    parts.push(`bytes=${output.originalByteLength}`);
  }

  if (output.hiddenByteCount !== undefined && output.hiddenByteCount > 0) {
    parts.push(`hiddenBytes=${output.hiddenByteCount}`);
  }

  if (output.reference !== undefined) {
    parts.push(`reference=${output.reference.value}`);
  }

  if (output.reason !== undefined) {
    parts.push(`reason=${output.reason.value}`);
  }

  return parts.join(" ");
}

function readOutputReference(
  payload: Readonly<Record<string, unknown>>
): RuntimeEventOutputReference | undefined {
  const value = payload.outputReference;
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (
    typeof value.fullOutputStored !== "boolean" ||
    typeof value.reason !== "string"
  ) {
    return undefined;
  }

  if (value.path !== undefined && typeof value.path !== "string") {
    return undefined;
  }

  return {
    fullOutputStored: value.fullOutputStored,
    path: value.path,
    reason: value.reason
  };
}

function getPayloadRecord(
  event: RuntimeEventRecord
): Readonly<Record<string, unknown>> {
  return event.payload as unknown as Readonly<Record<string, unknown>>;
}

function readString(
  payload: Readonly<Record<string, unknown>>,
  key: string
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(
  payload: Readonly<Record<string, unknown>>,
  key: string
): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r\n|\r|\n/u);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function sliceToByteLength(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const char of value) {
    const charBytes = byteLength(char);
    if (bytes + charBytes > maxBytes) {
      break;
    }

    bytes += charBytes;
    result += char;
  }

  return result;
}

function formatMessageToken(
  token: TuiMessageStreamKind | TuiMessageStreamSeverity
): string {
  return `[${token.toUpperCase()}]`;
}

function createProviderState(
  runtimeSnapshot: RuntimeSelfModelSnapshot | undefined,
  provider: CreateTuiStartupStateInput["bootstrapState"]["provider"],
  startupProvider: string | null,
  startupModel: string | null
): TuiProviderState {
  const snapshotProvider = runtimeSnapshot?.provider;
  const configured = snapshotProvider?.configured ?? provider !== null;
  const auth =
    snapshotProvider?.auth ??
    (provider?.auth.authenticated === true ? "configured-redacted" : "missing");
  const rawName =
    snapshotProvider?.providerName ??
    provider?.providerName ??
    startupProvider ??
    "not-configured";
  const rawModel =
    snapshotProvider?.model ?? provider?.model ?? startupModel ?? "not-configured";

  return {
    auth,
    configured,
    model: createSafeString(rawModel).value,
    name: createSafeString(rawName).value,
    token: auth === "configured-redacted" ? "OK" : "MISSING"
  };
}

function createSandboxState(
  runtimeSnapshot: RuntimeSelfModelSnapshot | undefined,
  fallback: {
    mode: string;
    outputFormat: string;
    pendingApprovalCount: number;
    validationCommandCount: number;
  }
): TuiSandboxState {
  return {
    mode: createSafeString(runtimeSnapshot?.sandbox.mode ?? fallback.mode).value,
    outputFormat: createSafeString(
      runtimeSnapshot?.sandbox.outputFormat ?? fallback.outputFormat
    ).value,
    pendingApprovalCount:
      runtimeSnapshot?.sandbox.pendingApprovalCount ??
      fallback.pendingApprovalCount,
    policy: "policy-governed",
    validationCommandCount:
      runtimeSnapshot?.sandbox.validationCommandCount ??
      fallback.validationCommandCount
  };
}

function createContextStateFromBootstrap(
  bootstrapState: BootstrapState
): TuiContextState {
  return {
    blockedCount: bootstrapState.projectContext.blockedCount,
    loadedCount: bootstrapState.projectContext.loadedCount,
    redacted: bootstrapState.projectContext.records.some((record) => record.redacted),
    skippedCount: bootstrapState.projectContext.skippedCount,
    truncatedCount: bootstrapState.projectContext.truncatedCount
  };
}

function createContextStateFromSection(
  section: TaskContextSection | undefined
): TuiContextState {
  return {
    blockedCount: readMetadataNumber(section, "blockedCount"),
    loadedCount: readMetadataNumber(section, "loadedCount"),
    redacted: section?.redacted ?? false,
    skippedCount: readMetadataNumber(section, "skippedCount"),
    truncatedCount: readMetadataNumber(section, "truncatedCount")
  };
}

function createMemoryState(
  runtimeSnapshot: RuntimeSelfModelSnapshot | undefined,
  section: TaskContextSection | undefined,
  fallback: { safetyRulesCount: number }
): TuiMemoryState {
  const entryCount = readMetadataNumber(section, "entryCount");
  const available =
    runtimeSnapshot?.memory.workingMemoryAvailable ??
    (section === undefined ? false : section.status !== "skipped");

  return {
    available,
    durableRetrievalAvailable: runtimeSnapshot?.memory.durableRetrievalAvailable,
    entryCount: section === undefined ? undefined : entryCount,
    providerName:
      runtimeSnapshot === undefined
        ? undefined
        : createSafeString(runtimeSnapshot.memory.providerName).value,
    safetyRulesCount:
      runtimeSnapshot?.memory.safetyRulesCount ?? fallback.safetyRulesCount,
    token: available ? "OK" : "MISSING",
    workingMemoryAvailable: runtimeSnapshot?.memory.workingMemoryAvailable
  };
}

function createSkillsState(
  runtimeSnapshot: RuntimeSelfModelSnapshot | undefined,
  section: TaskContextSection | undefined
): TuiSkillsState {
  const names =
    runtimeSnapshot?.skills.names ??
    readMetadataStringArray(section, "names");
  const activeCount =
    runtimeSnapshot?.skills.names.length ??
    readMetadataNumber(section, "skillCount");

  return {
    activeCount,
    names: createBoundedList(names),
    source: createSafeString(runtimeSnapshot?.skills.source ?? "manual").value,
    token: activeCount > 0 ? "ACTIVE" : "MISSING"
  };
}

function createSkillCandidateState(
  candidates: readonly TuiSkillCandidateInput[]
): TuiSkillCandidateState {
  const byStatus: Record<string, number> = {};
  for (const candidate of candidates) {
    const status = createSafeString(candidate.lifecycleStatus).value;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    byStatus,
    names: createBoundedList(candidates.map((candidate) => candidate.name)),
    relationship: "candidates-not-active-skills",
    token: candidates.length > 0 ? "CANDIDATE" : "MISSING",
    totalCount: candidates.length
  };
}

function createWarningsState(warnings: readonly string[]): TuiWarningsState {
  const nonEmptyWarnings = warnings.filter((warning) => warning.trim().length > 0);

  return {
    count: nonEmptyWarnings.length,
    previews: createBoundedList(nonEmptyWarnings, 3),
    token: nonEmptyWarnings.length > 0 ? "WARN" : "OK"
  };
}

function createSafeString(
  value: string | null | undefined,
  maxLength = DEFAULT_STRING_LIMIT
): TuiSafeString {
  const raw = value === null || value === undefined ? UNKNOWN_VALUE : value;
  const preview = createRedactedPreview(raw, maxLength);

  return {
    redacted: containsSecretLikeValue(raw),
    value: preview.length === 0 ? UNKNOWN_VALUE : preview
  };
}

function createBoundedList(
  values: readonly string[],
  limit = DEFAULT_LIST_LIMIT
): TuiBoundedList {
  const safeValues = values.map((value) => createSafeString(value));
  const visibleValues = safeValues.slice(0, limit);

  return {
    hiddenCount: Math.max(0, safeValues.length - visibleValues.length),
    redactedCount: safeValues.filter((value) => value.redacted).length,
    values: visibleValues.map((value) => value.value)
  };
}

function findTaskContextSection(
  packet: TaskContextPacket,
  source: TaskContextSection["source"]
): TaskContextSection | undefined {
  return packet.sections.find((section) => section.source === source);
}

function readMetadataNumber(
  section: TaskContextSection | undefined,
  key: string
): number {
  const value = section?.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readMetadataStringArray(
  section: TaskContextSection | undefined,
  key: string
): string[] {
  const value = section?.metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function formatToken(token: TuiStateToken): string {
  return `[${token}]`;
}

function formatOptional(label: string, value: string | undefined): string {
  return value === undefined ? "" : ` / ${label}: ${createSafeString(value).value}`;
}

function formatList(list: TuiBoundedList): string {
  const items = list.values.length === 0 ? "" : ` / ${list.values.join(", ")}`;
  const hidden = list.hiddenCount === 0 ? "" : ` (+${list.hiddenCount} more)`;
  const redacted = list.redactedCount === 0 ? "" : ` / ${list.redactedCount} redacted`;

  return `${items}${hidden}${redacted}`;
}

function formatStatusCounts(statusCounts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(statusCounts).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length === 0) {
    return "";
  }

  return ` / ${entries.map(([status, count]) => `${status}: ${count}`).join(", ")}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
