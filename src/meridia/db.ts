/**
 * Meridia SQLite storage engine.
 *
 * Uses Node.js built-in `node:sqlite` (DatabaseSync) following the same
 * patterns as `src/memory/`.  The database lives at
 * `~/.openclaw/meridia/meridia.sqlite` by default.
 */

import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "./types.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { resolveMeridiaDir } from "./storage.js";

// ─── Types ───────────────────────────────────────────────────────────

export type MeridiaSessionRow = {
  session_key: string;
  started_at: string | null;
  ended_at: string | null;
  turn_count: number | null;
  tools_used: string | null; // JSON array
  topics: string | null; // JSON array
  emotional_arc: string | null; // JSON
  summary: string | null;
  created_at: string;
};

export type MeridiaRecordRow = {
  id: string;
  ts: string;
  session_key: string | null;
  session_id: string | null;
  run_id: string | null;
  tool_name: string | null;
  tool_call_id: string | null;
  is_error: number; // 0 or 1
  score: number | null;
  recommendation: string | null;
  reason: string | null;
  eval_kind: string | null;
  eval_model: string | null;
  data_json: string; // Full record JSON
  data_text: string | null; // Searchable text
  created_at: string;
};

export type MeridiaTraceRow = {
  id: number;
  type: string;
  ts: string;
  session_key: string | null;
  data_json: string;
};

// ─── Schema version ─────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

// ─── Database singleton ─────────────────────────────────────────────

let _db: DatabaseSync | undefined;
let _dbPath: string | undefined;

export function getMeridiaDbPath(cfg?: OpenClawConfig): string {
  const dir = resolveMeridiaDir(cfg);
  return path.join(dir, "meridia.sqlite");
}

/**
 * Open (or return cached) Meridia SQLite database.
 * Creates the DB file and parent directories if needed.
 */
export function openMeridiaDb(params?: { cfg?: OpenClawConfig; dbPath?: string }): DatabaseSync {
  const targetPath = params?.dbPath ?? getMeridiaDbPath(params?.cfg);

  // Return cached if same path
  if (_db && _dbPath === targetPath) {
    return _db;
  }

  // Close previous if different path
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore
    }
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const { DatabaseSync: DbSync } = requireNodeSqlite();
  const db = new DbSync(targetPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");

  ensureMeridiaSchema(db);

  _db = db;
  _dbPath = targetPath;
  return db;
}

/**
 * Close the cached database connection.
 */
export function closeMeridiaDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore
    }
    _db = undefined;
    _dbPath = undefined;
  }
}

// ─── Schema ─────────────────────────────────────────────────────────

export function ensureMeridiaSchema(db: DatabaseSync): {
  ftsAvailable: boolean;
  ftsError?: string;
} {
  // Schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Experiential records
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_records (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      session_key TEXT,
      session_id TEXT,
      run_id TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      is_error INTEGER DEFAULT 0,
      score REAL,
      recommendation TEXT,
      reason TEXT,
      eval_kind TEXT,
      eval_model TEXT,
      data_json TEXT,
      data_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Indexes for common queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_ts ON meridia_records(ts);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_session_key ON meridia_records(session_key);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_tool_name ON meridia_records(tool_name);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_score ON meridia_records(score);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_run_id ON meridia_records(run_id);`);

  // Session summaries
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_sessions (
      session_key TEXT PRIMARY KEY,
      started_at TEXT,
      ended_at TEXT,
      turn_count INTEGER,
      tools_used TEXT,
      topics TEXT,
      emotional_arc TEXT,
      summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Trace events
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_trace (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      ts TEXT NOT NULL,
      session_key TEXT,
      data_json TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trace_ts ON meridia_trace(ts);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trace_type ON meridia_trace(type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trace_session_key ON meridia_trace(session_key);`);

  // FTS5 for full-text search
  let ftsAvailable = false;
  let ftsError: string | undefined;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS meridia_records_fts USING fts5(
        tool_name,
        reason,
        data_text,
        content=meridia_records,
        content_rowid=rowid
      );
    `);
    ftsAvailable = true;
  } catch (err) {
    ftsError = err instanceof Error ? err.message : String(err);
  }

  // Store schema version
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('schema_version', ?)`,
  );
  stmt.run(String(SCHEMA_VERSION));

  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

