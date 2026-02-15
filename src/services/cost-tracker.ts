/**
 * Cost Tracker Service
 *
 * Tracks token usage and estimated costs per message, session, and day.
 * Provides alerts when daily budget is exceeded and logs cost data
 * for monitoring and optimization.
 *
 * Pricing is based on Anthropic's published rates (USD per million tokens).
 * GBP conversion uses a configurable exchange rate.
 */

import fs from "node:fs";
import path from "node:path";

import { defaultRuntime } from "../runtime.js";

/** Pricing per million tokens (USD) for supported models. */
type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

/** Known model pricing (Anthropic published rates as of 2025). */
const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-5": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  "claude-sonnet-4-5": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  "claude-sonnet-4": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  "claude-3-5-sonnet": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  "claude-3-5-haiku": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
  "claude-haiku-3-5": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
};

/** Default pricing if model not found (uses Sonnet rates as reasonable default). */
const DEFAULT_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheReadPerMillion: 0.3,
  cacheWritePerMillion: 3.75,
};

/** USD to GBP exchange rate (configurable via env). */
const USD_TO_GBP = Number.parseFloat(process.env.USD_TO_GBP_RATE ?? "") || 0.79;

/** Daily budget in GBP (configurable via env, default: 2 GBP = ~60 GBP/month). */
const DAILY_BUDGET_GBP =
  Number.parseFloat(process.env.COST_DAILY_LIMIT ?? "") || 2;

/** Monthly budget in GBP (configurable via env, default: £60). */
const MONTHLY_BUDGET_GBP =
  Number.parseFloat(process.env.COST_MONTHLY_LIMIT ?? "") || 60;

export type CostEntry = {
  timestamp: number;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  costGbp: number;
  dailyTotalGbp: number;
  budgetRemainingGbp: number;
  overBudget: boolean;
};

type DailySummary = {
  date: string;
  totalCostUsd: number;
  totalCostGbp: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  messageCount: number;
  overBudget: boolean;
};

type MonthlySummary = {
  month: string;
  totalCostUsd: number;
  totalCostGbp: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  messageCount: number;
  overBudget: boolean;
};

/** In-memory daily cost accumulator. */
const dailyCosts = new Map<string, DailySummary>();

/** In-memory monthly cost accumulator. */
const monthlyCosts = new Map<string, MonthlySummary>();

/**
 * Get today's date key in YYYY-MM-DD format.
 */
function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get current month key in YYYY-MM format.
 */
function getMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Look up pricing for a given model ID.
 */
function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Try partial match (e.g., "claude-opus-4-5" matches "opus-4-5")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }

  // Check for model family patterns
  const lower = model.toLowerCase();
  if (lower.includes("opus")) {
    return MODEL_PRICING["claude-opus-4-5"];
  }
  if (lower.includes("haiku")) {
    return MODEL_PRICING["claude-3-5-haiku"];
  }
  if (lower.includes("sonnet")) {
    return MODEL_PRICING["claude-sonnet-4"];
  }

  return DEFAULT_PRICING;
}

/**
 * Calculate cost in USD for a given token usage.
 */
function calculateCostUsd(
  pricing: ModelPricing,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  return (
    (input / 1_000_000) * pricing.inputPerMillion +
    (output / 1_000_000) * pricing.outputPerMillion +
    (cacheRead / 1_000_000) * pricing.cacheReadPerMillion +
    (cacheWrite / 1_000_000) * pricing.cacheWritePerMillion
  );
}

/**
 * Get or create today's daily summary.
 */
function getOrCreateDailySummary(): DailySummary {
  const today = getTodayKey();
  let summary = dailyCosts.get(today);
  if (!summary) {
    summary = {
      date: today,
      totalCostUsd: 0,
      totalCostGbp: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      messageCount: 0,
      overBudget: false,
    };
    dailyCosts.set(today, summary);

    // Clean up old entries (keep last 7 days)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key] of dailyCosts) {
      const date = new Date(key).getTime();
      if (date < cutoff) dailyCosts.delete(key);
    }
  }
  return summary;
}

/**
 * Get or create the current month's summary.
 */
function getOrCreateMonthlySummary(): MonthlySummary {
  const month = getMonthKey();
  let summary = monthlyCosts.get(month);
  if (!summary) {
    summary = {
      month,
      totalCostUsd: 0,
      totalCostGbp: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      messageCount: 0,
      overBudget: false,
    };
    monthlyCosts.set(month, summary);

    // Clean up old entries (keep last 3 months)
    const keys = [...monthlyCosts.keys()].sort();
    while (keys.length > 3) {
      const oldest = keys.shift();
      if (oldest) monthlyCosts.delete(oldest);
    }
  }
  return summary;
}

/**
 * Track a single API call's cost.
 *
 * @param params - Token usage from the API response
 * @returns The cost entry with budget status
 */
