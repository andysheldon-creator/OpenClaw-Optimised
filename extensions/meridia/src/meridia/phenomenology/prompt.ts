/**
 * Phenomenology LLM Extraction Prompt
 *
 * Structured prompt for extracting experiential facets from tool interactions.
 * Demands JSON output with controlled vocabulary from taxonomy.ts.
 */

import { truncate } from "../sanitize/redact.js";

// ────────────────────────────────────────────────────────────────────────────
// Prompt template
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the LLM prompt for phenomenological extraction.
 * Tighter than open-ended generation; demands structured JSON with controlled vocabulary.
 */
export function buildPhenomenologyPrompt(params: {
  toolName: string;
  isError: boolean;
  score: number;
  reason?: string;
  argsSummary?: string;
  resultSummary?: string;
}): string {
  const parts: string[] = [
    "Extract experiential facets from this tool interaction.",
    "Return ONLY valid JSON. No markdown, no explanation.",
    "",
    `Tool: ${params.toolName} | Error: ${params.isError} | Significance: ${params.score.toFixed(2)}`,
    params.reason ? `Reason: ${params.reason}` : "",
    params.argsSummary ? `Args: ${truncate(params.argsSummary, 2000)}` : "",
    params.resultSummary ? `Result: ${truncate(params.resultSummary, 3000)}` : "",
    "",
    "JSON schema:",
    "{",
    '  "emotionalSignature": {',
    '    "primary": ["emotion1"],',
    '    "intensity": 0.5,',
    '    "valence": 0.0,',
    '    "texture": "word"',
    "  },",
    '  "engagementQuality": "engaged",',
    '  "anchors": [',
    '    {"phrase": "concrete phrase", "significance": "why it matters", "sensoryChannel": "conceptual"}',
    "  ],",
    '  "uncertainties": [],',
    '  "reconstitutionHints": []',
    "}",
    "",
    "Constraints:",
    "- primary: 1-3 from [calm, contemplative, curious, focused, engaged, tender, hopeful, satisfied, relieved, excited, surprised, uncertain, cautious, concerned, frustrated, struggling, overwhelmed]",
    "- intensity: 0.0-1.0",
    "- valence: -1.0 (painful) to 1.0 (positive)",
    "- texture: one of [spacious, dense, flowing, turbulent, crystalline, heavy, sharp, warm, electric, still, tangled, bright]",
    "- engagementQuality: one of [deep-flow, engaged, routine, distracted, struggling]",
    "- sensoryChannel: one of [verbal, visual, somatic, conceptual, relational]",
    "- anchors: 1-2 concrete phrases from the interaction that could help re-enter this state",
    "- uncertainties: 0-2 open questions",
    "- reconstitutionHints: 0-2 short hints for approaching this memory later",
  ];

  return parts.filter(Boolean).join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from an LLM response string.
 */
export function extractJsonFromResponse(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
