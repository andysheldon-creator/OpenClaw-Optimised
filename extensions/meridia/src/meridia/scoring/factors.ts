/**
 * Memory Relevance Scoring System — Factor Implementations
 *
 * Each factor scorer takes a ScoringContext and returns a raw score (0..1)
 * with a human-readable reason.
 */

import type { ScoringContext, ScoringFactor, ScoringWeights } from "./types.js";

type FactorResult = { score: number; reason: string };

// ────────────────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function summarizeSize(value: unknown): number {
  if (value === undefined || value === null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  if (pattern.startsWith("*")) {
    return value.endsWith(pattern.slice(1));
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Novelty Score
// ────────────────────────────────────────────────────────────────────────────

/**
 * Novelty: Is this new information or repetition of recent activity?
 *
 * Heuristic signals:
 * - Same tool used repeatedly → lower novelty
 * - Time since last capture of same tool → longer gaps = higher novelty
 * - Different tool from recent pattern → higher novelty
 */
export function scoreNovelty(ctx: ScoringContext): FactorResult {
  const recent = ctx.recentCaptures ?? [];
  if (recent.length === 0) {
    return { score: 0.8, reason: "no_prior_captures" };
  }

  const toolName = ctx.tool.name.toLowerCase();
  const sameTool = recent.filter((c) => c.toolName.toLowerCase() === toolName);

  if (sameTool.length === 0) {
    return { score: 0.75, reason: "first_use_of_tool_in_session" };
  }

  // How many of the last 5 captures are the same tool?
  const lastFive = recent.slice(-5);
  const sameInLastFive = lastFive.filter((c) => c.toolName.toLowerCase() === toolName).length;
  const repetitionRatio = sameInLastFive / lastFive.length;

  // Time since last capture of this tool
  const lastSameTool = sameTool[sameTool.length - 1];
  const timeSinceMs = lastSameTool ? Date.now() - Date.parse(lastSameTool.ts) : Infinity;
  const timeDecay = Math.min(1, timeSinceMs / (30 * 60 * 1000)); // Normalize to 30min

  // Higher repetition → lower novelty; longer gap → higher novelty
  const noveltyScore = clamp01((1 - repetitionRatio * 0.7) * (0.3 + timeDecay * 0.7));

  if (repetitionRatio > 0.6) {
    return { score: noveltyScore, reason: `high_repetition:${sameInLastFive}/${lastFive.length}` };
  }

  return { score: noveltyScore, reason: `recent_diversity:${(1 - repetitionRatio).toFixed(2)}` };
}

// ────────────────────────────────────────────────────────────────────────────
// Impact Score
// ────────────────────────────────────────────────────────────────────────────

/**
 * Impact: Does this change understanding or behavior?
 *
 * Heuristic signals:
 * - Tool type (writes > reads, errors > successes)
 * - Result size (larger results may indicate significant operations)
 * - Error status (errors always have impact)
 * - Tool meta (deployment, migration, etc.)
 */
const HIGH_IMPACT_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch", // File mutations
  "exec",
  "bash", // Shell commands
  "message",
  "sessions_send",
  "sessions_spawn", // External comms
  "slackrichmessage",
  "askslackquestion",
  "askslackform",
  "askslackconfirmation", // Slack comms (lowercased to match .toLowerCase())
  "cron", // Scheduled jobs
  "gateway", // Infrastructure changes
  "voice_call", // Voice calls
]);

const MEDIUM_IMPACT_TOOLS = new Set([
  "browser", // Web interaction
  "web_fetch",
  "web_search", // Web research
  "image_generate", // Content creation
  "work_item",
  "work_queue", // Task management
]);

const LOW_IMPACT_TOOLS = new Set([
  "read",
  "tree",
  "ripgrep", // Read-only operations
  "memory_query",
  "memory_context_pack", // Memory reads
  "experience_search",
  "experience_reflect", // Experience reads
  "session_status",
  "sessions_list", // Status checks
]);

const HIGH_IMPACT_META_KEYWORDS = [
  "deploy",
  "migration",
  "release",
  "rollback",
  "delete",
  "drop",
  "production",
  "hotfix",
  "security",
  "breaking",
];

