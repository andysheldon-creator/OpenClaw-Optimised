import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type SpendEntry,
  SpendAggregator,
  appendSpendEntry,
  loadSpendLedger,
  _resetForTest,
} from "./spend-ledger.js";

const makeEntry = (overrides: Partial<SpendEntry> = {}): SpendEntry => ({
  ts: Date.now(),
  input: 100,
  output: 50,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 150,
  costUsd: 0.01,
  ...overrides,
});

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-spend-"));
}

afterEach(() => {
  _resetForTest();
});

describe("appendSpendEntry / loadSpendLedger", () => {
  it("writes and reads back entries", async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, "spend.jsonl");
    const entry1 = makeEntry({ ts: 1000, provider: "openai", model: "gpt-5" });
    const entry2 = makeEntry({ ts: 2000, provider: "anthropic", model: "claude-4" });

    await appendSpendEntry(entry1, filePath);
    await appendSpendEntry(entry2, filePath);

    const loaded = await loadSpendLedger({ filePath });
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.ts).toBe(1000);
    expect(loaded[1]?.ts).toBe(2000);
  });

  it("filters by since timestamp", async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, "spend.jsonl");

    await appendSpendEntry(makeEntry({ ts: 1000 }), filePath);
    await appendSpendEntry(makeEntry({ ts: 2000 }), filePath);
    await appendSpendEntry(makeEntry({ ts: 3000 }), filePath);

    const loaded = await loadSpendLedger({ filePath, since: 2000 });
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.ts).toBe(2000);
  });

  it("returns empty array when file does not exist", async () => {
    const dir = await makeTmpDir();
    const loaded = await loadSpendLedger({ filePath: path.join(dir, "nope.jsonl") });
    expect(loaded).toEqual([]);
  });

  it("skips malformed lines", async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, "spend.jsonl");
    const good = makeEntry({ ts: 1000 });
    await fs.writeFile(
      filePath,
      `${JSON.stringify(good)}\n{bad json\n${JSON.stringify(makeEntry({ ts: 2000 }))}\n`,
      "utf8",
    );
    const loaded = await loadSpendLedger({ filePath });
    expect(loaded).toHaveLength(2);
  });
});

describe("SpendAggregator", () => {
  it("rebuilds from a ledger file", async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, "spend.jsonl");

    await appendSpendEntry(
      makeEntry({
        ts: Date.now(),
        provider: "openai",
        costUsd: 0.05,
        input: 100,
        output: 50,
        totalTokens: 150,
      }),
      filePath,
    );
    await appendSpendEntry(
      makeEntry({
        ts: Date.now(),
        provider: "anthropic",
        costUsd: 0.03,
        input: 80,
        output: 40,
        totalTokens: 120,
      }),
      filePath,
    );

    const agg = new SpendAggregator();
    await agg.rebuild(filePath);
    const summary = agg.summary();
    expect(summary.totals.totalCost).toBeCloseTo(0.08);
    expect(summary.totals.input).toBe(180);
    expect(summary.totals.output).toBe(90);
    expect(summary.totals.totalTokens).toBe(270);
    expect(summary.daily.length).toBeGreaterThanOrEqual(1);
  });

  it("ingests entries incrementally", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ provider: "openai", costUsd: 0.01 }));
    agg.ingest(makeEntry({ provider: "openai", costUsd: 0.02 }));
    agg.ingest(makeEntry({ provider: "anthropic", costUsd: 0.05 }));

    const summary = agg.summary();
    expect(summary.totals.totalCost).toBeCloseTo(0.08);
    expect(summary.byProvider?.openai?.totalCost).toBeCloseTo(0.03);
    expect(summary.byProvider?.anthropic?.totalCost).toBeCloseTo(0.05);
  });

  it("filters by provider in query", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ provider: "openai", costUsd: 0.01 }));
    agg.ingest(makeEntry({ provider: "anthropic", costUsd: 0.05 }));

    const result = agg.query({ provider: "anthropic" });
    expect(result.totals.totalCost).toBeCloseTo(0.05);
  });

  it("filters by model in query", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ model: "gpt-5", costUsd: 0.01 }));
    agg.ingest(makeEntry({ model: "claude-4", costUsd: 0.02 }));
    agg.ingest(makeEntry({ model: "claude-4", costUsd: 0.03 }));

    const result = agg.query({ model: "claude-4" });
    expect(result.totals.totalCost).toBeCloseTo(0.05);
  });

  it("filters by agentId in query", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ agentId: "main", costUsd: 0.01 }));
    agg.ingest(makeEntry({ agentId: "helper", costUsd: 0.02 }));

    const result = agg.query({ agentId: "main" });
    expect(result.totals.totalCost).toBeCloseTo(0.01);
  });

  it("filters by days", () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ ts: now, costUsd: 0.01 }));
    agg.ingest(makeEntry({ ts: twoDaysAgo, costUsd: 0.02 }));
    agg.ingest(makeEntry({ ts: tenDaysAgo, costUsd: 0.1 }));

    const result = agg.query({ days: 3 });
    expect(result.totals.totalCost).toBeCloseTo(0.03);
    expect(result.days).toBe(3);
  });

  it("groups by provider", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ provider: "openai", costUsd: 0.01 }));
    agg.ingest(makeEntry({ provider: "openai", costUsd: 0.02 }));
    agg.ingest(makeEntry({ provider: "anthropic", costUsd: 0.05 }));

    const result = agg.query({ groupBy: "provider" });
    expect(result.byProvider).toBeDefined();
    expect(result.byProvider?.openai?.totalCost).toBeCloseTo(0.03);
    expect(result.byProvider?.anthropic?.totalCost).toBeCloseTo(0.05);
  });

  it("groups by model", () => {
    const agg = new SpendAggregator();
    agg.ingest(makeEntry({ model: "gpt-5", costUsd: 0.01 }));
    agg.ingest(makeEntry({ model: "claude-4", costUsd: 0.02 }));

    const result = agg.query({ groupBy: "model" });
    expect(result.byModel).toBeDefined();
    expect(result.byModel?.["gpt-5"]?.totalCost).toBeCloseTo(0.01);
    expect(result.byModel?.["claude-4"]?.totalCost).toBeCloseTo(0.02);
  });

  it("daily entries are sorted by date", () => {
    const agg = new SpendAggregator();
    const now = Date.now();
    agg.ingest(makeEntry({ ts: now, costUsd: 0.01 }));
    agg.ingest(makeEntry({ ts: now - 2 * 24 * 60 * 60 * 1000, costUsd: 0.02 }));
    agg.ingest(makeEntry({ ts: now - 1 * 24 * 60 * 60 * 1000, costUsd: 0.03 }));

    const result = agg.query({ days: 30 });
    const dates = result.daily.map((d) => d.date);
    const sorted = [...dates].toSorted();
    expect(dates).toEqual(sorted);
  });
});
