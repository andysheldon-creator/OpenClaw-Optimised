/**
 * Pi-Agent session adapter.
 *
 * Wraps the pi-coding-agent SessionManager to provide a unified session interface.
 * Pi-Agent uses a flat JSONL format with session header and message entries.
 *
 * Pi-Agent JSONL Format:
 * ```jsonl
 * {"type":"session","version":"1","id":"...","cwd":"..."}
 * {"type":"message","message":{"role":"user","content":"..."}}
 * {"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"toolCall","id":"...","name":"...","arguments":{}}]}}
 * {"type":"message","message":{"role":"toolResult","toolCallId":"...","content":[{"type":"text","text":"..."}]}}
 * ```
 */

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
 * Pi-Agent message content types.
 */
type PiTextContent = { type: "text"; text: string };
type PiImageContent = { type: "image"; data: string; mimeType: string };
type PiToolCall = {
  type: "toolCall" | "toolUse" | "functionCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
type PiToolResult = {
  type: "toolResult";
  toolCallId: string;
  content: Array<PiTextContent | PiImageContent>;
  isError?: boolean;
};
type PiContent = PiTextContent | PiImageContent | PiToolCall | PiToolResult;

/**
 * Pi-Agent message structure.
 */
type PiMessage = {
  role: "user" | "assistant" | "toolResult";
  content: string | PiContent[];
};

/**
 * Pi-Agent session entry types.
 */
type PiSessionHeader = {
  type: "session";
  version?: string;
  id?: string;
  cwd?: string;
};

type PiMessageEntry = {
  type: "message";
  id?: string;
  parentId?: string;
  message: PiMessage;
};

type PiEntry = PiSessionHeader | PiMessageEntry;

/**
 * SessionManager interface (subset we need from pi-coding-agent).
 */
interface PiSessionManager {
  sessionId: string;
  fileEntries: PiEntry[];
  appendMessage(message: PiMessage): void;
  buildSessionContext(): { messages: PiMessage[] };
  getLeafEntry(): PiEntry | null;
  branch(parentId: string): void;
  resetLeaf(): void;
}

/**
 * Options for creating the Pi-Agent session adapter.
 */
export type PiSessionAdapterOptions = {
  sessionId: string;
  cwd?: string;
  /** Existing SessionManager instance to wrap. */
  sessionManager?: PiSessionManager;
};

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Convert Pi-Agent content to normalized content.
 */
function normalizePiContent(content: string | PiContent[]): NormalizedContent[] {
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
            data: block.data,
            mimeType: block.mimeType,
          };
        case "toolCall":
        case "toolUse":
        case "functionCall":
          return {
            type: "tool_call",
            id: block.id,
            name: block.name,
            arguments: block.arguments,
          };
        default:
          return null;
      }
    })
    .filter((b): b is NormalizedContent => b !== null);
}

/**
 * Convert normalized assistant content to Pi-Agent format.
 */
function denormalizeAssistantContent(content: AssistantContent[]): PiContent[] {
  return content.map((block): PiContent => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_call":
        return {
          type: "toolCall",
          id: block.id,
          name: block.name,
          arguments: block.arguments,
        };
      case "thinking":
        // Thinking blocks are typically not persisted in Pi-Agent format
        // Convert to text with marker
        return { type: "text", text: `<thinking>${block.text}</thinking>` };
      default:
        return { type: "text", text: "" };
    }
  });
}

/**
 * Pi-Agent session adapter implementation.
 */
export class PiSessionAdapter implements SessionAdapter {
  readonly format = "pi-agent" as const;
  readonly sessionFile: string;

  private sessionManager: PiSessionManager | null;
  private metadata: SessionMetadata;
  private pendingWrites: PiEntry[] = [];

  constructor(sessionFile: string, options: PiSessionAdapterOptions) {
    this.sessionFile = sessionFile;
    this.sessionManager = options.sessionManager ?? null;
    this.metadata = {
      sessionId: options.sessionId,
      cwd: options.cwd,
      version: "1",
      runtime: "pi-agent",
    };
  }

