# Component 5: Hybrid GraphRAG Retrieval

The hybrid retriever augments the existing vector + BM25 search pipeline with a graph
expansion step that surfaces structurally related context that pure similarity search
would miss.

---

## 5A. Graph-Augmented Search

**Purpose:** Enhance the existing `mergeHybridResults()` pipeline with graph neighborhood
expansion, so that a query about "Auth Service" also retrieves context about entities
structurally connected to it (OAuth Provider, JWT Validator, etc.) even if those terms
do not appear in the query.

**File:** `src/knowledge/retrieval/graph-rag.ts` (new)

### 3-Phase Retrieval Algorithm

```
Phase 1: Existing Hybrid Search (unchanged)
  ├─ Vector search (cosine similarity via sqlite-vec)
  ├─ BM25 keyword search (FTS5)
  └─ Weighted merge → top-K candidates

Phase 2: Entity Recognition in Query
  ├─ Extract entity mentions from the query string
  │   (fast: regex + entity name index lookup, no LLM call)
  └─ If no entities found, embed query → find nearest entity name embeddings

Phase 3: Graph Expansion
  ├─ For each recognized entity, pull 1-hop neighborhood
  ├─ Collect related entity descriptions + relationship descriptions
  ├─ Retrieve source chunks for related entities via kg_entity_chunks
  └─ Score graph-sourced chunks with a graph proximity weight

Final Merge:
  combined_score = alpha * hybrid_score + beta * graph_proximity_score
  (default: alpha = 0.7, beta = 0.3)
  Deduplicate by chunk_id, return top-N
```

### Phase 2: Query Entity Recognition

**File:** `src/knowledge/retrieval/query-entity-recognizer.ts` (new)

Entity recognition in the query must be fast (no LLM call in the hot path). Two
strategies, tried in order:

1. **Index lookup:** Tokenize the query, generate n-grams (1-3 words), look up each
   n-gram against `kg_entities.name` (indexed). This catches exact and near-exact
   mentions.

2. **Embedding fallback:** If no entities found via index lookup, embed the full query
   string and compare against `kg_entity_embeddings` using cosine similarity. Return
   top-3 entities above a threshold (default 0.75). This catches semantic references
   like "login system" matching entity "Auth Service".

```typescript
export async function recognizeQueryEntities(
  query: string,
  engine: GraphQueryEngine,
  embeddingProvider: EmbeddingProvider,
): Promise<ExtractedEntity[]> {
  // Strategy 1: n-gram index lookup
  const ngrams = generateNgrams(query, { min: 1, max: 3 });
  const directMatches = await engine.findEntities(ngrams.join(" OR "), { limit: 5 });
  if (directMatches.length > 0) return directMatches;

  // Strategy 2: embedding similarity fallback
  const queryEmbedding = await embeddingProvider.embed(query);
  return engine.findEntitiesByEmbedding(queryEmbedding, { limit: 3, minScore: 0.75 });
}
```

### Phase 3: Graph Expansion

For each entity recognized in the query:

1. Call `engine.getNeighborhood(entityId, { maxHops, relTypes })` to get connected entities
2. For each connected entity, retrieve its source chunks via `kg_entity_chunks`
3. Score each graph-sourced chunk based on:
   - Relationship weight (stronger relationships → higher score)
   - Hop distance (1-hop → full weight, 2-hop → 0.5x, 3-hop → 0.25x)
   - Entity mention count (more mentions → more likely relevant)

```typescript
function computeGraphScore(params: {
  relationshipWeight: number; // 1-10 from extraction
  hopDistance: number; // 1, 2, or 3
  entityMentionCount: number;
}): number {
  const hopDecay = 1 / Math.pow(2, params.hopDistance - 1);
  const normalizedWeight = params.relationshipWeight / 10;
  const mentionBoost = Math.min(Math.log2(params.entityMentionCount + 1) / 5, 1);
  return normalizedWeight * hopDecay * (0.7 + 0.3 * mentionBoost);
}
```

### Integration into Existing Search Path

The `MemorySearchManager.search()` method currently calls `searchVector()` +
`searchKeyword()` + `mergeHybridResults()`. The graph expansion step inserts after
the merge:

```typescript
// In manager.ts search():
let results = mergeHybridResults({ vector, keyword, vectorWeight, textWeight });

if (this.graphConfig.retrieval.graphExpansion.enabled) {
  results = await this.graphRetriever.expandWithGraph(query, results, {
    maxHops: this.graphConfig.retrieval.graphExpansion.maxHops,
    graphWeight: this.graphConfig.retrieval.graphExpansion.weight,
    maxGraphChunks: this.graphConfig.retrieval.graphExpansion.maxChunks,
  });
}
```

**Key design constraint:** The graph expansion is additive. It never removes results from
the existing hybrid search -- it only adds graph-sourced chunks and potentially re-scores
existing results that also have graph connections.

---

## 5B. Graph Context Formatter

**Purpose:** Format graph-derived context into a structured block that the agent can
reason over, rather than dumping raw entity data into the context window.

**File:** `src/knowledge/retrieval/context-formatter.ts` (new)

### Output Format

When graph expansion contributes results, a structured context block is appended to the
search results:

```
## Knowledge Graph Context
Query entities: [Auth Service, OAuth Provider]

### Auth Service (concept)
Related: OAuth Provider (depends_on, weight: 8), User Model (implements),
  Login Flow (part_of), Session Store (uses)
Description: Core authentication service handling JWT issuance and validation...

### OAuth Provider (tool)
Related: Auth Service (depended_on_by), Google OAuth (implements),
  GitHub OAuth (implements)
Description: External OAuth2 provider integration layer...

### Relevant Relationships
- Auth Service -> OAuth Provider: "depends_on" -- Auth service delegates to OAuth
  provider for third-party login flows (strength: 8)
- Auth Service -> User Model: "implements" -- Auth service creates and validates
  user model instances during login (strength: 5)
```

### Why Structured Context

This format gives agents structured, traversable context that enables multi-hop reasoning.
Instead of isolated text snippets, the agent sees:

- Entity names and types (enabling precise references)
- Relationship chains (enabling "A depends on B which uses C" reasoning)
- Relationship weights (enabling prioritization of strong vs weak connections)
- Compact descriptions (minimal token budget for maximum structural information)

An agent processing "what happens if we change the OAuth provider?" can trace:
OAuth Provider → Auth Service (depends_on) → Login Flow (part_of) → User Model
(implements) and reason about the blast radius without needing the full source chunks.

### Context Budget Management

Graph context competes with vector/BM25 results for context window space:

- `maxChunks` (default 4): limits how many graph-sourced chunks are added
- The structured entity/relationship block is compact (~50-100 tokens per entity)
- Total graph context block is capped at ~500 tokens by default
- `useGraph: false` escape hatch on `memory_search` for when agents want pure vector

---

## Files to Create

- `src/knowledge/retrieval/graph-rag.ts` -- graph expansion retriever
- `src/knowledge/retrieval/query-entity-recognizer.ts` -- fast entity mention detection
- `src/knowledge/retrieval/context-formatter.ts` -- structured context formatting
- `src/knowledge/retrieval/graph-rag.test.ts`

## Files to Modify

- `src/memory/manager.ts` -- wire graph expansion into `search()`
- `src/memory/hybrid.ts` -- export types needed by graph-rag merger
