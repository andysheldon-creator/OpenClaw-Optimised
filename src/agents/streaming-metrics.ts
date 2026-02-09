/**
 * Streaming Response Metrics
 *
 * Tracks streaming performance: time-to-first-chunk, total chunks,
 * chunk sizes, and perceived latency improvements.
 *
 * Used to measure the effectiveness of block streaming and identify
 * sessions that would benefit from streaming being enabled.
 */

export type StreamingMetrics = {
  sessionKey: string;
  runId: string;
  startedAt: number;
  firstChunkAt?: number;
  completedAt?: number;
  chunkCount: number;
  totalChars: number;
  chunkSizes: number[];
};

export type StreamingMetricsSummary = {
  totalRuns: number;
  streamedRuns: number;
  avgTimeToFirstChunkMs: number;
  avgTotalDurationMs: number;
  avgChunksPerRun: number;
  perceivedLatencyImprovement: number; // ratio: (total - firstChunk) / total
};

const activeMetrics = new Map<string, StreamingMetrics>();
const completedMetrics: StreamingMetrics[] = [];
const MAX_COMPLETED = 100;

/**
 * Start tracking a streaming run.
 */
export function startStreamingMetrics(params: {
  sessionKey: string;
  runId: string;
}): StreamingMetrics {
  const metrics: StreamingMetrics = {
    sessionKey: params.sessionKey,
    runId: params.runId,
    startedAt: Date.now(),
    chunkCount: 0,
    totalChars: 0,
    chunkSizes: [],
  };
  activeMetrics.set(params.runId, metrics);
  return metrics;
}

/**
 * Record a chunk being sent to the client.
 */
export function recordStreamingChunk(runId: string, chunkChars: number): void {
  const metrics = activeMetrics.get(runId);
  if (!metrics) {
    return;
  }

  if (metrics.chunkCount === 0) {
    metrics.firstChunkAt = Date.now();
  }
  metrics.chunkCount++;
  metrics.totalChars += chunkChars;
  metrics.chunkSizes.push(chunkChars);
}

/**
 * Complete streaming metrics for a run.
 */
export function completeStreamingMetrics(runId: string): StreamingMetrics | undefined {
  const metrics = activeMetrics.get(runId);
  if (!metrics) {
    return undefined;
  }

  metrics.completedAt = Date.now();
  activeMetrics.delete(runId);
  completedMetrics.push(metrics);

  // Keep bounded
  while (completedMetrics.length > MAX_COMPLETED) {
    completedMetrics.shift();
  }

  return metrics;
}

/**
 * Get a summary of streaming performance.
 */
export function getStreamingMetricsSummary(): StreamingMetricsSummary {
  const runs = completedMetrics.filter((m) => m.completedAt);
  const streamed = runs.filter((m) => m.chunkCount > 1);

  if (runs.length === 0) {
    return {
      totalRuns: 0,
      streamedRuns: 0,
      avgTimeToFirstChunkMs: 0,
      avgTotalDurationMs: 0,
      avgChunksPerRun: 0,
      perceivedLatencyImprovement: 0,
    };
  }

  const timeToFirstChunks = streamed
    .filter((m) => m.firstChunkAt)
    .map((m) => m.firstChunkAt! - m.startedAt);

  const totalDurations = runs.map((m) => m.completedAt! - m.startedAt);

  const avgTTFC =
    timeToFirstChunks.length > 0
      ? timeToFirstChunks.reduce((a, b) => a + b, 0) / timeToFirstChunks.length
      : 0;

  const avgTotal = totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length;

  const avgChunks =
    streamed.length > 0 ? streamed.reduce((a, m) => a + m.chunkCount, 0) / streamed.length : 0;

  const improvement = avgTotal > 0 && avgTTFC > 0 ? (avgTotal - avgTTFC) / avgTotal : 0;

  return {
    totalRuns: runs.length,
    streamedRuns: streamed.length,
    avgTimeToFirstChunkMs: Math.round(avgTTFC),
    avgTotalDurationMs: Math.round(avgTotal),
    avgChunksPerRun: Math.round(avgChunks * 10) / 10,
    perceivedLatencyImprovement: Math.round(improvement * 100) / 100,
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetStreamingMetrics(): void {
  activeMetrics.clear();
  completedMetrics.length = 0;
}
