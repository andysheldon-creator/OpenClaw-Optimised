/**
 * Shared micro/utility model resolution.
 *
 * Provides a configurable fallback chain for lightweight LLM utility calls
 * (slug generation, session descriptions, etc.):
 *   per-feature config → global utilityModel → micro-auto scoring → primary model
 */

import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentDir } from "./agent-scope.js";
import { ensureAuthProfileStore } from "./auth-profiles.js";
import { DEFAULT_PROVIDER } from "./defaults.js";
import { isProviderConfigured } from "./model-auth.js";
import { loadModelCatalog } from "./model-catalog.js";
import {
  type ModelRef,
  buildModelAliasIndex,
  resolveDefaultModelForAgent,
  resolveModelRefFromString,
} from "./model-selection.js";

// ── Micro-model scoring ────────────────────────────────────────────

/** Score a model id by how lightweight/cheap it is (higher = cheaper). */
export function scoreMicroModelId(id: string): number {
  const lower = id.toLowerCase();
  let score = 0;
  if (lower.includes("gpt-4.1-nano")) {
    score += 250;
  }
  if (lower.includes("nano")) {
    score += 180;
  }
  if (lower.includes("mini")) {
    score += 120;
  }
  if (lower.includes("haiku")) {
    score += 110;
  }
  if (lower.includes("small")) {
    score += 70;
  }
  if (lower.includes("fast") || lower.includes("lite") || lower.includes("turbo")) {
    score += 40;
  }
  if (lower.includes("o1") || lower.includes("opus") || lower.includes("sonnet")) {
    score -= 80;
  }
  if (lower.includes("pro")) {
    score -= 20;
  }
  return score;
}

// ── Micro-model auto-resolution ────────────────────────────────────

/**
 * Auto-select the cheapest available model from the catalog.
 * Returns null when no positively-scored model has working auth.
 */
export async function resolveMicroModelRef(
  cfg: OpenClawConfig,
  agentId?: string,
): Promise<ModelRef | null> {
  try {
    const catalog = await loadModelCatalog({ config: cfg });
    if (catalog.length === 0) {
      return null;
    }

    const effectiveAgentId = agentId ?? "main";
    const agentDir = resolveAgentDir(cfg, effectiveAgentId);
    const store = ensureAuthProfileStore(agentDir);
    const availableModels = catalog.filter((m) =>
      isProviderConfigured({ provider: m.provider, cfg, store, agentDir }),
    );

    if (availableModels.length === 0) {
      return null;
    }

    const best = availableModels
      .map((m) => ({ m, score: scoreMicroModelId(m.id) }))
      .filter((x) => x.score > 0)
      .toSorted((a, b) => b.score - a.score)[0]?.m;
    if (!best) {
      return null;
    }
    return { provider: best.provider, model: best.id };
  } catch {
    return null;
  }
}

// ── Config-driven utility model resolution ─────────────────────────

export type UtilityFeatureKey = "slugGenerator" | "sessionDescription";

/**
 * Resolve a config string (provider/model or alias) to a ModelRef
 * using the model alias index.
 */
function resolveModelRefFromConfigString(cfg: OpenClawConfig, raw: string): ModelRef | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const aliasIndex = buildModelAliasIndex({ cfg, defaultProvider: DEFAULT_PROVIDER });
  const resolved = resolveModelRefFromString({
    raw: trimmed,
    defaultProvider: DEFAULT_PROVIDER,
    aliasIndex,
  });
  return resolved?.ref ?? null;
}

/**
 * Resolve a model for utility/background LLM calls with a 4-level fallback chain:
 *   1. Per-feature config  (agents.defaults.utility.<feature>.model)
 *   2. Global utilityModel (agents.defaults.utilityModel)
 *   3. Micro-auto scoring  (cheapest available model from catalog)
 *   4. Primary model       (resolveDefaultModelForAgent — last resort)
 */
export async function resolveUtilityModelRef(params: {
  cfg: OpenClawConfig;
  feature?: UtilityFeatureKey;
  agentId?: string;
}): Promise<ModelRef> {
  const { cfg, feature, agentId } = params;
  const defaults = cfg.agents?.defaults;

  // 1. Per-feature config
  if (feature) {
    const featureModel = defaults?.utility?.[feature]?.model;
    if (featureModel) {
      const ref = resolveModelRefFromConfigString(cfg, featureModel);
      if (ref) {
        return ref;
      }
    }
  }

  // 2. Global utilityModel
  const globalUtility = defaults?.utilityModel;
  if (globalUtility) {
    const ref = resolveModelRefFromConfigString(cfg, globalUtility);
    if (ref) {
      return ref;
    }
  }

  // 3. Micro-auto scoring
  const micro = await resolveMicroModelRef(cfg, agentId);
  if (micro) {
    return micro;
  }

  // 4. Primary model fallback
  return resolveDefaultModelForAgent({ cfg, agentId });
}
