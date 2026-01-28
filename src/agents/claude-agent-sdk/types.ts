/**
 * Type definitions for the Claude Agent SDK integration.
 */

import type { MoltbotConfig } from "../../config/config.js";
import type { CcSdkModelTiers } from "../../config/types.agents.js";

/** Provider environment variables for SDK authentication and model config. */
export type SdkProviderEnv = {
  /** Anthropic API key or OAuth token. */
  ANTHROPIC_API_KEY?: string;
  /** OAuth access token (alternative to API key). */
  ANTHROPIC_AUTH_TOKEN?: string;
  /** Custom base URL for API requests. */
  ANTHROPIC_BASE_URL?: string;
  /** Use Bedrock backend. */
  CLAUDE_CODE_USE_BEDROCK?: string;
  /** Use Vertex AI backend. */
  CLAUDE_CODE_USE_VERTEX?: string;
  /** Model for fast/simple tasks (Haiku tier). */
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  /** Model for balanced tasks (Sonnet tier). */
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  /** Model for complex reasoning (Opus tier). */
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
};

/** Provider configuration for SDK runner. */
export type SdkProviderConfig = {
  /** Human-readable provider name. */
  name: string;
  /** Environment variables to set for authentication. */
  env: SdkProviderEnv;
  /** Model override (if different from config). */
  model?: string;
};

/** Reasoning/thinking level for the agent. */
export type SdkReasoningLevel = "off" | "minimal" | "low" | "medium" | "high";

/** Verbose output level for tool results. */
export type SdkVerboseLevel = "off" | "on" | "full";

/** Streaming callbacks for SDK runner. */
export type SdkRunnerCallbacks = {
  /** Called when the assistant message starts. */
  onAssistantMessageStart?: () => void | Promise<void>;
  /** Called when a partial reply chunk is available. */
  onPartialReply?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
  /** Called for reasoning/thinking stream events. */
  onReasoningStream?: (payload: { text?: string }) => void | Promise<void>;
  /** Called for block-level reply delivery. */
  onBlockReply?: (payload: {
    text?: string;
    mediaUrls?: string[];
    audioAsVoice?: boolean;
    replyToId?: string;
  }) => void | Promise<void>;
  /** Called when block replies should be flushed. */
  onBlockReplyFlush?: () => void | Promise<void>;
  /** Called when a tool result is available. */
  onToolResult?: (payload: { text?: string; mediaUrls?: string[] }) => void | Promise<void>;
  /** Called for agent lifecycle events. */
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
};

/** Parameters for SDK runner execution. */
export type SdkRunnerParams = {
  // ─── Session & Identity ────────────────────────────────────────────────────
  /** Session identifier. */
  sessionId: string;
  /** Session key for routing. */
  sessionKey?: string;
  /** Path to session file for conversation history. */
  sessionFile: string;
  /** Agent workspace directory. */
  workspaceDir: string;
  /** Agent data directory. */
  agentDir?: string;
  /** Moltbot agent ID (e.g., "main", "work"). */
  agentId?: string;

  // ─── Configuration ─────────────────────────────────────────────────────────
  /** Moltbot configuration. */
  config?: MoltbotConfig;
  /** User prompt/message. */
  prompt: string;
  /** Model to use (provider/model format). */
  model?: string;
  /** Provider configuration. */
  providerConfig?: SdkProviderConfig;
  /** Timeout in milliseconds. */
  timeoutMs: number;
  /** Run identifier for event correlation. */
  runId: string;
  /** Abort signal for cancellation. */
  abortSignal?: AbortSignal;

  // ─── Model Behavior ────────────────────────────────────────────────────────
  /** Reasoning/thinking level. */
  reasoningLevel?: SdkReasoningLevel;
  /** Verbose level for tool output. */
  verboseLevel?: SdkVerboseLevel;
  /** Maximum output tokens. */
  maxOutputTokens?: number;
  /** Maximum thinking tokens (when reasoning is enabled). */
  maxThinkingTokens?: number;

  // ─── Tools ─────────────────────────────────────────────────────────────────
  /** Allow elevated bash commands. */
  bashElevated?: boolean;
  /** Tools to disable. */
  disableTools?: string[];
  /** Filter for emitting tool results. */
  shouldEmitToolResult?: (toolName: string) => boolean;
  /** Filter for emitting tool output. */
  shouldEmitToolOutput?: (toolName: string) => boolean;

  // ─── System Prompt Context ─────────────────────────────────────────────────
  /** Extra system prompt to append (legacy). */
  extraSystemPrompt?: string;
  /** User's timezone (e.g., "America/New_York"). */
  timezone?: string;
  /** Messaging channel (e.g., "telegram", "slack"). */
  messageChannel?: string;
  /** Channel-specific hints. */
  channelHints?: string;
  /** Available Moltbot skills. */
  skills?: string[];

  // ─── SDK Options ───────────────────────────────────────────────────────────
  /** Enable Claude Code hooks. */
  hooksEnabled?: boolean;
  /** Additional SDK options. */
  sdkOptions?: Record<string, unknown>;
  /** 3-tier model configuration (haiku/sonnet/opus). */
  modelTiers?: CcSdkModelTiers;
} & SdkRunnerCallbacks;

/** SDK event types from the Claude Agent SDK. */
export type SdkEventType =
  | "assistant_message"
  | "tool_use"
  | "tool_result"
  | "error"
  | "done"
  | "thinking"
  | "text";

/** Base SDK event structure. */
export type SdkEvent = {
  type: SdkEventType;
  data?: unknown;
};

/** SDK text/content event. */
export type SdkTextEvent = SdkEvent & {
  type: "text" | "assistant_message";
  data: {
    text?: string;
    content?: string;
  };
};

/** SDK tool use event. */
export type SdkToolUseEvent = SdkEvent & {
  type: "tool_use";
  data: {
    name: string;
    input: Record<string, unknown>;
    id?: string;
  };
};

/** SDK tool result event. */
export type SdkToolResultEvent = SdkEvent & {
  type: "tool_result";
  data: {
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  };
};

/** SDK error event. */
export type SdkErrorEvent = SdkEvent & {
  type: "error";
  data: {
    message: string;
    code?: string;
  };
};

/** SDK done event. */
export type SdkDoneEvent = SdkEvent & {
  type: "done";
  data?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
};
