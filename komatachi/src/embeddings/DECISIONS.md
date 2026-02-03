# Embeddings Module - Architectural Decisions

## Overview

This document records key decisions made while distilling the embeddings module from OpenClaw.

## Decision 1: Interface-First Design

**Context**: OpenClaw has three embedding providers (OpenAI, Gemini, local) with a factory abstraction.

**Decision**: Define `EmbeddingProvider` interface as the primary contract. Providers are created via factory functions, not classes.

**Rationale**:
- Interface makes the contract explicit
- Factory functions are simpler than class hierarchies
- Easy to add new providers without changing consumers
- Stateless design (no hidden instance state)

## Decision 2: No Provider Fallback

**Context**: OpenClaw's manager handles fallback between providers when one fails.

**Decision**: Providers throw on errors; no fallback logic in this layer.

**Rationale**:
- Fallback is orchestration, not embedding
- Layer boundary: embeddings only does embedding
- Caller (memory manager) can implement fallback if needed
- Clearer error semantics (you know which provider failed)

## Decision 3: No Caching

**Context**: OpenClaw caches embeddings in SQLite to avoid redundant API calls.

**Decision**: No caching in the embeddings module.

**Rationale**:
- Caching is a separate concern (storage layer)
- Providers should be pure: same input -> same output
- Caller can implement caching if needed
- Simpler testing (no cache state to manage)

## Decision 4: Batch API in Core Interface

**Context**: OpenClaw has separate batch modules (batch-openai.ts, batch-gemini.ts) with polling logic.

**Decision**: Include `embedBatch` in core interface, but keep it simple (single request, no polling).

**Rationale**:
- Batch is essential for efficiency (API calls are expensive)
- Simple batch (one request) is different from async batch jobs (polling)
- Async batch with polling belongs in a separate module if needed
- Most use cases work fine with synchronous batch

## Decision 5: OpenAI First

**Context**: Three providers in OpenClaw (OpenAI, Gemini, local).

**Decision**: Implement OpenAI provider first. Gemini and local can be added later.

**Rationale**:
- OpenAI is most widely used
- Validates the interface design
- Other providers follow the same pattern
- Avoids over-engineering before it's needed

## Decision 6: Include Vector Utilities

**Context**: OpenClaw's internal.ts has cosine similarity and other vector operations.

**Decision**: Include `cosineSimilarity`, `normalize`, and `euclideanDistance` in this module.

**Rationale**:
- These are pure functions, no dependencies
- Commonly needed alongside embeddings
- Simple enough to include inline
- Avoids creating a separate "utils" module

## Decision 7: Explicit Error Types

**Context**: OpenClaw uses generic errors with various properties.

**Decision**: Create specific error types: `EmbeddingError`, `EmbeddingAPIError`, `EmbeddingInputError`.

**Rationale**:
- Clear error hierarchy for different failure modes
- Callers can catch specific types
- Error includes provider name for debugging
- Preserves cause chain for debugging

## What We Removed

| OpenClaw Feature | Removed | Reason |
|-----------------|---------|--------|
| Provider fallback | Yes | Orchestration concern |
| Embedding cache | Yes | Storage concern |
| Async batch jobs (polling) | Yes | Separate module if needed |
| Gemini provider | Deferred | Not needed yet |
| Local llama provider | Deferred | Not needed yet |
| Headers fingerprinting | Yes | Cache concern |
| Provider key hashing | Yes | Cache concern |

## Metrics

| Metric | OpenClaw | Distilled |
|--------|----------|-----------|
| Lines (core embedding) | ~464 | ~290 |
| Providers implemented | 3 | 1 |
| Hidden state | Provider fallback state | None |
| Dependencies | Multiple API clients | fetch only |

## Open Questions

1. **Dimension validation**: Should we validate that returned vectors match expected dimensions?
   - Current: Trust the API
   - Alternative: Assert and throw on mismatch

2. **Rate limiting**: Should providers handle rate limiting (retry with backoff)?
   - Current: Throw on 429, caller handles retry
   - Alternative: Built-in exponential backoff
