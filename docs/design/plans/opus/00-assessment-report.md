# Opus Evaluation: Architecture Primitives Assessment

**Evaluator:** Claude Opus 4.5
**Date:** 2026-02-04
**Scope:** All proposals in `docs/design/` and `docs/refactor/`

---

## Executive Summary

I evaluated 13 design and refactor proposals spanning agent execution, infrastructure, networking, and features. The proposals vary significantly in maturity, scope, and actionability.

**Key Finding:** The six agent execution primitives (Session Kernel, Runtime Context Resolver, Turn Execution Pipeline, Event/Hook Normalization, Session State Service, Entry Point Consolidation) share substantial overlap and should be **synthesized into a single unified architecture document** rather than implemented as independent primitives.

**Recommendations:**

1. **Synthesize** the agent execution stack into one coherent "Agent Execution Layer" proposal
2. **Refine** Plugin SDK and Strict Config proposals (high value, well-scoped)
3. **Defer** Clawnet (high risk, large scope, needs tighter scoping)
4. **Archive** Outbound Session Mirroring (implementation tracking doc, not a primitive)
5. **Accept as-is** Exec Host proposal (well-designed, clear scope)
6. **Introduce** two new primitives: Observable Pipeline Abstraction and Dependency Injection Container

---

## Proposal Inventory

### Group A: Agent Execution Primitives (Candidates for Synthesis)

| Proposal                  | Quality | Scope  | Risk   | Recommendation |
| ------------------------- | ------- | ------ | ------ | -------------- |
| Agent Session Kernel      | High    | Medium | Low    | Synthesize     |
| Runtime Context Resolver  | High    | Small  | Low    | Synthesize     |
| Turn Execution Pipeline   | High    | Medium | Low    | Synthesize     |
| Event/Hook Normalization  | Medium  | Medium | Medium | Synthesize     |
| Session State Service     | High    | Small  | Low    | Synthesize     |
| Entry Point Consolidation | High    | N/A    | Low    | Migration plan |

### Group B: Infrastructure Primitives

| Proposal                   | Quality | Scope      | Risk   | Recommendation |
| -------------------------- | ------- | ---------- | ------ | -------------- |
| Clawnet                    | High    | Very Large | High   | Defer/Re-scope |
| Exec Host                  | High    | Medium     | Medium | Accept         |
| Plugin SDK                 | High    | Large      | Medium | Refine         |
| Strict Config              | High    | Small      | Low    | Accept         |
| Outbound Session Mirroring | Medium  | Small      | Low    | Archive        |

### Group C: Features (Not Primitives)

| Proposal             | Quality | Scope      | Risk | Recommendation |
| -------------------- | ------- | ---------- | ---- | -------------- |
| Meridia Graph Memory | High    | Very Large | High | Feature work   |
| UX Card Density      | High    | Small      | Low  | UI work        |

---

## Detailed Analysis

### Group A: Agent Execution Primitives

#### Problem Context

The six documents address the same fundamental problem: **OpenClaw's agent execution is scattered across multiple entry points with duplicated logic**. Each proposal identifies overlapping pain points:

- Runtime selection duplicated in 5+ places
- Streaming normalization reimplemented per entry point
- Session metadata updates inconsistent
- Event emission varies by runtime kind
- Tool policy resolution scattered

#### Why Synthesis is Required

These proposals are not independent primitives; they describe **layers of a single execution stack**:

```
Entry Point (thin)
    ↓
Session Kernel (orchestration)
    ↓
Runtime Context Resolver (runtime selection)
    ↓
Turn Executor (execution + normalization)
    ↓
Session State Service (persistence)
    ↓
Event/Hook Router (observability)
```

Implementing these as separate primitives would:

1. Create artificial boundaries requiring excessive coordination
2. Risk interface mismatches between layers
3. Duplicate migration effort across multiple PRs
4. Miss opportunities for holistic simplification

#### Synthesis Approach

I have written a unified **Agent Execution Layer** proposal that:

- Combines all six proposals into coherent layers
- Defines clear interface contracts between layers
- Provides a single migration path
- Eliminates redundant type definitions

See: `01-agent-execution-layer.md`

---

### Group B: Infrastructure Primitives

#### Clawnet (Defer)

**Strengths:**

- Addresses real complexity (two protocols, approval routing)
- Well-researched current state analysis
- Clear role/scope separation model

**Concerns:**

