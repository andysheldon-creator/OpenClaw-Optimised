/**
 * Vector Search Adapter
 *
 * Abstract interface for vector similarity search.
 * Implementations can use Graphiti's built-in vector search or pgvector.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type VectorSearchOptions = {
  topK?: number;
  minSimilarity?: number;
  filter?: {
    sessionKey?: string;
    minScore?: number;
    engagementQuality?: string;
  };
};

export type VectorMatch = {
  id: string;
  similarity: number;
  metadata?: Record<string, unknown>;
};

/**
 * Abstract interface for vector search backends.
 * Start with GraphitiVectorAdapter (uses existing infrastructure),
 * add PgVectorAdapter later when PostgreSQL is configured.
 */
export interface VectorSearchAdapter {
  isAvailable(): Promise<boolean>;
  search(query: string, options?: VectorSearchOptions): Promise<VectorMatch[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// Null adapter (no vector search available)
// ────────────────────────────────────────────────────────────────────────────

/**
 * No-op adapter when no vector search backend is available.
 */
export class NullVectorAdapter implements VectorSearchAdapter {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async search(_query: string, _options?: VectorSearchOptions): Promise<VectorMatch[]> {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Graphiti vector adapter (uses existing Graphiti MCP server)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Vector search via Graphiti's built-in semantic search.
 * Uses the already-running Graphiti service—zero new infrastructure.
 */
export class GraphitiVectorAdapter implements VectorSearchAdapter {
  constructor(
    private client: {
      searchMemoryFacts: (params: {
        query: string;
        group_ids?: string[];
        max_facts?: number;
      }) => Promise<{ facts: Array<{ uuid: string; fact: string; score?: number }> }>;
    },
    private groupId: string = "meridia-experiences",
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.searchMemoryFacts({
        query: "test",
        group_ids: [this.groupId],
        max_facts: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  async search(query: string, options?: VectorSearchOptions): Promise<VectorMatch[]> {
    try {
      const result = await this.client.searchMemoryFacts({
        query,
        group_ids: [this.groupId],
        max_facts: options?.topK ?? 10,
      });

      return result.facts.map((f) => ({
        id: f.uuid,
        similarity: f.score ?? 0.5,
        metadata: { fact: f.fact },
      }));
    } catch {
      return [];
    }
  }
}
