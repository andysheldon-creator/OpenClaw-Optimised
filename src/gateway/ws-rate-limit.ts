/**
 * WebSocket rate limiting helpers.
 *
 * Provides connection tracking (global + per-IP), per-client message throttling,
 * and per-method rate limits for expensive operations.
 */

import type { ResolvedRateLimitsWsConfig } from "../config/types.gateway.js";
import { RateLimiter } from "../infra/rate-limiter.js";

// --- Connection tracking ---

export type WsConnectionTracker = {
  /** Total active WS connections. */
  totalConnections: number;
  /** Per-IP active connection counts. */
  perIpConnections: Map<string, number>;
  /** Max total concurrent connections. */
  maxConnections: number;
  /** Max concurrent connections per IP. */
  perIpMaxConnections: number;
};

/** Create a fresh connection tracker from config. */
export function createWsConnectionTracker(config: ResolvedRateLimitsWsConfig): WsConnectionTracker {
  return {
    totalConnections: 0,
    perIpConnections: new Map(),
    maxConnections: config.maxConnections,
    perIpMaxConnections: config.perIpMaxConnections,
  };
}

export type WsConnectionCheckResult = {
  allowed: boolean;
  reason?: "max_connections" | "per_ip_max_connections";
};

/** Check whether a new connection from `ip` is allowed. Does NOT increment counters. */
export function checkWsConnection(
  tracker: WsConnectionTracker,
  ip: string,
): WsConnectionCheckResult {
  if (tracker.totalConnections >= tracker.maxConnections) {
    return { allowed: false, reason: "max_connections" };
  }
  const ipCount = tracker.perIpConnections.get(ip) ?? 0;
  if (ipCount >= tracker.perIpMaxConnections) {
    return { allowed: false, reason: "per_ip_max_connections" };
  }
  return { allowed: true };
}

/** Record a new connection from `ip`. Call after successful upgrade. */
export function trackWsConnect(tracker: WsConnectionTracker, ip: string): void {
  tracker.totalConnections += 1;
  const prev = tracker.perIpConnections.get(ip) ?? 0;
  tracker.perIpConnections.set(ip, prev + 1);
}

/** Record a disconnection from `ip`. Call on ws close. */
export function trackWsDisconnect(tracker: WsConnectionTracker, ip: string): void {
  tracker.totalConnections = Math.max(0, tracker.totalConnections - 1);
  const prev = tracker.perIpConnections.get(ip) ?? 0;
  if (prev <= 1) {
    tracker.perIpConnections.delete(ip);
  } else {
    tracker.perIpConnections.set(ip, prev - 1);
  }
}

// --- Per-client message throttling ---

export type WsMessageRateLimitState = {
  /** Per-client overall message limiter. */
  messageLimiter: RateLimiter;
  /** Per-client agent method limiter. */
  agentLimiter: RateLimiter;
  /** Per-client TTS method limiter. */
  ttsLimiter: RateLimiter;
};

/** Create message rate limiters from config. */
export function createWsMessageRateLimiters(
  config: ResolvedRateLimitsWsConfig,
): WsMessageRateLimitState {
  const intervalMs = 60_000;
  return {
    messageLimiter: new RateLimiter({
      maxTokens: config.messagesPerMinute,
      refillRate: config.messagesPerMinute,
      refillIntervalMs: intervalMs,
    }),
    agentLimiter: new RateLimiter({
      maxTokens: config.agentPerMinute,
      refillRate: config.agentPerMinute,
      refillIntervalMs: intervalMs,
    }),
    ttsLimiter: new RateLimiter({
      maxTokens: config.ttsPerMinute,
      refillRate: config.ttsPerMinute,
      refillIntervalMs: intervalMs,
    }),
  };
}

/** Destroy all WS message rate limiter instances (clears GC timers). */
export function destroyWsMessageRateLimiters(state: WsMessageRateLimitState): void {
  state.messageLimiter.destroy();
  state.agentLimiter.destroy();
  state.ttsLimiter.destroy();
}

export type WsRateLimitCheckResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

/**
 * Check per-client overall message rate.
 * @param clientKey - unique client identifier (connId).
 */
export function checkWsMessageRate(
  state: WsMessageRateLimitState,
  clientKey: string,
): WsRateLimitCheckResult {
  const result = state.messageLimiter.check(clientKey);
  if (result.allowed) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterMs: result.retryAfterMs };
}

/** Methods that invoke the agent (expensive LLM operations). */
const AGENT_METHODS = new Set(["agent", "agent.wait", "chat.send"]);

/** Methods that hit external TTS APIs. */
const TTS_METHODS = new Set(["tts.convert"]);

export type WsMethodRateLimitCheckResult = {
  allowed: boolean;
  method?: string;
  retryAfterMs?: number;
};

/**
 * Check per-client per-method rate limit for expensive operations.
 * Returns allowed=true for methods that are not rate-limited.
 *
 * @param clientKey - unique client identifier (connId).
 * @param method - WS method name.
 */
export function checkWsMethodRate(
  state: WsMessageRateLimitState,
  clientKey: string,
  method: string,
): WsMethodRateLimitCheckResult {
  if (AGENT_METHODS.has(method)) {
    const result = state.agentLimiter.check(clientKey);
    if (result.allowed) {
      return { allowed: true };
    }
    return { allowed: false, method, retryAfterMs: result.retryAfterMs };
  }
  if (TTS_METHODS.has(method)) {
    const result = state.ttsLimiter.check(clientKey);
    if (result.allowed) {
      return { allowed: true };
    }
    return { allowed: false, method, retryAfterMs: result.retryAfterMs };
  }
  return { allowed: true };
}
