import * as lancedb from "@lancedb/lancedb";
import { randomUUID } from "node:crypto";
import type { MemoryCategory } from "../../config.js";
import type { MemoryEntry, MemorySearchResult, MemoryStore } from "../types.js";

const TABLE_NAME = "memories_v2";

export class LanceDbStore implements MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly vectorDim: number,
  ) {}

  private async ensureInitialized(): Promise<void> {
    if (this.table) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      this.table = await this.db.createTable(TABLE_NAME, [
        {
          id: "__schema__",
          text: "",
          vector: Array.from({ length: this.vectorDim }, () => 0),
          importance: 0,
          category: "other",
          createdAt: 0,
          originalText: "",
          confidence: 0,
          sourceChannel: "",
          tags: [] as string[],
        },
      ]);
      await this.table.delete('id = "__schema__"');
    }
  }

  async store(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    await this.ensureInitialized();

    const fullEntry: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    await this.table!.add([fullEntry]);
    return fullEntry;
  }

  async search(vector: number[], limit = 5, minScore = 0.5): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();

    const results = await this.table!.vectorSearch(vector).limit(limit).toArray();

    const mapped = results.map((row) => {
      const distance = row._distance ?? 0;
      const score = 1 / (1 + distance);
      return {
        entry: {
          id: row.id as string,
          text: row.text as string,
          vector: row.vector as number[],
          importance: row.importance as number,
          category: row.category as MemoryCategory,
          createdAt: row.createdAt as number,
          originalText: row.originalText as string,
          confidence: row.confidence as number,
          sourceChannel: row.sourceChannel as string,
          tags: (row.tags as string[]) ?? [],
        },
        score,
      };
    });

    return mapped.filter((r) => r.score >= minScore);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const fullUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!fullUuidRegex.test(id)) {
      throw new Error(`Invalid memory ID format: ${id}`);
    }
    await this.table!.delete(`id = '${id}'`);
    return true;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.table!.countRows();
  }

  async getAll(limit = 1000): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    // LanceDB can stream or array. For synthesis, we need recent items.
    // Assuming table scan for now. In real usage, might want a date filter.
    const rows = await this.table!.query().limit(limit).toArray();
    return rows.map((row) => ({
      id: row.id as string,
      text: row.text as string,
      vector: row.vector as number[],
      importance: row.importance as number,
      category: row.category as MemoryCategory,
      createdAt: row.createdAt as number,
      originalText: row.originalText as string,
      confidence: row.confidence as number,
      sourceChannel: row.sourceChannel as string,
      tags: (row.tags as string[]) ?? [],
    }));
  }
}
