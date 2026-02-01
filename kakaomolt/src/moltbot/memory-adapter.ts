/**
 * Moltbot Memory Adapter
 *
 * Bridges Moltbot's local memory system with KakaoMolt's cloud sync.
 * Reads from local SQLite database and exports for E2E encrypted sync.
 *
 * Moltbot Memory Structure:
 * - Database: ~/.clawdbot/memory/{agentId}.sqlite
 * - Tables: files, chunks, chunks_vec (vector), chunks_fts (FTS5)
 * - Sessions: ~/.clawdbot/agents/{agentId}/sessions/*.jsonl
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// Moltbot paths
const MOLTBOT_BASE_DIR = join(homedir(), ".clawdbot");
const MEMORY_DIR = join(MOLTBOT_BASE_DIR, "memory");
const AGENTS_DIR = join(MOLTBOT_BASE_DIR, "agents");

export interface MoltbotMemoryChunk {
  id: string;
  path: string;
  source: "memory" | "sessions";
  startLine: number;
  endLine: number;
  hash: string;
  model: string;
  text: string;
  embedding?: number[];
  updatedAt: number;
}

export interface MoltbotFile {
  path: string;
  source: "memory" | "sessions";
  hash: string;
  mtime: number;
  size: number;
}

export interface MoltbotConversationMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
  timestamp?: number;
  model?: string;
  provider?: string;
  toolCalls?: unknown[];
}

interface ContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  [key: string]: unknown;
}

export interface MoltbotSession {
  sessionId: string;
  sessionFile: string;
  messages: MoltbotConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MoltbotMemoryExport {
  version: number;
  agentId: string;
  exportedAt: string;
  memory: {
    files: MoltbotFile[];
    chunks: MoltbotMemoryChunk[];
    metadata: {
      model: string;
      provider: string;
      chunkTokens: number;
      chunkOverlap: number;
      vectorDims?: number;
    } | null;
  };
  sessions: MoltbotSession[];
}

/**
 * Check if Moltbot is installed and configured
 */
export function isMoltbotInstalled(): boolean {
  return existsSync(MOLTBOT_BASE_DIR);
}

/**
 * List available agent IDs
 */
export function listAgentIds(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];

  try {
    return readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Get memory database path for an agent
 */
export function getMemoryDbPath(agentId: string): string {
  return join(MEMORY_DIR, `${agentId}.sqlite`);
}

/**
 * Check if agent has memory database
 */
export function hasMemoryDb(agentId: string): boolean {
  return existsSync(getMemoryDbPath(agentId));
}

/**
 * Get sessions directory for an agent
 */
export function getSessionsDir(agentId: string): string {
  return join(AGENTS_DIR, agentId, "sessions");
}

/**
 * Read Moltbot memory from SQLite database
 * Note: This requires Node.js SQLite support (node:sqlite)
 */
export async function readMoltbotMemory(agentId: string): Promise<{
  files: MoltbotFile[];
  chunks: MoltbotMemoryChunk[];
  metadata: MoltbotMemoryExport["memory"]["metadata"];
} | null> {
  const dbPath = getMemoryDbPath(agentId);
  if (!existsSync(dbPath)) {
    return null;
  }

  try {
    // Dynamic import for node:sqlite (Node.js 22+)
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });

    // Read files
    const fileRows = db.prepare("SELECT path, source, hash, mtime, size FROM files").all() as Array<{
      path: string;
      source: "memory" | "sessions";
      hash: string;
      mtime: number;
      size: number;
    }>;

    const files: MoltbotFile[] = fileRows.map((row) => ({
      path: row.path,
      source: row.source,
      hash: row.hash,
      mtime: row.mtime,
      size: row.size,
    }));

    // Read chunks with embeddings
    const chunkRows = db
      .prepare(
        `SELECT id, path, source, start_line, end_line, hash, model, text, embedding, updated_at
         FROM chunks`,
      )
      .all() as Array<{
      id: string;
      path: string;
      source: "memory" | "sessions";
      start_line: number;
      end_line: number;
      hash: string;
      model: string;
      text: string;
      embedding: string | null;
      updated_at: number;
    }>;

    const chunks: MoltbotMemoryChunk[] = chunkRows.map((row) => ({
      id: row.id,
      path: row.path,
      source: row.source,
      startLine: row.start_line,
      endLine: row.end_line,
      hash: row.hash,
      model: row.model,
      text: row.text,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      updatedAt: row.updated_at,
    }));

    // Read metadata
    const metaRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("memory_index_meta_v1") as
      | { value: string }
      | undefined;

    let metadata: MoltbotMemoryExport["memory"]["metadata"] = null;
    if (metaRow?.value) {
      try {
        metadata = JSON.parse(metaRow.value);
      } catch {
        // Ignore parse errors
      }
    }

    db.close();

    return { files, chunks, metadata };
  } catch (err) {
    console.error(`Failed to read Moltbot memory: ${err}`);
    return null;
  }
}

