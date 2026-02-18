/**
 * CLI Transcript — Conversation history for the stateless `claude -p` backend.
 *
 * Since `claude -p` runs headless with no session resume, we maintain a
 * rolling transcript (JSONL) per session so recent exchanges can be injected
 * into each prompt. This gives the bot conversation memory.
 *
 * File location: ~/.clawdis/sessions/<sessionId>.cli-transcript.jsonl
 * (Distinct from the pi-embedded .jsonl to avoid conflicts.)
 */

import fs from "node:fs";
import path from "node:path";

import { resolveSessionTranscriptsDir } from "../config/sessions.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TranscriptTurn = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

// ─── Paths ───────────────────────────────────────────────────────────────────

export function resolveCliTranscriptPath(sessionId: string): string {
  return path.join(
    resolveSessionTranscriptsDir(),
    `${sessionId}.cli-transcript.jsonl`,
  );
}

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Load recent conversation turns from the transcript file.
 * Returns the last `maxTurns` entries (user + assistant pairs).
 * Returns [] if the file doesn't exist or is corrupted.
 */
export function loadRecentTranscript(
  sessionId: string,
  maxTurns = 16,
): TranscriptTurn[] {
  const filePath = resolveCliTranscriptPath(sessionId);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return [];

    const lines = raw.split("\n").filter(Boolean);
    const turns: TranscriptTurn[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (
          parsed &&
          typeof parsed.role === "string" &&
          typeof parsed.content === "string"
        ) {
          turns.push({
            role: parsed.role as "user" | "assistant",
            content: parsed.content,
            timestamp: parsed.timestamp ?? 0,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Return only the last N turns
    return turns.slice(-maxTurns);
  } catch {
    return [];
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Append a conversation exchange (user message + assistant reply) to the
 * transcript file. Creates the file and parent directory if needed.
 */
export function appendToTranscript(
  sessionId: string,
  userMessage: string,
  assistantReply: string,
): void {
  const filePath = resolveCliTranscriptPath(sessionId);
  const dir = path.dirname(filePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const now = Date.now();
    const userLine = JSON.stringify({
      role: "user",
      content: userMessage,
      timestamp: now,
    });
    const assistantLine = JSON.stringify({
      role: "assistant",
      content: assistantReply,
      timestamp: now,
    });

    fs.appendFileSync(filePath, `${userLine}\n${assistantLine}\n`, "utf-8");
  } catch {
    // Non-fatal — transcript is a best-effort enhancement
  }
}

// ─── Clear ───────────────────────────────────────────────────────────────────

/**
 * Delete the transcript file (called on /new session reset).
 */
export function clearTranscript(sessionId: string): void {
  const filePath = resolveCliTranscriptPath(sessionId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Non-fatal
  }
}

// ─── Format ──────────────────────────────────────────────────────────────────

/**
 * Format transcript turns into a text block suitable for injection into
 * the claude-cli prompt. Truncates individual messages to avoid blowing
 * the context window.
 *
 * @param maxChars - Total character budget for the history block.
 */
export function formatTranscriptForPrompt(
  turns: TranscriptTurn[],
  maxChars = 8000,
): string {
  if (turns.length === 0) return "";

  const lines: string[] = [];
  let totalChars = 0;

  // Work backwards from most recent to fill the budget
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    // Truncate individual messages to 1500 chars
    const content =
      turn.content.length > 1500
        ? turn.content.slice(0, 1497) + "..."
        : turn.content;
    const label = turn.role === "user" ? "User" : "Assistant";
    const line = `${label}: ${content}`;

    if (totalChars + line.length > maxChars) break;
    lines.unshift(line);
    totalChars += line.length + 1;
  }

  if (lines.length === 0) return "";

  return (
    "[CONVERSATION HISTORY — most recent messages in this session]\n" +
    lines.join("\n\n") +
    "\n[END CONVERSATION HISTORY]\n"
  );
}
