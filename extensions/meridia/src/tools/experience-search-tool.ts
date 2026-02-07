import type { AnyAgentTool, OpenClawConfig } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk";
import { createBackend } from "../meridia/db/index.js";

const ExperienceSearchSchema = Type.Object({
  query: Type.Optional(
    Type.String({
      description:
        "Free-text search query. Searches across tool names, evaluation reasons, and record data using FTS5 when available.",
    }),
  ),
  session_key: Type.Optional(
    Type.String({
      description: "Filter results to a specific session key.",
    }),
  ),
  tool_name: Type.Optional(
    Type.String({
      description: "Filter results to a specific tool name.",
    }),
  ),
  min_score: Type.Optional(
    Type.Number({
      description: "Minimum significance score (0-1).",
    }),
  ),
  from: Type.Optional(
    Type.String({
      description: "Start date/time for date range filter (inclusive). ISO string.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description: "End date/time for date range filter (inclusive). ISO string.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return. Default: 20. Max: 100.",
    }),
  ),
  recent: Type.Optional(
    Type.Boolean({
      description: "If true, return the most recent records regardless of search query.",
    }),
  ),
  tag: Type.Optional(
    Type.String({
      description: "Filter results to records containing an exact tag.",
    }),
  ),
});

export function createExperienceSearchTool(opts?: { config?: OpenClawConfig }): AnyAgentTool {
  return {
    label: "ExperienceSearch",
    name: "experience_search",
    description:
      "Search past experiential records from the Meridia continuity engine. " +
      "Query by free text (FTS5), date range, tool name, session, tag, or significance score.",
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
      const tag = readStringParam(params, "tag");
      const limit = Math.min(Math.max(rawLimit ?? 20, 1), 100);

      if (!query && !sessionKey && !toolName && !from && !to && !recent && !tag) {
        return jsonResult({
          error:
            "At least one search criterion is required: query, session_key, tool_name, from/to, tag, or recent=true.",
        });
      }

      try {
        const backend = createBackend({ cfg: opts?.config });

        const filters = {
          sessionKey,
          toolName,
          minScore,
          from: from ?? undefined,
          to: to ?? undefined,
          limit,
          tag,
        };

        const results =
          recent && !query && !from && !to
            ? await backend.getRecentRecords(limit, { sessionKey, toolName, minScore, tag })
            : query
              ? await backend.searchRecords(query, filters)
              : from || to
                ? await backend.getRecordsByDateRange(
                    from ?? "1970-01-01",
                    to ?? new Date().toISOString(),
                    {
                      ...filters,
                      limit,
                    },
                  )
                : sessionKey
                  ? await backend.getRecordsBySession(sessionKey, { limit })
                  : toolName
                    ? await backend.getRecordsByTool(toolName, { limit })
                    : await backend.getRecentRecords(limit, {
                        sessionKey,
                        toolName,
                        minScore,
                        tag,
                      });

        const stats = await backend.getStats();

        const formatted = results.map((r) => ({
          id: r.record.id,
          timestamp: r.record.ts,
          kind: r.record.kind,
          sessionKey: r.record.session?.key ?? null,
          tool: r.record.tool?.name ?? null,
          isError: r.record.tool?.isError ?? false,
          score: r.record.capture.score,
          threshold: r.record.capture.threshold ?? null,
          evalKind: r.record.capture.evaluation.kind,
          reason: r.record.capture.evaluation.reason ?? null,
          tags: r.record.content?.tags ?? null,
          ...(r.rank !== undefined ? { ftsRank: r.rank } : {}),
          preview:
            r.record.content?.topic ??
            r.record.content?.summary ??
            r.record.capture.evaluation.reason ??
            null,
        }));

        return jsonResult({
          matchCount: formatted.length,
          totalRecords: stats.recordCount,
          dbRange: {
            oldest: stats.oldestRecord,
            newest: stats.newestRecord,
          },
          results: formatted,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          error: `Experience search failed: ${message}`,
        });
      }
    },
  };
}
