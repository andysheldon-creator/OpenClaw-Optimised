/**
 * Meridia Query API.
 *
 * Provides structured query functions over the SQLite-backed experiential
 * record store.  All functions accept a `DatabaseSync` handle obtained
 * via `openMeridiaDb()`.
 */

import type { DatabaseSync } from "node:sqlite";
import type { MeridiaRecordRow, MeridiaSessionRow, MeridiaTraceRow } from "./db.js";
import type { MeridiaExperienceRecord } from "./types.js";

// ─── Result types ────────────────────────────────────────────────────

export type RecordQueryResult = {
  /** Parsed record (from data_json) */
  record: MeridiaExperienceRecord;
  /** FTS rank (lower = more relevant).  Only present for search results. */
  rank?: number;
};

export type RecordQueryFilters = {
  sessionKey?: string;
  toolName?: string;
  minScore?: number;
  maxScore?: number;
  isError?: boolean;
  evalKind?: "heuristic" | "llm";
  limit?: number;
  offset?: number;
};

export type SessionSummary = {
  sessionKey: string;
  startedAt: string | null;
  endedAt: string | null;
  turnCount: number | null;
  toolsUsed: string[];
  topics: string[];
  emotionalArc: unknown;
  summary: string | null;
  recordCount: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────

function parseRecord(row: MeridiaRecordRow): MeridiaExperienceRecord {
  return JSON.parse(row.data_json) as MeridiaExperienceRecord;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyFilters(
  baseWhere: string,
  baseParams: unknown[],
  filters?: RecordQueryFilters,
): { where: string; params: unknown[]; limitClause: string } {
  const conditions: string[] = baseWhere ? [baseWhere] : [];
  const params = [...baseParams];

  if (filters?.sessionKey) {
    conditions.push("r.session_key = ?");
    params.push(filters.sessionKey);
  }
  if (filters?.toolName) {
    conditions.push("r.tool_name = ?");
    params.push(filters.toolName);
  }
  if (filters?.minScore !== undefined) {
    conditions.push("r.score >= ?");
    params.push(filters.minScore);
  }
  if (filters?.maxScore !== undefined) {
    conditions.push("r.score <= ?");
    params.push(filters.maxScore);
  }
  if (filters?.isError !== undefined) {
    conditions.push("r.is_error = ?");
    params.push(filters.isError ? 1 : 0);
  }
  if (filters?.evalKind) {
    conditions.push("r.eval_kind = ?");
    params.push(filters.evalKind);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

  return { where, params, limitClause };
}

// ─── Query functions ─────────────────────────────────────────────────

/**
 * Full-text search over experiential records using FTS5.
 * Searches tool_name, reason, and data_text fields.
 */
export function searchRecords(
  db: DatabaseSync,
  query: string,
  filters?: RecordQueryFilters,
): RecordQueryResult[] {
  if (!query.trim()) return [];

  // Escape FTS5 special characters and build a simple query
  const ftsQuery = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" ");

  if (!ftsQuery) return [];

  const { where: extraWhere, params: extraParams, limitClause } = applyFilters("", [], filters);

  // Join FTS results with the records table
  const whereClause = extraWhere
    ? `WHERE r.id IN (SELECT r2.id FROM meridia_records r2 ${extraWhere.replace(/r\./g, "r2.")})`
    : "";

  // Use a simpler approach: search FTS, then filter
  try {
    const sql = `
      SELECT r.*, fts.rank
      FROM meridia_records_fts fts
      JOIN meridia_records r ON r.rowid = fts.rowid
      ${extraWhere ? `${extraWhere} AND` : "WHERE"} meridia_records_fts MATCH ?
      ORDER BY fts.rank
      ${limitClause}
    `;
    const params = [...extraParams, ftsQuery];
    const rows = db.prepare(sql).all(...params) as Array<MeridiaRecordRow & { rank: number }>;
    return rows.map((row) => ({
      record: parseRecord(row),
      rank: row.rank,
    }));
  } catch {
    // FTS not available — fall back to LIKE search
    return searchRecordsFallback(db, query, filters);
  }
}

/**
 * Fallback search using LIKE when FTS5 is not available.
 */
function searchRecordsFallback(
  db: DatabaseSync,
  query: string,
  filters?: RecordQueryFilters,
): RecordQueryResult[] {
  const likePattern = `%${query}%`;
  const { where, params, limitClause } = applyFilters(
    "(r.tool_name LIKE ? OR r.reason LIKE ? OR r.data_text LIKE ?)",
    [likePattern, likePattern, likePattern],
    filters,
  );

  const sql = `
    SELECT r.*
    FROM meridia_records r
    ${where}
    ORDER BY r.ts DESC
    ${limitClause}
  `;

  const rows = db.prepare(sql).all(...params) as MeridiaRecordRow[];
  return rows.map((row) => ({ record: parseRecord(row) }));
}

/**
 * Get records within a date range (inclusive).
 * Dates should be ISO strings (e.g. "2025-01-15" or "2025-01-15T00:00:00Z").
 */
export function getRecordsByDateRange(
  db: DatabaseSync,
  from: string,
  to: string,
  filters?: RecordQueryFilters,
): RecordQueryResult[] {
  const { where, params, limitClause } = applyFilters(
    "r.ts >= ? AND r.ts <= ?",
    [from, to],
    filters,
  );

  const sql = `
    SELECT r.*
    FROM meridia_records r
    ${where}
    ORDER BY r.ts DESC
    ${limitClause}
  `;

  const rows = db.prepare(sql).all(...params) as MeridiaRecordRow[];
  return rows.map((row) => ({ record: parseRecord(row) }));
}

/**
 * Get all records for a specific session.
 */
export function getRecordsBySession(
  db: DatabaseSync,
  sessionKey: string,
  filters?: Omit<RecordQueryFilters, "sessionKey">,
): RecordQueryResult[] {
  const { where, params, limitClause } = applyFilters("r.session_key = ?", [sessionKey], {
    ...filters,
    sessionKey: undefined,
  } as RecordQueryFilters);

  const sql = `
    SELECT r.*
    FROM meridia_records r
    ${where}
    ORDER BY r.ts ASC
    ${limitClause}
  `;

  const rows = db.prepare(sql).all(...params) as MeridiaRecordRow[];
  return rows.map((row) => ({ record: parseRecord(row) }));
}

/**
 * Get the most recent records.
 */
export function getRecentRecords(
  db: DatabaseSync,
  limit: number = 20,
  filters?: Omit<RecordQueryFilters, "limit">,
): RecordQueryResult[] {
  const { where, params } = applyFilters("", [], filters as RecordQueryFilters);

  const sql = `
    SELECT r.*
    FROM meridia_records r
    ${where}
    ORDER BY r.ts DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as MeridiaRecordRow[];
  return rows.map((row) => ({ record: parseRecord(row) }));
}

/**
 * Get records for a specific tool.
 */
export function getRecordsByTool(
  db: DatabaseSync,
  toolName: string,
  filters?: Omit<RecordQueryFilters, "toolName">,
): RecordQueryResult[] {
  const { where, params, limitClause } = applyFilters("r.tool_name = ?", [toolName], {
    ...filters,
    toolName: undefined,
  } as RecordQueryFilters);

  const sql = `
    SELECT r.*
    FROM meridia_records r
    ${where}
    ORDER BY r.ts DESC
    ${limitClause}
  `;

  const rows = db.prepare(sql).all(...params) as MeridiaRecordRow[];
  return rows.map((row) => ({ record: parseRecord(row) }));
}

/**
 * Get a session summary, combining stored session data with record counts.
 */
export function getSessionSummary(db: DatabaseSync, sessionKey: string): SessionSummary | null {
  const sessionRow = db
    .prepare(`SELECT * FROM meridia_sessions WHERE session_key = ?`)
    .get(sessionKey) as MeridiaSessionRow | undefined;

  const recordCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM meridia_records WHERE session_key = ?`)
      .get(sessionKey) as { cnt: number }
  ).cnt;

  if (!sessionRow && recordCount === 0) {
    return null;
  }

  // If no session row exists, build one from records
  if (!sessionRow) {
    const firstRecord = db
      .prepare(`SELECT ts FROM meridia_records WHERE session_key = ? ORDER BY ts ASC LIMIT 1`)
      .get(sessionKey) as { ts: string } | undefined;
    const lastRecord = db
      .prepare(`SELECT ts FROM meridia_records WHERE session_key = ? ORDER BY ts DESC LIMIT 1`)
      .get(sessionKey) as { ts: string } | undefined;
    const toolRows = db
      .prepare(`SELECT DISTINCT tool_name FROM meridia_records WHERE session_key = ?`)
      .all(sessionKey) as Array<{ tool_name: string }>;

    return {
      sessionKey,
      startedAt: firstRecord?.ts ?? null,
      endedAt: lastRecord?.ts ?? null,
      turnCount: recordCount,
      toolsUsed: toolRows.map((r) => r.tool_name),
      topics: [],
      emotionalArc: null,
      summary: null,
      recordCount,
    };
  }

  return {
    sessionKey: sessionRow.session_key,
    startedAt: sessionRow.started_at,
    endedAt: sessionRow.ended_at,
    turnCount: sessionRow.turn_count,
    toolsUsed: parseJsonArray(sessionRow.tools_used),
    topics: parseJsonArray(sessionRow.topics),
    emotionalArc: parseJson(sessionRow.emotional_arc),
    summary: sessionRow.summary,
    recordCount,
  };
}

