import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { NormalizedUsage } from "../agents/usage.js";
import type { OpenClawConfig } from "../config/config.js";
import type { CostUsageDailyEntry, CostUsageTotals } from "./session-cost-usage.js";
import { hasNonzeroUsage } from "../agents/usage.js";
import { resolveStateDir } from "../config/paths.js";
import { estimateUsageCost, resolveModelCostConfig } from "../utils/usage-format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpendEntry = {
  ts: number;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costUsd: number;
  durationMs?: number;
};

export type SpendQuery = {
  days?: number;
  provider?: string;
  model?: string;
  agentId?: string;
  groupBy?: "day" | "provider" | "model";
};

export type SpendSummary = {
  updatedAt: number;
  days: number;
  totals: CostUsageTotals;
  daily: CostUsageDailyEntry[];
  byProvider?: Record<string, CostUsageTotals>;
  byModel?: Record<string, CostUsageTotals>;
};

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

export function resolveSpendLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "state", "spend.jsonl");
}

// ---------------------------------------------------------------------------
// Low-level I/O
// ---------------------------------------------------------------------------

const emptyTotals = (): CostUsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  totalCost: 0,
  missingCostEntries: 0,
});

const formatDayKey = (ts: number): string => {
  const date = new Date(ts);
  return date.toLocaleDateString("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
};

const addToTotals = (totals: CostUsageTotals, entry: SpendEntry): void => {
  totals.input += entry.input;
  totals.output += entry.output;
  totals.cacheRead += entry.cacheRead;
  totals.cacheWrite += entry.cacheWrite;
  totals.totalTokens += entry.totalTokens;
  totals.totalCost += entry.costUsd;
};

let writeQueue = Promise.resolve();
let dirReady: Promise<void> | undefined;

function ensureDir(filePath: string): Promise<void> {
  if (!dirReady) {
    const dir = path.dirname(filePath);
    dirReady = fsp.mkdir(dir, { recursive: true }).then(() => undefined);
  }
  return dirReady;
}

export async function appendSpendEntry(entry: SpendEntry, filePath?: string): Promise<void> {
  const target = filePath ?? resolveSpendLedgerPath();
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue
    .then(() => ensureDir(target))
    .then(() => fsp.appendFile(target, line, "utf8"))
    .catch(() => undefined);
  await writeQueue;
}

export async function loadSpendLedger(opts?: {
  since?: number;
  filePath?: string;
}): Promise<SpendEntry[]> {
  const target = opts?.filePath ?? resolveSpendLedgerPath();
  if (!fs.existsSync(target)) {
    return [];
  }
  const since = opts?.since ?? 0;
  const entries: SpendEntry[] = [];
  const fileStream = fs.createReadStream(target, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as SpendEntry;
      if (typeof parsed.ts !== "number" || parsed.ts < since) {
        continue;
      }
      entries.push(parsed);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// SpendAggregator
// ---------------------------------------------------------------------------

export class SpendAggregator {
  private entries: SpendEntry[] = [];
  private dailyMap = new Map<string, CostUsageTotals>();
  private providerMap = new Map<string, CostUsageTotals>();
  private modelMap = new Map<string, CostUsageTotals>();
  private totals = emptyTotals();

  async rebuild(filePath?: string): Promise<void> {
    this.entries = [];
    this.dailyMap.clear();
    this.providerMap.clear();
    this.modelMap.clear();
    this.totals = emptyTotals();

    const loaded = await loadSpendLedger({ filePath });
    for (const entry of loaded) {
      this.ingestInternal(entry);
    }
  }

  ingest(entry: SpendEntry): void {
    this.ingestInternal(entry);
  }

  private ingestInternal(entry: SpendEntry): void {
    this.entries.push(entry);

    // Daily
    const dayKey = formatDayKey(entry.ts);
    const dayBucket = this.dailyMap.get(dayKey) ?? emptyTotals();
    addToTotals(dayBucket, entry);
    this.dailyMap.set(dayKey, dayBucket);

    // Provider
    if (entry.provider) {
      const provBucket = this.providerMap.get(entry.provider) ?? emptyTotals();
      addToTotals(provBucket, entry);
      this.providerMap.set(entry.provider, provBucket);
    }

    // Model
    if (entry.model) {
      const modelBucket = this.modelMap.get(entry.model) ?? emptyTotals();
      addToTotals(modelBucket, entry);
      this.modelMap.set(entry.model, modelBucket);
    }

    // Overall totals
    addToTotals(this.totals, entry);
  }

  query(opts?: SpendQuery): SpendSummary {
    const days = Math.max(1, Math.floor(opts?.days ?? 30));
    const now = Date.now();
    const since = now - days * 24 * 60 * 60 * 1000;

    const filtered = this.entries.filter((e) => {
      if (e.ts < since) {
        return false;
      }
      if (opts?.provider && e.provider !== opts.provider) {
        return false;
      }
      if (opts?.model && e.model !== opts.model) {
        return false;
      }
      if (opts?.agentId && e.agentId !== opts.agentId) {
        return false;
      }
      return true;
    });

    const hasFilter = Boolean(opts?.provider || opts?.model || opts?.agentId);
    const groupBy = opts?.groupBy;

    // When no filters are applied and no specific groupBy, return pre-computed maps
    if (!hasFilter && !groupBy) {
      const dailyFiltered = new Map<string, CostUsageTotals>();
      const totals = emptyTotals();
      for (const entry of filtered) {
        const dayKey = formatDayKey(entry.ts);
        const bucket = dailyFiltered.get(dayKey) ?? emptyTotals();
        addToTotals(bucket, entry);
        dailyFiltered.set(dayKey, bucket);
        addToTotals(totals, entry);
      }
      return {
        updatedAt: Date.now(),
        days,
        totals,
        daily: toDailyArray(dailyFiltered),
        byProvider: toRecord(this.providerMap),
        byModel: toRecord(this.modelMap),
      };
    }

    // Build aggregates from filtered entries
    const dailyMap = new Map<string, CostUsageTotals>();
    const providerMap = new Map<string, CostUsageTotals>();
    const modelMap = new Map<string, CostUsageTotals>();
    const totals = emptyTotals();

    for (const entry of filtered) {
      const dayKey = formatDayKey(entry.ts);
      const dayBucket = dailyMap.get(dayKey) ?? emptyTotals();
      addToTotals(dayBucket, entry);
      dailyMap.set(dayKey, dayBucket);

      if (entry.provider) {
        const provBucket = providerMap.get(entry.provider) ?? emptyTotals();
        addToTotals(provBucket, entry);
        providerMap.set(entry.provider, provBucket);
      }
      if (entry.model) {
        const modelBucket = modelMap.get(entry.model) ?? emptyTotals();
        addToTotals(modelBucket, entry);
        modelMap.set(entry.model, modelBucket);
      }
      addToTotals(totals, entry);
    }

    const result: SpendSummary = {
      updatedAt: Date.now(),
      days,
      totals,
      daily: toDailyArray(dailyMap),
    };

    if (groupBy === "provider" || hasFilter) {
      result.byProvider = toRecord(providerMap);
    }
    if (groupBy === "model" || hasFilter) {
      result.byModel = toRecord(modelMap);
    }

    return result;
  }

  summary(): SpendSummary {
    return this.query({});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDailyArray(map: Map<string, CostUsageTotals>): CostUsageDailyEntry[] {
  return Array.from(map.entries())
    .map(([date, bucket]) => ({ date, ...bucket }))
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

function toRecord(map: Map<string, CostUsageTotals>): Record<string, CostUsageTotals> {
  const result: Record<string, CostUsageTotals> = {};
  for (const [key, value] of map) {
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Singleton aggregator + recordSpend convenience
// ---------------------------------------------------------------------------

let aggregatorInstance: SpendAggregator | undefined;

export function getSpendAggregator(): SpendAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new SpendAggregator();
  }
  return aggregatorInstance;
}

export async function initSpendAggregator(): Promise<SpendAggregator> {
  const agg = getSpendAggregator();
  await agg.rebuild();
  return agg;
}

export async function recordSpend(entry: SpendEntry): Promise<void> {
  await appendSpendEntry(entry);
  getSpendAggregator().ingest(entry);
}

/**
 * Record spend from an agent run result. Shared by agent-runner.ts and commands/agent.ts
 * so the spend-recording logic lives in one place.
 */
export function recordSpendFromResult(params: {
  usage: NormalizedUsage | undefined;
  provider: string;
  model: string;
  config: OpenClawConfig | undefined;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  startedAt: number;
}): void {
  const { usage } = params;
  if (!hasNonzeroUsage(usage)) {
    return;
  }
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  const totalTokens = usage.total ?? input + output + cacheRead + cacheWrite;
  const costConfig = resolveModelCostConfig({
    provider: params.provider,
    model: params.model,
    config: params.config,
  });
  const costUsd = estimateUsageCost({ usage, cost: costConfig });
  recordSpend({
    ts: Date.now(),
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    channel: params.channel,
    provider: params.provider,
    model: params.model,
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    costUsd: costUsd ?? 0,
    durationMs: Date.now() - params.startedAt,
  }).catch(() => {});
}

/** Reset module-level state (for tests). */
export function _resetForTest(): void {
  aggregatorInstance = undefined;
  dirReady = undefined;
  writeQueue = Promise.resolve();
}
