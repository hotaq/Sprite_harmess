import {
  RUNTIME_EVENT_TYPES,
  type AgentRuntime,
  type FinalTaskSummary,
  type RuntimeApprovalResponse,
  type RuntimeEventRecord,
  type RuntimeEventType,
  type RuntimeTaskStartAcceptedScopes,
  type StoredLearningReviewArtifactResult,
  createFinalTaskSummary,
  readLearningReviewArtifacts
} from "@sprite/core";
import type {
  ApprovalApplyPatchToolCall,
  CommandPolicyRequest
} from "@sprite/sandbox";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  id?: JsonRpcId;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorData {
  code?: string;
  correlationId?: string;
  nextAction: string;
  recoverable: boolean;
  subsystem: "rpc";
}

export interface JsonRpcErrorObject {
  code: number;
  data: JsonRpcErrorData;
  message: string;
}

export interface JsonRpcSuccessResponse {
  id: JsonRpcId;
  jsonrpc: "2.0";
  result: unknown;
}

export interface JsonRpcErrorResponse {
  error: JsonRpcErrorObject;
  id: JsonRpcId;
  jsonrpc: "2.0";
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage =
  | JsonRpcNotification
  | JsonRpcRequest
  | JsonRpcResponse;

interface RuntimeGetStateSessionSummary {
  correlationId?: string;
  createdAt: string | null;
  cwd: string;
  sessionId: string;
  status: string;
  taskId: string | null;
}

interface RuntimeGetStateScopeSummary {
  allowedTools: string[];
  memoryScope: {
    manual: boolean;
    procedural: boolean;
    working: boolean;
  };
  outputFormat: string;
  provider: { providerName: string; model: string | null } | null;
  toolExecutionEnabled: boolean;
}

export interface JsonRpcRuntimeBridge {
  createSession: AgentRuntime["createSession"];
  currentSession?: RuntimeGetStateSessionSummary | null;
  currentScopes?: RuntimeGetStateScopeSummary | null;
  getActiveTask: AgentRuntime["getActiveTask"];
  getBootstrapState: AgentRuntime["getBootstrapState"];
  getEventHistory: AgentRuntime["getEventHistory"];
  getLearningReviewArtifacts: typeof readLearningReviewArtifacts;
  getPendingApprovals: AgentRuntime["getPendingApprovals"];
  respondToApproval: AgentRuntime["respondToApproval"];
  resumeSession: AgentRuntime["resumeSession"];
  startTask: AgentRuntime["startTask"];
  subscribeToEvents: AgentRuntime["subscribeToEvents"];
}

export interface JsonRpcHandlerOptions {
  runtime: JsonRpcRuntimeBridge;
}

export interface JsonRpcStdioServerOptions extends JsonRpcHandlerOptions {
  emitReady?: boolean;
  input: Readable;
  output: Writable;
}

const JSON_RPC_VERSION = "2.0";
const RPC_SERVER_NAME = "sprite-rpc";
const RPC_TRANSPORT = "stdio";
const RPC_CAPABILITIES = [
  "rpc.ping",
  "session.create",
  "session.resume",
  "task.start",
  "event.subscribe",
  "event.unsubscribe",
  "approval.respond",
  "task.getResult",
  "task.learningReview",
  "runtime.getState"
] as const;

const TASK_RESULT_IMPORTANT_EVENTS_MAX_COUNT = 100;
const TASK_RESULT_INFLUENCES_MAX_COUNT = 50;
const TASK_LEARNING_REVIEW_ITEMS_MAX_COUNT = 50;
const TASK_LEARNING_REVIEW_SESSION_LIMIT = 5;
const TASK_LEARNING_REVIEW_ARTIFACT_LIMIT = 20;

const TASK_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "failed",
  "max-iterations"
]);
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const EVENT_REPLAY_DEFAULT_LIMIT = 50;
const EVENT_REPLAY_MAX_LIMIT = 100;
const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]+$/u;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9_-]+$/u;
const TASK_ID_PATTERN = /^task_[A-Za-z0-9_-]+$/u;
const TASK_START_OUTPUT_FORMATS = ["text", "json", "ndjson"] as const;
const TASK_START_TEXT_MAX_LENGTH = 16_000;
const TASK_START_PROVIDER_KEYS = ["baseUrl", "model", "providerName"] as const;
const TASK_START_MEMORY_SCOPE_KEYS = [
  "manual",
  "procedural",
  "working"
] as const;
const SECRET_LIKE_PROVIDER_FIELD_PATTERN =
  /(api[_-]?key|token|password|passwd|secret|credential|private[_-]?key)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isValidId(value: unknown): value is JsonRpcId {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function readRequestId(value: unknown): JsonRpcId {
  if (!isRecord(value) || !hasOwn(value, "id")) {
    return null;
  }

  return isValidId(value.id) ? value.id : null;
}

function createJsonRpcErrorResponse(options: {
  code: number;
  correlationId?: string;
  dataCode?: string;
  id?: JsonRpcId;
  message: string;
  nextAction: string;
  recoverable?: boolean;
}): JsonRpcErrorResponse {
  return {
    error: {
      code: options.code,
      data: {
        ...(options.dataCode === undefined ? {} : { code: options.dataCode }),
        ...(options.correlationId === undefined
          ? {}
          : { correlationId: options.correlationId }),
        nextAction: options.nextAction,
        recoverable: options.recoverable ?? true,
        subsystem: "rpc"
      },
      message: options.message
    },
    id: options.id ?? null,
    jsonrpc: JSON_RPC_VERSION
  };
}

function createJsonRpcSuccessResponse(
  id: JsonRpcId,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    id,
    jsonrpc: JSON_RPC_VERSION,
    result
  };
}

function createProtocolMetadata(runtimeConnected: boolean): {
  capabilities: string[];
  protocolVersion: "2.0";
  runtimeConnected: boolean;
  server: "sprite-rpc";
  transport: "stdio";
} {
  return {
    capabilities: [...RPC_CAPABILITIES],
    protocolVersion: JSON_RPC_VERSION,
    runtimeConnected,
    server: RPC_SERVER_NAME,
    transport: RPC_TRANSPORT
  };
}

function createInvalidParamsResponse(
  id: JsonRpcId,
  nextAction: string,
  dataCode?: string
): JsonRpcErrorResponse {
  return createJsonRpcErrorResponse({
    code: -32602,
    ...(dataCode === undefined ? {} : { dataCode }),
    id,
    message: "Invalid params.",
    nextAction
  });
}

function createRuntimeUnavailableResponse(id: JsonRpcId): JsonRpcErrorResponse {
  return createJsonRpcErrorResponse({
    code: -32000,
    id,
    message: "Runtime initialization failed.",
    nextAction: "Check stderr diagnostics and retry after fixing config.",
    recoverable: true
  });
}

function readSafeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === "string" &&
    SAFE_ERROR_CODE_PATTERN.test(error.code)
    ? error.code
    : undefined;
}

function createSessionErrorNextAction(code: string | undefined): string {
  switch (code) {
    case "SESSION_ALREADY_CREATED":
      return "Use the existing session ID from the first session.create call, or start a new RPC runtime process for a fresh session.";
    case "SESSION_ALREADY_ACTIVE":
      return "Resume or continue the active runtime session instead of creating another session.";
    case "SESSION_NOT_FOUND":
      return "Check that the session ID exists under the requested cwd and retry.";
    case "SESSION_ID_INVALID":
      return "Use a valid session ID with the ses_ prefix.";
    case "SESSION_RESUME_UNAVAILABLE":
      return "Create or resume a session with a persisted task snapshot before requesting resume metadata.";
    case "SESSION_STATE_MISSING":
    case "SESSION_EVENTS_MISSING":
      return "Check that the local session artifacts are complete and retry.";
    case "SESSION_STATE_READ_FAILED":
    case "SESSION_EVENTS_READ_FAILED":
      return "Check local session file permissions and retry.";
    case "SESSION_STATE_INVALID_JSON":
    case "SESSION_EVENT_LOG_INVALID_JSON":
    case "SESSION_EVENT_RUNTIME_INVALID":
      return "Repair or remove invalid local session artifacts before retrying.";
    case "SESSION_STATE_SCOPE_MISMATCH":
      return "Check that the session ID and cwd refer to the same local session.";
    case "SESSION_STORAGE_ERROR":
    case "SESSION_STATE_WRITE_FAILED":
    case "SESSION_EVENT_APPEND_FAILED":
      return "Check local session storage permissions and retry.";
    default:
      return "Check the session ID, cwd scope, and local session artifacts.";
  }
}

function createSessionRuntimeErrorResponse(
  id: JsonRpcId,
  error: unknown
): JsonRpcErrorResponse {
  const code = readSafeErrorCode(error);
  const safeCodeSuffix = code === undefined ? "" : ` (${code})`;

  return createJsonRpcErrorResponse({
    code: -32602,
    id,
    message: `Session request rejected${safeCodeSuffix}.`,
    nextAction: createSessionErrorNextAction(code),
    recoverable: true
  });
}

function createTaskStartErrorNextAction(code: string | undefined): string {
  switch (code) {
    case "TASK_ALREADY_ACTIVE":
      return "Resolve or cancel the active task before starting another task in this RPC runtime.";
    case "TASK_TEXT_INVALID":
    case "TASK_TEXT_TOO_LARGE":
      return "Retry with a non-empty task string within the supported size limit.";
    case "TASK_TOOL_SCOPE_INVALID":
      return "Retry with allowedTools containing only known runtime tool names.";
    case "TASK_MEMORY_SCOPE_UNSUPPORTED":
      return "Retry with working memory enabled and supported memory scope fields.";
    case "TASK_OUTPUT_FORMAT_INVALID":
      return "Retry with output.format set to text, json, or ndjson.";
    case "TASK_PROVIDER_SECRET_REJECTED":
      return "Remove provider credentials from JSON-RPC params and use environment, config, or auth storage.";
    case "TASK_PROVIDER_UNSUPPORTED":
      return "Retry with a supported providerName or omit provider preferences.";
    case "SESSION_NOT_FOUND":
      return "Create the session first or retry with a sessionId under the current runtime cwd.";
    case "SESSION_ID_INVALID":
      return "Retry with a valid sessionId using the ses_ prefix.";
    case "SESSION_STATE_SCOPE_MISMATCH":
      return "Retry with a sessionId that belongs to the requested cwd.";
    case "SESSION_STATE_MISSING":
    case "SESSION_EVENTS_MISSING":
    case "SESSION_STATE_READ_FAILED":
    case "SESSION_EVENTS_READ_FAILED":
    case "SESSION_STATE_INVALID_JSON":
    case "SESSION_EVENT_LOG_INVALID_JSON":
    case "SESSION_EVENT_RUNTIME_INVALID":
      return "Repair or remove invalid local session artifacts before retrying.";
    default:
      return "Check task text, cwd, session, provider, tool, memory, and output scopes before retrying.";
  }
}

