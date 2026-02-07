/**
 * Reconstitution Engine (Component 11)
 *
 * Builds state-restoration context packs from multiple sources.
 * Replaces the simple bullet-list reconstitute.ts with rich,
 * structured packs that include phenomenology, anchors, and uncertainties.
 *
 * Falls back to the legacy format when no phenomenology data is available.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ReconstitutionPack } from "../types.js";
import { createBackend } from "../db/backends/index.js";
import { hybridRetrieve, type AvailableSources } from "../retrieve/hybrid.js";
import { buildReconstitutionIntent } from "../retrieve/intent.js";
import { buildStructuredPack, renderPackAsMarkdown } from "./pack-builder.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ReconstitutionOptions = {
  maxTokens?: number;
  lookbackHours?: number;
  minScore?: number;
  maxRecords?: number;
  config?: OpenClawConfig;
  sessionKey?: string;
};

export type ReconstitutionResult = {
  text: string;
  pack: ReconstitutionPack;
};

// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_MIN_SCORE = 0.6;
const DEFAULT_MAX_RECORDS = 50;

// ────────────────────────────────────────────────────────────────────────────
// Engine
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a reconstitution pack from available sources.
 * Returns both the structured pack and rendered markdown text.
 */
export async function generateEnhancedReconstitution(
  opts: ReconstitutionOptions = {},
): Promise<ReconstitutionResult | null> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS;

  const backend = createBackend({ cfg: opts.config });

  // Build retrieval intent
  const intent = buildReconstitutionIntent({
    lookbackHours,
    minScore,
    maxResults: maxRecords,
    sessionKey: opts.sessionKey,
  });

  // Set up available sources (canonical always available)
  const sources: AvailableSources = {
    canonical: backend,
    // vector adapter would be injected here when available
  };

  // Retrieve from all sources
  const { results, sourceCounts } = await hybridRetrieve(intent, sources);

  if (results.length === 0) {
    // Fall back to recent records without score filter
    intent.minScore = undefined;
    intent.maxResults = Math.min(maxRecords, 10);
    const fallback = await hybridRetrieve(intent, sources);
    if (fallback.results.length === 0) return null;

    const pack = buildStructuredPack(fallback.results, fallback.sourceCounts, maxTokens);
    const text = renderPackAsMarkdown(pack);
    return { text, pack };
  }

  // Build structured pack
  const pack = buildStructuredPack(results, sourceCounts, maxTokens);
  const text = renderPackAsMarkdown(pack);

  return { text, pack };
}