export function trackCost(params: {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): CostEntry {
  const pricing = getModelPricing(params.model);
  const cacheRead = params.cacheReadTokens ?? 0;
  const cacheWrite = params.cacheWriteTokens ?? 0;

  const costUsd = calculateCostUsd(
    pricing,
    params.inputTokens,
    params.outputTokens,
    cacheRead,
    cacheWrite,
  );
  const costGbp = costUsd * USD_TO_GBP;

  // Update daily summary
  const summary = getOrCreateDailySummary();
  summary.totalCostUsd += costUsd;
  summary.totalCostGbp += costGbp;
  summary.totalInputTokens += params.inputTokens;
  summary.totalOutputTokens += params.outputTokens;
  summary.totalCacheReadTokens += cacheRead;
  summary.totalCacheWriteTokens += cacheWrite;
  summary.messageCount += 1;
  summary.overBudget = summary.totalCostGbp > DAILY_BUDGET_GBP;

  // Update monthly summary
  const monthly = getOrCreateMonthlySummary();
  monthly.totalCostUsd += costUsd;
  monthly.totalCostGbp += costGbp;
  monthly.totalInputTokens += params.inputTokens;
  monthly.totalOutputTokens += params.outputTokens;
  monthly.totalCacheReadTokens += cacheRead;
  monthly.totalCacheWriteTokens += cacheWrite;
  monthly.messageCount += 1;
  monthly.overBudget = monthly.totalCostGbp > MONTHLY_BUDGET_GBP;

  const budgetRemaining = Math.max(0, DAILY_BUDGET_GBP - summary.totalCostGbp);

  const entry: CostEntry = {
    timestamp: Date.now(),
    sessionId: params.sessionId,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd,
    costGbp,
    dailyTotalGbp: summary.totalCostGbp,
    budgetRemainingGbp: budgetRemaining,
    overBudget: summary.overBudget,
  };

  // Log cost info
  defaultRuntime.log?.(
    `[cost-tracker] message cost: ${formatGbp(costGbp)} | daily total: ${formatGbp(summary.totalCostGbp)}/${formatGbp(DAILY_BUDGET_GBP)} | ` +
      `tokens: in=${params.inputTokens} out=${params.outputTokens} cache_r=${cacheRead} cache_w=${cacheWrite} | ` +
      `model=${params.model} session=${params.sessionId}`,
  );

  // Alert on budget exceeded
  if (summary.overBudget) {
    defaultRuntime.log?.(
      `[cost-tracker] WARNING: Daily budget exceeded! ${formatGbp(summary.totalCostGbp)} > ${formatGbp(DAILY_BUDGET_GBP)} limit`,
    );
  }

  // Alert when approaching budget (80%)
  if (!summary.overBudget && summary.totalCostGbp > DAILY_BUDGET_GBP * 0.8) {
    defaultRuntime.log?.(
      `[cost-tracker] CAUTION: Approaching daily budget (${Math.round((summary.totalCostGbp / DAILY_BUDGET_GBP) * 100)}% used)`,
    );
  }

  // Monthly budget alerts
  if (monthly.overBudget) {
    defaultRuntime.log?.(
      `[cost-tracker] WARNING: Monthly budget exceeded! ${formatGbp(monthly.totalCostGbp)} > ${formatGbp(MONTHLY_BUDGET_GBP)} limit`,
    );
  } else if (monthly.totalCostGbp > MONTHLY_BUDGET_GBP * 0.8) {
    defaultRuntime.log?.(
      `[cost-tracker] CAUTION: Approaching monthly budget (${Math.round((monthly.totalCostGbp / MONTHLY_BUDGET_GBP) * 100)}% used)`,
    );
  }

  // Append to cost log file
  void appendCostLog(entry).catch(() => {
    // Non-critical: don't fail the main flow if logging fails
  });

  return entry;
}

/**
 * Get today's cost summary.
 */
export function getDailySummary(): DailySummary {
  return getOrCreateDailySummary();
}

/**
 * Check if today's budget has been exceeded.
 */
export function isBudgetExceeded(): boolean {
  return getOrCreateDailySummary().overBudget;
}

/**
 * Get the daily budget in GBP.
 */
export function getDailyBudgetGbp(): number {
  return DAILY_BUDGET_GBP;
}

/**
 * Get the current month's cost summary.
 */
export function getMonthlySummary(): MonthlySummary {
  return getOrCreateMonthlySummary();
}

/**
 * Check if this month's budget has been exceeded.
 */
export function isMonthlyBudgetExceeded(): boolean {
  return getOrCreateMonthlySummary().overBudget;
}

/**
 * Get the monthly budget in GBP.
 */
export function getMonthlyBudgetGbp(): number {
  return MONTHLY_BUDGET_GBP;
}

/**
 * Format a GBP amount for display.
 */
function formatGbp(amount: number): string {
  return `\u00A3${amount.toFixed(4)}`;
}

/**
 * Resolve the cost log file path.
 */
function resolveCostLogPath(): string {
  const stateDir =
    process.env.CLAWDIS_STATE_DIR ??
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".clawdis");
  return path.join(stateDir, "cost-log.jsonl");
}