function createTaskStartRuntimeErrorResponse(
  id: JsonRpcId,
  error: unknown
): JsonRpcErrorResponse {
  const code = readSafeErrorCode(error);
  const safeCodeSuffix = code === undefined ? "" : ` (${code})`;

  return createJsonRpcErrorResponse({
    code: -32602,
    ...(code === undefined ? {} : { dataCode: code }),
    id,
    message: `Task request rejected${safeCodeSuffix}.`,
    nextAction: createTaskStartErrorNextAction(code),
    recoverable: true
  });
}

function readParamsRecord(
  request: JsonRpcRequest
):
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; response: JsonRpcErrorResponse } {
  if (!isRecord(request.params)) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Send params as an object with the required method fields.",
        "INVALID_PARAMS"
      )
    };
  }

  return { ok: true, params: request.params };
}

function normalizeCwd(value: string): string | null {
  try {
    return realpathSync.native(path.resolve(value));
  } catch {
    return null;
  }
}

function validateOptionalObjectParam(
  params: Record<string, unknown>,
  key: "config" | "context"
): JsonRpcErrorResponse | null {
  if (!hasOwn(params, key) || isRecord(params[key])) {
    return null;
  }

  return createInvalidParamsResponse(
    null,
    `${key} must be an object when provided.`,
    key === "context" ? "INVALID_CONTEXT" : "INVALID_PARAMS"
  );
}

function readScopedCwd(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
):
  | { cwd: string; ok: true; params: Record<string, unknown> }
  | { ok: false; response: JsonRpcErrorResponse } {
  const params = readParamsRecord(request);

  if (!params.ok) {
    return params;
  }

  if (typeof params.params.cwd !== "string" || params.params.cwd.length === 0) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Provide cwd as a non-empty string.",
        "INVALID_CWD"
      )
    };
  }

  const configError = validateOptionalObjectParam(params.params, "config");

  if (configError !== null) {
    return {
      ok: false,
      response: {
        ...configError,
        id: request.id ?? null
      }
    };
  }

  const contextError = validateOptionalObjectParam(params.params, "context");

  if (contextError !== null) {
    return {
      ok: false,
      response: {
        ...contextError,
        id: request.id ?? null
      }
    };
  }

  const bootstrap = runtime.getBootstrapState();

  if (!bootstrap.ok) {
    return {
      ok: false,
      response: createRuntimeUnavailableResponse(request.id ?? null)
    };
  }

  const requestedCwd = normalizeCwd(params.params.cwd);
  const runtimeCwd = normalizeCwd(bootstrap.value.startup.cwd);

  if (requestedCwd === null) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Requested cwd must exist and be readable.",
        "INVALID_CWD"
      )
    };
  }

  if (runtimeCwd === null) {
    return {
      ok: false,
      response: createRuntimeUnavailableResponse(request.id ?? null)
    };
  }

  if (requestedCwd !== runtimeCwd) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Requested cwd is outside the current RPC runtime scope.",
        "INVALID_CWD"
      )
    };
  }

  return {
    cwd: runtimeCwd,
    ok: true,
    params: params.params
  };
}

interface TaskStartParams {
  allowedTools: string[];
  memoryScope?: {
    manual: boolean;
    procedural: boolean;
    working: boolean;
  };
  outputFormat?: string;
  provider?: {
    baseUrl?: string;
    model?: string;
    providerName?: string;
  };
  sessionId?: string;
  task: string;
}

interface ParamReadFailure {
  dataCode: string;
  nextAction: string;
  ok: false;
}

function readTaskStartParams(
  request: JsonRpcRequest,
  scoped: { params: Record<string, unknown> }
):
  | { ok: true; value: TaskStartParams }
  | { ok: false; response: JsonRpcErrorResponse } {
  const task = readTaskText(scoped.params.task);

  if (!task.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        task.nextAction,
        task.dataCode
      )
    };
  }

  const sessionId = readOptionalSessionId(scoped.params.sessionId);

  if (!sessionId.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        sessionId.nextAction,
        sessionId.dataCode
      )
    };
  }

  const allowedTools = readAllowedTools(scoped.params.allowedTools);

  if (!allowedTools.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        allowedTools.nextAction,
        allowedTools.dataCode
      )
    };
  }

  const memoryScope = readMemoryScope(scoped.params.memoryScope);

  if (!memoryScope.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        memoryScope.nextAction,
        memoryScope.dataCode
      )
    };
  }

  const outputFormat = readOutputFormat(scoped.params.output);

  if (!outputFormat.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        outputFormat.nextAction,
        outputFormat.dataCode
      )
    };
  }

  const provider = readProviderPreferences(scoped.params.provider);

  if (!provider.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        provider.nextAction,
        provider.dataCode
      )
    };
  }

  return {
    ok: true,
    value: {
      allowedTools: allowedTools.value,
      ...(memoryScope.value === undefined
        ? {}
        : { memoryScope: memoryScope.value }),
      ...(outputFormat.value === undefined
        ? {}
        : { outputFormat: outputFormat.value }),
      ...(provider.value === undefined ? {} : { provider: provider.value }),
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value }),
      task: task.value
    }
  };
}

function readTaskText(
  value: unknown
): { ok: true; value: string } | ParamReadFailure {
  if (typeof value !== "string") {
    return {
      dataCode: "TASK_TEXT_INVALID",
      nextAction: "Provide task as a non-empty string.",
      ok: false
    };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return {
      dataCode: "TASK_TEXT_INVALID",
      nextAction: "Provide task as a non-empty string.",
      ok: false
    };
  }

  if (trimmed.length > TASK_START_TEXT_MAX_LENGTH) {
    return {
      dataCode: "TASK_TEXT_TOO_LARGE",
      nextAction: `Provide task text no longer than ${TASK_START_TEXT_MAX_LENGTH} characters.`,
      ok: false
    };
  }

  return { ok: true, value: trimmed };
}

function readOptionalSessionId(
  value: unknown
): { ok: true; value?: string } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string" || value.length === 0) {
    return {
      dataCode: "SESSION_ID_INVALID",
      nextAction: "Provide sessionId as a non-empty string when supplied.",
      ok: false
    };
  }

  return { ok: true, value };
}

function readAllowedTools(
  value: unknown
): { ok: true; value: string[] } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true, value: [] };
  }

  if (
    !Array.isArray(value) ||
    !value.every((toolName) => typeof toolName === "string")
  ) {
    return {
      dataCode: "TASK_TOOL_SCOPE_INVALID",
      nextAction:
        "Provide allowedTools as an array of known tool name strings.",
      ok: false
    };
  }

  return {
    ok: true,
    value: [...new Set(value as string[])]
  };
}

function readMemoryScope(value: unknown):
  | {
      ok: true;
      value?: { manual: boolean; procedural: boolean; working: boolean };
    }
  | ParamReadFailure {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value)) {
    return {
      dataCode: "TASK_MEMORY_SCOPE_UNSUPPORTED",
      nextAction: "Provide memoryScope as an object when supplied.",
      ok: false
    };
  }

  for (const key of Object.keys(value)) {
    if (
      !TASK_START_MEMORY_SCOPE_KEYS.includes(
        key as (typeof TASK_START_MEMORY_SCOPE_KEYS)[number]
      )
    ) {
      return {
        dataCode: "TASK_MEMORY_SCOPE_UNSUPPORTED",
        nextAction:
          "Provide only supported memoryScope fields: working, manual, and procedural.",
        ok: false
      };
    }
  }

  for (const key of ["manual", "procedural", "working"] as const) {
    if (hasOwn(value, key) && typeof value[key] !== "boolean") {
      return {
        dataCode: "TASK_MEMORY_SCOPE_UNSUPPORTED",
        nextAction:
          "Provide memoryScope booleans for working, manual, and procedural.",
        ok: false
      };
    }
  }

  return {
    ok: true,
    value: {
      manual: typeof value.manual === "boolean" ? value.manual : true,
      procedural:
        typeof value.procedural === "boolean" ? value.procedural : true,
      working: typeof value.working === "boolean" ? value.working : true
    }
  };
}

function readOutputFormat(
  value: unknown
): { ok: true; value?: string } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value) || typeof value.format !== "string") {
    return {
      dataCode: "TASK_OUTPUT_FORMAT_INVALID",
      nextAction: "Provide output.format as text, json, or ndjson.",
      ok: false
    };
  }

  if (
    !TASK_START_OUTPUT_FORMATS.includes(
      value.format as (typeof TASK_START_OUTPUT_FORMATS)[number]
    )
  ) {
    return {
      dataCode: "TASK_OUTPUT_FORMAT_INVALID",
      nextAction: "Provide output.format as text, json, or ndjson.",
      ok: false
    };
  }

  return { ok: true, value: value.format };
}

function readProviderPreferences(value: unknown):
  | {
      ok: true;
      value?: { baseUrl?: string; model?: string; providerName?: string };
    }
  | ParamReadFailure {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value)) {
    return {
      dataCode: "TASK_PROVIDER_UNSUPPORTED",
      nextAction: "Provide provider as an object when supplied.",
      ok: false
    };
  }

  for (const key of Object.keys(value)) {
    if (SECRET_LIKE_PROVIDER_FIELD_PATTERN.test(key)) {
      return {
        dataCode: "TASK_PROVIDER_SECRET_REJECTED",
        nextAction:
          "Do not send provider credentials through JSON-RPC params; use environment, config, or auth storage.",
        ok: false
      };
    }

    if (
      !TASK_START_PROVIDER_KEYS.includes(
        key as (typeof TASK_START_PROVIDER_KEYS)[number]
      )
    ) {
      return {
        dataCode: "TASK_PROVIDER_UNSUPPORTED",
        nextAction:
          "Provider preferences support only providerName, model, and baseUrl.",
        ok: false
      };
    }
  }

  for (const key of ["baseUrl", "model", "providerName"] as const) {
    if (hasOwn(value, key) && typeof value[key] !== "string") {
      return {
        dataCode: "TASK_PROVIDER_UNSUPPORTED",
        nextAction:
          "Provide providerName, model, and baseUrl as strings when supplied.",
        ok: false
      };
    }
  }

  return {
    ok: true,
    value: {
      ...(typeof value.baseUrl === "string" ? { baseUrl: value.baseUrl } : {}),
      ...(typeof value.model === "string" ? { model: value.model } : {}),
      ...(typeof value.providerName === "string"
        ? { providerName: value.providerName }
        : {})
    }
  };
}

