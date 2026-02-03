# Component 10: Implementation Plan

A phased rollout with file manifests, demo scenarios, and trade-off analysis.

---

## Phase 1: Graph Storage + Entity Extraction Core

**Goal:** Schema, extraction engine, consolidation, basic graph queries.

### Files to Create

| File                                        | Purpose                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `src/knowledge/graph/schema.ts`             | SQLite graph table creation + migration                                    |
| `src/knowledge/graph/types.ts`              | Shared types (ExtractedEntity, ExtractedRelationship, GraphSnapshot, etc.) |
| `src/knowledge/graph/query.ts`              | GraphQueryEngine implementation (recursive CTEs)                           |
| `src/knowledge/extraction/extractor.ts`     | LLM extraction pipeline                                                    |
| `src/knowledge/extraction/parser.ts`        | Output parsing (delimiter + JSON fallback)                                 |
| `src/knowledge/extraction/prompts.ts`       | Extraction prompt templates                                                |
| `src/knowledge/extraction/consolidation.ts` | Entity merging algorithm                                                   |
| `src/knowledge/index.ts`                    | Public API barrel                                                          |

### Files to Modify

| File                                      | Change                                            |
| ----------------------------------------- | ------------------------------------------------- |
| `src/memory/memory-schema.ts`             | Add graph tables to `ensureMemoryIndexSchema()`   |
| `src/memory/manager.ts`                   | Hook extraction into `syncFiles()` post-embedding |
| `src/agents/memory-search.ts`             | Add knowledge config resolution                   |
| `src/config/types.agent-defaults.ts`      | Add `KnowledgeConfig` type                        |
| `src/config/zod-schema.agent-defaults.ts` | Add Zod validation                                |

### Tests

- `src/knowledge/extraction/extractor.test.ts`
- `src/knowledge/extraction/parser.test.ts`
- `src/knowledge/extraction/consolidation.test.ts`
- `src/knowledge/graph/query.test.ts`

### Exit Criteria

- Entities and relationships are extracted from memory file chunks
- Entities are deduplicated via exact + fuzzy matching
- Graph query engine returns correct neighborhood, path, and hub results
- All graph tables are created alongside existing memory tables

---

## Phase 2: Hybrid GraphRAG Retrieval + Agent Tools

**Goal:** Graph-augmented search, new agent tools, enhanced `memory_search`.

### Files to Create

| File                                                 | Purpose                                  |
| ---------------------------------------------------- | ---------------------------------------- |
| `src/knowledge/retrieval/graph-rag.ts`               | Graph expansion retriever                |
| `src/knowledge/retrieval/query-entity-recognizer.ts` | Fast entity mention detection in queries |
| `src/knowledge/retrieval/context-formatter.ts`       | Structured context formatting            |
| `src/agents/tools/knowledge-tools.ts`                | graph_search, graph_inspect tools        |

### Files to Modify

| File                              | Change                               |
| --------------------------------- | ------------------------------------ |
| `src/memory/manager.ts`           | Wire graph expansion into `search()` |
| `src/agents/tools/memory-tool.ts` | Add `useGraph` parameter             |
| `src/agents/system-prompt.ts`     | Add knowledge graph context section  |
| Agent tool registration           | Register new tools conditionally     |

### Tests

- `src/knowledge/retrieval/graph-rag.test.ts`
- `src/knowledge/retrieval/query-entity-recognizer.test.ts`
- `src/agents/tools/knowledge-tools.test.ts`

### Exit Criteria

- `memory_search` transparently includes graph expansion results
- `graph_search` and `graph_inspect` tools work end-to-end
- Graph context is formatted as structured block in search results

---

## Phase 3: Manual Ingestion + Web Crawler

**Goal:** File upload, document parsing, URL crawling, CLI commands.

### Files to Create

| File                                 | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `src/knowledge/ingest.ts`            | Ingestion pipeline orchestrator            |
| `src/knowledge/crawler.ts`           | Web crawl orchestrator                     |
| `src/knowledge/crawler-discovery.ts` | URL discovery (sitemap, BFS)               |
| `src/knowledge/crawler-fetcher.ts`   | HTTP fetching with rate limiting           |
| `src/knowledge/parsers/pdf.ts`       | PDF extraction wrapper                     |
| `src/knowledge/parsers/docx.ts`      | DOCX extraction wrapper                    |
| `src/knowledge/parsers/html.ts`      | HTML readability extraction                |
| `src/commands/knowledge.ts`          | CLI commands (ingest, crawl, list, remove) |

