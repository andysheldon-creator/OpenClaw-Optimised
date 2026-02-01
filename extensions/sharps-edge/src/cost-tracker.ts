/**
 * SHARPS EDGE - Cost Tracking System
 *
 * Monitors budget usage and blocks actions when limits are approached.
 * Persists cost data to workspace/logs/costs/YYYY-MM.json.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { AuditLogger } from "./audit-logger.js";
import {
  type BudgetState,
  DEFAULT_BUDGET_ALERT_THRESHOLD,
  DEFAULT_BUDGET_MONTHLY_USD,
  Severity,
  type SharpsEdgeConfig,
} from "./types.js";

/**
 * Estimate cost of a tool call in USD.
 * These are rough estimates - actual costs depend on token usage.
 */
function estimateToolCost(toolName: string, params: Record<string, unknown>): number {
  // LLM-invoking tools are the most expensive
  const expensive = new Set(["exec", "shell", "bash", "run_command"]);
  if (expensive.has(toolName)) {
    return 0.005; // ~$0.005 per command execution (conservative)
  }

  // File operations are essentially free
  const fileOps = new Set(["read", "write", "edit", "apply_patch", "create_file", "delete_file"]);
  if (fileOps.has(toolName)) {
    return 0.0001;
  }

  // Browser operations are moderate
  if (toolName === "browser" || toolName === "web_search") {
    return 0.01;
  }

  // Default: small cost for tracking purposes
  return 0.001;
}

export class CostTracker {
  private workspaceDir: string;
  private monthlyLimitUsd: number;
  private alertThreshold: number;
  private state: BudgetState | null = null;
  private dirty = false;

  constructor(workspaceDir: string, monthlyLimitUsd: number, alertThreshold: number) {
    this.workspaceDir = workspaceDir;
    this.monthlyLimitUsd = monthlyLimitUsd;
    this.alertThreshold = alertThreshold;
  }

  private get currentMonth(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  private get costFilePath(): string {
    return path.join(this.workspaceDir, "logs", "costs", `${this.currentMonth}.json`);
  }

  async loadState(): Promise<BudgetState> {
    if (this.state && this.state.month === this.currentMonth) {
      return this.state;
    }

    try {
      const raw = await fs.readFile(this.costFilePath, "utf-8");
      this.state = JSON.parse(raw) as BudgetState;

      // Reset if month changed
      if (this.state.month !== this.currentMonth) {
        this.state = this.freshState();
      }
    } catch {
      this.state = this.freshState();
    }

    return this.state;
  }

  private freshState(): BudgetState {
    return {
      month: this.currentMonth,
      totalSpentUsd: 0,
      entries: [],
      apiQuotas: {
        "the-odds-api": { limit: 500, used: 0, resetsAt: "monthly" },
      },
    };
  }

  async saveState(): Promise<void> {
    if (!this.state || !this.dirty) return;

    const dir = path.dirname(this.costFilePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.costFilePath, JSON.stringify(this.state, null, 2), "utf-8");
    this.dirty = false;
  }

  async recordCost(toolName: string, params: Record<string, unknown>, projectId: string): Promise<void> {
    const state = await this.loadState();
    const cost = estimateToolCost(toolName, params);

    state.totalSpentUsd += cost;
    state.entries.push({
      timestamp: new Date().toISOString(),
      projectId,
      toolName,
      estimatedCostUsd: cost,
      cumulativeMonthUsd: state.totalSpentUsd,
    });

    // Keep only last 1000 entries to prevent unbounded growth
    if (state.entries.length > 1000) {
      state.entries = state.entries.slice(-500);
    }

    this.dirty = true;

    // Periodic save (every 10 entries)
    if (state.entries.length % 10 === 0) {
      await this.saveState();
    }
  }

  async getBudgetRatio(): Promise<number> {
    const state = await this.loadState();
    return state.totalSpentUsd / this.monthlyLimitUsd;
  }

  async getSummary(): Promise<{
    month: string;
    spent: number;
    limit: number;
    ratio: number;
    remaining: number;
    dailyBurn: number;
  }> {
    const state = await this.loadState();
    const dayOfMonth = new Date().getDate();
    const ratio = state.totalSpentUsd / this.monthlyLimitUsd;

    return {
      month: state.month,
      spent: state.totalSpentUsd,
      limit: this.monthlyLimitUsd,
      ratio,
      remaining: this.monthlyLimitUsd - state.totalSpentUsd,
      dailyBurn: dayOfMonth > 0 ? state.totalSpentUsd / dayOfMonth : 0,
    };
  }
}

/**
 * Register cost tracking hooks on the plugin API.
 */
export function registerCostTracker(
  api: OpenClawPluginApi,
  cfg: SharpsEdgeConfig,
  auditLogger: AuditLogger,
): CostTracker {
  const workspaceDir = api.resolvePath("~/.openclaw/workspace");
  const monthlyLimit = cfg.budgetMonthlyUsd ?? DEFAULT_BUDGET_MONTHLY_USD;
  const alertThreshold = cfg.budgetAlertThreshold ?? DEFAULT_BUDGET_ALERT_THRESHOLD;

  const tracker = new CostTracker(workspaceDir, monthlyLimit, alertThreshold);

  // Track costs after every tool call
  api.on("after_tool_call", async (event, ctx) => {
    const projectId = ctx.agentId ?? "UNKNOWN";
    try {
      await tracker.recordCost(event.toolName, event.params, projectId);

      // Check if we need to alert
      const ratio = await tracker.getBudgetRatio();
      if (ratio >= alertThreshold && ratio < alertThreshold + 0.01) {
        // Just crossed the threshold
        const summary = await tracker.getSummary();
        await auditLogger.logAlert(
          projectId,
          Severity.WARN,
          `Budget alert: ${(ratio * 100).toFixed(1)}% used ($${summary.spent.toFixed(2)} / $${summary.limit})`,
        );
        api.logger.warn(
          `sharps-edge: Budget at ${(ratio * 100).toFixed(1)}% ($${summary.spent.toFixed(2)} / $${summary.limit})`,
        );
      }
    } catch {
      // Never let cost tracking crash the pipeline
    }
  });

  // Save state when gateway stops
  api.on("gateway_stop", async () => {
    try {
      await tracker.saveState();
    } catch {
      // Best effort
    }
  });

  return tracker;
}
