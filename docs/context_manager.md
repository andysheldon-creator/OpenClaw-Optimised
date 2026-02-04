---
title: Context Manager
description: Deterministic context assembly and token budgeting for local Ollama models
---

# Context Manager

The context manager provides production-quality prompt assembly with token budgeting, deterministic chunk selection, and comprehensive observability for local Ollama models.

## Overview

When working with local LLMs like Llama 3.1 on Ollama, context window limits are critical. The context manager:

1. **Prevents oversized prompts** from being sent to Ollama
2. **Implements token budgeting** with safety margins
3. **Provides deterministic selection** of context chunks
4. **Generates manifests** documenting what was included and why
5. **Strips huge context arrays** from responses by default

## Token Budgeting Rules

### Safety Margin

Token estimates use a **1.2x multiplier** (20% buffer) to account for estimation inaccuracy. This matches the `SAFETY_MARGIN` constant used throughout the codebase.

```typescript
import { createTokenEstimator } from "moltbot/agents/ollama";

const estimator = createTokenEstimator({
  multiplier: 1.2,        // 20% safety buffer (default)
  reserveTokens: 2000,    // Reserved for response generation
  maxContextTokens: 32768 // Llama 3.1 32k context window
});

// maxPromptTokens = 32768 - 2000 = 30768
```

### Budget Calculation

```
maxPromptTokens = maxContextTokens - reserveTokens
```

- **maxContextTokens**: Total context window (e.g., 32768 for Llama 3.1 32k)
- **reserveTokens**: Tokens reserved for response generation (default: 2000)
- **maxPromptTokens**: Maximum tokens allowed in the prompt

### Hard Fail Behavior

If the assembled prompt exceeds the budget, an `OverBudgetError` is thrown **before** any HTTP request is made:

```typescript
import { createContextManager, isOverBudgetError } from "moltbot/agents/ollama";

const manager = createContextManager({ maxContextTokens: 32768 });

try {
  const result = manager.assemble({
    system: "You are helpful.",
    instructions: "",
    userQuery: hugePrompt, // 200k tokens
    candidateChunks: [],
  });
} catch (err) {
  if (isOverBudgetError(err)) {
    console.log(`Over budget: ${err.estimatedTokens} > ${err.budgetTokens}`);
    // Handle gracefully - no HTTP request was made
  }
}
```

## Chunk Selection Strategy

### Default Mode

Chunks are selected deterministically:

1. **Sort by score descending** (higher score = more relevant)
2. **Tie-break by chunk ID ascending** (lexicographic)
3. **Include chunks until budget exhausted**

```typescript
import { selectChunks, createTokenEstimator } from "moltbot/agents/ollama";

const chunks = [
  { id: "doc-1", text: "...", source: "file.md", score: 0.9 },
  { id: "doc-2", text: "...", source: "file.md", score: 0.8 },
  { id: "doc-3", text: "...", source: "file.md", score: 0.9 }, // Same score as doc-1
];

const result = selectChunks(chunks, 10000, estimator);
// Order: doc-1, doc-3 (tie-break by ID), doc-2
```

### Strict Provenance Mode

Only include chunks with provenance metadata:

```typescript
const result = selectChunks(chunks, 10000, estimator, "strict_provenance");
// Excludes chunks without provenance.page, provenance.offsetStart/End, or provenance.blockName
```

### Determinism Guarantee

**Same inputs always produce the same output.** This is critical for:

- Reproducible debugging
- Cache invalidation
- Audit trails

## Logging Format

### Request Logs

