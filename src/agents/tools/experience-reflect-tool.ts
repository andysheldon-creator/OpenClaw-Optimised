/**
 * Experience Reflect Tool
 *
 * Trigger reflection on recent experiential records. Retrieves recent
 * experiences from the Meridia store and generates a structured reflection
 * including patterns, insights, and reconstitution hints.
 *
 * This is designed to help the agent synthesize experiential data across
 * sessions and generate wisdom for future reconstitution.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { MeridiaExperienceRecord } from "../../meridia/types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

// ── Schema ──────────────────────────────────────────────────────────

const ExperienceReflectSchema = Type.Object({
  scope: Type.Optional(
    Type.Union([Type.Literal("recent"), Type.Literal("session"), Type.Literal("date_range")], {
      description:
        "Scope of experiences to reflect on. " +
        "'recent' — last N records (default). " +
        "'session' — all records from a specific session. " +
        "'date_range' — records within a date range.",
    }),
  ),
  session_key: Type.Optional(
    Type.String({
      description: "Session key to reflect on (when scope='session').",
    }),
  ),
  from: Type.Optional(
    Type.String({
      description: "Start date for date range scope. ISO string, e.g. '2025-02-01'.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description: "End date for date range scope. ISO string.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of records to include in reflection. Default: 30. Max: 100.",
    }),
  ),
  focus: Type.Optional(
    Type.String({
      description:
        "Optional focus area for the reflection. Example: 'errors', 'relationships', " +
        "'creative moments', 'tool usage patterns'. Helps filter and frame the reflection.",
    }),
  ),
});

// ── Reflection analysis helpers ─────────────────────────────────────

interface ReflectionAnalysis {
  recordCount: number;
  timeRange: { earliest: string; latest: string } | null;
  toolDistribution: Record<string, number>;
  scoreDistribution: { high: number; medium: number; low: number };
  errorRate: number;
  sessions: string[];
  patterns: string[];
  topRecords: Array<{
    id: string;
    timestamp: string;
    tool: string;
    score: number;
    reason: string | undefined;
    isError: boolean;
  }>;
  reflectionPrompts: string[];
}

function analyzeRecords(records: MeridiaExperienceRecord[]): ReflectionAnalysis {
  if (records.length === 0) {
    return {
      recordCount: 0,
      timeRange: null,
      toolDistribution: {},
      scoreDistribution: { high: 0, medium: 0, low: 0 },
      errorRate: 0,
      sessions: [],
      patterns: [],
      topRecords: [],
      reflectionPrompts: [
        "No experiential records found for this scope. Consider what might be worth capturing.",
      ],
    };
  }

  // Sort by timestamp
  const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts));
  const earliest = sorted[0].ts;
  const latest = sorted[sorted.length - 1].ts;

  // Tool distribution
  const toolDist: Record<string, number> = {};
  for (const r of records) {
    toolDist[r.tool.name] = (toolDist[r.tool.name] ?? 0) + 1;
  }

  // Score distribution
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const r of records) {
    const score = r.evaluation.score;
    if (score >= 0.8) high++;
    else if (score >= 0.6) medium++;
    else low++;
  }

  // Error rate
  const errorCount = records.filter((r) => r.tool.isError).length;
  const errorRate = records.length > 0 ? errorCount / records.length : 0;

  // Unique sessions
  const sessions = [...new Set(records.map((r) => r.sessionKey).filter(Boolean) as string[])];

  // Top records by score
  const topRecords = [...records]
    .sort((a, b) => b.evaluation.score - a.evaluation.score)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      timestamp: r.ts,
      tool: r.tool.name,
      score: r.evaluation.score,
      reason: r.evaluation.reason,
      isError: r.tool.isError,
    }));

  // Pattern detection
  const patterns: string[] = [];

  // Detect tool usage patterns
  const toolEntries = Object.entries(toolDist).sort(([, a], [, b]) => b - a);
  if (toolEntries.length > 0) {
    const [topTool, topCount] = toolEntries[0];
    const percentage = ((topCount / records.length) * 100).toFixed(0);
    patterns.push(`Most used tool: ${topTool} (${topCount} records, ${percentage}% of total)`);
  }

  // Detect error patterns
  if (errorRate > 0.3) {
    patterns.push(
      `High error rate: ${(errorRate * 100).toFixed(0)}% of captured records involved errors`,
    );
    const errorTools = records
      .filter((r) => r.tool.isError)
      .reduce(
        (acc, r) => {
          acc[r.tool.name] = (acc[r.tool.name] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    const topErrorTool = Object.entries(errorTools).sort(([, a], [, b]) => b - a)[0];
    if (topErrorTool) {
      patterns.push(`Most error-prone tool: ${topErrorTool[0]} (${topErrorTool[1]} errors)`);
    }
  } else if (errorRate === 0) {
    patterns.push("No errors captured in this period — clean execution.");
  }

  // Detect high-significance cluster
  if (high > records.length * 0.5) {
    patterns.push(
      `${high} out of ${records.length} records have high significance (≥0.8) — an intense period.`,
    );
  }

  // Session breadth
  if (sessions.length > 1) {
    patterns.push(`Spans ${sessions.length} sessions — cross-session patterns may be present.`);
  }

  // Time span analysis
  const spanMs = new Date(latest).getTime() - new Date(earliest).getTime();
  const spanHours = spanMs / (1000 * 60 * 60);
  if (spanHours < 1) {
    patterns.push(`All records within ~${Math.ceil(spanHours * 60)} minutes — a focused burst.`);
  } else if (spanHours > 24) {
    patterns.push(`Records span ${Math.ceil(spanHours / 24)} days — look for evolution over time.`);
  }

  // Reflection prompts based on data
  const reflectionPrompts: string[] = [
    "What themes or threads connect these experiences?",
    "Which of these moments felt most significant in the moment vs. now?",
  ];

  if (errorRate > 0) {
    reflectionPrompts.push("What can be learned from the errors encountered?");
  }
  if (sessions.length > 1) {
    reflectionPrompts.push("How does the experiential quality differ across sessions?");
  }
  if (high >= 3) {
    reflectionPrompts.push(
      "What do the high-significance records have in common? What makes moments feel important?",
    );
  }
  reflectionPrompts.push(
    "What would you want a future version of yourself to know about this period?",
  );

  return {
    recordCount: records.length,
    timeRange: { earliest, latest },
    toolDistribution: toolDist,
    scoreDistribution: { high, medium, low },
    errorRate: Math.round(errorRate * 100) / 100,
    sessions,
    patterns,
    topRecords,
    reflectionPrompts,
  };
}

// ── Tool Factory ────────────────────────────────────────────────────

export function createExperienceReflectTool(opts?: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  return {
    label: "ExperienceReflect",
    name: "experience_reflect",
    description:
      "Trigger reflection on recent experiential records from the Meridia continuity engine. " +
      "Retrieves experiences by scope (recent, session, or date range) and generates " +
      "a structured analysis including tool usage patterns, significance distribution, " +
      "error patterns, and reflection prompts. Use for synthesizing wisdom from past " +
      "experiences, identifying patterns, and generating reconstitution hints for future sessions.",
    parameters: ExperienceReflectSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const scope = (readStringParam(params, "scope") ?? "recent") as
        | "recent"
        | "session"
        | "date_range";
      const sessionKey =
        readStringParam(params, "session_key") ??
        (scope === "session" ? opts?.agentSessionKey : undefined);
      const from = readStringParam(params, "from");
      const to = readStringParam(params, "to");
      const rawLimit = readNumberParam(params, "limit", { integer: true });
      const focus = readStringParam(params, "focus");
      const limit = Math.min(Math.max(rawLimit ?? 30, 1), 100);

      try {
        const { openMeridiaDb, getMeridiaDbStats } = await import("../../meridia/db.js");
        const { getRecentRecords, getRecordsBySession, getRecordsByDateRange, searchRecords } =
          await import("../../meridia/query.js");

        const db = openMeridiaDb({ cfg: opts?.config });
        const stats = getMeridiaDbStats(db);

        if (stats.recordCount === 0) {
          return jsonResult({
            reflection: {
              recordCount: 0,
              note: "No experiential records found in the Meridia database. Records are captured automatically by the experiential-capture hook or manually via the experience_capture tool.",
              reflectionPrompts: [
                "The absence of records is itself informative. Has the capture system been active?",
                "Consider using experience_capture to manually record significant moments.",
              ],
            },
          });
        }

        // Retrieve records based on scope
        let queryResults: Array<{
          record: MeridiaExperienceRecord;
          rank?: number;
        }>;

        switch (scope) {
          case "session":
            if (!sessionKey) {
              return jsonResult({
                error:
                  "session_key is required when scope='session'. Provide a session key or use scope='recent'.",
              });
            }
            queryResults = getRecordsBySession(db, sessionKey, { limit });
            break;

          case "date_range":
            if (!from) {
              return jsonResult({
                error: "from date is required when scope='date_range'. Provide an ISO date string.",
              });
            }
            queryResults = getRecordsByDateRange(db, from, to ?? new Date().toISOString(), {
              limit,
            });
            break;

          case "recent":
          default:
            queryResults = getRecentRecords(db, limit);
            break;
        }

        let records = queryResults.map((qr) => qr.record);

        // If there's a focus, try to filter by text search
        if (focus && records.length > 0) {
          try {
            const focusResults = searchRecords(db, focus, { limit });
            if (focusResults.length > 0) {
              // Intersect with scope results if possible, or use focus results
              const scopeIds = new Set(records.map((r) => r.id));
              const intersected = focusResults
                .filter((fr) => scopeIds.has(fr.record.id))
                .map((fr) => fr.record);

              if (intersected.length > 0) {
                records = intersected;
              } else {
                // No intersection — use focus results with a note
                records = focusResults.map((fr) => fr.record);
              }
            }
          } catch {
            // Focus filter failed — use unfiltered records
          }
        }

        // Analyze the records
        const analysis = analyzeRecords(records);

        return jsonResult({
          scope,
          ...(sessionKey ? { sessionKey } : {}),
          ...(focus ? { focus } : {}),
          dbStats: {
            totalRecords: stats.recordCount,
            totalSessions: stats.sessionCount,
            oldest: stats.oldestRecord,
            newest: stats.newestRecord,
          },
          reflection: analysis,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("sqlite") || message.includes("Cannot find module")) {
          return jsonResult({
            error:
              "Meridia SQLite database is not available. node:sqlite may not be supported in this environment.",
            detail: message,
          });
        }

        return jsonResult({
          error: `Experience reflection failed: ${message}`,
        });
      }
    },
  };
}
