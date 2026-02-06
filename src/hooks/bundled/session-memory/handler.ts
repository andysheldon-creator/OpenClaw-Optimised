/**
 * Session memory hook handler
 *
 * Saves session context to memory when /new command is triggered
 * Creates a new dated memory file with LLM-generated slug
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawConfig } from "../../../config/config.js";
import type { HookHandler } from "../../hooks.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";

/**
 * Sanitize content for memory files by stripping binary data and file attachments.
 * This prevents context overflow from embedded audio, images, or other binary content.
 *
 * Strips:
 * - <file>...</file> tags (may contain binary audio/image data)
 * - Base64 image data patterns
 * - Long sequences of non-printable characters
 */
export function sanitizeForMemory(text: string): string;
export function sanitizeForMemory(text: null): null;
export function sanitizeForMemory(text: undefined): undefined;
export function sanitizeForMemory(text: string | null | undefined): string | null | undefined;
export function sanitizeForMemory(text: string | null | undefined): string | null | undefined {
  if (!text) {
    return text;
  }

  let result = text;

  // Strip <file>...</file> tags (may contain binary audio/image data)
  // These tags are used for embedded file content in session transcripts
  result = result.replace(/<file[^>]*>[\s\S]*?<\/file>/gi, "[file attachment stripped]");

  // Strip base64 image data patterns (data:image/... or long base64 sequences)
  result = result.replace(
    /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g,
    "[base64 image stripped]",
  );

  // Strip any remaining long base64-like sequences (>500 chars of base64 alphabet)
  result = result.replace(/[A-Za-z0-9+/=]{500,}/g, "[binary data stripped]");

  // Remove non-printable characters except common whitespace (newline, tab, carriage return)
  // This catches any binary data that leaked through as raw bytes
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  // If result is mostly replacement placeholders or very short after stripping, note it
  const strippedCount = (result.match(/\[.*?stripped\]/g) || []).length;
  if (strippedCount > 5) {
    console.log(`[session-memory] Stripped ${strippedCount} binary/file attachments from content`);
  }

  return result;
}

/**
 * Read recent messages from session file for slug generation
 */
async function getRecentSessionContent(
  sessionFilePath: string,
  messageCount: number = 15,
): Promise<string | null> {
  try {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.trim().split("\n");

    // Parse JSONL and extract user/assistant messages first
    const allMessages: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Session files have entries with type="message" containing a nested message object
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          const role = msg.role;
          if ((role === "user" || role === "assistant") && msg.content) {
            // Extract text content
            const text = Array.isArray(msg.content)
              ? // oxlint-disable-next-line typescript/no-explicit-any
                msg.content.find((c: any) => c.type === "text")?.text
              : msg.content;
            if (text && !text.startsWith("/")) {
              allMessages.push(`${role}: ${text}`);
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Then slice to get exactly messageCount messages
    const recentMessages = allMessages.slice(-messageCount);
    return recentMessages.join("\n");
  } catch {
    return null;
  }
}

/**
 * Save session context to memory when /new command is triggered
 */
const saveSessionToMemory: HookHandler = async (event) => {
  // Only trigger on 'new' command
  if (event.type !== "command" || event.action !== "new") {
    return;
  }

  try {
    console.log("[session-memory] Hook triggered for /new command");

    const context = event.context || {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".openclaw", "workspace");
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    // Get today's date for filename
    const now = new Date(event.timestamp);
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // Generate descriptive slug from session using LLM
    const sessionEntry = (context.previousSessionEntry || context.sessionEntry || {}) as Record<
      string,
      unknown
    >;
    const currentSessionId = sessionEntry.sessionId as string;
    const currentSessionFile = sessionEntry.sessionFile as string;

    console.log("[session-memory] Current sessionId:", currentSessionId);
    console.log("[session-memory] Current sessionFile:", currentSessionFile);
    console.log("[session-memory] cfg present:", !!cfg);

    const sessionFile = currentSessionFile || undefined;

    // Read message count from hook config (default: 15)
    const hookConfig = resolveHookConfig(cfg, "session-memory");
    const messageCount =
      typeof hookConfig?.messages === "number" && hookConfig.messages > 0
        ? hookConfig.messages
        : 15;

    let slug: string | null = null;
    let sessionContent: string | null = null;

    if (sessionFile) {
      // Get recent conversation content
      sessionContent = await getRecentSessionContent(sessionFile, messageCount);
      // Sanitize to remove binary data, file attachments, and base64 images
      // This prevents context overflow from embedded audio/image data
      if (sessionContent) {
        const originalLength = sessionContent.length;
        sessionContent = sanitizeForMemory(sessionContent);
        if (sessionContent.length !== originalLength) {
          console.log(
            `[session-memory] Sanitized content: ${originalLength} -> ${sessionContent.length} bytes`,
          );
        }
      }
      console.log("[session-memory] sessionContent length:", sessionContent?.length || 0);

      if (sessionContent && cfg) {
        console.log("[session-memory] Calling generateSlugViaLLM...");
        // Dynamically import the LLM slug generator (avoids module caching issues)
        // When compiled, handler is at dist/hooks/bundled/session-memory/handler.js
        // Going up ../.. puts us at dist/hooks/, so just add llm-slug-generator.js
        const openclawRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
        const slugGenPath = path.join(openclawRoot, "llm-slug-generator.js");
        const { generateSlugViaLLM } = await import(slugGenPath);

        // Use LLM to generate a descriptive slug
        slug = await generateSlugViaLLM({ sessionContent, cfg });
        console.log("[session-memory] Generated slug:", slug);
      }
    }

    // If no slug, use timestamp
    if (!slug) {
      const timeSlug = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "");
      slug = timeSlug.slice(0, 4); // HHMM
      console.log("[session-memory] Using fallback timestamp slug:", slug);
    }

    // Create filename with date and slug
    const filename = `${dateStr}-${slug}.md`;
    const memoryFilePath = path.join(memoryDir, filename);
    console.log("[session-memory] Generated filename:", filename);
    console.log("[session-memory] Full path:", memoryFilePath);

    // Format time as HH:MM:SS UTC
    const timeStr = now.toISOString().split("T")[1].split(".")[0];

    // Extract context details
    const sessionId = (sessionEntry.sessionId as string) || "unknown";
    const source = (context.commandSource as string) || "unknown";

    // Build Markdown entry
    const entryParts = [
      `# Session: ${dateStr} ${timeStr} UTC`,
      "",
      `- **Session Key**: ${event.sessionKey}`,
      `- **Session ID**: ${sessionId}`,
      `- **Source**: ${source}`,
      "",
    ];

    // Include conversation content if available
    if (sessionContent) {
      entryParts.push("## Conversation Summary", "", sessionContent, "");
    }

    const entry = entryParts.join("\n");

    // Write to new memory file
    await fs.writeFile(memoryFilePath, entry, "utf-8");
    console.log("[session-memory] Memory file written successfully");

    // Log completion (but don't send user-visible confirmation - it's internal housekeeping)
    const relPath = memoryFilePath.replace(os.homedir(), "~");
    console.log(`[session-memory] Session context saved to ${relPath}`);
  } catch (err) {
    console.error(
      "[session-memory] Failed to save session memory:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

export default saveSessionToMemory;