export function scoreImpact(ctx: ScoringContext): FactorResult {
  const toolName = ctx.tool.name.toLowerCase();
  let score = 0.3; // baseline
  let reason = "baseline";

  // Error always bumps impact
  if (ctx.tool.isError) {
    score = Math.max(score, 0.7);
    reason = "tool_error";
  }

  // Tool category
  if (HIGH_IMPACT_TOOLS.has(toolName)) {
    score = Math.max(score, 0.65);
    reason = reason === "tool_error" ? reason : "high_impact_tool";
  } else if (MEDIUM_IMPACT_TOOLS.has(toolName)) {
    score = Math.max(score, 0.45);
    reason = reason === "tool_error" ? reason : "medium_impact_tool";
  } else if (LOW_IMPACT_TOOLS.has(toolName)) {
    score = Math.min(score, 0.25);
    reason = reason === "tool_error" ? reason : "low_impact_tool";
  }

  // Check meta for high-impact keywords
  if (ctx.tool.meta) {
    const metaLower = ctx.tool.meta.toLowerCase();
    for (const keyword of HIGH_IMPACT_META_KEYWORDS) {
      if (metaLower.includes(keyword)) {
        score = Math.max(score, 0.8);
        reason = `high_impact_meta:${keyword}`;
        break;
      }
    }
  }

  // Result size signal
  const resultSize = summarizeSize(ctx.result);
  if (resultSize > 10_000) {
    score = Math.max(score, 0.5);
    if (reason === "baseline") reason = "large_result";
  }

  return { score: clamp01(score), reason };
}

// ────────────────────────────────────────────────────────────────────────────
// Relational Score
// ────────────────────────────────────────────────────────────────────────────

/**
 * Relational: Does this connect to known entities or concepts?
 *
 * Heuristic signals:
 * - Content tags present → higher relational value
 * - Summary references people, projects, tools → higher relational value
 * - File paths in args → entities to relate
 */
const RELATIONAL_KEYWORDS = [
  "user",
  "david",
  "customer",
  "team",
  "project",
  "repo",
  "branch",
  "deploy",
  "api",
  "endpoint",
  "database",
  "server",
  "client",
  "pr",
  "issue",
  "ticket",
  "bug",
  "feature",
];

export function scoreRelational(ctx: ScoringContext): FactorResult {
  let score = 0.2; // baseline
  const signals: string[] = [];

  // Tags boost relational score
  const tags = ctx.contentTags ?? [];
  if (tags.length > 0) {
    score = Math.max(score, 0.3 + Math.min(0.4, tags.length * 0.1));
    signals.push(`tags:${tags.length}`);
  }

  // Summary with relational keywords
  const summary = (ctx.contentSummary ?? "").toLowerCase();
  if (summary) {
    let keywordHits = 0;
    for (const kw of RELATIONAL_KEYWORDS) {
      if (summary.includes(kw)) keywordHits++;
    }
    if (keywordHits > 0) {
      score = Math.max(score, 0.3 + Math.min(0.5, keywordHits * 0.1));
      signals.push(`keywords:${keywordHits}`);
    }
  }

  // Check args for file paths (entity-like references)
  const argsStr = typeof ctx.args === "string" ? ctx.args : JSON.stringify(ctx.args ?? "");
  const pathMatches = argsStr.match(/(?:\/[\w.-]+)+/g) ?? [];
  if (pathMatches.length > 0) {
    score = Math.max(score, 0.35);
    signals.push(`paths:${pathMatches.length}`);
  }

  // Check for URLs (external entity references)
  const urlMatches = argsStr.match(/https?:\/\/\S+/g) ?? [];
  if (urlMatches.length > 0) {
    score = Math.max(score, 0.4);
    signals.push(`urls:${urlMatches.length}`);
  }

  const reason = signals.length > 0 ? signals.join(",") : "no_relational_signals";
  return { score: clamp01(score), reason };
}

// ────────────────────────────────────────────────────────────────────────────
// Temporal Score
// ────────────────────────────────────────────────────────────────────────────

