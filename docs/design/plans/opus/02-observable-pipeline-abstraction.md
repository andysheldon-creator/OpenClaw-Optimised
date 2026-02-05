# Observable Pipeline Abstraction

**Status:** New Proposal
**Author:** Claude Opus 4.5
**Date:** 2026-02-04

---

## Summary

The Observable Pipeline Abstraction is a composable, stage-based execution framework that provides consistent error handling, observability, and retry policies. It can be used to implement the capture pipeline (memory ingestion), turn execution pipeline (agent runs), and any future multi-stage processing flows.

---

## Problem Statement

Multiple proposals describe pipelines with similar characteristics:

| Proposal             | Pipeline           | Stages                                                       |
| -------------------- | ------------------ | ------------------------------------------------------------ |
| Meridia Graph Memory | Capture Pipeline   | Normalize, Extract, Enrich, Embed, Graph Write, Index, Audit |
| Turn Execution       | Turn Pipeline      | Prepare, Execute, Normalize, Emit Events                     |
| Plugin SDK           | Migration Pipeline | Discover, Validate, Transform, Write                         |

Each proposal defines its own:

- Stage composition model
- Error handling strategy
- Retry and timeout policies
- Observability hooks
- Testing patterns

This leads to:

- Duplicated infrastructure code
- Inconsistent error handling across pipelines
- Ad-hoc observability that varies by implementation
- Difficult testing of individual stages

---

## Goals

1. **Composable stages** with clear input/output contracts
2. **Built-in observability** (metrics, tracing, structured logging)
3. **Configurable error handling** (fail-fast, continue, retry)
4. **Timeout enforcement** per stage and total
5. **Testable isolation** of individual stages
6. **Zero runtime overhead** for simple pipelines

## Non-Goals

- Distributed pipeline execution (single-process only)
- Persistent pipeline state (stateless between runs)
- Visual pipeline builder UI

---

## Core Concepts

### Stage

A stage is a single unit of work with typed input and output:

```ts
export interface Stage<TIn, TOut, TCtx = unknown> {
  name: string;
  execute(input: TIn, ctx: TCtx): Promise<TOut>;

  // Optional configuration
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  continueOnError?: boolean;
}
```

### Pipeline

A pipeline composes stages into a sequential flow:

```ts
export interface Pipeline<TIn, TOut> {
  name: string;
  execute(input: TIn): Promise<PipelineResult<TOut>>;

  // Observability
  on(event: PipelineEvent, handler: EventHandler): void;
}

export interface PipelineResult<T> {
  success: boolean;
  output?: T;
  error?: PipelineError;
  stages: StageResult[];
  metrics: PipelineMetrics;
}
```

### Context

Shared context flows through all stages:

```ts
export interface PipelineContext {
  runId: string;
  startedAt: number;
  logger: Logger;
  metrics: MetricsCollector;

  // Stage can store intermediate data
  data: Map<string, unknown>;
}
```

---

## Pipeline Builder API

```ts
const capturePipeline = Pipeline.create<IngestRequest, IngestResult>("capture")
  .addStage({
    name: "normalize",
    execute: async (input, ctx) => {
      ctx.logger.debug("Normalizing content", { count: input.content.length });
      return normalizeContent(input);
    },
    timeout: 5000,
  })
  .addStage({
    name: "extract",
    execute: async (normalized, ctx) => {
      return extractArtifacts(normalized);
    },
    timeout: 30000,
    retries: 2,
  })
  .addStage({
    name: "enrich",
    execute: async (extracted, ctx) => {
      return enrichEntities(extracted);
    },
    continueOnError: true, // Partial enrichment OK
  })
  .addStage({
    name: "embed",
    execute: async (enriched, ctx) => {
      return generateEmbeddings(enriched);
    },
    timeout: 60000,
  })
  .addStage({
    name: "persist",
    execute: async (embedded, ctx) => {
      await Promise.all([writeToGraph(embedded), writeToVectorStore(embedded)]);
      return { success: true, count: embedded.entities.length };
    },
  })
  .build();
```

---

## Observability

### Events

Pipelines emit events at key points:

```ts
export type PipelineEvent =
  | "pipeline.start"
  | "pipeline.end"
  | "pipeline.error"
  | "stage.start"
  | "stage.end"
  | "stage.error"
  | "stage.retry";

export interface StageEvent {
  pipeline: string;
  stage: string;
  runId: string;
  timestamp: number;
  durationMs?: number;
  error?: Error;
  retryCount?: number;
}
```

### Metrics

Built-in metrics collection:

```ts
export interface PipelineMetrics {
  totalDurationMs: number;
  stages: Map<string, StageMetrics>;
}

export interface StageMetrics {
  durationMs: number;
  retries: number;
  success: boolean;
  errorMessage?: string;
}
```

### Tracing

Each run has a `runId` that correlates all events:

