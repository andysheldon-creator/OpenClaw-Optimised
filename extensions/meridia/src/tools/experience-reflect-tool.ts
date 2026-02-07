import type { AnyAgentTool, OpenClawConfig } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import {
  jsonResult,
  optionalStringEnum,
  readNumberParam,
  readStringParam,
} from "openclaw/plugin-sdk";
import type { MeridiaExperienceRecord } from "../meridia/types.js";
import { createBackend } from "../meridia/db/index.js";

const ExperienceReflectSchema = Type.Object({
  scope: optionalStringEnum(["recent", "session", "date_range"], {
    description:
      "Scope of experiences to reflect on. " +
      "'recent' — last N records (default). " +
      "'session' — all records from a specific session. " +
      "'date_range' — records within a date range.",
  }),
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
      description: "Maximum number of records to include. Default: 30. Max: 100.",
    }),
  ),
  focus: Type.Optional(
    Type.String({
      description:
        "Optional focus area for the reflection. Example: 'errors', 'relationships', 'tool usage patterns'.",
    }),
  ),
});

type ReflectionAnalysis = {
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
    kind: string;
    tool: string | null;
    score: number;
    reason: string | undefined;
    isError: boolean;
  }>;
  reflectionPrompts: string[];
};

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

  const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts));
  const earliest = sorted[0]?.ts ?? null;
  const latest = sorted[sorted.length - 1]?.ts ?? null;

  const toolDist: Record<string, number> = {};
  let high = 0;
  let medium = 0;
  let low = 0;
  let errorCount = 0;
  const sessions = new Set<string>();

  for (const r of records) {
    const tool = r.tool?.name ?? "(none)";
    toolDist[tool] = (toolDist[tool] ?? 0) + 1;

    const score = r.capture.score;
    if (score >= 0.8) {
      high++;
    } else if (score >= 0.6) {
      medium++;
    } else {
      low++;
    }

    if (r.tool?.isError) {
      errorCount++;
    }
    if (r.session?.key) {
      sessions.add(r.session.key);
    }
  }

  const topRecords = [...records]
    .sort((a, b) => b.capture.score - a.capture.score || b.ts.localeCompare(a.ts))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      timestamp: r.ts,
      kind: r.kind,
      tool: r.tool?.name ?? null,
      score: r.capture.score,
      reason: r.capture.evaluation.reason,
      isError: r.tool?.isError ?? false,
    }));

  const patterns: string[] = [];
  const recordCount = records.length;
  const errorRate = recordCount > 0 ? errorCount / recordCount : 0;

  const toolEntries = Object.entries(toolDist).sort(([, a], [, b]) => b - a);
  if (toolEntries.length > 0) {
    const [topTool, topCount] = toolEntries[0] ?? ["(none)", 0];
    const pct = recordCount > 0 ? ((topCount / recordCount) * 100).toFixed(0) : "0";
    patterns.push(`Most used tool: ${topTool} (${topCount} records, ${pct}% of total)`);
  }

  if (errorRate > 0.3) {
    patterns.push(`High error rate: ${(errorRate * 100).toFixed(0)}% of records involved errors`);
    const errorTools = records
      .filter((r) => r.tool?.isError)
      .reduce(
        (acc, r) => {
          const key = r.tool?.name ?? "(none)";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    const topErrorTool = Object.entries(errorTools).sort(([, a], [, b]) => b - a)[0];
    if (topErrorTool) {
      patterns.push(`Most error-prone tool: ${topErrorTool[0]} (${topErrorTool[1]} errors)`);
    }
  } else if (errorRate === 0) {
    patterns.push("No errors captured in this scope.");
  }

  if (high > recordCount * 0.5) {
    patterns.push(
      `${high} out of ${recordCount} records are high significance (≥0.8) — an intense period.`,
    );
  }

  if (sessions.size > 1) {
    patterns.push(`Spans ${sessions.size} sessions — cross-session patterns may be present.`);
  }

  if (earliest && latest) {
    const spanMs = new Date(latest).getTime() - new Date(earliest).getTime();
    if (Number.isFinite(spanMs)) {
      const spanHours = spanMs / (1000 * 60 * 60);
      if (spanHours < 1) {
        patterns.push(
          `All records within ~${Math.ceil(spanHours * 60)} minutes — a focused burst.`,
        );
      } else if (spanHours > 24) {
        patterns.push(
          `Records span ${Math.ceil(spanHours / 24)} days — look for evolution over time.`,
        );
      }
    }
  }

  const reflectionPrompts: string[] = [];
  reflectionPrompts.push("What themes or threads connect these experiences?");
  reflectionPrompts.push("Which moments felt most significant then vs now?");
  if (errorCount > 0) {
    reflectionPrompts.push("What can you learn from the errors encountered?");
  }
  if (sessions.size > 1) {
    reflectionPrompts.push("How does the experiential quality differ across sessions?");
  }
  if (high >= 3) {
    reflectionPrompts.push(
      "What do the high-significance experiences have in common? What made them important?",
    );
  }
  reflectionPrompts.push("What should you do differently next time based on these experiences?");
  reflectionPrompts.push("What anchors or phrases would best reconstitute the underlying state?");

  return {
    recordCount,
    timeRange: earliest && latest ? { earliest, latest } : null,
    toolDistribution: toolDist,
    scoreDistribution: { high, medium, low },
    errorRate: Math.round(errorRate * 100) / 100,
    sessions: Array.from(sessions),
    patterns,
    topRecords,
    reflectionPrompts,
  };
}

export function createExperienceReflectTool(opts?: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool {
  return {
    label: "ExperienceReflect",
    name: "experience_reflect",
    description:
      "Reflect on recent experiential records from Meridia. Use this to synthesize patterns, insights, and reconstitution anchors.",
    parameters: ExperienceReflectSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const scope = readStringParam(params, "scope") ?? "recent";
      const sessionKey = readStringParam(params, "session_key") ?? opts?.agentSessionKey;
      const from = readStringParam(params, "from");
      const to = readStringParam(params, "to");
      const rawLimit = readNumberParam(params, "limit", { integer: true });
      const limit = Math.min(Math.max(rawLimit ?? 30, 1), 100);
      const focus = readStringParam(params, "focus");

      try {
        const backend = createBackend({ cfg: opts?.config });
        const stats = await backend.getStats();

        if (stats.recordCount === 0) {
          return jsonResult({
            scope,
            focus: focus ?? null,
            dbStats: {
              totalRecords: 0,
              totalSessions: 0,
              oldest: null,
              newest: null,
            },
            reflection: analyzeRecords([]),
          });
        }

        const baseLimit = Math.max(limit, 50);

        let scopeResults: MeridiaExperienceRecord[] = [];
        if (scope === "session") {
          if (!sessionKey) {
            return jsonResult({ error: "session_key is required when scope='session'." });
          }
          scopeResults = (await backend.getRecordsBySession(sessionKey, { limit: baseLimit })).map(
            (r) => r.record,
          );
        } else if (scope === "date_range") {
          if (!from) {
            return jsonResult({ error: "from is required when scope='date_range'." });
          }
          scopeResults = (
            await backend.getRecordsByDateRange(from, to ?? new Date().toISOString(), {
              limit: baseLimit,
            })
          ).map((r) => r.record);
        } else {
          scopeResults = (await backend.getRecentRecords(baseLimit)).map((r) => r.record);
        }

        let records = scopeResults;
        let focusNote: string | null = null;
        if (focus && focus.trim()) {
          const focusResults = await backend.searchRecords(focus, { limit: baseLimit });
          if (focusResults.length > 0) {
            const scopeIds = new Set(scopeResults.map((r) => r.id));
            const intersected = focusResults.filter((r) => scopeIds.has(r.record.id));
            if (intersected.length > 0) {
              records = intersected.map((r) => r.record);
            } else {
              records = focusResults.map((r) => r.record);
              focusNote =
                "Focus search did not intersect with selected scope; using focus results.";
            }
          }
        }

        const analysis = analyzeRecords(records.slice(0, limit));

        return jsonResult({
          scope,
          focus: focus ?? null,
          ...(focusNote ? { focusNote } : {}),
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
        return jsonResult({
          error: `Experience reflect failed: ${message}`,
        });
      }
    },
  };
}
