# Current State: Graphiti + Graph-RAG in Clawdbrain

## Executive Status

Graphiti integration exists as scaffolding, not as an end-to-end production path.

## What Is Implemented

### 1. Pipeline skeleton

`src/memory/pipeline/ingest.ts` defines a full ingestion pipeline:

- `normalize`
- `extract`
- `enrich`
- `embed`
- `graph`
- `index`
- `audit`

### 2. Graphiti client contracts

`src/memory/graphiti/client.ts` and `src/memory/graphiti/adapter.ts` provide:

- Episode mapping from memory content
- HTTP calls for `/ingestEpisodes` and `/queryHybrid`
- Basic temporal field normalization/warnings

### 3. Graph stage wiring in pipeline

`src/memory/pipeline/graph.ts` invokes Graphiti ingest if a client is present.

### 4. Agent tool entry

`src/agents/tools/memory-ingest-tool.ts` exposes `memory_ingest`, and `src/agents/openclaw-tools.ts` registers it.

### 5. Progressive memory path

Structured progressive memory tools exist (`memory_store`, `memory_recall`, etc.), but this is separate from a full graph retrieval runtime.

## What Is Not Implemented

### 1. No active Graphiti dependency injection in runtime

`createMemoryIngestTool()` calls `runMemoryIngestionPipeline()` without adapters. This means:

- no embedder adapter passed
- no vector adapter passed
- no Graphiti client passed

So the pipeline frequently degrades with warnings (`embed.missing_adapter`, `index.missing_adapter`, `graph.missing_adapter`).

### 2. No production graph backend in repo path

`src/memory/graphiti/adapter_service.py` is a minimal in-memory FastAPI stub, not a real Graphiti-backed store.

### 3. Query tools are stubs

- `src/agents/tools/memory-query-tool.ts` (`memory_query`) returns `not_configured`.
- `src/agents/tools/memory-context-pack-tool.ts` (`memory_context_pack`) returns `not_configured`.

### 4. No graph config model in core memory config

Current memory config (`src/config/types.memory.ts`) includes `backend`, `qmd`, `progressive`, but no first-class Graphiti/graph provider configuration block.

### 5. Web UX not connected to real memory graph backend

- `apps/web/src/routes/memories/index.tsx` uses mock query data.
- Debug graph route is not a complete graph product surface.

## Risk Assessment

1. Architectural drift risk:

- Large design docs exist, but runtime wiring is partial.

2. False readiness risk:

- Tool names imply functionality (`memory_query`, `memory_context_pack`) that is currently unavailable.

3. Integration ambiguity:

- Multiple memory tracks (legacy, progressive, graph scaffolding) exist without a single orchestrated retrieval contract.

## Immediate Stabilization Recommendations

1. Add explicit feature flags and status surfacing:

- `memory.graph.enabled`
- `memory.graph.provider`
- `memory.graph.health`

2. Hide or gate non-functional tools by capability checks.

3. Wire a real orchestrator path before expanding tool surface:

- retrieval contract
- context pack generation
- explainable citations

4. Keep the current Graphiti adapter as an optional provider behind an interface, not as implicit default behavior.
