/**
 * Benchmark: Failover scenario response times.
 *
 * Measures time for model fallback chain under simulated failures.
 * Usage: bun scripts/bench-failover.ts [--runs 10]
 */

function parseRuns(): number {
  const idx = process.argv.indexOf("--runs");
  if (idx === -1 || !process.argv[idx + 1]) {
    return 10;
  }
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

type Scenario = {
  name: string;
  failCount: number;
  backoffBase: number;
  backoffCap: number;
};

const SCENARIOS: Scenario[] = [
  { name: "No failures", failCount: 0, backoffBase: 1000, backoffCap: 10000 },
  { name: "1 failure + backoff", failCount: 1, backoffBase: 1000, backoffCap: 10000 },
  { name: "2 failures + backoff", failCount: 2, backoffBase: 1000, backoffCap: 10000 },
  { name: "3 failures (circuit break)", failCount: 3, backoffBase: 1000, backoffCap: 10000 },
];

/** Simulate failover with exponential backoff (without actual network calls). */
function simulateFailover(scenario: Scenario): number {
  const start = performance.now();
  let totalDelay = 0;

  for (let attempt = 0; attempt < scenario.failCount; attempt++) {
    const delay = Math.min(scenario.backoffBase * 2 ** attempt, scenario.backoffCap);
    totalDelay += delay;
  }

  // Simulate the successful call overhead (minimal)
  const overhead = 0.1;
  const elapsed = performance.now() - start + overhead;

  return totalDelay + elapsed;
}

async function main() {
  const runs = parseRuns();

  console.log("Failover Benchmark");
  console.log("==================\n");
  console.log(`Runs per scenario: ${runs}\n`);

  for (const scenario of SCENARIOS) {
    const durations: number[] = [];
    for (let r = 0; r < runs; r++) {
      durations.push(simulateFailover(scenario));
    }
    const med = median(durations);
    console.log(
      `  ${scenario.name.padEnd(30)} median=${med.toFixed(0)}ms  (simulated backoff delay)`,
    );
  }

  console.log("\nNote: These measure simulated backoff delays, not actual API latency.");
  console.log("Done.");
}

main().catch(console.error);