/**
 * Temporal: Is this time-sensitive or evergreen?
 *
 * Heuristic signals:
 * - Time of day (work hours = more intentional activity)
 * - Session duration (longer sessions = more context)
 * - Burst detection (rapid fire tool calls = exploratory, less relevant)
 */
export function scoreTemporal(ctx: ScoringContext): FactorResult {
  const now = new Date();
  const hour = now.getHours();
  let score = 0.4; // baseline
  let reason = "standard_time";

  // Work hours (roughly 8am-10pm) get slight boost
  if (hour >= 8 && hour <= 22) {
    score = 0.5;
    reason = "work_hours";
  } else {
    // Late night/early morning activity might be important (unusual)
    score = 0.55;
    reason = "off_hours_unusual";
  }

  // Check for rapid-fire captures (burst detection)
  const recent = ctx.recentCaptures ?? [];
  if (recent.length >= 3) {
    const lastThree = recent.slice(-3);
    const firstTs = Date.parse(lastThree[0].ts);
    const lastTs = Date.parse(lastThree[lastThree.length - 1].ts);
    const spanMs = lastTs - firstTs;

    if (Number.isFinite(spanMs) && spanMs < 30_000) {
      // 3 captures in under 30 seconds = burst, lower temporal relevance
      score = Math.max(0.15, score - 0.25);
      reason = "burst_detected";
    } else if (Number.isFinite(spanMs) && spanMs > 5 * 60_000) {
      // Spread out captures = deliberate, slightly higher
      score = Math.min(1, score + 0.1);
      reason = "deliberate_pacing";
    }
  }

  return { score: clamp01(score), reason };
}

// ────────────────────────────────────────────────────────────────────────────
// User Intent Score
// ────────────────────────────────────────────────────────────────────────────

/**
 * User Intent: Was this explicitly marked important?
 *
 * Signals:
 * - Manual capture via experience_capture tool → maximum intent
 * - Tool meta containing "important" or "remember" → high intent
 * - Heuristic score already high → some implicit intent
 */
export function scoreUserIntent(ctx: ScoringContext): FactorResult {
  // Explicit user marking
  if (ctx.userMarkedImportant) {
    return { score: 1.0, reason: "user_marked_important" };
  }

  // Check if this is a manual capture
  if (ctx.tool.name === "experience_capture") {
    return { score: 0.95, reason: "manual_capture" };
  }

  // Check meta for intent signals
  if (ctx.tool.meta) {
    const metaLower = ctx.tool.meta.toLowerCase();
    if (metaLower.includes("important") || metaLower.includes("remember")) {
      return { score: 0.8, reason: "intent_keyword_in_meta" };
    }
    if (metaLower.includes("decision") || metaLower.includes("concluded")) {
      return { score: 0.7, reason: "decision_keyword_in_meta" };
    }
  }

  // If heuristic already scored high, there's implicit intent
  if (ctx.heuristicEval && ctx.heuristicEval.score >= 0.7) {
    return { score: 0.5, reason: "high_heuristic_implicit_intent" };
  }

  // Default: no explicit intent signal
  return { score: 0.2, reason: "no_explicit_intent" };
}

// ────────────────────────────────────────────────────────────────────────────
// Composite Factor Computation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute all factor scores for a given context.
 */
export function computeAllFactors(ctx: ScoringContext, weights: ScoringWeights): ScoringFactor[] {
  const factors: Array<{ name: keyof ScoringWeights; fn: (ctx: ScoringContext) => FactorResult }> =
    [
      { name: "novelty", fn: scoreNovelty },
      { name: "impact", fn: scoreImpact },
      { name: "relational", fn: scoreRelational },
      { name: "temporal", fn: scoreTemporal },
      { name: "userIntent", fn: scoreUserIntent },
    ];

  return factors.map(({ name, fn }) => {
    const { score, reason } = fn(ctx);
    const weight = weights[name];
    return {
      name,
      rawScore: score,
      weight,
      weighted: score * weight,
      reason,
    };
  });
}

export { matchesGlob };
