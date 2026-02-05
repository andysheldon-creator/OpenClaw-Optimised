/**
 * BuiltinSqliteStore — encapsulates all direct SQLite/SQL operations for the
 * builtin memory index. The MemoryIndexManager delegates storage to this class
 * so that SQL concerns stay out of the orchestration layer.
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MemorySource } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import { ensureDir, parseEmbedding } from "./internal.js";
import { ensureMemoryIndexSchema } from "./memory-schema.js";
import { loadSqliteVecExtension } from "./sqlite-vec.js";
import { requireNodeSqlite } from "./sqlite.js";

const log = createSubsystemLogger("memory");

const VECTOR_TABLE = "chunks_vec";
const FTS_TABLE = "chunks_fts";
const EMBEDDING_CACHE_TABLE = "embedding_cache";
const META_KEY = "memory_index_meta_v1";
const VECTOR_LOAD_TIMEOUT_MS = 30_000;

export type MemoryIndexMeta = {
  model: string;
  provider: string;
  providerKey?: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
};

export type BuiltinSqliteStoreOptions = {
  dbPath: string;
  vectorEnabled: boolean;
  vectorExtensionPath?: string;
  ftsEnabled: boolean;
  cacheEnabled: boolean;
  cacheMaxEntries?: number;
  sources: Set<MemorySource>;
};

export type SourceFilter = { sql: string; params: MemorySource[] };

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

export class BuiltinSqliteStore {
  private _db: DatabaseSync;
  readonly dbPath: string;
  private readonly sources: Set<MemorySource>;
  private vectorReady: Promise<boolean> | null = null;
  readonly vector: {
    enabled: boolean;
    available: boolean | null;
    extensionPath?: string;
    loadError?: string;
    dims?: number;
  };
  readonly fts: {
    enabled: boolean;
    available: boolean;
    loadError?: string;
  };
  readonly cache: { enabled: boolean; maxEntries?: number };

  constructor(options: BuiltinSqliteStoreOptions) {
    this.dbPath = options.dbPath;
    this.sources = options.sources;
    this.vector = {
      enabled: options.vectorEnabled,
      available: null,
      extensionPath: options.vectorExtensionPath,
    };
    this.fts = { enabled: options.ftsEnabled, available: false };
    this.cache = {
      enabled: options.cacheEnabled,
      maxEntries: options.cacheMaxEntries,
    };
    this._db = this.openDatabaseAtPath(resolveUserPath(this.dbPath));
    this.runSchema();
  }

  /** Expose the underlying DatabaseSync for manager-search.ts compatibility. */
  get db(): DatabaseSync {
    return this._db;
  }

  // ─── Database lifecycle ───────────────────────────────────────────────

  openDatabaseAtPath(dbPath: string): DatabaseSync {
    const dir = path.dirname(dbPath);
    ensureDir(dir);
    const { DatabaseSync } = requireNodeSqlite();
    return new DatabaseSync(dbPath, { allowExtension: this.vector.enabled });
  }

  /** Replace internal DB handle (used during safe reindex). */
  replaceDb(db: DatabaseSync): void {
    this._db = db;
  }

  closeDb(): void {
    this._db.close();
  }

  // ─── Schema ───────────────────────────────────────────────────────────

  runSchema(): void {
    const result = ensureMemoryIndexSchema({
      db: this._db,
      embeddingCacheTable: EMBEDDING_CACHE_TABLE,
      ftsTable: FTS_TABLE,
      ftsEnabled: this.fts.enabled,
    });
    this.fts.available = result.ftsAvailable;
    if (result.ftsError) {
      this.fts.loadError = result.ftsError;
      log.warn(`fts unavailable: ${result.ftsError}`);
    }
  }

  // ─── Meta CRUD ────────────────────────────────────────────────────────

  readMeta(): MemoryIndexMeta | null {
    const row = this._db.prepare(`SELECT value FROM meta WHERE key = ?`).get(META_KEY) as
      | { value: string }
      | undefined;
    if (!row?.value) {
      return null;
    }
    try {
      return JSON.parse(row.value) as MemoryIndexMeta;
    } catch {
      return null;
    }
  }

  writeMeta(meta: MemoryIndexMeta): void {
    const value = JSON.stringify(meta);
    this._db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
      .run(META_KEY, value);
  }

  // ─── Source filter builder ────────────────────────────────────────────

  buildSourceFilter(alias?: string): SourceFilter {
    const sources = Array.from(this.sources);
    if (sources.length === 0) {
      return { sql: "", params: [] };
    }
    const column = alias ? `${alias}.source` : "source";
    const placeholders = sources.map(() => "?").join(", ");
    return { sql: ` AND ${column} IN (${placeholders})`, params: sources };
  }

  // ─── File record queries ──────────────────────────────────────────────

  getFileHash(filePath: string, source: MemorySource): string | undefined {
    const record = this._db
      .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
      .get(filePath, source) as { hash: string } | undefined;
    return record?.hash;
  }

  upsertFile(entry: {
    path: string;
    source: MemorySource;
    hash: string;
    mtimeMs: number;
    size: number;
  }): void {
    this._db
      .prepare(
        `INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           source=excluded.source,
           hash=excluded.hash,
           mtime=excluded.mtime,
           size=excluded.size`,
      )
      .run(entry.path, entry.source, entry.hash, entry.mtimeMs, entry.size);
  }

  listFilePaths(source: MemorySource): string[] {
    const rows = this._db.prepare(`SELECT path FROM files WHERE source = ?`).all(source) as Array<{
      path: string;
    }>;
    return rows.map((r) => r.path);
  }

  deleteFile(filePath: string, source: MemorySource): void {
    this._db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(filePath, source);
  }

  /** Cascading delete: removes vectors, FTS entries, chunks, and file record for a path+source. */
  deleteStaleFile(filePath: string, source: MemorySource, model: string): void {
    this.deleteVectorsForFile(filePath, source);
    this.deleteFtsForFile(filePath, source, model);
    this.deleteChunksForFile(filePath, source);
    this.deleteFile(filePath, source);
  }

  // ─── Chunk CRUD ───────────────────────────────────────────────────────

  insertChunk(params: {
    id: string;
    path: string;
    source: MemorySource;
    startLine: number;
    endLine: number;
    hash: string;
    model: string;
    text: string;
    embedding: number[];
    updatedAt: number;
  }): void {
    this._db
      .prepare(
        `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           hash=excluded.hash,
           model=excluded.model,
           text=excluded.text,
           embedding=excluded.embedding,
           updated_at=excluded.updated_at`,
      )
      .run(
        params.id,
        params.path,
        params.source,
        params.startLine,
        params.endLine,
        params.hash,
        params.model,
        params.text,
        JSON.stringify(params.embedding),
        params.updatedAt,
      );
  }

  deleteChunksForFile(filePath: string, source: MemorySource): void {
    this._db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(filePath, source);
  }

  // ─── Vector table management ──────────────────────────────────────────

  async ensureVectorReady(dimensions?: number): Promise<boolean> {
    if (!this.vector.enabled) {
      return false;
    }
    if (!this.vectorReady) {
      this.vectorReady = this.withTimeout(
        this.loadVectorExtension(),
        VECTOR_LOAD_TIMEOUT_MS,
        `sqlite-vec load timed out after ${Math.round(VECTOR_LOAD_TIMEOUT_MS / 1000)}s`,
      );
    }
    let ready = false;
    try {
      ready = await this.vectorReady;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.vector.available = false;
      this.vector.loadError = message;
      this.vectorReady = null;
      log.warn(`sqlite-vec unavailable: ${message}`);
      return false;
    }
    if (ready && typeof dimensions === "number" && dimensions > 0) {
      this.ensureVectorTable(dimensions);
    }
    return ready;
  }

  private async loadVectorExtension(): Promise<boolean> {
    if (this.vector.available !== null) {
      return this.vector.available;
    }
    if (!this.vector.enabled) {
      this.vector.available = false;
      return false;
    }
    try {
      const resolvedPath = this.vector.extensionPath?.trim()
        ? resolveUserPath(this.vector.extensionPath)
        : undefined;
      const loaded = await loadSqliteVecExtension({ db: this._db, extensionPath: resolvedPath });
      if (!loaded.ok) {
        throw new Error(loaded.error ?? "unknown sqlite-vec load error");
      }
      this.vector.extensionPath = loaded.extensionPath;
      this.vector.available = true;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.vector.available = false;
      this.vector.loadError = message;
      log.warn(`sqlite-vec unavailable: ${message}`);
      return false;
    }
  }

  ensureVectorTable(dimensions: number): void {
    if (this.vector.dims === dimensions) {
      return;
    }
    if (this.vector.dims && this.vector.dims !== dimensions) {
      this.dropVectorTable();
    }
    this._db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE} USING vec0(\n` +
        `  id TEXT PRIMARY KEY,\n` +
        `  embedding FLOAT[${dimensions}]\n` +
        `)`,
    );
    this.vector.dims = dimensions;
  }

  dropVectorTable(): void {
    try {
      this._db.exec(`DROP TABLE IF EXISTS ${VECTOR_TABLE}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(`Failed to drop ${VECTOR_TABLE}: ${message}`);
    }
  }

  insertVector(id: string, embedding: number[]): void {
    try {
      this._db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE id = ?`).run(id);
    } catch {
      // ignore — row may not exist
    }
    this._db
      .prepare(`INSERT INTO ${VECTOR_TABLE} (id, embedding) VALUES (?, ?)`)
      .run(id, vectorToBlob(embedding));
  }

  deleteVectorsForFile(filePath: string, source: MemorySource): void {
    try {
      this._db
        .prepare(
          `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`,
        )
        .run(filePath, source);
    } catch {
      // ignore — vector table may not exist yet
    }
  }

  // ─── FTS operations ───────────────────────────────────────────────────

  insertFts(params: {
    text: string;
    id: string;
    path: string;
    source: MemorySource;
    model: string;
    startLine: number;
    endLine: number;
  }): void {
    if (!this.fts.enabled || !this.fts.available) {
      return;
    }
    this._db
      .prepare(
        `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line)\n` +
          ` VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.text,
        params.id,
        params.path,
        params.source,
        params.model,
        params.startLine,
        params.endLine,
      );
  }

  deleteFtsForFile(filePath: string, source: MemorySource, model: string): void {
    if (!this.fts.enabled || !this.fts.available) {
      return;
    }
    try {
      this._db
        .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
        .run(filePath, source, model);
    } catch {
      // ignore
    }
  }

  // ─── Embedding cache ──────────────────────────────────────────────────

  loadEmbeddingCache(params: {
    hashes: string[];
    providerId: string;
    providerModel: string;
    providerKey: string;
  }): Map<string, number[]> {
    if (!this.cache.enabled) {
      return new Map();
    }
    if (params.hashes.length === 0) {
      return new Map();
    }
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const hash of params.hashes) {
      if (!hash || seen.has(hash)) {
        continue;
      }
      seen.add(hash);
      unique.push(hash);
    }
    if (unique.length === 0) {
      return new Map();
    }

    const out = new Map<string, number[]>();
    const baseParams = [params.providerId, params.providerModel, params.providerKey];
    const batchSize = 400;
    for (let start = 0; start < unique.length; start += batchSize) {
      const batch = unique.slice(start, start + batchSize);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this._db
        .prepare(
          `SELECT hash, embedding FROM ${EMBEDDING_CACHE_TABLE}\n` +
            ` WHERE provider = ? AND model = ? AND provider_key = ? AND hash IN (${placeholders})`,
        )
        .all(...baseParams, ...batch) as Array<{ hash: string; embedding: string }>;
      for (const row of rows) {
        out.set(row.hash, parseEmbedding(row.embedding));
      }
    }
    return out;
  }

  upsertEmbeddingCache(params: {
    entries: Array<{ hash: string; embedding: number[] }>;
    providerId: string;
    providerModel: string;
    providerKey: string;
  }): void {
    if (!this.cache.enabled || params.entries.length === 0) {
      return;
    }
    const now = Date.now();
    const stmt = this._db.prepare(
      `INSERT INTO ${EMBEDDING_CACHE_TABLE} (provider, model, provider_key, hash, embedding, dims, updated_at)\n` +
        ` VALUES (?, ?, ?, ?, ?, ?, ?)\n` +
        ` ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET\n` +
        `   embedding=excluded.embedding,\n` +
        `   dims=excluded.dims,\n` +
        `   updated_at=excluded.updated_at`,
    );
    for (const entry of params.entries) {
      const embedding = entry.embedding ?? [];
      stmt.run(
        params.providerId,
        params.providerModel,
        params.providerKey,
        entry.hash,
        JSON.stringify(embedding),
        embedding.length,
        now,
      );
    }
  }

  pruneEmbeddingCacheIfNeeded(): void {
    if (!this.cache.enabled) {
      return;
    }
    const max = this.cache.maxEntries;
    if (!max || max <= 0) {
      return;
    }
    const row = this._db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get() as
      | { c: number }
      | undefined;
    const count = row?.c ?? 0;
    if (count <= max) {
      return;
    }
    const excess = count - max;
    this._db
      .prepare(
        `DELETE FROM ${EMBEDDING_CACHE_TABLE}\n` +
          ` WHERE rowid IN (\n` +
          `   SELECT rowid FROM ${EMBEDDING_CACHE_TABLE}\n` +
          `   ORDER BY updated_at ASC\n` +
          `   LIMIT ?\n` +
          ` )`,
      )
      .run(excess);
  }

  seedEmbeddingCache(sourceDb: DatabaseSync): void {
    if (!this.cache.enabled) {
      return;
    }
    try {
      const rows = sourceDb
        .prepare(
          `SELECT provider, model, provider_key, hash, embedding, dims, updated_at FROM ${EMBEDDING_CACHE_TABLE}`,
        )
        .all() as Array<{
        provider: string;
        model: string;
        provider_key: string;
        hash: string;
        embedding: string;
        dims: number | null;
        updated_at: number;
      }>;
      if (!rows.length) {
        return;
      }
      const insert = this._db.prepare(
        `INSERT INTO ${EMBEDDING_CACHE_TABLE} (provider, model, provider_key, hash, embedding, dims, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET
           embedding=excluded.embedding,
           dims=excluded.dims,
           updated_at=excluded.updated_at`,
      );
      this._db.exec("BEGIN");
      for (const row of rows) {
        insert.run(
          row.provider,
          row.model,
          row.provider_key,
          row.hash,
          row.embedding,
          row.dims,
          row.updated_at,
        );
      }
      this._db.exec("COMMIT");
    } catch (err) {
      try {
        this._db.exec("ROLLBACK");
      } catch {}
      throw err;
    }
  }

  // ─── Status count queries ─────────────────────────────────────────────

  countFiles(sourceFilter: SourceFilter): number {
    const row = this._db
      .prepare(`SELECT COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number };
    return row?.c ?? 0;
  }

  countChunks(sourceFilter: SourceFilter): number {
    const row = this._db
      .prepare(`SELECT COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number };
    return row?.c ?? 0;
  }

  countCacheEntries(): number {
    const row = this._db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get() as
      | { c: number }
      | undefined;
    return row?.c ?? 0;
  }

  sourceBreakdown(
    sources: MemorySource[],
    sourceFilter: SourceFilter,
  ): Array<{ source: MemorySource; files: number; chunks: number }> {
    if (sources.length === 0) {
      return [];
    }
    const bySource = new Map<MemorySource, { files: number; chunks: number }>();
    for (const source of sources) {
      bySource.set(source, { files: 0, chunks: 0 });
    }
    const fileRows = this._db
      .prepare(
        `SELECT source, COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql} GROUP BY source`,
      )
      .all(...sourceFilter.params) as Array<{ source: MemorySource; c: number }>;
    for (const row of fileRows) {
      const entry = bySource.get(row.source) ?? { files: 0, chunks: 0 };
      entry.files = row.c ?? 0;
      bySource.set(row.source, entry);
    }
    const chunkRows = this._db
      .prepare(
        `SELECT source, COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql} GROUP BY source`,
      )
      .all(...sourceFilter.params) as Array<{ source: MemorySource; c: number }>;
    for (const row of chunkRows) {
      const entry = bySource.get(row.source) ?? { files: 0, chunks: 0 };
      entry.chunks = row.c ?? 0;
      bySource.set(row.source, entry);
    }
    return sources.map((source) => Object.assign({ source }, bySource.get(source)!));
  }

  // ─── Index file swap (atomic reindex) ─────────────────────────────────

  async swapIndexFiles(targetPath: string, tempPath: string): Promise<void> {
    const backupPath = `${targetPath}.backup-${randomUUID()}`;
    await this.moveIndexFiles(targetPath, backupPath);
    try {
      await this.moveIndexFiles(tempPath, targetPath);
    } catch (err) {
      await this.moveIndexFiles(backupPath, targetPath);
      throw err;
    }
    await this.removeIndexFiles(backupPath);
  }

  async moveIndexFiles(sourceBase: string, targetBase: string): Promise<void> {
    const suffixes = ["", "-wal", "-shm"];
    for (const suffix of suffixes) {
      const source = `${sourceBase}${suffix}`;
      const target = `${targetBase}${suffix}`;
      try {
        await fs.rename(source, target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    }
  }

  async removeIndexFiles(basePath: string): Promise<void> {
    const suffixes = ["", "-wal", "-shm"];
    await Promise.all(suffixes.map((suffix) => fs.rm(`${basePath}${suffix}`, { force: true })));
  }

  // ─── Reset index ──────────────────────────────────────────────────────

  resetIndex(): void {
    this._db.exec(`DELETE FROM files`);
    this._db.exec(`DELETE FROM chunks`);
    if (this.fts.enabled && this.fts.available) {
      try {
        this._db.exec(`DELETE FROM ${FTS_TABLE}`);
      } catch {}
    }
    this.dropVectorTable();
    this.vector.dims = undefined;
  }

  // ─── Reindex state management ─────────────────────────────────────────

  /** Capture vector/FTS state before a safe reindex (for rollback). */
  captureState(): {
    ftsAvailable: boolean;
    ftsError?: string;
    vectorAvailable: boolean | null;
    vectorLoadError?: string;
    vectorDims?: number;
    vectorReady: Promise<boolean> | null;
  } {
    return {
      ftsAvailable: this.fts.available,
      ftsError: this.fts.loadError,
      vectorAvailable: this.vector.available,
      vectorLoadError: this.vector.loadError,
      vectorDims: this.vector.dims,
      vectorReady: this.vectorReady,
    };
  }

  /** Restore vector/FTS state after a failed reindex. */
  restoreState(state: ReturnType<BuiltinSqliteStore["captureState"]>, dbClosed: boolean): void {
    this.fts.available = state.ftsAvailable;
    this.fts.loadError = state.ftsError;
    this.vector.available = dbClosed ? null : state.vectorAvailable;
    this.vector.loadError = state.vectorLoadError;
    this.vector.dims = state.vectorDims;
    this.vectorReady = dbClosed ? null : state.vectorReady;
  }

  /** Reset vector state for a fresh DB (after reindex swap). */
  resetVectorState(): void {
    this.vectorReady = null;
    this.vector.available = null;
    this.vector.loadError = undefined;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return await promise;
    }
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
      return (await Promise.race([promise, timeoutPromise])) as T;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
