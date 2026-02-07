import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import path from "node:path";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "../../src/meridia/types.js";
import { resolveMeridiaPluginConfig } from "../../src/meridia/config.js";
import { createBackend } from "../../src/meridia/db/index.js";
import {
  type HookEvent,
  asObject,
  resolveHookConfig,
  readNumber,
  readPositiveNumber,
  readString,
  readBoolean,
  nowIso,
  resolveSessionContext,
} from "../../src/meridia/event.js";
import { fanoutBatchToGraph } from "../../src/meridia/fanout.js";
import { resolveMeridiaDir, dateKeyUtc } from "../../src/meridia/paths.js";
import { appendJsonl, resolveTraceJsonlPath, writeJson } from "../../src/meridia/storage.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CompactionStrategy = "scheduled" | "on_demand" | "session_based";

type CompactionConfig = {
  enabled: boolean;
  strategy: CompactionStrategy;
  scheduleIntervalHours: number;
  minExperiencesForCompaction: number;
  similarityThreshold: number;
  maxExperiencesPerEpisode: number;
  archiveCompactedRecords: boolean;
  graphiti: {
    enabled: boolean;
    groupId: string;
  };
};

type ExperienceGroup = {
  key: string;
  records: MeridiaExperienceRecord[];
  topic: string;
  toolNames: string[];
  sessionKeys: string[];
  avgScore: number;
  timeRange: { from: string; to: string };
};

type SynthesizedEpisode = {
  id: string;
  ts: string;
  groupKey: string;
  topic: string;
  summary: string;
  sourceRecordIds: string[];
  sourceCount: number;
  toolsInvolved: string[];
  sessionsInvolved: string[];
  avgSignificance: number;
  timeRange: { from: string; to: string };
  tags: string[];
  metadata: Record<string, unknown>;
};

