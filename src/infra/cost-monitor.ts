/**
 * Cost Monitor — Automated cost cap + alerts
 *
 * Reads cost-log.jsonl, calculates rolling spend, and triggers alerts
 * when spending exceeds configurable thresholds.
 */
import fs from "node:fs";
import path from "node:path";
import { logVerbose } from "../globals.js";

export interface CostEntry {
  date: string;
  totalCost?: number;
  totalTokens?: number;
  breakdown?: Record<string, { sessions: number; tokens: number; cost: number }>;
  timestamp?: string;
  note?: string;
}

export interface CostMonitorConfig {
  /** Path to cost-log.jsonl */
  costLogPath: string;
  /** Daily spend cap in USD (default: $20) */
  dailyCapUsd: number;
  /** Monthly projected cap in USD (default: $600) */
  monthlyCapUsd: number;
  /** Whether to kill tasks on hard cap breach */
  killOnHardCap: boolean;
  /** Callback for sending alerts */
  onAlert?: (alert: CostAlert) => Promise<void>;
}

export interface CostAlert {
  level: "warning" | "critical";
  currentDailySpend: number;
  projectedMonthlySpend: number;
  dailyCap: number;
  monthlyCap: number;
  breakdown: Record<string, { cost: number; tokens: number; sessions: number }>;
  message: string;
  shouldKill: boolean;
}

export interface CostSummary {
  totalSpend30d: number;
  dailyAverage: number;
  projectedMonthly: number;
  todaySpend: number;
  breakdown: Record<string, { cost: number; tokens: number; sessions: number }>;
  daysTracked: number;
}

const DEFAULT_CONFIG: CostMonitorConfig = {
  costLogPath: "",
  dailyCapUsd: 20,
  monthlyCapUsd: 600,
  killOnHardCap: false,
};

/**
 * Parse cost-log.jsonl and return entries.
 */
export function parseCostLog(filePath: string): CostEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: CostEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Calculate a rolling cost summary from log entries.
 */
export function calculateCostSummary(entries: CostEntry[], windowDays = 30): CostSummary {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);

  const relevantEntries = entries.filter((e) => {
    if (!e.date || !e.totalCost) {
      return false;
    }
    return new Date(e.date) >= cutoff;
  });

  let totalSpend = 0;
  let todaySpend = 0;
  const breakdown: Record<string, { cost: number; tokens: number; sessions: number }> = {};
  const datesSet = new Set<string>();

  for (const entry of relevantEntries) {
    totalSpend += entry.totalCost ?? 0;
    datesSet.add(entry.date);

    if (entry.date === today) {
      todaySpend += entry.totalCost ?? 0;
    }

    if (entry.breakdown) {
      for (const [model, data] of Object.entries(entry.breakdown)) {
        if (!breakdown[model]) {
          breakdown[model] = { cost: 0, tokens: 0, sessions: 0 };
        }
        breakdown[model].cost += data.cost ?? 0;
        breakdown[model].tokens += data.tokens ?? 0;
        breakdown[model].sessions += data.sessions ?? 0;
      }
    }
  }

  const daysTracked = Math.max(datesSet.size, 1);
  const dailyAverage = totalSpend / daysTracked;
  const projectedMonthly = dailyAverage * 30;

  return {
    totalSpend30d: totalSpend,
    dailyAverage,
    projectedMonthly,
    todaySpend,
    breakdown,
    daysTracked,
  };
}

/**
 * Evaluate whether an alert should fire based on current spending.
 */
export function evaluateAlert(
  summary: CostSummary,
  config: Partial<CostMonitorConfig> = {},
): CostAlert | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const isWarning =
    summary.todaySpend >= cfg.dailyCapUsd * 0.8 ||
    summary.projectedMonthly >= cfg.monthlyCapUsd * 0.8;
  const isCritical =
    summary.todaySpend >= cfg.dailyCapUsd || summary.projectedMonthly >= cfg.monthlyCapUsd;

  if (!isWarning && !isCritical) {
    return null;
  }

  const level = isCritical ? "critical" : "warning";
  const shouldKill = isCritical && cfg.killOnHardCap;

  const lines = [
    `🚨 **Cost ${level.toUpperCase()}**`,
    `• Today's spend: $${summary.todaySpend.toFixed(2)} (cap: $${cfg.dailyCapUsd})`,
    `• Projected monthly: $${summary.projectedMonthly.toFixed(2)} (cap: $${cfg.monthlyCapUsd})`,
    `• 30-day total: $${summary.totalSpend30d.toFixed(2)} over ${summary.daysTracked} days`,
    "",
    "**Breakdown by model:**",
  ];

  for (const [model, data] of Object.entries(summary.breakdown).toSorted(
    (a, b) => b[1].cost - a[1].cost,
  )) {
    lines.push(
      `  • ${model}: $${data.cost.toFixed(2)} (${data.sessions} sessions, ${(data.tokens / 1000).toFixed(0)}k tokens)`,
    );
  }

  if (shouldKill) {
    lines.push(
      "",
      "⚠️ **Hard cap reached — expensive tasks will be blocked pending confirmation.**",
    );
  }

  return {
    level,
    currentDailySpend: summary.todaySpend,
    projectedMonthlySpend: summary.projectedMonthly,
    dailyCap: cfg.dailyCapUsd,
    monthlyCap: cfg.monthlyCapUsd,
    breakdown: summary.breakdown,
    message: lines.join("\n"),
    shouldKill,
  };
}

/**
 * Run a full cost check: parse log → summarize → evaluate → alert if needed.
 */
export async function runCostCheck(
  config: Partial<CostMonitorConfig> & { costLogPath: string },
): Promise<{
  summary: CostSummary;
  alert: CostAlert | null;
}> {
  const entries = parseCostLog(config.costLogPath);
  const summary = calculateCostSummary(entries);
  const alert = evaluateAlert(summary, config);

  if (alert && config.onAlert) {
    try {
      await config.onAlert(alert);
    } catch (err) {
      logVerbose(`cost-monitor: failed to send alert: ${String(err)}`);
    }
  }

  return { summary, alert };
}

/**
 * Append a cost entry to the log file.
 */
export function appendCostEntry(filePath: string, entry: CostEntry): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
}
