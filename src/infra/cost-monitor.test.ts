import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  parseCostLog,
  calculateCostSummary,
  evaluateAlert,
  appendCostEntry,
  runCostCheck,
  type CostEntry,
} from "./cost-monitor.js";

describe("cost-monitor", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-monitor-"));
    logPath = path.join(tmpDir, "cost-log.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parseCostLog", () => {
    it("returns empty for nonexistent file", () => {
      expect(parseCostLog("/nonexistent")).toEqual([]);
    });

    it("parses valid entries", () => {
      fs.writeFileSync(
        logPath,
        '{"date":"2026-02-09","totalCost":5.0}\n{"date":"2026-02-08","totalCost":3.0}\n',
      );
      const entries = parseCostLog(logPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].totalCost).toBe(5.0);
    });

    it("skips malformed lines", () => {
      fs.writeFileSync(logPath, '{"date":"2026-02-09","totalCost":5.0}\ngarbage\n');
      expect(parseCostLog(logPath)).toHaveLength(1);
    });
  });

  describe("calculateCostSummary", () => {
    it("calculates summary from entries", () => {
      const today = new Date().toISOString().slice(0, 10);
      const entries: CostEntry[] = [
        {
          date: today,
          totalCost: 25,
          breakdown: {
            opus: { sessions: 5, tokens: 500000, cost: 20 },
            haiku: { sessions: 10, tokens: 200000, cost: 5 },
          },
        },
      ];
      const summary = calculateCostSummary(entries);
      expect(summary.todaySpend).toBe(25);
      expect(summary.totalSpend30d).toBe(25);
      expect(summary.breakdown.opus.cost).toBe(20);
    });
  });

  describe("evaluateAlert", () => {
    it("returns null when under thresholds", () => {
      const alert = evaluateAlert({
        totalSpend30d: 10,
        dailyAverage: 5,
        projectedMonthly: 150,
        todaySpend: 5,
        breakdown: {},
        daysTracked: 2,
      });
      expect(alert).toBeNull();
    });

    it("returns warning at 80% threshold", () => {
      const alert = evaluateAlert(
        {
          totalSpend30d: 100,
          dailyAverage: 17,
          projectedMonthly: 510,
          todaySpend: 17,
          breakdown: {},
          daysTracked: 6,
        },
        { dailyCapUsd: 20, monthlyCapUsd: 600 },
      );
      expect(alert).not.toBeNull();
      expect(alert!.level).toBe("warning");
    });

    it("returns critical at 100% threshold", () => {
      const alert = evaluateAlert(
        {
          totalSpend30d: 200,
          dailyAverage: 25,
          projectedMonthly: 750,
          todaySpend: 25,
          breakdown: {},
          daysTracked: 8,
        },
        { dailyCapUsd: 20, monthlyCapUsd: 600 },
      );
      expect(alert).not.toBeNull();
      expect(alert!.level).toBe("critical");
    });

    it("sets shouldKill when killOnHardCap is true and critical", () => {
      const alert = evaluateAlert(
        {
          totalSpend30d: 200,
          dailyAverage: 25,
          projectedMonthly: 750,
          todaySpend: 25,
          breakdown: {},
          daysTracked: 8,
        },
        { dailyCapUsd: 20, monthlyCapUsd: 600, killOnHardCap: true },
      );
      expect(alert!.shouldKill).toBe(true);
    });
  });

  describe("appendCostEntry", () => {
    it("creates file and appends entry", () => {
      appendCostEntry(logPath, { date: "2026-02-09", totalCost: 10 });
      const content = fs.readFileSync(logPath, "utf-8");
      expect(content).toContain('"totalCost":10');
    });
  });

  describe("runCostCheck", () => {
    it("runs full pipeline with alert callback", async () => {
      const today = new Date().toISOString().slice(0, 10);
      // Simulate high-cost data for 30 days
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        appendCostEntry(logPath, {
          date: d.toISOString().slice(0, 10),
          totalCost: 25,
          breakdown: {
            opus: { sessions: 5, tokens: 500000, cost: 20 },
            haiku: { sessions: 10, tokens: 200000, cost: 5 },
          },
        });
      }

      let alertReceived: any = null;
      const { summary, alert } = await runCostCheck({
        costLogPath: logPath,
        dailyCapUsd: 20,
        monthlyCapUsd: 600,
        onAlert: async (a) => {
          alertReceived = a;
        },
      });

      expect(summary.totalSpend30d).toBe(750);
      expect(alert).not.toBeNull();
      expect(alert!.level).toBe("critical");
      expect(alertReceived).not.toBeNull();
    });
  });
});