interface EventSubscriptionParams {
  eventTypes: RuntimeEventType[] | null;
  replay: {
    limit: number;
    mode: "none" | "recent";
  };
  sessionId: string | null;
  taskId: string | null;
}

interface EventSubscriptionRecord extends EventSubscriptionParams {
  createdAt: string;
  subscriptionId: string;
  unsubscribe: () => void;
}

interface EventSubscriptionResult {
  afterResponse?: JsonRpcNotification[];
  response?: JsonRpcResponse;
}

type JsonRpcPayloadWriter = (
  payload: JsonRpcMessage | JsonRpcResponse[]
) => Promise<void>;

function isKnownRuntimeEventType(value: string): value is RuntimeEventType {
  return (RUNTIME_EVENT_TYPES as readonly string[]).includes(value);
}

function readOptionalEventSessionId(
  value: unknown
): { ok: true; value: string | null } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
    return {
      dataCode: "SESSION_ID_INVALID",
      nextAction: "Provide sessionId as a non-empty ses_-prefixed string.",
      ok: false
    };
  }

  return { ok: true, value };
}

function readOptionalEventTaskId(
  value: unknown
): { ok: true; value: string | null } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    return {
      dataCode: "TASK_ID_INVALID",
      nextAction: "Provide taskId as a non-empty task_-prefixed string.",
      ok: false
    };
  }

  return { ok: true, value };
}

function readEventTypes(
  value: unknown
): { ok: true; value: RuntimeEventType[] | null } | ParamReadFailure {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (
    !Array.isArray(value) ||
    !value.every(
      (eventType) =>
        typeof eventType === "string" && isKnownRuntimeEventType(eventType)
    )
  ) {
    return {
      dataCode: "EVENT_TYPES_INVALID",
      nextAction:
        "Provide eventTypes as an array of known runtime event type strings.",
      ok: false
    };
  }

  return { ok: true, value: [...new Set(value as RuntimeEventType[])] };
}

function readReplayOptions(
  value: unknown
):
  | { ok: true; value: { limit: number; mode: "none" | "recent" } }
  | ParamReadFailure {
  if (value === undefined) {
    return { ok: true, value: { limit: 0, mode: "none" } };
  }

  if (!isRecord(value)) {
    return {
      dataCode: "EVENT_REPLAY_INVALID",
      nextAction:
        "Provide replay as an object with mode none or recent and an optional bounded limit.",
      ok: false
    };
  }

  const mode = value.mode;

  if (mode !== "none" && mode !== "recent") {
    return {
      dataCode: "EVENT_REPLAY_INVALID",
      nextAction: "Provide replay.mode as none or recent.",
      ok: false
    };
  }

  const limit =
    value.limit === undefined
      ? mode === "recent"
        ? EVENT_REPLAY_DEFAULT_LIMIT
        : 0
      : value.limit;

  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < (mode === "recent" ? 1 : 0) ||
    limit > EVENT_REPLAY_MAX_LIMIT
  ) {
    return {
      dataCode: "EVENT_REPLAY_INVALID",
      nextAction: `Provide replay.limit as an integer between ${mode === "recent" ? 1 : 0} and ${EVENT_REPLAY_MAX_LIMIT}.`,
      ok: false
    };
  }

  return { ok: true, value: { limit, mode } };
}

function readEventSubscribeParams(
  request: JsonRpcRequest,
  scoped: { params: Record<string, unknown> }
):
  | { ok: true; value: EventSubscriptionParams }
  | { ok: false; response: JsonRpcErrorResponse } {
  const sessionId = readOptionalEventSessionId(scoped.params.sessionId);

  if (!sessionId.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        sessionId.nextAction,
        sessionId.dataCode
      )
    };
  }

  const taskId = readOptionalEventTaskId(scoped.params.taskId);

  if (!taskId.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        taskId.nextAction,
        taskId.dataCode
      )
    };
  }

  const eventTypes = readEventTypes(scoped.params.eventTypes);

  if (!eventTypes.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        eventTypes.nextAction,
        eventTypes.dataCode
      )
    };
  }

  const replay = readReplayOptions(scoped.params.replay);

  if (!replay.ok) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        replay.nextAction,
        replay.dataCode
      )
    };
  }

  return {
    ok: true,
    value: {
      eventTypes: eventTypes.value,
      replay: replay.value,
      sessionId: sessionId.value,
      taskId: taskId.value
    }
  };
}

function readSubscriptionId(
  request: JsonRpcRequest
):
  | { ok: true; subscriptionId: string }
  | { ok: false; response: JsonRpcErrorResponse } {
  const params = readParamsRecord(request);

  if (!params.ok) {
    return params;
  }

  if (
    typeof params.params.subscriptionId !== "string" ||
    !SUBSCRIPTION_ID_PATTERN.test(params.params.subscriptionId)
  ) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Provide subscriptionId as a non-empty sub_-prefixed string.",
        "SUBSCRIPTION_ID_INVALID"
      )
    };
  }

  return { ok: true, subscriptionId: params.params.subscriptionId };
}

function eventMatchesSubscription(
  subscription: EventSubscriptionRecord,
  event: RuntimeEventRecord
): boolean {
  if (
    subscription.sessionId !== null &&
    event.sessionId !== subscription.sessionId
  ) {
    return false;
  }

  if (subscription.taskId !== null && event.taskId !== subscription.taskId) {
    return false;
  }

  if (
    subscription.eventTypes !== null &&
    !subscription.eventTypes.includes(event.type)
  ) {
    return false;
  }

  return true;
}

function createRuntimeEventNotification(
  subscriptionId: string,
  event: RuntimeEventRecord,
  replay: boolean
): JsonRpcNotification {
  const waitingReason =
    event.type === "task.waiting" &&
    typeof event.payload.reason === "string"
      ? event.payload.reason
      : undefined;
  const terminal =
    event.type === "task.completed" ||
    event.type === "task.failed" ||
    event.type === "task.cancelled";

  return {
    jsonrpc: JSON_RPC_VERSION,
    method: "event.runtime",
    params: {
      subscriptionId,
      event,
      replay,
      terminal,
      actionable: waitingReason === "approval-required",
      ...(waitingReason === undefined ? {} : { waitingReason })
    }
  };
}

function createQueuedJsonRpcWriter(output: Writable): {
  drain: () => Promise<void>;
  write: JsonRpcPayloadWriter;
} {
  let queue = Promise.resolve();

  return {
    drain: () => queue,
    write(payload) {
      const write = queue.then(() => writeJsonRpcPayload(output, payload));
      queue = write.catch(() => undefined);
      return write;
    }
  };
}

class EventSubscriptionRegistry {
  private bufferedNotifications: JsonRpcNotification[] = [];
  private notificationBufferDepth = 0;
  private readonly subscriptions = new Map<string, EventSubscriptionRecord>();

  constructor(
    private readonly runtime: JsonRpcRuntimeBridge,
    private readonly writePayload: JsonRpcPayloadWriter
  ) {}

  subscribe(request: JsonRpcRequest): EventSubscriptionResult {
    if (isNotification(request)) {
      return {};
    }

    const scoped = readScopedCwd(request, this.runtime);

    if (!scoped.ok) {
      return { response: scoped.response };
    }

    const params = readEventSubscribeParams(request, scoped);

    if (!params.ok) {
      return { response: params.response };
    }

    const subscriptionId = this.nextSubscriptionId();
    const replayEvents = this.readReplayEvents(params.value);
    const createdAt = new Date().toISOString();
    const subscription: EventSubscriptionRecord = {
      ...params.value,
      createdAt,
      subscriptionId,
      unsubscribe: () => undefined
    };

    subscription.unsubscribe = this.runtime.subscribeToEvents((event) => {
      if (!eventMatchesSubscription(subscription, event)) {
        return;
      }

      this.sendNotification(
        createRuntimeEventNotification(subscriptionId, event, false)
      );
    });
    this.subscriptions.set(subscriptionId, subscription);

    const lastEvent = replayEvents.at(-1);
    const response = createJsonRpcSuccessResponse(request.id ?? null, {
      subscription: {
        subscriptionId,
        sessionId: params.value.sessionId,
        taskId: params.value.taskId,
        eventTypes: params.value.eventTypes,
        createdAt,
        replayedEventCount: replayEvents.length,
        lastEventId: lastEvent?.eventId ?? null
      },
      runtime: {
        eventCount: this.runtime.getEventHistory().length,
        capabilities: createProtocolMetadata(true).capabilities,
        eventTypes: [...RUNTIME_EVENT_TYPES]
      }
    });

    return {
      afterResponse: replayEvents.map((event) =>
        createRuntimeEventNotification(subscriptionId, event, true)
      ),
      response
    };
  }

  unsubscribe(request: JsonRpcRequest): EventSubscriptionResult {
    if (isNotification(request)) {
      return {};
    }

    const parsed = readSubscriptionId(request);

    if (!parsed.ok) {
      return { response: parsed.response };
    }

    const subscription = this.subscriptions.get(parsed.subscriptionId);

    if (subscription === undefined) {
      return {
        response: createInvalidParamsResponse(
          request.id ?? null,
          "Use an active subscriptionId returned by event.subscribe.",
          "SUBSCRIPTION_NOT_FOUND"
        )
      };
    }

    subscription.unsubscribe();
    this.subscriptions.delete(parsed.subscriptionId);

    return {
      response: createJsonRpcSuccessResponse(request.id ?? null, {
        subscription: {
          subscriptionId: parsed.subscriptionId,
          status: "unsubscribed"
        }
      })
    };
  }

  beginNotificationBuffer(): void {
    this.notificationBufferDepth += 1;
  }

  disposeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }

    this.subscriptions.clear();
  }

  endNotificationBuffer(): JsonRpcNotification[] {
    this.notificationBufferDepth = Math.max(0, this.notificationBufferDepth - 1);

    if (this.notificationBufferDepth > 0) {
      return [];
    }

    const notifications = this.bufferedNotifications;
    this.bufferedNotifications = [];

    return notifications;
  }

  private nextSubscriptionId(): string {
    return `sub_${randomUUID()}`;
  }

  private readReplayEvents(
    subscription: EventSubscriptionParams
  ): RuntimeEventRecord[] {
    if (subscription.replay.mode !== "recent") {
      return [];
    }

    const history =
      subscription.taskId === null
        ? this.runtime.getEventHistory()
        : this.runtime.getEventHistory(subscription.taskId);
    const matched = history.filter((event) =>
      eventMatchesSubscription(
        {
          ...subscription,
          createdAt: "",
          subscriptionId: "",
          unsubscribe: () => undefined
        },
        event
      )
    );

    return matched.slice(-subscription.replay.limit);
  }

  private sendNotification(notification: JsonRpcNotification): void {
    if (this.notificationBufferDepth > 0) {
      this.bufferedNotifications.push(notification);
      return;
    }

    void this.writePayload(notification).catch(() => {
      // Stream write failures are handled by the server loop; runtime
      // subscribers must not control task state.
    });
  }
}

function readBootstrapMetadata(runtime: JsonRpcRuntimeBridge): {
  runtimeConnected: boolean;
  warningCount: number;
} {
  const bootstrap = runtime.getBootstrapState();

  if (!bootstrap.ok) {
    return {
      runtimeConnected: false,
      warningCount: 0
    };
  }

  return {
    runtimeConnected: true,
    warningCount: bootstrap.value.warnings.length
  };
}

export function createRpcReadyNotification(
  runtime: JsonRpcRuntimeBridge
): JsonRpcNotification {
  const bootstrap = readBootstrapMetadata(runtime);

  return {
    jsonrpc: JSON_RPC_VERSION,
    method: "rpc.ready",
    params: {
      ...createProtocolMetadata(bootstrap.runtimeConnected),
      warningCount: bootstrap.warningCount
    }
  };
}

function parseJsonRpcRequest(
  value: unknown
):
  | { ok: true; request: JsonRpcRequest }
  | { id: JsonRpcId; ok: false; response: JsonRpcErrorResponse } {
  if (!isRecord(value)) {
    return {
      id: null,
      ok: false,
      response: createJsonRpcErrorResponse({
        code: -32600,
        message: "Invalid JSON-RPC request.",
        nextAction: "Send a JSON object with jsonrpc, method, and optional id."
      })
    };
  }

  const id = readRequestId(value);

  if (
    value.jsonrpc !== JSON_RPC_VERSION ||
    typeof value.method !== "string" ||
    (hasOwn(value, "id") && !isValidId(value.id))
  ) {
    return {
      id,
      ok: false,
      response: createJsonRpcErrorResponse({
        code: -32600,
        id,
        message: "Invalid JSON-RPC request.",
        nextAction:
          "Use JSON-RPC 2.0 with a string method and string, number, or null id."
      })
    };
  }

  return {
    ok: true,
    request: {
      ...(hasOwn(value, "id") ? { id: value.id as JsonRpcId } : {}),
      jsonrpc: JSON_RPC_VERSION,
      method: value.method,
      ...(hasOwn(value, "params") ? { params: value.params } : {})
    }
  };
}

function isNotification(request: JsonRpcRequest): boolean {
  return !hasOwn(request as unknown as Record<string, unknown>, "id");
}

function handleRpcPing(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
  const bootstrap = readBootstrapMetadata(runtime);

  if (!bootstrap.runtimeConnected) {
    return isNotification(request)
      ? undefined
      : createJsonRpcErrorResponse({
          code: -32000,
          id: request.id ?? null,
          message: "Runtime initialization failed.",
          nextAction: "Check stderr diagnostics and retry after fixing config.",
          recoverable: true
        });
  }

  return isNotification(request)
    ? undefined
    : createJsonRpcSuccessResponse(request.id ?? null, {
        ...createProtocolMetadata(true),
        runtime: {
          eventCount: runtime.getEventHistory().length,
          initialized: true,
          warningCount: bootstrap.warningCount
        }
      });
}

function handleSessionCreate(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
  if (isNotification(request)) {
    return undefined;
  }

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const created = runtime.createSession();

  if (!created.ok) {
    return createSessionRuntimeErrorResponse(request.id ?? null, created.error);
  }

  runtime.currentSession = {
    sessionId: created.value.sessionId,
    cwd: created.value.cwd,
    status: "created",
    taskId: null,
    createdAt: created.value.createdAt
  };
  runtime.currentScopes = null;

  return createJsonRpcSuccessResponse(request.id ?? null, {
    session: {
      sessionId: created.value.sessionId,
      cwd: created.value.cwd,
      status: "created",
      taskId: null,
      createdAt: created.value.createdAt
    },
    runtime: {
      provider: created.value.provider,
      eventCount: created.value.eventCount,
      activeTask: created.value.activeTask,
      capabilities: createProtocolMetadata(true).capabilities
    },
    warnings: created.value.warnings
  });
}

function handleSessionResume(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
  if (isNotification(request)) {
    return undefined;
  }

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  if (
    typeof scoped.params.sessionId !== "string" ||
    scoped.params.sessionId.length === 0
  ) {
    return createInvalidParamsResponse(
      request.id ?? null,
      "Provide sessionId as a non-empty string.",
      "SESSION_ID_INVALID"
    );
  }

  const resumed = runtime.resumeSession(scoped.params.sessionId);

  if (!resumed.ok) {
    return createSessionRuntimeErrorResponse(request.id ?? null, resumed.error);
  }

  return createJsonRpcSuccessResponse(request.id ?? null, {
    session: {
      sessionId: resumed.value.sessionId,
      taskId: resumed.value.taskId,
      correlationId: resumed.value.correlationId,
      status: resumed.value.status,
      currentPhase: resumed.value.currentPhase,
      goal: resumed.value.goal,
      latestPlan: resumed.value.latestPlan,
      restoredEventCount: resumed.value.restoredEventCount,
      resumeEventId: resumed.value.resumeEventId
    },
    inspection: {
      executionState: resumed.value.inspection.executionState,
      eventCount: resumed.value.inspection.eventCount,
      pendingApprovalCount: resumed.value.inspection.pendingApprovalCount,
      persistedEventCount: resumed.value.inspection.persistedEventCount,
      recentEvents: resumed.value.inspection.recentEvents
    },
    warnings: resumed.value.warnings
  });
}

function handleTaskStart(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
  if (isNotification(request)) {
    return undefined;
  }

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const taskParams = readTaskStartParams(request, scoped);

  if (!taskParams.ok) {
    return taskParams.response;
  }

  const started = runtime.startTask(taskParams.value.task, {
    allowedTools: taskParams.value.allowedTools,
    ...(taskParams.value.memoryScope === undefined
      ? {}
      : { memoryScope: taskParams.value.memoryScope }),
    ...(taskParams.value.outputFormat === undefined
      ? {}
      : { outputFormat: taskParams.value.outputFormat }),
    ...(taskParams.value.provider === undefined
      ? {}
      : { provider: taskParams.value.provider }),
    ...(taskParams.value.sessionId === undefined
      ? {}
      : { sessionId: taskParams.value.sessionId })
  });

  if (!started.ok) {
    return createTaskStartRuntimeErrorResponse(
      request.id ?? null,
      started.error
    );
  }

  const flow = started.value.flow;

  runtime.currentSession = {
    sessionId: started.value.session.sessionId,
    cwd: flow.request.cwd,
    status: flow.status,
    correlationId: flow.correlationId,
    taskId: flow.taskId,
    createdAt: started.value.session.createdAt
  };
  runtime.currentScopes = summarizeScopeForState(started.value.acceptedScopes);

  return createJsonRpcSuccessResponse(request.id ?? null, {
    task: {
      taskId: flow.taskId,
      correlationId: flow.correlationId,
      status: flow.status,
      currentPhase: flow.currentPhase,
      createdAt: flow.events[0]?.createdAt ?? started.value.session.createdAt
    },
    session: {
      sessionId: started.value.session.sessionId,
      createdAt: started.value.session.createdAt,
      resumed: started.value.session.resumed,
      restoredEventCount: started.value.session.restoredEventCount
    },
    acceptedScopes: started.value.acceptedScopes,
    lifecycle: {
      waitingReason: flow.waitingState?.reason ?? null,
      initialEvents: flow.events.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        createdAt: event.createdAt
      }))
    },
    runtime: {
      eventCount: runtime.getEventHistory().length,
      provider: flow.request.provider
    },
    warnings: started.value.warnings
  });
}

const APPROVAL_RESPOND_ACTIONS = [
  "allow",
  "deny",
  "edit",
  "timeout",
  "alwaysAllowForSession"
] as const;
type ApprovalRespondAction = (typeof APPROVAL_RESPOND_ACTIONS)[number];

const APPROVAL_REASON_MAX_LENGTH = 1_000;
const APPROVAL_CWD_MAX_LENGTH = 4_096;
const APPROVAL_COMMAND_MAX_LENGTH = 16_000;
const APPROVAL_COMMAND_ARG_MAX_COUNT = 128;
const APPROVAL_COMMAND_ARG_MAX_LENGTH = 4_096;
const APPROVAL_ENV_KEY_MAX_LENGTH = 128;
const APPROVAL_ENV_MAX_ENTRIES = 64;
const APPROVAL_ENV_VALUE_MAX_LENGTH = 4_096;
const APPROVAL_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*[A-Za-z0-9]+$/u;
const APPROVAL_MAX_TIMEOUT_MS = 3_600_000;
const APPROVAL_PATCH_EDIT_MAX_COUNT = 50;
const APPROVAL_PATCH_PATH_MAX_LENGTH = 512;
const APPROVAL_PATCH_TEXT_MAX_LENGTH = 65_536;
const APPROVAL_PATCH_SUMMARY_MAX_LENGTH = 1_000;

const APPROVAL_COMMAND_REQUEST_KEYS = new Set([
  "args",
  "command",
  "configuredValidation",
  "cwd",
  "env",
  "timeoutMs",
  "type"
]);
const APPROVAL_PATCH_INPUT_KEYS = new Set(["edits", "summary"]);
const APPROVAL_PATCH_EDIT_KEYS = new Set(["newText", "oldText", "path"]);
const APPROVAL_TOOL_CALL_KEYS = new Set(["input", "toolName"]);

