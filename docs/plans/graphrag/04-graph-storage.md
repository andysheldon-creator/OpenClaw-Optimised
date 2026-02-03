# Component 4: Graph Storage Layer

The graph storage layer persists entity and relationship data in the same SQLite database
that already holds the vector index, and provides a query engine for graph traversal via
recursive CTEs. An optional Neo4j extension is available for large-scale deployments.

---

## 4A. SQLite Graph Tables

**Purpose:** Store the knowledge graph in the existing per-agent SQLite database
(`{agentId}.sqlite`), avoiding any new infrastructure dependency.

**File:** `src/knowledge/graph/schema.ts` (new)

### Schema

Added to the existing memory database via `ensureMemoryIndexSchema()`:

```sql
-- Entity nodes
CREATE TABLE IF NOT EXISTS kg_entities (
  entity_id    TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  description  TEXT,
  mention_count INTEGER DEFAULT 1,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  source_files TEXT,  -- JSON array
  metadata     TEXT   -- JSON object for extensibility
);

CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON kg_entities(name);

-- Entity name embeddings (for dedup/consolidation)
CREATE TABLE IF NOT EXISTS kg_entity_embeddings (
  entity_id  TEXT PRIMARY KEY REFERENCES kg_entities(entity_id),
  embedding  BLOB NOT NULL,    -- float32 array
  model      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Relationship edges
CREATE TABLE IF NOT EXISTS kg_relationships (
  rel_id           TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES kg_entities(entity_id),
  target_entity_id TEXT NOT NULL REFERENCES kg_entities(entity_id),
  type             TEXT NOT NULL,
  description      TEXT,
  keywords         TEXT,  -- JSON array
  weight           REAL DEFAULT 1.0,
  source_files     TEXT, -- JSON array
  metadata         TEXT  -- JSON object
);

CREATE INDEX IF NOT EXISTS idx_kg_rels_source ON kg_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rels_target ON kg_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rels_type ON kg_relationships(type);

-- Entity-to-chunk provenance (many-to-many)
CREATE TABLE IF NOT EXISTS kg_entity_chunks (
  entity_id TEXT NOT NULL REFERENCES kg_entities(entity_id),
  chunk_id  TEXT NOT NULL,
  PRIMARY KEY (entity_id, chunk_id)
);

-- Ingestion sources (for manual/crawl tracking)
CREATE TABLE IF NOT EXISTS kg_sources (
  source_id   TEXT PRIMARY KEY,
  type        TEXT NOT NULL,  -- "memory" | "manual" | "crawl"
  origin      TEXT,           -- file path or URL
  tags        TEXT,           -- JSON array
  content_hash TEXT,
  chunk_count  INTEGER,
  entity_count INTEGER,
  rel_count    INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  metadata     TEXT           -- JSON object (crawl config, etc.)
);
```

### Design Rationale

- **Same database:** No new files, no new connections. The existing
  `MemorySearchManager` already opens and manages this SQLite file.
- **JSON arrays for multi-value fields:** `source_files`, `keywords`, `tags` are stored
  as JSON arrays. SQLite's `json_each()` enables querying into these arrays when needed.
- **`metadata` column:** Extensible JSON column on entities, relationships, and sources
  for future fields without schema migrations.
- **Provenance via `kg_entity_chunks`:** Every entity links back to the specific chunks
  it was extracted from, enabling "show me where this was mentioned" queries.

---

## 4B. Graph Query Engine

**Purpose:** Provide graph traversal and neighborhood expansion queries without requiring
a dedicated graph database.

**File:** `src/knowledge/graph/query.ts` (new)

SQLite models graph traversal via recursive CTEs. The query engine exposes these
primitives:

### Interface

```typescript
export type GraphQueryEngine = {
  /** Find entities by name (exact or fuzzy via FTS) */
  findEntities(
    query: string,
    opts?: {
      type?: EntityType;
      limit?: number;
    },
  ): Promise<ExtractedEntity[]>;

  /** Get N-hop neighborhood of an entity */
  getNeighborhood(
    entityId: string,
    opts?: {
      maxHops?: number; // default 1, max 3
      relTypes?: string[]; // filter by relationship type
      limit?: number; // max entities returned
    },
  ): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }>;

  /** Find shortest path between two entities */
  findPath(
    fromEntityId: string,
    toEntityId: string,
    maxHops?: number,
  ): Promise<Array<{ entity: ExtractedEntity; relationship?: ExtractedRelationship }>>;

  /** Get entities with highest degree (most connected) */
  getHubs(opts?: { type?: EntityType; limit?: number }): Promise<ExtractedEntity[]>;

  /** Get all entities + relationships for a source */
  getSourceGraph(sourceId: string): Promise<GraphSnapshot>;

  /** Full subgraph for a set of entity IDs */
  getSubgraph(entityIds: string[]): Promise<GraphSnapshot>;

  /** Stats: entity count, relationship count, type distribution */
  getStats(): Promise<GraphStats>;
};

export type GraphSnapshot = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
};

export type GraphStats = {
  entityCount: number;
  relationshipCount: number;
  sourceCount: number;
  entityTypeDistribution: Record<string, number>;
  relationshipTypeDistribution: Record<string, number>;
  topHubs: Array<{ entity: ExtractedEntity; degree: number }>;
};
```

