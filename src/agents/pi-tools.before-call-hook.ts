/**
 * Tool wrapper that invokes the before_tool_call plugin hook.
 *
 * This wrapper intercepts tool execution to allow plugins to:
 * - Validate and audit tool calls before execution
 * - Modify tool parameters
 * - Block tool execution with a custom reason
 */

import type { HookRunner } from "../plugins/hooks.js";
import type { PluginHookToolContext } from "../plugins/hooks.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

export interface BeforeCallHookContext {
  hookRunner: HookRunner;
  agentId?: string;
  sessionKey?: string;
}

/**
 * Wraps a tool to invoke the before_tool_call hook before execution.
 *
 * If the hook returns `block: true`, the tool execution is skipped and
 * an error message is returned instead.
 *
 * If the hook returns modified `params`, those are passed to the actual
 * tool execute function.
 */
export function wrapToolWithBeforeCallHook(
  tool: AnyAgentTool,
  ctx: BeforeCallHookContext,
): AnyAgentTool {
  const { hookRunner, agentId, sessionKey } = ctx;
  const execute = tool.execute;

  // If no execute function or no hooks registered, return tool unchanged
  if (!execute || !hookRunner.hasHooks("before_tool_call")) {
    return tool;
  }

  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const toolName = tool.name;

      // Build hook context
      const hookCtx: PluginHookToolContext = {
        agentId,
        sessionKey,
        toolName,
        toolCallId,
      };

      // Run the before_tool_call hook
      const hookResult = await hookRunner.runBeforeToolCall(
        {
          toolName,
          toolCallId,
          params: params as Record<string, unknown>,
        },
        hookCtx,
      );

      // Check if the hook blocked the tool call
      if (hookResult?.block) {
        const reason = hookResult.blockReason ?? "Tool call blocked by policy";
        // Return a structured error that the agent can understand
        return {
          type: "text" as const,
          text: `Error: ${reason}`,
        };
      }

      // Use modified params if provided, otherwise use original
      const effectiveParams = hookResult?.params ?? params;

      // Execute the actual tool
      return await execute(toolCallId, effectiveParams, signal, onUpdate);
    },
  };
}

/**
 * Wraps all tools in the array with the before_tool_call hook.
 */
export function wrapToolsWithBeforeCallHook(
  tools: AnyAgentTool[],
  ctx: BeforeCallHookContext,
): AnyAgentTool[] {
  return tools.map((tool) => wrapToolWithBeforeCallHook(tool, ctx));
}
