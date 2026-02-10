/**
 * Session Persistence — Survive restarts
 *
 * Periodically saves session state to disk. On startup, detects interrupted
 * sessions and offers to resume them.
 */
import fs from "node:fs";
import path from "node:path";
import { logVerbose } from "../globals.js";

export interface PersistedSession {
  sessionKey: string;
  channelType: string;
  channelId: string;
  messages: PersistedMessage[];
  tokenCount: number;
  contextTokens: number;
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface PersistedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  tokenEstimate?: number;
}

export interface SessionPersistenceConfig {
  /** Directory to store persisted sessions */
  persistDir: string;
  /** Save every N messages (default: 10) */
  saveInterval: number;
  /** Max age of a persisted session in ms before it's considered stale (default: 24h) */
  maxAgeMs: number;
}

const DEFAULT_CONFIG: SessionPersistenceConfig = {
  persistDir: "",
  saveInterval: 10,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
};

function resolveSessionPath(persistDir: string, sessionKey: string): string {
  // Sanitize session key for filesystem
  const safe = sessionKey.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(persistDir, `session-${safe}.json`);
}

/**
 * Save session state to disk.
 */
export function persistSession(
  session: PersistedSession,
  config: Partial<SessionPersistenceConfig> = {},
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.persistDir) {
    logVerbose("session-persistence: no persistDir configured, skipping save");
    return;
  }

  try {
    if (!fs.existsSync(cfg.persistDir)) {
      fs.mkdirSync(cfg.persistDir, { recursive: true });
    }

    const filePath = resolveSessionPath(cfg.persistDir, session.sessionKey);
    const data = JSON.stringify(session, null, 2);
    // Atomic write: write to temp then rename
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, filePath);

    logVerbose(
      `session-persistence: saved session ${session.sessionKey} (${session.messageCount} msgs, ${session.tokenCount} tokens)`,
    );
  } catch (err) {
    logVerbose(`session-persistence: failed to save: ${String(err)}`);
  }
}

/**
 * Check if session should be persisted based on message count interval.
 */
export function shouldPersist(messageCount: number, interval = 10): boolean {
  return messageCount > 0 && messageCount % interval === 0;
}

/**
 * Load a persisted session from disk.
 */
export function loadPersistedSession(
  persistDir: string,
  sessionKey: string,
): PersistedSession | null {
  const filePath = resolveSessionPath(persistDir, sessionKey);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as PersistedSession;
  } catch (err) {
    logVerbose(`session-persistence: failed to load ${sessionKey}: ${String(err)}`);
    return null;
  }
}

/**
 * Find all interrupted (non-stale) sessions that could be resumed.
 */
export function findInterruptedSessions(
  config: Partial<SessionPersistenceConfig> = {},
): PersistedSession[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.persistDir || !fs.existsSync(cfg.persistDir)) {
    return [];
  }

  const now = Date.now();
  const sessions: PersistedSession[] = [];

  try {
    const files = fs
      .readdirSync(cfg.persistDir)
      .filter((f) => f.startsWith("session-") && f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(cfg.persistDir, file), "utf-8");
        const session = JSON.parse(data) as PersistedSession;
        if (now - session.updatedAt < cfg.maxAgeMs) {
          sessions.push(session);
        }
      } catch {
        // skip corrupt files
      }
    }
  } catch (err) {
    logVerbose(`session-persistence: failed to scan: ${String(err)}`);
  }

  return sessions.toSorted((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Remove a persisted session (after successful resume or user declines).
 */
export function removePersistedSession(persistDir: string, sessionKey: string): void {
  const filePath = resolveSessionPath(persistDir, sessionKey);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logVerbose(`session-persistence: removed ${sessionKey}`);
    }
  } catch (err) {
    logVerbose(`session-persistence: failed to remove: ${String(err)}`);
  }
}

/**
 * Clean up stale persisted sessions older than maxAge.
 */
export function cleanupStaleSessions(config: Partial<SessionPersistenceConfig> = {}): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.persistDir || !fs.existsSync(cfg.persistDir)) {
    return 0;
  }

  const now = Date.now();
  let cleaned = 0;

  try {
    const files = fs
      .readdirSync(cfg.persistDir)
      .filter((f) => f.startsWith("session-") && f.endsWith(".json"));
    for (const file of files) {
      try {
        const filePath = path.join(cfg.persistDir, file);
        const data = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(data) as PersistedSession;
        if (now - session.updatedAt >= cfg.maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // skip
      }
    }
  } catch (err) {
    logVerbose(`session-persistence: cleanup failed: ${String(err)}`);
  }

  if (cleaned > 0) {
    logVerbose(`session-persistence: cleaned ${cleaned} stale sessions`);
  }
  return cleaned;
}

/**
 * Format a resume prompt for the user when interrupted sessions are found.
 */
export function formatResumePrompt(sessions: PersistedSession[]): string {
  if (sessions.length === 0) {
    return "";
  }

  const lines = ["🔄 **Interrupted sessions detected:**", ""];
  for (const s of sessions.slice(0, 5)) {
    const age = Math.round((Date.now() - s.updatedAt) / 60000);
    const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
    lines.push(`• **${s.sessionKey}** — ${s.messageCount} messages, ${s.model} (${ageStr})`);
  }
  lines.push("", "Reply with `/resume <session>` to continue or `/fresh` to start new.");
  return lines.join("\n");
}
