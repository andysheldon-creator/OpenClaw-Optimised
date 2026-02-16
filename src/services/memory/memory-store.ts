/**
 * Memory Store — SQLite FTS5 database layer
 *
 * Provides a persistent, queryable store for structured facts extracted
 * from conversation history. Uses SQLite with FTS5 full-text search for
 * fast lexical recall.
 *
 * Schema:
 * - facts: core table of narrative, self-contained facts
 * - entities: known entities (people, places, projects, etc.)
 * - fact_entities: junction table linking facts to entities
 * - opinions: beliefs with confidence scores and evidence
 * - facts_fts: FTS5 virtual table for full-text search over facts
 *
 * Storage: ~/.clawdis/memory/memory.sqlite
 *
 * The database is always rebuildable from conversation history,
 * serving as a derived index rather than a source of truth.
 */

import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import Database from "better-sqlite3";

import { STATE_DIR_CLAWDIS } from "../../config/config.js";
import { defaultRuntime } from "../../runtime.js";

/** Fact types matching the memory.md design. */
export type FactType = "world" | "experience" | "opinion" | "observation";

/**
 * Source type for provenance tracking (FB-009).
 * Differentiates between user, web, skill, tool, and system sources.
 */
export type SourceType = "user" | "web" | "skill" | "tool" | "system" | "unknown";

/**
 * Default trust levels per source type.
 * User-provided data is most trusted; web-scraped data is least trusted.
 */
export const DEFAULT_TRUST_LEVELS: Record<SourceType, number> = {
  user: 1.0,
  system: 0.9,
  tool: 0.7,
  skill: 0.6,
  web: 0.3,
  unknown: 0.5,
};

/** A structured fact extracted from conversation. */
export type Fact = {
  id: number;
  sessionId: string;
  factType: FactType;
  content: string;
  timestamp: number;
  sourceDay: string;
  entities: string[];
  confidence?: number;
  /** Where the data came from (FB-009 provenance). */
  sourceType: SourceType;
  /** Trust level 0.0–1.0 (FB-009 provenance). */
  trustLevel: number;
};

/** An entity tracked across conversations. */
export type Entity = {
  id: number;
  slug: string;
  displayName: string;
  summary: string;
  lastUpdated: number;
};

/** An opinion with confidence tracking. */
export type Opinion = {
  id: number;
  entitySlug: string;
  statement: string;
  confidence: number;
  lastUpdated: number;
  supportingFactIds: number[];
  contradictingFactIds: number[];
};

/** Memory store directory. */
const MEMORY_DIR = path.join(STATE_DIR_CLAWDIS, "memory");

/** SQLite database path. */
const DB_PATH = path.join(MEMORY_DIR, "memory.sqlite");

/** Singleton database instance. */
let db: BetterSqlite3.Database | null = null;

/**
 * Get or create the SQLite database connection.
 * Initialises the schema on first use.
 */
export function getDb(): BetterSqlite3.Database {
  if (db) return db;

  // Ensure directory exists
  fs.mkdirSync(MEMORY_DIR, { recursive: true });

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  initSchema(db);

  defaultRuntime.log?.(`[memory-store] opened database at ${DB_PATH}`);
  return db;
}

/**
 * Create all tables and indexes if they don't exist.
 */
