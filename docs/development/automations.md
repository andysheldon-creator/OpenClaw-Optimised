# Automations - Developer Guide

This guide covers the technical implementation of the Automations feature for developers who want to extend or maintain the codebase.

## Architecture Overview

The automations system follows a **Service → Ops → State** architecture pattern similar to CronService:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AutomationService                            │
│  Main API: list, create, update, delete, run, cancel, history  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Automation   │   │ Automation   │   │ Automation   │
│ Store        │   │ Runner       │   │ Types        │
│              │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Module Structure

```
src/automations/
├── index.ts                  # Public API exports
├── types.ts                  # Core type definitions
├── service.ts                # AutomationService class (facade)
├── service/
│   ├── state.ts              # Service state management
│   ├── ops.ts                # Business logic (CRUD operations)
│   ├── locked.ts             # Concurrency control
│   ├── store.ts              # Store operations
│   └── timer.ts              # Timer orchestration
├── store.ts                  # File-based persistence
├── runner.ts                 # Execution engine
├── schedule.ts               # Schedule computation
├── events.ts                 # SSE event emitters
├── artifacts.ts              # Artifact storage system
└── utils/
    ├── validation.ts         # Input validation
    └── logger.ts             # Automation-specific logging
```

## Key Types

### Automation

```typescript
interface Automation {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  type: AutomationTypeKind; // "smart-sync-fork" | "custom-script" | "webhook"
  status: AutomationStatus; // "active" | "suspended" | "error"
  enabled: boolean;
  schedule: AutomationSchedule;
  config: AutomationConfig;
  tags: string[];
  createdAtMs: number;
  updatedAtMs: number;
  state: AutomationState;
}
```

### AutomationState

Runtime state tracked for each automation:

```typescript
interface AutomationState {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "success" | "error" | "cancelled" | "blocked";
  lastError?: string;
  lastDurationMs?: number;
  lastRunId?: string;
}
```

### AutomationRun

Represents a single execution run:

```typescript
interface AutomationRun {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: Date;
  completedAt?: Date;
  status: AutomationRunStatus;
  milestones: AutomationMilestone[];
  artifacts: AutomationArtifact[];
  conflicts: AutomationConflict[];
  error?: string;
  triggeredBy: AutomationTrigger;
  aiModel?: AutomationAiModel;
}
```

## Service Layer

### AutomationService

Main service facade that delegates to `ops` module:

```typescript
class AutomationService {
  // Lifecycle
  async start(): Promise<void>;
  stop(): void;

  // CRUD
  async list(opts?: { includeDisabled?: boolean }): Promise<Automation[]>;
  async get(id: string): Promise<Automation | null>;
  async create(input: AutomationCreate): Promise<Automation>;
  async update(id: string, patch: AutomationPatch): Promise<Automation>;
  async delete(id: string): Promise<{ ok: true; deleted: boolean }>;

  // Execution
  async run(id: string, opts?: { mode?: "force" }): Promise<AutomationRunResult>;
  async cancel(runId: string): Promise<AutomationCancelResult>;

  // History
  async getHistory(
    automationId: string,
    opts?: { limit?: number },
  ): Promise<AutomationHistoryResult>;
  async getRun(runId: string): Promise<AutomationRun | null>;
}
```

### Service Operations (`service/ops.ts`)

Key patterns:

1. **Fast-path reads**: List/get don't acquire lock if store already loaded
2. **3-phase execution**: For `run()` operations:
   - Phase 1 (locked): Mark automation as running
   - Phase 2 (unlocked): Execute the automation
   - Phase 3 (locked): Persist results and re-arm timer

```typescript
// 3-phase execution pattern
async function run(
  state: AutomationServiceState,
  id: string,
  opts: RunOpts,
): Promise<AutomationRunResult> {
  // Phase 1: Validate and mark running (locked)
  await locked(state, async () => {
    await ensureLoaded(state);
    const automation = findAutomation(state, id);
    if (!automation) return { ok: false };
    if (!automation.enabled) return { ok: true, ran: false, reason: "disabled" };
    automation.state.runningAtMs = nowMs;
    await persist(state);
  });

  // Phase 2: Execute (unlocked)
  const result = await executeAutomation(state, automation, runId);

  // Phase 3: Persist and re-arm (locked)
  await locked(state, async () => {
    updateAutomationState(state, automation, result);
    await persist(state);
    await armTimer(state);
  });

  return result;
}
```

