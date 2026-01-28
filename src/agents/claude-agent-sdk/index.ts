/**
 * Claude Agent SDK integration module.
 *
 * Provides an alternative agent runtime using the Claude Agent SDK.
 *
 * @module agents/claude-agent-sdk
 */

export { isSdkAvailable, loadClaudeAgentSdk, resetSdkLoaderForTest } from "./sdk-loader.js";
export {
  buildAnthropicSdkProvider,
  buildBedrockSdkProvider,
  buildClaudeCliSdkProvider,
  buildOpenRouterSdkProvider,
  buildVertexSdkProvider,
  buildZaiSdkProvider,
  resolveProviderConfig,
} from "./provider-config.js";
export { runSdkAgent } from "./sdk-runner.js";
export { createCcSdkAgentRuntime, type CcSdkAgentRuntimeContext } from "./sdk-agent-runtime.js";
export {
  bridgeMoltbotToolsToMcpServer,
  bridgeMoltbotToolsSync,
  buildMcpAllowedTools,
  convertToolResult,
  extractJsonSchema,
  mcpToolName,
  resetMcpServerCache,
  wrapToolHandler,
  type BridgeOptions,
  type BridgeResult,
} from "./tool-bridge.js";
export type {
  McpCallToolResult,
  McpContentBlock,
  McpImageContent,
  McpSdkServerConfig,
  McpServerConstructor,
  McpServerLike,
  McpTextContent,
  SdkRunnerQueryOptions,
} from "./tool-bridge.types.js";
export type {
  SdkDoneEvent,
  SdkErrorEvent,
  SdkEvent,
  SdkEventType,
  SdkProviderConfig,
  SdkProviderEnv,
  SdkReasoningLevel,
  SdkRunnerCallbacks,
  SdkRunnerParams,
  SdkTextEvent,
  SdkToolResultEvent,
  SdkToolUseEvent,
  SdkVerboseLevel,
} from "./types.js";

// Error handling
export {
  classifyError,
  CcsdkError,
  describeErrorKind,
  isCcsdkError,
  isRetryableError,
  toCcsdkError,
  withRetry,
  DEFAULT_RETRY_OPTIONS,
  type CcsdkErrorKind,
  type RetryOptions,
} from "./error-handling.js";

// System prompt
export {
  buildSystemPromptAdditions,
  buildSystemPromptAdditionsFromParams,
  clearPromptEnrichers,
  getEnricherCount,
  registerPromptEnricher,
  type PromptEnricher,
  type PromptEnricherContext,
} from "./system-prompt.js";