  /**
   * Set the SessionManager instance (for use with existing pi-coding-agent setup).
   */
  setSessionManager(sm: PiSessionManager): void {
    this.sessionManager = sm;
    // Update metadata from SessionManager
    const header = sm.fileEntries.find((e): e is PiSessionHeader => e.type === "session");
    if (header) {
      this.metadata.sessionId = header.id ?? this.metadata.sessionId;
      this.metadata.cwd = header.cwd ?? this.metadata.cwd;
      this.metadata.version = header.version ?? this.metadata.version;
    }
  }

  getMetadata(): SessionMetadata {
    return this.metadata;
  }

  async loadHistory(): Promise<NormalizedMessage[]> {
    if (!this.sessionManager) {
      return [];
    }

    const context = this.sessionManager.buildSessionContext();
    const messages: NormalizedMessage[] = [];

    for (let i = 0; i < context.messages.length; i++) {
      const msg = context.messages[i];
      const id = generateMessageId();

      if (msg.role === "user") {
        messages.push({
          id,
          role: "user",
          content: normalizePiContent(msg.content),
        });
      } else if (msg.role === "assistant") {
        messages.push({
          id,
          role: "assistant",
          content: normalizePiContent(msg.content),
        });
      } else if (msg.role === "toolResult") {
        // Tool results in Pi-Agent are separate messages
        const content = msg.content as PiContent[];
        const toolResult = content.find((c): c is PiToolResult => c.type === "toolResult");
        if (toolResult) {
          messages.push({
            id,
            role: "tool_result",
            content: {
              type: "tool_result",
              toolCallId: toolResult.toolCallId,
              content: toolResult.content.map((c) => ({
                type: c.type as "text" | "image",
                ...(c.type === "text" ? { text: (c as PiTextContent).text } : {}),
                ...(c.type === "image"
                  ? {
                      data: (c as PiImageContent).data,
                      mimeType: (c as PiImageContent).mimeType,
                    }
                  : {}),
              })) as Array<
                { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
              >,
              isError: toolResult.isError,
            },
          });
        }
      }
    }

    return messages;
  }

  async appendUserMessage(content: string, images?: NormalizedImageContent[]): Promise<string> {
    const id = generateMessageId();
    const messageContent: PiContent[] = [{ type: "text", text: content }];

    if (images && images.length > 0) {
      for (const img of images) {
        messageContent.push({
          type: "image",
          data: img.data,
          mimeType: img.mimeType,
        });
      }
    }

    const message: PiMessage = {
      role: "user",
      content: messageContent,
    };

    if (this.sessionManager) {
      this.sessionManager.appendMessage(message);
    } else {
      this.pendingWrites.push({
        type: "message",
        id,
        message,
      });
    }

    return id;
  }

  async appendAssistantMessage(content: AssistantContent[], _usage?: UsageInfo): Promise<string> {
    const id = generateMessageId();
    const piContent = denormalizeAssistantContent(content);

    const message: PiMessage = {
      role: "assistant",
      content: piContent,
    };

    if (this.sessionManager) {
      this.sessionManager.appendMessage(message);
    } else {
      this.pendingWrites.push({
        type: "message",
        id,
        message,
      });
    }

    return id;
  }

  async appendToolResult(
    toolCallId: string,
    result: NormalizedToolResultContent,
    isError?: boolean,
  ): Promise<string> {
    const id = generateMessageId();

    const toolResultContent: PiContent[] = [
      {
        type: "toolResult",
        toolCallId,
        content: result.content.map((c) => {
          if (c.type === "text") {
            return { type: "text" as const, text: c.text };
          }
          return {
            type: "image" as const,
            data: c.data,
            mimeType: c.mimeType,
          };
        }),
        isError: isError ?? result.isError,
      },
    ];

    const message: PiMessage = {
      role: "toolResult",
      content: toolResultContent,
    };

    if (this.sessionManager) {
      this.sessionManager.appendMessage(message);
    } else {
      this.pendingWrites.push({
        type: "message",
        id,
        message,
      });
    }

    return id;
  }

  async flush(): Promise<void> {
    // SessionManager handles flushing internally
    // Nothing to do here for the wrapped case
  }

  async close(): Promise<void> {
    // SessionManager cleanup is handled externally
    this.sessionManager = null;
    this.pendingWrites = [];
  }
}

/**
 * Create a Pi-Agent session adapter.
 */
export function createPiSessionAdapter(
  sessionFile: string,
  options: PiSessionAdapterOptions,
): PiSessionAdapter {
  return new PiSessionAdapter(sessionFile, options);
}
