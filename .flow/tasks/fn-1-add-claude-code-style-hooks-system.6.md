# fn-1-add-claude-code-style-hooks-system.6 SubagentStart and SubagentStop hooks

## Description

Implement SubagentStart (can inject context) and SubagentStop (**observe-only**) hooks.

**Size:** M

**Files:**

- `src/agents/tools/sessions-spawn-tool.ts` (modify)
- `src/agents/subagent-registry.ts` (modify)
- `src/hooks/claude-style/hooks/subagent.ts` (new)

## Approach

**SubagentStart** at spawn time in `sessions-spawn-tool.ts`:

- Fire before subagent spawns
- Can inject additional context into subagent's task

**SubagentStop** on completion:

- Fire when subagent completes (fire-and-forget)
- **Observe-only**: cannot reject or retry work
- Use for logging, metrics, notifications

## Why SubagentStop is Observe-Only

The subagent registry (`subagent-registry.ts`) is announce/cleanup only. There is no mechanism to reject and re-run a completed subagent. Adding reject/retry would require significant orchestration changes outside this epic's scope.

## Acceptance

- [ ] `runSubagentStartHooks()` fires before subagent spawns
- [ ] SubagentStart can inject additional context into task
- [ ] `runSubagentStopHooks()` fires when subagent completes
- [ ] SubagentStop is **observe-only** (fire-and-forget, NO reject mechanism)
- [ ] Hook receives parent session_id and subagent_id
- [ ] Integration test: SubagentStart injects context
- [ ] Integration test: SubagentStop fires on completion (observe)

## Done summary

- Task completed

## Evidence

- Commits:
- Tests:
- PRs:
