# Agent Humanization System — Architecture

## Vision

Make OpenClaw agents genuinely autonomous: they learn from mistakes, build intuition from patterns, manage energy, navigate relationships, and earn trust through track records — all backed by persistent state in PostgreSQL + Redis + TimescaleDB.

## Current State Analysis

### What Exists

1. **`src/infra/database/client.ts`** — PostgreSQL client via `postgres.js` (env-configured)
2. **`src/infra/cache/redis.ts`** — Redis client via `ioredis` (env-configured)
3. **`src/infra/database/unified-store.ts`** — Auto-detection: PG → SQLite → Memory
4. **`src/services/agent-humanization/humanization-service.ts`** — Skeleton with all 8 gaps using `pg.Pool` (NOT the unified client)
5. **`src/services/agent-humanization/models/types.ts`** — Complete TypeScript types for all 8 gaps
6. **`src/memory/`** — Existing memory system (embeddings, search, sqlite-vec)
7. **`src/agents/`** — Full agent pipeline (runner, tools, sessions, skills)

### What's Missing

1. **Database migrations** for all humanization tables (17+ tables)
2. **Integration with existing PG client** — Service uses `pg.Pool`, should use `postgres.js`
3. **Hook into agent pipeline** — processRequest() never called from agent runs
4. **Learning loop** — No feedback mechanism after task completion
5. **Energy tracking** — No real measurement of agent workload
6. **Relationship building** — No observer for inter-agent interactions
7. **TimescaleDB hypertables** — Schema exists in types but no CREATE statements

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Agent Pipeline                     │
│  (pi-embedded-runner → subscribe → tools)           │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Pre-Run  │→ │  Run LLM  │→ │  Post-Run Hook   │ │
│  │ Hook     │  │           │  │  (feedback loop)  │ │
│  └────┬─────┘  └───────────┘  └────────┬─────────┘ │
│       │                                 │           │
└───────┼─────────────────────────────────┼───────────┘
        │                                 │
        ▼                                 ▼
┌───────────────────────────────────────────────────┐
│         HumanizationService (Refactored)          │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │ Memory   │ │ Autonomy │ │ Learning Feedback  │ │
│  │ Manager  │ │ Manager  │ │ Loop               │ │
│  └──────────┘ └──────────┘ └───────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │ Energy   │ │ Relation │ │ Intuition Pattern  │ │
│  │ Tracker  │ │ Builder  │ │ Matcher            │ │
│  └──────────┘ └──────────┘ └───────────────────┘ │
│  ┌──────────┐ ┌──────────┐                       │
│  │ Reputat. │ │ Conflict │                       │
│  │ Tracker  │ │ Manager  │                       │
│  └──────────┘ └──────────┘                       │
└───────────────┬──────────────────┬───────────────┘
                │                  │
    ┌───────────┴──┐    ┌─────────┴──────┐
    │  PostgreSQL  │    │     Redis      │
    │  TimescaleDB │    │  (hot cache)   │
    │              │    │                │
    │ 17+ tables   │    │ profiles       │
    │ hypertables  │    │ energy state   │
    │ continuous   │    │ recent queries │
    │ aggregates   │    │ session ctx    │
    └──────────────┘    └────────────────┘
