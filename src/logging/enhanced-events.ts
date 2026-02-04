/**
 * Structured logging for enhanced events (tool errors, performance, tokens, gateway).
 *
 * All functions check config before logging - no output if feature is disabled.
 */

import {
  getEnhancedLoggingConfig,
  getPerformanceThresholds as getPerformanceThresholdsInternal,
  getTokenWarningThresholds as getTokenWarningThresholdsInternal,
} from "./enhanced-logging-config.js";
import { createSubsystemLogger } from "./subsystem.js";

// Re-export for external use
export { getPerformanceThresholds, getTokenWarningThresholds } from "./enhanced-logging-config.js";

const toolLogger = createSubsystemLogger("tools");
const perfLogger = createSubsystemLogger("performance");
const tokenLogger = createSubsystemLogger("tokens");
const gatewayLogger = createSubsystemLogger("gateway");

// ---------------------------------------------------------------------------
// Tool Error Logging
// ---------------------------------------------------------------------------

export type ToolErrorContext = {
  toolName: string;
  input: unknown;
  error: unknown;
  sessionContext: {
    agentId?: string;
    sessionId?: string;
    turnNumber?: number;
  };
  isRetry?: boolean;
  durationMs?: number;
};

/**
 * Log detailed context when a tool call fails.
 * No-op if CLAWDBRAIN_LOG_TOOL_ERRORS=0
 */
export function logToolError(ctx: ToolErrorContext): void {
  if (!getEnhancedLoggingConfig().toolErrors) {
    return;
  }

  const error = ctx.error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : typeof error;
  const stack = error instanceof Error ? error.stack : undefined;

  // Truncate large inputs for readability
  const inputStr = JSON.stringify(ctx.input);
  const truncatedInput = inputStr.length > 500 ? `${inputStr.slice(0, 500)}...` : inputStr;

  toolLogger.error("Tool execution failed", {
    tool: ctx.toolName,
    input: truncatedInput,
    error: errorMessage,
    errorType,
    stack: stack?.split("\n").slice(0, 3).join("\n"), // First 3 lines of stack
    agentId: ctx.sessionContext.agentId,
    sessionId: ctx.sessionContext.sessionId,
    turnNumber: ctx.sessionContext.turnNumber,
    retry: ctx.isRetry ?? false,
    durationMs: ctx.durationMs,
  });
}

// ---------------------------------------------------------------------------
// Performance Outlier Logging
// ---------------------------------------------------------------------------

export type PerformanceOutlierType = "tool" | "agent_turn" | "gateway_request" | "database";

export type PerformanceOutlierContext = {
  operation: PerformanceOutlierType;
  name: string;
  durationMs: number;
  threshold: number;
  metadata?: Record<string, unknown>;
};

function performanceOutlierSourceHint(operation: PerformanceOutlierType): string {
  // Keep this a stable, high-signal hint for tracing where the warning originates.
  // (Not a file path; those drift. This is meant for scanning logs.)
  switch (operation) {
    case "agent_turn":
      return "agent-runner";
    case "tool":
      return "tool-exec";
    case "gateway_request":
      return "gateway";
    case "database":
      return "db";
  }
}

