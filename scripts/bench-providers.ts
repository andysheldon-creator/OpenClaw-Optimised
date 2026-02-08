/**
 * AI Provider Benchmark Script
 *
 * Measures real provider performance metrics:
 *   - TTFT (Time To First Token) approximated via completion latency
 *   - TPS (Tokens Per Second) from usage/duration
 *   - Error rate across runs
 *   - Cost per 1K tokens (from model config)
 *
 * Usage:
 *   bun scripts/bench-providers.ts
 *   bun scripts/bench-providers.ts --provider anthropic
 *   bun scripts/bench-providers.ts --provider openai --runs 5
 *   bun scripts/bench-providers.ts --output results.json
 *   bun scripts/bench-providers.ts --simulate    (no API keys needed)
 *
 * Environment variables needed per provider:
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.
 */

import fs from "node:fs";

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const DEFAULT_RUNS = 3;
const DEFAULT_PROMPT = "Reply with exactly one word: ok";

// ── Provider API key mapping ────────────────────────────────────────────────

const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  gemini: "GEMINI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  zai: "ZAI_API_KEY",
  synthetic: "SYNTHETIC_API_KEY",
};

function resolveApiKey(provider: string): string | undefined {
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (!envKey) {
    return undefined;
  }
  return process.env[envKey]?.trim() || undefined;
}

// ── Stats helpers ───────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function p95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Benchmark result types ──────────────────────────────────────────────────

type RunResult = {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
};

type ModelBenchResult = {
  provider: string;
  modelId: string;
  runs: number;
  errors: number;
  errorRate: number;
  medianDurationMs: number;
  p95DurationMs: number;
  medianTps: number;
  costPer1kInput: number;
  costPer1kOutput: number;
};

// ── Live benchmark (actual API calls) ───────────────────────────────────────

async function benchModelLive(params: {
  provider: string;
  modelId: string;
  apiKey: string;
  runs: number;
  prompt: string;
}): Promise<RunResult[]> {
  // Dynamic import to avoid errors when pi-ai isn't available
  const { completeSimple, getModel } = await import("@mariozechner/pi-ai");

  let model;
  try {
    model = getModel(params.provider as unknown as string, params.modelId as unknown as string);
  } catch {
    // If specific model not found, try getting first model for provider
    const { getModels } = await import("@mariozechner/pi-ai");
    const models = getModels(params.provider as unknown as string);
    if (models.length === 0) {
      throw new Error(`No models for ${params.provider}`);
    }
    model = models[0];
  }

  const results: RunResult[] = [];
  for (let i = 0; i < params.runs; i++) {
    const start = performance.now();
    try {
      const res = await completeSimple(
        model,
        {
          messages: [{ role: "user", content: params.prompt, timestamp: Date.now() }],
        },
        { apiKey: params.apiKey, maxTokens: 64 },
      );
      const durationMs = performance.now() - start;
      results.push({
        durationMs,
        inputTokens: res.usage?.input ?? 0,
        outputTokens: res.usage?.output ?? 0,
      });
      console.log(`  [${i + 1}/${params.runs}] ${model.id}: ${Math.round(durationMs)}ms`);
    } catch (err) {
      const durationMs = performance.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ durationMs, inputTokens: 0, outputTokens: 0, error: msg });
      console.log(`  [${i + 1}/${params.runs}] ${model.id}: ERROR ${msg.slice(0, 80)}`);
    }
  }
  return results;
}

// ── Simulated benchmark (no API keys needed) ────────────────────────────────

type SimProfile = { baseLatency: number; jitter: number; failureRate: number; tps: number };

const SIM_PROFILES: Record<string, SimProfile> = {
  openai: { baseLatency: 800, jitter: 200, failureRate: 0.02, tps: 45 },
  anthropic: { baseLatency: 1200, jitter: 300, failureRate: 0.01, tps: 35 },
  google: { baseLatency: 600, jitter: 150, failureRate: 0.03, tps: 50 },
  openrouter: { baseLatency: 1500, jitter: 400, failureRate: 0.05, tps: 30 },
  ollama: { baseLatency: 200, jitter: 50, failureRate: 0.0, tps: 80 },
  minimax: { baseLatency: 900, jitter: 250, failureRate: 0.03, tps: 40 },
};

function benchModelSimulated(provider: string, runs: number): RunResult[] {
  const profile = SIM_PROFILES[provider] ?? {
    baseLatency: 1000,
    jitter: 300,
    failureRate: 0.05,
    tps: 30,
  };
  const results: RunResult[] = [];

  for (let i = 0; i < runs; i++) {
    const jitter = (Math.random() - 0.5) * 2 * profile.jitter;
    const latency = Math.max(10, profile.baseLatency + jitter);
    const failed = Math.random() < profile.failureRate;

    if (failed) {
      results.push({
        durationMs: latency,
        inputTokens: 0,
        outputTokens: 0,
        error: "simulated failure",
      });
    } else {
      const outputTokens = Math.round(2 + Math.random() * 3);
      results.push({ durationMs: latency, inputTokens: 12, outputTokens });
    }
  }

  return results;
}

