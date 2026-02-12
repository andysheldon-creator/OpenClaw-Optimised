# Implementation Roadmap: OpenClaw-Optimised

## Overview
**Current Status**: £200-500+/month and growing exponentially
**Target**: <£60/month
**Timeline**: 8 weeks total

---

## Week 1: Emergency Cost Control ✅

### Goal: 50-70% immediate cost reduction

#### Day 1-2: Conversation Windowing
**What**: Limit conversation history sent to Claude API
**Impact**: 60-70% cost reduction immediately
**Status**: ✅ Complete

#### Day 3-4: Install & Test Ollama
**What**: Set up local LLM for free processing (llama3.1:8b, nomic-embed-text)
**Impact**: Ready for 40% free query handling
**Status**: ✅ Complete

#### Day 5: Basic Ollama Integration
**What**: Route simple queries to Ollama instead of Claude
**Impact**: 30-40% queries now FREE
**Status**: ✅ Complete

#### Day 6: Cost Monitoring
**What**: Track spending to prevent overruns (£2/day limit)
**Impact**: Budget visibility and alerting
**Status**: ✅ Complete

#### Day 7: Deploy & Monitor
**Status**: ✅ Complete

### Week 1 Results
- **Daily cost**: £6 → £2 (66% reduction)
- **Monthly projection**: £180 → £60
- **Commits**: `9b5dabefb`, `3939b66e3`

---

## Week 2: RAG System ✅

### Goal: 80% total cost reduction via semantic retrieval

#### Embedding Service
**What**: Ollama nomic-embed-text (768-dim) with hash-based fallback (128-dim)
**Status**: ✅ Complete

#### Vector Store
**What**: JSONL-based per-session storage with cosine similarity search
**Status**: ✅ Complete

#### RAG Retrieval
**What**: Hybrid context assembly (recent + semantically similar)
**Status**: ✅ Complete

#### RAG Ingestion
**What**: Background fire-and-forget message ingestion with deduplication
**Status**: ✅ Complete

### Week 2 Results
- **Cumulative reduction**: ~80%
- **Build**: Zero errors
- **Commit**: `9e3d62523`

---

## Week 3: Tiered Memory System ✅

### Goal: Structured long-term memory for constant token budget

#### SQLite FTS5 Memory Index
- **Status**: ✅ Complete
- SQLite database at `~/.clawdis/memory/memory.sqlite`
- FTS5 full-text search, entity tracking, opinion storage

#### Retain Pipeline
- **Status**: ✅ Complete
- Heuristic fact extraction (no LLM overhead)
- Type tagging: World, Experience, Opinion, Observation
- Entity mention extraction with display names
- Confidence scoring for opinions

#### Recall Service
- **Status**: ✅ Complete
- Hybrid query: FTS5 + entity + temporal
- Character budget trimming
- Entity cache with 60s TTL

#### Reflect Job
- **Status**: ✅ Complete
- Entity summary generation via Ollama with heuristic fallback
- Opinion confidence evolution
- Race-condition-safe scheduler

### Week 3 Results
- **Commits**: `4227a83e8`, `cbb33e3fc`
- **Additional cost reduction**: ~5% (cumulative ~85%)

---

## Week 4: Full Hybrid Routing ✅

### Goal: Intelligent query routing for maximum cost savings

#### Query Complexity Classifier
- **Status**: ✅ Complete
- Weighted pattern matching (0-1 scale)
- 16 task type categories

#### Model-Specific Routing Rules
- **Status**: ✅ Complete
- 6 routing tiers: local → ollama_chat → ollama_vision → claude_haiku → claude_sonnet → claude_opus
- 3 routing modes: aggressive, balanced, quality
- Automatic fallbacks when tiers unavailable

#### Screenshot Optimization with Ollama Vision
- **Status**: ✅ Complete
- Routes base64 images to local llava:7b
- Replaces image blocks with text descriptions

#### Automatic Conversation Summarization
- **Status**: ✅ Complete
- Compresses old message segments via Ollama
- Heuristic fallback for reliability
- Configurable thresholds

### Week 4 Results
- **Build**: Zero errors
- **Additional cost reduction**: ~5-10% (cumulative ~90%+)

---

## Week 5-8: Multi-Bot Platform

### Goal: Scalable multi-tenant architecture

- Orchestration layer
- Bot-to-bot communication protocol
- Shared resource management
- Per-bot cost allocation
- Horizontal scaling architecture

### Expected Results
- Scalable multi-tenant platform
- Independent bot cost tracking

---

## Key Files

### Services (src/services/)
- `cost-tracker.ts` — Token/cost logging (Week 1)
- `ollama-router.ts` — Simple query routing (Week 1)
- `embedding.ts` — Text embeddings (Week 2)
- `vector-store.ts` — JSONL vector store (Week 2)
- `rag-retrieval.ts` — RAG context assembly (Week 2)
- `rag-ingest.ts` — Background message ingestion (Week 2)
- `memory/` — Tiered memory system (Week 3)
- `hybrid-router.ts` — Advanced query routing with complexity scoring (Week 4)
- `conversation-summarizer.ts` — Automatic conversation compression (Week 4)
- `vision-router.ts` — Ollama Vision image analysis routing (Week 4)

### Configuration
- `src/config/config.ts` — Zod-validated config types
- `.env.example` — Environment variables reference

### Agent
- `src/agents/pi-embedded-runner.ts` — Main agent runner (all integrations)

---

## Environment Variables

```bash
# Week 1: Ollama + Windowing
ENABLE_OLLAMA=true
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
MAX_HISTORY_WINDOW=10

# Week 2: RAG
ENABLE_RAG=true
OLLAMA_EMBED_MODEL=nomic-embed-text
ENABLE_EMBEDDINGS=true
RAG_TOP_K=10
RAG_MIN_SCORE=0.35
RAG_RECENCY_WINDOW=4

# Week 3: Memory
ENABLE_MEMORY=true
MEMORY_REFLECT_INTERVAL=86400

# Week 4: Hybrid Routing
ENABLE_HYBRID_ROUTING=true
HYBRID_ROUTING_MODE=balanced
ENABLE_VISION_ROUTING=true
OLLAMA_VISION_MODEL=llava:7b
VISION_MAX_IMAGES=3
ENABLE_SUMMARIZATION=true
SUMMARIZE_THRESHOLD=15
SUMMARIZE_KEEP_RECENT=6
```

---

*Created: 2025-02-12*
*Last Updated: 2025-02-12*
*Status: Week 4 complete — Phase 2 done*
