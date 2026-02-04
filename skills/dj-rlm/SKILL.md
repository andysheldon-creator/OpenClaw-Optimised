---
name: dj-rlm
description: Recursive Language Model mode for bounded iterative refinement.
metadata:
  {
    "openclaw":
      {
        "emoji": "🔄",
        "requires": { "env": ["NOTION_API_KEY"] },
        "commands":
          [
            { "name": "rlm", "description": "Run task with iterative refinement" },
            { "name": "rlm status", "description": "Check RLM session status" },
            { "name": "rlm history", "description": "View recent RLM sessions" },
          ],
      },
  }
---

# dj-rlm

Recursive Language Model mode for bounded iterative refinement of complex tasks.

## Overview

RLM mode enables iterative refinement for tasks that benefit from multiple passes:
- Drafts that need polish
- Analysis that requires depth
- Code generation with quality gates
- Complex research synthesis

Each iteration refines the previous output until quality criteria are met or caps are reached.

## Usage

```
/rlm <task> [--depth N] [--iterations N] [--subagents N] [--profile cheap|normal|deep]
/rlm status [session-id]
/rlm history [--limit N]
```

## Hard Caps

RLM enforces hard caps to prevent runaway recursion:

| Parameter | Default | Maximum |
|-----------|---------|---------|
| depth | 2 | 4 |
| iterations | 3 | 10 |
| subagents | 0 | 3 |

Caps cannot be exceeded regardless of options specified.

## Budget Integration

Each iteration runs within a BudgetGovernor boundary:

- **cheap**: 10 tool calls, 50K tokens
- **normal**: 50 tool calls, 200K tokens (default)
- **deep**: 200 tool calls, 1M tokens (must be armed)

If budget limits are exceeded mid-session, RLM stops gracefully and returns the best output so far.

## Commands

### /rlm

Run a task with iterative refinement.

**Basic usage:**
```
/rlm Write a technical blog post about WebSocket performance optimization
```

**With options:**
```
/rlm Write a technical blog post --iterations 5 --profile deep
```

**Workflow:**
1. Initial execution produces first draft
2. Quality evaluation determines if refinement needed
3. If needed, refines with focus areas
4. Repeats until satisfactory or caps reached
5. Returns final output with session ID

**Example:**
```
User: /rlm Draft an investor update email for Q4 --iterations 3

Cue: 🔄 **RLM Session Started**
Session ID: rlm-a1b2c3d4
Task: Draft an investor update email for Q4
Config: depth=2, iterations=3, subagents=0, profile=normal

---

🔄 **Iteration 1/3**
[Initial draft generated]

🔄 **Iteration 2/3** (Refining: clarity and data presentation)
[Draft improved with better structure]

✅ **RLM Session Complete**

Session ID: rlm-a1b2c3d4
Iterations: 2/3
Tokens: 8,450
Duration: 45s
Stop Reason: completed (output deemed satisfactory)

[Final email draft displayed]
```

### /rlm status

Check the status of an RLM session.

**Current session:**
```
/rlm status
```

**Specific session:**
```
/rlm status rlm-a1b2c3d4
```

**Output includes:**
- Session ID and task
- Status (running, completed, stopped, error)
- Iteration count and total tokens
- Stop reason if applicable
- Final output preview

### /rlm history

View recent RLM sessions.

**Default (last 10):**
```
/rlm history
```

**Custom limit:**
```
/rlm history --limit 5
```

**Output:**
```
📊 **Recent RLM Sessions**

| Session ID | Task | Status | Iterations | Tokens | When |
|------------|------|--------|------------|--------|------|
| rlm-a1b2c3d4 | Draft investor email | completed | 2 | 8,450 | 5 min ago |
| rlm-e5f6g7h8 | Technical blog post | stopped | 5 | 45,200 | 2 hours ago |
| rlm-i9j0k1l2 | Code review analysis | completed | 3 | 12,800 | yesterday |
```

## Session ID Format

Sessions use unique IDs: `rlm-{8 hex chars}` (e.g., `rlm-a1b2c3d4`)

## Notion Integration

Sessions are logged to the RLM Sessions database for audit trail:

| Property | Type | Description |
|----------|------|-------------|
| Name | Title | Session ID |
| Task | Rich text | Task description |
| Status | Select | running/completed/stopped/error |
| IterationCount | Number | Total iterations |
| TotalTokens | Number | Total tokens used |
| StopReason | Rich text | Why stopped |
| StartedAt | Date | When started |
| CompletedAt | Date | When finished |

## Stop Reasons

| Reason | Description |
|--------|-------------|
| completed | Task successfully completed |
| no_refinement | Output deemed satisfactory |
| max_iterations | Hit iteration cap |
| max_depth | Hit depth cap |
| max_subagents | Hit subagent cap |
| budget_exceeded | BudgetGovernor stopped |
| user_cancelled | User requested stop |
| error | Unrecoverable error |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DJ_NOTION_RLM_SESSIONS_DB_ID` | RLM Sessions Notion database ID |

## Best Practices

1. **Start small**: Use defaults first, increase iterations only if needed
2. **Clear tasks**: Specific tasks refine better than vague ones
3. **Watch budget**: Deep mode for complex tasks, normal for most
4. **Check history**: Learn from past sessions' iteration patterns
5. **Trust early exits**: If RLM stops early, output is likely good

## Limitations

- Maximum 10 iterations per session (hard cap)
- Maximum recursion depth of 4 (hard cap)
- Maximum 3 subagent spawns per session (hard cap)
- Budget limits apply per session
- Notion logging is non-fatal (continues if write fails)
