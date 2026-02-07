# Pre-Answer Hooks Configuration

## Overview

Pre-answer hooks allow automatic context enrichment before an agent responds. They can retrieve information from memory systems, databases, APIs, or other sources and inject that context into the agent's working memory.

## Configuration

Add hooks configuration to your agent config (`AGENT_DIR/agent.json`):

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "model": "openrouter/openai/gpt-4o",
  "preAnswerHooks": {
    "enabled": true,
    "hooks": {
      "memory-search": {
        "enabled": true,
        "config": {
          "maxResults": 5
        }
      }
    }
  }
}
```

## Built-in Hooks

### Memory Search Hook

- **ID:** `memory-search`
- **Priority:** 50
- **Description:** Searches the memory graph for relevant context

**Behavior:**
- Automatically detects questions (ends with `?`, starts with question words)
- Skips very short messages (< 10 chars)
- Skips heartbeats
- Searches Memory Gateway via HTTP
- Injects up to 5 relevant memory snippets

**Enabling:**
```json
{
  "preAnswerHooks": {
    "hooks": {
      "memory-search": {
        "enabled": true
      }
    }
  }
}
```

**Configuration Options (future):**
```json
{
  "memory-search": {
    "enabled": true,
    "config": {
      "maxResults": 10,
      "minScore": 0.5,
      "timeoutMs": 10000
    }
  }
}
```

## Custom Hooks

You can register custom hooks by creating a script that imports and registers them:

```typescript
// custom-hooks.ts
import { preAnswerHookRegistry } from "openclaw/agents/agent-hooks-registry";
import type { PreAnswerHook } from "openclaw/agents/agent-hooks";

const myHook: PreAnswerHook = {
  id: "my-hook",
  description: "My custom hook",
  priority: 100,
  shouldExecute: (params) => {
    // Return false to skip for certain messages
    return true;
  },
  async execute(params) {
    // Your logic here
    return {
      contextFragments: [
        {
          content: "Context to inject",
          weight: 10,
          metadata: {},
        },
      ],
    };
  },
};

preAnswerHookRegistry.register(myHook);
```

## Environment Variables

- `MEMORY_GATEWAY_URL` — Override the memory gateway URL for the memory-search hook
- `MCP_GATEWAY_URL` — Alternative path to memory gateway (autodetected from mcporter config)

## Diagnostics

When diagnostics are enabled, hook execution is logged to diagnostic events:

```typescript
{
  kind: "pre-answer-hooks",
  sessionKey: "...",
  hooksExecuted: [
    {
      id: "memory-search",
      success: true,
      executionTimeMs: 245,
      contextFragments: 3,
    },
  ],
  totalContextFragments: 3,
}
```

## Troubleshooting

### Hook not executing

1. Check if hooks are enabled in your agent config
2. Check the hook's `shouldExecute` filter (most hooks skip heartbeats)
3. Check the hook priority (lower = earlier)

### Hook timing out

1. Increase `timeoutMs` in the hook definition
2. Check if the external service is responding
3. Check logs for timeout warnings

### Hook failing silently

1. Hook failures don't stop the agent from responding
2. Check console logs for warnings
3. Enable diagnostics to see detailed execution results

## Example Output

When the memory-search hook finds relevant memories, they're injected before the user's message:

```
# Memory Found (3 results)

I found 3 relevant memories below. Use this context if it helps answer the question.

---

[Memory #1] Dan Izhaky prefers calm and practical tone; timezone EST.
(Source: memory/2026-01-28.md)

---

[Memory #2] What tier are you on? Free tier has much stricter limits than paid.
(Source: sessions/0018f661-ec00-4a1f-b7c2-621a197413bd.jsonl)

---

[Memory #3] 3 sync scripts fire simultaneously every hour.
(Source: memory/2026-02-02.md)

---

---

What is Dan's email?
```

This ensures the agent always has relevant context before answering.