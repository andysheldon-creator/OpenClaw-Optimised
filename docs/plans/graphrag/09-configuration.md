# Component 9: Configuration

All knowledge graph capabilities are behind a single `knowledge` config block, nested
under agent defaults, following the same pattern as the existing `memorySearch` config.

---

## Config Schema

**Files to modify:**

- `src/config/types.agent-defaults.ts` -- add `KnowledgeConfig` type
- `src/config/zod-schema.agent-defaults.ts` -- add Zod validation schema
- `src/agents/memory-search.ts` -- add knowledge config resolution

### TypeScript Type

```typescript
// In types.agent-defaults.ts
export type KnowledgeConfig = {
  /** Master switch (default: false) */
  enabled: boolean;

  entityExtraction: {
    /** Enable entity/relationship extraction (default: true when knowledge.enabled) */
    enabled: boolean;

    /** Entity types to extract (default: all built-in types) */
    entityTypes: EntityType[];

    /** Relationship types to extract (default: all built-in types) */
    relationshipTypes: string[];

    /** Override model for extraction (default: agent's configured model) */
    model?: string;

    gleaning: {
      /** Enable gleaning re-prompt passes (default: true) */
      enabled: boolean;
      /** Number of gleaning passes: 0 = none, 1 = one re-prompt, 2 = two (default: 1) */
      passes: number;
    };

    consolidation: {
      /** Cosine similarity threshold for alias merging (default: 0.92) */
      aliasMergeThreshold: number;
      /** Max description fragments before triggering LLM summarization (default: 6) */
      maxDescriptionFragments: number;
    };

    /** Chunks per extraction call (default: 1) */
    batchSize: number;

    /** Max concurrent extraction calls (default: 4) */
    concurrency: number;
  };

  graph: {
    /** Storage backend (default: "sqlite") */
    backend: "sqlite" | "neo4j";

    /** Neo4j connection config (only when backend = "neo4j") */
    neo4j?: {
      uri: string;
      username: string;
      password: string;
      database?: string;
    };
  };

  retrieval: {
    graphExpansion: {
      /** Enable graph expansion in hybrid search (default: true when knowledge.enabled) */
      enabled: boolean;
      /** Max hops for neighborhood expansion (default: 1) */
      maxHops: number;
      /** Graph score weight in final merge (default: 0.3) */
      weight: number;
      /** Max graph-sourced chunks added to results (default: 4) */
      maxChunks: number;
    };
  };

  ingestion: {
    /** Allowed MIME types for manual ingestion */
    allowedMimeTypes: string[];
    /** Max file size in MB (default: 50) */
    maxFileSizeMb: number;
  };

  crawl: {
    /** Max pages per crawl job (default: 100) */
    maxPagesPerCrawl: number;
    /** Requests per second rate limit (default: 2) */
    requestsPerSecond: number;
    /** Respect robots.txt (default: true) */
    respectRobotsTxt: boolean;
    /** User-Agent header for crawl requests */
    userAgent: string;
  };
};
```

### Defaults

```typescript
export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig = {
  enabled: false,

  entityExtraction: {
    enabled: true,
    entityTypes: ["person", "org", "repo", "concept", "tool", "location", "event", "file"],
    relationshipTypes: [
      "uses",
      "depends_on",
      "authored_by",
      "discussed_in",
      "blocks",
      "related_to",
      "implements",
      "references",
      "part_of",
      "scheduled_for",
    ],
    gleaning: { enabled: true, passes: 1 },
    consolidation: { aliasMergeThreshold: 0.92, maxDescriptionFragments: 6 },
    batchSize: 1,
    concurrency: 4,
  },

  graph: { backend: "sqlite" },

  retrieval: {
    graphExpansion: {
      enabled: true,
      maxHops: 1,
      weight: 0.3,
      maxChunks: 4,
    },
  },

  ingestion: {
    allowedMimeTypes: [
      "text/markdown",
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/html",
      "application/json",
    ],
    maxFileSizeMb: 50,
  },

  crawl: {
    maxPagesPerCrawl: 100,
    requestsPerSecond: 2,
    respectRobotsTxt: true,
    userAgent: "Clawdbrain-Crawler/1.0",
  },
};
```

---

## Per-Agent Override

Following the same pattern as `memorySearch`, knowledge config can be overridden per agent:

```yaml
# Global defaults
agents:
  defaults:
    knowledge:
      enabled: true

# Agent-specific override
agents:
  my-research-agent:
    knowledge:
      entityExtraction:
        entityTypes: [person, org, concept, repo]
        model: "gpt-4.1-mini"  # use cheaper model for extraction
      crawl:
        maxPagesPerCrawl: 500   # allow larger crawls for research
        requestsPerSecond: 5

  my-coding-agent:
    knowledge:
      entityExtraction:
        entityTypes: [concept, tool, file, repo]
        relationshipTypes: [uses, depends_on, implements, references]
      retrieval:
        graphExpansion:
          maxHops: 2  # deeper expansion for code understanding
```

---

## Config Resolution

Config resolution follows the existing pattern in `src/agents/memory-search.ts`:

```typescript
export function resolveKnowledgeConfig(
  config: ClawdbrainConfig,
  agentId: string,
): KnowledgeConfig | null {
  const agentConfig = config.agents?.[agentId]?.knowledge;
  const defaultConfig = config.agents?.defaults?.knowledge;

  if (!agentConfig?.enabled && !defaultConfig?.enabled) return null;

  return deepMerge(DEFAULT_KNOWLEDGE_CONFIG, defaultConfig ?? {}, agentConfig ?? {});
}
```

---

## Relationship to memorySearch Config

Knowledge graph features require `memorySearch` to be enabled (since the graph is stored
in the same SQLite database and extraction piggybacks on the memory sync pipeline).

If a user enables `knowledge.enabled: true` but `memorySearch` is not enabled, the system
should log a warning and auto-enable memory search with defaults.

```
[knowledge] Warning: knowledge.enabled requires memorySearch.enabled.
            Auto-enabling memorySearch with defaults.
```

---

## CLI Configuration

```
clawdbrain config set agents.defaults.knowledge.enabled true
clawdbrain config set agents.defaults.knowledge.entityExtraction.model gpt-4.1-mini
clawdbrain config set agents.my-agent.knowledge.crawl.maxPagesPerCrawl 500
clawdbrain config get agents.defaults.knowledge
```
