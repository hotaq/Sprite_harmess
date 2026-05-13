import type { AgentRuntime } from "@sprite/core";
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
  getBootstrapState: AgentRuntime["getBootstrapState"];
  getEventHistory: AgentRuntime["getEventHistory"];
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
    capabilities: ["rpc.ping"],
    protocolVersion: JSON_RPC_VERSION,
    runtimeConnected,
    server: RPC_SERVER_NAME,
    transport: RPC_TRANSPORT
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

function handleJsonRpcRequest(
  request: JsonRpcRequest,
  runtime: JsonRpcRuntimeBridge
): JsonRpcResponse | undefined {
  if (request.method === "rpc.ping") {
    return handleRpcPing(request, runtime);
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
