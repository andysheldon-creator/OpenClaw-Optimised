import type { OpenClawConfig } from "../config/config.js";

export const DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR = 40_000;

/**
 * Default fraction of the context window to reserve for compaction headroom.
 * A ratio of 0.20 means compaction triggers when 80% of the context is used,
 * keeping conversations smaller and reducing per-turn input token costs.
 */
export const DEFAULT_PI_COMPACTION_RESERVE_RATIO = 0.2;

type PiSettingsManagerLike = {
  getCompactionReserveTokens: () => number;
  applyOverrides: (overrides: { compaction: { reserveTokens: number } }) => void;
};

export function ensurePiCompactionReserveTokens(params: {
  settingsManager: PiSettingsManagerLike;
  minReserveTokens?: number;
  contextWindowTokens?: number;
  proactiveCompactionRatio?: number;
}): { didOverride: boolean; reserveTokens: number } {
  const floor = params.minReserveTokens ?? DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR;
  const ratio = params.proactiveCompactionRatio ?? DEFAULT_PI_COMPACTION_RESERVE_RATIO;
  const contextWindow = params.contextWindowTokens ?? 0;

  // Adaptive reserve: use the larger of the fixed floor or a fraction of the context window
  const adaptiveReserve =
    contextWindow > 0 ? Math.max(floor, Math.floor(contextWindow * ratio)) : floor;

  const current = params.settingsManager.getCompactionReserveTokens();

  if (current >= adaptiveReserve) {
    return { didOverride: false, reserveTokens: current };
  }

  params.settingsManager.applyOverrides({
    compaction: { reserveTokens: adaptiveReserve },
  });

  return { didOverride: true, reserveTokens: adaptiveReserve };
}

export function resolveCompactionReserveTokensFloor(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.compaction?.reserveTokensFloor;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR;
}

export function resolveProactiveCompactionRatio(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.compaction?.proactiveCompactionRatio;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0.1 && raw <= 0.5) {
    return raw;
  }
  return DEFAULT_PI_COMPACTION_RESERVE_RATIO;
}