function initSchema(database: BetterSqlite3.Database): void {
  database.exec(`
    -- Core facts table
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      fact_type TEXT NOT NULL CHECK(fact_type IN ('world', 'experience', 'opinion', 'observation')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      source_day TEXT NOT NULL,
      confidence REAL,
      source_type TEXT NOT NULL DEFAULT 'unknown',
      trust_level REAL NOT NULL DEFAULT 0.5,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- FTS5 virtual table for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      content,
      content='facts',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
      INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
      INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
    END;

    -- Entities table
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      last_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    -- Junction: facts <-> entities
    CREATE TABLE IF NOT EXISTS fact_entities (
      fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      PRIMARY KEY (fact_id, entity_id)
    );

    -- Opinions with confidence tracking
    CREATE TABLE IF NOT EXISTS opinions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_slug TEXT NOT NULL,
      statement TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      last_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      supporting_fact_ids TEXT NOT NULL DEFAULT '[]',
      contradicting_fact_ids TEXT NOT NULL DEFAULT '[]'
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);
    CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(fact_type);
    CREATE INDEX IF NOT EXISTS idx_facts_timestamp ON facts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_facts_source_day ON facts(source_day);
    CREATE INDEX IF NOT EXISTS idx_fact_entities_entity ON fact_entities(entity_id);
    CREATE INDEX IF NOT EXISTS idx_opinions_entity ON opinions(entity_slug);
  `);

  // ── FB-009 migration: add source_type + trust_level to existing databases ──
  // SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we
  // check the table info first and only add missing columns.
  const columns = database
    .prepare("PRAGMA table_info(facts)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("source_type")) {
    database.exec(
      `ALTER TABLE facts ADD COLUMN source_type TEXT NOT NULL DEFAULT 'unknown'`,
    );
    defaultRuntime.log?.("[memory-store] migrated: added source_type column to facts");
  }
  if (!colNames.has("trust_level")) {
    database.exec(
      `ALTER TABLE facts ADD COLUMN trust_level REAL NOT NULL DEFAULT 0.5`,
    );
    defaultRuntime.log?.("[memory-store] migrated: added trust_level column to facts");
  }

  // Index for trust-weighted queries (FB-013 will use this)
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_facts_source_type ON facts(source_type);
    CREATE INDEX IF NOT EXISTS idx_facts_trust_level ON facts(trust_level);
  `);
}

// ─── Fact CRUD ───────────────────────────────────────────────────────────────

/**
 * Insert a fact and link it to entities.
 */
/** Entity reference: slug + optional human-readable display name. */
export type EntityRef = { slug: string; display?: string } | string;

/** Normalise an EntityRef to slug + display. */
function normaliseEntityRef(ref: EntityRef): {
  slug: string;
  display?: string;
} {
  return typeof ref === "string" ? { slug: ref } : ref;
}

export function insertFact(params: {
  sessionId: string;
  factType: FactType;
  content: string;
  timestamp: number;
  sourceDay: string;
  confidence?: number;
  entities?: EntityRef[];
  /** Source type for provenance tracking (FB-009). Defaults to 'unknown'. */
  sourceType?: SourceType;
  /** Trust level 0.0–1.0 for provenance (FB-009). Defaults by source type. */
  trustLevel?: number;
}): number {
  const database = getDb();

  const srcType: SourceType = params.sourceType ?? "unknown";
  const trust = params.trustLevel ?? DEFAULT_TRUST_LEVELS[srcType];

  const insert = database.prepare(`
    INSERT INTO facts (session_id, fact_type, content, timestamp, source_day, confidence, source_type, trust_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    params.sessionId,
    params.factType,
    params.content,
    params.timestamp,
    params.sourceDay,
    params.confidence ?? null,
    srcType,
    trust,
  );

  const factId = Number(result.lastInsertRowid);

  // Link entities
  if (params.entities && params.entities.length > 0) {
    for (const ref of params.entities) {
      const { slug, display } = normaliseEntityRef(ref);
      linkFactToEntity(factId, slug, display);
    }
  }

  return factId;
}

/**
 * Link a fact to an entity, creating the entity if it doesn't exist.
 * @param displayName - Human-readable name (falls back to slug if omitted).
 */
function linkFactToEntity(
  factId: number,
  entitySlug: string,
  displayName?: string,
): void {
  const database = getDb();

  // Upsert entity — update display_name if a better one is provided
  const name = displayName ?? entitySlug;
  database
    .prepare(
      `INSERT INTO entities (slug, display_name) VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET display_name = excluded.display_name
     WHERE length(excluded.display_name) > length(entities.display_name)`,
    )
    .run(entitySlug, name);

  // Get entity id
  const entity = database
    .prepare("SELECT id FROM entities WHERE slug = ?")
    .get(entitySlug) as { id: number } | undefined;

  if (entity) {
    database
      .prepare(
        `INSERT OR IGNORE INTO fact_entities (fact_id, entity_id) VALUES (?, ?)`,
      )
      .run(factId, entity.id);
  }
}

/**
 * Batch insert multiple facts in a transaction.
 */
export function insertFacts(
  facts: Array<{
    sessionId: string;
    factType: FactType;
    content: string;
    timestamp: number;
    sourceDay: string;
    confidence?: number;
    entities?: EntityRef[];
    sourceType?: SourceType;
    trustLevel?: number;
  }>,
): number[] {
  const database = getDb();
  const ids: number[] = [];

  const transaction = database.transaction(() => {
    for (const fact of facts) {
      ids.push(insertFact(fact));
    }
  });

  try {
    transaction();
  } catch (err) {
    defaultRuntime.log?.(`[memory-store] batch insert failed: ${String(err)}`);
    throw err;
  }

  return ids;
}