function createApprovalRespondErrorResponse(options: {
  dataCode: string;
  id: JsonRpcId;
  nextAction: string;
  recoverable?: boolean;
}): JsonRpcErrorResponse {
  return createJsonRpcErrorResponse({
    code: -32602,
    dataCode: options.dataCode,
    id: options.id,
    message: "Invalid approval response.",
    nextAction: options.nextAction,
    recoverable: options.recoverable ?? true
  });
}

function createApprovalRespondRuntimeErrorResponse(
  id: JsonRpcId,
  error: unknown
): JsonRpcErrorResponse {
  const code = readSafeErrorCode(error);

  switch (code) {
    case "NO_ACTIVE_TASK":
      return createJsonRpcErrorResponse({
        code: -32603,
        dataCode: "NO_ACTIVE_TASK",
        id,
        message: "Approval response rejected (NO_ACTIVE_TASK).",
        nextAction:
          "Start or resume a task before responding to approval requests.",
        recoverable: false
      });
    case "APPROVAL_NOT_FOUND":
      return createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_NOT_FOUND",
        id,
        nextAction:
          "Check pending approvals via the event stream or retry with a valid approvalRequestId."
      });
    case "APPROVAL_SCOPE_MISMATCH":
      return createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_SCOPE_MISMATCH",
        id,
        nextAction:
          "Use an approvalRequestId that belongs to the active task before retrying.",
        recoverable: false
      });
    case "APPROVAL_ACTION_NOT_ALLOWED":
      return createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_ACTION_NOT_ALLOWED",
        id,
        nextAction:
          "Retry with an action listed in the approval request's allowedActions."
      });
    case "APPROVAL_EDIT_PAYLOAD_INVALID":
      return createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        id,
        nextAction:
          "Provide exactly one of modifiedRequest or modifiedToolCall when action is edit."
      });
    case "APPROVAL_TYPE_MISMATCH":
      return createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_TYPE_MISMATCH",
        id,
        nextAction:
          "Edit command approvals with modifiedRequest and file edit approvals with modifiedToolCall."
      });
    default:
      return createApprovalRespondErrorResponse({
        dataCode: code ?? "APPROVAL_REJECTED",
        id,
        nextAction:
          "Review the approval request scope and retry with valid params."
      });
  }
}

function isApprovalRespondAction(value: unknown): value is ApprovalRespondAction {
  return (
    typeof value === "string" &&
    (APPROVAL_RESPOND_ACTIONS as readonly string[]).includes(value)
  );
}

function readApprovalReason(
  value: unknown
):
  | { ok: true; value?: string }
  | { dataCode: string; nextAction: string; ok: false } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string") {
    return {
      dataCode: "APPROVAL_REASON_INVALID",
      nextAction: "Provide reason as a string when supplied.",
      ok: false
    };
  }

  if (value.length > APPROVAL_REASON_MAX_LENGTH) {
    return {
      dataCode: "APPROVAL_REASON_INVALID",
      nextAction: `Provide reason no longer than ${APPROVAL_REASON_MAX_LENGTH} characters.`,
      ok: false
    };
  }

  return { ok: true, value };
}

function readApprovalRespondId(
  value: unknown
):
  | { ok: true; value: string }
  | { dataCode: string; nextAction: string; ok: false } {
  if (typeof value !== "string" || value.length === 0) {
    return {
      dataCode: "APPROVAL_REQUEST_ID_INVALID",
      nextAction: "Provide approvalRequestId as a non-empty string.",
      ok: false
    };
  }

  return { ok: true, value };
}

function readApprovalCommandRequest(
  value: unknown,
  cwd: string
):
  | { ok: true; value: CommandPolicyRequest }
  | { dataCode: string; nextAction: string; ok: false } {
  if (!isRecord(value)) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction:
        "Provide modifiedRequest as a command policy request object.",
      ok: false
    };
  }

  for (const key of Object.keys(value)) {
    if (!APPROVAL_COMMAND_REQUEST_KEYS.has(key)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedRequest with only command policy fields (type, command, args, cwd, env, timeoutMs, configuredValidation).",
        ok: false
      };
    }
  }

  if (value.type !== "command") {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction: "Provide modifiedRequest.type as 'command'.",
      ok: false
    };
  }

  if (typeof value.command !== "string" || value.command.length === 0) {
    return {
      dataCode: "APPROVAL_COMMAND_EMPTY",
      nextAction:
        "Provide modifiedRequest.command as a non-empty string.",
      ok: false
    };
  }

  if (value.command.trim().length === 0) {
    return {
      dataCode: "APPROVAL_COMMAND_EMPTY",
      nextAction:
        "Provide modifiedRequest.command as a non-whitespace string.",
      ok: false
    };
  }

  if (value.command.length > APPROVAL_COMMAND_MAX_LENGTH) {
    return {
      dataCode: "APPROVAL_COMMAND_TOO_LONG",
      nextAction:
        `Provide modifiedRequest.command no longer than ${APPROVAL_COMMAND_MAX_LENGTH} characters.`,
      ok: false
    };
  }

  if (value.args !== undefined) {
    if (!Array.isArray(value.args)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedRequest.args as an array of strings when supplied.",
        ok: false
      };
    }

    if (value.args.length > APPROVAL_COMMAND_ARG_MAX_COUNT) {
      return {
        dataCode: "APPROVAL_ARGS_TOO_MANY",
        nextAction:
          `Provide modifiedRequest.args with no more than ${APPROVAL_COMMAND_ARG_MAX_COUNT} entries.`,
        ok: false
      };
    }

    if (
      !value.args.every(
        (entry) =>
          typeof entry === "string" &&
          entry.length <= APPROVAL_COMMAND_ARG_MAX_LENGTH
      )
    ) {
      return {
        dataCode: "APPROVAL_ARG_TOO_LONG",
        nextAction:
          `Provide each modifiedRequest.args entry as a string no longer than ${APPROVAL_COMMAND_ARG_MAX_LENGTH} characters.`,
        ok: false
      };
    }
  }

  if (
    typeof value.cwd !== "string" ||
    value.cwd.length === 0 ||
    value.cwd.length > APPROVAL_CWD_MAX_LENGTH
  ) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction:
        `Provide modifiedRequest.cwd as a non-empty string no longer than ${APPROVAL_CWD_MAX_LENGTH} characters.`,
      ok: false
    };
  }

  if (
    value.timeoutMs !== undefined &&
    (typeof value.timeoutMs !== "number" ||
      !Number.isFinite(value.timeoutMs) ||
      value.timeoutMs <= 0 ||
      value.timeoutMs < 1 ||
      value.timeoutMs > APPROVAL_MAX_TIMEOUT_MS)
  ) {
    return {
      dataCode: "APPROVAL_TIMEOUT_INVALID",
      nextAction:
        `Provide modifiedRequest.timeoutMs as a positive integer between 1 and ${APPROVAL_MAX_TIMEOUT_MS} ms when supplied.`,
      ok: false
    };
  }

  if (value.env !== undefined) {
    if (!isRecord(value.env)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedRequest.env as an object of string values when supplied.",
        ok: false
      };
    }

    const envKeys = Object.keys(value.env);

    if (envKeys.length !== new Set(envKeys).size) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedRequest.env with unique keys (duplicate keys detected).",
        ok: false
      };
    }

    const envEntries = Object.entries(value.env);

    if (envEntries.length > APPROVAL_ENV_MAX_ENTRIES) {
      return {
        dataCode: "APPROVAL_ENV_TOO_MANY_ENTRIES",
        nextAction:
          `Provide modifiedRequest.env with no more than ${APPROVAL_ENV_MAX_ENTRIES} entries.`,
        ok: false
      };
    }

    for (const [key, entry] of envEntries) {
      if (
        key.length === 0 ||
        key.length > APPROVAL_ENV_KEY_MAX_LENGTH ||
        !APPROVAL_ENV_KEY_PATTERN.test(key)
      ) {
        return {
          dataCode: "APPROVAL_ENV_KEY_INVALID",
          nextAction:
            `Provide modifiedRequest.env keys as shell-style variable names (1-${APPROVAL_ENV_KEY_MAX_LENGTH} chars, alphanumeric + underscore, at least one letter/digit).`,
          ok: false
        };
      }

      if (
        typeof entry !== "string" ||
        entry.length > APPROVAL_ENV_VALUE_MAX_LENGTH
      ) {
        return {
          dataCode: "APPROVAL_ENV_VALUE_TOO_LONG",
          nextAction:
            `Provide modifiedRequest.env values as strings no longer than ${APPROVAL_ENV_VALUE_MAX_LENGTH} characters.`,
          ok: false
        };
      }
    }
  }

  if (
    value.configuredValidation !== undefined &&
    typeof value.configuredValidation !== "boolean"
  ) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction:
        "Provide modifiedRequest.configuredValidation as a boolean when supplied.",
      ok: false
    };
  }

  const normalizedCwd = normalizeCwd(value.cwd);

  if (normalizedCwd === null || normalizedCwd !== cwd) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction:
        "Set modifiedRequest.cwd to the same scoped cwd as the approval response.",
      ok: false
    };
  }

  const command: CommandPolicyRequest = {
    command: value.command,
    cwd: normalizedCwd,
    type: "command",
    ...(Array.isArray(value.args) ? { args: [...(value.args as string[])] } : {}),
    ...(typeof value.timeoutMs === "number"
      ? { timeoutMs: value.timeoutMs }
      : {}),
    ...(typeof value.configuredValidation === "boolean"
      ? { configuredValidation: value.configuredValidation }
      : {}),
    ...(isRecord(value.env)
      ? { env: { ...(value.env as Record<string, string>) } }
      : {})
  };

  return { ok: true, value: command };
}

