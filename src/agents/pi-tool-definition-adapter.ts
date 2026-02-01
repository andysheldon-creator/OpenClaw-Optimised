import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ClientToolDefinition } from "./pi-embedded-runner/run/params.js";
import { getGlobalInterceptorRegistry } from "../interceptors/global.js";
import { trigger } from "../interceptors/trigger.js";
import { logDebug, logError } from "../logger.js";
import { normalizeToolName } from "./tool-policy.js";
import { jsonResult } from "./tools/common.js";

// biome-ignore lint/suspicious/noExplicitAny: TypeBox schema type from pi-agent-core uses a different module instance.
type AnyAgentTool = AgentTool<any, unknown>;

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

export function toToolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const name = tool.name || "tool";
    const normalizedName = normalizeToolName(name);
    return {
      name,
      label: tool.label ?? name,
      description: tool.description ?? "",
      // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema from pi-agent-core uses a different module instance.
      parameters: tool.parameters,
      execute: async (
        toolCallId,
        params,
        onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        _ctx,
        signal,
      ): Promise<AgentToolResult<unknown>> => {
        // KNOWN: pi-coding-agent `ToolDefinition.execute` has a different signature/order
        // than pi-agent-core `AgentTool.execute`. This adapter keeps our existing tools intact.
        const registry = getGlobalInterceptorRegistry();

        // --- tool.before ---
        let effectiveParams = params;
        if (registry) {
          const beforeOutput = await trigger(
            registry,
            "tool.before",
            { toolName: normalizedName, toolCallId },
            { args: params as Record<string, unknown> },
          );
          if (beforeOutput.block) {
            return jsonResult({
              status: "blocked",
              tool: normalizedName,
              reason: beforeOutput.blockReason ?? "Blocked by interceptor",
            });
          }
          effectiveParams = beforeOutput.args;
        }

        // --- original execute ---
        let result: AgentToolResult<unknown>;
        try {
          result = await tool.execute(toolCallId, effectiveParams, signal, onUpdate);
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
          if (described.stack && described.stack !== described.message) {
            logDebug(`tools: ${normalizedName} failed stack:\n${described.stack}`);
          }
          logError(`[tools] ${normalizedName} failed: ${described.message}`);
          let errorResult: AgentToolResult<unknown> = jsonResult({
            status: "error",
            tool: normalizedName,
            error: described.message,
          });
          if (registry) {
            const afterOutput = await trigger(
              registry,
              "tool.after",
              { toolName: normalizedName, toolCallId, isError: true },
              { result: errorResult },
            );
            errorResult = afterOutput.result;
          }
          return errorResult;
        }

        // --- tool.after ---
        if (registry) {
          const afterOutput = await trigger(
            registry,
            "tool.after",
            { toolName: normalizedName, toolCallId, isError: false },
            { result },
          );
          result = afterOutput.result;
        }

        return result;
      },
    } satisfies ToolDefinition;
  });
}

// Convert client tools (OpenResponses hosted tools) to ToolDefinition format
// These tools are intercepted to return a "pending" result instead of executing
export function toClientToolDefinitions(
  tools: ClientToolDefinition[],
  onClientToolCall?: (toolName: string, params: Record<string, unknown>) => void,
): ToolDefinition[] {
  return tools.map((tool) => {
    const func = tool.function;
    return {
      name: func.name,
      label: func.name,
      description: func.description ?? "",
      parameters: func.parameters as any,
      execute: async (
        toolCallId,
        params,
        _onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        _ctx,
        _signal,
      ): Promise<AgentToolResult<unknown>> => {
        // Notify handler that a client tool was called
        if (onClientToolCall) {
          onClientToolCall(func.name, params as Record<string, unknown>);
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
