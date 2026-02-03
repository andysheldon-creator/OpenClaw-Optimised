# Component 1: Ingestion Layer

The ingestion layer provides three pathways for content to enter the knowledge graph:
existing memory files (automatic), manual document upload, and web crawling. All three
converge into the same chunking → embedding → entity extraction pipeline.

---

## 1A. Memory File Ingestion (Enhanced)

**Purpose:** The current `MemorySearchManager` already watches `MEMORY.md` and
`memory/*.md` files, chunks them, and builds embeddings. This component adds entity
extraction as a post-chunking step on the same pipeline -- zero new configuration required
for users who already have memory search enabled.

**File:** `src/memory/entity-extraction.ts` (new)

The extractor receives chunks from the existing `chunkMarkdown()` pipeline in
`src/memory/internal.ts` and runs LLM-based entity/relationship extraction on each chunk.

### Core Types

```typescript
export type ExtractedEntity = {
  id: string; // MD5 hash of normalized name
  name: string; // canonical name
  type: EntityType; // person | org | repo | concept | tool | location | event
  description: string; // LLM-generated description
  sourceChunkIds: string[]; // provenance back to chunk table
  sourceFiles: string[]; // originating file paths
  firstSeen: number; // epoch ms
  lastSeen: number;
  mentionCount: number;
};

export type ExtractedRelationship = {
  id: string; // MD5 of sorted(sourceId + targetId)
  sourceEntityId: string;
  targetEntityId: string;
  type: string; // uses | depends_on | authored_by | discussed_in | blocks | etc.
  description: string;
  keywords: string[];
  weight: number; // accumulated strength from repeated mentions
  sourceChunkIds: string[];
  sourceFiles: string[];
};

export type EntityType =
  | "person"
  | "org"
  | "repo"
  | "concept"
  | "tool"
  | "location"
  | "event"
  | "goal" // links to Overseer goals
  | "task" // links to Overseer tasks
  | "file" // codebase files
  | "custom";
```

### Integration Point

The existing `syncFiles()` method (which calls `chunkMarkdown()` → embed → store) gets a
post-embedding hook:

```typescript
// In MemorySearchManager.syncFiles(), after embedding storage:
if (this.graphConfig.entityExtraction.enabled) {
  await this.entityExtractor.extractFromChunks(newChunks, { source: "memory" });
}
```

This means entity extraction piggybacks on the existing sync cycle (on-session-start,
on-search, watch, interval) with no new scheduling infrastructure.

### Files to Modify

- `src/memory/manager.ts` -- add extraction hook after `syncFiles()` embedding step
- `src/memory/internal.ts` -- export chunk metadata needed by extractor

---

## 1B. Manual Document Ingestion

