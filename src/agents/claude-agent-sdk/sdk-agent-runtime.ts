/**
 * Claude Agent SDK runtime implementation.
 *
 * Implements the AgentRuntime interface using the Claude Agent SDK for execution.
 */

import type { MoltbotConfig } from "../../config/config.js";
import type { AgentRuntime, AgentRuntimeRunParams, AgentRuntimeResult } from "../agent-runtime.js";
import type { AgentCcSdkConfig } from "../../config/types.agents.js";
import type { AnyAgentTool } from "../tools/common.js";
import { runSdkAgent } from "./sdk-runner.js";
import { resolveProviderConfig } from "./provider-config.js";
import { isSdkAvailable } from "./sdk-loader.js";
import { loadSessionHistoryForSdk } from "./sdk-session-history.js";
import { appendSdkTurnPairToSessionTranscript } from "./sdk-session-transcript.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { SdkConversationTurn, SdkRunnerResult } from "./types.js";

const log = createSubsystemLogger("agents/claude-agent-sdk");

export type CcSdkAgentRuntimeContext = {
  /** Moltbot configuration. */
  config?: MoltbotConfig;
  /** Claude Code SDK configuration. */
  ccsdkConfig?: AgentCcSdkConfig;
  /** Explicit API key override. */
  apiKey?: string;
  /** Explicit auth token override (for subscription auth). */
  authToken?: string;
  /** Custom base URL for API requests. */
  baseUrl?: string;
  /** Pre-built tools to expose to the agent. */
  tools?: AnyAgentTool[];
  /** Pre-loaded conversation history (if not loading from session file). */
  conversationHistory?: SdkConversationTurn[];
};

/**
 * Convert an SdkRunnerResult into an AgentRuntimeResult.
 */
function adaptSdkResult(result: SdkRunnerResult, sessionId: string): AgentRuntimeResult {
  return {
    payloads: result.payloads.map((p) => ({
      text: p.text,
      isError: p.isError,
    })),
    meta: {
      durationMs: result.meta.durationMs,
      aborted: result.meta.aborted,
      agentMeta: {
        sessionId,
        provider: result.meta.provider ?? "sdk",
        model: result.meta.model ?? "default",
      },
      // SDK runner errors are rendered as text payloads with isError=true.
      // Avoid mapping to Pi-specific error kinds (context/compaction) because
      // downstream recovery logic would treat them incorrectly.
      error: undefined,
    },
  };
}

/**
 * Create a Claude Code SDK runtime instance.
 *
 * The CCSDK runtime uses the Claude Agent SDK for model execution,
 * which supports:
 * - Claude Code CLI authentication (subscription-based)
 * - Anthropic API key authentication
 * - AWS Bedrock and Google Vertex AI backends
 */
export function createCcSdkAgentRuntime(context?: CcSdkAgentRuntimeContext): AgentRuntime {
  // Pre-check SDK availability
  if (!isSdkAvailable()) {
    log.warn("Claude Agent SDK not available - runtime will fail on first run");
  }

  // Resolve provider configuration from context
  const providerConfig = resolveProviderConfig({
    apiKey: context?.apiKey,
    authToken: context?.authToken,
    baseUrl: context?.baseUrl,
    useCliCredentials: true, // Enable Claude CLI credential resolution
  });

  return {
    kind: "ccsdk",
    displayName: `Claude Code SDK (${providerConfig.name})`,

    async run(params: AgentRuntimeRunParams): Promise<AgentRuntimeResult> {
      log.debug("CCSDK runtime run", {
        sessionId: params.sessionId,
        runId: params.runId,
        provider: providerConfig.name,
      });

      // Load conversation history from session file if not provided
      let conversationHistory = context?.conversationHistory;
      if (!conversationHistory && params.sessionFile) {
        conversationHistory = loadSessionHistoryForSdk({
          sessionFile: params.sessionFile,
          maxTurns: 20,
        });
      }

      const sdkResult = await runSdkAgent({
        runId: params.runId,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        workspaceDir: params.workspaceDir,
        agentDir: params.agentDir,
        config: params.config ?? context?.config,
        prompt: params.prompt,
        model: params.model ? `${params.provider}/${params.model}` : undefined,
        providerConfig,
        timeoutMs: params.timeoutMs,
        abortSignal: params.abortSignal,
        extraSystemPrompt: params.extraSystemPrompt,
        hooksEnabled: context?.ccsdkConfig?.hooksEnabled,
        sdkOptions: context?.ccsdkConfig?.options,
        modelTiers: context?.ccsdkConfig?.models,
        conversationHistory,
        tools: context?.tools,

        // Forward all callbacks
        onPartialReply: params.onPartialReply
          ? (payload) => params.onPartialReply?.({ text: payload.text })
          : undefined,
        onAssistantMessageStart: params.onAssistantMessageStart,
        onBlockReply: params.onBlockReply
          ? (payload) => params.onBlockReply?.({ text: payload.text })
          : undefined,
        onToolResult: params.onToolResult
          ? (payload) => params.onToolResult?.({ text: payload.text })
          : undefined,
        onAgentEvent: params.onAgentEvent,
      });

      // Persist a minimal user/assistant turn pair so SDK main-agent mode has multi-turn continuity.
      // This intentionally records only text, not tool call structures.
      if (params.sessionFile) {
        appendSdkTurnPairToSessionTranscript({
          sessionFile: params.sessionFile,
          prompt: params.prompt,
          assistantText: sdkResult.payloads.find(
            (p) => !p.isError && typeof p.text === "string" && p.text.trim(),
          )?.text,
        });
      }

      return adaptSdkResult(sdkResult, params.sessionId);
    },
  };
}
