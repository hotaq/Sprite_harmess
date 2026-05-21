import {
  RUNTIME_EVENT_TYPES,
  type AgentRuntime,
  type RuntimeEventRecord,
  type RuntimeEventType
} from "@sprite/core";
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

export interface JsonRpcRuntimeBridge {
  createSession: AgentRuntime["createSession"];
  getBootstrapState: AgentRuntime["getBootstrapState"];
  getEventHistory: AgentRuntime["getEventHistory"];
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
  "event.unsubscribe"
] as const;
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

function handleJsonRpcRequest(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
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

  return isNotification(request)
    ? undefined
    : createJsonRpcErrorResponse({
        code: -32601,
        id: request.id,
        message: "Method not found.",
        nextAction:
          "Use rpc.ping, session.create, session.resume, task.start, event.subscribe, or event.unsubscribe."
      });
}

export function handleJsonRpcMessage(
  message: unknown,
  options: JsonRpcHandlerOptions
): JsonRpcResponse | JsonRpcResponse[] | undefined {
  if (Array.isArray(message)) {
    if (message.length === 0) {
      return createJsonRpcErrorResponse({
        code: -32600,
        message: "Invalid JSON-RPC batch request.",
        nextAction: "Send a non-empty batch or a single JSON-RPC request."
      });
    }

    const responses = message.flatMap((item) => {
      const response = handleJsonRpcMessage(item, options);

      if (response === undefined) {
        return [];
      }

      return Array.isArray(response) ? response : [response];
    });

    return responses.length === 0 ? undefined : responses;
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

function handleJsonRpcServerMessage(
  message: unknown,
  options: JsonRpcHandlerOptions,
  subscriptions: EventSubscriptionRegistry
): ServerMessageHandlingResult {
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
      const handled = handleJsonRpcServerMessage(
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

  return {
    afterResponse: [],
    response: handleJsonRpcRequest(parsed.request, options.runtime)
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
        handled = handleJsonRpcServerMessage(
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
