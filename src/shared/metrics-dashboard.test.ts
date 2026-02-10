import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { parseCostLog, computeMetrics, generateDashboardHTML } from "./metrics-dashboard.js";

function tmpLog(entries: object[]): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "m-"));
  const f = path.join(d, "cost.jsonl");
  fs.writeFileSync(f, entries.map((e) => JSON.stringify(e)).join("\n"));
  return f;
}

describe("parseCostLog", () => {
  it("parses valid entries", () => {
    const f = tmpLog([
      { date: "2026-02-09", totalCost: 6.82, totalTokens: 2027000 },
      { date: "2026-02-09", note: "init" },
    ]);
    expect(parseCostLog(f)).toHaveLength(1);
  });
  it("returns empty for missing", () => expect(parseCostLog("/no")).toEqual([]));
});

describe("computeMetrics", () => {
  it("computes sums", () => {
    const today = new Date().toISOString().slice(0, 10);
    const m = computeMetrics([
      {
        date: today,
        totalCost: 5,
        totalTokens: 100000,
        breakdown: { haiku: { cost: 3, tokens: 80000 }, opus: { cost: 2, tokens: 20000 } },
      },
      {
        date: today,
        totalCost: 2.5,
        totalTokens: 50000,
        breakdown: { haiku: { cost: 2.5, tokens: 50000 } },
      },
    ]);
    expect(m.daily.cost).toBe(7.5);
    expect(m.modelDistribution["haiku"]).toBe(5.5);
  });
});

describe("generateDashboardHTML", () => {
  it("generates HTML", () => {
    const f = tmpLog([
      {
        date: "2026-02-09",
        totalCost: 6.82,
        totalTokens: 2027000,
        breakdown: { haiku: { cost: 3.12, tokens: 1780000 } },
      },
    ]);
    const html = generateDashboardHTML(f);
    expect(html).toContain("OpenClaw Metrics");
    expect(html).toContain("haiku");
  });
});
