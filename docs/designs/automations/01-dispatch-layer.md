# Dispatch Layer Design

**Component:** Automation Dispatcher
**Status:** Design Phase
**Author:** AI Design Session
**Date:** 2025-01-26

## Overview

The Dispatch Layer is responsible for coordinating the execution of all automations. It acts as a scheduler that determines which automations are due to run, enforces concurrency limits, manages per-repository locks, and spawns isolated agent sessions for execution.

## Architecture

### Core Components

```
src/automations/
├── dispatcher.ts              # Main dispatcher orchestrator
├── scheduler.ts               # LCM calculation and due-check logic
├── locks/
│   ├── repository-lock.ts     # Per-repository locking mechanism
│   └── concurrency-limiter.ts # Global concurrency limit enforcement
└── types/
    └── dispatcher.ts          # Dispatcher-specific type definitions
```

### Integration with Existing Cron System

The dispatcher itself is registered as a **single cron job** in the existing cron system:

```typescript
// Registered in src/cron/service.ts or via config
{
  id: "automation-dispatcher",
  schedule: { type: "cron", expression: "*/5 * * * *" }, // Calculated LCM
  payload: {
    type: "systemEvent",
    event: "automation-dispatcher-run"
  },
  sessionTarget: "isolated",
  isolatedSession: {
    postbackToMain: true,
    timeoutMinutes: 60
  }
}
```

## Detailed Component Specifications

### 1. Dispatcher (`dispatcher.ts`)

**Responsibilities:**

- Receive dispatch triggers from cron system
- Query all enabled automations
- Delegate to scheduler for due-checking
- Coordinate with lock manager for availability
- Spawn isolated agent sessions for due automations
- Update automation run state
- Handle failures and retries

**Key Functions:**

```typescript
interface AutomationDispatcher {
  // Main entry point called by cron system
  dispatch(): Promise<DispatchResult>;

  // Query and filter automations ready to run
  getDueAutomations(): Promise<Automation[]>;

  // Check if automation can run (locks + concurrency)
  canRunAutomation(automation: Automation): Promise<boolean>;

  // Spawn isolated agent session for automation
  spawnAutomationSession(automation: Automation): Promise<string>;

  // Update automation state after spawn
  updateRunState(automationId: string, state: RunState): Promise<void>;

  // Handle automation failure
  handleFailure(automationId: string, error: Error): Promise<void>;
}

interface DispatchResult {
  dispatched: number; // Number of automations spawned
  skipped: {
    notDue: number;
    locked: number;
    concurrencyLimit: number;
    disabled: number;
  };
  errors: Array<{
    automationId: string;
    error: string;
  }>;
}
```

**Execution Flow:**

1. Cron triggers dispatcher at LCM interval
2. Dispatcher loads all enabled automation configs
3. For each automation:
   - Check if due (via scheduler)
   - Check if repository lock available
   - Check if concurrency limit allows
   - If all checks pass: spawn isolated session
   - If any check fails: skip with reason
4. Return dispatch summary
5. Errors are logged but don't stop other automations

### 2. Scheduler (`scheduler.ts`)

**Responsibilities:**

- Calculate LCM of all automation schedules
- Determine if a specific automation is due to run
- Handle schedule types: cron expression, interval, "at" time
- Track last run time for each automation

**Key Functions:**

```typescript
interface AutomationScheduler {
  // Calculate LCM from all automation schedules
  calculateLCM(automations: Automation[]): ScheduleInfo;

  // Check if specific automation is due now
  isDue(automation: Automation): boolean;

  // Update dispatcher cron expression when automations change
  updateDispatcherSchedule(automations: Automation[]): Promise<void>;

  // Get next run time for an automation
  getNextRunTime(automation: Automation): Date;
}

interface ScheduleInfo {
  lcmExpression: string; // Cron expression for dispatcher
  lcmMinutes: number; // LCM in minutes
  individualSchedules: Map<string, ScheduleEntry>;
}

interface ScheduleEntry {
  automationId: string;
  schedule: AutomationSchedule;
  lastRun: Date | null;
  nextRun: Date;
}
```

**LCM Calculation Algorithm:**

