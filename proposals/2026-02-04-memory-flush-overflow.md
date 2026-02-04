# Proposal: Memory Flush Resilience for Large Sessions

**GitHub Issue:** #8932
**Priority:** MEDIUM
**Date:** 2026-02-04

## Problem

Memory flush fails with 'Summary unavailable' on large sessions due to context overflow. When sessions grow large, the summarization step exceeds model context limits, causing the flush to fail silently.

Error: `Memory flush fails with 'Summary unavailable' on large sessions (context overflow)`

## Why It Occurs

1. **Full history sent for summarization** - No chunking or truncation before summarizing
2. **No context budget tracking** - Flush doesn't check available tokens before attempting
3. **Silent failure** - Returns 'Summary unavailable' instead of partial summary or error
4. **Summarization model mismatch** - May use a smaller context model for summarization than main chat

## Technical Solution

### 1. Chunked Summarization

```typescript
async function summarizeLargeSession(history: Message[]): Promise<string> {
  const MAX_CHUNK_TOKENS = 8000;
  const chunks = chunkByTokens(history, MAX_CHUNK_TOKENS);

  // Summarize each chunk
  const chunkSummaries = await Promise.all(chunks.map((chunk) => summarizeChunk(chunk)));

  // Final summary of summaries
  return summarizeChunk(chunkSummaries.join("\n\n"));
}
```

### 2. Progressive Summarization

```typescript
// Summarize as you go, not all at end
const SUMMARIZE_THRESHOLD = 50; // messages

function maybeProgressiveSummarize(session: Session) {
  if (session.messages.length > SUMMARIZE_THRESHOLD) {
    const toSummarize = session.messages.slice(0, -10);
    const summary = summarize(toSummarize);
    session.messages = [
      { role: "system", content: `Previous context: ${summary}` },
      ...session.messages.slice(-10),
    ];
  }
}
```

### 3. Token Budget Awareness

```typescript
async function flushWithBudget(session: Session): Promise<FlushResult> {
  const availableTokens = getModelContextLimit() - SAFETY_MARGIN;
  const historyTokens = countTokens(session.messages);

  if (historyTokens > availableTokens) {
    // Truncate oldest messages first
    const truncated = truncateToFit(session.messages, availableTokens);
    return summarize(truncated);
  }
  return summarize(session.messages);
}
```

### 4. Graceful Degradation

- If full summary fails, try last N messages
- If that fails, save raw compressed history
- Always persist something rather than losing data

## Impact

- **Data Preservation:** No more lost session summaries
- **Heavy Users:** Enables power users with long sessions
- **Reliability:** Predictable behavior regardless of session size
- **Memory Efficiency:** Progressive summarization reduces peak memory usage

## Implementation Estimate

- **Effort:** 2-3 days
- **Risk:** Low (improves existing flow, doesn't change happy path)
- **Files:** `packages/core/src/memory/*.ts`, `packages/core/src/session/flush.ts`