/**
 * List all sessions with basic stats.
 */
export function listSessions(
  db: DatabaseSync,
  params?: { limit?: number; offset?: number },
): Array<{
  sessionKey: string;
  recordCount: number;
  firstTs: string | null;
  lastTs: string | null;
  hasSessionData: boolean;
}> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  const rows = db
    .prepare(`
    SELECT
      session_key,
      COUNT(*) as record_count,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts
    FROM meridia_records
    WHERE session_key IS NOT NULL
    GROUP BY session_key
    ORDER BY MAX(ts) DESC
    LIMIT ? OFFSET ?
  `)
    .all(limit, offset) as Array<{
    session_key: string;
    record_count: number;
    first_ts: string;
    last_ts: string;
  }>;

  return rows.map((row) => {
    const hasSession =
      db.prepare(`SELECT 1 FROM meridia_sessions WHERE session_key = ?`).get(row.session_key) !==
      undefined;

    return {
      sessionKey: row.session_key,
      recordCount: row.record_count,
      firstTs: row.first_ts,
      lastTs: row.last_ts,
      hasSessionData: hasSession,
    };
  });
}

/**
 * Get trace events for a session or date range.
 */
export function getTraceEvents(
  db: DatabaseSync,
  params: {
    sessionKey?: string;
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  },
): Array<{ event: MeridiaExperienceRecord extends never ? never : unknown; raw: MeridiaTraceRow }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.sessionKey) {
    conditions.push("session_key = ?");
    values.push(params.sessionKey);
  }
  if (params.type) {
    conditions.push("type = ?");
    values.push(params.type);
  }
  if (params.from) {
    conditions.push("ts >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("ts <= ?");
    values.push(params.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  const sql = `
    SELECT * FROM meridia_trace
    ${where}
    ORDER BY ts DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = db.prepare(sql).all(...values) as MeridiaTraceRow[];
  return rows.map((row) => ({
    event: parseJson(row.data_json),
    raw: row,
  }));
}

/**
 * Get aggregate statistics by tool name.
 */
export function getToolStats(db: DatabaseSync): Array<{
  toolName: string;
  count: number;
  avgScore: number;
  errorCount: number;
  lastUsed: string;
}> {
  const rows = db
    .prepare(`
    SELECT
      tool_name,
      COUNT(*) as cnt,
      AVG(score) as avg_score,
      SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count,
      MAX(ts) as last_used
    FROM meridia_records
    GROUP BY tool_name
    ORDER BY cnt DESC
  `)
    .all() as Array<{
    tool_name: string;
    cnt: number;
    avg_score: number;
    error_count: number;
    last_used: string;
  }>;

  return rows.map((row) => ({
    toolName: row.tool_name,
    count: row.cnt,
    avgScore: row.avg_score,
    errorCount: row.error_count,
    lastUsed: row.last_used,
  }));
}

/**
 * Get a single record by ID.
 */
export function getRecordById(db: DatabaseSync, id: string): RecordQueryResult | null {
  const row = db.prepare(`SELECT * FROM meridia_records WHERE id = ?`).get(id) as
    | MeridiaRecordRow
    | undefined;

  if (!row) return null;
  return { record: parseRecord(row) };
}
