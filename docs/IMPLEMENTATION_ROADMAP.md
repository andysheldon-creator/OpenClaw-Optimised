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

## Week 3: Tiered Memory System 🔄

### Goal: Structured long-term memory for constant token budget

Based on `docs/research/memory.md` design:

#### SQLite FTS5 Memory Index
- Parse conversation facts into structured SQLite database
- FTS5 full-text search over fact content
- Entity tracking and linking

#### Retain Pipeline
- Extract structured facts from conversation turns
- Type tagging: World (W), Experience (B), Opinion (O), Observation (S)
- Entity mention extraction (@-mentions)
- Confidence scoring for opinions

#### Recall Service
- Lexical search (FTS5)
- Entity-centric retrieval
- Temporal queries
- Opinion queries with confidence

#### Reflect Job
- Entity summary generation
- Opinion confidence updates
- Core memory curation

### Expected Results
- Constant token usage regardless of history age
- Entity-centric retrieval
- Additional 15-20% cost reduction

---

## Week 4: Full Hybrid Routing

### Goal: Intelligent query routing for maximum cost savings

- Advanced query complexity classification
- Model-specific routing rules
- Screenshot optimization with Ollama Vision
- Automatic summarization of long conversations
- Performance tuning and benchmarking

### Expected Results
- Optimal cost/quality balance per query
- Vision processing moved to local inference

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
```

---

*Created: 2025-02-12*
*Last Updated: 2025-02-12*
*Status: Week 3 in progress*
