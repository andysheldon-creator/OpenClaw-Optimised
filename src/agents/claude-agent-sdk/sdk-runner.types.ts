/**
 * Types for the Claude Agent SDK runner — an alternative to the Pi Agent
 * embedded runner that uses the Claude Agent SDK as the main agent runtime.
 */

import type { ImageContent } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../../config/config.js";
import type { AgentRuntimePayload } from "../agent-runtime.js";
import type { MessagingToolSend } from "../pi-embedded-messaging.js";
import type { AnyAgentTool } from "../tools/common.js";

// ---------------------------------------------------------------------------
// SDK provider configuration (z.AI, Anthropic, or custom)
// ---------------------------------------------------------------------------

/**
 * Environment variable overrides for a Claude Agent SDK provider.
 *
 * These are passed to `query({ options: { env } })` and control which
 * backend the SDK talks to. For z.AI, this includes the base URL, auth
 * token, and timeout. For Anthropic (default), this is empty/undefined.
 */
export type SdkProviderEnv = {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  API_TIMEOUT_MS?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  CLAUDE_CODE_SUBAGENT_MODEL?: string;
  [key: string]: string | undefined;
};

/** Configuration for a single Claude Agent SDK provider backend. */
export type SdkProviderConfig = {
  /** Display name for logging/status. */
  name?: string;
  /** Environment variable overrides for this provider. */
  env?: SdkProviderEnv;
  /** Override the model alias (e.g., "sonnet", "opus"). */
  model?: string;
  /** Max turns before the SDK stops. */
  maxTurns?: number;
  /**
   * Beta features to enable.
   * - 'context-1m-2025-08-07': Enable 1M token context window (Sonnet 4/4.5 only)
   */
  betas?: string[];
};

// ---------------------------------------------------------------------------
// SDK runner params (analogous to RunEmbeddedPiAgentParams)
// ---------------------------------------------------------------------------

export type SdkRunnerParams = {
  /** Unique run identifier. */
  runId: string;

  /** Session identifier (used for logging and tracking). */
  sessionId: string;

  /** The user prompt to send to the agent. */
  prompt: string;

  /** Working directory for the agent. */
  workspaceDir: string;

  /** Agent directory (for auth profile resolution). */
  agentDir?: string;

  /** Clawdbrain configuration (for tool creation, policies, etc.). */
  config?: OpenClawConfig;

  /**
   * Pre-built Clawdbrain tools to expose to the agent.
   * These should already be policy-filtered (via createOpenClawCodingTools).
   */
  tools: AnyAgentTool[];

  /**
   * SDK provider configuration. Controls which backend the SDK talks to.
   * - undefined → default Anthropic (local Claude Code auth)
   * - { env: { ANTHROPIC_BASE_URL: "https://api.z.ai/..." } } → z.AI
   */
  provider?: SdkProviderConfig;

  /**
   * Claude Code built-in tools to enable alongside Clawdbrain MCP tools.
   * Set to `[]` to disable all built-in tools (agent uses only Clawdbrain tools).
   * Set to `["Read", "Bash", ...]` for a curated list.
   * Defaults to `[]` (Clawdbrain tools only via MCP).
   */
  builtInTools?: string[];

  /** System prompt to prepend / inject. */
  systemPrompt?: string;

  /** Permission mode for the SDK ("default", "acceptEdits", "bypassPermissions"). */
  permissionMode?: string;

  /** Enable Claude Code hook wiring for richer lifecycle/tool parity. */
  hooksEnabled?: boolean;

  /**
   * When true, only content inside `<final>...</final>` tags is returned.
   * Mirrors Pi agent's enforceFinalTag for models that emit intermediate narration.
   */
  enforceFinalTag?: boolean;

  /** Additional `query({ options })` fields to pass through (excluding tool bridging). */
  sdkOptions?: Record<string, unknown>;

  /** Max agent turns before the SDK stops. */
  maxTurns?: number;

  /** Model to use (e.g., "sonnet", "opus", "haiku", or full model ID). */
  model?: string;

  /** Token budget for extended thinking (0 or undefined = disabled). */
  thinkingBudget?: number;

  /** Timeout in milliseconds for the entire run. */
  timeoutMs?: number;

  /** Abort signal for cancellation. */
  abortSignal?: AbortSignal;

  /** Optional inbound images/audio/video (multimodal input support). */
  images?: ImageContent[];

  // --- Streaming callbacks with full multimodal support (voice, video, pictures) ---

  /** Called with partial text as the agent streams a response. */
  onPartialReply?: (payload: AgentRuntimePayload) => void | Promise<void>;

  /** Called when the agent starts a new assistant message. */
  onAssistantMessageStart?: () => void | Promise<void>;

  /**
   * Called with block reply text during streaming and at run completion.
   * With `blockReplyBreak`, block replies are emitted at message boundaries
   * during the run (not just once at the end).
   */
  onBlockReply?: (payload: AgentRuntimePayload) => void | Promise<void>;

  /**
   * Block reply break mode:
   * - `"message_end"`: emit accumulated text at assistant message boundaries
   * - `"text_end"`: emit text chunks as they are extracted (may use chunker)
   */
  blockReplyBreak?: "text_end" | "message_end";

  /**
   * Chunking configuration for block replies (minChars, maxChars, breakPreference).
   * Only used when `blockReplyBreak` is set.
   */
  blockReplyChunking?: {
    minChars: number;
    maxChars: number;
    breakPreference?: "paragraph" | "newline" | "sentence";
    flushOnParagraph?: boolean;
  };

  /** Called when a tool result is produced. */
  onToolResult?: (payload: AgentRuntimePayload) => void | Promise<void>;

  /** Called with thinking/reasoning text as the agent streams reasoning. */
  onReasoningStream?: (payload: AgentRuntimePayload) => void | Promise<void>;

  /** Called for lifecycle / diagnostic events. */
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void | Promise<void>;

  /**
   * MCP server name for the bridged Clawdbrain tools.
   * Defaults to "clawdbrain".
   */
  mcpServerName?: string;

  /**
   * Claude Code session ID from a previous run.
   * When provided, the SDK will resume the session natively without
   * requiring client-side history serialization.
   */
  claudeSessionId?: string;

  /**
   * Beta features to enable for this run.
   * - 'context-1m-2025-08-07': Enable 1M token context window (Sonnet 4/4.5 only)
   *
   * Note: 1M context is more expensive. Use task classification to decide when
   * larger context is beneficial (e.g., large codebase analysis, long documents).
   */
  betas?: string[];
};