function readApprovalPatchToolCall(
  value: unknown
):
  | { ok: true; value: ApprovalApplyPatchToolCall }
  | { dataCode: string; nextAction: string; ok: false } {
  if (!isRecord(value)) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction:
        "Provide modifiedToolCall as an object with toolName and input.",
      ok: false
    };
  }

  for (const key of Object.keys(value)) {
    if (!APPROVAL_TOOL_CALL_KEYS.has(key)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedToolCall with only toolName and input fields.",
        ok: false
      };
    }
  }

  if (value.toolName !== "apply_patch") {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction: "Provide modifiedToolCall.toolName as 'apply_patch'.",
      ok: false
    };
  }

  if (!isRecord(value.input)) {
    return {
      dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
      nextAction: "Provide modifiedToolCall.input as an apply_patch input object.",
      ok: false
    };
  }

  for (const key of Object.keys(value.input)) {
    if (!APPROVAL_PATCH_INPUT_KEYS.has(key)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide modifiedToolCall.input with only edits and an optional summary.",
        ok: false
      };
    }
  }

  const editsValue = (value.input as { edits?: unknown }).edits;

  if (
    !Array.isArray(editsValue) ||
    editsValue.length === 0 ||
    editsValue.length > APPROVAL_PATCH_EDIT_MAX_COUNT
  ) {
    return {
      dataCode: "APPROVAL_PATCH_EDITS_TOO_MANY",
      nextAction:
        `Provide modifiedToolCall.input.edits as a non-empty array of no more than ${APPROVAL_PATCH_EDIT_MAX_COUNT} edits.`,
      ok: false
    };
  }

  const edits: ApprovalApplyPatchToolCall["input"]["edits"] = [];

  for (const edit of editsValue) {
    if (!isRecord(edit)) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide each modifiedToolCall.input.edits entry as an object with path, oldText, and newText.",
        ok: false
      };
    }

    for (const key of Object.keys(edit)) {
      if (!APPROVAL_PATCH_EDIT_KEYS.has(key)) {
        return {
          dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
          nextAction:
            "Provide edits entries with only path, oldText, and newText.",
          ok: false
        };
      }
    }

    if (
      typeof edit.path !== "string" ||
      edit.path.length === 0 ||
      edit.path.length > APPROVAL_PATCH_PATH_MAX_LENGTH
    ) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide each edit.path as a non-empty bounded string.",
        ok: false
      };
    }

    if (
      typeof edit.oldText !== "string" ||
      typeof edit.newText !== "string"
    ) {
      return {
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        nextAction:
          "Provide each edit.oldText and edit.newText as strings.",
        ok: false
      };
    }

    if (edit.oldText.length === 0) {
      return {
        dataCode: "APPROVAL_PATCH_TEXT_EMPTY",
        nextAction:
          "Provide edit.oldText as a non-empty string.",
        ok: false
      };
    }

    if (
      edit.oldText.length > APPROVAL_PATCH_TEXT_MAX_LENGTH ||
      edit.newText.length > APPROVAL_PATCH_TEXT_MAX_LENGTH
    ) {
      return {
        dataCode: "APPROVAL_PATCH_TEXT_TOO_LONG",
        nextAction:
          `Provide each edit.oldText and edit.newText no longer than ${APPROVAL_PATCH_TEXT_MAX_LENGTH} characters.`,
        ok: false
      };
    }

    edits.push({
      newText: edit.newText,
      oldText: edit.oldText,
      path: edit.path
    });
  }

  const summaryValue = (value.input as { summary?: unknown }).summary;

  if (
    summaryValue !== undefined &&
    (typeof summaryValue !== "string" ||
      summaryValue.length > APPROVAL_PATCH_SUMMARY_MAX_LENGTH)
  ) {
    return {
      dataCode: "APPROVAL_PATCH_SUMMARY_TOO_LONG",
      nextAction:
        `Provide modifiedToolCall.input.summary as a string no longer than ${APPROVAL_PATCH_SUMMARY_MAX_LENGTH} characters when supplied.`,
      ok: false
    };
  }

  const toolCall: ApprovalApplyPatchToolCall = {
    input: {
      edits,
      ...(typeof summaryValue === "string" ? { summary: summaryValue } : {})
    },
    toolName: "apply_patch"
  };

  return { ok: true, value: toolCall };
}

interface ApprovalRespondParams {
  action: ApprovalRespondAction;
  approvalRequestId: string;
  modifiedRequest?: CommandPolicyRequest;
  modifiedToolCall?: ApprovalApplyPatchToolCall;
  reason?: string;
}

function readApprovalRespondParams(
  request: JsonRpcRequest,
  scoped: { cwd: string; params: Record<string, unknown> }
):
  | { ok: true; value: ApprovalRespondParams }
  | { ok: false; response: JsonRpcErrorResponse } {
  const params = scoped.params;
  const requestId = request.id ?? null;

  const idResult = readApprovalRespondId(params.approvalRequestId);

  if (!idResult.ok) {
    return {
      ok: false,
      response: createApprovalRespondErrorResponse({
        dataCode: idResult.dataCode,
        id: requestId,
        nextAction: idResult.nextAction
      })
    };
  }

  if (params.action === undefined) {
    return {
      ok: false,
      response: createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_ACTION_INVALID",
        id: requestId,
        nextAction:
          "Provide action as one of allow, deny, edit, timeout, or alwaysAllowForSession."
      })
    };
  }

  if (!isApprovalRespondAction(params.action)) {
    return {
      ok: false,
      response: createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_ACTION_INVALID",
        id: requestId,
        nextAction:
          "Provide action as one of allow, deny, edit, timeout, or alwaysAllowForSession."
      })
    };
  }

  const action = params.action;
  const reasonResult = readApprovalReason(params.reason);

  if (!reasonResult.ok) {
    return {
      ok: false,
      response: createApprovalRespondErrorResponse({
        dataCode: reasonResult.dataCode,
        id: requestId,
        nextAction: reasonResult.nextAction
      })
    };
  }

  const hasModifiedRequest = hasOwn(params, "modifiedRequest");
  const hasModifiedToolCall = hasOwn(params, "modifiedToolCall");

  if (action === "edit") {
    if (hasModifiedRequest === hasModifiedToolCall) {
      return {
        ok: false,
        response: createApprovalRespondErrorResponse({
          dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
          id: requestId,
          nextAction:
            "Provide exactly one of modifiedRequest or modifiedToolCall when action is edit."
        })
      };
    }

    if (hasModifiedRequest) {
      const modifiedRequest = readApprovalCommandRequest(
        params.modifiedRequest,
        scoped.cwd
      );

      if (!modifiedRequest.ok) {
        return {
          ok: false,
          response: createApprovalRespondErrorResponse({
            dataCode: modifiedRequest.dataCode,
            id: requestId,
            nextAction: modifiedRequest.nextAction
          })
        };
      }

      return {
        ok: true,
        value: {
          action,
          approvalRequestId: idResult.value,
          modifiedRequest: modifiedRequest.value,
          ...(reasonResult.value === undefined
            ? {}
            : { reason: reasonResult.value })
        }
      };
    }

    const modifiedToolCall = readApprovalPatchToolCall(params.modifiedToolCall);

    if (!modifiedToolCall.ok) {
      return {
        ok: false,
        response: createApprovalRespondErrorResponse({
          dataCode: modifiedToolCall.dataCode,
          id: requestId,
          nextAction: modifiedToolCall.nextAction
        })
      };
    }

    return {
      ok: true,
      value: {
        action,
        approvalRequestId: idResult.value,
        modifiedToolCall: modifiedToolCall.value,
        ...(reasonResult.value === undefined
          ? {}
          : { reason: reasonResult.value })
      }
    };
  }

  if (hasModifiedRequest || hasModifiedToolCall) {
    return {
      ok: false,
      response: createApprovalRespondErrorResponse({
        dataCode: "APPROVAL_EDIT_PAYLOAD_INVALID",
        id: requestId,
        nextAction:
          "Provide modifiedRequest or modifiedToolCall only when action is edit."
      })
    };
  }

  return {
    ok: true,
    value: {
      action,
      approvalRequestId: idResult.value,
      ...(reasonResult.value === undefined
        ? {}
        : { reason: reasonResult.value })
    }
  };
}

function buildRuntimeApprovalResponse(
  params: ApprovalRespondParams
): RuntimeApprovalResponse {
  switch (params.action) {
    case "allow":
    case "alwaysAllowForSession":
      return {
        action: params.action,
        approvalRequestId: params.approvalRequestId
      };
    case "deny":
      return {
        action: "deny",
        approvalRequestId: params.approvalRequestId,
        ...(params.reason === undefined ? {} : { reason: params.reason })
      };
    case "timeout":
      return {
        action: "timeout",
        approvalRequestId: params.approvalRequestId
      };
    case "edit":
      if (params.modifiedRequest !== undefined) {
        return {
          action: "edit",
          approvalRequestId: params.approvalRequestId,
          modifiedRequest: params.modifiedRequest,
          ...(params.reason === undefined ? {} : { reason: params.reason })
        };
      }

      return {
        action: "edit",
        approvalRequestId: params.approvalRequestId,
        modifiedToolCall: params.modifiedToolCall as ApprovalApplyPatchToolCall,
        ...(params.reason === undefined ? {} : { reason: params.reason })
      };
  }
}

interface ApprovalExecutionSummary {
  affectedFiles: string[];
  durationMs: number;
  status: "completed";
  summary: string;
  toolName: string;
}

function summarizeApprovalToolExecution(
  result: Record<string, unknown>
): ApprovalExecutionSummary {
  const affectedFiles = Array.isArray(result.affectedFiles)
    ? (result.affectedFiles as unknown[]).filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  const durationMs =
    typeof result.durationMs === "number" && Number.isFinite(result.durationMs)
      ? result.durationMs
      : 0;
  const summary =
    typeof result.summary === "string"
      ? result.summary
      : "Approved tool call completed.";
  const toolName =
    typeof result.toolName === "string" ? result.toolName : "unknown";

  return {
    affectedFiles,
    durationMs,
    status: "completed",
    summary,
    toolName
  };
}

