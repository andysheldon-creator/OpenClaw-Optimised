/**
 * Benchmark: Skill loading time across varying skill counts.
 *
 * Usage: bun scripts/bench-skill-loading.ts [--counts 10,50,100]
 */

const DEFAULT_COUNTS = [10, 50, 100];

function parseCounts(): number[] {
  const idx = process.argv.indexOf("--counts");
  if (idx === -1 || !process.argv[idx + 1]) {
    return DEFAULT_COUNTS;
  }
  return process.argv[idx + 1]
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Simulate skill frontmatter parsing (the CPU-bound part of skill loading). */
function simulateSkillParse(count: number): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    // Simulate YAML frontmatter parse + validation
    const yaml = `---\nname: skill-${i}\nversion: 1.0.0\ndescription: Benchmark skill ${i}\n---\n`;
    // Parse: split frontmatter from body
    const parts = yaml.split("---").filter(Boolean);
    const _parsed = Object.fromEntries(
      parts[0]
        .trim()
        .split("\n")
        .map((line) => {
          const [key, ...rest] = line.split(":");
          return [key.trim(), rest.join(":").trim()];
        }),
    );
  }
  return performance.now() - start;
}

async function main() {
  const counts = parseCounts();
  const runs = 5;

  console.log("Skill Loading Benchmark");
  console.log("=======================\n");
  console.log(`Runs per count: ${runs}\n`);

  for (const count of counts) {
    const durations: number[] = [];
    for (let r = 0; r < runs; r++) {
      durations.push(simulateSkillParse(count));
    }
    const med = median(durations);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    console.log(
      `  ${String(count).padStart(5)} skills: median=${med.toFixed(1)}ms  min=${min.toFixed(1)}ms  max=${max.toFixed(1)}ms`,
    );
  }

  console.log("\nDone.");
}

main().catch(console.error);