```ts
const result = await pipeline.execute(input);

// All logs, metrics, and events share the same runId
console.log(result.runId); // "pipe_abc123"
```

---

## Error Handling Modes

### Fail-Fast (Default)

Pipeline stops at first error:

```ts
Pipeline.create("strict")
  .addStage({ name: "a", execute: stepA })
  .addStage({ name: "b", execute: stepB }) // Error here
  .addStage({ name: "c", execute: stepC }) // Never runs
  .build();
```

### Continue on Error

Individual stages can allow continuation:

```ts
Pipeline.create("resilient")
  .addStage({
    name: "optional",
    execute: optionalStep,
    continueOnError: true, // Pipeline continues even if this fails
  })
  .addStage({ name: "required", execute: requiredStep })
  .build();
```

### Retry with Backoff

Stages can specify retry behavior:

```ts
.addStage({
  name: "flaky-api",
  execute: callExternalApi,
  retries: 3,
  retryDelay: 1000, // 1s, 2s, 4s (exponential)
})
```

---

## Timeout Enforcement

### Per-Stage Timeout

```ts
.addStage({
  name: "slow-operation",
  execute: slowOp,
  timeout: 30000, // 30 seconds
})
```

### Total Pipeline Timeout

```ts
const pipeline = Pipeline.create("bounded")
  .setTotalTimeout(120000) // 2 minutes for entire pipeline
  .addStage(...)
  .build();
```

---

## Testing

### Stage Isolation

Test individual stages without pipeline overhead:

```ts
import { normalizeStage } from "./stages/normalize";

test("normalizeStage handles empty content", async () => {
  const input = { content: [] };
  const ctx = createTestContext();

  const result = await normalizeStage.execute(input, ctx);

  expect(result.normalized).toEqual([]);
});
```

### Pipeline Mocking

Replace stages for integration tests:

```ts
const mockPipeline = pipeline.withMockedStage("embed", async (input) => {
  return { embeddings: [] }; // Skip real embedding
});

const result = await mockPipeline.execute(testInput);
```

### Result Assertions

Inspect pipeline execution:

```ts
const result = await pipeline.execute(input);

expect(result.success).toBe(true);
expect(result.stages).toHaveLength(5);
expect(result.stages[2].name).toBe("enrich");
expect(result.metrics.totalDurationMs).toBeLessThan(5000);
```

---

## Use Cases

### Memory Capture Pipeline

```ts
const capturePipeline = Pipeline.create<IngestRequest, IngestResult>("capture")
  .addStage(normalizeStage)
  .addStage(extractStage)
  .addStage(enrichStage)
  .addStage(embedStage)
  .addStage(graphWriteStage)
  .addStage(vectorIndexStage)
  .addStage(auditStage)
  .build();
```

### Turn Execution Pipeline

```ts
const turnPipeline = Pipeline.create<TurnInput, TurnOutcome>("turn")
  .addStage(prepareContextStage)
  .addStage(executeRuntimeStage)
  .addStage(normalizeOutputStage)
  .addStage(emitEventsStage)
  .build();
```

### Config Migration Pipeline

```ts
const migrationPipeline = Pipeline.create<Config, Config>("migration")
  .addStage(validateCurrentStage)
  .addStage(detectLegacyKeysStage)
  .addStage(transformKeysStage)
  .addStage(validateResultStage)
  .addStage(writeConfigStage)
  .build();
```

---

## Implementation Plan

### Phase 1: Core Framework

1. Define `Stage`, `Pipeline`, `PipelineResult` types
2. Implement `Pipeline.create()` builder
3. Implement sequential stage execution
4. Add basic error handling

### Phase 2: Observability

1. Add event emission system
2. Implement metrics collection
3. Add runId correlation
4. Integrate with existing logging

### Phase 3: Advanced Features

1. Add timeout enforcement
2. Add retry with exponential backoff
3. Add `continueOnError` support
4. Add stage mocking for tests

### Phase 4: Adoption

1. Refactor Turn Executor to use pipeline
2. Implement Capture Pipeline using framework
3. Document patterns and best practices

---

## Risks and Mitigations

| Risk                            | Mitigation                                   |
| ------------------------------- | -------------------------------------------- |
| Overhead for simple pipelines   | Lazy initialization, zero-cost when unused   |
| Complexity for new contributors | Clear examples, minimal required API         |
| Over-abstraction                | Start minimal, add features only when needed |

---

## Success Criteria

1. Turn execution uses pipeline abstraction
2. Memory capture uses same abstraction
3. All pipelines have consistent metrics and logging
4. Individual stages are unit-testable
5. No custom pipeline implementations outside the framework

---

## Related Docs

- [Agent Execution Layer](/design/plans/opus/01-agent-execution-layer)
- [Meridia Graph Memory](/design/meridia-graph-memory)
