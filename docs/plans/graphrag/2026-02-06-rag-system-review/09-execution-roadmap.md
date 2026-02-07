# Execution Roadmap: Graph-RAG Memory System

## Goal

Ship a reliable, explainable Graph-RAG memory system incrementally without regressing existing memory behavior.

## Phase 0: Stabilize Current Surface

Deliverables:

- Gate non-functional tools (`memory_query`, `memory_context_pack`) until wired.
- Add explicit runtime status reporting for adapters/backends.
- Ensure `memory_ingest` reports stage-level capability clearly.

Exit criteria:

- No user-visible "tool exists but not configured" surprises in default flows.

## Phase 1: Activate Orchestrated Query Path

Deliverables:

- Implement real `QueryOrchestrator` for `memory_query`.
- Implement context pack builder for `memory_context_pack` with citations and budgets.
- Integrate with existing legacy + progressive stores.

Exit criteria:

- `memory_query` and `memory_context_pack` return real results in test environments.
- Regression tests confirm legacy behavior remains intact.

## Phase 2: Graph Core in Local Mode

Deliverables:

- Add SQLite graph tables and evidence links.
- Entity/relationship extraction + consolidation from episodes.
- Graph expansion integrated into recall scoring.

Exit criteria:

- End-to-end graph-aware recall in local mode.
- Explainability includes graph contribution in score decomposition.

## Phase 3: Temporal Facts Layer

Deliverables:

- Add temporal fact schema and APIs (valid_from/valid_to).
- Add point-in-time query support.
- Add contradiction/supersession handling.

Exit criteria:

- Fact timeline queries produce stable historical snapshots.

## Phase 4: Web UX Integration (`apps/web`)

Deliverables:

- Replace mock data in memory route with gateway APIs.
- Ship graph explorer + evidence sidebar.
- Ship temporal facts panel.

Exit criteria:

- User can search, inspect graph context, and validate provenance from web UI.

## Phase 5: Scale Backend (Postgres+pgvector)

Deliverables:

- Provider abstraction implemented for memory+graph backends.
- Postgres+pgvector provider added and tested.
- Migration path from local SQLite mode.

Exit criteria:

- Same tool/API contracts in both local and Postgres modes.

## Phase 6: Optional Advanced Graph Mode (Neo4j/Graphiti)

Deliverables:

- Optional provider for advanced graph workloads.
- Feature-gated deployment and health checks.
- Migration and fallback playbooks.

Exit criteria:

- Advanced mode used only when threshold triggers are met.

## Test and Evaluation Plan

## Functional tests

- Ingestion pipeline stage tests
- Extraction/consolidation correctness tests
- Temporal fact query correctness tests
- API contract tests for tools and gateway routes

## Retrieval quality tests

- Golden query sets for local/graph/temporal recall
- Precision@k, Recall@k, citation correctness
- Hallucination reduction checks using source-anchored evaluation

## Performance tests

- P50/P95 latency for recall and context-pack generation
- Indexing throughput under controlled loads
- Memory/storage growth profiles

## Operational tests

- Adapter failure/fallback behavior
- Migration dry-runs (SQLite -> Postgres provider)
- Health/status endpoint validation

## Delivery Risks and Mitigation

1. Risk: architecture sprawl across legacy/progressive/graph paths.

- Mitigation: single orchestrator contract and capability gating.

2. Risk: backend lock-in due early implementation shortcuts.

- Mitigation: provider abstraction enforced before scale phase.

3. Risk: UI drift from backend reality.

- Mitigation: remove mock hooks early and enforce API-backed integration tests.

4. Risk: heavy global summarization blows token/cost budgets.

- Mitigation: keep global synthesis explicit and offline/deferred by default.

## Completion Definition

The system is considered complete for v1 when:

1. Users and agents get explainable, graph-aware, temporal-aware recall.
2. `apps/web` memory and graph views are fully API-backed.
3. Local mode is robust; Postgres scale mode is available; advanced graph mode is optional.
4. Existing `memory_search` and `memory_get` remain stable during and after migration.
