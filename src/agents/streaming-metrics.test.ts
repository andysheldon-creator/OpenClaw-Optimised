import { describe, expect, it, beforeEach } from "vitest";
import {
  startStreamingMetrics,
  recordStreamingChunk,
  completeStreamingMetrics,
  getStreamingMetricsSummary,
  resetStreamingMetrics,
} from "./streaming-metrics.js";

describe("streaming-metrics", () => {
  beforeEach(() => {
    resetStreamingMetrics();
  });

  it("tracks a complete streaming run", () => {
    const metrics = startStreamingMetrics({
      sessionKey: "test-session",
      runId: "run-1",
    });
    expect(metrics.chunkCount).toBe(0);

    recordStreamingChunk("run-1", 500);
    recordStreamingChunk("run-1", 300);
    recordStreamingChunk("run-1", 200);

    const completed = completeStreamingMetrics("run-1");
    expect(completed).toBeDefined();
    expect(completed!.chunkCount).toBe(3);
    expect(completed!.totalChars).toBe(1000);
    expect(completed!.firstChunkAt).toBeDefined();
    expect(completed!.completedAt).toBeDefined();
  });

  it("returns undefined for unknown run", () => {
    const result = completeStreamingMetrics("unknown");
    expect(result).toBeUndefined();
  });

  it("ignores chunks for unknown runs", () => {
    recordStreamingChunk("unknown", 100);
    // Should not throw
  });

  it("computes summary", () => {
    startStreamingMetrics({ sessionKey: "s1", runId: "r1" });
    recordStreamingChunk("r1", 100);
    recordStreamingChunk("r1", 200);
    completeStreamingMetrics("r1");

    startStreamingMetrics({ sessionKey: "s2", runId: "r2" });
    recordStreamingChunk("r2", 500);
    completeStreamingMetrics("r2");

    const summary = getStreamingMetricsSummary();
    expect(summary.totalRuns).toBe(2);
    expect(summary.streamedRuns).toBe(1); // r1 has 2 chunks, r2 has 1
    expect(summary.avgTotalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty summary with no data", () => {
    const summary = getStreamingMetricsSummary();
    expect(summary.totalRuns).toBe(0);
    expect(summary.streamedRuns).toBe(0);
  });
});