/**
 * Append a cost entry to the JSONL log file.
 */
async function appendCostLog(entry: CostEntry): Promise<void> {
  const logPath = resolveCostLogPath();
  const dir = path.dirname(logPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  await fs.promises.appendFile(logPath, line, "utf-8");
}

/**
 * Read all cost entries for a given date (YYYY-MM-DD).
 * Returns entries from the JSONL log file.
 */
export async function readCostLog(date?: string): Promise<CostEntry[]> {
  const logPath = resolveCostLogPath();
  if (!fs.existsSync(logPath)) return [];

  const targetDate = date ?? getTodayKey();
  const dayStart = new Date(`${targetDate}T00:00:00Z`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  try {
    const content = await fs.promises.readFile(logPath, "utf-8");
    const entries: CostEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as CostEntry;
        if (entry.timestamp >= dayStart && entry.timestamp < dayEnd) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Generate a cost report for a given date.
 */
export async function generateCostReport(date?: string): Promise<string> {
  const entries = await readCostLog(date);
  const targetDate = date ?? getTodayKey();

  if (entries.length === 0) {
    return `Cost Report for ${targetDate}: No data available.`;
  }

  const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);
  const totalCostGbp = entries.reduce((sum, e) => sum + e.costGbp, 0);
  const totalInput = entries.reduce((sum, e) => sum + e.inputTokens, 0);
  const totalOutput = entries.reduce((sum, e) => sum + e.outputTokens, 0);
  const totalCacheRead = entries.reduce(
    (sum, e) => sum + (e.cacheReadTokens ?? 0),
    0,
  );
  const totalCacheWrite = entries.reduce(
    (sum, e) => sum + (e.cacheWriteTokens ?? 0),
    0,
  );
  const avgCostPerMsg = totalCostGbp / entries.length;

  // Cache hit rate: proportion of input served from cache
  const cacheHitRate =
    totalCacheRead + totalInput > 0
      ? (totalCacheRead / (totalCacheRead + totalInput)) * 100
      : 0;

  // Estimated cache savings: difference between full input rate and cache read rate
  // Uses a representative model's pricing (Sonnet rates as default)
  const representativeModel =
    entries.length > 0 ? entries[0].model : "claude-sonnet-4-5";
  const pricing = getModelPricing(representativeModel);
  const cacheSavingsUsd =
    (totalCacheRead / 1_000_000) *
    (pricing.inputPerMillion - pricing.cacheReadPerMillion);
  const cacheSavingsGbp = cacheSavingsUsd * USD_TO_GBP;

  // Monthly summary
  const monthly = getOrCreateMonthlySummary();

  const lines = [
    `=== Cost Report: ${targetDate} ===`,
    `Messages: ${entries.length}`,
    `Total Cost: ${formatGbp(totalCostGbp)} ($${totalCostUsd.toFixed(4)})`,
    `Budget: ${formatGbp(totalCostGbp)}/${formatGbp(DAILY_BUDGET_GBP)} (${Math.round((totalCostGbp / DAILY_BUDGET_GBP) * 100)}%)`,
    `Avg Cost/Message: ${formatGbp(avgCostPerMsg)}`,
    `Total Input Tokens: ${totalInput.toLocaleString()}`,
    `Total Output Tokens: ${totalOutput.toLocaleString()}`,
    `Projected Monthly: ${formatGbp(totalCostGbp * 30)}`,
    totalCostGbp > DAILY_BUDGET_GBP
      ? "STATUS: OVER BUDGET"
      : "STATUS: Within budget",
    "",
    "--- Cache Performance ---",
    `Cache Read Tokens: ${totalCacheRead.toLocaleString()}`,
    `Cache Write Tokens: ${totalCacheWrite.toLocaleString()}`,
    `Cache Hit Rate: ${cacheHitRate.toFixed(1)}%`,
    `Est. Cache Savings: ${formatGbp(cacheSavingsGbp)} ($${cacheSavingsUsd.toFixed(4)})`,
    "",
    "--- Monthly Summary ---",
    `Month: ${monthly.month}`,
    `Monthly Cost: ${formatGbp(monthly.totalCostGbp)} / ${formatGbp(MONTHLY_BUDGET_GBP)} (${Math.round((monthly.totalCostGbp / MONTHLY_BUDGET_GBP) * 100)}%)`,
    `Monthly Messages: ${monthly.messageCount.toLocaleString()}`,
    monthly.overBudget
      ? "MONTHLY STATUS: OVER BUDGET"
      : "MONTHLY STATUS: Within budget",
  ];

  return lines.join("\n");
}
