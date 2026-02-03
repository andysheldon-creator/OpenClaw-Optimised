# Component 7: Agent Tools

New agent tools expose the knowledge graph to LLM agents during sessions, following the
existing tool pattern established in `src/agents/tools/memory-tool.ts`.

---

## 7A. New Tools

**File:** `src/agents/tools/knowledge-tools.ts` (new)

### graph_search

**Purpose:** Entity-aware search across the knowledge graph. Use when the agent needs to
understand how concepts, people, tools, or goals relate to each other.

```typescript
{
  name: "graph_search",
  description:
    "Search the knowledge graph for entities and their relationships. " +
    "Use when you need to understand how concepts, people, tools, or goals " +
    "relate to each other. Returns entities with their types, descriptions, " +
    "and immediate relationships.",
  parameters: {
    query: Type.String(),
    entityType: Type.Optional(Type.String()),  // filter by type
    maxHops: Type.Optional(Type.Number()),      // neighborhood depth (default 1)
    maxResults: Type.Optional(Type.Number()),   // default 10
  }
}
```

**Return format:**

```json
{
  "entities": [
    {
      "name": "Auth Service",
      "type": "concept",
      "description": "Core authentication service...",
      "mentionCount": 47,
      "relationships": [
        { "target": "OAuth Provider", "type": "depends_on", "weight": 8 },
        { "target": "User Model", "type": "implements", "weight": 5 }
      ]
    }
  ],
  "stats": { "totalEntities": 342, "totalRelationships": 891 }
}
```

### graph_inspect

**Purpose:** Get detailed information about a specific entity including all its
relationships, source files, and full description. Use after `graph_search` to drill
down into a specific entity.

```typescript
{
  name: "graph_inspect",
  description:
    "Get detailed information about a specific entity including all its " +
    "relationships, source files, and description. Use after graph_search " +
    "to drill down into a specific entity.",
  parameters: {
    entityName: Type.String(),
    includeNeighborhood: Type.Optional(Type.Boolean()),  // default true
  }
}
```

**Return format:**

```json
{
  "entity": {
    "name": "Auth Service",
    "type": "concept",
    "description": "Core authentication service handling JWT issuance...",
    "mentionCount": 47,
    "firstSeen": "2026-01-15T10:30:00Z",
    "lastSeen": "2026-01-25T14:20:00Z",
    "sourceFiles": ["memory/2026-01-15.md", "memory/2026-01-20.md"]
  },
  "relationships": [
    {
      "target": "OAuth Provider",
      "type": "depends_on",
      "description": "Auth service delegates to OAuth provider for third-party login",
      "weight": 8,
      "keywords": ["oauth", "login", "delegation"]
    }
  ],
  "sourceChunks": [{ "path": "memory/2026-01-15.md", "startLine": 45, "endLine": 62 }]
}
```

### knowledge_ingest

**Purpose:** Allow agents to self-ingest documents they discover during work. See
[Ingestion Layer](./01-ingestion-layer.md) for the full ingestion pipeline.

```typescript
{
  name: "knowledge_ingest",
  description:
    "Ingest a local file or raw text into the knowledge graph for future " +
    "retrieval. Use when you encounter important reference material that " +
    "should be available in future sessions.",
  parameters: {
    path: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
  }
}
```

### knowledge_crawl

**Purpose:** Allow agents to crawl documentation sites and ingest them into the knowledge
graph. See [Ingestion Layer](./01-ingestion-layer.md) for the full crawl pipeline.

```typescript
{
  name: "knowledge_crawl",
  description:
    "Crawl a URL or documentation site and ingest into the knowledge graph. " +
    "Supports single page, sitemap, or recursive crawling modes.",
  parameters: {
    url: Type.String(),
    mode: Type.Optional(Type.String()),    // "single" | "sitemap" | "recursive"
    maxPages: Type.Optional(Type.Number()),
    tags: Type.Optional(Type.Array(Type.String())),
  }
}
```

### knowledge_crawl_status

**Purpose:** Check the progress of an ongoing crawl job.

```typescript
{
  name: "knowledge_crawl_status",
  description: "Check the progress of a knowledge crawl job.",
  parameters: {
    crawlId: Type.String(),
  }
}
```

---

## 7B. Enhanced memory_search

The existing `memory_search` tool gets an optional `useGraph` parameter that transparently
enables graph expansion alongside vector/BM25 results:

```typescript
{
  name: "memory_search",
  parameters: {
    query: Type.String(),
    maxResults: Type.Optional(Type.Number()),
    minScore: Type.Optional(Type.Number()),
    useGraph: Type.Optional(Type.Boolean()),  // NEW: default true when graph enabled
  }
}
```

When `useGraph` is true (the default when knowledge graph is enabled), the search
transparently includes graph expansion results alongside vector/BM25 results. The agent
does not need to know about the graph -- it just gets better results.

When `useGraph` is false, the search falls back to pure vector/BM25 (the current
behavior). This is useful when the agent explicitly wants similarity-only results.

---

## Tool Registration

Tools are registered conditionally based on knowledge config:

```typescript
// In tool registration (alongside existing memory tools):
if (knowledgeConfig?.enabled) {
  tools.push(
    createGraphSearchTool({ config, agentSessionKey }),
    createGraphInspectTool({ config, agentSessionKey }),
    createKnowledgeIngestTool({ config, agentSessionKey }),
    createKnowledgeCrawlTool({ config, agentSessionKey }),
    createKnowledgeCrawlStatusTool({ config, agentSessionKey }),
  );
}
```

### System Prompt Addition

When knowledge graph tools are enabled, a new section is added to the agent's system
prompt (via `src/agents/system-prompt.ts`):

```
## Knowledge Graph
You have access to a knowledge graph that tracks entities (people, concepts, tools,
repos, goals) and their relationships across your memory and ingested documents. Use
graph_search when you need to understand how things relate to each other. Use
graph_inspect to drill down into specific entities. The knowledge graph is automatically
updated when you use memory_search (via graph expansion), but you can also query it
directly for structural questions.
```

---

## Files to Create

- `src/agents/tools/knowledge-tools.ts` -- all new tool definitions
- `src/agents/tools/knowledge-tools.test.ts`

## Files to Modify

- `src/agents/tools/memory-tool.ts` -- add `useGraph` parameter to `memory_search`
- `src/agents/system-prompt.ts` -- add knowledge graph section when enabled
- Agent tool registration module -- register new tools conditionally