/**
 * Read session transcripts for an agent
 */
export function readMoltbotSessions(agentId: string): MoltbotSession[] {
  const sessionsDir = getSessionsDir(agentId);
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const sessions: MoltbotSession[] = [];

  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const filePath = join(sessionsDir, file);
      const stat = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      let sessionId = file.replace(".jsonl", "");
      let sessionHeader: { id?: string; timestamp?: string } | null = null;
      const messages: MoltbotConversationMessage[] = [];

      for (const line of lines) {
        try {
          const record = JSON.parse(line);

          // Session header
          if (record.type === "session") {
            sessionHeader = record;
            if (record.id) sessionId = record.id;
            continue;
          }

          // Message record
          if (record.type === "message" && record.message) {
            const msg = record.message;
            if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
              messages.push({
                role: msg.role,
                content: extractTextContent(msg.content),
                timestamp: msg.timestamp,
                model: msg.model,
                provider: msg.provider,
                toolCalls: msg.toolCalls,
              });
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      if (messages.length > 0) {
        sessions.push({
          sessionId,
          sessionFile: filePath,
          messages,
          createdAt: sessionHeader?.timestamp ?? stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
  } catch (err) {
    console.error(`Failed to read sessions: ${err}`);
  }

  return sessions;
}

/**
 * Extract text content from message content (which can be string or array of blocks)
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object") {
        const b = block as ContentBlock;
        if (b.type === "text" && typeof b.text === "string") {
          textParts.push(b.text);
        }
      }
    }
    return textParts.join("\n");
  }

  return "";
}

/**
 * Export all Moltbot data for an agent (for sync)
 */
export async function exportMoltbotData(agentId: string): Promise<MoltbotMemoryExport | null> {
  if (!isMoltbotInstalled()) {
    return null;
  }

  const memory = await readMoltbotMemory(agentId);
  const sessions = readMoltbotSessions(agentId);

  return {
    version: 1,
    agentId,
    exportedAt: new Date().toISOString(),
    memory: memory ?? {
      files: [],
      chunks: [],
      metadata: null,
    },
    sessions,
  };
}

/**
 * Import Moltbot data from sync (restore to local)
 */
export async function importMoltbotData(data: MoltbotMemoryExport): Promise<{
  success: boolean;
  error?: string;
  stats?: {
    files: number;
    chunks: number;
    sessions: number;
  };
}> {
  const { agentId, memory, sessions } = data;

  try {
    // Ensure directories exist
    const memoryDir = MEMORY_DIR;
    const sessionsDir = getSessionsDir(agentId);

    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    // Import memory to SQLite
    let filesImported = 0;
    let chunksImported = 0;

    if (memory.chunks.length > 0 || memory.files.length > 0) {
      const dbPath = getMemoryDbPath(agentId);
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(dbPath);

      // Ensure schema exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );
        CREATE TABLE IF NOT EXISTS files (
          path TEXT PRIMARY KEY,
          source TEXT,
          hash TEXT,
          mtime REAL,
          size INTEGER
        );
        CREATE TABLE IF NOT EXISTS chunks (
          id TEXT PRIMARY KEY,
          path TEXT,
          source TEXT,
          start_line INTEGER,
          end_line INTEGER,
          hash TEXT,
          model TEXT,
          text TEXT,
          embedding TEXT,
          updated_at INTEGER
        );
      `);

      // Import files
      const insertFile = db.prepare(`
        INSERT OR REPLACE INTO files (path, source, hash, mtime, size)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const file of memory.files) {
        insertFile.run(file.path, file.source, file.hash, file.mtime, file.size);
        filesImported++;
      }

      // Import chunks
      const insertChunk = db.prepare(`
        INSERT OR REPLACE INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const chunk of memory.chunks) {
        insertChunk.run(
          chunk.id,
          chunk.path,
          chunk.source,
          chunk.startLine,
          chunk.endLine,
          chunk.hash,
          chunk.model,
          chunk.text,
          chunk.embedding ? JSON.stringify(chunk.embedding) : null,
          chunk.updatedAt,
        );
        chunksImported++;
      }

      // Import metadata
      if (memory.metadata) {
        db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(
          "memory_index_meta_v1",
          JSON.stringify(memory.metadata),
        );
      }

      db.close();
    }

    // Import sessions
    let sessionsImported = 0;

    for (const session of sessions) {
      const sessionFile = join(sessionsDir, `${session.sessionId}.jsonl`);

      // Build JSONL content
      const lines: string[] = [];

      // Session header
      lines.push(
        JSON.stringify({
          type: "session",
          version: 1,
          id: session.sessionId,
          timestamp: session.createdAt,
          cwd: process.cwd(),
        }),
      );

      // Messages
      for (const msg of session.messages) {
        lines.push(
          JSON.stringify({
            type: "message",
            message: {
              role: msg.role,
              content: typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : msg.content,
              timestamp: msg.timestamp ?? Date.now(),
              model: msg.model,
              provider: msg.provider,
            },
          }),
        );
      }

      writeFileSync(sessionFile, lines.join("\n") + "\n", "utf-8");
      sessionsImported++;
    }

    return {
      success: true,
      stats: {
        files: filesImported,
        chunks: chunksImported,
        sessions: sessionsImported,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get Moltbot memory statistics for an agent
 */
export async function getMoltbotMemoryStats(agentId: string): Promise<{
  exists: boolean;
  files?: number;
  chunks?: number;
  sessions?: number;
  totalMessages?: number;
  dbSizeBytes?: number;
  lastUpdated?: string;
} | null> {
  if (!isMoltbotInstalled()) {
    return { exists: false };
  }

  const dbPath = getMemoryDbPath(agentId);
  const sessionsDir = getSessionsDir(agentId);

  const stats: {
    exists: boolean;
    files?: number;
    chunks?: number;
    sessions?: number;
    totalMessages?: number;
    dbSizeBytes?: number;
    lastUpdated?: string;
  } = { exists: false };

  // Check memory database
  if (existsSync(dbPath)) {
    stats.exists = true;
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(dbPath, { readOnly: true });

      const fileCount = db.prepare("SELECT COUNT(*) as c FROM files").get() as { c: number };
      const chunkCount = db.prepare("SELECT COUNT(*) as c FROM chunks").get() as { c: number };

      stats.files = fileCount.c;
      stats.chunks = chunkCount.c;

      db.close();

      const dbStat = statSync(dbPath);
      stats.dbSizeBytes = dbStat.size;
      stats.lastUpdated = dbStat.mtime.toISOString();
    } catch {
      // Ignore errors
    }
  }

  // Check sessions
  if (existsSync(sessionsDir)) {
    stats.exists = true;
    try {
      const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
      stats.sessions = files.length;

      // Count total messages
      let totalMessages = 0;
      for (const file of files) {
        const content = readFileSync(join(sessionsDir, file), "utf-8");
        const messageCount = content.split("\n").filter((line) => {
          if (!line.trim()) return false;
          try {
            const record = JSON.parse(line);
            return record.type === "message";
          } catch {
            return false;
          }
        }).length;
        totalMessages += messageCount;
      }
      stats.totalMessages = totalMessages;
    } catch {
      // Ignore errors
    }
  }

  return stats.exists ? stats : null;
}
