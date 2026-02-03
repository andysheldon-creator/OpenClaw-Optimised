# Component 2: Entity Extraction Pipeline

The extraction pipeline transforms unstructured text chunks into structured
entity/relationship tuples using LLM-driven NER with structured output prompts.

---

## Extraction Engine

**Purpose:** The core LLM-driven extraction that converts text chunks into typed entities
and typed relationships.

**File:** `src/knowledge/extraction/extractor.ts` (new)

### Configuration

```typescript
export type ExtractionConfig = {
  enabled: boolean;
  entityTypes: EntityType[]; // customizable per agent
  relationshipTypes: string[]; // customizable per agent
  model?: string; // override model for extraction (default: agent's model)
  gleaning: {
    enabled: boolean;
    passes: number; // 0 = no gleaning, 1 = one re-prompt, 2 = two
  };
  consolidation: {
    aliasMergeThreshold: number; // cosine similarity threshold (default 0.92)
    maxDescriptionFragments: number; // before triggering summarization (default 6)
  };
  batchSize: number; // chunks per extraction call (default 1)
};
```

### Model Selection

Extraction is token-intensive but does not need frontier-level reasoning. Default to the
agent's configured model, but allow override to a cheaper/faster model (e.g.
`gpt-4.1-mini`, `gemini-2.0-flash`, or a local model via Ollama). The extraction prompt
is designed to work with any model that can follow structured output instructions.

### Extraction Prompt

The LLM receives each chunk with a structured extraction prompt (inspired by
[LightRAG's delimiter-based approach](https://neo4j.com/blog/developer/under-the-covers-with-lightrag-extraction/)):

```
Given the following text, extract all entities and relationships.

Entity types: person, org, repo, concept, tool, location, event, file
Output format (one per line):
  ("entity" | "<name>" | "<type>" | "<description>")

Relationship format (one per line):
  ("relationship" | "<source_name>" | "<target_name>" | "<rel_type>" | "<description>" | "<keywords>" | <strength 1-10>)

Relationship types: uses, depends_on, authored_by, discussed_in, blocks, related_to,
  implements, references, part_of, scheduled_for

Text:
---
{chunk_text}
---
```

**Why delimiter-based over JSON:** Delimiter format is more token-efficient and works
reliably across models (including smaller local models). JSON mode is supported as a
fallback for models that handle it better.

### Gleaning Loop

After the initial extraction pass, the system optionally re-prompts with:

> "Many entities and relationships were missed in the previous extraction.
> Please identify additional entities and relationships not already listed."

This is [LightRAG's gleaning strategy](https://neo4j.com/blog/developer/under-the-covers-with-lightrag-extraction/)
for improving recall without complex multi-pass architectures. Configurable via
`gleaning.passes: 0|1|2` (default 1).

**Why it works:** LLMs tend to extract the most prominent entities first. A second pass
with explicit "you missed things" framing consistently surfaces 10-20% additional entities,
particularly less obvious relationships and secondary entities.

### Structured Output Parsing

**File:** `src/knowledge/extraction/parser.ts` (new)

The extractor parses LLM output line-by-line using delimiter-based parsing, with fallback
to JSON mode if the model supports it:

```typescript
export function parseExtractionOutput(raw: string): {
  entities: ParsedEntity[];
  relationships: ParsedRelationship[];
  unparsed: string[];
} {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const entities: ParsedEntity[] = [];
  const relationships: ParsedRelationship[] = [];
  const unparsed: string[] = [];

  for (const line of lines) {
    const entityMatch = line.match(
      /\("entity"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\)/,
    );
    if (entityMatch) {
      entities.push({
        name: entityMatch[1],
        type: entityMatch[2] as EntityType,
        description: entityMatch[3],
      });
      continue;
    }

    const relMatch = line.match(
      /\("relationship"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*(\d+)\)/,
    );
    if (relMatch) {
      relationships.push({
        sourceName: relMatch[1],
        targetName: relMatch[2],
        type: relMatch[3],
        description: relMatch[4],
        keywords: relMatch[5].split(",").map((k) => k.trim()),
        strength: parseInt(relMatch[6], 10),
      });
      continue;
    }

    unparsed.push(line);
  }

  return { entities, relationships, unparsed };
}
```

Malformed lines are logged and skipped (graceful degradation). The `unparsed` array is
available for debugging extraction quality.

### Batch Extraction Optimization

For bulk ingestion (crawl, large file upload), chunks are batched and processed with
concurrency control:

- **Concurrency:** Configurable (default 4 concurrent extraction calls)
- **Provider agnostic:** Uses the existing LLM provider abstraction so any configured
  provider (OpenAI, Gemini, Anthropic, local) can drive extraction
- **Cost optimization:** For OpenAI, consider routing extraction through the Batch API
  (already used for embeddings in `src/memory/batch-openai.ts`) for 50% cost reduction
  at the expense of latency (24h turnaround)

### Extraction Cost Analysis

For 100 chunks at ~400 tokens each, extraction adds approximately:

| Model            | Input tokens | Output tokens | Cost per sync |
| ---------------- | ------------ | ------------- | ------------- |
| GPT-4.1-mini     | ~40K         | ~10K          | ~$0.03        |
| Gemini 2.0 Flash | ~40K         | ~10K          | ~$0.01        |
| Local (Ollama)   | ~40K         | ~10K          | $0.00         |

**Mitigation strategies:**

- Only extract from new/changed chunks (delta sync, already the existing behavior)
- Use cheaper models for extraction (configurable `model` override)
- Batch extraction calls where possible
- Cache extraction results per chunk content hash

### Files to Create

- `src/knowledge/extraction/extractor.ts` -- main extraction pipeline
- `src/knowledge/extraction/parser.ts` -- output parsing (delimiter + JSON fallback)
- `src/knowledge/extraction/prompts.ts` -- extraction prompt templates
- `src/knowledge/extraction/extractor.test.ts`
- `src/knowledge/extraction/parser.test.ts`
