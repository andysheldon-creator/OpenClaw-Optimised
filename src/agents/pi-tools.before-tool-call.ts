import type { AnyAgentTool } from "./tools/common.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { isPlainObject } from "../utils.js";
import { normalizeToolName } from "./tool-policy.js";

type HookContext = {
  agentId?: string;
  sessionKey?: string;
};

type HookOutcome = { blocked: true; reason: string } | { blocked: false; params: unknown };

type AfterToolCallOutcome =
  | { modified: true; result: unknown }
  | { modified: false; result: unknown };

const log = createSubsystemLogger("agents/tools");

export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<HookOutcome> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_tool_call")) {
    return { blocked: false, params: args.params };
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  const params = args.params;
  try {
    const normalizedParams = isPlainObject(params) ? params : {};
    const hookResult = await hookRunner.runBeforeToolCall(
      {
        toolName,
        params: normalizedParams,
      },
      {
        toolName,
        agentId: args.ctx?.agentId,
        sessionKey: args.ctx?.sessionKey,
      },
    );

    if (hookResult?.block) {
      return {
        blocked: true,
        reason: hookResult.blockReason || "Tool call blocked by plugin hook",
      };
    }

    if (hookResult?.params && isPlainObject(hookResult.params)) {
      if (isPlainObject(params)) {
        return { blocked: false, params: { ...params, ...hookResult.params } };
      }
      return { blocked: false, params: hookResult.params };
    }
  } catch (err) {
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    log.warn(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(err)}`);
  }

  return { blocked: false, params };
}

export async function runAfterToolCallHook(args: {
  toolName: string;
  params: unknown;
  result: unknown;
  error?: string;
  durationMs?: number;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<AfterToolCallOutcome> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("after_tool_call")) {
    return { modified: false, result: args.result };
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  try {
    const normalizedParams = isPlainObject(args.params) ? args.params : {};
    const hookResult = await hookRunner.runAfterToolCall(
      {
        toolName,
        params: normalizedParams,
        result: args.result,
        error: args.error,
        durationMs: args.durationMs,
      },
      {
        toolName,
        agentId: args.ctx?.agentId,
        sessionKey: args.ctx?.sessionKey,
      },
    );

    if (hookResult?.block) {
      const reason = hookResult.blockReason || "Tool result blocked by plugin hook";
      return {
        modified: true,
        result: { content: [{ type: "text", text: `[BLOCKED] ${reason}` }] },
      };
    }

    if (hookResult?.result !== undefined) {
      return { modified: true, result: hookResult.result };
    }
  } catch (err) {
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    log.warn(`after_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(err)}`);
  }

  return { modified: false, result: args.result };
}

export function wrapToolWithHooks(tool: AnyAgentTool, ctx?: HookContext): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  const toolName = tool.name || "tool";
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Before hook (existing)
      const beforeOutcome = await runBeforeToolCallHook({
        toolName,
        params,
        toolCallId,
        ctx,
      });
      if (beforeOutcome.blocked) {
        throw new Error(beforeOutcome.reason);
      }

      // Execute tool and measure duration
      const startTime = Date.now();
      let result: unknown;
      let error: string | undefined;
      try {
        result = await execute(toolCallId, beforeOutcome.params, signal, onUpdate);
      } catch (err) {
        error = String(err);
        // Run after hook for observability even on error, but don't modify
        const durationMs = Date.now() - startTime;
        void runAfterToolCallHook({
          toolName,
          params: beforeOutcome.params,
          result: undefined,
          error,
          durationMs,
          toolCallId,
          ctx,
        });
        throw err;
      }

      // After hook — may modify or block the result
      const durationMs = Date.now() - startTime;
      const afterOutcome = await runAfterToolCallHook({
        toolName,
        params: beforeOutcome.params,
        result,
        durationMs,
        toolCallId,
        ctx,
      });

      return afterOutcome.modified ? afterOutcome.result : result;
    },
  };
}

/** @deprecated Use wrapToolWithHooks instead */
export const wrapToolWithBeforeToolCallHook = wrapToolWithHooks;

export const __testing = {
  runBeforeToolCallHook,
  runAfterToolCallHook,
  isPlainObject,
};
