import type { CostUsageSummary, CostLimitsConfig } from "./session-cost-usage.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitDiagnosticEvent } from "./diagnostic-events.js";
import { checkCostThresholds } from "./session-cost-usage.js";

const log = createSubsystemLogger("infra/budget");

export type BudgetConfig = {
  daily?: number;
  weekly?: number;
  monthly?: number;
};

const WARNING_THRESHOLD_PCT = 80;

export type BudgetCheckResult = {
  warnings: Array<{
    period: "daily" | "weekly" | "monthly";
    currentCost: number;
    budgetLimit: number;
    percentage: number;
    level: "warning" | "exceeded";
  }>;
};

export function checkBudget(params: {
  summary: CostUsageSummary;
  budget: BudgetConfig;
}): BudgetCheckResult {
  const limits: CostLimitsConfig = params.budget;
  const thresholds = checkCostThresholds({ summary: params.summary, limits });
  const warnings: BudgetCheckResult["warnings"] = [];

  for (const t of thresholds) {
    if (t.exceeded) {
      warnings.push({
        period: t.period,
        currentCost: t.currentCost,
        budgetLimit: t.limit,
        percentage: t.percentage,
        level: "exceeded",
      });
      emitDiagnosticEvent({
        type: "budget.exceeded",
        period: t.period,
        currentCost: t.currentCost,
        budgetLimit: t.limit,
        percentage: t.percentage,
      });
      log.warn(
        `Budget EXCEEDED for ${t.period}: $${t.currentCost.toFixed(2)} / $${t.limit.toFixed(2)} (${t.percentage.toFixed(1)}%)`,
      );
    } else if (t.percentage >= WARNING_THRESHOLD_PCT) {
      warnings.push({
        period: t.period,
        currentCost: t.currentCost,
        budgetLimit: t.limit,
        percentage: t.percentage,
        level: "warning",
      });
      emitDiagnosticEvent({
        type: "budget.warning",
        period: t.period,
        currentCost: t.currentCost,
        budgetLimit: t.limit,
        percentage: t.percentage,
      });
      log.warn(
        `Budget warning for ${t.period}: $${t.currentCost.toFixed(2)} / $${t.limit.toFixed(2)} (${t.percentage.toFixed(1)}%)`,
      );
    }
  }

  return { warnings };
}

export type CostByProviderModel = {
  provider: string;
  model: string;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
};

export function groupCostByProviderModel(
  entries: Array<{
    provider?: string;
    model?: string;
    costTotal?: number;
    totalTokens?: number;
  }>,
): CostByProviderModel[] {
  const map = new Map<string, CostByProviderModel>();

  for (const entry of entries) {
    const provider = entry.provider ?? "unknown";
    const model = entry.model ?? "unknown";
    const key = `${provider}/${model}`;
    const existing = map.get(key) ?? {
      provider,
      model,
      totalCost: 0,
      totalTokens: 0,
      requestCount: 0,
    };
    existing.totalCost += entry.costTotal ?? 0;
    existing.totalTokens += entry.totalTokens ?? 0;
    existing.requestCount += 1;
    map.set(key, existing);
  }

  return Array.from(map.values()).toSorted((a, b) => b.totalCost - a.totalCost);
}
