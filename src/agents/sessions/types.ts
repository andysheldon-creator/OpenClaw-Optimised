/**
 * Shared types for session adapters.
 *
 * These types provide a normalized representation of conversation history
 * that can be converted to/from runtime-specific formats.
 */

/**
 * Normalized text content block.
 */
export type NormalizedTextContent = {
  type: "text";
  text: string;
};

/**
 * Normalized image content block.
 */
export type NormalizedImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

/**
 * Normalized tool call content block.
 */
export type NormalizedToolCall = {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Normalized thinking/reasoning content block.
 */
export type NormalizedThinking = {
  type: "thinking";
  text: string;
};

/**
 * Union of all normalized content block types.
 */
export type NormalizedContent =
  | NormalizedTextContent
  | NormalizedImageContent
  | NormalizedToolCall
  | NormalizedThinking;

/**
 * Normalized tool result content.
 */
export type NormalizedToolResultContent = {
  type: "tool_result";
  toolCallId: string;
  content: Array<NormalizedTextContent | NormalizedImageContent>;
  isError?: boolean;
};

/**
 * Normalized message format for internal processing.
 */
export type NormalizedMessage = {
  /** Unique identifier for the message. */
  id: string;
  /** Message role. */
  role: "user" | "assistant" | "tool_result";
  /** Message content blocks. */
  content: NormalizedContent[] | NormalizedToolResultContent;
  /** Timestamp of the message. */
  timestamp?: number;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
};

/**
 * Session metadata.
 */
export type SessionMetadata = {
  /** Session ID. */
  sessionId: string;
  /** Working directory when the session was created. */
  cwd?: string;
  /** Session format version. */
  version?: string;
  /** Git branch (CCSDK specific). */
  gitBranch?: string;
  /** Session slug (CCSDK specific). */
  slug?: string;
  /** Runtime type. */
  runtime: "pi-agent" | "ccsdk";
};

/**
 * Usage information for a message.
 */
export type UsageInfo = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

/**
 * Assistant content types for appending messages.
 */
export type AssistantContent = NormalizedTextContent | NormalizedToolCall | NormalizedThinking;
