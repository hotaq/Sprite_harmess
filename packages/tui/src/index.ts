import type {
  BootstrapState,
  PlannedExecutionFlow,
  RuntimeEventRecord,
  RuntimeSelfModelSnapshot,
  TaskContextPacket,
  TaskContextSection,
  TaskExecutionStatus
} from "@sprite/core";
import {
  containsSecretLikeValue,
  createRedactedPreview
} from "@sprite/shared";

const DEFAULT_STRING_LIMIT = 96;
const DEFAULT_LIST_LIMIT = 5;
const UNKNOWN_VALUE = "unknown";

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
    ...flow.request.startup.warnings,
    ...events.flatMap((event) => {
      const payload = event.payload;
      if (
        payload !== null &&
        typeof payload === "object" &&
        "summary" in payload &&
        typeof payload.summary === "string"
      ) {
        return [payload.summary];
      }

      return [];
    })
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
