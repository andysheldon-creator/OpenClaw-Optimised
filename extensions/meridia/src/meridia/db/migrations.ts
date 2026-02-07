// Forward-only migration runner for Meridia SQLite schema.
// Migrations are applied in order; each is idempotent.

import type { DatabaseSync } from "node:sqlite";

export type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Migration 001: Baseline schema
// ────────────────────────────────────────────────────────────────────────────

function migration001Baseline(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_records (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      session_key TEXT,
      session_id TEXT,
      run_id TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      is_error INTEGER DEFAULT 0,
      score REAL,
      threshold REAL,
      eval_kind TEXT,
      eval_model TEXT,
      eval_reason TEXT,
      tags_json TEXT,
      data_json TEXT NOT NULL,
      data_text TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_meridia_records_ts ON meridia_records(ts);`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_meridia_records_session_key ON meridia_records(session_key);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_meridia_records_tool_name ON meridia_records(tool_name);`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meridia_records_score ON meridia_records(score);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meridia_records_kind ON meridia_records(kind);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_trace (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      session_key TEXT,
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meridia_trace_ts ON meridia_trace(ts);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meridia_trace_kind ON meridia_trace(kind);`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_meridia_trace_session_key ON meridia_trace(session_key);`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Migration 002: Vector support marker
// ────────────────────────────────────────────────────────────────────────────

function migration002Vector(db: DatabaseSync): void {
  // The actual vec0 virtual table is created at runtime when the extension loads.
  // This migration just marks that vector support has been prepared.
  db.prepare(
    `INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('vector_enabled', 'pending')`,
  ).run();
}

// ────────────────────────────────────────────────────────────────────────────
// Migration 003: Add phenomenology columns to meridia_records
// ────────────────────────────────────────────────────────────────────────────

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

function migration003Phenomenology(db: DatabaseSync): void {
  const cols = [
    { name: "emotional_primary", type: "TEXT" },
    { name: "emotional_intensity", type: "REAL" },
    { name: "emotional_valence", type: "REAL" },
    { name: "engagement_quality", type: "TEXT" },
    { name: "phenomenology_json", type: "TEXT" },
  ];
  for (const col of cols) {
    if (!columnExists(db, "meridia_records", col.name)) {
      db.exec(`ALTER TABLE meridia_records ADD COLUMN ${col.name} ${col.type}`);
    }
  }
  // Add indices for phenomenology queries
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_meridia_records_engagement ON meridia_records(engagement_quality);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_meridia_records_emotional_intensity ON meridia_records(emotional_intensity);`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Migration Registry
// ────────────────────────────────────────────────────────────────────────────

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "baseline", up: migration001Baseline },
  { version: 2, name: "add_vector", up: migration002Vector },
  { version: 3, name: "add_phenomenology", up: migration003Phenomenology },
];

// ────────────────────────────────────────────────────────────────────────────
// Migration Runner
// ────────────────────────────────────────────────────────────────────────────

/** Get current schema version from meridia_meta. Returns 0 if not set. */
export function getCurrentVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare(`SELECT value FROM meridia_meta WHERE key = 'schema_version'`).get() as
      | { value?: string }
      | undefined;
    const v = Number(row?.value);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Run all unapplied migrations in order. Returns list of applied migration names. */
export function runMigrations(db: DatabaseSync): { applied: string[]; current: number } {
  // Ensure meridia_meta exists (needed to track versions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meridia_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const currentVersion = getCurrentVersion(db);
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    migration.up(db);
    db.prepare(`INSERT OR REPLACE INTO meridia_meta (key, value) VALUES ('schema_version', ?)`).run(
      String(migration.version),
    );
    applied.push(migration.name);
  }

  return { applied, current: getCurrentVersion(db) };
}