Logs are written to `$DEFAULT_LOG_DIR/ollama/ollama-YYYY-MM-DD.jsonl`:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "model": "llama3.1:8b",
  "tokenEstimate": 15000,
  "actualPromptTokens": 14500,
  "promptHash": "a1b2c3d4...",
  "chunkManifest": [
    { "id": "doc-1", "source": "file.md", "tokens": 500, "included": true },
    { "id": "doc-2", "source": "file.md", "tokens": 8000, "included": false, "reason": "over_budget" }
  ],
  "responseMetadata": {
    "done": true,
    "doneReason": "stop",
    "evalCount": 150,
    "promptEvalCount": 14500,
    "durationMs": 2500
  }
}
```

### Manifest Structure

Each assembled prompt includes a manifest:

```typescript
interface PromptManifest {
  promptHash: string;           // SHA256 of assembled prompt
  systemTokens: number;         // Tokens in system prompt
  instructionsTokens: number;   // Tokens in instructions
  userQueryTokens: number;      // Tokens in user query
  contextTokens: number;        // Tokens in included chunks
  totalTokens: number;          // Sum of all tokens
  budgetTokens: number;         // Budget that was enforced
  withinBudget: boolean;        // Whether prompt fits
  chunks: ChunkManifestEntry[]; // Detailed chunk info
}
```

## Failure Modes

### OverBudgetError

**Cause**: Assembled prompt exceeds token budget.

**Behavior**: Error thrown locally before HTTP request.

**Recovery**:
- Reduce system prompt size
- Reduce number of context chunks
- Increase budget (if model supports larger context)

### OllamaApiError

**Cause**: Ollama HTTP request failed.

**Behavior**: Error includes status code, endpoint, and message.

**Recovery**:
- Check Ollama is running (`moltbot ollama smoke ping`)
- Verify model is installed (`ollama list`)
- Check for resource exhaustion (memory, GPU)

### Timeout

**Cause**: Request exceeded timeout (default: 120s).

**Behavior**: AbortError thrown.

**Recovery**:
- Increase timeout for large prompts
- Reduce prompt size
- Check Ollama performance

## CLI Commands

### Smoke Tests

```bash
# Run all smoke tests
moltbot ollama smoke

# Run specific test
moltbot ollama smoke ping      # Check availability
moltbot ollama smoke truncate  # Verify truncation behavior
moltbot ollama smoke guard     # Verify local budget enforcement

# Options
moltbot ollama smoke --json                    # JSON output
moltbot ollama smoke --model llama3.1:8b       # Specific model
moltbot ollama smoke --timeout 60000           # Custom timeout
```

### Test Descriptions

| Test | Description | Requires Ollama |
|------|-------------|-----------------|
| `ping` | Check availability via `/api/tags` and `/v1/models` | Yes |
| `truncate` | Send 40k tokens, verify Ollama truncates to 32k | Yes |
| `guard` | Verify `OverBudgetError` thrown before HTTP | No |

## Integration

### With Existing Discovery

The context manager integrates with the existing provider discovery:

```typescript
import { discoverLocalOllama } from "moltbot/agents/local-provider-discovery";
import { createContextManager, createNativeClient, createOpenAIClient } from "moltbot/agents/ollama";

// Discover Ollama
const providerConfig = await discoverLocalOllama();
if (!providerConfig) {
  throw new Error("Ollama not available");
}

// Get context window from discovered model
const contextWindow = providerConfig.models?.[0]?.contextWindow ?? 32768;

// Create context manager
const manager = createContextManager({ maxContextTokens: contextWindow });

// Create clients (use transport config, not ProviderConfig)
const nativeBaseUrl = providerConfig.baseUrl.replace(/\/v1$/, "");
const nativeClient = createNativeClient({ baseUrl: nativeBaseUrl });
const openaiClient = createOpenAIClient({ baseUrl: providerConfig.baseUrl });
```

### Transport vs Provider Config

The clients use `OllamaTransportConfig` (just `baseUrl` and `timeout`) rather than mutating `ProviderConfig`. This prevents corrupting shared provider metadata:

```typescript
// Good: Separate transport config
const nativeClient = createNativeClient({
  baseUrl: "http://127.0.0.1:11434",
  timeout: 120000,
});

// Bad: Mutating ProviderConfig
// createNativeClient({ providerConfig: { ...providerConfig, baseUrl: modified } })
```

## Context Array Stripping

The native Ollama API (`/api/generate`) returns a `context` array containing tens of thousands of token IDs. This floods logs and is rarely needed.

**Default behavior**: Context array is stripped from responses.

```typescript
const response = await nativeClient.generate({ model: "llama3", prompt: "Hi" });
// response.context is undefined (stripped)
```

**To include context** (for KV cache reuse):

```typescript
const response = await nativeClient.generate({
  model: "llama3",
  prompt: "Hi",
  includeContext: true,
});
// response.context is present
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAWDBOT_TEST_LOCAL_DISCOVERY` | Set to `1` to enable local discovery in tests |
| `CLAWDBOT_SKIP_LOCAL_DISCOVERY` | Set to `1` to disable auto-discovery |