- Scope is massive (protocol, auth, TLS, approvals, identity, migration)
- Six-phase migration with breaking changes
- Risk of partial implementation creating worse state
- Depends on changes across iOS, Android, macOS, Gateway

**Recommendation:** Defer until a tighter scope can be defined. Consider extracting "centralized approvals" as a standalone improvement that doesn't require protocol unification.

---

#### Exec Host (Accept)

**Strengths:**

- Clear config surface (`exec.host`, `exec.security`, `exec.ask`)
- Well-defined security model with safe defaults
- Practical implementation phases
- Doesn't require protocol changes

**Concerns:**

- IPC complexity with Unix sockets + token + HMAC
- UI dependency for approvals

**Recommendation:** Accept as-is. The proposal is implementable and addresses real user needs for cross-host execution.

---

#### Plugin SDK (Refine)

**Strengths:**

- Clean separation: SDK (compile-time) vs Runtime (execution)
- No `extensions/**` imports from `src/**` rule is excellent
- Phased migration from bridge patterns to runtime API

**Concerns:**

- Runtime surface is large (~150 lines of API)
- Python interop question (if adopting Graphiti) unaddressed
- Version compatibility matrix could become complex

**Recommendation:** Refine. The core architecture is sound but needs:

1. Trimmed runtime surface (start minimal, expand carefully)
2. Explicit versioning policy document
3. Golden test suite specification

---

#### Strict Config (Accept)

**Strengths:**

- Clear validation rules
- Doctor-only migrations is a sound principle
- Command gating prevents running with bad config

**Concerns:**

- May be disruptive for users with legacy configs

**Recommendation:** Accept. This is a high-value, low-risk improvement that prevents config drift.

---

#### Outbound Session Mirroring (Archive)

This is an implementation tracking document, not a primitive proposal. It describes completed work and open items.

**Recommendation:** Archive or move to a different location. It's useful as historical context but doesn't propose new architecture.

---

### Group C: Features

#### Meridia Graph Memory

This is a **feature proposal** for a specific memory system, not an architecture primitive. It depends on:

- External graph database (Neo4j, etc.)
- Vector store
- Multi-modal extraction pipeline

It's valuable but out of scope for "architecture primitives" evaluation. The Graphiti integration section is worth exploring separately.

#### UX Card Density

This is **UI design work**, not architecture. Well-executed but belongs in a different workstream.

---

## New Proposals Introduced

Based on gaps identified across the proposals, I'm introducing two new architecture primitives:

### 1. Observable Pipeline Abstraction

**Problem:** Multiple proposals describe pipelines (capture pipeline, turn execution pipeline, etc.) but each defines its own structure. A shared pipeline primitive would provide:

- Consistent stage composition
- Built-in observability (metrics, tracing, errors)
- Retry and timeout policies
- Testable stage isolation

See: `02-observable-pipeline-abstraction.md`

### 2. Dependency Injection Container

**Problem:** The codebase uses `createDefaultDeps` patterns that are inconsistent across modules. A lightweight DI container would:

- Centralize service instantiation
- Enable clean testing with mock injection
- Support scoped lifetimes (request, session, singleton)
- Eliminate circular dependency issues

See: `03-dependency-injection-container.md`

---

## Implementation Priority Matrix

| Priority | Proposal                            | Effort     | Value     | Risk   |
| -------- | ----------------------------------- | ---------- | --------- | ------ |
| P0       | Agent Execution Layer (synthesized) | Large      | Very High | Low    |
| P1       | Strict Config                       | Small      | High      | Low    |
| P1       | Observable Pipeline                 | Medium     | High      | Low    |
| P2       | Exec Host                           | Medium     | Medium    | Medium |
| P2       | DI Container                        | Medium     | High      | Low    |
| P3       | Plugin SDK                          | Large      | High      | Medium |
| P4       | Clawnet                             | Very Large | High      | High   |

---

## Conclusion

The agent execution primitives are the most impactful area for investment. Synthesizing them into a unified architecture will yield:

1. **One canonical execution path** for all agent runs
2. **Consistent behavior** across CLI, auto-reply, cron, and extensions
3. **Simplified debugging** with unified observability
4. **Lower maintenance cost** with less code duplication

The Observable Pipeline and DI Container proposals fill infrastructure gaps that will benefit not just the execution layer but future work across the codebase.

Clawnet should be deferred until the execution layer is stable and a tighter scope can be defined for protocol work.
