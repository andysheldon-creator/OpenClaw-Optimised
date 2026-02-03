# GraphRAG Entity Extraction & Knowledge Graph Proposal

## Problem Statement

Clawdbrain's memory system is powerful but flat. The current pipeline -- markdown files
chunked into ~400-token segments, embedded, and stored in SQLite with sqlite-vec -- excels
at semantic similarity search but cannot answer structural questions:

- "What entities did we discuss across sessions last week?"
- "What is the dependency chain between the auth refactor and the migration goal?"
- "Which people/orgs/repos have been referenced in relation to this project?"
- "Show me how this goal's subtasks relate to entities in the codebase."

The Overseer already models hierarchical goals/phases/tasks/subtasks, but those nodes live
in a JSON store with no graph-traversal capability, no cross-referencing to extracted
entities, and no way to discover emergent structure across sessions or documents.

This proposal adds five capabilities:

1. **Entity extraction** -- LLM-driven NER + relationship extraction on ingested content
2. **Knowledge graph persistence** -- a lightweight embedded graph layer on top of the
   existing SQLite infrastructure (no external Neo4j dependency by default)
3. **Hybrid GraphRAG retrieval** -- graph-augmented context hydration that combines the
   existing vector/BM25 search with graph neighborhood expansion
4. **Manual ingestion & crawling** -- bring-your-own docs, URL crawling, and file upload
5. **Web visualization** -- an interactive graph explorer in the existing Lit-based control UI

## Architecture Overview

```
                          ┌──────────────────────────────────────────┐
                          │            Ingestion Layer               │
                          │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                          │  │  Memory   │ │  Manual  │ │  Web     │ │
                          │  │  Files    │ │  Upload  │ │  Crawler │ │
                          │  └────┬─────┘ └────┬─────┘ └────┬─────┘ │
                          │       └──────┬─────┴──────┬─────┘       │
                          │              ▼            ▼             │
                          │       ┌──────────┐ ┌────────────┐       │
                          │       │ Chunker  │ │ Doc Parser │       │
                          │       └────┬─────┘ └─────┬──────┘       │
                          └────────────┼─────────────┼──────────────┘
                                       ▼             ▼
                          ┌──────────────────────────────────────────┐
                          │         Extraction Pipeline              │
                          │  ┌──────────────────────────────┐        │
                          │  │  LLM Entity/Relation Extractor│       │
                          │  │  (structured output prompts) │        │
                          │  └──────────┬───────────────────┘        │
                          │             ▼                            │
                          │  ┌──────────────────────────────┐        │
                          │  │  Entity Consolidation &      │        │
                          │  │  Deduplication (MD5 + fuzzy)  │        │
                          │  └──────────┬───────────────────┘        │
                          └─────────────┼────────────────────────────┘
                                        ▼
              ┌─────────────────────────────────────────────────────────┐
              │                  Storage Layer                          │
              │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
              │  │  SQLite Vec  │  │  SQLite FTS5 │  │  SQLite      │  │
              │  │  (embeddings)│  │  (keywords)  │  │  Graph Tables│  │
              │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
              │         └────────┬────────┴────────┬────────┘          │
              │                  ▼                 ▼                   │
              │         ┌────────────────────────────────┐             │
              │         │   Hybrid GraphRAG Retriever    │             │
              │         │   vector + BM25 + graph hops   │             │
              │         └────────────────┬───────────────┘             │
              └──────────────────────────┼─────────────────────────────┘
                                         ▼
              ┌─────────────────────────────────────────────────────────┐
              │              Consumer Layer                             │
              │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
              │  │  Agent Tools │  │  Overseer    │  │  Web UI      │  │
              │  │  (memory_*,  │  │  Goal→Entity │  │  Graph       │  │
              │  │   graph_*)   │  │  Linking     │  │  Explorer    │  │
              │  └──────────────┘  └──────────────┘  └──────────────┘  │
              └─────────────────────────────────────────────────────────┘
```

## Document Index