### Dependencies to Add

| Package                | Purpose                         | Size            |
| ---------------------- | ------------------------------- | --------------- |
| `pdf-parse`            | PDF text extraction             | Pure JS, ~200KB |
| `mammoth`              | DOCX to markdown                | Pure JS, ~300KB |
| `@mozilla/readability` | HTML article extraction         | Pure JS, ~30KB  |
| `linkedom`             | Lightweight DOM for Readability | Pure JS, ~100KB |

### Tests

- `src/knowledge/ingest.test.ts`
- `src/knowledge/crawler.test.ts`
- `src/knowledge/parsers/pdf.test.ts`
- `src/knowledge/parsers/docx.test.ts`
- `src/knowledge/parsers/html.test.ts`
- `src/commands/knowledge.test.ts`

### Exit Criteria

- `clawdbrain knowledge ingest` works with PDF, DOCX, MD, TXT files
- `clawdbrain knowledge crawl` crawls single pages, sitemaps, and recursive sites
- Crawled/ingested content appears in knowledge graph and is searchable
- CLI shows progress for long-running operations

---

## Phase 4: Overseer Bridge

**Goal:** Goal-to-entity linking, dependency-aware planning.

### Files to Create

| File                               | Purpose                   |
| ---------------------------------- | ------------------------- |
| `src/knowledge/overseer-bridge.ts` | Goal/task graph node sync |

### Files to Modify

| File                                | Change                                    |
| ----------------------------------- | ----------------------------------------- |
| `src/infra/overseer/planner.ts`     | Inject graph context into planning prompt |
| `src/infra/overseer/store.types.ts` | Optional `entityIds` field on records     |
| `src/infra/overseer/runner.ts`      | Call bridge on goal/task lifecycle events |

### Exit Criteria

- Goals and tasks appear as nodes in the knowledge graph
- Planner receives graph context about related entities and active goals
- Users can query "what goals reference entity X?"

---

## Phase 5: Web Visualization + Gateway API

**Goal:** Graph explorer UI, gateway endpoints, ingestion management page.

### Files to Create

| File                                          | Purpose                             |
| --------------------------------------------- | ----------------------------------- |
| `ui/src/ui/pages/knowledge-graph.ts`          | Graph explorer page (Lit component) |
| `ui/src/ui/pages/knowledge-sources.ts`        | Ingestion management page           |
| `ui/src/ui/components/graph-renderer.ts`      | D3-force rendering logic            |
| `ui/src/ui/components/entity-detail-panel.ts` | Entity detail sidebar               |
| `ui/src/ui/components/source-upload.ts`       | File upload component               |
| `ui/src/ui/components/crawl-panel.ts`         | Crawl launcher + progress           |
| Gateway route handlers                        | `/api/knowledge/*` endpoints        |

### Dependencies to Add (ui/)

| Package        | Purpose              | Size      |
| -------------- | -------------------- | --------- |
| `d3-force`     | Force simulation     | ~8KB gzip |
| `d3-selection` | SVG DOM manipulation | ~8KB gzip |
| `d3-zoom`      | Zoom/pan behavior    | ~8KB gzip |
| `d3-drag`      | Drag behavior        | ~4KB gzip |

### Exit Criteria

- Graph explorer renders entity/relationship graph with force layout
- Click, double-click, zoom, pan, drag all work
- Filtering by entity type, relationship type, source, time range
- Goal overlay toggle shows Overseer goals in graph
- Ingestion management page supports file upload and crawl launching
- All gateway API endpoints return correct data

---

## Phase 6: Neo4j Extension (Optional)

**Goal:** Plugin for Neo4j backend for large-scale deployments.

### Files to Create

| File                                       | Purpose                               |
| ------------------------------------------ | ------------------------------------- |
| `extensions/knowledge-neo4j/package.json`  | Extension package                     |
| `extensions/knowledge-neo4j/src/index.ts`  | Neo4j GraphQueryEngine implementation |
| `extensions/knowledge-neo4j/src/cypher.ts` | Cypher query builders                 |

### Exit Criteria

- Neo4j extension implements full `GraphQueryEngine` interface
- Configurable via `knowledge.graph.backend: "neo4j"`
- All existing tests pass with Neo4j backend swapped in