// ---------------------------------------------------------------------------
// Conversation history types
// ---------------------------------------------------------------------------

/**
 * A single conversation turn for SDK history serialization.
 * These are simplified representations of prior Pi Agent messages,
 * stripped of tool results and other internal state.
 */
export type SdkConversationTurn = {
  role: "user" | "assistant";
  content: string;
  /** Optional ISO timestamp for context ordering. */
  timestamp?: string;
};

// ---------------------------------------------------------------------------
// SDK runner result (analogous to EmbeddedPiRunResult)
// ---------------------------------------------------------------------------

export type SdkRunnerMeta = {
  durationMs: number;
  provider?: string;
  model?: string;
  eventCount: number;
  extractedChars: number;
  truncated: boolean;
  aborted?: boolean;
  /** Claude Code session ID returned from the SDK (use for subsequent `resume` calls). */
  claudeSessionId?: string;
  /** Token usage statistics from the API response. */
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  /** Number of assistant turns (responses) in this run. */
  turnCount?: number;
  /** Estimated cost in USD (computed from usage if available). */
  costUsd?: number;
  error?: {
    kind: "sdk_unavailable" | "mcp_bridge_failed" | "run_failed" | "timeout" | "no_output";
    message: string;
  };
  /** Tool bridge diagnostics. */
  bridge?: {
    toolCount: number;
    registeredTools: string[];
    skippedTools: string[];
  };
};

export type SdkRunnerResult = {
  /** Extracted text payloads from the agent run. */
  payloads: Array<{
    text?: string;
    isError?: boolean;
    mediaUrl?: string;
    mediaUrls?: string[];
    replyToId?: string;
    replyToTag?: boolean;
    replyToCurrent?: boolean;
    audioAsVoice?: boolean;
  }>;
  /** Run metadata. */
  meta: SdkRunnerMeta;
  /**
   * True if a messaging tool (e.g. `message`, `sessions_send`, or provider tools)
   * successfully sent a message during the run.
   *
   * Used to suppress "no output" errors and avoid duplicate confirmations when
   * the agent chooses to send replies via tools.
   */
  didSendViaMessagingTool?: boolean;
  /** Texts successfully sent via messaging tools during the run. */
  messagingToolSentTexts?: string[];
  /** Messaging tool targets that successfully sent a message during the run. */
  messagingToolSentTargets?: MessagingToolSend[];
};