**Purpose:** Allow users to ingest arbitrary documents (PDF, DOCX, plain text, markdown)
that are not part of the memory directory -- e.g. project specs, design docs, API
references, meeting notes. This is the "bring your own knowledge" pathway, inspired by
[Archon's document upload feature](https://github.com/coleam00/Archon).

**File:** `src/knowledge/ingest.ts` (new)

### Types

```typescript
export type IngestSource = {
  type: "file" | "url" | "text";
  path?: string; // local file path
  url?: string; // for URL sources
  content?: string; // raw text for "text" type
  mimeType?: string; // auto-detected if absent
  tags?: string[]; // user-supplied labels
  metadata?: Record<string, string>;
};

export type IngestResult = {
  sourceId: string;
  chunks: number;
  entities: number;
  relationships: number;
  durationMs: number;
};
```

### Document Parsing Pipeline

1. **MIME detection:** File extension + magic bytes (via `file-type` package or lightweight
   heuristic for md/txt/json).

2. **Content extraction by type:**

   | Format        | Parser                              | Notes                                           |
   | ------------- | ----------------------------------- | ----------------------------------------------- |
   | Markdown/Text | Direct pass-through                 | Feeds straight to chunker                       |
   | PDF           | `pdf-parse` (pure JS)               | Text per page, concatenated with page markers   |
   | DOCX          | `mammoth` (pure JS)                 | Converts to markdown, then chunks               |
   | HTML          | `@mozilla/readability` + `linkedom` | Strips nav/footer/ads, extracts article content |
   | JSON/JSONL    | Custom flattener                    | Preserves key paths for searchability           |

3. **Chunking:** Reuse `chunkMarkdown()` from `src/memory/internal.ts` with the same
   token/overlap config. For non-markdown content, apply paragraph-aware splitting first.

4. **Embedding + extraction:** Same pipeline as memory files -- embed chunks, store in
   sqlite-vec, run entity extraction, store in graph tables.

### CLI Surface

```
clawdbrain knowledge ingest <path-or-url> [--tags tag1,tag2] [--agent <agentId>]
clawdbrain knowledge ingest --text "inline content" [--tags tag1]
clawdbrain knowledge list [--source memory|manual|crawl] [--agent <agentId>]
clawdbrain knowledge remove <sourceId> [--agent <agentId>]
```

### Agent Tool Surface

```typescript
// New tool: knowledge_ingest
{
  name: "knowledge_ingest",
  description: "Ingest a local file or raw text into the knowledge graph for future retrieval.",
  parameters: {
    path: Type.Optional(Type.String()),  // local file
    text: Type.Optional(Type.String()),  // inline content
    tags: Type.Optional(Type.Array(Type.String())),
  }
}
```

This lets agents self-ingest relevant documents they discover during work -- e.g. an agent
reading an API spec can ingest it for future sessions.

### Dependencies

- `pdf-parse` -- PDF text extraction (pure JS, no native deps)
- `mammoth` -- DOCX to markdown (pure JS)
- `@mozilla/readability` + `linkedom` -- HTML content extraction (pure JS, no Chromium)

### Files to Create

- `src/knowledge/ingest.ts` -- ingestion pipeline orchestrator
- `src/knowledge/parsers/pdf.ts` -- PDF extraction wrapper
- `src/knowledge/parsers/docx.ts` -- DOCX extraction wrapper
- `src/knowledge/parsers/html.ts` -- HTML readability extraction
- `src/commands/knowledge.ts` -- CLI commands

---

## 1C. Web Crawler

**Purpose:** Crawl documentation sites, sitemaps, and individual URLs to build a knowledge
base from external sources. Inspired by [Archon's CrawlingService](https://github.com/coleam00/Archon)
and [mcp-crawl4ai-rag](https://github.com/coleam00/mcp-crawl4ai-rag).

**File:** `src/knowledge/crawler.ts` (new)

### Types

```typescript
export type CrawlTarget = {
  url: string;
  mode: "single" | "sitemap" | "recursive";
  maxPages?: number; // default 100
  maxDepth?: number; // default 3 for recursive
  allowPatterns?: string[]; // URL glob patterns to follow
  blockPatterns?: string[]; // URL glob patterns to skip
  tags?: string[];
};

export type CrawlProgress = {
  crawlId: string;
  status: "queued" | "crawling" | "processing" | "done" | "error";
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesProcessed: number;
  entitiesExtracted: number;
  errors: Array<{ url: string; error: string }>;
};
```

### Crawl Strategy

1. **URL discovery:**
   - `single`: Fetch one page.
   - `sitemap`: Fetch `/sitemap.xml` (and nested sitemaps), extract all `<loc>` URLs,
     filter by `allowPatterns`/`blockPatterns`.
   - `recursive`: BFS from seed URL, follow same-origin links up to `maxDepth`, respect
     `robots.txt`.

2. **Content fetching:** Use the existing HTTP infrastructure (the project already has
   fetch capabilities for web providers). For JavaScript-rendered pages, optionally use
   a headless browser via Playwright (already a dev dependency in `ui/package.json`).
   Default to plain HTTP fetch with a fallback note if JS rendering is needed.

3. **HTML-to-markdown conversion:** Convert fetched HTML to clean markdown, stripping
   navigation, footers, ads. Use Mozilla Readability (`@mozilla/readability` + `linkedom`,
   both pure JS).

4. **Deduplication:** MD5 hash of canonical URL → `source_id`. If a page has already
   been crawled and its content hash matches, skip re-processing. If content changed,
   re-extract (delta update).

5. **Rate limiting:** Configurable `requestsPerSecond` (default 2), polite delays,
   respect `Crawl-delay` from `robots.txt`.

6. **Pipeline handoff:** Each crawled page's markdown content feeds into the same
   chunking → embedding → entity extraction pipeline.

### CLI Surface

```
clawdbrain knowledge crawl <url> [--mode single|sitemap|recursive] [--max-pages 100]
  [--tags tag1,tag2] [--agent <agentId>]
clawdbrain knowledge crawl-status [crawlId]
```

### Agent Tool Surface

```typescript
{
  name: "knowledge_crawl",
  description: "Crawl a URL or documentation site and ingest into the knowledge graph.",
  parameters: {
    url: Type.String(),
    mode: Type.Optional(Type.String()),  // "single" | "sitemap" | "recursive"
    maxPages: Type.Optional(Type.Number()),
    tags: Type.Optional(Type.Array(Type.String())),
  }
}
```

### Progress Reporting

Crawl operations are long-running. Use the existing `src/cli/progress.ts` (`osc-progress`
\+ `@clack/prompts` spinner) for CLI display. For agent contexts, emit progress via the
existing event system and expose via a `knowledge_crawl_status` tool.

### Concurrency and Robustness

- Configurable concurrency (default 4 parallel fetches)
- Per-URL timeout (default 30s)
- Canonical URL normalization ensures the same page always maps to the same `source_id`,
  preventing duplicates during concurrent crawls
- Transient network failures logged and skipped without failing the entire crawl
- Resume support: if a crawl is interrupted, re-running with the same URL skips
  already-processed pages (content hash match)

### Files to Create

- `src/knowledge/crawler.ts` -- crawl orchestrator
- `src/knowledge/crawler-discovery.ts` -- URL discovery (sitemap parser, recursive BFS)
- `src/knowledge/crawler-fetcher.ts` -- HTTP fetching with rate limiting