// ─── Insert operations ──────────────────────────────────────────────

/**
 * Build a searchable text blob from a record for FTS indexing.
 */
function buildSearchableText(record: MeridiaExperienceRecord): string {
  const parts: string[] = [];
  parts.push(record.tool.name);
  if (record.tool.meta) parts.push(record.tool.meta);
  if (record.evaluation.reason) parts.push(record.evaluation.reason);
  // Include a summary of args/result for searchability
  if (record.data.args) {
    try {
      const argsStr = JSON.stringify(record.data.args);
      parts.push(argsStr.length > 500 ? argsStr.slice(0, 500) : argsStr);
    } catch {
      // skip
    }
  }
  if (record.data.result) {
    try {
      const resultStr = JSON.stringify(record.data.result);
      parts.push(resultStr.length > 1000 ? resultStr.slice(0, 1000) : resultStr);
    } catch {
      // skip
    }
  }
  return parts.join(" ");
}

/**
 * Insert an experiential record into SQLite.
 * Returns true if inserted, false if duplicate (id already exists).
 */
export function insertRecord(db: DatabaseSync, record: MeridiaExperienceRecord): boolean {
  const dataText = buildSearchableText(record);
  const dataJson = JSON.stringify(record);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO meridia_records
      (id, ts, session_key, session_id, run_id, tool_name, tool_call_id,
       is_error, score, recommendation, reason, eval_kind, eval_model,
       data_json, data_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    record.id,
    record.ts,
    record.sessionKey ?? null,
    record.sessionId ?? null,
    record.runId ?? null,
    record.tool.name,
    record.tool.callId,
    record.tool.isError ? 1 : 0,
    record.evaluation.score,
    record.evaluation.recommendation,
    record.evaluation.reason ?? null,
    record.evaluation.kind,
    record.evaluation.model ?? null,
    dataJson,
    dataText,
  );

  const inserted = (result.changes ?? 0) > 0;

  // Update FTS index
  if (inserted) {
    try {
      // Get the rowid of the just-inserted record
      const row = db.prepare(`SELECT rowid FROM meridia_records WHERE id = ?`).get(record.id) as
        | { rowid: number }
        | undefined;

      if (row) {
        db.prepare(`
          INSERT INTO meridia_records_fts (rowid, tool_name, reason, data_text)
          VALUES (?, ?, ?, ?)
        `).run(row.rowid, record.tool.name, record.evaluation.reason ?? "", dataText);
      }
    } catch {
      // FTS might not be available — that's OK
    }
  }

  return inserted;
}

/**
 * Insert multiple records in a transaction.
 * Returns the count of newly inserted records.
 */
