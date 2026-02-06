/**
 * Smart Model Router - Clawdbot Integration Adapter
 *
 * This adapter integrates the Smart Model Router with Clawdbot's
 * existing model selection infrastructure.
 *
 * Installation:
 *   1. Copy this file to clawdbot/src/agents/smart-model-router/
 *   2. Wire into get-reply.ts (see integration patch)
 */

import type { ModelRef, RoutingConfig, RoutingContext, RoutingResult } from "./types.js";
import { MODELS } from "./config.js";
import { ModelRouter, createModelRouter } from "./router.js";

/**
 * Context extracted from Clawdbot's MsgContext and GetReplyOptions
 */
export interface ClawdbotRoutingContext {
  /** User message body */
  message: string;
  /** Session key (e.g., "agent:coding-agent:main") */
  sessionKey?: string;
  /** Agent ID (e.g., "coding-agent") */
  agentId?: string;
  /** Is this a heartbeat poll */
  isHeartbeat?: boolean;
  /** Is TTS enabled */
  ttsEnabled?: boolean;
  /** Message channel (telegram, discord, etc.) */
  channel?: string;
  /** Estimated prompt tokens */
  promptTokens?: number;
  /** Total context tokens */
  contextTokens?: number;
  /** Current configured model (for pass-through when disabled) */
  configuredModel?: ModelRef;
  /** Current configured provider */
  configuredProvider?: string;
}

/**
 * Result from Clawdbot adapter
 */
export interface ClawdbotRoutingResult {
  /** Selected provider */
  provider: string;
  /** Selected model */
  model: string;
  /** Routing rule that matched */
  rule: string;
  /** Cleaned message (override tags stripped) */
  cleanedMessage: string;
  /** Whether an explicit override was used */
  wasExplicitOverride: boolean;
  /** Whether routing was applied (vs pass-through) */
  routingApplied: boolean;
}

/**
 * Clawdbot-specific adapter for the Smart Model Router
 */
export class ClawdbotModelRouterAdapter {
  private router: ModelRouter;

  constructor(config?: Partial<RoutingConfig>) {
    this.router = createModelRouter(config);
  }

  /**
   * Route a request using Clawdbot context
   */
  routeRequest(ctx: ClawdbotRoutingContext): ClawdbotRoutingResult {
    // If routing is disabled, true pass-through - return configured model as-is
    // Caller must provide configuredModel/configuredProvider for pass-through to work
    if (!this.router.isEnabled()) {
      return {
        provider: ctx.configuredProvider ?? "",
        model: ctx.configuredModel?.model ?? "",
        rule: "disabled",
        cleanedMessage: ctx.message,
        wasExplicitOverride: false,
        routingApplied: false,
      };
    }

    // Build routing context from Clawdbot context
    const routingContext: RoutingContext = {
      message: ctx.message,
      sessionKey: ctx.sessionKey,
      agentId: ctx.agentId,
      isHeartbeat: ctx.isHeartbeat,
      ttsEnabled: ctx.ttsEnabled,
      channel: ctx.channel,
      promptTokens: ctx.promptTokens,
      contextTokens: ctx.contextTokens,
      sessionType: this.detectSessionType(ctx.sessionKey),
    };

    // Route the request
    const result = this.router.selectModel(routingContext);

    return {
      provider: result.model.provider,
      model: result.model.model,
      rule: result.rule,
      cleanedMessage: result.cleanedMessage,
      wasExplicitOverride: result.wasExplicitOverride,
      routingApplied: true,
    };
  }

  /**
   * Detect session type from session key
   */
  private detectSessionType(sessionKey?: string): "main" | "cron" | "subagent" | undefined {
    if (!sessionKey) return undefined;

    const lower = sessionKey.toLowerCase();
    if (lower.includes(":subagent:")) return "subagent";
    if (lower.includes(":cron:") || lower.startsWith("cron:")) return "cron";
    if (lower.endsWith(":main")) return "main";

    return undefined;
  }

  /**
   * Get the underlying router for metrics access
   */
  getRouter(): ModelRouter {
    return this.router;
  }

  /**
   * Get routing metrics
   */
  getMetrics() {
    return this.router.getMetrics();
  }

  /**
   * Get formatted metrics summary
   */
  getMetricsSummary(): string {
    return this.router.getMetricsSummary();
  }

  /**
   * Enable/disable routing
   */
  setEnabled(enabled: boolean): void {
    this.router.setEnabled(enabled);
  }

  /**
   * Check if routing is enabled
   */
  isEnabled(): boolean {
    return this.router.isEnabled();
  }
}

// Singleton instance for global use
let globalAdapter: ClawdbotModelRouterAdapter | null = null;

/**
 * Get or create the global Clawdbot adapter
 */
export function getClawdbotModelRouter(
  config?: Partial<RoutingConfig>,
): ClawdbotModelRouterAdapter {
  if (!globalAdapter) {
    globalAdapter = new ClawdbotModelRouterAdapter(config);
  }
  return globalAdapter;
}

/**
 * Reset the global adapter (for testing)
 */
export function resetClawdbotModelRouter(): void {
  globalAdapter = null;
}

/**
 * Helper to build context from Clawdbot's MsgContext-like object
 */
export function buildRoutingContextFromMsgContext(params: {
  Body: string;
  SessionKey?: string;
  agentId?: string;
  isHeartbeat?: boolean;
  ttsEnabled?: boolean;
  channel?: string;
  promptTokens?: number;
  contextTokens?: number;
  configuredModel?: ModelRef;
  configuredProvider?: string;
}): ClawdbotRoutingContext {
  return {
    message: params.Body,
    sessionKey: params.SessionKey,
    agentId: params.agentId,
    isHeartbeat: params.isHeartbeat,
    ttsEnabled: params.ttsEnabled,
    channel: params.channel,
    promptTokens: params.promptTokens,
    contextTokens: params.contextTokens,
    configuredModel: params.configuredModel,
    configuredProvider: params.configuredProvider,
  };
}
