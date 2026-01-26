# Safe Fetch Utility

## Overview

The `safeFetch` utility provides a crash-resistant wrapper around native `fetch()` calls to prevent unhandled promise rejections from terminating the gateway process.

## Problem

Network-related `fetch()` failures can cause unhandled promise rejections that crash the entire gateway:

```
TypeError: fetch failed
    at node:internal/deps/undici/undici:15422:13
```

When these errors aren't caught, they trigger the unhandled rejection handler in `src/infra/unhandled-rejections.ts`, which calls `process.exit(1)` to prevent silent failures.

## Solution

`safeFetch()` is a drop-in replacement for `fetch()` that **never throws** - it always resolves to a result object that you can check for success or failure.

## Usage

### Basic Pattern

```typescript
import { safeFetch } from "../infra/safe-fetch.js";

// Instead of:
// const response = await fetch(url);  // ❌ Can crash on network failure

// Use:
const result = await safeFetch(url);
if (result.ok) {
  const data = await result.response.json();
  // handle success
} else {
  console.error("Fetch failed:", result.message, result.type);
  // handle error gracefully - gateway keeps running
}
```

### Convenience Helpers

For common patterns, use the provided helpers:

```typescript
import { safeFetchText, safeFetchJson } from "../infra/safe-fetch.js";

// Get text content (returns null on failure)
const text = await safeFetchText("https://api.example.com/status");
if (text) {
  console.log("Status:", text);
}

// Get JSON content (returns null on failure)
const data = await safeFetchJson<{ version: string }>("https://api.example.com/info");
if (data) {
  console.log("Version:", data.version);
}
```

## API Reference

### `safeFetch(input, init?)`

Main wrapper that never throws.

**Returns:** `Promise<SafeFetchResult>`

```typescript
type SafeFetchResult =
  | {
      ok: true;
      response: Response;
      error: null;
    }
  | {
      ok: false;
      response: null;
      error: Error;
      message: string;
      type: "network" | "abort" | "timeout" | "unknown";
    };
```

### `safeFetchText(input, init?)`

Convenience helper for text responses.

**Returns:** `Promise<string | null>`

### `safeFetchJson<T>(input, init?)`

Convenience helper for JSON responses.

**Returns:** `Promise<T | null>`

## Error Classification

Errors are automatically classified by type for better handling:

- **`network`**: Connection failures, DNS errors, refused connections
- **`abort`**: Explicitly aborted requests
- **`timeout`**: Request timeouts
- **`unknown`**: Other error types

## Migration Guide

### Before (Unsafe)

```typescript
async function checkUpdate() {
  try {
    const res = await fetch("https://registry.npmjs.org/clawdbot/latest");
    if (!res.ok) {
      return { version: null, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    return { version: json.version };
  } catch (err) {
    // ⚠️ If this catch is missing, the gateway crashes!
    return { version: null, error: String(err) };
  }
}
```

### After (Safe)

```typescript
import { safeFetchJson } from "../infra/safe-fetch.js";

async function checkUpdate() {
  const json = await safeFetchJson<{ version: string }>(
    "https://registry.npmjs.org/clawdbot/latest"
  );

  if (!json) {
    return { version: null, error: "Fetch failed" };
  }

  return { version: json.version };
}
```

## When to Use

### ✅ Use `safeFetch` for:

- External API calls where failures are expected
- Periodic background tasks (update checks, status pings)
- Non-critical operations that shouldn't crash the gateway
- Any fetch where error handling might be forgotten

### ❌ Don't use `safeFetch` when:

- You need to propagate errors up the call stack
- The failure should be fatal (though consider if this is really true)
- Performance is absolutely critical (minimal overhead, but it exists)

## Best Practices

1. **Log failures appropriately**: `safeFetch` logs errors automatically, but add context if needed
2. **Provide fallbacks**: Always have a plan for when the fetch fails
3. **Check `result.ok`**: Don't assume success
4. **Use helpers when possible**: `safeFetchText` and `safeFetchJson` reduce boilerplate

## Testing

The utility includes comprehensive tests covering:

- Successful fetches
- Network failures
- Abort signals
- Timeouts
- JSON parsing errors
- Response reading errors
- Concurrent failures

Run tests:

```bash
pnpm test src/infra/safe-fetch.test.ts
```

## Implementation Details

- Uses the existing `resolveFetch()` wrapper for consistency
- Classifies errors based on error message patterns
- Logs errors to console with URL context
- Zero dependencies beyond existing infra
- Type-safe with full TypeScript support

## Related

- **Unhandled Rejections**: See `src/infra/unhandled-rejections.ts` for the crash handler this prevents
- **Fetch Wrapper**: See `src/infra/fetch.ts` for the underlying fetch abstraction