| #   | Document                                                | Summary                                                                                                      |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | [Ingestion Layer](./01-ingestion-layer.md)              | Memory file hooks, manual document upload (PDF/DOCX/MD), web crawler with sitemap/recursive modes            |
| 2   | [Entity Extraction Pipeline](./02-entity-extraction.md) | LLM-driven NER, structured output parsing, gleaning loop, batch optimization                                 |
| 3   | [Entity Consolidation](./03-entity-consolidation.md)    | Alias merging via embedding similarity, type resolution, description summarization, relationship re-pointing |
| 4   | [Graph Storage Layer](./04-graph-storage.md)            | SQLite graph tables, recursive CTE query engine, optional Neo4j extension                                    |
| 5   | [Hybrid GraphRAG Retrieval](./05-hybrid-retrieval.md)   | 3-phase retrieval algorithm, graph expansion, context formatting for agent consumption                       |
| 6   | [Overseer Integration](./06-overseer-integration.md)    | Goal/task entity linking, dependency-aware planning via graph queries                                        |
| 7   | [Agent Tools](./07-agent-tools.md)                      | graph_search, graph_inspect, knowledge_ingest, knowledge_crawl tools + enhanced memory_search                |
| 8   | [Web Visualization](./08-web-visualization.md)          | D3-force graph explorer, gateway API endpoints, ingestion management UI                                      |
| 9   | [Configuration](./09-configuration.md)                  | KnowledgeConfig schema, per-agent overrides, all defaults                                                    |
| 10  | [Implementation Plan](./10-implementation-plan.md)      | 6-phase rollout, file manifests, demo scenarios, open questions & trade-offs                                 |

## Existing Infrastructure This Builds On

| Subsystem            | Location                                        | What it provides                                                    |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Vector memory search | `src/memory/manager.ts` (2,178 LOC)             | SQLite + sqlite-vec embeddings, chunking, hybrid BM25/vector search |
| Hybrid merge         | `src/memory/hybrid.ts`                          | `mergeHybridResults()` with configurable vector/text weights        |
| Embedding providers  | `src/memory/embeddings*.ts`                     | OpenAI, Gemini, local (node-llama-cpp) with auto-selection          |
| Batch embedding      | `src/memory/batch-openai.ts`, `batch-gemini.ts` | Cost-effective bulk embedding via provider batch APIs               |
| Memory tools         | `src/agents/tools/memory-tool.ts`               | `memory_search` + `memory_get` agent tools                          |
| Overseer             | `src/infra/overseer/`                           | Goal/phase/task/subtask hierarchy with planner + runner             |
| Web UI               | `ui/`                                           | Lit + Tailwind control panel (Vite-built)                           |
| Gateway API          | `src/provider-web.ts`                           | Authenticated HTTP API for web UI                                   |
| Context system       | `src/agents/system-prompt.ts`                   | Dynamic prompt assembly with memory, skills, identity sections      |
| Config               | `src/config/`                                   | Zod-validated YAML config with per-agent overrides                  |

## References

- [Archon OS -- Knowledge and task management backbone for AI coding assistants](https://github.com/coleam00/Archon)
- [Archon Knowledge Management System (DeepWiki)](https://deepwiki.com/coleam00/Archon/5-knowledge-management)
- [LightRAG: Entity Extraction with Neo4j (Neo4j Blog)](https://neo4j.com/blog/developer/under-the-covers-with-lightrag-extraction/)
- [What is GraphRAG Knowledge Graph (PuppyGraph)](https://www.puppygraph.com/blog/graphrag-knowledge-graph)
- [Knowledge Graph-Guided Retrieval Augmented Generation (NAACL 2025)](https://aclanthology.org/2025.naacl-long.449.pdf)
- [The Next Frontier of RAG: Enterprise Knowledge Systems 2026-2030](https://nstarxinc.com/blog/the-next-frontier-of-rag-how-enterprise-knowledge-systems-will-evolve-2026-2030/)
