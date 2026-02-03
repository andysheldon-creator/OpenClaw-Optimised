# Component 3: Entity Consolidation & Deduplication

Entity consolidation merges entity mentions across chunks and sources into canonical graph
nodes, preventing graph bloat and maintaining a clean, navigable knowledge graph.

---

## The Deduplication Problem

Without consolidation, a knowledge graph quickly degrades. The same entity appears under
different names ("Auth Service", "AuthService", "authentication service", "the auth
module") and the graph becomes a disconnected mess of near-duplicate nodes with sparse
edges. Consolidation is what turns raw extraction output into a usable graph.

**File:** `src/knowledge/extraction/consolidation.ts` (new)

---

## 3-Tier Merge Algorithm

### Tier 1: Exact Match

Normalize entity name (lowercase, trim, collapse whitespace) and compute MD5 hash. If
hash matches an existing entity, merge unconditionally.

```typescript
function normalizeEntityName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function entityId(name: string): string {
  return md5(`ent-${normalizeEntityName(name)}`);
}
```

This catches trivial variations like casing and whitespace. Fast, no LLM or embedding
calls required.

### Tier 2: Fuzzy Match via Embedding Similarity

For entities that survive Tier 1 (no exact match), compute an embedding of the entity
name and compare against existing entity name embeddings stored in `kg_entity_embeddings`.

```
cosine_similarity(embed("Auth Service"), embed("authentication service")) → 0.94
```

If score exceeds `aliasMergeThreshold` (default 0.92), flag as a merge candidate.

**Why 0.92:** Testing across common entity alias patterns shows 0.92 balances precision
(avoiding false merges like "Auth Service" vs "Author Service") with recall (catching
legitimate aliases). This threshold is configurable per agent.

### Tier 3: LLM Confirmation (Borderline Cases)

When embedding similarity falls in the 0.88-0.92 band (high enough to suspect a match,
low enough to be uncertain), optionally ask the LLM:

```
Are these the same entity?
A: "Auth Service" (concept) -- "authentication module" (tool)
Answer yes or no with a brief reason.
```

This tier is opt-in and only triggered for borderline cases to control LLM call volume.
When disabled, the 0.88-0.92 band entities are kept separate (conservative default).

---

## Merge Execution

When two entities are confirmed as the same, the merge proceeds:

### Entity Fields

| Field            | Merge strategy                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `id`             | Keep the earlier entity's ID (stable references)                                                       |
| `name`           | Keep the longer/more descriptive name                                                                  |
| `type`           | Most-frequent type wins (counter across all mentions)                                                  |
| `description`    | Append with `\|\|\|` separator; summarize via LLM if fragments > `maxDescriptionFragments` (default 6) |
| `sourceChunkIds` | Set union                                                                                              |
| `sourceFiles`    | Set union                                                                                              |
| `mentionCount`   | Sum                                                                                                    |
| `firstSeen`      | Minimum                                                                                                |
| `lastSeen`       | Maximum                                                                                                |

### Relationship Re-pointing

When entity B merges into entity A:

1. All relationships where B is source or target are re-pointed to A
2. Duplicate edges (same source + target + type) are merged:
   - Weights summed
   - Descriptions concatenated
   - Keywords merged (set union)
3. Self-loops (A→A after merge) are removed

```sql
-- Re-point relationships from B to A
UPDATE kg_relationships
  SET source_entity_id = :entityA
  WHERE source_entity_id = :entityB;

UPDATE kg_relationships
  SET target_entity_id = :entityA
  WHERE target_entity_id = :entityB;

-- Merge duplicate edges (same source+target+type after re-pointing)
-- This requires application-level logic to merge weights/descriptions
```

### Entity Name Embedding Update

After merge, recompute the embedding for the canonical entity's name and store in
`kg_entity_embeddings`. This ensures future dedup comparisons use the latest canonical
name.

---

## Description Summarization

When an entity accumulates more than `maxDescriptionFragments` (default 6) description
fragments from different extraction passes, the concatenated description becomes unwieldy.
The consolidator triggers an LLM summarization:

```
Summarize these descriptions of the entity "Auth Service" into a single
coherent paragraph (max 200 words):

Fragment 1: Core authentication service handling JWT issuance
Fragment 2: Handles user login and token refresh
Fragment 3: Service responsible for OAuth2 flow delegation
Fragment 4: JWT-based auth with RS256 signing
Fragment 5: Authentication and authorization gateway
Fragment 6: Manages session tokens and refresh rotation
Fragment 7: Central auth module used by all API endpoints
```

The summarized description replaces the fragment concatenation, keeping entity nodes
compact.

---

## Consolidation Scheduling

Consolidation runs at two points:

1. **Inline (per-extraction):** After each batch of entities is extracted, run Tier 1
   (exact match) immediately. This is cheap and catches most duplicates.

2. **Periodic (background):** Run Tier 2 + Tier 3 on a configurable schedule (default:
   after every sync cycle). This catches cross-source aliases that only emerge when
   comparing entities from different ingestion sources.

---

## Files to Create

- `src/knowledge/extraction/consolidation.ts` -- merge algorithm
- `src/knowledge/extraction/consolidation.test.ts`

## Files to Modify

- `src/knowledge/extraction/extractor.ts` -- call consolidation after extraction
- `src/memory/manager.ts` -- trigger periodic consolidation in sync cycle
