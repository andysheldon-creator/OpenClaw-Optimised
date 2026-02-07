import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { completeTextWithModelRef } from "openclaw/plugin-sdk";
import type { ScoringBreakdown, ScoringConfig, ScoringContext } from "./scoring/types.js";
import type { MeridiaEvaluation, MeridiaToolResultContext, Phenomenology } from "./types.js";
import { sanitizeForPersistence } from "./sanitize.js";
import {
  evaluateMemoryRelevance,
  shouldCapture as checkShouldCapture,
  isHighValue as checkIsHighValue,
  shouldUseLlmEval as checkShouldUseLlmEval,
  breakdownToTrace,
  formatBreakdown,
} from "./scoring/scorer.js";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function clampRange(value: number, min: number, max: number): number {
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

function summarize(value: unknown, maxChars: number): string {
  if (value === undefined) {
    return "";
  }
  let raw = "";
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, maxChars - 12))}…(truncated)`;
}

function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Local asObject to avoid circular import with event.ts
function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Phenomenology Parsing & Extraction
// ────────────────────────────────────────────────────────────────────────────

const VALID_ENGAGEMENT_QUALITIES = new Set([
  "deep-flow",
  "engaged",
  "routine",
  "distracted",
  "struggling",
]);

/** Parse and validate a raw phenomenology object from LLM output. */
export function parsePhenomenology(raw: unknown): Phenomenology | undefined {
  const obj = asObject(raw);
  if (!obj) return undefined;

  const result: Phenomenology = {};
  let hasContent = false;

  // emotionalSignature
  const sigRaw = asObject(obj.emotionalSignature);
  if (sigRaw) {
    const primary = Array.isArray(sigRaw.primary)
      ? (sigRaw.primary.filter((s): s is string => typeof s === "string") as string[])
      : [];
    if (primary.length > 0) {
      const secondary = Array.isArray(sigRaw.secondary)
        ? (sigRaw.secondary.filter((s): s is string => typeof s === "string") as string[])
        : undefined;
      const intensity = typeof sigRaw.intensity === "number" ? clamp01(sigRaw.intensity) : 0.5;
      const valence =
        typeof sigRaw.valence === "number" ? clampRange(sigRaw.valence, -1, 1) : undefined;
      const texture = typeof sigRaw.texture === "string" ? sigRaw.texture : undefined;
      result.emotionalSignature = { primary, intensity };
      if (secondary && secondary.length > 0) result.emotionalSignature.secondary = secondary;
      if (valence !== undefined) result.emotionalSignature.valence = valence;
      if (texture) result.emotionalSignature.texture = texture;
      hasContent = true;
    }
  }

  // engagementQuality
  if (
    typeof obj.engagementQuality === "string" &&
    VALID_ENGAGEMENT_QUALITIES.has(obj.engagementQuality)
  ) {
    result.engagementQuality = obj.engagementQuality as Phenomenology["engagementQuality"];
    hasContent = true;
  }

  // anchors
  if (Array.isArray(obj.anchors)) {
    const anchors = obj.anchors
      .map((a) => asObject(a))
      .filter(
        (a): a is Record<string, unknown> =>
          a !== null && typeof a.phrase === "string" && typeof a.significance === "string",
      )
      .map((a) => ({
        phrase: a.phrase as string,
        significance: a.significance as string,
        ...(typeof a.sensoryChannel === "string" ? { sensoryChannel: a.sensoryChannel } : {}),
      }));
    if (anchors.length > 0) {
      result.anchors = anchors;
      hasContent = true;
    }
  }

  // uncertainties
  if (Array.isArray(obj.uncertainties)) {
    const uncertainties = obj.uncertainties.filter((s): s is string => typeof s === "string");
    if (uncertainties.length > 0) {
      result.uncertainties = uncertainties;
      hasContent = true;
    }
  }

  // reconstitutionHints
  if (Array.isArray(obj.reconstitutionHints)) {
    const hints = obj.reconstitutionHints.filter((s): s is string => typeof s === "string");
    if (hints.length > 0) {
      result.reconstitutionHints = hints;
      hasContent = true;
    }
  }

  return hasContent ? result : undefined;
}

/** Heuristic phenomenology fallback when LLM is unavailable. */
export function extractHeuristicPhenomenology(
  ctx: MeridiaToolResultContext,
  score: number,
): Phenomenology {
  const isError = ctx.tool.isError;
  const toolName = ctx.tool.name;

  const primary = isError
    ? ["uncertain", "attentive"]
    : score >= 0.7
      ? ["focused", "engaged"]
      : ["neutral"];
  const valence = isError ? -0.3 : score >= 0.7 ? 0.2 : 0;
  const intensity = isError ? 0.6 : clamp01(score);
  const engagementQuality: Phenomenology["engagementQuality"] = isError
    ? "struggling"
    : score >= 0.8
      ? "engaged"
      : "routine";

  return {
    emotionalSignature: { primary, intensity, valence },
    engagementQuality,
    anchors: [
      {
        phrase: toolName,
        significance: `tool invocation: ${toolName}`,
      },
    ],
    reconstitutionHints: [
      `Agent was working with ${toolName}${isError ? " and encountered an error" : ""}`,
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic Evaluation
// ────────────────────────────────────────────────────────────────────────────

export function evaluateHeuristic(ctx: MeridiaToolResultContext): MeridiaEvaluation {
  const tool = ctx.tool.name.trim().toLowerCase();
  const isError = ctx.tool.isError;
  let score = 0.1;
  let reason = "default";

  if (isError) {
    score = 0.55;
    reason = "tool_error";
  }

  if (tool === "exec" || tool === "bash") {
    score = Math.max(score, 0.5);
    reason = reason === "tool_error" ? reason : "shell_exec";
  } else if (tool === "write" || tool === "apply_patch" || tool === "edit") {
    score = Math.max(score, 0.6);
    reason = reason === "tool_error" ? reason : "filesystem_write";
  } else if (tool === "message" || tool === "sessions_send") {
    score = Math.max(score, 0.65);
    reason = reason === "tool_error" ? reason : "external_message";
  } else if (tool === "browser") {
    score = Math.max(score, 0.35);
    reason = reason === "tool_error" ? reason : "web_browse";
  } else if (tool === "read") {
    score = Math.max(score, 0.15);
    reason = reason === "tool_error" ? reason : "filesystem_read";
  }

  const resultPreviewLen = summarize(ctx.result, 2000).length;
  if (resultPreviewLen > 2000) {
    score = Math.max(score, 0.4);
    reason = reason === "tool_error" ? reason : "large_result";
  }

  const finalScore = clamp01(score);
  return {
    kind: "heuristic",
    score: finalScore,
    reason,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LLM Evaluation (with phenomenology)
// ────────────────────────────────────────────────────────────────────────────

export async function evaluateWithLlm(params: {
  cfg: OpenClawConfig;
  ctx: MeridiaToolResultContext;
  modelRef: string;
  timeoutMs: number;
  extractPhenomenology?: boolean;
}): Promise<MeridiaEvaluation> {
  const startedAt = Date.now();
  const wantPhenom = params.extractPhenomenology !== false;

  const promptLines = [
    "You are scoring whether a tool result should be captured as an experiential continuity record.",
    "Return ONLY valid JSON. No markdown.",
    "",
  ];

  if (wantPhenom) {
    promptLines.push(
      "JSON schema:",
      "{",
      '  "score": 0.0,',
      '  "reason": "short string",',
      '  "phenomenology": {',
      '    "emotionalSignature": {',
      '      "primary": ["focused"],',
      '      "intensity": 0.5,',
      '      "valence": 0.0',
      "    },",
      '    "engagementQuality": "engaged",',
      '    "anchors": [{ "phrase": "key concept", "significance": "why it matters" }],',
      '    "uncertainties": ["what remains unclear"],',
      '    "reconstitutionHints": ["how to restore this context"]',
      "  }",
      "}",
      "",
      "phenomenology fields:",
      "- emotionalSignature.primary: 1-3 emotion words describing the experiential quality",
      "- emotionalSignature.intensity: 0-1 how intense the experience is",
      "- emotionalSignature.valence: -1 to 1 negative to positive",
      '- engagementQuality: one of "deep-flow", "engaged", "routine", "distracted", "struggling"',
      "- anchors: key phrases that would help reconstruct this context later",
      "- uncertainties: what is unclear or unresolved",
      "- reconstitutionHints: instructions for restoring situational awareness",
    );
  } else {
    promptLines.push("JSON schema:", '{ "score": 0.0, "reason": "short string" }');
  }

  promptLines.push(
    "",
    "Guidance: prioritize irreversible changes, external comms, errors, high uncertainty, or decisions affecting future behavior.",
    "",
    `toolName: ${params.ctx.tool.name}`,
    `isError: ${params.ctx.tool.isError ? "true" : "false"}`,
  );

  if (params.ctx.tool.meta) promptLines.push(`meta: ${params.ctx.tool.meta}`);
  if (params.ctx.args !== undefined) {
    promptLines.push(`args: ${summarize(sanitizeForPersistence(params.ctx.args), 3000)}`);
  }
  if (params.ctx.result !== undefined) {
    promptLines.push(`result: ${summarize(sanitizeForPersistence(params.ctx.result), 4000)}`);
  }

  const prompt = promptLines.filter(Boolean).join("\n");

  const res = await completeTextWithModelRef({
    cfg: params.cfg,
    modelRef: params.modelRef,
    prompt,
    timeoutMs: params.timeoutMs,
    maxTokens: wantPhenom ? 800 : 256,
  });

  const parsed = extractFirstJsonObject(res.text);
  const scoreRaw = parsed?.score;
  const score = typeof scoreRaw === "number" ? scoreRaw : Number.NaN;
  if (!Number.isFinite(score)) {
    throw new Error(`LLM returned non-numeric score: ${res.text.slice(0, 200)}`);
  }
  const reason = typeof parsed?.reason === "string" ? parsed.reason : undefined;
  const finalScore = clamp01(score);

  const phenomenology = wantPhenom ? parsePhenomenology(parsed?.phenomenology) : undefined;

  return {
    kind: "llm",
    model: res.model,
    score: finalScore,
    reason,
    durationMs: Date.now() - startedAt,
    phenomenology,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-Factor Relevance Scoring (bridges to scoring/ module)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a ScoringContext from a MeridiaToolResultContext plus optional extras.
 * This bridges the existing hook context to the new scoring system.
 */
export function buildScoringContext(
  ctx: MeridiaToolResultContext,
  extras?: {
    recentCaptures?: ScoringContext["recentCaptures"];
    userMarkedImportant?: boolean;
    contentTags?: string[];
    contentSummary?: string;
    heuristicEval?: { score: number; reason?: string };
  },
): ScoringContext {
  return {
    tool: ctx.tool,
    session: ctx.session,
    args: ctx.args,
    result: ctx.result,
    recentCaptures: extras?.recentCaptures,
    userMarkedImportant: extras?.userMarkedImportant,
    contentTags: extras?.contentTags,
    contentSummary: extras?.contentSummary,
    heuristicEval: extras?.heuristicEval,
  };
}

/**
 * Evaluate memory relevance using the multi-factor scoring system.
 */
export function evaluateRelevance(
  ctx: MeridiaToolResultContext,
  extras?: Parameters<typeof buildScoringContext>[1],
  scoringConfig?: Partial<ScoringConfig>,
): ScoringBreakdown {
  const scoringCtx = buildScoringContext(ctx, extras);
  return evaluateMemoryRelevance(scoringCtx, scoringConfig);
}

// Re-export scoring utilities for convenience
export {
  evaluateMemoryRelevance,
  checkShouldCapture as shouldCaptureMultiFactor,
  checkIsHighValue as isHighValueMultiFactor,
  checkShouldUseLlmEval as shouldUseLlmEvalMultiFactor,
  breakdownToTrace,
  formatBreakdown,
};

export type { ScoringBreakdown, ScoringConfig, ScoringContext };
