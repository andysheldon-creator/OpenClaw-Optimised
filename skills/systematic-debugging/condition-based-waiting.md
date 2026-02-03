# Condition-Based Waiting

## Overview

Flaky tests often guess at timing with arbitrary delays. This creates race conditions.

**Core principle:** Wait for the actual condition you care about, not a guess about how long it takes.

## Core Pattern

```typescript
// ❌ BEFORE: Guessing at timing
await new Promise((r) => setTimeout(r, 50));
const result = getResult();

// ✅ AFTER: Waiting for condition
await waitFor(() => getResult() !== undefined);
const result = getResult();
```

## Quick Patterns

| Scenario       | Pattern                                              |
| -------------- | ---------------------------------------------------- |
| Wait for event | `waitFor(() => events.find(e => e.type === 'DONE'))` |
| Wait for state | `waitFor(() => machine.state === 'ready')`           |
| Wait for count | `waitFor(() => items.length >= 5)`                   |
| Wait for file  | `waitFor(() => fs.existsSync(path))`                 |

## Generic Implementation

```typescript
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000,
): Promise<T> {
  const startTime = Date.now();
  while (true) {
    const result = condition();
    if (result) return result;
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

## When Arbitrary Timeout IS Correct

Only when testing actual timing behavior (debounce, throttle). Always document WHY.
