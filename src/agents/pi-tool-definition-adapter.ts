import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ClientToolDefinition } from "./pi-embedded-runner/run/params.js";
import { logDebug, logError, logWarn } from "../logger.js";
import { runBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
import { normalizeToolParams, normalizeToolParamsFromSchema } from "./pi-tools.read.js";
import { normalizeToolName } from "./tool-policy.js";
import { jsonResult } from "./tools/common.js";

// oxlint-disable-next-line typescript/no-explicit-any
type AnyAgentTool = AgentTool<any, unknown>;

type ToolExecuteArgsCurrent = [
  string,
  unknown,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
  AbortSignal | undefined,
];
type ToolExecuteArgsLegacy = [
  string,
  unknown,
  AbortSignal | undefined,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
];
type ToolExecuteArgs = ToolDefinition["execute"] extends (...args: infer P) => unknown
  ? P
  : ToolExecuteArgsCurrent;
type ToolExecuteArgsAny = ToolExecuteArgs | ToolExecuteArgsLegacy | ToolExecuteArgsCurrent;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object" && value !== null && "aborted" in value;
}

function isLegacyToolExecuteArgs(args: ToolExecuteArgsAny): args is ToolExecuteArgsLegacy {
  const third = args[2];
  const fourth = args[3];
  return isAbortSignal(third) || typeof fourth === "function";
}

function describeToolExecutionError(err: unknown): {
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    const message = err.message?.trim() ? err.message : String(err);
    return { message, stack: err.stack };
  }
  return { message: String(err) };
}

function splitToolExecuteArgs(args: ToolExecuteArgsAny): {
  toolCallId: string;
  params: unknown;
  onUpdate: AgentToolUpdateCallback<unknown> | undefined;
  signal: AbortSignal | undefined;
} {
  if (isLegacyToolExecuteArgs(args)) {
    const [toolCallId, params, signal, onUpdate] = args;
    return {
      toolCallId,
      params,
      onUpdate,
      signal,
    };
  }
  const [toolCallId, params, onUpdate, _ctx, signal] = args;
  return {
    toolCallId,
    params,
    onUpdate,
    signal,
  };
}

export function toToolDefinitions(
  tools: AnyAgentTool[],
  _options?: {
    modelProvider?: string;
    modelId?: string;
  },
): ToolDefinition[] {
  return tools.map((tool) => {
    const originalName = tool.name || "tool";
    const exposedName = originalName;
    const normalizedName = normalizeToolName(originalName);
    return {
      name: exposedName,
      label: tool.label ?? originalName,
      description: tool.description ?? "",
      parameters: tool.parameters,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        const { toolCallId, params, onUpdate, signal } = splitToolExecuteArgs(args);

        // --- Diagnostic logging: log raw params for every tool call ---
        const rawParamsJson = JSON.stringify(params);
        const rawKeys =
          params && typeof params === "object" && !Array.isArray(params)
            ? Object.keys(params as Record<string, unknown>)
            : [];
        if (rawKeys.length === 0) {
          logWarn(`[tool-exec] ⚠ "${normalizedName}" received EMPTY params: ${rawParamsJson}`);
        } else {
          logDebug(
            `[tool-exec] "${normalizedName}" raw params (keys: ${rawKeys.join(", ")}): ${rawParamsJson.slice(0, 300)}`,
          );
        }

        // Normalize parameters before execution using schema-based normalization
        // This extracts aliases from the tool schema automatically
        const normalizedParams =
          normalizeToolParamsFromSchema(params, tool.parameters, tool) ??
          normalizeToolParams(params) ??
          params;

        // Log if normalization changed anything
        const normalizedJson = JSON.stringify(normalizedParams);
        if (normalizedJson !== rawParamsJson) {
          logDebug(
            `[tool-exec] "${normalizedName}" params after normalization: ${normalizedJson.slice(0, 300)}`,
          );
        }

        try {
          // Always execute using the original OpenClaw tool name
          return await tool.execute(toolCallId, normalizedParams, signal, onUpdate);
        } catch (err) {
          if (signal?.aborted) {
            throw err;
          }
          const name =
            err && typeof err === "object" && "name" in err
              ? String((err as { name?: unknown }).name)
              : "";
          if (name === "AbortError") {
            throw err;
          }
          const described = describeToolExecutionError(err);
          // Check if this is a validation error that we might be able to fix
          const isValidationError =
            described.message.includes("Validation failed") ||
            described.message.includes("must have required property") ||
            described.message.includes("must NOT have additional properties");
          // If normalization didn't help and it's a validation error, log a warning
          // The error will be returned to the model for retry
          if (isValidationError && normalizedParams !== params) {
            logWarn(
              `[tools] ${normalizedName} validation failed even after normalization. Original params: ${JSON.stringify(params)}, Normalized: ${JSON.stringify(normalizedParams)}`,
            );
          }
          if (described.stack && described.stack !== described.message) {
            logDebug(`tools: ${normalizedName} failed stack:\n${described.stack}`);
          }
          logError(`[tools] ${normalizedName} failed: ${described.message}`);
          return jsonResult({
            status: "error",
            tool: normalizedName,
            error: described.message,
          });
        }
      },
    } satisfies ToolDefinition;
  });
}

// Convert client tools (OpenResponses hosted tools) to ToolDefinition format
// These tools are intercepted to return a "pending" result instead of executing
export function toClientToolDefinitions(
  tools: ClientToolDefinition[],
  onClientToolCall?: (toolName: string, params: Record<string, unknown>) => void,
  hookContext?: { agentId?: string; sessionKey?: string },
): ToolDefinition[] {
  return tools.map((tool) => {
    const func = tool.function;
    return {
      name: func.name,
      label: func.name,
      description: func.description ?? "",
      // oxlint-disable-next-line typescript/no-explicit-any
      parameters: func.parameters as any,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        const { toolCallId, params } = splitToolExecuteArgs(args);
        const outcome = await runBeforeToolCallHook({
          toolName: func.name,
          params,
          toolCallId,
          ctx: hookContext,
        });
        if (outcome.blocked) {
          throw new Error(outcome.reason);
        }
        const adjustedParams = outcome.params;
        const paramsRecord = isPlainObject(adjustedParams) ? adjustedParams : {};
        // Notify handler that a client tool was called
        if (onClientToolCall) {
          onClientToolCall(func.name, paramsRecord);
        }
        // Return a pending result - the client will execute this tool
        return jsonResult({
          status: "pending",
          tool: func.name,
          message: "Tool execution delegated to client",
        });
      },
    } satisfies ToolDefinition;
  });
}