async function handleApprovalRespond(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): Promise<JsonRpcResponse | undefined> {
  if (isNotification(request)) {
    return undefined;
  }

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const params = readApprovalRespondParams(request, scoped);

  if (!params.ok) {
    return params.response;
  }

  const requestId = request.id ?? null;
  const activeTask = runtime.getActiveTask();

  if (!activeTask.ok) {
    return createJsonRpcErrorResponse({
      code: -32603,
      dataCode: "NO_ACTIVE_TASK",
      id: requestId,
      message: "Approval response rejected (NO_ACTIVE_TASK).",
      nextAction:
        "Start or resume a task before responding to approval requests.",
      recoverable: false
    });
  }

  const runtimeResponse = buildRuntimeApprovalResponse(params.value);
  const result = await runtime.respondToApproval(runtimeResponse);

  if (!result.ok) {
    const code = readSafeErrorCode(result.error);

    if (code === "APPROVAL_DENIED") {
      return createJsonRpcSuccessResponse(requestId, {
        action: "deny",
        approvalRequestId: params.value.approvalRequestId,
        ...(params.value.reason === undefined
          ? {}
          : { reason: params.value.reason })
      });
    }

    if (code === "APPROVAL_TIMED_OUT") {
      return createJsonRpcSuccessResponse(requestId, {
        action: "timeout",
        approvalRequestId: params.value.approvalRequestId
      });
    }

    return createApprovalRespondRuntimeErrorResponse(requestId, result.error);
  }

  const execution = summarizeApprovalToolExecution(
    result.value as unknown as Record<string, unknown>
  );

  return createJsonRpcSuccessResponse(requestId, {
    action: params.value.action,
    approvalRequestId: params.value.approvalRequestId,
    execution
  });
}

function readTaskGetResultParams(
  request: JsonRpcRequest,
  scoped: { cwd: string }
):
  | { ok: true; value: { taskId: string | null } }
  | { ok: false; response: JsonRpcResponse } {
  if (!isRecord(request.params)) {
    return {
      ok: false,
      response: createJsonRpcErrorResponse({
        code: -32602,
        dataCode: "INVALID_PARAMS",
        id: request.id ?? null,
        message: "Invalid params.",
        nextAction: "Provide task.getResult params as an object with cwd and an optional taskId.",
        recoverable: true
      })
    };
  }

  if (request.params.taskId !== undefined) {
    if (
      typeof request.params.taskId !== "string" ||
      request.params.taskId.length === 0 ||
      !TASK_ID_PATTERN.test(request.params.taskId)
    ) {
      return {
        ok: false,
        response: createJsonRpcErrorResponse({
          code: -32602,
          dataCode: "TASK_ID_INVALID",
          id: request.id ?? null,
          message: "Invalid taskId.",
          nextAction:
            "Provide taskId as a non-empty string matching the task_ prefix pattern, or omit it for the active task.",
          recoverable: true
        })
      };
    }

    return {
      ok: true,
      value: { taskId: request.params.taskId }
    };
  }

  return { ok: true, value: { taskId: null } };
}

function readTaskLearningReviewParams(
  request: JsonRpcRequest,
  scoped: { cwd: string }
):
  | { ok: true; value: { taskId: string | null } }
  | { ok: false; response: JsonRpcResponse } {
  return readTaskGetResultParams(request, scoped);
}

function summarizeTaskGetResult(summary: FinalTaskSummary) {
  return {
    status: summary.status,
    result: summary.result,
    provider: summary.provider,
    model: summary.model,
    filesChanged: summary.filesChanged,
    filesProposedForChange: summary.filesProposedForChange,
    filesRead: summary.filesRead,
    unresolvedRisks: summary.unresolvedRisks,
    notAttempted: summary.notAttempted,
    importantEvents: summary.importantEvents.slice(
      0,
      TASK_RESULT_IMPORTANT_EVENTS_MAX_COUNT
    ),
    memoryInfluences: summary.memoryInfluences.slice(
      0,
      TASK_RESULT_INFLUENCES_MAX_COUNT
    ),
    skillInfluences: summary.skillInfluences.slice(
      0,
      TASK_RESULT_INFLUENCES_MAX_COUNT
    ),
    sessionId: summary.sessionId,
    taskId: summary.taskId,
    correlationId: summary.correlationId
  };
}

function summarizeLearningReviewArtifact(
  artifact: StoredLearningReviewArtifactResult
) {
  const limit = TASK_LEARNING_REVIEW_ITEMS_MAX_COUNT;

  const facts = Array.isArray(artifact.review.facts)
    ? artifact.review.facts
    : [];
  const lessons = Array.isArray(artifact.review.lessons)
    ? artifact.review.lessons
    : [];
  const mistakes = Array.isArray(artifact.review.mistakes)
    ? artifact.review.mistakes
    : [];
  const testGaps = Array.isArray(artifact.review.testGaps)
    ? artifact.review.testGaps
    : [];
  const memoryCandidates = Array.isArray(artifact.review.memoryCandidates)
    ? artifact.review.memoryCandidates
    : [];
  const skillSignals = Array.isArray(artifact.review.skillSignals)
    ? artifact.review.skillSignals
    : [];

  return {
    taskId: artifact.review.taskId,
    sessionId: artifact.review.sessionId,
    correlationId: artifact.review.correlationId,
    mode: artifact.review.mode,
    artifactPath: artifact.artifactPath,
    facts: facts.slice(0, limit),
    lessons: lessons.slice(0, limit),
    mistakes: mistakes.slice(0, limit),
    testGaps: testGaps.slice(0, limit),
    memoryCandidates: memoryCandidates.slice(0, limit),
    skillSignals: skillSignals.slice(0, limit),
    reuseEvidence: [],
    summary: artifact.review.summary,
    createdAt: artifact.review.createdAt
  };
}

async function handleTaskGetResult(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): Promise<JsonRpcResponse> {
  const requestId = request.id ?? null;

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const params = readTaskGetResultParams(request, scoped);

  if (!params.ok) {
    return params.response;
  }

  const activeTask = runtime.getActiveTask();

  if (!activeTask.ok) {
    return createJsonRpcErrorResponse({
      code: -32603,
      dataCode: "NO_ACTIVE_TASK",
      id: requestId,
      message: "No active task.",
      nextAction: "Start or resume a task before retrieving results.",
      recoverable: false
    });
  }

  const taskId = params.value.taskId ?? activeTask.value.taskId;

  if (taskId !== activeTask.value.taskId) {
    return createJsonRpcErrorResponse({
      code: -32602,
      dataCode: "TASK_NOT_FOUND",
      id: requestId,
      message: "Task not found.",
      nextAction:
        "Provide a valid taskId matching the active task, or omit taskId for the active task.",
      recoverable: true
    });
  }

  if (!TASK_TERMINAL_STATUSES.has(activeTask.value.status)) {
    return createJsonRpcErrorResponse({
      code: -32603,
      dataCode: "TASK_NOT_TERMINAL",
      id: requestId,
      message: "Task has not reached a terminal state.",
      nextAction:
        "Wait for the task to complete, fail, cancel, or reach its iteration limit before retrieving results.",
      recoverable: true
    });
  }

  const summary = createFinalTaskSummary(activeTask.value);

  return createJsonRpcSuccessResponse(
    requestId,
    summarizeTaskGetResult(summary)
  );
}

async function handleTaskLearningReview(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): Promise<JsonRpcResponse> {
  const requestId = request.id ?? null;

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const params = readTaskLearningReviewParams(request, scoped);

  if (!params.ok) {
    return params.response;
  }

  const activeTask = runtime.getActiveTask();

  if (!activeTask.ok) {
    return createJsonRpcErrorResponse({
      code: -32603,
      dataCode: "NO_ACTIVE_TASK",
      id: requestId,
      message: "No active task.",
      nextAction: "Start or resume a task before retrieving learning reviews.",
      recoverable: false
    });
  }

  const taskId = params.value.taskId ?? activeTask.value.taskId;

  if (taskId !== activeTask.value.taskId) {
    return createJsonRpcErrorResponse({
      code: -32602,
      dataCode: "TASK_NOT_FOUND",
      id: requestId,
      message: "Task not found.",
      nextAction:
        "Provide a valid taskId matching the active task, or omit taskId for the active task.",
      recoverable: true
    });
  }

  const artifacts = runtime.getLearningReviewArtifacts(scoped.cwd, {
    artifactLimit: TASK_LEARNING_REVIEW_ARTIFACT_LIMIT,
    sessionId: activeTask.value.sessionId,
    sessionLimit: TASK_LEARNING_REVIEW_SESSION_LIMIT
  });

  if (!artifacts.ok) {
    const code = readSafeErrorCode(artifacts.error);

    if (code === "SESSION_LEARNING_REVIEW_INVALID_READ_LIMIT") {
      return createJsonRpcErrorResponse({
        code: -32603,
        dataCode: "LEARNING_REVIEW_READ_FAILED",
        id: requestId,
        message: "Learning review retrieval limit is invalid.",
        nextAction: "Ensure read limits are positive integers and retry.",
        recoverable: true
      });
    }

    return createJsonRpcErrorResponse({
      code: -32603,
      dataCode: "LEARNING_REVIEW_READ_FAILED",
      id: requestId,
      message: "Failed to read learning review artifacts.",
      nextAction: "Ensure the session directory is readable and retry.",
      recoverable: true
    });
  }

  const match = artifacts.value.find(
    (entry) => entry.review.taskId === taskId
  );

  if (match === undefined) {
    return createJsonRpcErrorResponse({
      code: -32602,
      dataCode: "LEARNING_REVIEW_NOT_FOUND",
      id: requestId,
      message: "No learning review found for this task.",
      nextAction:
        "Learning reviews are generated for non-trivial completed tasks. Verify the task ID or ensure the task completed successfully.",
      recoverable: true
    });
  }

  return createJsonRpcSuccessResponse(
    requestId,
    summarizeLearningReviewArtifact(match)
  );
}

function summarizeProviderForState(
  bootstrap: ReturnType<JsonRpcRuntimeBridge["getBootstrapState"]>
): { providerName: string; model: string | null } | null {
  if (!bootstrap.ok || bootstrap.value.provider === null) {
    return null;
  }

  return {
    providerName: bootstrap.value.provider.providerName,
    model: bootstrap.value.provider.model ?? null
  };
}

function summarizeScopeForState(
  acceptedScopes: RuntimeTaskStartAcceptedScopes
): RuntimeGetStateScopeSummary {
  return {
    allowedTools: acceptedScopes.allowedTools,
    memoryScope: acceptedScopes.memoryScope,
    outputFormat: acceptedScopes.outputFormat,
    provider:
      acceptedScopes.provider === null
        ? null
        : {
            providerName: acceptedScopes.provider.providerName,
            model: acceptedScopes.provider.model ?? null
          },
    toolExecutionEnabled: acceptedScopes.toolExecutionEnabled
  };
}

const RUNTIME_GET_STATE_PARAM_KEYS = new Set(["cwd"]);