```typescript
// Pseudo-code for LCM calculation
function calculateLCM(schedules: AutomationSchedule[]): string {
  // Convert each schedule to minutes (lowest common denominator)
  const intervals = schedules.map((s) => s.toMinutes());

  // Calculate LCM of all intervals
  const lcmMinutes = calculateLCMOfNumbers(intervals);

  // Convert back to cron expression
  return `*/${lcmMinutes} * * * *`;
}

// Examples:
// [15min, 30min, 60min] → LCM = 60min → "*/60 * * * *"
// [hourly, daily] → LCM = daily → "0 0 * * *"
// [6h, 8h] → LCM = 24h → "0 0 * * *"
```

**Schedule Normalization:**

```typescript
interface AutomationSchedule {
  type: "cron" | "interval" | "at";
  value: string;

  // Convert to minutes for LCM calculation
  toMinutes(): number;

  // Check if current time matches schedule
  matches(now: Date, lastRun: Date | null): boolean;
}

// Examples:
// { type: "interval", value: "30m" } → 30 minutes
// { type: "cron", value: "0 */2 * * *" } → 120 minutes
// { type: "at", value: "09:00" } → daily at 9am
```

### 3. Repository Lock (`locks/repository-lock.ts`)

**Purpose:** Ensure only ONE automation runs against a specific repository at a time, regardless of how many automations target that repo.

**Implementation:** File-based locking in `~/.clawdbrain/automations/locks/`

```typescript
interface RepositoryLockManager {
  // Try to acquire lock for repo URL
  acquireLock(repoUrl: string, automationId: string): Promise<Lock | null>;

  // Release lock when automation completes/fails
  releaseLock(lock: Lock): Promise<void>;

  // Check if lock exists (without acquiring)
  isLocked(repoUrl: string): boolean;

  // Force release lock (admin operation)
  forceRelease(repoUrl: string): Promise<void>;

  // List all active locks
  listLocks(): Promise<Lock[]>;
}

interface Lock {
  repoUrl: string;
  automationId: string;
  sessionId: string;
  acquiredAt: Date;
  lockFilePath: string;
}
```

**Lock File Format:**

```json
{
  "repoUrl": "https://github.com/user/repo.git",
  "automationId": "smart-sync-fork-123",
  "sessionId": "cron:abc-123",
  "acquiredAt": "2025-01-26T10:30:00Z",
  "pid": 12345,
  "hostname": "gateway-host"
}
```

**Lock Cleanup:**

- Stale locks (older than 4 hours) are auto-cleaned on dispatcher start
- Lock files include PID and hostname for orphan detection
- Force-release available via admin API/CLI

**Repository Key for Locking:**

```typescript
// Normalize repo URLs to consistent lock key
function getRepoLockKey(repoUrl: string): string {
  // Remove .git suffix
  // Remove protocol (https://, git@)
  // Convert to lowercase
  // Example: "https://github.com/User/Repo.git" → "github.com/user/repo"
  return normalizeRepoUrl(repoUrl);
}
```

### 4. Concurrency Limiter (`locks/concurrency-limiter.ts`)

**Purpose:** Limit total number of automations running concurrently (default: 3, configurable).

**Implementation:** Semaphore pattern with file-based state persistence.

```typescript
interface ConcurrencyLimiter {
  // Try to acquire a slot
  acquireSlot(automationId: string): Promise<Slot | null>;

  // Release slot when automation completes
  releaseSlot(slot: Slot): Promise<void>;

  // Get current usage
  getCurrentUsage(): Promise<ConcurrencyInfo>;

  // Update limit (called from UI config)
  setLimit(limit: number): Promise<void>;
}

interface Slot {
  automationId: string;
  sessionId: string;
  acquiredAt: Date;
  slotNumber: number; // 1 to maxSlots
}

interface ConcurrencyInfo {
  maxSlots: number;
  activeSlots: number;
  availableSlots: number;
  activeAutomations: Array<{
    automationId: string;
    sessionId: string;
    acquiredAt: Date;
  }>;
}
```

**State File:** `~/.clawdbrain/automations/concurrency-state.json`

```json
{
  "maxSlots": 3,
  "activeSlots": [
    {
      "automationId": "smart-sync-fork-123",
      "sessionId": "cron:abc-123",
      "acquiredAt": "2025-01-26T10:30:00Z",
      "slotNumber": 1
    }
  ],
  "lastUpdated": "2025-01-26T10:30:00Z"
}
```

## Dispatcher Configuration

### Global Settings

