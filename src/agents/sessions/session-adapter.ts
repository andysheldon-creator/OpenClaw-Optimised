/**
 * Abstract session adapter interface.
 *
 * Provides a unified interface for reading and writing session history
 * across different runtime formats (Pi-Agent JSONL, Claude Code SDK JSONL).
 *
 * Each runtime reads/writes its own JSONL format. No cross-format conversion.
 */

import type {
  AssistantContent,
  NormalizedImageContent,
  NormalizedMessage,
  NormalizedToolResultContent,
  SessionMetadata,
  UsageInfo,
} from "./types.js";

/**
 * Abstract interface for session persistence.
 *
 * Implementations handle reading/writing session history in their native format.
 */
export interface SessionAdapter {
  /** Runtime format discriminant. */
  readonly format: "pi-agent" | "ccsdk";

  /** Path to the session file. */
  readonly sessionFile: string;

  // ─── Reading ───────────────────────────────────────────────────────────────

  /**
   * Load conversation history from the session file.
   * Returns messages in normalized format for internal processing.
   */
  loadHistory(): Promise<NormalizedMessage[]>;

  /**
   * Get session metadata (ID, cwd, version, etc.).
   */
  getMetadata(): SessionMetadata;

  // ─── Writing ───────────────────────────────────────────────────────────────

  /**
   * Append a user message to the session.
   * @param content Text content of the message.
   * @param images Optional image attachments.
   * @returns Message ID.
   */
  appendUserMessage(content: string, images?: NormalizedImageContent[]): Promise<string>;

  /**
   * Append an assistant message to the session.
   * @param content Array of content blocks (text, tool calls, thinking).
   * @param usage Optional token usage information.
   * @returns Message ID.
   */
  appendAssistantMessage(content: AssistantContent[], usage?: UsageInfo): Promise<string>;

  /**
   * Append a tool result to the session.
   * @param toolCallId ID of the tool call this is a result for.
   * @param result Tool result content.
   * @param isError Whether this is an error result.
   * @returns Message ID.
   */
  appendToolResult(
    toolCallId: string,
    result: NormalizedToolResultContent,
    isError?: boolean,
  ): Promise<string>;

  // ─── CCSDK-specific (no-op for pi-agent) ───────────────────────────────────

  /**
   * Set the parent message ID for tree-structured sessions.
   * CCSDK uses parentUuid/uuid for conversation threading.
   * No-op for Pi-Agent adapter.
   */
  setParentId?(parentId: string): void;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Flush any pending writes to disk.
   */
  flush(): Promise<void>;

  /**
   * Close the session adapter and release resources.
   */
  close(): Promise<void>;
}

/**
 * Factory function to create the appropriate session adapter.
 */
export type SessionAdapterFactory = (
  runtime: "pi-agent" | "ccsdk",
  sessionFile: string,
  options?: {
    sessionId?: string;
    cwd?: string;
  },
) => SessionAdapter;
