/**
 * Configuration resolution for hierarchical memory.
 */

import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { parseDurationMs } from "../../cli/parse-duration.js";
import { DEFAULT_HIERARCHICAL_MEMORY_CONFIG, type HierarchicalMemoryConfig } from "./types.js";

/** Parse workerInterval string or fall back to workerIntervalMs / default */
function resolveWorkerIntervalMs(raw: {
  workerInterval?: string;
  workerIntervalMs?: number;
}): number {
  if (raw.workerInterval) {
    try {
      return parseDurationMs(raw.workerInterval, { defaultUnit: "m" });
    } catch {
      // Fall through to workerIntervalMs or default
    }
  }
  return raw.workerIntervalMs ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.workerIntervalMs;
}

/** Resolve hierarchical memory config with defaults */
export function resolveHierarchicalMemoryConfig(cfg?: OpenClawConfig): HierarchicalMemoryConfig {
  const raw = cfg?.agents?.defaults?.hierarchicalMemory;

  if (!raw) {
    return DEFAULT_HIERARCHICAL_MEMORY_CONFIG;
  }

  return {
    enabled: raw.enabled ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.enabled,
    workerIntervalMs: resolveWorkerIntervalMs(raw),
    chunkTokens: raw.chunkTokens ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.chunkTokens,
    summaryTargetTokens:
      raw.summaryTargetTokens ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.summaryTargetTokens,
    mergeThreshold: raw.mergeThreshold ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.mergeThreshold,
    pruningBoundaryTokens:
      raw.pruningBoundaryTokens ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.pruningBoundaryTokens,
    model: raw.model,
    maxLevels: raw.maxLevels ?? DEFAULT_HIERARCHICAL_MEMORY_CONFIG.maxLevels,
  };
}

/** Check if hierarchical memory is enabled */
export function isHierarchicalMemoryEnabled(cfg?: OpenClawConfig): boolean {
  return cfg?.agents?.defaults?.hierarchicalMemory?.enabled === true;
}
