/**
 * HTTP rate limiting helpers.
 *
 * Provides factory functions to create per-endpoint rate limiters and a
 * shared `checkRateLimit` helper that sends a 429 response when denied.
 */

import type { ServerResponse } from "node:http";
import type { ResolvedRateLimitsConfig } from "../config/types.gateway.js";
import { RateLimiter } from "../infra/rate-limiter.js";

export type HttpRateLimiters = {
  /** Global per-IP limiter applied before route matching. */
  global: RateLimiter;
  /** Per-IP limiter for agent-invoking endpoints (/v1/chat/completions, /v1/responses). */
  agent: RateLimiter;
  /** Per-token limiter for hook endpoints (/hooks/agent, /hooks/wake). */
  hook: RateLimiter;
  /** Per-IP limiter for static/control-ui requests. */
  static: RateLimiter;
  /** Per-IP limiter for tool invocation endpoint. */
  tools: RateLimiter;
};

/** 429 response body format. */
export type RateLimitErrorFormat = "openai" | "default";

/**
 * Create all HTTP rate limiter instances from resolved config.
 *
 * Each per-minute value is converted to a token-bucket with:
 * - `maxTokens` = per-minute value (burst capacity)
 * - `refillRate` = per-minute value (refill full bucket each interval)
 * - `refillIntervalMs` = 60 000 ms (1 minute)
 */
export function createHttpRateLimiters(config: ResolvedRateLimitsConfig): HttpRateLimiters {
  const intervalMs = 60_000;
  return {
    global: new RateLimiter({
      maxTokens: config.http.globalPerMinute,
      refillRate: config.http.globalPerMinute,
      refillIntervalMs: intervalMs,
    }),
    agent: new RateLimiter({
      maxTokens: config.http.agentPerMinute,
      refillRate: config.http.agentPerMinute,
      refillIntervalMs: intervalMs,
    }),
    hook: new RateLimiter({
      maxTokens: config.http.hookPerMinute,
      refillRate: config.http.hookPerMinute,
      refillIntervalMs: intervalMs,
    }),
    static: new RateLimiter({
      maxTokens: config.http.staticPerMinute,
      refillRate: config.http.staticPerMinute,
      refillIntervalMs: intervalMs,
    }),
    tools: new RateLimiter({
      maxTokens: config.http.toolsPerMinute,
      refillRate: config.http.toolsPerMinute,
      refillIntervalMs: intervalMs,
    }),
  };
}

/** Destroy all limiter instances (clears GC timers). */
export function destroyHttpRateLimiters(limiters: HttpRateLimiters): void {
  limiters.global.destroy();
  limiters.agent.destroy();
  limiters.hook.destroy();
  limiters.static.destroy();
  limiters.tools.destroy();
}

/**
 * Send a 429 Too Many Requests response.
 *
 * @param res - HTTP server response
 * @param retryAfterMs - milliseconds until a token is available
 * @param format - response body format ("openai" for OpenAI-compatible endpoints)
 */
export function send429(
  res: ServerResponse,
  retryAfterMs: number,
  format: RateLimitErrorFormat = "default",
): void {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  res.statusCode = 429;
  res.setHeader("Retry-After", String(retryAfterSec));
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (format === "openai") {
    res.end(
      JSON.stringify({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          retry_after_ms: retryAfterMs,
        },
      }),
    );
  } else {
    res.end(
      JSON.stringify({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          retry_after_ms: retryAfterMs,
        },
      }),
    );
  }
}

/**
 * Check a rate limiter for a given key. If denied, sends a 429 response.
 *
 * @returns `true` if the request is **allowed**, `false` if denied (429 sent).
 */
export function checkRateLimit(
  limiter: RateLimiter,
  key: string,
  res: ServerResponse,
  format: RateLimitErrorFormat = "default",
): boolean {
  const result = limiter.check(key);
  if (result.allowed) {
    return true;
  }
  send429(res, result.retryAfterMs ?? 60_000, format);
  return false;
}
