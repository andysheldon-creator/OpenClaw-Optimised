import crypto from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import type { ExecutionRequest, ExecutionResult } from "../../execution/types.js";
import type { TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import type { GetReplyOptions } from "../types.js";
import type { FollowupRun } from "./queue.js";
import { resolveAgentModelFallbacksOverride } from "../../agents/agent-scope.js";
import { hasConfiguredModelFallback, runWithModelFallback } from "../../agents/model-fallback.js";
import { isCliProvider } from "../../agents/model-selection.js";
import { resolveSandboxConfigForAgent, resolveSandboxRuntimeStatus } from "../../agents/sandbox.js";
import {
  resolveAgentIdFromSessionKey,
  type SessionEntry,
  updateSessionStoreEntry,
} from "../../config/sessions.js";
import { createDefaultExecutionKernel } from "../../execution/kernel.js";
import { logVerbose } from "../../globals.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import { memLog } from "../../memory/memory-log.js";
import { buildThreadingToolContext, resolveEnforceFinalTag } from "./agent-runner-utils.js";
import {
  resolveMemoryFlushContextWindowTokens,
  resolveMemoryFlushSettings,
  shouldRunMemoryFlush,
} from "./memory-flush.js";
import { incrementCompactionCount } from "./session-updates.js";

export async function runMemoryFlushIfNeeded(params: {
  cfg: OpenClawConfig;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  opts?: GetReplyOptions;
  defaultModel: string;
  agentCfgContextTokens?: number;
  resolvedVerboseLevel: VerboseLevel;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  isHeartbeat: boolean;
}): Promise<SessionEntry | undefined> {
  const memoryFlushSettings = resolveMemoryFlushSettings(params.cfg);
  if (!memoryFlushSettings) {
    return params.sessionEntry;
  }

  const memoryFlushWritable = (() => {
    if (!params.sessionKey) {
      return true;
    }
    const runtime = resolveSandboxRuntimeStatus({
      cfg: params.cfg,
      sessionKey: params.sessionKey,
    });
    if (!runtime.sandboxed) {
      return true;
    }
    const sandboxCfg = resolveSandboxConfigForAgent(params.cfg, runtime.agentId);
    return sandboxCfg.workspaceAccess === "rw";
  })();

  const shouldFlushMemory =
    memoryFlushSettings &&
    memoryFlushWritable &&
    !params.isHeartbeat &&
    !isCliProvider(params.followupRun.run.provider, params.cfg) &&
    shouldRunMemoryFlush({
      entry:
        params.sessionEntry ??
        (params.sessionKey ? params.sessionStore?.[params.sessionKey] : undefined),
      contextWindowTokens: resolveMemoryFlushContextWindowTokens({
        modelId: params.followupRun.run.model ?? params.defaultModel,
        agentCfgContextTokens: params.agentCfgContextTokens,
      }),
      reserveTokensFloor: memoryFlushSettings.reserveTokensFloor,
      softThresholdTokens: memoryFlushSettings.softThresholdTokens,
    });

  memLog.trace("runMemoryFlushIfNeeded: decision", {
    shouldFlush: shouldFlushMemory,
    writable: memoryFlushWritable,
    isHeartbeat: params.isHeartbeat,
    sessionKey: params.sessionKey,
    totalTokens: params.sessionEntry?.totalTokens,
    compactionCount: params.sessionEntry?.compactionCount,
  });

  if (!shouldFlushMemory) {
    return params.sessionEntry;
  }

  memLog.summary("memory flush: starting", {
    sessionKey: params.sessionKey,
    totalTokens: params.sessionEntry?.totalTokens,
  });
  const flushStart = Date.now();
  let activeSessionEntry = params.sessionEntry;
  const activeSessionStore = params.sessionStore;
  const flushRunId = crypto.randomUUID();
  if (params.sessionKey) {
    registerAgentRunContext(flushRunId, {
      sessionKey: params.sessionKey,
      verboseLevel: params.resolvedVerboseLevel,
    });
  }
  let memoryCompactionCompleted = false;
  // Track tool calls during the flush for metrics
  const toolCounts = new Map<string, number>();
  const toolErrors = new Map<string, number>();
  const writtenPaths: string[] = [];
  let flushMetrics: {
    memoriesWritten: number;
    memoryPaths: string[];
    totalToolCalls: number;
    totalToolErrors: number;
    agentDurationMs?: number;
    stopReason?: string;
    tokenUsage?: Record<string, unknown>;
    payloadCount: number;
  } | null = null;
  const flushSystemPrompt = [
    params.followupRun.run.extraSystemPrompt,
    memoryFlushSettings.systemPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
  const flushFallbacksOverride = resolveAgentModelFallbacksOverride(
    params.followupRun.run.config,
    resolveAgentIdFromSessionKey(params.followupRun.run.sessionKey),
  );
  const flushRuntimeKind = "pi" as const;
  if (
    !hasConfiguredModelFallback({
      cfg: params.followupRun.run.config,
      provider: params.followupRun.run.provider,
      model: params.followupRun.run.model,
      agentDir: params.followupRun.run.agentDir,
      fallbacksOverride: flushFallbacksOverride,
      runtimeKind: flushRuntimeKind,
    })
  ) {
    memLog.warn("memory flush: skipped (no non-claude runtime providers configured)", {
      sessionKey: params.sessionKey,
      provider: params.followupRun.run.provider,
      model: params.followupRun.run.model,
      runtimeKind: flushRuntimeKind,
    });
    return params.sessionEntry;
  }

  // Create kernel once (reused across fallback attempts)
  const kernel = createDefaultExecutionKernel();

  // Resolve threading context once
  const threadingCtx = buildThreadingToolContext({
    sessionCtx: params.sessionCtx,
    config: params.followupRun.run.config,
    hasRepliedRef: params.opts?.hasRepliedRef,
  });

  try {
    const flushResult = await runWithModelFallback({
      cfg: params.followupRun.run.config,
      provider: params.followupRun.run.provider,
      model: params.followupRun.run.model,
      agentDir: params.followupRun.run.agentDir,
      fallbacksOverride: flushFallbacksOverride,
      runtimeKind: flushRuntimeKind,
      run: async (provider, model) => {
        const authProfileId =
          provider === params.followupRun.run.provider
            ? params.followupRun.run.authProfileId
            : undefined;

        // Build ExecutionRequest — embeddedOnly forces Pi runtime + skips state persist
        const request: ExecutionRequest = {
          agentId: params.followupRun.run.agentId ?? "main",
          sessionId: params.followupRun.run.sessionId,
          sessionKey: params.sessionKey,
          runId: flushRunId,
          workspaceDir: params.followupRun.run.workspaceDir,
          agentDir: params.followupRun.run.agentDir,
          config: params.followupRun.run.config,
          prompt: memoryFlushSettings.prompt,
          extraSystemPrompt: flushSystemPrompt,
          timeoutMs: params.followupRun.run.timeoutMs,
          sessionFile: params.followupRun.run.sessionFile,

          // Embedded-only: forces Pi runtime, skips state persistence
          embeddedOnly: true,
          providerOverride: provider,
          modelOverride: model,

          // Message context
          messageContext: {
            provider: params.sessionCtx.Provider?.trim().toLowerCase() || undefined,
            senderId: params.sessionCtx.SenderId?.trim() || undefined,
            senderName: params.sessionCtx.SenderName?.trim() || undefined,
            senderUsername: params.sessionCtx.SenderUsername?.trim() || undefined,
            senderE164: params.sessionCtx.SenderE164?.trim() || undefined,
            threadId: params.sessionCtx.MessageThreadId ?? undefined,
            accountId: params.sessionCtx.AccountId,
          },

          // Runtime hints (Pi-specific params)
          runtimeHints: {
            thinkLevel: params.followupRun.run.thinkLevel,
            verboseLevel: params.followupRun.run.verboseLevel,
            reasoningLevel: params.followupRun.run.reasoningLevel,
            authProfileId,
            authProfileIdSource: authProfileId
              ? params.followupRun.run.authProfileIdSource
              : undefined,
            enforceFinalTag: resolveEnforceFinalTag(params.followupRun.run, provider),
            ownerNumbers: params.followupRun.run.ownerNumbers,
            skillsSnapshot: params.followupRun.run.skillsSnapshot,
            execOverrides: params.followupRun.run.execOverrides,
            bashElevated: params.followupRun.run.bashElevated,
            messageTo: params.sessionCtx.OriginatingTo ?? params.sessionCtx.To,
            messageProvider: params.sessionCtx.Provider?.trim().toLowerCase() || undefined,
            hasRepliedRef: threadingCtx.hasRepliedRef ?? params.opts?.hasRepliedRef,
            currentChannelId: threadingCtx.currentChannelId,
            currentThreadTs: threadingCtx.currentThreadTs,
            replyToMode: threadingCtx.replyToMode,
          },

          // Agent event callback for compaction + tool tracking
          onAgentEvent: (evt) => {
            if (evt.stream === "compaction") {
              const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
              const willRetry = Boolean(evt.data.willRetry);
              if (phase === "end" && !willRetry) {
                memoryCompactionCompleted = true;
              }
            }
            if (evt.stream === "tool" && evt.data) {
              const toolName = typeof evt.data.name === "string" ? evt.data.name : "unknown";
              const phase = typeof evt.data.phase === "string" ? evt.data.phase : "";
              if (phase === "start") {
                toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
                // Track file paths written to (memory file captures)
                if (toolName === "write") {
                  const args = evt.data.args as Record<string, unknown> | undefined;
                  const filePath = typeof args?.path === "string" ? args.path : undefined;
                  if (filePath) {
                    writtenPaths.push(filePath);
                  }
                }
              }
              if (phase === "result" && evt.data.isError) {
                toolErrors.set(toolName, (toolErrors.get(toolName) ?? 0) + 1);
              }
            }
          },
        };

        const result = await kernel.execute(request);
        return mapMemoryFlushResultToLegacy(result);
      },
    });
    // Extract metrics from the flush agent run
    const flushMeta = flushResult.result.meta;
    const flushPayloads = flushResult.result.payloads ?? [];
    const memoryFilesWritten = writtenPaths.filter(
      (p) => p.includes("/memory/") || p.includes("/memory\\") || p.endsWith(".md"),
    );
    const totalToolCalls = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0);
    const totalToolErrors = Array.from(toolErrors.values()).reduce((a, b) => a + b, 0);

    memLog.trace("memory flush: agent run completed", {
      sessionKey: params.sessionKey,
      durationMs: flushMeta.durationMs,
      stopReason: flushMeta.stopReason,
      aborted: flushMeta.aborted,
      payloadCount: flushPayloads.length,
      errorPayloads: flushPayloads.filter((p) => p.isError).length,
      totalToolCalls,
      totalToolErrors,
      toolCallBreakdown: Object.fromEntries(toolCounts),
      toolErrorBreakdown: totalToolErrors > 0 ? Object.fromEntries(toolErrors) : undefined,
      memoriesWritten: memoryFilesWritten.length,
      memoryPaths: memoryFilesWritten,
      allWrittenPaths: writtenPaths,
      usage: flushMeta.agentMeta?.usage,
      pendingToolCalls: flushMeta.pendingToolCalls?.map((tc: { name: string }) => tc.name),
      provider: flushResult.provider,
      model: flushResult.model,
      fallbackAttempts: flushResult.attempts?.length ?? 0,
    });

    flushMetrics = {
      memoriesWritten: memoryFilesWritten.length,
      memoryPaths: memoryFilesWritten,
      totalToolCalls,
      totalToolErrors,
      agentDurationMs: flushMeta.durationMs,
      stopReason: flushMeta.stopReason,
      tokenUsage: flushMeta.agentMeta?.usage ? { ...flushMeta.agentMeta.usage } : undefined,
      payloadCount: flushPayloads.length,
    };

    let memoryFlushCompactionCount =
      activeSessionEntry?.compactionCount ??
      (params.sessionKey ? activeSessionStore?.[params.sessionKey]?.compactionCount : 0) ??
      0;
    if (memoryCompactionCompleted) {
      const nextCount = await incrementCompactionCount({
        sessionEntry: activeSessionEntry,
        sessionStore: activeSessionStore,
        sessionKey: params.sessionKey,
        storePath: params.storePath,
      });
      if (typeof nextCount === "number") {
        memoryFlushCompactionCount = nextCount;
      }
    }
    if (params.storePath && params.sessionKey) {
      try {
        const updatedEntry = await updateSessionStoreEntry({
          storePath: params.storePath,
          sessionKey: params.sessionKey,
          update: async () => ({
            memoryFlushAt: Date.now(),
            memoryFlushCompactionCount,
          }),
        });
        if (updatedEntry) {
          activeSessionEntry = updatedEntry;
        }
      } catch (err) {
        logVerbose(`failed to persist memory flush metadata: ${String(err)}`);
      }
    }
  } catch (err) {
    const msg = String(err);
    logVerbose(`memory flush run failed: ${msg}`);
    memLog.error("memory flush: failed", {
      error: msg,
      sessionKey: params.sessionKey,
      elapsedMs: Date.now() - flushStart,
    });
  }

  const elapsedMs = Date.now() - flushStart;
  const memoriesWritten = flushMetrics?.memoriesWritten ?? 0;
  const summaryParts = [
    `memory flush: completed in ${elapsedMs}ms`,
    `memories_written=${memoriesWritten}`,
    `tool_calls=${flushMetrics?.totalToolCalls ?? 0}`,
  ];
  if (flushMetrics?.totalToolErrors) {
    summaryParts.push(`tool_errors=${flushMetrics.totalToolErrors}`);
  }
  if (memoryCompactionCompleted) {
    summaryParts.push("compaction=yes");
  }
  memLog.summary(summaryParts.join(" | "), {
    sessionKey: params.sessionKey,
    compactionCompleted: memoryCompactionCompleted,
    elapsedMs,
    ...flushMetrics,
  });

  return activeSessionEntry;
}

// ---------------------------------------------------------------------------
// Legacy Result Mapping
// ---------------------------------------------------------------------------

/**
 * Map ExecutionResult to the legacy EmbeddedPiRunResult shape.
 * Same pattern as agent-runner-execution.ts:mapExecutionResultToLegacy.
 * Keeps post-processing code (metrics extraction, session updates) unchanged.
 */
function mapMemoryFlushResultToLegacy(result: ExecutionResult): {
  payloads: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    replyToId?: string;
    isError?: boolean;
  }>;
  meta: {
    durationMs?: number;
    aborted?: boolean;
    stopReason?: string;
    pendingToolCalls?: Array<{ name: string }>;
    agentMeta?: {
      sessionId: string;
      provider: string;
      model: string;
      usage?: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
        total: number;
      };
    };
  };
} {
  return {
    payloads: result.payloads.map((p) => ({
      text: p.text,
      mediaUrl: p.mediaUrl,
      mediaUrls: p.mediaUrls,
      replyToId: p.replyToId,
      isError: p.isError,
    })),
    meta: {
      durationMs: result.usage.durationMs,
      aborted: result.aborted,
      // stopReason and pendingToolCalls are not available in ExecutionResult —
      // acceptable since they're only used in trace logging
      stopReason: undefined,
      pendingToolCalls: undefined,
      agentMeta: {
        sessionId: "",
        provider: result.runtime.provider ?? "",
        model: result.runtime.model ?? "",
        usage: {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
          cacheRead: result.usage.cacheReadTokens,
          cacheWrite: result.usage.cacheWriteTokens,
          total: result.usage.inputTokens + result.usage.outputTokens,
        },
      },
    },
  };
}
