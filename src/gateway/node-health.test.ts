import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearNodeHealthFramesForNode,
  getLatestNodeHealthFrames,
  getRecentNodeHealthFrames,
  upsertNodeHealthFrame,
} from "./node-health.js";

describe("node health", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearNodeHealthFramesForNode("n1");
  });

  it("evicts entries older than TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: Date.now(), data: { ok: true } } });
    expect(getLatestNodeHealthFrames().map((e) => e.nodeId)).toEqual(["n1"]);

    // TTL is 10 minutes in node-health.ts.
    vi.setSystemTime(new Date("2026-01-01T00:10:00.001Z"));

    expect(getLatestNodeHealthFrames()).toEqual([]);
  });

  it("retains recent frames per node", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: Date.now(), data: { seq: 1 } } });
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: Date.now(), data: { seq: 2 } } });
    upsertNodeHealthFrame({ nodeId: "n1", frame: { ts: Date.now(), data: { seq: 3 } } });

    const all = getRecentNodeHealthFrames({ nodeId: "n1" });
    expect(all.map((e) => (e.frame.data as { seq?: number }).seq)).toEqual([1, 2, 3]);

    const lastTwo = getRecentNodeHealthFrames({ nodeId: "n1", limit: 2 });
    expect(lastTwo.map((e) => (e.frame.data as { seq?: number }).seq)).toEqual([2, 3]);
  });
});
