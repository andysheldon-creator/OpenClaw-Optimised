/**
 * Shared utilities and state for humanization hooks.
 *
 * Provides a lightweight facade over the HumanizationService so hooks
 * can query profiles, update state, etc. without importing the full service
 * or managing its lifecycle.
 *
 * All hooks check `isHumanizationEnabled()` first and bail out as a no-op
 * if the system is disabled or unavailable.
 */

import type { AgentHumanizationProfile, EnergyState } from "../models/types.js";

// ---------------------------------------------------------------------------
// Service interface — duck-typed so hooks don't depend on the concrete class.
// ---------------------------------------------------------------------------

/**
 * Minimal contract the hooks need from the humanization service.
 * This avoids a hard import of the HumanizationService class and allows
 * for easy mocking / testing.
 */
export interface HumanizationServiceLike {
  getAgentProfile(agentId: string): Promise<AgentHumanizationProfile>;
  // Future methods will be added here as managers are built:
  // updateEnergyState(agentId, delta): Promise<void>;
  // recordDecision(log: DecisionLog): Promise<void>;
  // updateReputation(agentId, delta): Promise<void>;
  // etc.
}

// ---------------------------------------------------------------------------
// Global state — set once during gateway startup via `registerHumanizationService`.
// ---------------------------------------------------------------------------

let _enabled = false;
let _service: HumanizationServiceLike | null = null;

/**
 * Called during gateway startup to make the humanization system available
 * to all hooks.  If this is never called (or called with `null`), every
 * hook becomes a no-op.
 */
export function registerHumanizationService(service: HumanizationServiceLike | null): void {
  _service = service;
  _enabled = service !== null;
}

/**
 * Disable the humanization system at runtime (e.g. after a fatal DB error).
 */
export function disableHumanization(): void {
  _enabled = false;
}

export function isHumanizationEnabled(): boolean {
  return _enabled && _service !== null;
}

export function getHumanizationService(): HumanizationServiceLike | null {
  return _enabled ? _service : null;
}

// ---------------------------------------------------------------------------
// Fire-and-forget helper — wraps async work that must not block the pipeline.
// ---------------------------------------------------------------------------

/**
 * Schedule non-critical async work that must not block the agent pipeline.
 * Errors are swallowed and logged.
 *
 * Uses `setImmediate` to yield to the event loop so the caller returns
 * immediately.  If `setImmediate` is unavailable (unlikely in Node), falls
 * back to `queueMicrotask`.
 */
export function fireAndForget(label: string, fn: () => Promise<void>): void {
  const run = () => {
    fn().catch((err) => {
      console.error(
        `[humanization:${label}] Background task error:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  };

  if (typeof setImmediate === "function") {
    setImmediate(run);
  } else {
    queueMicrotask(run);
  }
}

// ---------------------------------------------------------------------------
// Lightweight in-memory stores for hot path data (avoids DB round-trips).
// ---------------------------------------------------------------------------

/**
 * Per-agent energy cache — updated by post-run hook and read by pre-run hook.
 * Avoids hitting Redis/PG on every single turn.
 */
const energyCache = new Map<string, { state: EnergyState; updatedAt: number }>();

const ENERGY_CACHE_TTL_MS = 60_000; // 1 minute

export function getCachedEnergy(agentId: string): EnergyState | undefined {
  const entry = energyCache.get(agentId);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.updatedAt > ENERGY_CACHE_TTL_MS) {
    energyCache.delete(agentId);
    return undefined;
  }
  return entry.state;
}

export function setCachedEnergy(agentId: string, state: EnergyState): void {
  energyCache.set(agentId, { state, updatedAt: Date.now() });
}

/**
 * Per-agent mistake count tracker — used by post-run to detect recurring errors.
 * Key format: `${agentId}::${errorType}`
 */
const mistakeCounts = new Map<string, { count: number; lastSeen: number }>();

const MISTAKE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export function incrementMistakeCount(agentId: string, errorType: string): number {
  const key = `${agentId}::${errorType}`;
  const existing = mistakeCounts.get(key);
  const now = Date.now();

  if (existing && now - existing.lastSeen < MISTAKE_WINDOW_MS) {
    existing.count += 1;
    existing.lastSeen = now;
    return existing.count;
  }

  mistakeCounts.set(key, { count: 1, lastSeen: now });
  return 1;
}

export function getMistakeCount(agentId: string, errorType: string): number {
  const key = `${agentId}::${errorType}`;
  const existing = mistakeCounts.get(key);
  if (!existing) {
    return 0;
  }
  if (Date.now() - existing.lastSeen > MISTAKE_WINDOW_MS) {
    mistakeCounts.delete(key);
    return 0;
  }
  return existing.count;
}

/**
 * Per-agent-pair interaction tracker for collaboration observer.
 * Tracks recent agreement/challenge patterns.
 */
export interface InteractionRecord {
  type: "agree" | "challenge" | "finalize";
  timestamp: number;
  quality?: string;
}

const pairInteractions = new Map<string, InteractionRecord[]>();

const INTERACTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function pairKey(agent1: string, agent2: string): string {
  return [agent1, agent2].toSorted().join("::");
}

export function recordPairInteraction(
  agent1: string,
  agent2: string,
  record: InteractionRecord,
): void {
  const key = pairKey(agent1, agent2);
  const records = pairInteractions.get(key) ?? [];
  records.push(record);

  // Prune old entries
  const cutoff = Date.now() - INTERACTION_WINDOW_MS;
  const pruned = records.filter((r) => r.timestamp > cutoff);
  pairInteractions.set(key, pruned);
}

export function getPairInteractions(agent1: string, agent2: string): InteractionRecord[] {
  const key = pairKey(agent1, agent2);
  const records = pairInteractions.get(key) ?? [];
  const cutoff = Date.now() - INTERACTION_WINDOW_MS;
  return records.filter((r) => r.timestamp > cutoff);
}

/**
 * Decision success tracker — used to detect patterns worth converting to intuition rules.
 * Key format: `${agentId}::${approachType}`
 */
const successCounts = new Map<string, { count: number; lastSeen: number }>();

export function incrementSuccessCount(agentId: string, approachType: string): number {
  const key = `${agentId}::${approachType}`;
  const existing = successCounts.get(key);
  const now = Date.now();

  if (existing && now - existing.lastSeen < MISTAKE_WINDOW_MS) {
    existing.count += 1;
    existing.lastSeen = now;
    return existing.count;
  }

  successCounts.set(key, { count: 1, lastSeen: now });
  return 1;
}

export function getSuccessCount(agentId: string, approachType: string): number {
  const key = `${agentId}::${approachType}`;
  const existing = successCounts.get(key);
  if (!existing) {
    return 0;
  }
  if (Date.now() - existing.lastSeen > MISTAKE_WINDOW_MS) {
    successCounts.delete(key);
    return 0;
  }
  return existing.count;
}