function validateRuntimeGetStateParams(
  request: JsonRpcRequest
): JsonRpcErrorResponse | null {
  if (!isRecord(request.params)) {
    return createJsonRpcErrorResponse({
      code: -32602,
      dataCode: "INVALID_PARAMS",
      id: request.id ?? null,
      message: "Invalid params.",
      nextAction: "Provide runtime.getState params as an object with cwd.",
      recoverable: true
    });
  }

  for (const key of Object.keys(request.params)) {
    if (!RUNTIME_GET_STATE_PARAM_KEYS.has(key)) {
      return createJsonRpcErrorResponse({
        code: -32602,
        dataCode: "INVALID_PARAMS",
        id: request.id ?? null,
        message: "Invalid params.",
        nextAction: "Remove unknown runtime.getState params and provide only cwd.",
        recoverable: true
      });
    }
  }

  return null;
}

function handleRuntimeGetState(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse {
  const requestId = request.id ?? null;
  const paramsError = validateRuntimeGetStateParams(request);

  if (paramsError !== null) {
    return paramsError;
  }

  const scoped = readScopedCwd(request, runtime);

  if (!scoped.ok) {
    return scoped.response;
  }

  const bootstrap = runtime.getBootstrapState();
  const activeTask = runtime.getActiveTask();
  const eventHistory = runtime.getEventHistory();
  const pendingApprovals = runtime.getPendingApprovals();

  const protocol = createProtocolMetadata(
    bootstrap.ok ? true : false
  );

  const provider = summarizeProviderForState(bootstrap);

  const session = activeTask.ok
    ? {
        sessionId: activeTask.value.sessionId,
        cwd: activeTask.value.request.cwd,
        status: activeTask.value.status,
        correlationId: activeTask.value.correlationId,
        taskId: activeTask.value.taskId,
        createdAt: activeTask.value.events?.[0]?.createdAt ?? null
      }
    : runtime.currentSession ?? null;

  const task = activeTask.ok
    ? {
        taskId: activeTask.value.taskId,
        status: activeTask.value.status,
        correlationId: activeTask.value.correlationId
      }
    : null;

  const scope = activeTask.ok
    ? runtime.currentScopes ?? {
        allowedTools: activeTask.value.request.allowedDefaults.allowedTools,
        memoryScope: {
          manual: true,
          procedural: true,
          working: true
        },
        outputFormat: activeTask.value.request.allowedDefaults.outputFormat,
        provider:
          activeTask.value.request.provider === null
            ? null
            : {
                providerName: activeTask.value.request.provider.providerName,
                model: activeTask.value.request.provider.model ?? null
              },
        toolExecutionEnabled:
          activeTask.value.request.allowedDefaults.toolExecutionEnabled
      }
    : runtime.currentScopes ?? null;

  const warnings: string[] = [];

  if (bootstrap.ok) {
    warnings.push(...bootstrap.value.warnings);
  }

  if (!activeTask.ok && session === null) {
    warnings.push(
      "No active session. Create a session or resume an existing one."
    );
  }

  return createJsonRpcSuccessResponse(requestId, {
    protocol,
    session,
    task,
    provider,
    scope,
    noActiveSession:
      session === null
        ? {
            code: "NO_ACTIVE_SESSION",
            recoverable: false,
            subsystem: "rpc"
          }
        : null,
    sandbox: {
      pendingApprovals:
        Array.isArray(pendingApprovals) ? pendingApprovals.length : 0,
      eventCount:
        Array.isArray(eventHistory) ? eventHistory.length : 0
    },
    warnings
  });
}

function handleJsonRpcRequest(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
):
  | JsonRpcResponse
  | Promise<JsonRpcResponse | undefined>
  | undefined {
  if (request.method === "rpc.ping") {
    return handleRpcPing(request, runtime);
  }

  if (request.method === "session.create") {
    return handleSessionCreate(request, runtime);
  }

  if (request.method === "session.resume") {
    return handleSessionResume(request, runtime);
  }

  if (request.method === "task.start") {
    return handleTaskStart(request, runtime);
  }

  if (request.method === "approval.respond") {
    if (isNotification(request)) {
      return undefined;
    }

    return handleApprovalRespond(request, runtime);
  }

  if (request.method === "task.getResult") {
    if (isNotification(request)) {
      return undefined;
    }

    return handleTaskGetResult(request, runtime);
  }

  if (request.method === "task.learningReview") {
    if (isNotification(request)) {
      return undefined;
    }

    return handleTaskLearningReview(request, runtime);
  }

  if (request.method === "runtime.getState") {
    if (isNotification(request)) {
      return undefined;
    }

    return handleRuntimeGetState(request, runtime);
  }

  return isNotification(request)
    ? undefined
    : createJsonRpcErrorResponse({
        code: -32601,
        id: request.id,
        message: "Method not found.",
        nextAction:
          "Use rpc.ping, session.create, session.resume, task.start, event.subscribe, event.unsubscribe, approval.respond, task.getResult, task.learningReview, or runtime.getState."
      });
}

export function handleJsonRpcMessage(
  message: unknown,
  options: JsonRpcHandlerOptions
):
  | JsonRpcResponse
  | JsonRpcResponse[]
  | Promise<JsonRpcResponse | JsonRpcResponse[] | undefined>
  | undefined {
  if (Array.isArray(message)) {
    if (message.length === 0) {
      return createJsonRpcErrorResponse({
        code: -32600,
        message: "Invalid JSON-RPC batch request.",
        nextAction: "Send a non-empty batch or a single JSON-RPC request."
      });
    }

    const itemResponses = message.map((item) =>
      handleJsonRpcMessage(item, options)
    );
    const hasAsync = itemResponses.some(
      (response) => response instanceof Promise
    );

    if (!hasAsync) {
      const responses = (
        itemResponses as Array<
          JsonRpcResponse | JsonRpcResponse[] | undefined
        >
      ).flatMap((response) => {
        if (response === undefined) {
          return [];
        }

        return Array.isArray(response) ? response : [response];
      });

      return responses.length === 0 ? undefined : responses;
    }

    return Promise.all(
      itemResponses.map((response) => Promise.resolve(response))
    ).then((awaited) => {
      const responses = awaited.flatMap((response) => {
        if (response === undefined) {
          return [];
        }

        return Array.isArray(response) ? response : [response];
      });

      return responses.length === 0 ? undefined : responses;
    });
  }

  const parsed = parseJsonRpcRequest(message);

  if (!parsed.ok) {
    return parsed.response;
  }

  return handleJsonRpcRequest(parsed.request, options.runtime);
}

interface ServerMessageHandlingResult {
  afterResponse: JsonRpcNotification[];
  response?: JsonRpcResponse | JsonRpcResponse[];
}

async function handleJsonRpcServerMessage(
  message: unknown,
  options: JsonRpcHandlerOptions,
  subscriptions: EventSubscriptionRegistry
): Promise<ServerMessageHandlingResult> {
  if (Array.isArray(message)) {
    if (message.length === 0) {
      return {
        afterResponse: [],
        response: createJsonRpcErrorResponse({
          code: -32600,
          message: "Invalid JSON-RPC batch request.",
          nextAction: "Send a non-empty batch or a single JSON-RPC request."
        })
      };
    }

    const responses: JsonRpcResponse[] = [];
    const afterResponse: JsonRpcNotification[] = [];

    for (const item of message) {
      const handled = await handleJsonRpcServerMessage(
        item,
        options,
        subscriptions
      );

      if (handled.response !== undefined) {
        responses.push(
          ...(Array.isArray(handled.response)
            ? handled.response
            : [handled.response])
        );
      }

      afterResponse.push(...handled.afterResponse);
    }

    return {
      afterResponse,
      ...(responses.length === 0 ? {} : { response: responses })
    };
  }

  const parsed = parseJsonRpcRequest(message);

  if (!parsed.ok) {
    return { afterResponse: [], response: parsed.response };
  }

  if (parsed.request.method === "event.subscribe") {
    return {
      afterResponse: [],
      ...subscriptions.subscribe(parsed.request)
    };
  }

  if (parsed.request.method === "event.unsubscribe") {
    return {
      afterResponse: [],
      ...subscriptions.unsubscribe(parsed.request)
    };
  }

  const response = await Promise.resolve(
    handleJsonRpcRequest(parsed.request, options.runtime)
  );

  return {
    afterResponse: [],
    ...(response === undefined ? {} : { response })
  };
}

function createParseErrorResponse(): JsonRpcErrorResponse {
  return createJsonRpcErrorResponse({
    code: -32700,
    message: "Parse error.",
    nextAction: "Send one complete JSON-RPC JSON object per line."
  });
}

function writeJsonRpcPayload(
  output: Writable,
  payload: JsonRpcMessage | JsonRpcResponse[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    output.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (error instanceof Error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function* readStrictLfLines(input: Readable): AsyncGenerator<string> {
  let buffer = "";

  for await (const chunk of input) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);

    let lineBreakIndex = buffer.indexOf("\n");

    while (lineBreakIndex !== -1) {
      const line = buffer.slice(0, lineBreakIndex);
      buffer = buffer.slice(lineBreakIndex + 1);

      yield line.endsWith("\r") ? line.slice(0, -1) : line;
      lineBreakIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.length > 0) {
    yield buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
  }
}

export async function runJsonRpcStdioServer(
  options: JsonRpcStdioServerOptions
): Promise<void> {
  const writer = createQueuedJsonRpcWriter(options.output);
  const subscriptions = new EventSubscriptionRegistry(
    options.runtime,
    writer.write
  );

  try {
    if (options.emitReady !== false) {
      await writer.write(createRpcReadyNotification(options.runtime));
    }

    for await (const line of readStrictLfLines(options.input)) {
      if (line.trim().length === 0) {
        continue;
      }

      let message: unknown;

      try {
        message = JSON.parse(line);
      } catch {
        await writer.write(createParseErrorResponse());
        continue;
      }

      subscriptions.beginNotificationBuffer();
      let handled: ServerMessageHandlingResult;
      let liveNotifications: JsonRpcNotification[] = [];

      try {
        handled = await handleJsonRpcServerMessage(
          message,
          {
            runtime: options.runtime
          },
          subscriptions
        );
      } finally {
        liveNotifications = subscriptions.endNotificationBuffer();
      }

      if (handled.response !== undefined) {
        await writer.write(handled.response);
      }

      for (const notification of handled.afterResponse) {
        await writer.write(notification);
      }

      for (const notification of liveNotifications) {
        await writer.write(notification);
      }
    }
  } finally {
    subscriptions.disposeAll();
    await writer.drain();
  }
}
