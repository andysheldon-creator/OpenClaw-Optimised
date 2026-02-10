import type { AnyAgentTool } from "./tools/common.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { isPluginHookExecutionError } from "../plugins/hooks.js";
import { normalizeToolName } from "./tool-policy.js";

type HookContext = {
  agentId?: string;
  sessionKey?: string;
};

type HookOutcome = { blocked: true; reason: string } | { blocked: false; params: unknown };

const log = createSubsystemLogger("agents/tools");

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    if (isPluginHookExecutionError(err) && err.failClosed) {
      throw err;
    }
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    log.warn(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(err)}`);
  }

  return { blocked: false, params };
}

export async function runAfterToolCallHook(args: {
  toolName: string;
  params: unknown;
  result?: unknown;
  error?: string;
  durationMs?: number;
  ctx?: HookContext;
}): Promise<void> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("after_tool_call")) {
    return;
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  const params = isPlainObject(args.params) ? args.params : {};
  try {
    await hookRunner.runAfterToolCall(
      {
        toolName,
        params,
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
  } catch (err) {
    log.warn(`after_tool_call hook failed: tool=${toolName} error=${String(err)}`);
  }
}

export async function runToolErrorHook(args: {
  toolName: string;
  params: unknown;
  error: string;
  durationMs?: number;
  ctx?: HookContext;
}): Promise<void> {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("tool_error")) {
    return;
  }

  const toolName = normalizeToolName(args.toolName || "tool");
  const params = isPlainObject(args.params) ? args.params : {};
  try {
    await hookRunner.runToolError(
      {
        toolName,
        params,
        error: args.error,
        durationMs: args.durationMs,
      },
      {
        toolName,
        agentId: args.ctx?.agentId,
        sessionKey: args.ctx?.sessionKey,
      },
    );
  } catch (err) {
    log.warn(`tool_error hook failed: tool=${toolName} error=${String(err)}`);
  }
}

export function wrapToolWithBeforeToolCallHook(
  tool: AnyAgentTool,
  ctx?: HookContext,
): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  const toolName = tool.name || "tool";
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const startedAt = Date.now();
      const outcome = await runBeforeToolCallHook({
        toolName,
        params,
        toolCallId,
        ctx,
      });
      if (outcome.blocked) {
        throw new Error(outcome.reason);
      }
      const effectiveParams = outcome.params;
      try {
        const result = await execute(toolCallId, effectiveParams, signal, onUpdate);
        await runAfterToolCallHook({
          toolName,
          params: effectiveParams,
          result,
          durationMs: Date.now() - startedAt,
          ctx,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await runToolErrorHook({
          toolName,
          params: effectiveParams,
          error: message,
          durationMs: Date.now() - startedAt,
          ctx,
        });
        await runAfterToolCallHook({
          toolName,
          params: effectiveParams,
          error: message,
          durationMs: Date.now() - startedAt,
          ctx,
        });
        throw err;
      }
    },
  };
}

export const __testing = {
  runBeforeToolCallHook,
  runAfterToolCallHook,
  runToolErrorHook,
  isPlainObject,
};
