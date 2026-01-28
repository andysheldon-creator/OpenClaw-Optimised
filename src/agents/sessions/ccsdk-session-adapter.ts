/**
 * Claude Code SDK session adapter.
 *
 * Reads and writes Claude Code SDK JSONL format with tree-structured messages.
 *
 * CCSDK JSONL Format:
 * ```jsonl
 * {
 *   "type": "assistant",
 *   "parentUuid": "...",
 *   "uuid": "...",
 *   "sessionId": "...",
 *   "cwd": "/path/to/workspace",
 *   "version": "2.1.22",
 *   "gitBranch": "...",
 *   "slug": "...",
 *   "timestamp": "...",
 *   "message": {
 *     "role": "assistant",
 *     "content": [
 *       { "type": "text", "text": "..." },
 *       { "type": "tool_use", "id": "...", "name": "...", "input": {} },
 *       { "type": "thinking", "thinking": "..." }
 *     ],
 *     "usage": { "input_tokens": ..., "output_tokens": ... }
 *   }
 * }
 * ```
 *
 * Key differences from Pi-Agent:
 * - Tree structure (parentUuid/uuid) vs flat list
 * - Rich metadata envelope (cwd, gitBranch, slug, version)
 * - tool_use in content (not toolCall)
 * - Tool results inline in next message
 * - Thinking blocks preserved
 */

import fs from "node:fs/promises";
import readline from "node:readline";
import { createReadStream } from "node:fs";

import type { SessionAdapter } from "./session-adapter.js";
import type {
  AssistantContent,
  NormalizedContent,
  NormalizedImageContent,
  NormalizedMessage,
  NormalizedToolResultContent,
  SessionMetadata,
  UsageInfo,
} from "./types.js";

/**
 * CCSDK content block types.
 */
type CcsdkTextContent = { type: "text"; text: string };
type CcsdkImageContent = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
type CcsdkToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type CcsdkToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<CcsdkTextContent | CcsdkImageContent>;
  is_error?: boolean;
};
type CcsdkThinking = { type: "thinking"; thinking: string };

type CcsdkContent =
  | CcsdkTextContent
  | CcsdkImageContent
  | CcsdkToolUse
  | CcsdkToolResult
  | CcsdkThinking;

/**
 * CCSDK message structure.
 */
type CcsdkMessage = {
  role: "user" | "assistant";
  content: string | CcsdkContent[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

/**
 * CCSDK session entry envelope.
 */
type CcsdkEntry = {
  type: "user" | "assistant";
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
  timestamp?: string;
  message: CcsdkMessage;
};

/**
 * Options for creating the CCSDK session adapter.
 */
export type CcsdkSessionAdapterOptions = {
  sessionId: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
};

/**
 * Generate a UUID for CCSDK messages.
 */
function generateUuid(): string {
  // Simple UUID v4-like generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert CCSDK content to normalized content.
 */
function normalizeCcsdkContent(content: string | CcsdkContent[]): NormalizedContent[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  return content
    .map((block): NormalizedContent | null => {
      switch (block.type) {
        case "text":
          return { type: "text", text: block.text };
        case "image":
          return {
            type: "image",
            data: block.source.data,
            mimeType: block.source.media_type,
          };
        case "tool_use":
          return {
            type: "tool_call",
            id: block.id,
            name: block.name,
            arguments: block.input,
          };
        case "thinking":
          return { type: "thinking", text: block.thinking };
        case "tool_result":
          // Tool results are handled separately
          return null;
        default:
          return null;
      }
    })
    .filter((b): b is NormalizedContent => b !== null);
}

/**
 * Convert normalized assistant content to CCSDK format.
 */
function denormalizeAssistantContent(content: AssistantContent[]): CcsdkContent[] {
  return content.map((block): CcsdkContent => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_call":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.arguments,
        };
      case "thinking":
        return { type: "thinking", thinking: block.text };
      default:
        return { type: "text", text: "" };
    }
  });
}

/**
 * CCSDK session adapter implementation.
 */
export class CcsdkSessionAdapter implements SessionAdapter {
  readonly format = "ccsdk" as const;
  readonly sessionFile: string;

  private metadata: SessionMetadata;
  private currentParentUuid: string | undefined;
  private entries: CcsdkEntry[] = [];
  private entriesLoaded = false;
  private pendingWrites: CcsdkEntry[] = [];

  constructor(sessionFile: string, options: CcsdkSessionAdapterOptions) {
    this.sessionFile = sessionFile;
    this.metadata = {
      sessionId: options.sessionId,
      cwd: options.cwd,
      version: options.version,
      gitBranch: options.gitBranch,
      slug: options.slug,
      runtime: "ccsdk",
    };
  }

  getMetadata(): SessionMetadata {
    return this.metadata;
  }

  /**
   * Set the parent UUID for tree-structured messages.
   */
  setParentId(parentId: string): void {
    this.currentParentUuid = parentId;
  }

