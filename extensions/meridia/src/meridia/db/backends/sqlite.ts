import type { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { MeridiaExperienceRecord, MeridiaTraceEvent } from "../../types.js";
import type {
  BackendHealthCheck,
  MeridiaDbBackend,
  MeridiaDbStats,
  MeridiaSessionListItem,
  MeridiaSessionSummary,
  MeridiaToolStatsItem,
  MeridiaTransaction,
  PoolStats,
  RecordQueryFilters,
  RecordQueryResult,
  TransactionOptions,
} from "../backend.js";
import { resolveMeridiaDir } from "../../paths.js";
import { runMigrations, getCurrentVersion } from "../migrations.js";

const require = createRequire(import.meta.url);

// Schema version managed by migrations.ts

// ────────────────────────────────────────────────────────────────────────────
// Database Helpers
// ────────────────────────────────────────────────────────────────────────────

function openDb(dbPath: string): DatabaseSync {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("node:sqlite") as typeof import("node:sqlite");
  const db = new mod.DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(name) as { name?: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

/** Set up FTS5 virtual table (try/catch for graceful degradation). */
function ensureFts(db: DatabaseSync): { ftsAvailable: boolean; ftsError?: string } {
  let ftsAvailable = false;
  let ftsError: string | undefined;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS meridia_records_fts USING fts5(
        tool_name,
        eval_reason,
        data_text,
        content=meridia_records,
        content_rowid=rowid
      );
    `);
    ftsAvailable = true;
  } catch (err) {
    ftsError = err instanceof Error ? err.message : String(err);
  }
  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

/** Create the vec0 virtual table for vector search. Requires sqlite-vec extension loaded. */
function ensureVecTable(
  db: DatabaseSync,
  dims: number,
): { vecAvailable: boolean; vecError?: string } {
  try {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS meridia_vec USING vec0(` +
        `record_id TEXT PRIMARY KEY, ` +
        `embedding float[${dims}]` +
        `);`,
    );
    return { vecAvailable: true };
  } catch (err) {
    return { vecAvailable: false, vecError: err instanceof Error ? err.message : String(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Text Helpers
// ────────────────────────────────────────────────────────────────────────────

function clampText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxChars - 12))}…(truncated)`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildSearchableText(record: MeridiaExperienceRecord): string {
  const parts: string[] = [];
  if (record.tool?.name) parts.push(record.tool.name);
  if (record.tool?.meta) parts.push(record.tool.meta);
  if (record.capture?.evaluation?.reason) parts.push(record.capture.evaluation.reason);
  if (record.content?.topic) parts.push(record.content.topic);
  if (record.content?.summary) parts.push(record.content.summary);
  if (record.content?.context) parts.push(record.content.context);
  if (record.content?.tags?.length) parts.push(record.content.tags.join(" "));
  if (record.content?.anchors?.length) parts.push(record.content.anchors.join(" "));
  // Phenomenology (V2 top-level + legacy content.phenomenology)
  const phenom = record.phenomenology ?? record.content?.phenomenology;
  if (phenom?.emotionalSignature?.primary?.length) {
    parts.push(phenom.emotionalSignature.primary.join(" "));
  }
  if (phenom?.engagementQuality) {
    parts.push(phenom.engagementQuality);
  }
  if (phenom?.anchors?.length) {
    parts.push(phenom.anchors.map((a) => a.phrase).join(" "));
  }
  if (phenom?.uncertainties?.length) {
    parts.push(phenom.uncertainties.join(" "));
  }
  if (record.data?.args !== undefined)
    parts.push(clampText(safeJsonStringify(record.data.args), 500));
  if (record.data?.result !== undefined) {
    parts.push(clampText(safeJsonStringify(record.data.result), 1000));
  }
  return parts.join(" ");
}

// ────────────────────────────────────────────────────────────────────────────
// Filter Helpers
// ────────────────────────────────────────────────────────────────────────────

function applyFilters(filters?: RecordQueryFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

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
  if (filters?.from) {
    conditions.push("r.ts >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    conditions.push("r.ts <= ?");
    params.push(filters.to);
  }
  if (filters?.tag) {
    conditions.push("r.tags_json LIKE ?");
    params.push(`%\"${filters.tag.replaceAll('"', "")}\"%`);
  }
  if (filters?.memoryType) {
    conditions.push("r.memory_type = ?");
    params.push(filters.memoryType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

function parseRecordJson(raw: string): MeridiaExperienceRecord {
  return JSON.parse(raw) as MeridiaExperienceRecord;
}

function parseTraceJson(raw: string): MeridiaTraceEvent {
  return JSON.parse(raw) as MeridiaTraceEvent;
}

// ────────────────────────────────────────────────────────────────────────────
// SQLite Transaction Implementation
// ────────────────────────────────────────────────────────────────────────────

class SqliteTransaction implements MeridiaTransaction {
  private db: DatabaseSync;
  private ftsAvailable: boolean;
  private committed = false;
  private rolledBack = false;

  constructor(db: DatabaseSync, ftsAvailable: boolean) {
    this.db = db;
    this.ftsAvailable = ftsAvailable;
  }

  private checkActive(): void {
    if (this.committed || this.rolledBack) {
      throw new Error("Transaction is no longer active");
    }
  }

  insertExperienceRecord(record: MeridiaExperienceRecord): boolean {
    this.checkActive();
    return insertRecordSync(this.db, record, this.ftsAvailable);
  }

  insertExperienceRecordsBatch(records: MeridiaExperienceRecord[]): number {
    this.checkActive();
    let inserted = 0;
    for (const record of records) {
      if (insertRecordSync(this.db, record, this.ftsAvailable)) {
        inserted++;
      }
    }
    return inserted;
  }

  insertTraceEvent(event: MeridiaTraceEvent): boolean {
    this.checkActive();
    return insertTraceSync(this.db, event);
  }

  insertTraceEventsBatch(events: MeridiaTraceEvent[]): number {
    this.checkActive();
    let inserted = 0;
    for (const event of events) {
      if (insertTraceSync(this.db, event)) {
        inserted++;
      }
    }
    return inserted;
  }

  setMeta(key: string, value: string): void {
    this.checkActive();
    this.db
      .prepare(`INSERT OR REPLACE INTO meridia_meta (key, value) VALUES (?, ?)`)
      .run(key, value);
  }

  async commit(): Promise<void> {
    this.checkActive();
    this.db.exec("COMMIT");
    this.committed = true;
  }

  async rollback(): Promise<void> {
    if (this.committed) {
      throw new Error("Cannot rollback a committed transaction");
    }
    if (!this.rolledBack) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      this.rolledBack = true;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sync Insert Helpers (used by both direct calls and transactions)
// ────────────────────────────────────────────────────────────────────────────

function insertRecordSync(
  db: DatabaseSync,
  record: MeridiaExperienceRecord,
  ftsAvailable: boolean,
): boolean {
  const dataJson = JSON.stringify(record);
  const dataText = buildSearchableText(record);
  const tagsJson = record.content?.tags?.length ? JSON.stringify(record.content.tags) : null;
  const evaluation = record.capture.evaluation;
  const classificationJson = record.classification ? JSON.stringify(record.classification) : null;

  // V2 phenomenology columns
  const phenom = record.phenomenology;
  const emotionalPrimary = phenom?.emotionalSignature?.primary?.join(",") ?? null;
  const emotionalIntensity = phenom?.emotionalSignature?.intensity ?? null;
  const emotionalValence = phenom?.emotionalSignature?.valence ?? null;
  const engagementQuality = phenom?.engagementQuality ?? null;
  const phenomenologyJson = phenom ? JSON.stringify(phenom) : null;

  const result = db
    .prepare(`
      INSERT OR IGNORE INTO meridia_records
        (id, ts, kind, session_key, session_id, run_id, tool_name, tool_call_id, is_error,
         score, threshold, eval_kind, eval_model, eval_reason, tags_json, data_json, data_text,
         memory_type, classification_json,
         emotional_primary, emotional_intensity, emotional_valence, engagement_quality, phenomenology_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      record.id,
      record.ts,
      record.kind,
      record.session?.key ?? null,
      record.session?.id ?? null,
      record.session?.runId ?? null,
      record.tool?.name ?? null,
      record.tool?.callId ?? null,
      record.tool?.isError ? 1 : 0,
      record.capture.score,
      record.capture.threshold ?? null,
      evaluation.kind,
      evaluation.model ?? null,
      evaluation.reason ?? null,
      tagsJson,
      dataJson,
      dataText,
      record.memoryType ?? null,
      classificationJson,
      emotionalPrimary,
      emotionalIntensity,
      emotionalValence,
      engagementQuality,
      phenomenologyJson,
    );

  const inserted = (result.changes ?? 0) > 0;
  if (inserted && ftsAvailable && tableExists(db, "meridia_records_fts")) {
    try {
      const row = db.prepare(`SELECT rowid FROM meridia_records WHERE id = ?`).get(record.id) as
        | { rowid: number }
        | undefined;
      if (row) {
        db.prepare(
          `INSERT INTO meridia_records_fts (rowid, tool_name, eval_reason, data_text) VALUES (?, ?, ?, ?)`,
        ).run(row.rowid, record.tool?.name ?? "", evaluation.reason ?? "", dataText);
      }
    } catch {
      // ignore FTS insert failures
    }
  }

  return inserted;
}

function insertTraceSync(db: DatabaseSync, event: MeridiaTraceEvent): boolean {
  const dataJson = JSON.stringify(event);
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO meridia_trace (id, ts, kind, session_key, data_json) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(event.id, event.ts, event.kind, event.session?.key ?? null, dataJson);
  return (result.changes ?? 0) > 0;
}

// ────────────────────────────────────────────────────────────────────────────
// SQLite Backend Implementation
// ────────────────────────────────────────────────────────────────────────────

export class SqliteBackend implements MeridiaDbBackend {
  readonly type = "sqlite" as const;

  private db: DatabaseSync | null = null;
  private ftsAvailable = false;
  private schemaVersion: string | null = null;
  private dbPath: string;
  private allowAutoWipe: boolean;
  private initCalled = false;
  vecAvailable = false;
  private embeddingDimensions = 384;

  constructor(params: { dbPath: string; allowAutoWipe?: boolean }) {
    this.dbPath = params.dbPath;
    this.allowAutoWipe = params.allowAutoWipe ?? true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initCalled && this.db) {
      return;
    }

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true, mode: 0o700 });

    this.db = openDb(this.dbPath);

    // Run forward-only migrations (replaces wipe-on-mismatch)
    const migrationResult = runMigrations(this.db);
    if (migrationResult.applied.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[meridia] Applied migrations: ${migrationResult.applied.join(", ")} (v${migrationResult.current})`,
      );
    }

    // Set up FTS (try/catch for graceful degradation)
    const ftsResult = ensureFts(this.db);
    this.ftsAvailable = ftsResult.ftsAvailable;

    this.schemaVersion = String(getCurrentVersion(this.db));
    this.initCalled = true;
  }

  async ensureSchema(): Promise<{ ftsAvailable: boolean; ftsError?: string }> {
    this.ensureDb();
    runMigrations(this.db!);
    const res = ensureFts(this.db!);
    this.ftsAvailable = res.ftsAvailable;
    this.schemaVersion = String(getCurrentVersion(this.db!));
    return res;
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
    this.initCalled = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Health & Monitoring
  // ──────────────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<BackendHealthCheck> {
    const start = performance.now();
    try {
      this.ensureDb();
      // Simple query to check database is responsive
      this.db!.prepare("SELECT 1").get();
      const latencyMs = performance.now() - start;
      return {
        status: "healthy",
        latencyMs,
        details: {
          dbPath: this.dbPath,
          ftsAvailable: this.ftsAvailable,
          schemaVersion: this.schemaVersion,
        },
      };
    } catch (err) {
      return {
        status: "unhealthy",
        latencyMs: performance.now() - start,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  getPoolStats(): PoolStats | null {
    // SQLite doesn't use connection pooling
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────────────────────────────────

  async beginTransaction(_options?: TransactionOptions): Promise<MeridiaTransaction> {
    this.ensureDb();
    this.db!.exec("BEGIN");
    return new SqliteTransaction(this.db!, this.ftsAvailable);
  }

  async withTransaction<T>(
    fn: (tx: MeridiaTransaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const tx = await this.beginTransaction(options);
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Record Operations
  // ──────────────────────────────────────────────────────────────────────────

  async insertExperienceRecord(record: MeridiaExperienceRecord): Promise<boolean> {
    this.ensureDb();
    return insertRecordSync(this.db!, record, this.ftsAvailable);
  }

  async insertExperienceRecordsBatch(records: MeridiaExperienceRecord[]): Promise<number> {
    if (records.length === 0) {
      return 0;
    }
    this.ensureDb();
    this.db!.exec("BEGIN");
    try {
      let inserted = 0;
      for (const record of records) {
        if (insertRecordSync(this.db!, record, this.ftsAvailable)) {
          inserted++;
        }
      }
      this.db!.exec("COMMIT");
      return inserted;
    } catch (err) {
      try {
        this.db!.exec("ROLLBACK");
      } catch {}
      throw err;
    }
  }

  async insertTraceEvent(event: MeridiaTraceEvent): Promise<boolean> {
    this.ensureDb();
    return insertTraceSync(this.db!, event);
  }

  async insertTraceEventsBatch(events: MeridiaTraceEvent[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }
    this.ensureDb();
    this.db!.exec("BEGIN");
    try {
      let inserted = 0;
      for (const event of events) {
        if (insertTraceSync(this.db!, event)) {
          inserted++;
        }
      }
      this.db!.exec("COMMIT");
      return inserted;
    } catch (err) {
      try {
        this.db!.exec("ROLLBACK");
      } catch {}
      throw err;
    }
  }

  async getRecordById(id: string): Promise<RecordQueryResult | null> {
    this.ensureDb();
    const row = this.db!.prepare(`SELECT data_json FROM meridia_records WHERE id = ?`).get(id) as
      | { data_json?: string }
      | undefined;
    if (!row?.data_json) {
      return null;
    }
    return { record: parseRecordJson(row.data_json) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Query Operations
  // ──────────────────────────────────────────────────────────────────────────

  async searchRecords(query: string, filters?: RecordQueryFilters): Promise<RecordQueryResult[]> {
    this.ensureDb();
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 100);
    const { where, params } = applyFilters(filters);
    const hasFts = this.ftsAvailable && tableExists(this.db!, "meridia_records_fts");

    if (hasFts) {
      // Quote the query to prevent FTS5 column-prefix syntax (e.g. "sk-live-..." → column:live)
      const ftsQuery = `"${trimmed.replaceAll('"', '""')}"`;
      try {
        const rows = this.db!.prepare(
          `
            SELECT r.data_json AS data_json, bm25(meridia_records_fts) AS rank
            FROM meridia_records_fts
            JOIN meridia_records r ON meridia_records_fts.rowid = r.rowid
            ${where ? `${where} AND meridia_records_fts MATCH ?` : "WHERE meridia_records_fts MATCH ?"}
            ORDER BY rank ASC
            LIMIT ${limit}
          `,
        ).all(...params, ftsQuery) as Array<{ data_json: string; rank: number }>;

        return rows.map((row) => ({ record: parseRecordJson(row.data_json), rank: row.rank }));
      } catch {
        // FTS query failed (e.g. syntax issue); fall through to LIKE search
      }
    }

    const like = `%${trimmed}%`;
    const rows = this.db!.prepare(
      `
        SELECT r.data_json AS data_json
        FROM meridia_records r
        ${where ? `${where} AND (r.data_text LIKE ? OR r.eval_reason LIKE ?)` : "WHERE (r.data_text LIKE ? OR r.eval_reason LIKE ?)"}
        ORDER BY r.ts DESC
        LIMIT ${limit}
      `,
    ).all(...params, like, like) as Array<{ data_json: string }>;
    return rows.map((row) => ({ record: parseRecordJson(row.data_json) }));
  }

  async getRecordsByDateRange(
    from: string,
    to: string,
    filters?: RecordQueryFilters,
  ): Promise<RecordQueryResult[]> {
    this.ensureDb();
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 500);
    const merged: RecordQueryFilters = { ...filters, from, to, limit };
    const { where, params } = applyFilters(merged);
    const rows = this.db!.prepare(
      `
        SELECT r.data_json AS data_json
        FROM meridia_records r
        ${where}
        ORDER BY r.ts DESC
        LIMIT ${limit}
      `,
    ).all(...params) as Array<{ data_json: string }>;
    return rows.map((row) => ({ record: parseRecordJson(row.data_json) }));
  }

  async getRecordsBySession(
    sessionKey: string,
    params?: { limit?: number },
  ): Promise<RecordQueryResult[]> {
    this.ensureDb();
    const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
    const rows = this.db!.prepare(
      `
        SELECT r.data_json AS data_json
        FROM meridia_records r
        WHERE r.session_key = ?
        ORDER BY r.ts DESC
        LIMIT ${limit}
      `,
    ).all(sessionKey) as Array<{ data_json: string }>;
    return rows.map((row) => ({ record: parseRecordJson(row.data_json) }));
  }

  async getRecordsByTool(
    toolName: string,
    params?: { limit?: number },
  ): Promise<RecordQueryResult[]> {
    this.ensureDb();
    const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
    const rows = this.db!.prepare(
      `
        SELECT r.data_json AS data_json
        FROM meridia_records r
        WHERE r.tool_name = ?
        ORDER BY r.ts DESC
        LIMIT ${limit}
      `,
    ).all(toolName) as Array<{ data_json: string }>;
    return rows.map((row) => ({ record: parseRecordJson(row.data_json) }));
  }

  async getRecentRecords(
    limit: number = 20,
    filters?: Omit<RecordQueryFilters, "limit">,
  ): Promise<RecordQueryResult[]> {
    this.ensureDb();
    const resolved = Math.min(Math.max(limit, 1), 200);
    const { where, params } = applyFilters({ ...filters, limit: resolved });
    const rows = this.db!.prepare(
      `
        SELECT r.data_json AS data_json
        FROM meridia_records r
        ${where}
        ORDER BY r.ts DESC
        LIMIT ${resolved}
      `,
    ).all(...params) as Array<{ data_json: string }>;
    return rows.map((row) => ({ record: parseRecordJson(row.data_json) }));
  }

  async getTraceEventsByDateRange(
    from: string,
    to: string,
    params?: { kind?: string; limit?: number },
  ): Promise<MeridiaTraceEvent[]> {
    this.ensureDb();
    const limit = Math.min(Math.max(params?.limit ?? 2000, 1), 50_000);
    const kind = params?.kind?.trim();
    const rows = kind
      ? (this.db!.prepare(
          `
            SELECT data_json
            FROM meridia_trace
            WHERE ts >= ? AND ts <= ? AND kind = ?
            ORDER BY ts DESC
            LIMIT ${limit}
          `,
        ).all(from, to, kind) as Array<{ data_json: string }>)
      : (this.db!.prepare(
          `
            SELECT data_json
            FROM meridia_trace
            WHERE ts >= ? AND ts <= ?
            ORDER BY ts DESC
            LIMIT ${limit}
          `,
        ).all(from, to) as Array<{ data_json: string }>);
    return rows.map((row) => parseTraceJson(row.data_json));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stats & Metadata
  // ──────────────────────────────────────────────────────────────────────────

  async getStats(): Promise<MeridiaDbStats> {
    this.ensureDb();
    const recordCount = (
      this.db!.prepare(`SELECT COUNT(*) AS cnt FROM meridia_records`).get() as { cnt: number }
    ).cnt;
    const traceCount = (
      this.db!.prepare(`SELECT COUNT(*) AS cnt FROM meridia_trace`).get() as { cnt: number }
    ).cnt;
    const sessionCount = (
      this.db!.prepare(
        `SELECT COUNT(DISTINCT session_key) AS cnt FROM meridia_records WHERE session_key IS NOT NULL`,
      ).get() as { cnt: number }
    ).cnt;
    const oldest = this.db!.prepare(`SELECT MIN(ts) AS ts FROM meridia_records`).get() as {
      ts: string | null;
    };
    const newest = this.db!.prepare(`SELECT MAX(ts) AS ts FROM meridia_records`).get() as {
      ts: string | null;
    };
    return {
      recordCount,
      traceCount,
      sessionCount,
      oldestRecord: oldest.ts,
      newestRecord: newest.ts,
      schemaVersion: this.schemaVersion,
    };
  }

  async getToolStats(): Promise<MeridiaToolStatsItem[]> {
    this.ensureDb();
    const rows = this.db!.prepare(`
        SELECT
          tool_name,
          COUNT(*) as cnt,
          AVG(score) as avg_score,
          SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count,
          MAX(ts) as last_used
        FROM meridia_records
        WHERE tool_name IS NOT NULL
        GROUP BY tool_name
        ORDER BY cnt DESC
      `).all() as Array<{
      tool_name: string;
      cnt: number;
      avg_score: number | null;
      error_count: number;
      last_used: string;
    }>;

    return rows.map((row) => ({
      toolName: row.tool_name,
      count: row.cnt,
      avgScore: row.avg_score ?? 0,
      errorCount: row.error_count,
      lastUsed: row.last_used,
    }));
  }

  async listSessions(params?: {
    limit?: number;
    offset?: number;
  }): Promise<MeridiaSessionListItem[]> {
    this.ensureDb();
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const rows = this.db!.prepare(
      `
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
      `,
    ).all(limit, offset) as Array<{
      session_key: string;
      record_count: number;
      first_ts: string | null;
      last_ts: string | null;
    }>;
    return rows.map((row) => ({
      sessionKey: row.session_key,
      recordCount: row.record_count,
      firstTs: row.first_ts,
      lastTs: row.last_ts,
    }));
  }

  async getSessionSummary(sessionKey: string): Promise<MeridiaSessionSummary | null> {
    this.ensureDb();
    const recordCount = (
      this.db!.prepare(`SELECT COUNT(*) as cnt FROM meridia_records WHERE session_key = ?`).get(
        sessionKey,
      ) as { cnt: number }
    ).cnt;

    if (recordCount === 0) {
      return null;
    }

    const firstRecord = this.db!.prepare(
      `SELECT ts FROM meridia_records WHERE session_key = ? ORDER BY ts ASC LIMIT 1`,
    ).get(sessionKey) as { ts: string } | undefined;
    const lastRecord = this.db!.prepare(
      `SELECT ts FROM meridia_records WHERE session_key = ? ORDER BY ts DESC LIMIT 1`,
    ).get(sessionKey) as { ts: string } | undefined;
    const toolRows = this.db!.prepare(
      `SELECT DISTINCT tool_name FROM meridia_records WHERE session_key = ? AND tool_name IS NOT NULL`,
    ).all(sessionKey) as Array<{ tool_name: string }>;

    return {
      sessionKey,
      startedAt: firstRecord?.ts ?? null,
      endedAt: lastRecord?.ts ?? null,
      toolsUsed: toolRows.map((r) => r.tool_name).filter(Boolean),
      recordCount,
    };
  }

  async getMeta(key: string): Promise<string | null> {
    this.ensureDb();
    try {
      const row = this.db!.prepare(`SELECT value FROM meridia_meta WHERE key = ?`).get(key) as
        | { value?: string }
        | undefined;
      return typeof row?.value === "string" ? row.value : null;
    } catch {
      return null;
    }
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.ensureDb();
    this.db!.prepare(`INSERT OR REPLACE INTO meridia_meta (key, value) VALUES (?, ?)`).run(
      key,
      value,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Vector Operations
  // ──────────────────────────────────────────────────────────────────────────

  /** Load the sqlite-vec extension and create the vec0 virtual table. */
  async loadVectorExtension(extensionPath?: string): Promise<{ ok: boolean; error?: string }> {
    this.ensureDb();
    try {
      const { loadSqliteVecExtension } = await import(
        /* webpackIgnore: true */ "../../../../../../src/memory/sqlite-vec.js"
      );
      const loadResult = await loadSqliteVecExtension({
        db: this.db!,
        extensionPath,
      });
      if (!loadResult.ok) {
        return { ok: false, error: loadResult.error };
      }
      const vecResult = ensureVecTable(this.db!, this.embeddingDimensions);
      this.vecAvailable = vecResult.vecAvailable;
      if (vecResult.vecAvailable) {
        this.db!.prepare(
          `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('vector_enabled', 'true')`,
        ).run();
      }
      return { ok: this.vecAvailable, error: vecResult.vecError };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Insert an embedding vector for a record. */
  async insertEmbedding(recordId: string, embedding: Float32Array): Promise<boolean> {
    if (!this.vecAvailable) return false;
    this.ensureDb();
    try {
      // vec0 doesn't support upsert; delete-then-insert
      this.db!.prepare(`DELETE FROM meridia_vec WHERE record_id = ?`).run(recordId);
      this.db!.prepare(`INSERT INTO meridia_vec (record_id, embedding) VALUES (?, ?)`).run(
        recordId,
        embedding,
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Search using vector similarity. Returns record IDs ranked by distance. */
  async searchByVector(
    embedding: Float32Array,
    limit: number = 20,
  ): Promise<Array<{ recordId: string; distance: number }>> {
    if (!this.vecAvailable) return [];
    this.ensureDb();
    try {
      const rows = this.db!.prepare(
        `SELECT v.record_id, v.distance
           FROM meridia_vec v
           WHERE v.embedding MATCH ?
           ORDER BY v.distance ASC
           LIMIT ?`,
      ).all(embedding, limit) as Array<{ record_id: string; distance: number }>;
      return rows.map((r) => ({ recordId: r.record_id, distance: r.distance }));
    } catch {
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private ensureDb(): asserts this is { db: DatabaseSync } {
    if (!this.db) {
      throw new Error("SQLite backend not initialized. Call init() first.");
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ────────────────────────────────────────────────────────────────────────────

export function createSqliteBackend(params: {
  dbPath: string;
  allowAutoWipe?: boolean;
}): SqliteBackend {
  return new SqliteBackend(params);
}

export function resolveMeridiaDbPath(params?: {
  cfg?: OpenClawConfig;
  hookKey?: string;
  dbPathOverride?: string;
}): string {
  if (params?.dbPathOverride) {
    return params.dbPathOverride;
  }
  const meridiaDir = resolveMeridiaDir(params?.cfg, params?.hookKey);
  return path.join(meridiaDir, "meridia.sqlite");
}
