# Automations SSE Events Schema

This document defines the Server-Sent Events (SSE) schema for real-time automation updates.

## Event Types

### `automation.started`

Fired when an automation execution begins.

```typescript
interface AutomationStartedEvent {
  automationId: string; // Unique automation ID
  automationName: string; // Human-readable name
  sessionId: string; // Agent session key for this run
  startedAt: number; // Unix timestamp (ms)
  estimatedDurationMs?: number; // Optional: estimated duration in ms
}
```

**UI Behavior:**

- Open progress modal with "Starting..." milestone
- Set modal status to "running"
- Add automation to `runningIds` set
- Show toast: "Started running {automationName}"

---

### `automation.progress`

Fired when an automation reaches a milestone or updates progress.

```typescript
interface AutomationProgressEvent {
  automationId: string; // Unique automation ID
  milestone: {
    id: string; // Milestone ID
    title: string; // e.g., "Initializing", "Running", "Completing"
    status: "completed" | "current" | "pending";
    timestamp: string; // ISO timestamp or formatted time
  };
  progress: number; // 0-100 percentage
  conflicts: number; // Number of conflicts detected
  elapsedTime: string; // Formatted duration, e.g., "2m 15s"
  artifactsCount?: number; // Number of artifacts generated so far
}
```

**UI Behavior:**

- Update progress modal milestone(s)
- Update progress bar
- Update elapsed time display
- Update conflicts count
- If new milestone status is "completed", mark previous as completed

---

### `automation.completed`

Fired when an automation finishes successfully.

```typescript
interface AutomationCompletedEvent {
  automationId: string; // Unique automation ID
  automationName: string; // Human-readable name
  status: "success";
  completedAt: number; // Unix timestamp (ms)
  durationMs: number; // Total duration in ms
  summary?: string; // Optional summary of what was done
  artifacts?: Array<{
    // Artifacts generated
    id: string;
    name: string;
    type: string;
    size: string;
    url: string;
  }>;
  aiModel?: {
    // AI usage stats
    name: string;
    version: string;
    tokensUsed: number;
    cost: string;
  };
}
```

**UI Behavior:**

- Close progress modal
- Remove from `runningIds` set
- Refresh automations list to update `lastRun` data
- Show success toast: "Completed {automationName} in {duration}"
- If artifacts exist, show download links in toast or modal

---

### `automation.failed`

Fired when an automation fails or errors.

```typescript
interface AutomationFailedEvent {
  automationId: string; // Unique automation ID
  automationName: string; // Human-readable name
  status: "failed";
  completedAt: number; // Unix timestamp (ms)
  durationMs: number; // Duration before failure
  error: string; // Error message
  conflicts?: Array<{
    // Any conflicts that occurred
    type: string;
    description: string;
    resolution: string;
  }>;
}
```

**UI Behavior:**

- Close progress modal
- Remove from `runningIds` set
- Refresh automations list to show failed status
- Show error toast: "Failed: {error}"
- If conflicts exist, show "View Conflicts" action in toast

---

### `automation.cancelled`

Fired when an automation is cancelled by user.

```typescript
interface AutomationCancelledEvent {
  automationId: string; // Unique automation ID
  automationName: string; // Human-readable name
  status: "cancelled";
  cancelledAt: number; // Unix timestamp (ms)
  durationMs: number; // Duration before cancellation
}
```

**UI Behavior:**

- Close progress modal
- Remove from `runningIds` set
- Refresh automations list
- Show info toast: "Cancelled {automationName}"

---

### `automation.blocked`

Fired when an automation is blocked waiting for user input/feedback.

```typescript
interface AutomationBlockedEvent {
  automationId: string; // Unique automation ID
  automationName: string; // Human-readable name
  blockType: "user-input" | "approval" | "conflict" | "resource";
  message: string; // Human-readable block reason
  requiredAction?: string; // e.g., "Approve security access"
  sessionId?: string; // For jumping to chat
}
```

**UI Behavior:**

- Keep progress modal open with "Blocked" status
- Update progress modal to show block reason
- Show warning toast with action: "View Details" or "Jump to Chat"
- If `sessionId` provided, add "Resolve in Chat" button

---

## Event Flow Example

```
1. automation.started      → Open modal, add toast
2. automation.progress    → Update modal (3-10 times typically)
3. automation.blocked     → Show blocking toast
4. automation.progress    → Update modal after unblocked
5. automation.completed    → Close modal, show success toast
```

## Notes

- All events include `automationId` for correlation
- Timestamps are Unix milliseconds unless otherwise noted
- Progress events are throttled (max ~1-2 per second per automation)
- After completion/failure/cancellation, UI polls `automations.history` for full details