---

## Demo Scenarios

### Demo 1: "What do we know?"

After enabling knowledge and running a few sessions:

```
> clawdbrain knowledge stats

Knowledge Graph: my-agent
  Entities:      342 (87 concepts, 63 tools, 52 people, 41 files, 99 other)
  Relationships: 891
  Sources:       28 (14 memory, 8 manual, 6 crawl)
  Last updated:  2 minutes ago

Top hubs:
  1. Auth Service (concept)      -- 23 relationships
  2. Peter (person)              -- 19 relationships
  3. Gateway (concept)           -- 17 relationships
```

### Demo 2: Structural Query

```
User: How does the auth system relate to the gateway?

Agent: [Uses graph_search to find Auth Service and Gateway entities]
       [Discovers path: Auth Service -> JWT Validator -> Gateway Middleware -> Gateway]
       [Pulls source chunks for each relationship]

The auth system connects to the gateway through 3 hops:
1. Auth Service produces JWTs (implemented in src/auth/jwt.ts)
2. JWT Validator middleware consumes those tokens (src/gateway/middleware/auth.ts)
3. Gateway loads the validator as middleware on all authenticated routes

This was discussed in sessions on Jan 15 and Jan 20, and the design doc
you ingested (docs/auth-design.md) describes the original architecture.
```

### Demo 3: Visual Exploration

User opens `http://localhost:18789/knowledge` and sees:

- Force-directed graph with color-coded entity types
- Clicks "Auth Service" -- sidebar shows all relationships
- Double-clicks -- expands to show OAuth Provider, JWT Validator, User Model
- Toggles "Show Goals" -- sees "Auth Refactor" goal node connected to Auth Service
- Filters to "last 7 days" -- sees only recently-referenced entities

### Demo 4: Crawl + Discover

```
User: Crawl the Stripe API docs so you know how to integrate payments

Agent: [Uses knowledge_crawl tool with url="https://docs.stripe.com", mode="sitemap"]

Started crawl job crawl-abc123. Processing...
  Pages discovered: 847
  Pages crawled: 100 (hit limit)
  Entities extracted: 234 (89 concepts, 67 tools, 42 objects, 36 endpoints)
  Relationships: 412

Notable entities found:
  - PaymentIntent (concept) -- 12 relationships
  - Customer (concept) -- 9 relationships
  - Webhook (tool) -- 8 relationships

These are now available in your knowledge graph. Try:
  "How does Stripe handle refunds?" -> graph finds Refund -> PaymentIntent -> Charge chain
```

---

## Open Questions & Trade-offs

### SQLite vs. Dedicated Graph DB

**Choice:** SQLite by default, Neo4j as optional extension.

**Rationale:** Clawdbrain's existing infrastructure is entirely SQLite-based (memory index,
session store). Adding a mandatory Neo4j dependency would be a significant operational
burden for a CLI tool. Recursive CTEs in SQLite handle 1-3 hop traversals on graphs up
to ~50K nodes performantly (sub-100ms). Neo4j extension is available for users who need
larger scale or complex graph algorithms (community detection, PageRank).

### Extraction Cost

Entity extraction adds LLM calls per chunk. For 100 chunks at ~400 tokens each:
~40K input tokens + ~10K output tokens per sync. At GPT-4.1-mini pricing, that is
approximately $0.03 per full sync.

**Mitigations:**

- Only extract from new/changed chunks (delta sync)
- Use cheaper models for extraction (configurable `model` override)
- Batch extraction calls where possible
- Cache extraction results per chunk content hash

### Graph Staleness

Entities extracted from old chunks may reference outdated information.

**Mitigations:**

- `last_seen` timestamps enable recency-weighted retrieval
- Periodic re-extraction on changed files (piggybacks on existing file watcher)
- Manual `clawdbrain knowledge reindex` command for full re-extraction
- Time-range filtering in both agent tools and web UI

### Prompt Context Budget

Graph context competes with vector/BM25 results for context window space.

**Mitigations:**

- Configurable `maxChunks` for graph-sourced results (default 4)
- Graph context is formatted as structured summary (compact, ~50-100 tokens per entity)
- Total graph context block capped at ~500 tokens by default
- `useGraph: false` escape hatch on `memory_search` for pure vector mode
