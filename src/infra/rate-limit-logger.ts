/**
 * Structured logging and stats tracking for rate limit events.
 *
 * Provides helpers that emit structured log entries for rate limit denials,
 * auth lockouts, and periodic summaries. The `RateLimitStats` class tracks
 * denial counts per layer with a rolling 5-minute window for summaries.
 */

import type { SubsystemLogger } from "../logging/subsystem.js";

// --- Log event types ---

export type RateLimitLayer = "http" | "ws" | "auth" | "external";

export type RateLimitDeniedEvent = {
  layer: RateLimitLayer;
  endpoint?: string;
  key: string;
  remaining: number;
  retryAfterMs?: number;
  limiterName?: string;
};

export type AuthLockoutEvent = {
  ip: string;
  failures: number;
  windowMinutes: number;
};

// --- Privacy helpers ---

/** Mask a key for logging — show first 6 chars max, mask the rest. */
export function maskKey(key: string): string {
  if (key.length <= 6) {
    return key;
  }
  return `${key.slice(0, 6)}***`;
}

// --- Structured logging ---

/** Log a rate limit denial event. */
export function logRateLimitDenied(logger: SubsystemLogger, event: RateLimitDeniedEvent): void {
  logger.warn("rate-limit-denied", {
    layer: event.layer,
    endpoint: event.endpoint,
    key: maskKey(event.key),
    remaining: event.remaining,
    retryAfterMs: event.retryAfterMs,
    limiterName: event.limiterName,
  });
}

/** Log an auth lockout event. */
export function logAuthLockout(logger: SubsystemLogger, event: AuthLockoutEvent): void {
  logger.warn("auth-lockout", {
    ip: maskKey(event.ip),
    failures: event.failures,
    windowMinutes: event.windowMinutes,
  });
}

// --- Stats tracking ---

type DenialRecord = {
  layer: RateLimitLayer;
  key: string;
  timestamp: number;
};

export type RateLimitSummary = {
  period: string;
  denials: Record<RateLimitLayer, number>;
  topKeys: Array<{ key: string; denials: number }>;
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TOP_KEYS_LIMIT = 5;

/**
 * Tracks rate limit denial counts per layer with a rolling window.
 * Thread-safe for single-threaded Node.js event loop.
 */
export class RateLimitStats {
  private records: DenialRecord[] = [];

  /** Record a denial event. */
  recordDenial(layer: RateLimitLayer, key: string, now: number = Date.now()): void {
    this.records.push({ layer, key, timestamp: now });
  }

  /** Get a summary of denials within the rolling window. */
  getSummary(now: number = Date.now()): RateLimitSummary {
    const cutoff = now - FIVE_MINUTES_MS;
    const recent = this.records.filter((r) => r.timestamp > cutoff);

    const denials: Record<RateLimitLayer, number> = { http: 0, ws: 0, auth: 0, external: 0 };
    const keyCounts = new Map<string, number>();

    for (const record of recent) {
      denials[record.layer] += 1;
      const masked = maskKey(record.key);
      keyCounts.set(masked, (keyCounts.get(masked) ?? 0) + 1);
    }

    const topKeys = [...keyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_KEYS_LIMIT)
      .map(([key, count]) => ({ key, denials: count }));

    return { period: "5m", denials, topKeys };
  }

  /** Whether any denials have been recorded in the rolling window. */
  hasDenials(now: number = Date.now()): boolean {
    const cutoff = now - FIVE_MINUTES_MS;
    return this.records.some((r) => r.timestamp > cutoff);
  }

  /** Prune old records outside the rolling window. */
  prune(now: number = Date.now()): void {
    const cutoff = now - FIVE_MINUTES_MS;
    this.records = this.records.filter((r) => r.timestamp > cutoff);
  }

  /** Clear all stats. */
  reset(): void {
    this.records = [];
  }

  /** Total denial records (visible for testing). */
  get size(): number {
    return this.records.length;
  }
}

// --- Singleton stats instance ---

let globalStats: RateLimitStats | null = null;

/** Get or create the global rate limit stats instance. */
export function getRateLimitStats(): RateLimitStats {
  if (!globalStats) {
    globalStats = new RateLimitStats();
  }
  return globalStats;
}

/** Reset the global stats instance (for testing). */
export function resetRateLimitStats(): void {
  globalStats?.reset();
  globalStats = null;
}

// --- Periodic summary ---

let summaryTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Start periodic summary logging. Logs a summary every 5 minutes
 * if any denials occurred in the window. No-op if already started.
 */
export function startPeriodicSummary(logger: SubsystemLogger): void {
  if (summaryTimer) {
    return;
  }
  const stats = getRateLimitStats();
  summaryTimer = setInterval(() => {
    stats.prune();
    if (stats.hasDenials()) {
      const summary = stats.getSummary();
      logger.info("rate-limit-summary", {
        period: summary.period,
        denials: summary.denials,
        topKeys: summary.topKeys,
      });
    }
  }, FIVE_MINUTES_MS);
  summaryTimer.unref();
}

/** Stop periodic summary logging. */
export function stopPeriodicSummary(): void {
  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = undefined;
  }
}