// ─── Full-Text Search ────────────────────────────────────────────────────────

/** Search result from FTS5. */
export type FtsResult = {
  factId: number;
  content: string;
  factType: FactType;
  sessionId: string;
  timestamp: number;
  sourceDay: string;
  rank: number;
  sourceType: SourceType;
  trustLevel: number;
};

/**
 * Full-text search over facts using FTS5.
 */
export function searchFts(query: string, limit = 20): FtsResult[] {
  const database = getDb();

  // Sanitise the FTS query: strip non-alphanumeric chars then wrap each
  // word in double quotes to prevent FTS5 operator injection (AND/OR/NOT/NEAR).
  const words = query
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const sanitised = words.map((w) => `"${w}"`).join(" ");

  const rows = database
    .prepare(
      `SELECT f.id as factId, f.content, f.fact_type as factType,
              f.session_id as sessionId, f.timestamp, f.source_day as sourceDay,
              f.source_type as sourceType, f.trust_level as trustLevel,
              rank
       FROM facts_fts fts
       JOIN facts f ON f.id = fts.rowid
       WHERE facts_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(sanitised, limit) as FtsResult[];

  return rows;
}

// ─── Entity Queries ──────────────────────────────────────────────────────────

/**
 * Get all facts related to an entity.
 */
export function getEntityFacts(entitySlug: string, limit = 50): Fact[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT f.id, f.session_id as sessionId, f.fact_type as factType,
              f.content, f.timestamp, f.source_day as sourceDay, f.confidence,
              f.source_type as sourceType, f.trust_level as trustLevel
       FROM facts f
       JOIN fact_entities fe ON fe.fact_id = f.id
       JOIN entities e ON e.id = fe.entity_id
       WHERE e.slug = ?
       ORDER BY f.timestamp DESC
       LIMIT ?`,
    )
    .all(entitySlug, limit) as Array<
    Omit<Fact, "entities"> & {
      sessionId: string;
      factType: FactType;
      sourceDay: string;
      sourceType: SourceType;
      trustLevel: number;
    }
  >;

  return rows.map((r) => ({
    ...r,
    entities: [entitySlug],
  }));
}

/**
 * Get an entity by its slug.
 */
export function getEntity(slug: string): Entity | undefined {
  const database = getDb();
  return database.prepare("SELECT * FROM entities WHERE slug = ?").get(slug) as
    | Entity
    | undefined;
}

/**
 * Get all known entities.
 */
export function getAllEntities(): Entity[] {
  const database = getDb();
  return database
    .prepare("SELECT * FROM entities ORDER BY last_updated DESC")
    .all() as Entity[];
}

/**
 * Update an entity's summary.
 */
export function updateEntitySummary(slug: string, summary: string): void {
  const database = getDb();
  database
    .prepare("UPDATE entities SET summary = ?, last_updated = ? WHERE slug = ?")
    .run(summary, Date.now(), slug);
}

// ─── Temporal Queries ────────────────────────────────────────────────────────

/**
 * Get facts within a time range.
 */
export function getFactsByTimeRange(
  startMs: number,
  endMs: number,
  limit = 50,
): Fact[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT f.id, f.session_id as sessionId, f.fact_type as factType,
              f.content, f.timestamp, f.source_day as sourceDay, f.confidence,
              f.source_type as sourceType, f.trust_level as trustLevel
       FROM facts f
       WHERE f.timestamp BETWEEN ? AND ?
       ORDER BY f.timestamp DESC
       LIMIT ?`,
    )
    .all(startMs, endMs, limit) as Array<Omit<Fact, "entities">>;

  return rows.map((r) => ({
    ...r,
    entities: getFactEntities(r.id),
  }));
}

/**
 * Get facts from a specific source day (YYYY-MM-DD).
 */
export function getFactsByDay(day: string, limit = 50): Fact[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT f.id, f.session_id as sessionId, f.fact_type as factType,
              f.content, f.timestamp, f.source_day as sourceDay, f.confidence,
              f.source_type as sourceType, f.trust_level as trustLevel
       FROM facts f
       WHERE f.source_day = ?
       ORDER BY f.timestamp DESC
       LIMIT ?`,
    )
    .all(day, limit) as Array<Omit<Fact, "entities">>;

  return rows.map((r) => ({
    ...r,
    entities: getFactEntities(r.id),
  }));
}

