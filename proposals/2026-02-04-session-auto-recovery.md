# Proposal: Session Auto-Recovery for Corrupted History

**GitHub Issue:** #8946
**Priority:** HIGH
**Date:** 2026-02-04

## Problem

When a tool response is corrupted or malformed (e.g., JSON parse error, truncated output, invalid UTF-8), the session history becomes invalid. This causes the entire session to fail, losing all conversation context and requiring manual intervention to recover.

Users report: "Session should auto-recover when corrupted tool response makes history invalid"

## Why It Occurs

1. **Tool outputs are stored raw** - No validation before persisting to session history
2. **History is monolithic** - One bad entry corrupts the entire chain
3. **No recovery mechanism** - Once corrupted, users must manually delete/reset session
4. **External tools are unpredictable** - Binary output, encoding issues, network timeouts can all produce malformed responses

## Technical Solution

### 1. Pre-persist Validation

```typescript
function validateToolResponse(response: ToolResponse): ValidatedResponse {
  try {
    // Ensure valid JSON structure
    JSON.parse(JSON.stringify(response));
    // Ensure valid UTF-8
    new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(response.content));
    return { valid: true, response };
  } catch (e) {
    return { valid: false, response: sanitizeResponse(response), error: e };
  }
}
```

### 2. Graceful Degradation

- Store sanitized placeholder if validation fails: `"[Tool output corrupted - original truncated]"`
- Log original to debug file for investigation
- Continue session with warning to user

### 3. History Repair Command

```bash
clawdbot session repair <sessionKey>
```

- Scan history for invalid entries
- Offer to remove/fix corrupted entries
- Backup original before repair

### 4. Checkpoint System (Optional)

- Periodically checkpoint valid history state
- On corruption, offer rollback to last checkpoint

## Impact

- **Reliability:** Sessions survive tool failures instead of crashing
- **User Experience:** No more manual session cleanup
- **Debug-ability:** Corrupted outputs logged for investigation
- **Data Preservation:** Conversation context preserved even when tools fail

## Implementation Estimate

- **Effort:** 2-3 days
- **Risk:** Low (additive change, doesn't modify happy path)
- **Files:** `packages/core/src/session/*.ts`, `packages/cli/src/commands/session.ts`
