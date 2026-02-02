/**
 * Session history → SDK conversation turns.
 *
 * Reads Pi Agent JSONL session transcripts and extracts user/assistant
 * text turns for injection into the SDK prompt as conversation context.
 */

import fs from "node:fs";
import type { SdkConversationTurn } from "./sdk-runner.types.js";
import { logDebug } from "../../logger.js";

// ---------------------------------------------------------------------------
// JSONL line parsing
// ---------------------------------------------------------------------------

type SessionLine = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  type?: string;
  timestamp?: string;
};

/**
 * Extract text content from a session line's content field.
 * Handles both string content and content block arrays.
 */
function extractTextContent(content: SessionLine["content"]): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const texts = content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text!);
    return texts.length > 0 ? texts.join("\n") : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a Pi Agent session transcript file and extract conversation turns.
 *
 * Parses the JSONL session file line by line, extracting user and assistant
 * text turns. Skips:
 * - Session header lines (type: "session_start", etc.)
 * - Tool result entries (role: "tool" or type: "toolResult")
 * - Lines with no extractable text content
 *
 * Returns an empty array if the file doesn't exist or is empty.
 */
export function readSessionHistory(sessionFile: string): SdkConversationTurn[] {
  if (!fs.existsSync(sessionFile)) {
    logDebug(`[sdk-session-history] Session file not found: ${sessionFile}`);
    return [];
  }

  let raw: string;
  try {
    raw = fs.readFileSync(sessionFile, "utf-8");
  } catch (err) {
    logDebug(`[sdk-session-history] Failed to read session file: ${String(err)}`);
    return [];
  }

  if (!raw.trim()) {
    return [];
  }

  const turns: SdkConversationTurn[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: SessionLine;
    try {
      parsed = JSON.parse(trimmed) as SessionLine;
    } catch {
      logDebug(`[sdk-session-history] Skipping malformed JSON line`);
      continue;
    }

    // Skip session headers and metadata lines.
    if (parsed.type && !parsed.role) {
      continue;
    }

    // Skip tool results.
    if (parsed.role === "tool" || parsed.type === "toolResult") {
      continue;
    }

    // Only extract user and assistant turns.
    if (parsed.role !== "user" && parsed.role !== "assistant") {
      continue;
    }

    const text = extractTextContent(parsed.content);
    if (!text?.trim()) {
      continue;
    }

    turns.push({
      role: parsed.role,
      content: text,
      timestamp: parsed.timestamp,
    });
  }

  return turns;
}

/**
 * Load session history for SDK injection.
 *
 * Reads the session transcript and caps to the most recent `maxTurns` turns
 * to avoid overwhelming the SDK prompt with history.
 */
export function loadSessionHistoryForSdk(params: {
  sessionFile: string;
  maxTurns?: number;
}): SdkConversationTurn[] {
  const maxTurns = params.maxTurns ?? 20;
  const turns = readSessionHistory(params.sessionFile);

  if (turns.length <= maxTurns) {
    return turns;
  }

  // Keep the most recent turns.
  return turns.slice(-maxTurns);
}
