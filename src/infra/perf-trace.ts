/**
 * Lightweight performance tracing for hot paths.
 *
 * Records timing data for key operations and periodically logs aggregated
 * stats to the subsystem logger. Zero-allocation fast path when tracing
 * is disabled (default: enabled only when OPENCLAW_PERF_TRACE=1).
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("perf-trace");

const enabled =
  process.env.OPENCLAW_PERF_TRACE === "1" || process.env.OPENCLAW_PERF_TRACE === "true";

type TraceEntry = {
  count: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
};

const traces = new Map<string, TraceEntry>();
let flushTimer: NodeJS.Timeout | null = null;

const FLUSH_INTERVAL_MS = 60_000;

function ensureFlushTimer() {
  if (flushTimer) {
    return;
  }
  flushTimer = setInterval(() => {
    flush();
  }, FLUSH_INTERVAL_MS);
  // Don't keep the process alive just for perf tracing
  if (flushTimer.unref) {
    flushTimer.unref();
  }
}

/**
 * Record a timing measurement for a named operation.
 * No-op when tracing is disabled.
 */
export function recordTrace(name: string, durationMs: number): void {
  if (!enabled) {
    return;
  }
  const existing = traces.get(name);
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    if (durationMs > existing.maxMs) {
      existing.maxMs = durationMs;
    }
    if (durationMs < existing.minMs) {
      existing.minMs = durationMs;
    }
  } else {
    traces.set(name, {
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      minMs: durationMs,
    });
    ensureFlushTimer();
  }
}

/**
 * Convenience: time an async function and record the trace.
 */
export async function traceAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  try {
    return await fn();
  } finally {
    recordTrace(name, performance.now() - start);
  }
}

/**
 * Convenience: time a sync function and record the trace.
 */
export function traceSync<T>(name: string, fn: () => T): T {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  try {
    return fn();
  } finally {
    recordTrace(name, performance.now() - start);
  }
}

/**
 * Flush aggregated traces to the log and reset counters.
 */
export function flush(): void {
  if (traces.size === 0) {
    return;
  }
  const entries: Record<string, { count: number; avgMs: number; maxMs: number; minMs: number }> =
    {};
  for (const [name, entry] of traces) {
    entries[name] = {
      count: entry.count,
      avgMs: Math.round((entry.totalMs / entry.count) * 100) / 100,
      maxMs: Math.round(entry.maxMs * 100) / 100,
      minMs: Math.round(entry.minMs * 100) / 100,
    };
  }
  log.info("perf-trace flush", entries);
  traces.clear();
}

/**
 * Whether perf tracing is currently enabled.
 */
export function isPerfTraceEnabled(): boolean {
  return enabled;
}
