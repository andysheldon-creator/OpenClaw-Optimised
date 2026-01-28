/**
 * Claude Agent SDK runtime implementation.
 *
 * Implements the AgentRuntime interface using the Claude Agent SDK for execution.
 */

import type { MoltbotConfig } from "../../config/config.js";
import type { AgentRuntime, AgentRuntimeRunParams, AgentRuntimeResult } from "../agent-runtime.js";
import type { AgentCcSdkConfig } from "../../config/types.agents.js";
import type { ThinkLevel, VerboseLevel } from "../../auto-reply/thinking.js";
import type { SdkReasoningLevel, SdkVerboseLevel } from "./types.js";
import { runSdkAgent } from "./sdk-runner.js";
import { resolveProviderConfig } from "./provider-config.js";
import { isSdkAvailable } from "./sdk-loader.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

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
};

/**
 * Map ThinkLevel to SDK reasoning level.
 */
function mapThinkLevel(thinkLevel?: ThinkLevel): SdkReasoningLevel {
  switch (thinkLevel) {
    case "off":
      return "off";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
      return "high";
    default:
      return "off";
  }
}

/**
 * Map VerboseLevel to SDK verbose level.
 */
function mapVerboseLevel(verboseLevel?: VerboseLevel): SdkVerboseLevel {
  switch (verboseLevel) {
    case "off":
      return "off";
    case "on":
      return "on";
    case "full":
      return "full";
    default:
      return "off";
  }
}

/**
 * Extract agent ID from session key.
 */
function extractAgentId(sessionKey?: string): string {
  if (!sessionKey) return "main";
  const parts = sessionKey.split(":");
  return parts[0] || "main";
}

/**
 * Resolve user timezone from config.
 */
function resolveTimezone(config?: MoltbotConfig): string | undefined {
  // Check for explicit timezone in config
  const tz = config?.agents?.defaults?.userTimezone;
  if (tz) return tz;

  // Fallback to environment
  return typeof process !== "undefined" ? process.env.TZ : undefined;
}

/**
 * Extract skill names from snapshot.
 */
function extractSkillNames(
  skillsSnapshot?: AgentRuntimeRunParams["skillsSnapshot"],
): string[] | undefined {
  if (!skillsSnapshot?.resolvedSkills) return undefined;
  const names = skillsSnapshot.resolvedSkills
    .map((s) => s.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names : undefined;
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
      const effectiveConfig = params.config ?? context?.config;
      const agentId = extractAgentId(params.sessionKey);

      log.debug("CCSDK runtime run", {
        sessionId: params.sessionId,
        runId: params.runId,
        provider: providerConfig.name,
        agentId,
        thinkLevel: params.thinkLevel,
        verboseLevel: params.verboseLevel,
      });

      return runSdkAgent({
        // ─── Session & Identity ──────────────────────────────────────────────
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        workspaceDir: params.workspaceDir,
        agentDir: params.agentDir,
        agentId,

        // ─── Configuration ───────────────────────────────────────────────────
        config: effectiveConfig,
        prompt: params.prompt,
        model: params.model ? `${params.provider ?? "anthropic"}/${params.model}` : undefined,
        providerConfig,
        timeoutMs: params.timeoutMs,
        runId: params.runId,
        abortSignal: params.abortSignal,

        // ─── Model Behavior ──────────────────────────────────────────────────
        reasoningLevel: mapThinkLevel(params.thinkLevel),
        verboseLevel: mapVerboseLevel(params.verboseLevel),

        // ─── System Prompt Context ───────────────────────────────────────────
        extraSystemPrompt: params.extraSystemPrompt,
        timezone: resolveTimezone(effectiveConfig),
        messageChannel: params.messageChannel,
        skills: extractSkillNames(params.skillsSnapshot),

        // ─── SDK Options ─────────────────────────────────────────────────────
        hooksEnabled: context?.ccsdkConfig?.hooksEnabled,
        sdkOptions: context?.ccsdkConfig?.options,
        modelTiers: context?.ccsdkConfig?.models,

        // ─── Streaming Callbacks ─────────────────────────────────────────────
        onPartialReply: params.onPartialReply,
        onAssistantMessageStart: params.onAssistantMessageStart,
        onBlockReply: params.onBlockReply,
        onBlockReplyFlush: params.onBlockReplyFlush,
        onReasoningStream: params.onReasoningStream,
        onToolResult: params.onToolResult,
        onAgentEvent: params.onAgentEvent,
      });
    },
  };
}
