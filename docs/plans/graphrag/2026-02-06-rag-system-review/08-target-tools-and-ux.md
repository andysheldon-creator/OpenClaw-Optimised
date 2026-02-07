# Target Tools and UX for Graph-RAG Memory

## Objective

Define the user-facing and agent-facing interfaces for the target Graph-RAG memory system in Clawdbrain, with specific alignment to the active web app (`apps/web/*`).

## Tool Surface (Agent Runtime)

## Keep Existing Compatibility

- `memory_search` (legacy file/vector path)
- `memory_get` (targeted file reads)

These remain available during migration.

## Structured/Graph-RAG Tools

### `memory_store`

Purpose:

- Persist durable memory with category/priority/tags/expiry.

### `memory_recall`

Purpose:

- Budgeted, structured recall from progressive + graph-aware sources.

### `memory_index_status`

Purpose:

- Report legacy/progressive/graph backend health and index freshness.

### `memory_audit`

Purpose:

- Token and quality audit with optimization recommendations.

### `memory_query` (activate, not stub)

Purpose:

- Orchestrated query endpoint for hybrid/temporal/graph retrieval.

### `memory_context_pack` (activate, not stub)

Purpose:

- Return model-ready context packs with citations and ranking rationale.

### Optional explicit graph tools

- `graph_search`
- `graph_inspect`
- `graph_path`
- `fact_query_at_time`

These are valuable for advanced users and debugging, but `memory_recall` should hide most complexity for normal agent workflows.

## API Surface (Gateway)

Add/activate endpoints behind auth:

- `POST /api/memory/query`
- `POST /api/memory/context-pack`
- `GET /api/memory/status`
- `GET /api/memory/audit`
- `GET /api/graph/stats`
- `GET /api/graph/neighborhood`
- `GET /api/graph/entity/:id`
- `POST /api/facts/query-at-time`

## Web UX Surface (`apps/web/*`)

## 1) Memory workspace (upgrade current mock route)

Current `apps/web/src/routes/memories/index.tsx` uses mock query hooks. Replace with real gateway data and actions:

- search and filter (type/tag/time/source)
- save/edit/delete
- show retrieval reason and citations
- show memory freshness and confidence

## 2) Graph explorer

Use the existing graph integration scaffolding (`GraphExplorer`, `ReagraphView`) as the base for:

- entity/relationship visualization
- neighborhood expansion
- evidence panel (which episodes/chunks support this edge)
- temporal view toggle

## 3) Temporal facts panel

Add a dedicated view for:

- current facts
- historical facts at date/time
- change timeline and supersession chain

## 4) Explainability panel

For any recall result:

- score decomposition (`vector`, `lexical`, `graph`, `recency`, `salience`)
- source references (path/session/url + offsets)
- temporal validity window

## UX Patterns to Borrow

### From OpenMemory

- SDK/API/MCP/editor parity mindset
- explicit "why this was recalled"

### From GraphRAG

- retrieval mode switch (local/global/drift-equivalent)
- clear distinction between specific-entity and whole-corpus questions

### From openclaw-memory-template

- low-friction daily memory hygiene and routine-based capture

## UX Anti-Patterns to Avoid

1. Hiding retrieval source/why-ranked details.
2. Forcing users into graph complexity for simple recall tasks.
3. Mixing heavy global synthesis into every interactive query.
4. Building new memory UI in `ui/*` instead of `apps/web/*`.

## Success Criteria

1. Agent and user can answer "where did this memory come from?" quickly.
2. Memory route in `apps/web` is backed by real APIs, not mocks.
3. Graph and temporal views are optional depth tools, not mandatory for basic usage.
4. Tool contracts remain stable across backend provider changes.
