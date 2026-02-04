/**
 * Ollama context manager and client exports.
 *
 * This module provides:
 * - Token estimation with safety margins
 * - Deterministic chunk selection for context assembly
 * - Budget-enforced prompt assembly with manifests
 * - Native and OpenAI-compatible Ollama clients
 * - Request logging for observability
 */

// Context management
export {
  createTokenEstimator,
  estimateSegments,
  type TokenEstimator,
  type TokenEstimatorConfig,
} from "./context/token-estimator.js";
export {
  selectChunks,
  buildChunkManifest,
  type ContextChunk,
  type SelectionMode,
  type SelectionResult,
  type ChunkManifestEntry,
} from "./context/chunk-selector.js";
export {
  assemblePrompt,
  createContextManager,
  type AssembleInput,
  type AssembleResult,
  type PromptManifest,
} from "./context/prompt-assembler.js";

// Clients
export { createNativeClient, type NativeClient, type NativeClientConfig } from "./client/native.js";
export { createOpenAIClient, type OpenAIClient, type OpenAIClientConfig } from "./client/openai.js";
export type {
  OllamaTransportConfig,
  NativeGenerateParams,
  NativeGenerateResponse,
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatMessage,
  PingResult,
} from "./client/types.js";

// Errors
export { OverBudgetError, isOverBudgetError, OllamaApiError, isOllamaApiError } from "./errors.js";

// Logging
export {
  createRequestLogger,
  type RequestLogger,
  type RequestLogEntry,
  type RequestLoggerConfig,
} from "./logging/request-logger.js";

// Smoke tests
export {
  runAllSmokeTests,
  runPingTest,
  runTruncationTest,
  runGuardTest,
  type SmokeTestConfig,
  type SmokeTestResult,
} from "./smoke.js";
