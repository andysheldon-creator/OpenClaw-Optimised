/**
 * Short-term memory: loads recent messages from session transcript
 * and injects them into context to survive compaction.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";

export type ShortTermMemoryConfig = {
  /** Enable short-term memory injection. Default: false. */
  enabled?: boolean;
  /** Number of recent messages to include (user + assistant). Default: 30. */
  messageCount?: number;
  /** Custom path for short-term memory file. If set, reads from this instead of session. */
  path?: string;
};

export function resolveShortTermMemoryConfig(
  config?: OpenClawConfig,
): ShortTermMemoryConfig | undefined {
  const stm = (config?.session as Record<string, unknown> | undefined)?.shortTermMemory;
  if (!stm || typeof stm !== "object") {
    return undefined;
  }
  return stm as ShortTermMemoryConfig;
}

export function isShortTermMemoryEnabled(config?: OpenClawConfig): boolean {
  const stmConfig = resolveShortTermMemoryConfig(config);
  return stmConfig?.enabled === true;
}

export function resolveShortTermMessageCount(config?: OpenClawConfig): number {
  const stmConfig = resolveShortTermMemoryConfig(config);
  const count = stmConfig?.messageCount;
  if (typeof count === "number" && count > 0 && count <= 100) {
    return count;
  }
  return 30; // Default
}

type SessionMessageEntry = {
  type: "message";
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  timestamp?: number;
};

function extractMessageText(
  content: string | Array<{ type: string; text?: string }> | undefined,
): string | null {
  if (!content) {
    return null;
  }
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (Array.isArray(content)) {
    const textPart = content.find((c) => c.type === "text" && c.text);
    return textPart?.text?.trim() || null;
  }
  return null;
}

function formatTimestamp(ts?: number): string {
  if (!ts) {
    return "";
  }
  try {
    const date = new Date(ts);
    return date.toISOString().replace("T", " ").split(".")[0] + " UTC";
  } catch {
    return "";
  }
}

/**
 * Load recent messages from session JSONL file.
 */
async function loadRecentMessagesFromSession(
  sessionFile: string,
  messageCount: number,
): Promise<Array<{ role: string; text: string; timestamp?: string }>> {
  try {
    const content = await fs.readFile(sessionFile, "utf-8");
    const lines = content.trim().split("\n");

    const messages: Array<{ role: string; text: string; timestamp?: string }> = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SessionMessageEntry;
        if (entry.type === "message" && entry.message) {
          const role = entry.message.role;
          if (role === "user" || role === "assistant") {
            const text = extractMessageText(entry.message.content);
            if (text && !text.startsWith("/")) {
              // Skip command messages
              messages.push({
                role,
                text,
                timestamp: formatTimestamp(entry.timestamp),
              });
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Return last N messages
    return messages.slice(-messageCount);
  } catch {
    return [];
  }
}

/**
 * Load recent messages from a custom short-term memory file (plain text or JSONL).
 */
async function loadRecentMessagesFromFile(
  filePath: string,
  messageCount: number,
): Promise<Array<{ role: string; text: string; timestamp?: string }>> {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    // Try JSONL format first
    if (content.trim().startsWith("{")) {
      const lines = content.trim().split("\n");
      const messages: Array<{ role: string; text: string; timestamp?: string }> = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.role && entry.text) {
            messages.push({
              role: entry.role,
              text: entry.text,
              timestamp: entry.timestamp,
            });
          }
        } catch {
          // Skip invalid lines
        }
      }
      return messages.slice(-messageCount);
    }

    // Fall back to plain text format (one message per line with role prefix)
    const lines = content.trim().split("\n");
    const messages: Array<{ role: string; text: string }> = [];

    for (const line of lines) {
      const match = line.match(/^(user|assistant):\s*(.+)/i);
      if (match) {
        messages.push({
          role: match[1].toLowerCase(),
          text: match[2].trim(),
        });
      }
    }
    return messages.slice(-messageCount);
  } catch {
    return [];
  }
}

/**
 * Format messages as markdown for context injection.
 */
function formatMessagesAsMarkdown(
  messages: Array<{ role: string; text: string; timestamp?: string }>,
): string {
  if (messages.length === 0) {
    return "No recent messages in this session.";
  }

  const lines: string[] = ["Recent conversation history (for context continuity):", ""];

  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "**User**" : "**Assistant**";
    const timestampSuffix = msg.timestamp ? ` _(${msg.timestamp})_` : "";

    // Truncate very long messages
    let text = msg.text;
    if (text.length > 500) {
      text = text.slice(0, 500) + "...";
    }

    lines.push(`${roleLabel}${timestampSuffix}: ${text}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build short-term memory context file from session or custom file.
 */
export async function buildShortTermMemoryContextFile(params: {
  config?: OpenClawConfig;
  sessionFile?: string;
  workspaceDir?: string;
}): Promise<EmbeddedContextFile | null> {
  if (!isShortTermMemoryEnabled(params.config)) {
    return null;
  }

  const stmConfig = resolveShortTermMemoryConfig(params.config);
  const messageCount = resolveShortTermMessageCount(params.config);

  let messages: Array<{ role: string; text: string; timestamp?: string }> = [];

  // Check for custom path first
  if (stmConfig?.path) {
    const customPath = params.workspaceDir
      ? path.resolve(params.workspaceDir, stmConfig.path)
      : stmConfig.path;
    messages = await loadRecentMessagesFromFile(customPath, messageCount);
  } else if (params.sessionFile) {
    // Load from session transcript
    messages = await loadRecentMessagesFromSession(params.sessionFile, messageCount);
  }

  if (messages.length === 0) {
    return null;
  }

  const content = formatMessagesAsMarkdown(messages);

  return {
    path: "SHORT_TERM_MEMORY",
    content,
  };
}

/**
 * Append a message to the short-term memory file (for custom path mode).
 */
export async function appendToShortTermMemory(params: {
  config?: OpenClawConfig;
  workspaceDir: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}): Promise<void> {
  const stmConfig = resolveShortTermMemoryConfig(params.config);
  if (!stmConfig?.enabled || !stmConfig.path) {
    return; // Only append when using custom path mode
  }

  const filePath = path.resolve(params.workspaceDir, stmConfig.path);
  const messageCount = resolveShortTermMessageCount(params.config);

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Append new message
  const entry = {
    role: params.role,
    text: params.text,
    timestamp: params.timestamp
      ? new Date(params.timestamp).toISOString()
      : new Date().toISOString(),
  };

  try {
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Write fresh if append fails
    await fs.writeFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
  }

  // Trim to messageCount
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length > messageCount) {
      const trimmed = lines.slice(-messageCount).join("\n") + "\n";
      await fs.writeFile(filePath, trimmed, "utf-8");
    }
  } catch {
    // Ignore trim errors
  }
}
