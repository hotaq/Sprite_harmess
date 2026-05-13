import type { AgentRuntime } from "@sprite/core";
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
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

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
  id?: JsonRpcId;
  message: string;
  nextAction: string;
  recoverable?: boolean;
}): JsonRpcErrorResponse {
  return {
    error: {
      code: options.code,
      data: {
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
    capabilities: ["rpc.ping", "session.create", "session.resume"],
    protocolVersion: JSON_RPC_VERSION,
    runtimeConnected,
    server: RPC_SERVER_NAME,
    transport: RPC_TRANSPORT
  };
}

function createInvalidParamsResponse(
  id: JsonRpcId,
  nextAction: string
): JsonRpcErrorResponse {
  return createJsonRpcErrorResponse({
    code: -32602,
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

function readParamsRecord(
  request: JsonRpcRequest
): { ok: true; params: Record<string, unknown> } | { ok: false; response: JsonRpcErrorResponse } {
  if (!isRecord(request.params)) {
    return {
      ok: false,
      response: createInvalidParamsResponse(
        request.id ?? null,
        "Send params as an object with the required session fields."
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
    `${key} must be an object when provided.`
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
        "Provide cwd as a non-empty string."
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
        "Requested cwd must exist and be readable."
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
        "Requested cwd is outside the current RPC runtime scope."
      )
    };
  }

  return {
    cwd: runtimeCwd,
    ok: true,
    params: params.params
  };
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

function parseJsonRpcRequest(value: unknown):
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
      "Provide sessionId as a non-empty string."
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

  return isNotification(request)
    ? undefined
    : createJsonRpcErrorResponse({
        code: -32601,
        id: request.id,
        message: "Method not found.",
        nextAction: "Use rpc.ping or wait for later RPC stories to add methods."
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
  if (options.emitReady !== false) {
    await writeJsonRpcPayload(
      options.output,
      createRpcReadyNotification(options.runtime)
    );
  }

  for await (const line of readStrictLfLines(options.input)) {
    if (line.trim().length === 0) {
      continue;
    }

    let message: unknown;

    try {
      message = JSON.parse(line);
    } catch {
      await writeJsonRpcPayload(options.output, createParseErrorResponse());
      continue;
    }

    const response = handleJsonRpcMessage(message, {
      runtime: options.runtime
    });

    if (response !== undefined) {
      await writeJsonRpcPayload(options.output, response);
    }
  }
}