```

## Implementation Phases

### Phase 1: Database Foundation

- Migration 003-017: Create all humanization tables
- TimescaleDB hypertables for time-series data
- Continuous aggregates for analytics
- Indexes for common query patterns

### Phase 2: Service Refactor

- Replace `pg.Pool` with existing `postgres.js` client
- Replace direct Redis with unified cache
- Add graceful degradation (no PG = no humanization, silent)
- Add health check integration

### Phase 3: Pipeline Integration

- Pre-run hook: Load agent profile, check energy, set context
- Post-run hook: Record outcomes, update reputation, learn
- Inter-agent observer: Track collaboration quality
- Session completion handler: Update track record

### Phase 4: Learning Loop

- Outcome tracking: Was the agent's decision good?
- Pattern extraction: What worked? What didn't?
- Intuition refinement: Update trigger conditions & accuracy
- Skill progression: Track improvement over time

### Phase 5: Energy & Awareness

- Workload measurement: Tokens, tool calls, context switches
- Quality variance detection: Degradation over long sessions
- Circadian modeling: Agent performance patterns by hour
- Break recommendations: Suggest compaction/reset when fatigued

## Database Tables (17)

### Core Tables (PostgreSQL)

1. `agent_memory` — Persistent insights, decisions, patterns
2. `agent_relationships` — Trust scores, collaboration quality
3. `agent_reputation` — Reliability, speed, quality ratings
4. `agent_track_record` — Task completion history
5. `agent_autonomy_config` — Risk-based autonomy rules
6. `agent_intuition_rules` — Pattern-action mappings
7. `agent_assertiveness_rules` — Conflict response rules
8. `agent_person_insights` — Per-person behavioral insights
9. `agent_energy_state` — Current energy/focus snapshot
10. `agent_energy_baselines` — Per-agent optimal patterns
11. `agent_mistake_patterns` — Recurring error tracking
12. `agent_conflict_history` — Dispute resolution log

### Time-Series Tables (TimescaleDB hypertables)

13. `agent_decision_log` — Decision quality over time
14. `agent_learning_progress` — Skill proficiency curves
15. `agent_behavior_metrics` — Output quality, autonomy usage
16. `agent_reliability_history` — Reputation scores over time
17. `agent_energy_history` — Energy/focus fluctuations

### Continuous Aggregates

- `agent_daily_behavior` — Daily quality summaries
- `agent_hourly_energy` — Hourly energy patterns
- `agent_weekly_learning` — Weekly skill progression
- `agent_monthly_reputation` — Monthly reputation trends

## Integration Points

### 1. Agent Runner (pre-run)

File: `src/agents/pi-embedded-runner/run.ts`

```typescript
// Before LLM call
const profile = await humanization.getAgentProfile(agentId);
const energyAdvice = humanization.checkEnergy(profile);
if (energyAdvice.shouldDefer) {
  // Add energy context to system prompt
}
```

### 2. Agent Runner (post-run)

File: `src/auto-reply/reply/agent-runner.ts`

```typescript
// After successful response
await humanization.recordOutcome({
  agentId,
  taskType: "reply",
  quality: estimateQuality(response),
  duration: elapsedMs,
  tokenUsage: usage,
});
```

### 3. Session Spawn (task completion)

File: `src/agents/tools/sessions-spawn-tool.ts`

```typescript
// When sub-agent completes
await humanization.updateTrackRecord({
  agentId: spawnedAgent,
  taskId: sessionKey,
  outcome: result.success ? "success" : "failure",
  plannedMs,
  actualMs,
  qualityEstimate,
});
```

### 4. Collaboration Tool

File: `src/agents/tools/collaboration-tool.ts`

```typescript
// After debate resolution
await humanization.updateRelationship(agent1, agent2, {
  outcome: "agreed",
  quality: "good",
});
```

## Config

```yaml
# openclaw.yaml addition
humanization:
  enabled: true
  database: postgresql # or 'none' to disable
  energyTracking: true
  learningLoop: true
  reputationDecay: 0.95 # weekly decay factor
  autonomyDefaults:
    low: FULL
    medium: PROPOSE_THEN_DECIDE
    high: ASK_THEN_WAIT
```

## Files to Create/Modify

### New Files

- `src/services/agent-humanization/migrations/` — SQL migrations 003-017
- `src/services/agent-humanization/managers/` — Per-gap manager modules
- `src/services/agent-humanization/hooks/` — Pipeline integration hooks
- `src/services/agent-humanization/index.ts` — Clean exports

### Files to Modify

- `src/services/agent-humanization/humanization-service.ts` — Use postgres.js
- `src/infra/database/client.ts` — Add migrations 003-017 to migration runner
- `src/config/types.ts` — Add humanization config section
- `src/config/zod-schema.ts` — Validate humanization config
- `src/agents/pi-embedded-runner/run.ts` — Pre/post hooks
- `src/auto-reply/reply/agent-runner.ts` — Outcome recording