/**
 * Get entity slugs linked to a fact.
 */
function getFactEntities(factId: number): string[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT e.slug FROM entities e
       JOIN fact_entities fe ON fe.entity_id = e.id
       WHERE fe.fact_id = ?`,
    )
    .all(factId) as Array<{ slug: string }>;
  return rows.map((r) => r.slug);
}

// ─── Opinion CRUD ────────────────────────────────────────────────────────────

/**
 * Insert or update an opinion.
 */
export function upsertOpinion(params: {
  entitySlug: string;
  statement: string;
  confidence: number;
  supportingFactIds?: number[];
  contradictingFactIds?: number[];
}): number {
  const database = getDb();

  // Check if a similar opinion already exists for this entity
  const existing = database
    .prepare("SELECT id FROM opinions WHERE entity_slug = ? AND statement = ?")
    .get(params.entitySlug, params.statement) as { id: number } | undefined;

  if (existing) {
    database
      .prepare(
        `UPDATE opinions SET confidence = ?, last_updated = ?,
         supporting_fact_ids = ?, contradicting_fact_ids = ?
         WHERE id = ?`,
      )
      .run(
        params.confidence,
        Date.now(),
        JSON.stringify(params.supportingFactIds ?? []),
        JSON.stringify(params.contradictingFactIds ?? []),
        existing.id,
      );
    return existing.id;
  }

  const result = database
    .prepare(
      `INSERT INTO opinions (entity_slug, statement, confidence, supporting_fact_ids, contradicting_fact_ids)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      params.entitySlug,
      params.statement,
      params.confidence,
      JSON.stringify(params.supportingFactIds ?? []),
      JSON.stringify(params.contradictingFactIds ?? []),
    );

  return Number(result.lastInsertRowid);
}

/**
 * Get opinions about an entity.
 */
export function getEntityOpinions(entitySlug: string): Opinion[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT id, entity_slug as entitySlug, statement, confidence,
              last_updated as lastUpdated,
              supporting_fact_ids, contradicting_fact_ids
       FROM opinions
       WHERE entity_slug = ?
       ORDER BY confidence DESC`,
    )
    .all(entitySlug) as Array<{
    id: number;
    entitySlug: string;
    statement: string;
    confidence: number;
    lastUpdated: number;
    supporting_fact_ids: string;
    contradicting_fact_ids: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    entitySlug: r.entitySlug,
    statement: r.statement,
    confidence: r.confidence,
    lastUpdated: r.lastUpdated,
    supportingFactIds: JSON.parse(r.supporting_fact_ids) as number[],
    contradictingFactIds: JSON.parse(r.contradicting_fact_ids) as number[],
  }));
}

// ─── Stats & Maintenance ─────────────────────────────────────────────────────

/** Memory store statistics. */
export type MemoryStats = {
  factCount: number;
  entityCount: number;
  opinionCount: number;
  oldestFact: number | null;
  newestFact: number | null;
};

/**
 * Get memory store statistics.
 */
export function getMemoryStats(): MemoryStats {
  const database = getDb();

  const factCount = (
    database.prepare("SELECT COUNT(*) as count FROM facts").get() as {
      count: number;
    }
  ).count;

  const entityCount = (
    database.prepare("SELECT COUNT(*) as count FROM entities").get() as {
      count: number;
    }
  ).count;

  const opinionCount = (
    database.prepare("SELECT COUNT(*) as count FROM opinions").get() as {
      count: number;
    }
  ).count;

  const oldest = database
    .prepare("SELECT MIN(timestamp) as ts FROM facts")
    .get() as { ts: number | null };

  const newest = database
    .prepare("SELECT MAX(timestamp) as ts FROM facts")
    .get() as { ts: number | null };

  return {
    factCount,
    entityCount,
    opinionCount,
    oldestFact: oldest.ts,
    newestFact: newest.ts,
  };
}

/**
 * Check if a fact with identical content already exists (deduplication).
 * Checks across all sessions to avoid storing the same fact multiple times.
 */
export function factExists(content: string, _sessionId?: string): boolean {
  const database = getDb();
  const row = database
    .prepare("SELECT 1 FROM facts WHERE content = ? LIMIT 1")
    .get(content);
  return row !== undefined;
}

/**
 * Close the database connection. Call on shutdown.
 */
export function closeMemoryStore(): void {
  if (db) {
    db.close();
    db = null;
    defaultRuntime.log?.("[memory-store] database closed");
  }
}
