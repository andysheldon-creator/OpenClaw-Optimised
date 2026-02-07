/**
 * Heuristic Phenomenology Extraction
 *
 * When LLM extraction is unavailable or times out, derive basic
 * phenomenology from event characteristics. This provides a minimal
 * but consistent baseline.
 */

import type { MeridiaEvent } from "../event/normalizer.js";
import type { Phenomenology } from "../types.js";

// ────────────────────────────────────────────────────────────────────────────
// Tool → emotion mapping
// ────────────────────────────────────────────────────────────────────────────

const ERROR_EMOTIONS = ["concerned", "frustrated"] as const;
const WRITE_EMOTIONS = ["focused", "engaged"] as const;
const READ_EMOTIONS = ["curious", "calm"] as const;
const MESSAGE_EMOTIONS = ["engaged", "hopeful"] as const;
const EXEC_EMOTIONS = ["focused", "cautious"] as const;
const DEFAULT_EMOTIONS = ["focused"] as const;

function emotionsForTool(toolName: string, isError: boolean): string[] {
  if (isError) return [...ERROR_EMOTIONS];
  const lower = toolName.toLowerCase();
  if (lower === "write" || lower === "edit" || lower === "apply_patch") return [...WRITE_EMOTIONS];
  if (lower === "read" || lower === "tree" || lower === "ripgrep") return [...READ_EMOTIONS];
  if (lower === "message" || lower === "sessions_send") return [...MESSAGE_EMOTIONS];
  if (lower === "bash" || lower === "exec") return [...EXEC_EMOTIONS];
  return [...DEFAULT_EMOTIONS];
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic extractor
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract basic phenomenology from event characteristics without LLM.
 * Returns emotional signature and engagement quality only—
 * anchors, uncertainties, and reconstitutionHints require LLM.
 */
export function extractHeuristicPhenomenology(
  event: MeridiaEvent,
  significance: number,
): Phenomenology {
  const isError = event.tool?.isError ?? false;
  const toolName = event.tool?.name ?? "unknown";

  const primary = emotionsForTool(toolName, isError);
  const intensity = Math.max(0.2, Math.min(1, significance));
  const valence = isError ? -0.3 : significance > 0.7 ? 0.4 : 0.2;

  // Engagement quality derived from significance and error state
  let engagementQuality: Phenomenology["engagementQuality"];
  if (isError) {
    engagementQuality = "struggling";
  } else if (significance >= 0.8) {
    engagementQuality = "deep-flow";
  } else if (significance >= 0.6) {
    engagementQuality = "engaged";
  } else {
    engagementQuality = "routine";
  }

  return {
    emotionalSignature: {
      primary,
      intensity,
      valence,
    },
    engagementQuality,
    // No anchors, uncertainties, or reconstitutionHints from heuristics
  };
}
