/**
 * Gates and Budget Manager (Component 2)
 *
 * Applies rate limits and token/storage budgets to capture decisions.
 * Extracted from inline logic in the experiential-capture hook.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type GatesConfig = {
  maxCapturesPerHour: number;
  minIntervalMs: number;
};

export type GateResult = {
  allowed: boolean;
  reason?: "min_interval" | "max_per_hour" | "budget";
  detail?: string;
};

export type SessionBuffer = {
  version: 1;
  sessionId?: string;
  sessionKey?: string;
  createdAt: string;
  updatedAt: string;
  toolResultsSeen: number;
  captured: number;
  lastSeenAt?: string;
  lastCapturedAt?: string;
  recentCaptures: Array<{ ts: string; toolName: string; score: number; recordId: string }>;
  recentEvaluations: Array<{
    ts: string;
    toolName: string;
    score: number;
    recommendation: "capture" | "skip";
    reason?: string;
  }>;
  lastError?: { ts: string; toolName: string; message: string };
};

// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GATES_CONFIG: GatesConfig = {
  maxCapturesPerHour: 10,
  minIntervalMs: 5 * 60 * 1000, // 5 minutes
};

// ────────────────────────────────────────────────────────────────────────────
// Buffer management
// ────────────────────────────────────────────────────────────────────────────

export function ensureBuffer(seed: Partial<SessionBuffer>): SessionBuffer {
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: seed.sessionId,
    sessionKey: seed.sessionKey,
    createdAt: seed.createdAt ?? now,
    updatedAt: now,
    toolResultsSeen: seed.toolResultsSeen ?? 0,
    captured: seed.captured ?? 0,
    lastSeenAt: seed.lastSeenAt,
    lastCapturedAt: seed.lastCapturedAt,
    recentCaptures: seed.recentCaptures ?? [],
    recentEvaluations: seed.recentEvaluations ?? [],
    lastError: seed.lastError,
  };
}

export function pruneOldEntries(buffer: SessionBuffer, nowMs: number): SessionBuffer {
  const hourAgo = nowMs - 60 * 60 * 1000;
  const recentCaptures = buffer.recentCaptures.filter((c) => Date.parse(c.ts) >= hourAgo);
  const recentEvaluations = buffer.recentEvaluations.slice(-50);
  return { ...buffer, recentCaptures, recentEvaluations };
}

// ────────────────────────────────────────────────────────────────────────────
// Gate check
// ────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a capture is allowed given the current buffer state and config.
 */
export function checkGates(buffer: SessionBuffer, config: GatesConfig): GateResult {
  const nowMs = Date.now();

  // Check minimum interval since last capture
  if (buffer.lastCapturedAt) {
    const last = Date.parse(buffer.lastCapturedAt);
    if (Number.isFinite(last) && nowMs - last < config.minIntervalMs) {
      return { allowed: false, reason: "min_interval" };
    }
  }

  // Check max captures per hour
  if (buffer.recentCaptures.length >= config.maxCapturesPerHour) {
    return {
      allowed: false,
      reason: "max_per_hour",
      detail: `${buffer.recentCaptures.length}/${config.maxCapturesPerHour}`,
    };
  }

  return { allowed: true };
}

/**
 * Record a successful capture in the buffer.
 */
export function recordCapture(
  buffer: SessionBuffer,
  params: { toolName: string; score: number; recordId: string },
): SessionBuffer {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const updated = {
    ...buffer,
    captured: buffer.captured + 1,
    lastCapturedAt: now,
    updatedAt: now,
    recentCaptures: [
      ...buffer.recentCaptures,
      { ts: now, toolName: params.toolName, score: params.score, recordId: params.recordId },
    ],
  };
  return pruneOldEntries(updated, nowMs);
}

/**
 * Record an evaluation result in the buffer.
 */
export function recordEvaluation(
  buffer: SessionBuffer,
  params: {
    toolName: string;
    score: number;
    recommendation: "capture" | "skip";
    reason?: string;
  },
): SessionBuffer {
  const now = new Date().toISOString();
  const evaluations = [
    ...buffer.recentEvaluations,
    {
      ts: now,
      toolName: params.toolName,
      score: params.score,
      recommendation: params.recommendation,
      reason: params.reason,
    },
  ];
  // Keep only the last 50
  if (evaluations.length > 50) {
    evaluations.splice(0, evaluations.length - 50);
  }
  return {
    ...buffer,
    recentEvaluations: evaluations,
    updatedAt: now,
  };
}
