/**
 * Voice context builder — constructs the system prompt for ElevenLabs
 * Conversational AI by pulling in chat history and memory.
 *
 * This gives the voice agent full awareness of the ongoing conversation
 * so it can refer to things discussed in text chat.
 */

import fs from "node:fs/promises";

import { DEFAULT_AGENT_WORKSPACE_DIR } from "../agents/workspace.js";
import type { ClawdisConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveSessionTranscriptPath,
  resolveStorePath,
} from "../config/sessions.js";
import { createSubsystemLogger } from "../logging.js";

const log = createSubsystemLogger("voice:context");

/** Default max character limit for the voice system prompt. */
const DEFAULT_MAX_CHARS = 4000;

/**
 * Build a system prompt for a voice conversation by combining:
 * 1. Bot identity / personality (from SOUL.md if available)
 * 2. Recent conversation history (from session transcript)
 * 3. Voice-specific instructions
 */
export async function buildVoiceContext(params: {
  cfg: ClawdisConfig;
  sessionKey: string;
  maxChars?: number;
}): Promise<string> {
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const parts: string[] = [];

  // ── 1. Identity / Personality ──────────────────────────────────────────
  const identity = params.cfg.identity;
  if (identity?.name) {
    parts.push(`You are ${identity.name}.`);
  }

  // Try to load SOUL.md for personality context
  const soulText = await loadSoulMd(params.cfg);
  if (soulText) {
    // Truncate SOUL.md to leave room for conversation context
    const soulLimit = Math.floor(maxChars * 0.3);
    parts.push(
      soulText.length > soulLimit
        ? `${soulText.slice(0, soulLimit)}…`
        : soulText,
    );
  }

  // ── 2. Recent Conversation History ─────────────────────────────────────
  const recentMessages = await loadRecentMessages(
    params.cfg,
    params.sessionKey,
  );
  if (recentMessages.length > 0) {
    parts.push("");
    parts.push("Recent conversation context:");
    const historyLimit = Math.floor(maxChars * 0.5);
    let historyText = "";
    for (const msg of recentMessages) {
      const line = `${msg.role}: ${msg.text}`;
      if (historyText.length + line.length > historyLimit) break;
      historyText += `${line}\n`;
    }
    if (historyText) {
      parts.push(historyText.trim());
    }
  }

  // ── 3. Voice-specific instructions ─────────────────────────────────────
  parts.push("");
  parts.push(
    "You are now in a voice conversation. " +
      "Respond naturally in spoken language. " +
      "Keep responses concise — aim for 1-3 sentences. " +
      "Refer to the conversation context above when relevant.",
  );

  const result = parts.join("\n");
  return result.length > maxChars
    ? `${result.slice(0, maxChars - 1)}…`
    : result;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function loadSoulMd(cfg: ClawdisConfig): Promise<string | null> {
  const workspaceDir = cfg.agent?.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR;
  try {
    // Try common personality file locations
    for (const filename of ["SOUL.md", "IDENTITY.md", "PERSONALITY.md"]) {
      try {
        const { resolveUserPath } = await import("../utils.js");
        const filePath = `${resolveUserPath(workspaceDir)}/${filename}`;
        const content = await fs.readFile(filePath, "utf8");
        if (content.trim()) return content.trim();
      } catch {
        // File doesn't exist, try next
      }
    }
  } catch (err) {
    log.warn(`Failed to load personality files: ${String(err)}`);
  }
  return null;
}

type SimpleMessage = { role: "user" | "assistant"; text: string };

async function loadRecentMessages(
  cfg: ClawdisConfig,
  sessionKey: string,
  limit = 20,
): Promise<SimpleMessage[]> {
  try {
    const sessionCfg = cfg.session;
    const storePath = resolveStorePath(sessionCfg?.store);
    const store = loadSessionStore(storePath);
    const entry = store[sessionKey] ?? store.main;
    if (!entry?.sessionId) return [];

    const transcriptPath = resolveSessionTranscriptPath(entry.sessionId);
    const raw = await fs.readFile(transcriptPath, "utf8");

    // Parse JSONL transcript (each line is a message)
    const messages: SimpleMessage[] = [];
    const lines = raw.trim().split("\n");
    for (const line of lines.slice(-limit * 2)) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const role = parsed.role as string;
        const content = parsed.content as string;
        if ((role === "user" || role === "assistant") && content) {
          messages.push({
            role: role as "user" | "assistant",
            text: content.slice(0, 200),
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return messages.slice(-limit);
  } catch {
    // No transcript available
    return [];
  }
}
