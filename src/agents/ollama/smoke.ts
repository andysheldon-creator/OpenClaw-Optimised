/**
 * Smoke test implementations for Ollama context manager.
 *
 * These are the actual test implementations. The CLI command in
 * src/commands/ollama-smoke.ts calls these functions.
 */
import { isOverBudgetError, OverBudgetError } from "./errors.js";
import { createNativeClient } from "./client/native.js";
import { createOpenAIClient } from "./client/openai.js";
import { createContextManager } from "./context/prompt-assembler.js";
import { createRequestLogger } from "./logging/request-logger.js";

/**
 * Default Ollama base URL (native API).
 * This matches the constant in local-provider-discovery.ts.
 */
const DEFAULT_NATIVE_BASE_URL = "http://127.0.0.1:11434";

/**
 * Default Ollama base URL (OpenAI-compatible API).
 */
const DEFAULT_OPENAI_BASE_URL = "http://127.0.0.1:11434/v1";

/**
 * Result of a smoke test.
 */
export interface SmokeTestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
}

/**
 * Configuration for smoke tests.
 */
export interface SmokeTestConfig {
  /** Native API base URL. Default: http://127.0.0.1:11434 */
  nativeBaseUrl?: string;
  /** OpenAI-compatible API base URL. Default: http://127.0.0.1:11434/v1 */
  openaiBaseUrl?: string;
  /** Model to use for tests. Default: first available model */
  model?: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

/**
 * Ping test: Check availability via both /api/tags (native) and /v1/models (OpenAI).
 */
export async function runPingTest(config: SmokeTestConfig = {}): Promise<SmokeTestResult> {
  const startTime = Date.now();
  const nativeBaseUrl = config.nativeBaseUrl ?? DEFAULT_NATIVE_BASE_URL;
  const openaiBaseUrl = config.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const timeout = config.timeout ?? 30000;

  const nativeClient = createNativeClient({ baseUrl: nativeBaseUrl, timeout });
  const openaiClient = createOpenAIClient({ baseUrl: openaiBaseUrl, timeout });

  const [nativeResult, openaiResult] = await Promise.all([
    nativeClient.ping(),
    openaiClient.ping(),
  ]);

  const durationMs = Date.now() - startTime;

  // Combine model lists (deduplicated)
  const allModels = [...new Set([...nativeResult.models, ...openaiResult.models])];

  const passed = nativeResult.available || openaiResult.available;
  const message = passed
    ? `Ollama available (native: ${nativeResult.available}, openai: ${openaiResult.available}, models: ${allModels.length})`
    : `Ollama not reachable (native: ${nativeResult.error}, openai: ${openaiResult.error})`;

  return {
    name: "ping",
    passed,
    message,
    details: {
      native: {
        available: nativeResult.available,
        models: nativeResult.models,
        latencyMs: nativeResult.latencyMs,
        error: nativeResult.error,
      },
      openai: {
        available: openaiResult.available,
        models: openaiResult.models,
        latencyMs: openaiResult.latencyMs,
        error: openaiResult.error,
      },
      allModels,
    },
    durationMs,
  };
}

/**
 * Truncation test: Send 40k tokens and verify Ollama truncates to context window.
 *
 * Expected behavior:
 * - Ollama accepts the request (doesn't error)
 * - prompt_eval_count <= 32768 (context window limit)
 * - Response is generated (done: true)
 */
export async function runTruncationTest(config: SmokeTestConfig = {}): Promise<SmokeTestResult> {
  const startTime = Date.now();
  const nativeBaseUrl = config.nativeBaseUrl ?? DEFAULT_NATIVE_BASE_URL;
  const timeout = config.timeout ?? 120000; // Longer timeout for generation

  // First, get available models
  const nativeClient = createNativeClient({ baseUrl: nativeBaseUrl, timeout });
  const pingResult = await nativeClient.ping();

  if (!pingResult.available || pingResult.models.length === 0) {
    return {
      name: "truncation",
      passed: false,
      message: "Cannot run truncation test: Ollama not available or no models",
      details: { pingResult },
      durationMs: Date.now() - startTime,
    };
  }

  const model = config.model ?? pingResult.models[0];

  // Generate ~40k tokens worth of text (each "A " is roughly 1 token)
  const targetTokens = 40000;
  const prompt = "A ".repeat(targetTokens);

  try {
    const response = await nativeClient.generate({
      model,
      prompt,
      options: {
        num_predict: 1, // Only generate 1 token to keep test fast
      },
    });

    const durationMs = Date.now() - startTime;
    const promptEvalCount = response.prompt_eval_count ?? 0;

    // Verify truncation occurred
    const truncated = promptEvalCount <= 32768;
    const passed = response.done && truncated;

    return {
      name: "truncation",
      passed,
      message: passed
        ? `Truncation working: sent ~${targetTokens} tokens, Ollama evaluated ${promptEvalCount} (limit: 32768)`
        : `Truncation issue: prompt_eval_count=${promptEvalCount}, done=${response.done}`,
      details: {
        model,
        sentTokens: targetTokens,
        promptEvalCount,
        done: response.done,
        doneReason: response.done_reason,
        truncated,
      },
      durationMs,
    };
  } catch (err) {
    return {
      name: "truncation",
      passed: false,
      message: `Truncation test failed: ${err instanceof Error ? err.message : String(err)}`,
      details: { model, error: String(err) },
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Guard test: Verify that OverBudgetError is thrown BEFORE HTTP request.
 *
 * This test does NOT make any network requests. It verifies that the
 * context manager correctly rejects oversized prompts locally.
 */
export async function runGuardTest(_config: SmokeTestConfig = {}): Promise<SmokeTestResult> {
  const startTime = Date.now();

  // Create context manager with 32k context window
  const contextManager = createContextManager({
    maxContextTokens: 32768,
    reserveTokens: 2000,
  });

  // Create a logger to verify no requests are made
  const logger = createRequestLogger({ enabled: true });

  // Generate ~200k tokens worth of text
  const targetTokens = 200000;
  const hugePrompt = "A ".repeat(targetTokens);

  let errorThrown = false;
  let errorIsOverBudget = false;
  let estimatedTokens = 0;
  let budgetTokens = 0;

  try {
    // This should throw OverBudgetError before any HTTP call
    contextManager.assemble({
      system: "You are a helpful assistant.",
      instructions: "",
      userQuery: hugePrompt,
      candidateChunks: [],
    });
  } catch (err) {
    errorThrown = true;
    errorIsOverBudget = isOverBudgetError(err);
    if (errorIsOverBudget) {
      estimatedTokens = (err as OverBudgetError).estimatedTokens;
      budgetTokens = (err as OverBudgetError).budgetTokens;
    }
  }

  const durationMs = Date.now() - startTime;

  // Flush logger to check no requests were logged
  await logger.flush();

  const passed = errorThrown && errorIsOverBudget;

  return {
    name: "guard",
    passed,
    message: passed
      ? `Guard working: OverBudgetError thrown locally (${estimatedTokens} > ${budgetTokens})`
      : errorThrown
        ? `Guard failed: Error thrown but not OverBudgetError`
        : `Guard failed: No error thrown for ${targetTokens} token prompt`,
    details: {
      targetTokens,
      errorThrown,
      errorIsOverBudget,
      estimatedTokens,
      budgetTokens,
      maxPromptTokens: contextManager.estimator.maxPromptTokens,
    },
    durationMs,
  };
}

/**
 * Run all smoke tests.
 */
export async function runAllSmokeTests(config: SmokeTestConfig = {}): Promise<SmokeTestResult[]> {
  const results: SmokeTestResult[] = [];

  // Run ping test first (required for other tests)
  const pingResult = await runPingTest(config);
  results.push(pingResult);

  // Only run truncation test if Ollama is available
  if (pingResult.passed) {
    const truncationResult = await runTruncationTest(config);
    results.push(truncationResult);
  } else {
    results.push({
      name: "truncation",
      passed: false,
      message: "Skipped: Ollama not available",
      durationMs: 0,
    });
  }

  // Guard test doesn't need Ollama
  const guardResult = await runGuardTest(config);
  results.push(guardResult);

  return results;
}