```typescript
// Stored in ~/.clawdbrain/automations/dispatcher-config.json
interface DispatcherConfig {
  // Maximum concurrent automations (default: 3)
  maxConcurrent: number;

  // Lock timeout in hours (default: 4)
  lockTimeoutHours: number;

  // Whether dispatcher is enabled (default: true)
  enabled: boolean;

  // Log level for dispatcher operations
  logLevel: "debug" | "info" | "warn" | "error";

  // Notification channels for dispatcher events
  notifications: {
    onStart: boolean;
    onComplete: boolean;
    onError: boolean;
    channels: string[]; // e.g., ["#cb-activity"]
  };
}
```

## Error Handling

### Dispatcher-Level Errors

| Error Type                | Handling                         | User Notification   |
| ------------------------- | -------------------------------- | ------------------- |
| Invalid automation config | Skip automation, log error       | Yes (toast)         |
| Lock acquisition failure  | Skip with "locked" reason        | No (expected)       |
| Concurrency limit reached | Skip with "limit reached" reason | No (expected)       |
| Session spawn failure     | Mark as failed, retry next cycle | Yes (toast)         |
| State file corruption     | Recreate state, log warning      | Yes (warning toast) |

### Retry Logic

- **Transient errors** (network, file lock): Retry on next dispatch cycle
- **Permanent errors** (invalid config): Skip until config is fixed
- **Session failures**: Logged to automation run log, not retried by dispatcher

## Performance Considerations

### Lock Acquisition

- File locks are fast (microsecond scale)
- No blocking: `tryAcquire` returns null immediately if locked
- Lock files stored in `~/.clawdbrain/automations/locks/` for fast access

### Concurrency Check

- Single atomic read of state file
- In-memory slot allocation for speed
- State file written after acquisition (optimistic locking)

### Due Calculation

- Cached LCM, recalculated only when automations change
- Per-automation due check is O(1) timestamp comparison
- Last run times cached in memory during dispatch cycle

## Monitoring & Observability

### Dispatch Metrics

```typescript
interface DispatchMetrics {
  // Per dispatch cycle
  lastDispatchTime: Date;
  lastDispatchDuration: number; // milliseconds
  lastDispatchResult: DispatchResult;

  // Aggregated stats
  totalDispatches: number;
  totalAutomationsSpawned: number;
  totalSkips: number;
  totalErrors: number;

  // Current state
  activeAutomations: number;
  lockedRepositories: number;
  availableConcurrencySlots: number;
}
```

### Logging

- All dispatch operations logged to `~/.clawdbrain/automations/logs/dispatcher.log`
- Log rotation: 10MB per file, keep 5 files
- Structured JSON logging for easy parsing

### Health Check Endpoint

```typescript
// GET /api/automations/dispatcher/health
interface DispatcherHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  lastDispatchTime: Date;
  activeLocks: number;
  concurrencyUsage: {
    used: number;
    max: number;
  };
  nextDispatchTime: Date;
}
```

## Testing Strategy

### Unit Tests

- LCM calculation with various schedule combinations
- Due detection for all schedule types
- Lock acquisition/release logic
- Concurrency limit enforcement
- Error handling scenarios

### Integration Tests

- Full dispatch cycle with mock automations
- Lock contention scenarios
- Concurrency limit scenarios
- State file corruption recovery

### End-to-End Tests

- Real automations with real repositories
- Concurrent execution validation
- Lock timeout behavior
- Dispatcher config updates

## Security Considerations

### Lock Files

- Lock files contain session IDs (not sensitive)
- No credentials in lock files
- File permissions: 0600 (owner read/write only)

### Concurrency State

- State file contains automation IDs and session IDs
- No sensitive data
- File permissions: 0600

### Dispatcher Config

- Config may contain notification channel names
- No credentials stored
- File permissions: 0600

## Future Enhancements

### Phase 2 Features

- **Priority-based dispatch:** Higher-priority automations run first
- **Backoff strategy:** Failed automations back off exponentially
- **Dispatch windows:** Only run during certain hours
- **Resource-aware limits:** Consider CPU/memory usage
- **Multi-gateway support:** Coordinate dispatchers across multiple gateways

### Phase 3 Features

- **Distributed locking:** Redis-backed locks for multi-gateway
- **Dispatch queue:** Persist queue for reliability
- **Dynamic concurrency:** Adjust limit based on system load