function formatOptionalField(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function buildPerformanceConsoleMessage(ctx: PerformanceOutlierContext): string {
  const overageMs = ctx.durationMs - ctx.threshold;
  const overagePct = Math.round(((ctx.durationMs - ctx.threshold) / ctx.threshold) * 100);
  const meta = ctx.metadata ?? {};

  const agentId = formatOptionalField(meta.agentId);
  const sessionKey = formatOptionalField(meta.sessionKey);
  const toolCallId = formatOptionalField(meta.toolCallId);
  const provider = formatOptionalField(meta.provider);
  const model = formatOptionalField(meta.model);

  const fields = [
    `src=${performanceOutlierSourceHint(ctx.operation)}`,
    `op=${ctx.operation}`,
    `name=${ctx.name}`,
    `durationMs=${ctx.durationMs}`,
    `thresholdMs=${ctx.threshold}`,
    `overageMs=${overageMs}`,
    `overagePct=${overagePct}`,
    agentId ? `agentId=${agentId}` : null,
    sessionKey ? `sessionKey=${sessionKey}` : null,
    toolCallId ? `toolCallId=${toolCallId}` : null,
    provider ? `provider=${provider}` : null,
    model ? `model=${model}` : null,
  ].filter(Boolean);

  return `Slow operation detected: ${fields.join(" ")}`;
}

/**
 * Log when an operation exceeds performance threshold.
 * No-op if CLAWDBRAIN_LOG_PERFORMANCE=0
 */
export function logPerformanceOutlier(ctx: PerformanceOutlierContext): void {
  if (!getEnhancedLoggingConfig().performanceOutliers) {
    return;
  }

  perfLogger.warn("Slow operation detected", {
    // Human-readable summary for compact/pretty console logs.
    consoleMessage: buildPerformanceConsoleMessage(ctx),
    operation: ctx.operation,
    name: ctx.name,
    durationMs: ctx.durationMs,
    thresholdMs: ctx.threshold,
    overageMs: ctx.durationMs - ctx.threshold,
    overagePct: Math.round(((ctx.durationMs - ctx.threshold) / ctx.threshold) * 100),
    ...ctx.metadata,
  });
}

/**
 * Helper to measure and log slow operations.
 */
export async function measureOperation<T>(
  type: PerformanceOutlierType,
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    const thresholds = getPerformanceThresholdsInternal();
    let threshold: number;

    switch (type) {
      case "tool":
        threshold = thresholds.toolCall;
        break;
      case "agent_turn":
        threshold = thresholds.agentTurn;
        break;
      case "gateway_request":
        threshold = thresholds.gatewayRequest;
        break;
      case "database":
        threshold = thresholds.databaseOp;
        break;
    }

    if (durationMs > threshold) {
      logPerformanceOutlier({
        operation: type,
        name,
        durationMs,
        threshold,
        metadata,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Token Budget Warning Logging
// ---------------------------------------------------------------------------

export type TokenWarningContext = {
  currentTokens: number;
  maxTokens: number;
  percentUsed: number;
  sessionId?: string;
  agentId?: string;
  model?: string;
  suggestedAction?: "compact" | "reset" | "none";
};

/**
 * Log when token usage approaches context window limit.
 * No-op if CLAWDBRAIN_LOG_TOKEN_WARNINGS=0
 */
export function logTokenWarning(ctx: TokenWarningContext): void {
  if (!getEnhancedLoggingConfig().tokenWarnings) {
    return;
  }

  const thresholds = getTokenWarningThresholdsInternal();
  const level = ctx.percentUsed >= thresholds.critical ? "error" : "warn";

  tokenLogger[level]("Approaching context limit", {
    currentTokens: ctx.currentTokens,
    maxTokens: ctx.maxTokens,
    percentUsed: ctx.percentUsed,
    tokensRemaining: ctx.maxTokens - ctx.currentTokens,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    model: ctx.model,
    suggestedAction: ctx.suggestedAction ?? "compact",
    severity: ctx.percentUsed >= thresholds.critical ? "critical" : "warning",
  });
}

/**
 * Check token usage and log warning if approaching limits.
 */
export function checkTokenUsage(params: {
  currentTokens: number;
  maxTokens: number;
  sessionId?: string;
  agentId?: string;
  model?: string;
}): void {
  const percentUsed = (params.currentTokens / params.maxTokens) * 100;
  const thresholds = getTokenWarningThresholdsInternal();

  if (percentUsed >= thresholds.warning) {
    logTokenWarning({
      ...params,
      percentUsed,
      suggestedAction: percentUsed >= thresholds.critical ? "reset" : "compact",
    });
  }
}

// ---------------------------------------------------------------------------
// Gateway Health Logging
// ---------------------------------------------------------------------------

export type GatewayEvent =
  | "connected"
  | "disconnected"
  | "reconnect_attempt"
  | "rate_limit"
  | "health_check";

export type GatewayHealthContext = {
  event: GatewayEvent;
  metadata?: Record<string, unknown>;
};

/**
 * Log gateway connection lifecycle events.
 * No-op if CLAWDBRAIN_LOG_GATEWAY_HEALTH=0
 */
export function logGatewayHealth(ctx: GatewayHealthContext): void {
  if (!getEnhancedLoggingConfig().gatewayHealth) {
    return;
  }

  const level = ctx.event === "rate_limit" || ctx.event === "disconnected" ? "warn" : "info";

  gatewayLogger[level](`Gateway ${ctx.event}`, {
    event: ctx.event,
    timestamp: new Date().toISOString(),
    ...ctx.metadata,
  });
}
