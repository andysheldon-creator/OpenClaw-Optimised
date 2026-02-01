/**
 * SHARPS EDGE - CLI Commands
 *
 * Registers CLI subcommands under `openclaw sharps`.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import type { CostTracker } from "../cost-tracker.js";
import type { SharpsEdgeConfig } from "../types.js";

/**
 * Register all SHARPS EDGE CLI commands.
 */
export function registerSharpsEdgeCli(
  api: OpenClawPluginApi,
  cfg: SharpsEdgeConfig,
  costTracker: CostTracker,
): void {
  const projectDir = cfg.projectDir ?? "projects/SHARPS-EDGE";

  api.registerCli(
    ({ program, logger }) => {
      const sharps = program
        .command("sharps")
        .description("SHARPS EDGE Builder Edition commands");

      // --- status ---
      sharps
        .command("status")
        .description("Show project status, build state, and budget")
        .action(async () => {
          const workspaceDir = api.resolvePath("~/.openclaw/workspace");

          // Read build status
          let buildStatus = "(no build status file)";
          try {
            buildStatus = await fs.readFile(
              path.join(workspaceDir, projectDir, "BUILD_STATUS.md"),
              "utf-8",
            );
          } catch { /* missing file */ }

          // Read charter
          let charterSummary = "(no charter)";
          try {
            const charter = await fs.readFile(
              path.join(workspaceDir, projectDir, "CHARTER.md"),
              "utf-8",
            );
            // Extract objective line
            const match = charter.match(/## Objective\n\n(.+?)(?:\n\n|\n##)/s);
            charterSummary = match?.[1]?.trim() ?? charter.slice(0, 200);
          } catch { /* missing file */ }

          // Budget
          const budget = await costTracker.getSummary();

          console.log("=== SHARPS EDGE Status ===\n");
          console.log(`Project: ${projectDir}`);
          console.log(`Objective: ${charterSummary}`);
          console.log("");
          console.log("--- Budget ---");
          console.log(`Month: ${budget.month}`);
          console.log(`Spent: $${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)} (${(budget.ratio * 100).toFixed(1)}%)`);
          console.log(`Remaining: $${budget.remaining.toFixed(2)}`);
          console.log(`Daily burn: $${budget.dailyBurn.toFixed(2)}/day`);
          console.log("");
          console.log("--- Build Status ---");
          console.log(buildStatus);
        });

      // --- tasks ---
      sharps
        .command("tasks")
        .description("Show task queue")
        .action(async () => {
          const workspaceDir = api.resolvePath("~/.openclaw/workspace");
          try {
            const tasks = await fs.readFile(
              path.join(workspaceDir, projectDir, "TASKS.md"),
              "utf-8",
            );
            console.log(tasks);
          } catch {
            console.log("No tasks file found.");
          }
        });

      // --- costs ---
      sharps
        .command("costs")
        .description("Show budget and cost tracking details")
        .action(async () => {
          const summary = await costTracker.getSummary();
          console.log("=== SHARPS EDGE Budget ===\n");
          console.log(`Month: ${summary.month}`);
          console.log(`Spent: $${summary.spent.toFixed(4)}`);
          console.log(`Limit: $${summary.limit.toFixed(2)}`);
          console.log(`Used: ${(summary.ratio * 100).toFixed(2)}%`);
          console.log(`Remaining: $${summary.remaining.toFixed(2)}`);
          console.log(`Daily burn: $${summary.dailyBurn.toFixed(4)}/day`);

          if (summary.ratio >= 0.8) {
            console.log("\n!! WARNING: Budget above 80% !!");
          }
          if (summary.ratio >= 0.95) {
            console.log("!! CRITICAL: Budget above 95% - non-essential actions blocked !!");
          }
        });

      // --- logs ---
      sharps
        .command("logs")
        .description("Show today's audit logs")
        .option("--type <type>", "Log type: conflicts, errors, decisions, alerts", "decisions")
        .option("--date <date>", "Date in YYYY-MM-DD format", new Date().toISOString().slice(0, 10))
        .action(async (opts: { type: string; date: string }) => {
          const workspaceDir = api.resolvePath("~/.openclaw/workspace");
          const logPath = path.join(workspaceDir, "logs", opts.type, `${opts.date}.md`);
          try {
            const content = await fs.readFile(logPath, "utf-8");
            console.log(`=== ${opts.type} logs for ${opts.date} ===\n`);
            console.log(content);
          } catch {
            console.log(`No ${opts.type} logs found for ${opts.date}.`);
          }
        });

      // --- conflicts ---
      sharps
        .command("conflicts")
        .description("Show today's conflict log")
        .action(async () => {
          const workspaceDir = api.resolvePath("~/.openclaw/workspace");
          const today = new Date().toISOString().slice(0, 10);
          const logPath = path.join(workspaceDir, "logs", "conflicts", `${today}.md`);
          try {
            const content = await fs.readFile(logPath, "utf-8");
            console.log(`=== Conflicts for ${today} ===\n`);
            console.log(content);
          } catch {
            console.log(`No conflicts logged today (${today}). All clear.`);
          }
        });
    },
    { commands: ["sharps"] },
  );

  // Register chat command for instant status (bypasses LLM)
  api.registerCommand({
    name: "sharps-status",
    description: "Show SHARPS EDGE project status (instant, no LLM)",
    handler: async (_ctx) => {
      const budget = await costTracker.getSummary();
      const workspaceDir = api.resolvePath("~/.openclaw/workspace");

      let currentTask = "IDLE";
      try {
        const tasks = await fs.readFile(
          path.join(workspaceDir, projectDir, "TASKS.md"),
          "utf-8",
        );
        const firstPending = tasks.match(/- \[ \] (.+)/);
        if (firstPending) {
          currentTask = firstPending[1];
        }
      } catch { /* missing file */ }

      const text = [
        "**SHARPS EDGE Status**",
        `Budget: $${budget.spent.toFixed(2)} / $${budget.limit} (${(budget.ratio * 100).toFixed(1)}%)`,
        `Next task: ${currentTask}`,
        budget.ratio >= 0.8 ? "!! Budget warning !!" : "",
      ]
        .filter(Boolean)
        .join("\n");

      return { text };
    },
  });
}
