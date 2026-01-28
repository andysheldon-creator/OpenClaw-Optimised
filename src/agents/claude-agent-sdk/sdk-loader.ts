/**
 * Dynamic loader for the Claude Agent SDK.
 *
 * The SDK is an optional dependency, so we load it dynamically to avoid
 * breaking installations that don't have it installed.
 */

import { createRequire } from "node:module";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk");

/**
 * SDK query function signature.
 *
 * The SDK's query function takes a prompt and options, returning an async iterable
 * of events or a promise that resolves to one.
 */
export type SdkQueryFunction = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;

/**
 * SDK module type (generic since the actual types may not be available).
 *
 * The Claude Agent SDK exports various classes and functions for agent execution.
 * Since it's an optional dependency, we use a generic type here.
 */
export type ClaudeAgentSdkModule = {
  /** The main query function for running agent turns. */
  query: SdkQueryFunction;
  // Other exports - shape will vary by version
  [key: string]: unknown;
};

/** Cached SDK module reference. */
let sdkModule: ClaudeAgentSdkModule | null = null;
let loadAttempted = false;
let loadError: Error | null = null;

/**
 * Check if the Claude Agent SDK is available.
 */
export function isSdkAvailable(): boolean {
  if (loadAttempted) return sdkModule !== null;
  try {
    // Probe for the module without loading it fully
    const require = createRequire(import.meta.url);
    require.resolve("@anthropic-ai/claude-agent-sdk");
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the Claude Agent SDK dynamically.
 *
 * @throws Error if the SDK is not installed
 */
export async function loadClaudeAgentSdk(): Promise<ClaudeAgentSdkModule> {
  if (sdkModule) {
    return sdkModule;
  }

  if (loadAttempted && loadError) {
    throw loadError;
  }

  loadAttempted = true;

  try {
    // Dynamic import to avoid bundling issues
    // The SDK package name is resolved at runtime
    const moduleName = "@anthropic-ai/claude-agent-sdk";
    sdkModule = (await import(/* @vite-ignore */ moduleName)) as ClaudeAgentSdkModule;
    log.info("Claude Agent SDK loaded successfully");
    return sdkModule;
  } catch (err) {
    loadError = new Error(
      "Claude Agent SDK not installed. Install with: npm install @anthropic-ai/claude-agent-sdk",
    );
    loadError.cause = err;
    log.warn("Failed to load Claude Agent SDK", { error: String(err) });
    throw loadError;
  }
}

/**
 * Reset the SDK loader state (for testing).
 */
export function resetSdkLoaderForTest(): void {
  sdkModule = null;
  loadAttempted = false;
  loadError = null;
}
