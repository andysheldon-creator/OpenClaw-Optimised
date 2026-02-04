/**
 * Experience Search Tool
 *
 * Search past experiential records stored in the Meridia SQLite database.
 * Uses FTS5 full-text search with fallback to LIKE-based search.
 * Returns matching records with relevance scores.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

// ── Schema ──────────────────────────────────────────────────────────

const ExperienceSearchSchema = Type.Object({
  query: Type.Optional(
    Type.String({
      description:
        "Free-text search query. Searches across tool names, evaluation reasons, " +
        "and record data using FTS5 full-text search. Example: 'file write error'",
    }),
  ),
  session_key: Type.Optional(
    Type.String({
      description: "Filter results to a specific session key.",
    }),
  ),
  tool_name: Type.Optional(
    Type.String({
      description: "Filter results to a specific tool name. Example: 'exec', 'write', 'message'",
    }),
  ),
  min_score: Type.Optional(
    Type.Number({
      description:
        "Minimum significance score (0-1). Only return records scored at or above this threshold.",
    }),
  ),
  from: Type.Optional(
    Type.String({
      description:
        "Start date/time for date range filter (inclusive). ISO string, e.g. '2025-01-15' or '2025-01-15T00:00:00Z'.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        "End date/time for date range filter (inclusive). ISO string, e.g. '2025-02-01'.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return. Default: 20. Max: 100.",
    }),
  ),
  recent: Type.Optional(
    Type.Boolean({
      description:
        "If true, return the most recent records regardless of search query. " +
        "Useful for browsing recent experiential history.",
    }),
  ),
});

// ── Tool Factory ────────────────────────────────────────────────────

export function createExperienceSearchTool(opts?: {
  config?: OpenClawConfig;
}): AnyAgentTool | null {
  return {
    label: "ExperienceSearch",
    name: "experience_search",
    description:
      "Search past experiential records from the Meridia continuity engine. " +
      "Query by free text (FTS5), date range, tool name, session, or significance score. " +
      "Use to recall past interactions, find patterns, or review experiential history. " +
      "Records capture tool results that were deemed significant enough to preserve.",
    parameters: ExperienceSearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query");
      const sessionKey = readStringParam(params, "session_key");
      const toolName = readStringParam(params, "tool_name");
      const minScore = readNumberParam(params, "min_score");
      const from = readStringParam(params, "from");
      const to = readStringParam(params, "to");
      const rawLimit = readNumberParam(params, "limit", { integer: true });
      const recent = params.recent === true;
      const limit = Math.min(Math.max(rawLimit ?? 20, 1), 100);

      // Must have at least one search criterion
      if (!query && !sessionKey && !toolName && !from && !recent) {
        return jsonResult({
          error:
            "At least one search criterion is required: query, session_key, tool_name, from, or recent=true.",
        });
      }

      try {
        const { openMeridiaDb, getMeridiaDbStats } = await import("../../meridia/db.js");
        const {
          searchRecords,
          getRecordsByDateRange,
          getRecordsBySession,
          getRecentRecords,
          getRecordsByTool,
        } = await import("../../meridia/query.js");

        const db = openMeridiaDb({ cfg: opts?.config });

        const filters = {
          sessionKey,
          toolName,
          minScore,
          limit,
        };

        let results: Array<{
          record: import("../../meridia/types.js").MeridiaExperienceRecord;
          rank?: number;
        }>;

        if (recent && !query && !from && !to) {
          // Recent records mode
          results = getRecentRecords(db, limit, {
            sessionKey,
            toolName,
            minScore,
          });
        } else if (query) {
          // Full-text search
          results = searchRecords(db, query, filters);
        } else if (from || to) {
          // Date range search
          const fromDate = from ?? "1970-01-01";
          const toDate = to ?? new Date().toISOString();
          results = getRecordsByDateRange(db, fromDate, toDate, filters);
        } else if (sessionKey) {
          results = getRecordsBySession(db, sessionKey, {
            toolName,
            minScore,
            limit,
          });
        } else if (toolName) {
          results = getRecordsByTool(db, toolName, {
            sessionKey,
            minScore,
            limit,
          });
        } else {
          results = getRecentRecords(db, limit, filters);
        }

        // Get DB stats for context
        const stats = getMeridiaDbStats(db);

        // Format results for output
        const formattedResults = results.map((r) => ({
          id: r.record.id,
          timestamp: r.record.ts,
          sessionKey: r.record.sessionKey,
          tool: r.record.tool.name,
          isError: r.record.tool.isError,
          score: r.record.evaluation.score,
          reason: r.record.evaluation.reason,
          evalKind: r.record.evaluation.kind,
          ...(r.rank !== undefined ? { ftsRank: r.rank } : {}),
          // Include a preview of the data
          dataPreview: (() => {
            const parts: string[] = [];
            if (r.record.data.args) {
              const argsStr = JSON.stringify(r.record.data.args);
              parts.push(`args: ${argsStr.length > 200 ? argsStr.slice(0, 200) + "…" : argsStr}`);
            }
            if (r.record.data.result) {
              const resultStr = JSON.stringify(r.record.data.result);
              parts.push(
                `result: ${resultStr.length > 300 ? resultStr.slice(0, 300) + "…" : resultStr}`,
              );
            }
            return parts.join(" | ") || undefined;
          })(),
        }));

        return jsonResult({
          matchCount: formattedResults.length,
          totalRecords: stats.recordCount,
          dbRange: {
            oldest: stats.oldestRecord,
            newest: stats.newestRecord,
          },
          results: formattedResults,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Check if it's a "no sqlite" error
        if (message.includes("sqlite") || message.includes("Cannot find module")) {
          return jsonResult({
            error:
              "Meridia SQLite database is not available. node:sqlite may not be supported in this environment.",
            detail: message,
          });
        }

        return jsonResult({
          error: `Experience search failed: ${message}`,
        });
      }
    },
  };
}