  /**
   * Load entries from the session file.
   */
  private async loadEntries(): Promise<void> {
    if (this.entriesLoaded) return;

    try {
      await fs.access(this.sessionFile);
    } catch {
      // File doesn't exist yet
      this.entriesLoaded = true;
      return;
    }

    const stream = createReadStream(this.sessionFile, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed) as CcsdkEntry;
        if (entry.type === "user" || entry.type === "assistant") {
          this.entries.push(entry);
          // Track the latest UUID as potential parent
          if (entry.uuid) {
            this.currentParentUuid = entry.uuid;
          }
          // Update metadata from entries
          if (entry.cwd) this.metadata.cwd = entry.cwd;
          if (entry.version) this.metadata.version = entry.version;
          if (entry.gitBranch) this.metadata.gitBranch = entry.gitBranch;
          if (entry.slug) this.metadata.slug = entry.slug;
        }
      } catch {
        // Skip malformed lines
      }
    }

    this.entriesLoaded = true;
  }

  async loadHistory(): Promise<NormalizedMessage[]> {
    await this.loadEntries();

    const messages: NormalizedMessage[] = [];

    for (const entry of this.entries) {
      const content = normalizeCcsdkContent(entry.message.content);

      // Extract tool results from content (they're inline in CCSDK)
      const contentArr = Array.isArray(entry.message.content) ? entry.message.content : [];
      const toolResults = contentArr.filter((c): c is CcsdkToolResult => c.type === "tool_result");

      // Add the main message
      if (entry.type === "user") {
        messages.push({
          id: entry.uuid,
          role: "user",
          content,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
          metadata: {
            parentUuid: entry.parentUuid,
            cwd: entry.cwd,
            gitBranch: entry.gitBranch,
          },
        });
      } else if (entry.type === "assistant") {
        messages.push({
          id: entry.uuid,
          role: "assistant",
          content,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined,
          metadata: {
            parentUuid: entry.parentUuid,
            cwd: entry.cwd,
            gitBranch: entry.gitBranch,
            usage: entry.message.usage,
          },
        });
      }

      // Add tool results as separate messages for consistency
      for (const tr of toolResults) {
        const resultContent =
          typeof tr.content === "string"
            ? [{ type: "text" as const, text: tr.content }]
            : tr.content.map((c) => {
                if (c.type === "text") {
                  return { type: "text" as const, text: c.text };
                }
                return {
                  type: "image" as const,
                  data: c.source.data,
                  mimeType: c.source.media_type,
                };
              });

        messages.push({
          id: `${entry.uuid}-tr-${tr.tool_use_id}`,
          role: "tool_result",
          content: {
            type: "tool_result",
            toolCallId: tr.tool_use_id,
            content: resultContent,
            isError: tr.is_error,
          },
        });
      }
    }

    return messages;
  }

  async appendUserMessage(content: string, images?: NormalizedImageContent[]): Promise<string> {
    const uuid = generateUuid();
    const messageContent: CcsdkContent[] = [{ type: "text", text: content }];

    if (images && images.length > 0) {
      for (const img of images) {
        messageContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType,
            data: img.data,
          },
        });
      }
    }

    const entry: CcsdkEntry = {
      type: "user",
      uuid,
      parentUuid: this.currentParentUuid,
      sessionId: this.metadata.sessionId,
      cwd: this.metadata.cwd,
      version: this.metadata.version,
      gitBranch: this.metadata.gitBranch,
      slug: this.metadata.slug,
      timestamp: new Date().toISOString(),
      message: {
        role: "user",
        content: messageContent,
      },
    };

    this.entries.push(entry);
    this.pendingWrites.push(entry);
    this.currentParentUuid = uuid;

    return uuid;
  }

  async appendAssistantMessage(content: AssistantContent[], usage?: UsageInfo): Promise<string> {
    const uuid = generateUuid();
    const ccsdkContent = denormalizeAssistantContent(content);

    const entry: CcsdkEntry = {
      type: "assistant",
      uuid,
      parentUuid: this.currentParentUuid,
      sessionId: this.metadata.sessionId,
      cwd: this.metadata.cwd,
      version: this.metadata.version,
      gitBranch: this.metadata.gitBranch,
      slug: this.metadata.slug,
      timestamp: new Date().toISOString(),
      message: {
        role: "assistant",
        content: ccsdkContent,
        usage: usage
          ? {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              cache_read_input_tokens: usage.cacheReadTokens,
              cache_creation_input_tokens: usage.cacheWriteTokens,
            }
          : undefined,
      },
    };

    this.entries.push(entry);
    this.pendingWrites.push(entry);
    this.currentParentUuid = uuid;

    return uuid;
  }

  async appendToolResult(
    toolCallId: string,
    result: NormalizedToolResultContent,
    isError?: boolean,
  ): Promise<string> {
    // In CCSDK format, tool results are typically part of the next user message
    // For standalone storage, we create a synthetic user message with the tool result
    const uuid = generateUuid();

    const toolResultContent: CcsdkToolResult = {
      type: "tool_result",
      tool_use_id: toolCallId,
      content: result.content.map((c) => {
        if (c.type === "text") {
          return { type: "text" as const, text: c.text };
        }
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: c.mimeType,
            data: c.data,
          },
        };
      }),
      is_error: isError ?? result.isError,
    };

    const entry: CcsdkEntry = {
      type: "user",
      uuid,
      parentUuid: this.currentParentUuid,
      sessionId: this.metadata.sessionId,
      cwd: this.metadata.cwd,
      version: this.metadata.version,
      timestamp: new Date().toISOString(),
      message: {
        role: "user",
        content: [toolResultContent],
      },
    };

    this.entries.push(entry);
    this.pendingWrites.push(entry);
    this.currentParentUuid = uuid;

    return uuid;
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    // Ensure directory exists
    const dir = this.sessionFile.substring(0, this.sessionFile.lastIndexOf("/"));
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Append entries as JSONL
    const lines = this.pendingWrites.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    await fs.appendFile(this.sessionFile, lines, "utf8");

    this.pendingWrites = [];
  }

  async close(): Promise<void> {
    await this.flush();
    this.entries = [];
    this.entriesLoaded = false;
  }
}

/**
 * Create a CCSDK session adapter.
 */
export function createCcsdkSessionAdapter(
  sessionFile: string,
  options: CcsdkSessionAdapterOptions,
): CcsdkSessionAdapter {
  return new CcsdkSessionAdapter(sessionFile, options);
}
