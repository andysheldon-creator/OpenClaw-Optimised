# Add agent-level node routing

## Summary

This PR adds support for routing agent execution to specific paired nodes. When an agent is configured with a `node` field, agent runs will be proxied to that node's gateway instead of running locally.

## Motivation

This enables powerful distributed setups where:

- A central gateway receives messages from all channels
- Specific agents are routed to dedicated machines (e.g., a Mac Studio for heavy coding tasks)
- Each machine can have different resources, tools, and capabilities

## Changes

### 1. TypeScript Types (`src/config/types.agents.ts`)

- Added `node?: string` field to `AgentConfig` with JSDoc documentation

### 2. Zod Schema (`src/config/zod-schema.agent-runtime.ts`)

- Added `node` field as optional string to `AgentEntrySchema`

### 3. Agent Scope (`src/agents/agent-scope.ts`)

- Added `node` to `ResolvedAgentConfig` type
- Created `resolveAgentNodeRouting()` helper function to get the node target

### 4. Node Routing Module (`src/agents/node-routing.ts`) [NEW]

- `resolveNodeByIdOrName()`: Resolves a node by ID or display name
- `invokeAgentOnNode()`: Forwards agent requests to the target node

### 5. Agent Handler (`src/gateway/server-methods/agent.ts`)

- Added node routing check before local execution
- Forwards request to target node if configured
- Returns `routedToNode` field in response for visibility

## Configuration Example

```yaml
agents:
  list:
    - id: main
      # No node - runs locally (default gateway)

    - id: builder
      node: mac-studio # Route to the "mac-studio" node
      model: anthropic/claude-opus-4-5
```

## Requirements for Target Nodes

The target node must:

1. Be paired with the gateway
2. Be currently connected
3. Support the `agent.run` command or have the `agent` capability

## Error Handling

The implementation handles these error cases:

- **NOT_FOUND**: Node doesn't exist
- **NOT_CONNECTED**: Node is paired but not currently connected
- **NO_AGENT_CAP**: Node doesn't support agent execution

## Testing

Added unit tests for:

- `resolveNodeByIdOrName` - node resolution by ID/name
- `invokeAgentOnNode` - agent invocation on remote nodes
- `resolveAgentNodeRouting` - config resolution for node routing

## Breaking Changes

None. The `node` field is optional and defaults to local execution.

## TODO (Future enhancements)

- [ ] Add `agent.run` command support to node-host for nodes without full gateway
- [ ] Add node health checks before routing
- [ ] Support fallback nodes when primary is unavailable
- [ ] Add node routing metrics/logging

---

Fixes #XXXX (if applicable)
