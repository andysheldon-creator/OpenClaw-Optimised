/**
 * CLI command for Ollama smoke tests.
 *
 * Usage:
 *   moltbot ollama smoke          # Run all smoke tests
 *   moltbot ollama smoke ping     # Run ping test only
 *   moltbot ollama smoke truncate # Run truncation test only
 *   moltbot ollama smoke guard    # Run guard test only
 */
import type { RuntimeEnv } from "../runtime.js";
import {
  runAllSmokeTests,
  runGuardTest,
  runPingTest,
  runTruncationTest,
  type SmokeTestConfig,
  type SmokeTestResult,
} from "../agents/ollama/smoke.js";

export type OllamaSmokeCommandOptions = {
  /** Specific test to run (ping, truncate, guard). If not provided, runs all. */
  test?: string;
  /** Output as JSON */
  json?: boolean;
  /** Native API base URL */
  nativeUrl?: string;
  /** OpenAI-compatible API base URL */
  openaiUrl?: string;
  /** Model to use for tests */
  model?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
};

function formatTestResult(result: SmokeTestResult, json: boolean): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  const status = result.passed ? "✓ PASS" : "✗ FAIL";
  const lines = [`${status} ${result.name} (${result.durationMs}ms)`, `  ${result.message}`];

  if (result.details && !result.passed) {
    lines.push(`  Details: ${JSON.stringify(result.details, null, 2).split("\n").join("\n  ")}`);
  }

  return lines.join("\n");
}

function formatAllResults(results: SmokeTestResult[], json: boolean): string {
  if (json) {
    return JSON.stringify(results, null, 2);
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const summary = `\nSummary: ${passed}/${total} tests passed`;

  return results.map((r) => formatTestResult(r, false)).join("\n\n") + summary;
}

export async function ollamaSmokeCommand(
  opts: OllamaSmokeCommandOptions,
  runtime: RuntimeEnv,
): Promise<void> {
  const config: SmokeTestConfig = {
    nativeBaseUrl: opts.nativeUrl,
    openaiBaseUrl: opts.openaiUrl,
    model: opts.model,
    timeout: opts.timeout,
  };

  const json = opts.json ?? false;

  try {
    let results: SmokeTestResult[];

    switch (opts.test) {
      case "ping":
        results = [await runPingTest(config)];
        break;
      case "truncate":
      case "truncation":
        results = [await runTruncationTest(config)];
        break;
      case "guard":
        results = [await runGuardTest(config)];
        break;
      default:
        // Run all tests
        results = await runAllSmokeTests(config);
    }

    runtime.log(formatAllResults(results, json));

    // Exit with error code if any test failed
    const allPassed = results.every((r) => r.passed);
    if (!allPassed) {
      runtime.exit(1);
    }
  } catch (err) {
    if (json) {
      runtime.error(JSON.stringify({ error: String(err) }));
    } else {
      runtime.error(`Smoke test error: ${err instanceof Error ? err.message : String(err)}`);
    }
    runtime.exit(1);
  }
}
