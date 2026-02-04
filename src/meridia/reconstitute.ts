/**
 * Meridia Session Reconstitution Engine
 *
 * Generates compact "morning briefing" context from recent experiential records.
 * Designed to be injected into new sessions at bootstrap time so the agent
 * starts with continuity from past experiences.
 *
 * Key constraints:
 * - Output must be under a configurable token budget (default: 2000 tokens)
 * - Should prioritize high-significance, recent experiences
 * - Must be fast (runs at session start)
 * - Gracefully handles empty databases or missing SQLite
 */

import type { OpenClawConfig } from "../config/config.js";
import type { MeridiaExperienceRecord } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("meridia/reconstitute");

// ─── Types ───────────────────────────────────────────────────────────

export interface ReconstitutionOptions {
  /** Max approximate token count for output (1 token ≈ 4 chars). Default: 2000 */
  maxTokens?: number;
  /** How far back to look in hours. Default: 48 */
  lookbackHours?: number;
  /** Minimum significance score for inclusion. Default: 0.6 */
  minScore?: number;
  /** Maximum number of records to consider. Default: 50 */
  maxRecords?: number;
  /** Whether to include session summaries. Default: true */
  includeSessions?: boolean;
  /** Whether to include tool usage patterns. Default: true */
  includeToolPatterns?: boolean;
  /** OpenClaw config for DB path resolution */
  config?: OpenClawConfig;
}

export interface ReconstitutionResult {
  /** The formatted reconstitution text ready for injection */
  text: string;
  /** Approximate token count of the text */
  estimatedTokens: number;
  /** Number of experience records included */
  recordCount: number;
  /** Number of sessions referenced */
  sessionCount: number;
  /** Time range of included experiences */
  timeRange: { from: string; to: string } | null;
  /** Whether the result was truncated to fit budget */
  truncated: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_MIN_SCORE = 0.6;
const DEFAULT_MAX_RECORDS = 50;
const CHARS_PER_TOKEN = 4; // rough approximation

// ─── Helpers ─────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return isoStr.slice(0, 16);
  }
}

function extractTopicFromRecord(record: MeridiaExperienceRecord): string {
  // If the record was manually captured, use the topic
  const args = record.data.args as Record<string, unknown> | undefined;
  if (args?.topic && typeof args.topic === "string") {
    return args.topic;
  }

  // Use the evaluation reason as a summary
  if (record.evaluation.reason) {
    const reason = record.evaluation.reason;
    // Truncate long reasons
    return reason.length > 120 ? `${reason.slice(0, 117)}...` : reason;
  }

  // Fallback to tool name + error status
  return `${record.tool.name}${record.tool.isError ? " (error)" : ""}`;
}

// ─── Core Reconstitution Logic ───────────────────────────────────────

/**
 * Generate a reconstitution briefing from recent experiences.
 * Returns null if no experiences are available or SQLite is not supported.
 */
