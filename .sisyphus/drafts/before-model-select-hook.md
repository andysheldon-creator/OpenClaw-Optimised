# Draft: before_model_select Plugin Hook

## User Request Summary
Implement a `before_model_select` plugin hook in OpenClaw fork that allows plugins to intercept and modify model selection before it's finalized. This follows TDD workflow with git-opencode-workflow integration.

## Confirmed Requirements
- **Location**: /Users/koed/Dev/openclaw-fork
- **Branch**: feat/plugin-model-api
- **Issue**: #2 (existing)
- **Workflow**: TDD (tests first), atomic commits with `feat(#2): <desc>` format
- **Max commits**: 7 (squash if more)

## Files to Modify
1. `src/plugins/types.ts` - Add hook name, event/result types, handler mapping
2. `src/plugins/hooks.ts` - Add `runBeforeModelSelect()` function and export
3. `src/auto-reply/reply/model-selection.ts` - Call hook during model selection

## Files to Create (Tests)
1. `src/plugins/hooks.before-model-select.test.ts`
2. `src/auto-reply/reply/model-selection.before-model-select.test.ts`

## Technical Decisions (from codebase analysis)

### Hook Type: Modifying Hook
Following `before_agent_start` pattern - runs sequentially, merges results from all handlers.

### Merge Strategy
Last non-undefined value wins (like `message_sending` pattern):
```typescript
(acc, next) => ({
  provider: next.provider ?? acc?.provider,
  model: next.model ?? acc?.model,
})
```

### Context Type
Use `PluginHookAgentContext` (same as other agent-related hooks).

## Decisions Made (User Confirmed)

### 1. Event Data: B) Rich
```typescript
type PluginHookBeforeModelSelectEvent = {
  provider: string;
  model: string;
  sessionKey?: string;
  allowedModelKeys: Set<string>;  // For validation
  prompt?: string;                // For classification (Ollama routing use case)
}
```

### 2. Allowlist Enforcement: A) Strict
Hook result validated against allowedModelKeys. If not in list, result is ignored and original selection is used.

### 3. Result Type: A) Model Only
```typescript
type PluginHookBeforeModelSelectResult = {
  provider?: string;
  model?: string;
}
```

### 4. Default Behavior
If no plugins register or return undefined:
- Use original model selection (backward compatible) ✓

## Use Case Context
oh-my-moltbot classifies prompts with local Ollama to route to appropriate model. Hook needs prompt text for this classification.

## Research Findings

### Existing Pattern (from hooks.ts lines 183-199)
```typescript
async function runBeforeAgentStart(event, ctx) {
  return runModifyingHook<"before_agent_start", Result>(
    "before_agent_start",
    event,
    ctx,
    (acc, next) => ({ /* merge logic */ }),
  );
}
```

### Test Pattern (from model-selection.inherit-parent.test.ts)
- Uses `vi.mock()` for dependencies
- Creates helper `makeEntry()` for test data
- Uses `resolveState()` wrapper for clean test setup

## Scope Boundaries
- **IN**: Hook types, runner function, integration in model-selection.ts, tests
- **OUT**: UI changes, config schema changes, plugin examples, documentation