## Concurrency Control

The `locked()` wrapper ensures serialized access to shared state:

```typescript
async function locked<T>(state: AutomationServiceState, fn: () => Promise<T>): Promise<T> {
  const storePath = state.deps.storePath;
  const storeOp = storeLocks.get(storePath) ?? Promise.resolve();
  const next = Promise.all([resolveChain(state.op), resolveChain(storeOp)]).then(fn);
  const keepAlive = resolveChain(next);
  state.op = keepAlive;
  storeLocks.set(storePath, keepAlive);
  return (await next) as T;
}
```

## Persistence

### Store Format

```typescript
interface AutomationStoreFile {
  version: 1;
  automations: Array<Automation & { state: AutomationState }>;
  runHistory: AutomationRun[];
  historyRetentionDays: number;
  historyMaxRunsPerAutomation: number;
}
```

### Atomic Write Pattern

```typescript
async function saveAutomationsStore(storePath: string, store: AutomationStoreFile): Promise<void> {
  // 1. Create temp file
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;

  // 2. Write to temp
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");

  // 3. Atomic rename
  await fs.promises.rename(tmp, storePath);

  // 4. Best-effort backup
  await fs.promises.copyFile(storePath, `${storePath}.bak`);
}
```

## Schedule Computation

Reuses CronService's schedule logic:

```typescript
export function computeNextRunAtMs(
  schedule: AutomationSchedule,
  nowMs: number,
): number | undefined {
  // Delegate to cron schedule computation
  return cronComputeNextRunAtMs(schedule as never, nowMs);
}
```

## Runner

### AutomationRunner

Executes different automation types:

```typescript
class AutomationRunner {
  async execute(): Promise<AutomationRunResult> {
    switch (this.automation.type) {
      case "smart-sync-fork":
        return await this.executeSmartSyncFork();
      case "custom-script":
        return await this.executeCustomScript();
      case "webhook":
        return await this.executeWebhook();
      default:
        const exhaustive: never = this.automation.config;
        return { status: "error", error: "Unknown automation type" };
    }
  }
}
```

### Execution Flow

```
1. Emit "automation.started" event
2. Get automation type implementation
3. Validate configuration
4. Prepare execution context
5. Execute with progress tracking
   ├─► Emit "automation.progress" for each milestone
   ├─► Track artifacts and conflicts
   └─► Check for blocking conflicts
6. Emit completion event
7. Save run to history
8. Cleanup (workspace, sessions)
```

## Events

### SSE Events

```typescript
// Event types
type AutomationEventType =
  | "automation.started"
  | "automation.progress"
  | "automation.completed"
  | "automation.failed"
  | "automation.blocked"
  | "automation.cancelled";

// Event format
interface AutomationEvent {
  automationId: string;
  runId: string;
  type: AutomationEventType;
  timestamp: Date;
  data: {
    milestone?: string;
    percentage?: number;
    status?: string;
    error?: string;
    artifacts?: AutomationArtifact[];
    conflicts?: AutomationConflict[];
  };
}
```

## Artifact Storage

### ArtifactStorage

Manages local filesystem storage for automation outputs:

```typescript
class ArtifactStorage {
  // Store methods
  async storeBuffer(runId, name, type, data): Promise<AutomationArtifact>;
  async storeFile(runId, name, type, sourcePath): Promise<AutomationArtifact>;
  async storeText(runId, name, type, content, encoding?): Promise<AutomationArtifact>;

  // Retrieve
  async getArtifact(artifactId): Promise<{ filePath; type; name } | null>;

  // Cleanup
  async deleteRunArtifacts(runId): Promise<void>;
  async cleanup(maxAgeMs, maxTotalBytes): Promise<void>;
}
```

### Storage Location

Default: `~/.clawdbrain/automations/artifacts/`

Structure:

```
~/.clawdbrain/automations/artifacts/
├── <run-id-1>/
│   ├── <artifact-id-1>-<filename>
│   └── <artifact-id-2>-<filename>
└── <run-id-2>/
    └── <artifact-id-3>-<filename>
```

## Gateway Integration

### Handlers

