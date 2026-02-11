// Lazy-load pi-coding-agent model metadata so we can infer context windows when
// the agent reports a model id. This includes custom models.json entries.

import { loadConfig } from "../config/config.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { ensureOpenClawModelsJson } from "./models-config.js";

type ModelEntry = { id: string; provider?: string; contextWindow?: number };

// Cache context windows by fully-qualified model ref: `${provider}/${id}`.
// Also cache bare ids *only when unambiguous* across providers.
const MODEL_CACHE_BY_REF = new Map<string, number>();
const MODEL_CACHE_BY_ID_UNIQUE = new Map<string, number>();

function modelRefKey(provider: string, id: string): string {
  return `${provider}/${id}`;
}

const loadPromise = (async () => {
  try {
    // NOTE: OpenClaw wraps pi-coding-agent discovery here (instead of importing the SDK directly).
    const { discoverAuthStorage, discoverModels } = await import("./pi-model-discovery.js");
    const cfg = loadConfig();
    await ensureOpenClawModelsJson(cfg);
    const agentDir = resolveOpenClawAgentDir();
    const authStorage = discoverAuthStorage(agentDir);
    const modelRegistry = discoverModels(authStorage, agentDir);
    const models = modelRegistry.getAll() as ModelEntry[];

    const seenById = new Map<string, number>();
    const collidedIds = new Set<string>();

    for (const m of models) {
      const id = m?.id?.trim();
      if (!id) {
        continue;
      }
      const ctx = m.contextWindow;
      if (typeof ctx !== "number" || ctx <= 0) {
        continue;
      }

      const provider = typeof m.provider === "string" ? m.provider.trim() : "";
      if (provider) {
        MODEL_CACHE_BY_REF.set(modelRefKey(provider, id), ctx);
      }

      // Track ambiguity for bare ids.
      if (!seenById.has(id)) {
        seenById.set(id, ctx);
      } else if (seenById.get(id) !== ctx) {
        collidedIds.add(id);
      }
    }

    for (const [id, ctx] of seenById.entries()) {
      if (!collidedIds.has(id)) {
        MODEL_CACHE_BY_ID_UNIQUE.set(id, ctx);
      }
    }
  } catch {
    // If pi-coding-agent isn't available, leave cache empty; lookup will fall back.
  }
})();

export function lookupContextTokens(modelIdOrRef?: string, provider?: string): number | undefined {
  if (!modelIdOrRef) {
    return undefined;
  }

  // Best-effort: kick off loading, but don't block.
  void loadPromise;

  const raw = modelIdOrRef.trim();
  if (!raw) {
    return undefined;
  }

  const normalizeRef = (ref: string): string | undefined => {
    const [providerRaw, ...idParts] = ref.split("/");
    const providerPart = providerRaw?.trim();
    const idPart = idParts.join("/").trim();
    if (!providerPart || !idPart) {
      return undefined;
    }
    return modelRefKey(providerPart, idPart);
  };

  // Preferred: explicit provider + id.
  if (provider && provider.trim() && !raw.includes("/")) {
    return MODEL_CACHE_BY_REF.get(modelRefKey(provider.trim(), raw));
  }

  // If caller passed a fully-qualified ref already.
  if (raw.includes("/")) {
    const normalized = normalizeRef(raw);
    if (!normalized) {
      return undefined;
    }
    return MODEL_CACHE_BY_REF.get(normalized);
  }

  // Last resort: bare id only if unambiguous across providers.
  return MODEL_CACHE_BY_ID_UNIQUE.get(raw);
}