type CompactionResult = {
  success: boolean;
  episodesCreated: number;
  recordsCompacted: number;
  recordsArchived: number;
  graphitiPushed: boolean;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

function resolveCompactionConfig(hookCfg: Record<string, unknown> | undefined): CompactionConfig {
  const graphitiCfg = asObject(hookCfg?.graphiti) ?? {};
  return {
    enabled: readBoolean(hookCfg, "enabled", false),
    strategy: (readString(hookCfg, "strategy", "scheduled") ?? "scheduled") as CompactionStrategy,
    // These must be > 0; non-positive values fall back to defaults
    scheduleIntervalHours: readPositiveNumber(hookCfg, "scheduleIntervalHours", 4),
    minExperiencesForCompaction: readPositiveNumber(hookCfg, "minExperiencesForCompaction", 5),
    similarityThreshold: readPositiveNumber(hookCfg, "similarityThreshold", 0.7),
    maxExperiencesPerEpisode: readPositiveNumber(hookCfg, "maxExperiencesPerEpisode", 20),
    archiveCompactedRecords: readBoolean(hookCfg, "archiveCompactedRecords", true),
    graphiti: {
      enabled: readBoolean(graphitiCfg, "enabled", true),
      groupId: readString(graphitiCfg, "groupId", "meridia-experiences") ?? "meridia-experiences",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Experience Grouping
// ─────────────────────────────────────────────────────────────────────────────

function extractTopic(record: MeridiaExperienceRecord): string {
  if (record.content?.topic) return record.content.topic;
  if (record.content?.summary) {
    const summary = record.content.summary;
    const firstSentence = summary.split(/[.!?]/)[0]?.trim();
    return firstSentence && firstSentence.length < 100 ? firstSentence : summary.slice(0, 80);
  }
  if (record.tool?.name) return `Tool: ${record.tool.name}`;
  return record.kind;
}

function computeGroupKey(record: MeridiaExperienceRecord): string {
  const tool = record.tool?.name ?? "unknown";
  const kindPrefix = record.kind === "tool_result" ? "tool" : record.kind;
  return `${kindPrefix}:${tool}`;
}

function groupExperiences(
  records: MeridiaExperienceRecord[],
  maxPerGroup: number,
): ExperienceGroup[] {
  const groups = new Map<string, MeridiaExperienceRecord[]>();

  for (const record of records) {
    const key = computeGroupKey(record);
    const existing = groups.get(key) ?? [];
    if (existing.length < maxPerGroup) {
      existing.push(record);
      groups.set(key, existing);
    }
  }

  const result: ExperienceGroup[] = [];

  for (const [key, recs] of groups) {
    if (recs.length === 0) continue;

    const toolNames = [...new Set(recs.map((r) => r.tool?.name).filter(Boolean) as string[])];
    const sessionKeys = [...new Set(recs.map((r) => r.session?.key).filter(Boolean) as string[])];
    const scores = recs.map((r) => r.capture.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const timestamps = recs.map((r) => r.ts).sort();
    const topics = recs.map(extractTopic);
    const mostCommonTopic =
      topics.sort(
        (a, b) => topics.filter((t) => t === b).length - topics.filter((t) => t === a).length,
      )[0] ?? key;

    result.push({
      key,
      records: recs,
      topic: mostCommonTopic,
      toolNames,
      sessionKeys,
      avgScore,
      timeRange: {
        from: timestamps[0] ?? nowIso(),
        to: timestamps[timestamps.length - 1] ?? nowIso(),
      },
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Episode Synthesis
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeEpisode(group: ExperienceGroup): SynthesizedEpisode {
  const id = crypto.randomUUID();
  const ts = nowIso();

  const summaryParts: string[] = [];
  const uniqueTopics = [...new Set(group.records.map(extractTopic))];

  if (uniqueTopics.length === 1) {
    summaryParts.push(uniqueTopics[0]);
  } else if (uniqueTopics.length <= 3) {
    summaryParts.push(`Topics: ${uniqueTopics.join(", ")}`);
  } else {
    summaryParts.push(`${uniqueTopics.length} related topics around "${group.topic}"`);
  }

  if (group.toolNames.length > 0) {
    summaryParts.push(`Tools: ${group.toolNames.join(", ")}`);
  }

  summaryParts.push(`${group.records.length} experiences consolidated`);
  summaryParts.push(`Avg significance: ${group.avgScore.toFixed(2)}`);

  const allTags = new Set<string>();
  for (const record of group.records) {
    for (const tag of record.content?.tags ?? []) {
      allTags.add(tag);
    }
  }

  const anchors: string[] = [];
  const emotions: string[] = [];
  const consequences: string[] = [];

  for (const record of group.records) {
    if (record.content?.anchors) {
      anchors.push(...record.content.anchors);
    }
    if (record.content?.facets?.emotions) {
      emotions.push(...record.content.facets.emotions);
    }
    if (record.content?.facets?.consequences) {
      consequences.push(...record.content.facets.consequences);
    }
  }

  return {
    id,
    ts,
    groupKey: group.key,
    topic: group.topic,
    summary: summaryParts.join(". "),
    sourceRecordIds: group.records.map((r) => r.id),
    sourceCount: group.records.length,
    toolsInvolved: group.toolNames,
    sessionsInvolved: group.sessionKeys,
    avgSignificance: group.avgScore,
    timeRange: group.timeRange,
    tags: [...allTags],
    metadata: {
      anchors: [...new Set(anchors)].slice(0, 10),
      emotions: [...new Set(emotions)].slice(0, 5),
      consequences: [...new Set(consequences)].slice(0, 5),
      compactedAt: ts,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compaction Core
// ─────────────────────────────────────────────────────────────────────────────

async function runCompaction(
  cfg: OpenClawConfig | undefined,
  compactionCfg: CompactionConfig,
  meridiaDir: string,
): Promise<CompactionResult> {
  const backend = createBackend({ cfg, hookKey: "compaction" });

  const lookbackHours = compactionCfg.scheduleIntervalHours;
  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const oldRecords = await backend.getRecordsByDateRange(
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    cutoff.toISOString(),
    { minScore: 0.5, limit: 500 },
  );

  const candidates = oldRecords.map((r) => r.record);

  if (candidates.length < compactionCfg.minExperiencesForCompaction) {
    return {
      success: true,
      episodesCreated: 0,
      recordsCompacted: 0,
      recordsArchived: 0,
      graphitiPushed: false,
    };
  }

  const groups = groupExperiences(candidates, compactionCfg.maxExperiencesPerEpisode);

  const viableGroups = groups.filter(
    (g) => g.records.length >= Math.min(2, compactionCfg.minExperiencesForCompaction),
  );

  if (viableGroups.length === 0) {
    return {
      success: true,
      episodesCreated: 0,
      recordsCompacted: 0,
      recordsArchived: 0,
      graphitiPushed: false,
    };
  }

  const episodes = viableGroups.map(synthesizeEpisode);

  let graphitiPushed = false;
  if (compactionCfg.graphiti.enabled) {
    const fanoutPayload = episodes.map((ep) => ({
      id: ep.id,
      text: `${ep.topic}\n\n${ep.summary}`,
      tags: ep.tags,
      ts: ep.ts,
      timeRange: ep.timeRange,
      metadata: {
        sourceCount: ep.sourceCount,
        sourceRecordIds: ep.sourceRecordIds,
        toolsInvolved: ep.toolsInvolved,
        sessionsInvolved: ep.sessionsInvolved,
        avgSignificance: ep.avgSignificance,
        ...ep.metadata,
      },
    }));
    const graphResult = await fanoutBatchToGraph(
      fanoutPayload,
      cfg,
      compactionCfg.graphiti.groupId,
    );
    graphitiPushed = graphResult.success;
    if (!graphResult.success) {
      // eslint-disable-next-line no-console
      console.warn(`[compaction] Graphiti push failed: ${graphResult.error}`);
    }
  }

  const compactedRecordIds = episodes.flatMap((e) => e.sourceRecordIds);
  let recordsArchived = 0;

  if (compactionCfg.archiveCompactedRecords) {
    const dateKey = dateKeyUtc(now);
    const archivePath = path.join(
      meridiaDir,
      "compaction-archive",
      dateKey,
      `${nowIso().replaceAll(":", "-")}.json`,
    );
    await writeJson(archivePath, {
      ts: nowIso(),
      episodes,
      compactedRecordIds,
      graphitiPushed,
    });
    recordsArchived = compactedRecordIds.length;
  }

  for (const episode of episodes) {
    const record: MeridiaExperienceRecord = {
      id: episode.id,
      ts: episode.ts,
      kind: "precompact",
      session: undefined,
      tool: {
        name: "compaction",
        callId: `compact-${episode.id.slice(0, 8)}`,
        isError: false,
      },
      capture: {
        score: episode.avgSignificance,
        evaluation: {
          kind: "heuristic",
          score: episode.avgSignificance,
          reason: `Synthesized from ${episode.sourceCount} experiences`,
        },
      },
      content: {
        topic: episode.topic,
        summary: episode.summary,
        tags: episode.tags,
      },
      data: {
        summary: episode,
      },
    };

    try {
      backend.insertExperienceRecord(record);
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    episodesCreated: episodes.length,
    recordsCompacted: compactedRecordIds.length,
    recordsArchived,
    graphitiPushed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-compaction Snapshot
// ─────────────────────────────────────────────────────────────────────────────

async function handlePrecompact(
  event: HookEvent,
  context: Record<string, unknown>,
  cfg: OpenClawConfig | undefined,
  meridiaDir: string,
): Promise<void> {
  const { sessionId, sessionKey, runId } = resolveSessionContext(event, context);

  const tracePath = resolveTraceJsonlPath({ meridiaDir, date: event.timestamp });
  const ts = nowIso();
  const writeTraceJsonl = resolveMeridiaPluginConfig(cfg).debug.writeTraceJsonl;

  const dateKey = dateKeyUtc(event.timestamp);
  const snapshotDir = path.join(meridiaDir, "snapshots", dateKey);
  const snapshotPath = path.join(
    snapshotDir,
    `${ts.replaceAll(":", "-")}-${sessionId ?? "unknown"}.json`,
  );

  const snapshot = {
    ts,
    sessionId,
    sessionKey,
    runId,
    assistantTextCount: context.assistantTextCount,
    assistantTextsTail: context.assistantTextsTail,
    toolMetaCount: context.toolMetaCount,
    toolMetasTail: context.toolMetasTail,
    lastToolError: context.lastToolError,
  };
  await writeJson(snapshotPath, snapshot);

  const recordId = crypto.randomUUID();
  const record: MeridiaExperienceRecord = {
    id: recordId,
    ts,
    kind: "precompact",
    session: { id: sessionId, key: sessionKey, runId },
    tool: { name: "precompact", callId: `precompact-${recordId.slice(0, 8)}`, isError: false },
    capture: {
      score: 1,
      evaluation: {
        kind: "heuristic",
        score: 1,
        reason: "precompact_snapshot",
      },
    },
    content: {
      summary: "Pre-compaction snapshot",
    },
    data: { snapshot },
  };

  const traceEvent: MeridiaTraceEvent = {
    id: crypto.randomUUID(),
    ts,
    kind: "precompact_snapshot",
    session: { id: sessionId, key: sessionKey, runId },
    paths: { snapshotPath },
    decision: { decision: "capture", recordId },
  };

  try {
    const backend = createBackend({ cfg, hookKey: "compaction" });
    backend.insertExperienceRecord(record);
    backend.insertTraceEvent(traceEvent);
  } catch {
    // ignore
  }

  if (writeTraceJsonl) {
    await appendJsonl(tracePath, traceEvent);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

const handler = async (event: HookEvent): Promise<void> => {
  if (event.type !== "agent") {
    return;
  }

  const validActions = [
    "precompact",
    "compaction:end",
    "compaction:scheduled",
    "compaction:manual",
  ];
  if (!validActions.includes(event.action)) {
    return;
  }

  const context = asObject(event.context) ?? {};
  const cfg = (context.cfg as OpenClawConfig | undefined) ?? undefined;
  const hookCfg = resolveHookConfig(cfg, "compaction");
  if (hookCfg?.enabled !== true) {
    return;
  }

  const compactionCfg = resolveCompactionConfig(hookCfg);
  const meridiaDir = resolveMeridiaDir(cfg, "compaction");
  const tracePath = resolveTraceJsonlPath({ meridiaDir, date: event.timestamp });
  const ts = nowIso();
  const writeTraceJsonl = resolveMeridiaPluginConfig(cfg).debug.writeTraceJsonl;

  const { sessionId, sessionKey, runId } = resolveSessionContext(event, context);

  if (event.action === "precompact") {
    await handlePrecompact(event, context, cfg, meridiaDir);
    return;
  }

  if (
    event.action === "compaction:end" ||
    event.action === "compaction:scheduled" ||
    event.action === "compaction:manual"
  ) {
    const result = await runCompaction(cfg, compactionCfg, meridiaDir);

    const traceEvent: MeridiaTraceEvent = {
      id: crypto.randomUUID(),
      ts,
      kind: "compaction_end",
      session: { id: sessionId, key: sessionKey, runId },
      decision: {
        decision: result.success ? "capture" : "error",
        ...(result.error ? { error: result.error } : {}),
      },
    };

    try {
      const backend = createBackend({ cfg, hookKey: "compaction" });
      backend.insertTraceEvent(traceEvent);
    } catch {
      // ignore
    }

    if (writeTraceJsonl) {
      await appendJsonl(tracePath, {
        ...traceEvent,
        compactionResult: result,
      });
    }

    if (result.episodesCreated > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[compaction] Created ${result.episodesCreated} episodes from ${result.recordsCompacted} records` +
          (result.graphitiPushed ? " (pushed to Graphiti)" : ""),
      );
    }
  }
};

export default handler;