// ── Summarize + format ──────────────────────────────────────────────────────

function summarizeResults(
  provider: string,
  modelId: string,
  results: RunResult[],
  costInput = 0,
  costOutput = 0,
): ModelBenchResult {
  const successful = results.filter((r) => !r.error);
  const durations = successful.map((r) => r.durationMs);
  const tpsValues = successful
    .filter((r) => r.outputTokens > 0 && r.durationMs > 0)
    .map((r) => (r.outputTokens / r.durationMs) * 1000);

  return {
    provider,
    modelId,
    runs: results.length,
    errors: results.length - successful.length,
    errorRate: results.length > 0 ? (results.length - successful.length) / results.length : 0,
    medianDurationMs: Math.round(median(durations)),
    p95DurationMs: Math.round(p95(durations)),
    medianTps: Math.round(median(tpsValues) * 10) / 10,
    costPer1kInput: costInput * 1000,
    costPer1kOutput: costOutput * 1000,
  };
}

function toMarkdownTable(results: ModelBenchResult[]): string {
  const header =
    "| Provider | Model | Runs | Err | Err% | Median(ms) | P95(ms) | TPS | $/1K in | $/1K out |";
  const sep =
    "|----------|-------|------|-----|------|------------|---------|-----|---------|----------|";
  const rows = results.map(
    (r) =>
      `| ${r.provider} | ${r.modelId} | ${r.runs} | ${r.errors} | ${(r.errorRate * 100).toFixed(0)}% | ${r.medianDurationMs} | ${r.p95DurationMs} | ${r.medianTps} | $${r.costPer1kInput.toFixed(4)} | $${r.costPer1kOutput.toFixed(4)} |`,
  );
  return [header, sep, ...rows].join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const filterProvider = parseArg("--provider");
  const simulate = hasFlag("--simulate");
  const runs = (() => {
    const raw = parseArg("--runs");
    if (!raw) {
      return DEFAULT_RUNS;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RUNS;
  })();
  const outputPath = parseArg("--output");
  const prompt = parseArg("--prompt") ?? DEFAULT_PROMPT;

  console.log("AI Provider Benchmark");
  console.log("=====================\n");
  console.log(`Mode: ${simulate ? "simulated" : "live"}`);
  console.log(`Runs per model: ${runs}`);
  console.log(`Prompt: "${prompt}"\n`);

  const allResults: ModelBenchResult[] = [];

  if (simulate) {
    // Simulated mode: no API keys needed
    const providers = filterProvider ? [filterProvider] : Object.keys(SIM_PROFILES);

    for (const provider of providers) {
      console.log(`\n--- ${provider} (simulated) ---`);
      const results = benchModelSimulated(provider, runs);
      const errors = results.filter((r) => r.error).length;
      console.log(`  ${runs} runs, ${errors} errors`);
      allResults.push(summarizeResults(provider, "simulated", results));
    }
  } else {
    // Live mode: requires API keys
    let providers: string[];
    try {
      const { getProviders } = await import("@mariozechner/pi-ai");
      const all = getProviders();
      providers = filterProvider ? all.filter((p) => p === filterProvider) : all;
    } catch {
      console.log("Could not load pi-ai. Use --simulate for simulation mode.");
      process.exit(1);
    }

    for (const provider of providers) {
      const apiKey = resolveApiKey(provider);
      if (!apiKey) {
        const envKey = PROVIDER_ENV_KEYS[provider] ?? `${provider.toUpperCase()}_API_KEY`;
        console.log(`\n[SKIP] ${provider} - missing ${envKey}`);
        continue;
      }

      let modelId: string;
      let costInput = 0;
      let costOutput = 0;
      try {
        const { getModels } = await import("@mariozechner/pi-ai");
        const models = getModels(provider as unknown as string);
        if (models.length === 0) {
          console.log(`\n[SKIP] ${provider} - no models`);
          continue;
        }
        modelId = models[0].id;
        costInput = models[0].cost?.input ?? 0;
        costOutput = models[0].cost?.output ?? 0;
      } catch {
        console.log(`\n[SKIP] ${provider} - failed to load models`);
        continue;
      }

      console.log(`\n--- ${provider} (${modelId}) ---`);
      const results = await benchModelLive({ provider, modelId, apiKey, runs, prompt });
      allResults.push(summarizeResults(provider, modelId, results, costInput, costOutput));
    }
  }

  // Output
  console.log("\n\n=== Results ===\n");
  console.log(toMarkdownTable(allResults));

  if (outputPath) {
    const output = {
      timestamp: new Date().toISOString(),
      mode: simulate ? "simulated" : "live",
      runs,
      prompt,
      results: allResults,
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nJSON saved to: ${outputPath}`);
  }

  console.log("\nDone.");
}

main().catch(console.error);
