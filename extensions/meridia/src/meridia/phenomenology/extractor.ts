/**
 * Phenomenology Extractor (Component 4)
 *
 * Two-pass extraction:
 * - Pass 1 (gate decision): cheap heuristic + optional LLM scoring (existing evaluate.ts)
 * - Pass 2 (this module): full phenomenological extraction via LLM for captured events
 *
 * Only runs on events that pass the capture gate (~10/hour max),
 * amortizing the LLM cost over a small number of high-value events.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { completeTextWithModelRef } from "openclaw/plugin-sdk";
import type { MeridiaEvent } from "../event/normalizer.js";
import type { Phenomenology } from "../types.js";
import { sanitizePayload } from "../sanitize/redact.js";
import { extractHeuristicPhenomenology } from "./heuristic.js";
import { buildPhenomenologyPrompt, extractJsonFromResponse } from "./prompt.js";
import {
  filterToVocab,
  clampToVocab,
  PRIMARY_EMOTIONS,
  ENGAGEMENT_QUALITIES,
  TEXTURE_METAPHORS,
  SENSORY_CHANNELS,
  type PrimaryEmotion,
  type EngagementQuality,
  type TextureMetaphor,
  type SensoryChannel,
} from "./taxonomy.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type PhenomenologyConfig = {
  /** Whether LLM extraction is enabled */
  llmEnabled: boolean;
  /** Model reference for LLM extraction */
  modelRef?: string;
  /** Timeout for LLM extraction (separate from gate timeout) */
  timeoutMs: number;
};

export const DEFAULT_PHENOMENOLOGY_CONFIG: PhenomenologyConfig = {
  llmEnabled: true,
  modelRef: undefined,
  timeoutMs: 8000, // Separate from the 3.5s gate timeout
};

// ────────────────────────────────────────────────────────────────────────────
// LLM extraction
// ────────────────────────────────────────────────────────────────────────────

async function extractLlmPhenomenology(
  event: MeridiaEvent,
  significance: number,
  reason: string | undefined,
  cfg: OpenClawConfig,
  config: PhenomenologyConfig,
): Promise<Phenomenology> {
  const modelRef = config.modelRef;
  if (!modelRef) {
    return extractHeuristicPhenomenology(event, significance);
  }

  const payload = event.payload as { args?: unknown; result?: unknown } | undefined;
  const argsSummary = payload?.args ? sanitizePayload(payload.args, 2000) : undefined;
  const resultSummary = payload?.result ? sanitizePayload(payload.result, 3000) : undefined;

  const prompt = buildPhenomenologyPrompt({
    toolName: event.tool?.name ?? "unknown",
    isError: event.tool?.isError ?? false,
    score: significance,
    reason,
    argsSummary,
    resultSummary,
  });

  const res = await completeTextWithModelRef({
    cfg,
    modelRef,
    prompt,
    timeoutMs: config.timeoutMs,
    maxTokens: 512,
  });

  const parsed = extractJsonFromResponse(res.text);
  if (!parsed) {
    return extractHeuristicPhenomenology(event, significance);
  }

  return parsePhenomenologyResponse(parsed, event, significance);
}

// ────────────────────────────────────────────────────────────────────────────
// Response parsing with taxonomy validation
// ────────────────────────────────────────────────────────────────────────────

function parsePhenomenologyResponse(
  raw: Record<string, unknown>,
  event: MeridiaEvent,
  significance: number,
): Phenomenology {
  const heuristic = extractHeuristicPhenomenology(event, significance);
  const emotionalRaw = raw.emotionalSignature as Record<string, unknown> | undefined;

  // Parse emotional signature
  const primaryRaw = Array.isArray(emotionalRaw?.primary)
    ? (emotionalRaw.primary as string[])
    : undefined;
  const primary = filterToVocab<PrimaryEmotion>(primaryRaw, PRIMARY_EMOTIONS);

  const intensityRaw = emotionalRaw?.intensity;
  const intensity =
    typeof intensityRaw === "number" && intensityRaw >= 0 && intensityRaw <= 1
      ? intensityRaw
      : (heuristic.emotionalSignature?.intensity ?? 0.5);

  const valenceRaw = emotionalRaw?.valence;
  const valence =
    typeof valenceRaw === "number" && valenceRaw >= -1 && valenceRaw <= 1
      ? valenceRaw
      : heuristic.emotionalSignature?.valence;

  const texture = clampToVocab<TextureMetaphor>(
    emotionalRaw?.texture as string | undefined,
    TEXTURE_METAPHORS,
  );

  // Parse engagement quality
  const engagementQuality =
    clampToVocab<EngagementQuality>(
      raw.engagementQuality as string | undefined,
      ENGAGEMENT_QUALITIES,
    ) ?? heuristic.engagementQuality;

  // Parse anchors
  const anchorsRaw = Array.isArray(raw.anchors) ? (raw.anchors as Record<string, unknown>[]) : [];
  const anchors = anchorsRaw
    .filter((a) => typeof a.phrase === "string" && a.phrase.trim())
    .slice(0, 3)
    .map((a) => ({
      phrase: String(a.phrase).trim().slice(0, 200),
      significance: typeof a.significance === "string" ? a.significance.slice(0, 200) : "",
      sensoryChannel: clampToVocab<SensoryChannel>(
        a.sensoryChannel as string | undefined,
        SENSORY_CHANNELS,
      ),
    }));

  // Parse uncertainties
  const uncertaintiesRaw = Array.isArray(raw.uncertainties) ? (raw.uncertainties as unknown[]) : [];
  const uncertainties = uncertaintiesRaw
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, 3)
    .map((u) => u.trim().slice(0, 300));

  // Parse reconstitution hints
  const hintsRaw = Array.isArray(raw.reconstitutionHints)
    ? (raw.reconstitutionHints as unknown[])
    : [];
  const reconstitutionHints = hintsRaw
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .slice(0, 3)
    .map((h) => h.trim().slice(0, 300));

  return {
    emotionalSignature: {
      primary:
        primary.length > 0 ? primary : (heuristic.emotionalSignature?.primary ?? ["focused"]),
      intensity,
      valence,
      texture,
    },
    engagementQuality,
    anchors: anchors.length > 0 ? anchors : undefined,
    uncertainties: uncertainties.length > 0 ? uncertainties : undefined,
    reconstitutionHints: reconstitutionHints.length > 0 ? reconstitutionHints : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract phenomenology for a captured event.
 *
 * Uses LLM extraction when available, falls back to heuristic.
 * Should only be called for events that have passed the capture gate.
 */
export async function extractPhenomenology(
  event: MeridiaEvent,
  significance: number,
  reason: string | undefined,
  cfg: OpenClawConfig | undefined,
  config?: Partial<PhenomenologyConfig>,
): Promise<Phenomenology> {
  const resolved: PhenomenologyConfig = {
    ...DEFAULT_PHENOMENOLOGY_CONFIG,
    ...config,
  };

  if (!resolved.llmEnabled || !resolved.modelRef || !cfg) {
    return extractHeuristicPhenomenology(event, significance);
  }

  try {
    return await extractLlmPhenomenology(event, significance, reason, cfg, resolved);
  } catch {
    // LLM extraction failed; fall back to heuristic
    return extractHeuristicPhenomenology(event, significance);
  }
}
