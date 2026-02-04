# Advanced Modes: Recursive Language Model (RLM)

The RLM mode (`/rlm`) provides bounded iterative refinement for complex tasks with explicit caps, BudgetGovernor integration, and Notion audit trail.

## Overview

RLM mode enables the agent to iteratively refine outputs through multiple passes, with each iteration building on the previous output. This is useful for tasks requiring deep analysis, multi-step reasoning, or iterative improvement.

## Hard Caps

| Parameter | Default | Maximum |
|-----------|---------|---------|
| depth | 2 | 4 |
| subagents | 0 | 3 |
| iterations | 3 | 10 |

These caps are enforced at the code level and cannot be exceeded.

## Commands

### /rlm <task>

Run an RLM session for a given task.

```
/rlm Analyze this codebase architecture and suggest improvements
```

**Options:**
- `--depth <n>` - Override max depth (default: 2, max: 4)
- `--iterations <n>` - Override max iterations (default: 3, max: 10)
- `--subagents <n>` - Override max subagents (default: 0, max: 3)
- `--budget <profile>` - Budget profile: cheap, normal, deep (default: normal)

### /rlm status [session-id]

Check the status of an RLM session.

```
/rlm status
/rlm status rlm-a1b2c3d4
```

### /rlm history [limit]

List recent RLM sessions.

```
/rlm history
/rlm history 20
```

### /rlm stop [session-id]

Stop a running RLM session.

```
/rlm stop
/rlm stop rlm-a1b2c3d4
```

## Session Flow

1. **Session Creation**: A new session is created with validated configuration
2. **Iteration Loop**:
   - Check budget limits
   - Execute iteration
   - Track usage (tokens, tool calls, subagents)
   - Evaluate whether refinement is needed
   - Prepare input for next iteration
3. **Completion**: Session completes when:
   - Task is deemed satisfactory
   - Max iterations reached
   - Budget exceeded
   - Subagent cap exceeded
   - User cancellation

## Stop Reasons

| Reason | Description |
|--------|-------------|
| `completed` | Task successfully completed |
| `no_refinement` | Output deemed satisfactory |
| `max_iterations` | Hit iteration cap |
| `max_depth` | Hit depth cap |
| `max_subagents` | Hit subagent cap |
| `budget_exceeded` | BudgetGovernor stopped session |
| `user_cancelled` | User requested stop |
| `error` | Unrecoverable error |

## Budget Integration

Each RLM session integrates with the BudgetGovernor:

- **normal** profile: Standard limits for each iteration
- **deep** profile: Extended limits for complex analysis
- **cheap** profile: Minimal limits for quick iterations

The governor tracks:
- LLM calls and tokens
- Tool calls
- Subagent spawns
- Runtime duration

## Notion Audit Trail

All RLM sessions are logged to Notion (if configured):

**RLM Sessions Database Properties:**
- Name (Title): Session ID (rlm-xxxx)
- Task: Task description
- Status: running, completed, stopped, error
- IterationCount: Total iterations
- TotalTokens: Total tokens used
- FinalOutput: Final result (truncated)
- StopReason: Why stopped
- StartedAt: When started
- CompletedAt: When ended

## Configuration

Add to your config:

```json
{
  "dj": {
    "notion": {
      "rlmSessionsDbId": "your-rlm-sessions-database-id"
    }
  }
}
```

## Examples

### Basic Usage

```
/rlm Write a comprehensive analysis of the authentication system
```

### With Options

```
/rlm --iterations 5 --budget deep Perform a security audit of the API endpoints
```

### Multi-Step Research

```
/rlm --depth 3 Research and synthesize the latest developments in AI safety
```

## Best Practices

1. **Start with defaults**: The default configuration (2 depth, 3 iterations) works well for most tasks
2. **Use deep budget sparingly**: Deep mode provides extended limits but costs more
3. **Monitor sessions**: Use `/rlm status` to track progress
4. **Review iterations**: Check the iteration history to understand the refinement process
5. **Set appropriate caps**: For complex tasks, consider increasing iterations rather than depth

## Limitations

- Iterations build on previous output, so early errors can compound
- Deep recursion (high depth) can lead to context fragmentation
- Subagent spawning adds latency and cost
- Budget governor may stop sessions before natural completion