export async function generateReconstitution(
  opts: ReconstitutionOptions = {},
): Promise<ReconstitutionResult | null> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
  const includeSessions = opts.includeSessions ?? true;
  const includeToolPatterns = opts.includeToolPatterns ?? true;
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  let db: import("node:sqlite").DatabaseSync;
  try {
    const { openMeridiaDb, getMeridiaDbStats } = await import("./db.js");
    db = openMeridiaDb({ cfg: opts.config });

    const stats = getMeridiaDbStats(db);
    if (stats.recordCount === 0) {
      log.info("reconstitute: no records in database, skipping");
      return null;
    }
  } catch (err) {
    log.info(
      `reconstitute: SQLite not available — ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  try {
    const { getRecentRecords, getRecordsByDateRange, listSessions, getToolStats } =
      await import("./query.js");

    // Calculate lookback window
    const now = new Date();
    const fromDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    const fromIso = fromDate.toISOString();
    const toIso = now.toISOString();

    // Get records from the lookback window, filtered by minimum score
    const dateRangeResults = getRecordsByDateRange(db, fromIso, toIso, {
      minScore,
      limit: maxRecords,
    });

    // If no records in the window, get the most recent ones regardless
    const records =
      dateRangeResults.length > 0
        ? dateRangeResults.map((r) => r.record)
        : getRecentRecords(db, Math.min(maxRecords, 10), { minScore }).map((r) => r.record);

    if (records.length === 0) {
      log.info("reconstitute: no significant records found, skipping");
      return null;
    }

    // Sort by significance (highest first), then by recency
    const sorted = [...records].sort((a, b) => {
      const scoreDiff = b.evaluation.score - a.evaluation.score;
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
      return b.ts.localeCompare(a.ts); // more recent first
    });

    // Build the briefing sections
    const sections: string[] = [];
    let currentChars = 0;
    let truncated = false;
    const sessionKeys = new Set<string>();

    // ── Header ──
    const header =
      `## 🧠 Experiential Continuity — Recent Context\n` +
      `_${records.length} significant experiences from the last ${lookbackHours}h_\n`;
    sections.push(header);
    currentChars += header.length;

    // ── Key Experiences ──
    const expHeader = "\n### Key Experiences\n";
    sections.push(expHeader);
    currentChars += expHeader.length;

    for (const record of sorted) {
      const topic = extractTopicFromRecord(record);
      const time = formatTimestamp(record.ts);
      const score = record.evaluation.score.toFixed(1);
      const errorTag = record.tool.isError ? " ⚠️" : "";
      const line = `- **[${score}]** ${topic}${errorTag} _(${time})_\n`;

      if (currentChars + line.length > maxChars * 0.7) {
        // Reserve 30% of budget for other sections
        truncated = true;
        break;
      }

      sections.push(line);
      currentChars += line.length;

      if (record.sessionKey) {
        sessionKeys.add(record.sessionKey);
      }
    }

    // ── Tool Patterns ──
    if (includeToolPatterns && currentChars < maxChars * 0.85) {
      try {
        const toolStats = getToolStats(db);
        if (toolStats.length > 0) {
          const topTools = toolStats.slice(0, 5);
          let toolSection = "\n### Tool Usage Patterns\n";
          for (const t of topTools) {
            const errorPct = t.count > 0 ? Math.round((t.errorCount / t.count) * 100) : 0;
            const errorNote = errorPct > 20 ? ` (${errorPct}% errors)` : "";
            toolSection += `- ${t.toolName}: ${t.count} uses, avg score ${t.avgScore.toFixed(2)}${errorNote}\n`;
          }

          if (currentChars + toolSection.length <= maxChars * 0.9) {
            sections.push(toolSection);
            currentChars += toolSection.length;
          }
        }
      } catch {
        // tool stats failed — skip
      }
    }

    // ── Session Context ──
    if (includeSessions && sessionKeys.size > 0 && currentChars < maxChars * 0.92) {
      try {
        const sessionList = listSessions(db, { limit: 5 });
        if (sessionList.length > 0) {
          let sessionSection = "\n### Recent Sessions\n";
          for (const s of sessionList.slice(0, 3)) {
            const timeNote = s.lastTs ? formatTimestamp(s.lastTs) : "unknown";
            sessionSection += `- ${s.sessionKey} — ${s.recordCount} records (last: ${timeNote})\n`;
          }

          if (currentChars + sessionSection.length <= maxChars) {
            sections.push(sessionSection);
            currentChars += sessionSection.length;
          }
        }
      } catch {
        // session list failed — skip
      }
    }

    // ── Closing Note ──
    const closing =
      "\n_This context is from the Meridia experiential continuity engine. Use `experience_search` to explore further._\n";
    if (currentChars + closing.length <= maxChars) {
      sections.push(closing);
      currentChars += closing.length;
    }

    const text = sections.join("");
    const timeRange =
      sorted.length > 0
        ? {
            from: sorted[sorted.length - 1].ts,
            to: sorted[0].ts,
          }
        : null;

    return {
      text,
      estimatedTokens: estimateTokens(text),
      recordCount: records.length,
      sessionCount: sessionKeys.size,
      timeRange,
      truncated,
    };
  } catch (err) {
    log.error(`reconstitute: failed — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Generate a reconstitution text suitable for system prompt injection.
 * Returns empty string if nothing is available.
 */
export async function getReconstitutionForBootstrap(config?: OpenClawConfig): Promise<string> {
  const result = await generateReconstitution({
    config,
    maxTokens: DEFAULT_MAX_TOKENS,
    lookbackHours: DEFAULT_LOOKBACK_HOURS,
    minScore: DEFAULT_MIN_SCORE,
  });

  if (!result) return "";

  log.info(
    `reconstitute: generated ${result.estimatedTokens} tokens from ${result.recordCount} records across ${result.sessionCount} sessions`,
  );

  return result.text;
}
