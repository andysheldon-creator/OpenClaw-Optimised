---
summary: "Stop/abort a running agent session (typically a sub-agent)"
read_when:
  - You need to programmatically stop a sub-agent run
  - You're building agent orchestration with sub-agents
title: "sessions_stop"
---

# `sessions_stop` tool

Stop/abort a running agent session. Primarily used by main agents to stop sub-agent runs when needed.

## Tool parameters

```typescript
{
  sessionKey: string  // Required: session key or session ID to stop
}
```

## Behavior

When invoked, `sessions_stop`:

1. **Aborts the running session** via `abortEmbeddedPiRun()`
2. **Clears queued work** (followup messages + lane queues)
3. **Marks session as aborted** in the session store

## Returns

```json
{
  "status": "ok",
  "sessionKey": "agent:main:subagent:abc-123",
  "aborted": true,
  "clearedFollowups": 1,
  "clearedLane": 0
}
```

## Security & gating

- **Cross-agent stops** require `tools.agentToAgent.enabled: true` and agent allowlist
- **Sandboxed agents** can only stop sessions they spawned (when `sessionToolsVisibility: "spawned"`)
- **Sub-agents** cannot use this tool (denied by default in sub-agent tool policy)

## Use cases

### Stop a misbehaving sub-agent

```typescript
// Agent discovers the task list first
const list = await sessions_list({ kinds: ["other"], activeMinutes: 60 });

// Find the problematic one
const problematic = list.sessions.find(s => 
  s.label === "research-task" && s.abortedLastRun === false
);

// Stop it
if (problematic) {
  await sessions_stop({ sessionKey: problematic.key });
}
```

### Stop after timeout or condition

```typescript
// Spawn a task with a label
await sessions_spawn({
  task: "Research API",
  label: "api-research",
  runTimeoutSeconds: 300
});

// Later, conditionally stop if user changes their mind
const list = await sessions_list({ kinds: ["other"] });
const research = list.sessions.find(s => s.label === "api-research");
if (research && !research.endedAt) {
  await sessions_stop({ sessionKey: research.key });
}
```

## Comparison with `/subagents stop`

| Feature | `sessions_stop` tool | `/subagents stop` command |
|---------|----------------------|---------------------------|
| **Who uses it** | Main agent (programmatic) | User (interactive) |
| **Scope** | Any session (respecting security) | Current session's sub-agents only |
| **Availability** | Main agents only | All users (authorized) |
| **Syntax** | `sessions_stop({ sessionKey: "..." })` | `/subagents stop 1` |

## Agent-to-agent policy

To allow cross-agent stops, configure:

```json5
{
  tools: {
    agentToAgent: {
      enabled: true,
      allow: ["main", "ops", "*"]  // Allowlist or wildcard
    }
  }
}
```

## Subagent tool denial

By default, sub-agents **cannot** use `sessions_stop`. This prevents cascading control issues.

Override (not recommended):

```json5
{
  tools: {
    subagents: {
      tools: {
        allow: ["sessions_stop"]  // Explicitly allow (dangerous)
      }
    }
  }
}
```

## Related

- [Sub-agents](/tools/subagents) - Background task spawning
- [sessions_spawn](/tools/sessions-spawn) - Spawn sub-agents
- [sessions_list](/tools/sessions-list) - Discover sessions
- [sessions_send](/tools/sessions-send) - Message sessions
- [Agent-to-agent messaging](/concepts/multi-agent#agent-to-agent-policy)
