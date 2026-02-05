import { loadModelCatalog } from "./model-catalog.js";
import { discoverAntigravityModels } from "./providers/antigravity.js";
import { discoverCursorModels } from "./providers/cursor.js";
import { discoverWindsurfModels } from "./providers/windsurf.js";

/**
 * Runtime guard that prefers configured daily rotation / discovered free models
 * and enforces an expiry guard for temporary free models.
 */
export async function resolvePreferredModels(opts?: { includeProviders?: boolean }) {
  const catalog = await loadModelCatalog();
  const results: string[] = [];

  // local catalog entries first
  for (const entry of catalog) {
    const p = entry.provider.toLowerCase();
    if (p.includes("windsurf") || p.includes("cursor") || p.includes("antigravity")) {
      results.push(`${entry.provider}/${entry.id}`);
    }
  }

  if (opts?.includeProviders !== false) {
    try {
      const ws = await discoverWindsurfModels().catch(() => []);
      for (const m of ws) results.push(`${m.provider}/${m.id}`);
    } catch {}
    try {
      const cs = await discoverCursorModels().catch(() => []);
      for (const m of cs) results.push(`${m.provider}/${m.id}`);
    } catch {}
    try {
      const ag = await discoverAntigravityModels().catch(() => []);
      for (const m of ag) results.push(`${m.provider}/${m.id}`);
    } catch {}
  }

  // de-dupe while preserving order
  return Array.from(new Set(results));
}

export function isModelAllowedByExpiry(modelRef: string) {
  // If a model-ref encodes a temporary tag or date, enforce expiry.
  // Example pattern: provider/model:temp:2026-02-07
  const parts = modelRef.split(":");
  if (parts.length < 3) return true;
  const marker = parts[1];
  const datePart = parts[2];
  if (marker !== "temp") return true;
  const expiry = Date.parse(datePart);
  if (Number.isNaN(expiry)) return true;
  return Date.now() <= expiry;
}

export default { resolvePreferredModels, isModelAllowedByExpiry };
