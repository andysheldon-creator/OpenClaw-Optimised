/**
 * Benchmark: Memory usage profiling for key operations.
 *
 * Usage: bun scripts/bench-memory.ts
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function snapshot(): NodeJS.MemoryUsage {
  if (typeof global.gc === "function") {
    global.gc();
  }
  return process.memoryUsage();
}

function diffMemory(before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage) {
  return {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    rss: after.rss - before.rss,
    external: after.external - before.external,
  };
}

type BenchResult = {
  name: string;
  heapUsed: number;
  rss: number;
  durationMs: number;
};

function benchAllocateMessages(count: number): BenchResult {
  const before = snapshot();
  const start = performance.now();

  const messages: Array<{ role: string; content: string; timestamp: number }> = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 3 === 0 ? "user" : i % 3 === 1 ? "assistant" : "tool",
      content: `Message content number ${i} with some typical text that might appear in a conversation. ${"x".repeat(200)}`,
      timestamp: Date.now(),
    });
  }

  const durationMs = performance.now() - start;
  const after = snapshot();
  const diff = diffMemory(before, after);

  // Keep reference alive
  void messages.length;

  return { name: `Allocate ${count} messages`, heapUsed: diff.heapUsed, rss: diff.rss, durationMs };
}

function benchMapOperations(size: number): BenchResult {
  const before = snapshot();
  const start = performance.now();

  const map = new Map<string, { failures: number; lastFailure: number }>();
  for (let i = 0; i < size; i++) {
    map.set(`provider-${i}`, { failures: i % 5, lastFailure: Date.now() });
  }
  // Simulate lookups
  for (let i = 0; i < size; i++) {
    map.get(`provider-${i % size}`);
  }

  const durationMs = performance.now() - start;
  const after = snapshot();
  const diff = diffMemory(before, after);

  void map.size;

  return { name: `Map ops (${size} entries)`, heapUsed: diff.heapUsed, rss: diff.rss, durationMs };
}

async function main() {
  console.log("Memory Benchmark");
  console.log("================\n");

  const baseline = snapshot();
  console.log(
    `Baseline: heap=${formatBytes(baseline.heapUsed)}  rss=${formatBytes(baseline.rss)}\n`,
  );

  const results: BenchResult[] = [
    benchAllocateMessages(100),
    benchAllocateMessages(1000),
    benchAllocateMessages(10000),
    benchMapOperations(100),
    benchMapOperations(10000),
  ];

  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(30)} heap=${formatBytes(r.heapUsed).padStart(10)}  rss=${formatBytes(r.rss).padStart(10)}  time=${r.durationMs.toFixed(1)}ms`,
    );
  }

  console.log("\nDone.");
}

main().catch(console.error);