Located in `src/gateway/server-methods/automations.ts`:

```typescript
export const automationsHandlers: GatewayRequestHandlers = {
  "automations.list": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.create": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.update": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.delete": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.run": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.cancel": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.history": async ({ params, respond, context }) => {
    /* ... */
  },
  "automations.artifact.download": async ({ params, respond, context }) => {
    /* ... */
  },
};
```

### Gateway Context

```typescript
interface GatewayRequestContext {
  // ... other properties
  automations: AutomationService;
  automationsStorePath: string;
  artifactStorage: ArtifactStorage;
}
```

## CLI Commands

Located in `src/cli/automations-cli/`:

- `register.ts` - Main CLI registration
- `register.automations-simple.ts` - Simple commands (list, history)
- `shared.ts` - Formatters and utilities

## Adding New Automation Types

1. **Add type to `AutomationTypeKind`**
2. **Add config type** in `types.ts`
3. **Implement `execute*` method** in `AutomationRunner`
4. **Add validation** in `utils/validation.ts`
5. **Add UI support** (if applicable)

Example for new type:

```typescript
// 1. Add type
type AutomationTypeKind =
  | "smart-sync-fork"
  | "custom-script"
  | "webhook"
  | "new-type";

// 2. Add config type
interface NewTypeConfig {
  type: "new-type";
  prop1: string;
  prop2: number;
}

// 3. Implement runner
private async executeNewType(): Promise<AutomationRunResult> {
  const config = this.automation.config as NewTypeConfig;
  // Implementation
  return {
    status: "success",
    milestones: [],
    artifacts: [],
    conflicts: [],
  };
}

// 4. Add validation
export function validateNewTypeConfig(config: unknown): config is NewTypeConfig {
  // Implementation
}
```

## Testing

### Unit Tests

- `artifacts.test.ts` - Artifact storage tests
- `schedule.test.ts` - Schedule computation tests
- `store.test.ts` - Persistence tests

### Running Tests

```bash
# All automations tests
pnpm test src/automations

# Specific test file
pnpm test src/automations/artifacts.test.ts
```

## Configuration Schema

See `src/config/types.automations.ts` for config type definition.

Added to `ClawdbrainConfig` via:

```typescript
interface ClawdbrainConfig {
  // ... other properties
  automations?: AutomationsConfig;
}
```

Zod schema in `src/config/zod-schema.ts`.

## Key Patterns

1. **Service → Ops → State**: Clean separation of concerns
2. **locked() for concurrency**: Serialize all state mutations
3. **Fast-path reads**: No lock for simple reads if loaded
4. **3-phase execution**: For long-running operations
5. **Atomic writes**: Temp file + rename + backup
6. **Lazy loading**: Store loaded on first access
7. **Event-driven**: State changes emit SSE events

## Common Operations

### Create Automation

```typescript
const automation = await service.create({
  name: "My Automation",
  description: "Description",
  type: "custom-script",
  schedule: { kind: "every", everyMs: 3600000 },
  enabled: true,
  config: { script: "/path/to/script.sh" },
  status: "active",
  tags: [],
  state: {},
});
```

### Run Automation

```typescript
const result = await service.run(automationId, { mode: "force" });
if (result.ok && "runId" in result) {
  console.log("Started run:", result.runId);
}
```

### Get History

```typescript
const history = await service.getHistory(automationId, { limit: 50 });
for (const run of history.runs) {
  console.log(`${run.automationName}: ${run.status}`);
}
```

## Troubleshooting

### Debug Issues

1. Check logs: `~/.clawdbrain/logs/gateway.log`
2. Enable debug logging in config
3. Run with `CLAWDBRAIN_DEBUG=1`
4. Check store file: `~/.clawdbrain/automations/automations.json`

### Common Issues

**Automation not running**:

- Check `enabled` flag
- Verify schedule is valid
- Check `nextRunAtMs` in state
- Review gateway logs

**Artifacts not saving**:

- Check permissions on artifacts directory
- Verify disk space
- Check artifact storage path in config

**High memory usage**:

- Reduce `maxConcurrentRuns`
- Run cleanup more frequently
- Check for stuck runs

## See Also

- [CronService Implementation](../cron/)
- [Gateway Protocol](../gateway/protocol/)
- [CLI Development](../cli/)