export function insertRecordsBatch(db: DatabaseSync, records: MeridiaExperienceRecord[]): number {
  let count = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO meridia_records
      (id, ts, session_key, session_id, run_id, tool_name, tool_call_id,
       is_error, score, recommendation, reason, eval_kind, eval_model,
       data_json, data_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getRowidStmt = db.prepare(`SELECT rowid FROM meridia_records WHERE id = ?`);

  const ftsStmt = (() => {
    try {
      return db.prepare(`
        INSERT INTO meridia_records_fts (rowid, tool_name, reason, data_text)
        VALUES (?, ?, ?, ?)
      `);
    } catch {
      return null;
    }
  })();

  // Wrap in a transaction for performance
  db.exec("BEGIN");
  try {
    for (const record of records) {
      const dataText = buildSearchableText(record);
      const dataJson = JSON.stringify(record);

      const result = insertStmt.run(
        record.id,
        record.ts,
        record.sessionKey ?? null,
        record.sessionId ?? null,
        record.runId ?? null,
        record.tool.name,
        record.tool.callId,
        record.tool.isError ? 1 : 0,
        record.evaluation.score,
        record.evaluation.recommendation,
        record.evaluation.reason ?? null,
        record.evaluation.kind,
        record.evaluation.model ?? null,
        dataJson,
        dataText,
      );

      if ((result.changes ?? 0) > 0) {
        count++;

        if (ftsStmt) {
          try {
            const row = getRowidStmt.get(record.id) as { rowid: number } | undefined;
            if (row) {
              ftsStmt.run(row.rowid, record.tool.name, record.evaluation.reason ?? "", dataText);
            }
          } catch {
            // FTS insert failed — skip
          }
        }
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return count;
}

/**
 * Insert a trace event.
 */
export function insertTraceEvent(db: DatabaseSync, event: MeridiaTraceEvent): void {
  const stmt = db.prepare(`
    INSERT INTO meridia_trace (type, ts, session_key, data_json)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    event.type,
    event.ts,
    "sessionKey" in event ? (event.sessionKey ?? null) : null,
    JSON.stringify(event),
  );
}

/**
 * Insert multiple trace events in a transaction.
 */
export function insertTraceEventsBatch(db: DatabaseSync, events: MeridiaTraceEvent[]): number {
  const stmt = db.prepare(`
    INSERT INTO meridia_trace (type, ts, session_key, data_json)
    VALUES (?, ?, ?, ?)
  `);

  let count = 0;
  db.exec("BEGIN");
  try {
    for (const event of events) {
      stmt.run(
        event.type,
        event.ts,
        "sessionKey" in event ? (event.sessionKey ?? null) : null,
        JSON.stringify(event),
      );
      count++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return count;
}

/**
 * Upsert a session summary.
 */
export function upsertSession(
  db: DatabaseSync,
  session: {
    sessionKey: string;
    startedAt?: string;
    endedAt?: string;
    turnCount?: number;
    toolsUsed?: string[];
    topics?: string[];
    emotionalArc?: unknown;
    summary?: string;
  },
): void {
  const stmt = db.prepare(`
    INSERT INTO meridia_sessions
      (session_key, started_at, ended_at, turn_count, tools_used, topics, emotional_arc, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_key) DO UPDATE SET
      ended_at = COALESCE(excluded.ended_at, meridia_sessions.ended_at),
      turn_count = COALESCE(excluded.turn_count, meridia_sessions.turn_count),
      tools_used = COALESCE(excluded.tools_used, meridia_sessions.tools_used),
      topics = COALESCE(excluded.topics, meridia_sessions.topics),
      emotional_arc = COALESCE(excluded.emotional_arc, meridia_sessions.emotional_arc),
      summary = COALESCE(excluded.summary, meridia_sessions.summary)
  `);

  stmt.run(
    session.sessionKey,
    session.startedAt ?? null,
    session.endedAt ?? null,
    session.turnCount ?? null,
    session.toolsUsed ? JSON.stringify(session.toolsUsed) : null,
    session.topics ? JSON.stringify(session.topics) : null,
    session.emotionalArc ? JSON.stringify(session.emotionalArc) : null,
    session.summary ?? null,
  );
}

/**
 * Get database statistics.
 */
export function getMeridiaDbStats(db: DatabaseSync): {
  recordCount: number;
  traceCount: number;
  sessionCount: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  schemaVersion: string | null;
} {
  const recordCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM meridia_records`).get() as { cnt: number }
  ).cnt;
  const traceCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM meridia_trace`).get() as { cnt: number }
  ).cnt;
  const sessionCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM meridia_sessions`).get() as { cnt: number }
  ).cnt;
  const oldest = db.prepare(`SELECT MIN(ts) as ts FROM meridia_records`).get() as {
    ts: string | null;
  };
  const newest = db.prepare(`SELECT MAX(ts) as ts FROM meridia_records`).get() as {
    ts: string | null;
  };
  const version = db.prepare(`SELECT value FROM meridia_meta WHERE key = 'schema_version'`).get() as
    | { value: string }
    | undefined;

  return {
    recordCount,
    traceCount,
    sessionCount,
    oldestRecord: oldest?.ts ?? null,
    newestRecord: newest?.ts ?? null,
    schemaVersion: version?.value ?? null,
  };
}