### N-Hop Neighborhood (Recursive CTE)

```sql
WITH RECURSIVE neighborhood(entity_id, depth) AS (
  -- Seed: the starting entity
  SELECT :startEntityId, 0

  UNION

  -- Expand: follow edges in both directions
  SELECT
    CASE WHEN r.source_entity_id = n.entity_id
         THEN r.target_entity_id
         ELSE r.source_entity_id
    END,
    n.depth + 1
  FROM neighborhood n
  JOIN kg_relationships r
    ON r.source_entity_id = n.entity_id
    OR r.target_entity_id = n.entity_id
  WHERE n.depth < :maxHops
)
SELECT DISTINCT e.* FROM kg_entities e
JOIN neighborhood n ON e.entity_id = n.entity_id
LIMIT :limit;
```

### Shortest Path (BFS via CTE)

```sql
WITH RECURSIVE path(entity_id, depth, path_ids) AS (
  SELECT :fromEntityId, 0, :fromEntityId

  UNION ALL

  SELECT
    CASE WHEN r.source_entity_id = p.entity_id
         THEN r.target_entity_id
         ELSE r.source_entity_id
    END,
    p.depth + 1,
    p.path_ids || ',' ||
      CASE WHEN r.source_entity_id = p.entity_id
           THEN r.target_entity_id
           ELSE r.source_entity_id
      END
  FROM path p
  JOIN kg_relationships r
    ON r.source_entity_id = p.entity_id
    OR r.target_entity_id = p.entity_id
  WHERE p.depth < :maxHops
    AND instr(p.path_ids,
      CASE WHEN r.source_entity_id = p.entity_id
           THEN r.target_entity_id
           ELSE r.source_entity_id
      END) = 0  -- prevent cycles
)
SELECT * FROM path
WHERE entity_id = :toEntityId
ORDER BY depth ASC
LIMIT 1;
```

### Hub Detection (Degree Query)

```sql
SELECT e.*, COUNT(DISTINCT r.rel_id) as degree
FROM kg_entities e
LEFT JOIN kg_relationships r
  ON r.source_entity_id = e.entity_id
  OR r.target_entity_id = e.entity_id
GROUP BY e.entity_id
ORDER BY degree DESC
LIMIT :limit;
```

### Performance Characteristics

| Query                      | Graph size 1K | Graph size 10K | Graph size 50K |
| -------------------------- | ------------- | -------------- | -------------- |
| 1-hop neighborhood         | <1ms          | ~5ms           | ~20ms          |
| 2-hop neighborhood         | ~2ms          | ~15ms          | ~80ms          |
| 3-hop neighborhood         | ~5ms          | ~50ms          | ~300ms         |
| Shortest path (3 hops max) | ~3ms          | ~30ms          | ~150ms         |
| Hub detection (top 10)     | ~2ms          | ~10ms          | ~50ms          |

These are estimates based on SQLite CTE performance benchmarks. The 50K entity tier is
where users should consider the Neo4j extension for complex multi-hop queries.

---

## 4C. Optional Neo4j Backend (Extension)

**Purpose:** For users with large-scale knowledge graphs (10K+ entities) or need for
advanced graph algorithms (community detection, PageRank, centrality measures), provide
an optional Neo4j backend as a plugin extension.

**Location:** `extensions/knowledge-neo4j/`

### Implementation

The extension implements the same `GraphQueryEngine` interface using Cypher queries
against a Neo4j instance via the `neo4j-driver` package:

```typescript
// extensions/knowledge-neo4j/src/index.ts
import type { GraphQueryEngine } from "clawdbrain/knowledge";

export function createNeo4jGraphEngine(config: {
  uri: string;
  username: string;
  password: string;
  database?: string;
}): GraphQueryEngine {
  // Cypher-based implementation of the same interface
}
```

This keeps the core zero-dependency on Neo4j while allowing power users to opt in.

### Configuration

```yaml
agents:
  defaults:
    knowledge:
      graph:
        backend: "sqlite" # or "neo4j"
        neo4j:
          uri: "bolt://localhost:7687"
          username: "neo4j"
          password: "..."
```

### When to Use Neo4j

| Criterion           | SQLite | Neo4j                 |
| ------------------- | ------ | --------------------- |
| Entity count        | <50K   | Any                   |
| Max hop depth       | 3      | Unlimited             |
| Community detection | No     | Yes                   |
| PageRank/centrality | No     | Yes                   |
| Infrastructure      | Zero   | Requires Neo4j server |
| Setup complexity    | None   | Moderate              |

---

## Files to Create

- `src/knowledge/graph/schema.ts` -- SQLite table creation + migration
- `src/knowledge/graph/query.ts` -- GraphQueryEngine implementation (SQLite)
- `src/knowledge/graph/types.ts` -- Shared types (GraphSnapshot, GraphStats, etc.)
- `src/knowledge/graph/query.test.ts`

## Files to Modify

- `src/memory/memory-schema.ts` -- add graph table creation to `ensureMemoryIndexSchema()`
