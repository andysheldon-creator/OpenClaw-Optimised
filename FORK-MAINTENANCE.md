# OpenClaw Fork Maintenance Plan

**Fork Owner**: dead-pool-aka-wilson  
**Upstream**: openclaw/openclaw  
**Purpose**: Add plugin model selection API for oh-my-moltbot integration

---

## Fork Modifications (Minimal)

### Files to Modify (3 files)

| File | Modification | Purpose |
|------|--------------|---------|
| `src/plugins/types.ts` | Add `before_model_select` hook type | Hook definition |
| `src/plugins/hooks.ts` | Add hook runner for model selection | Hook execution |
| `src/auto-reply/reply/model-selection.ts` | Call hook in `createModelSelectionState()` | Hook injection point |

### Modification Details

#### 1. `src/plugins/types.ts` - Add Hook Types

```typescript
// Add to PluginHookName (line ~287)
export type PluginHookName =
  | "before_agent_start"
  // ... existing hooks ...
  | "before_model_select"   // ← ADD THIS
  | "gateway_stop";

// Add event/result types (after line ~460)
export type PluginHookBeforeModelSelectContext = {
  agentId?: string;
  sessionKey?: string;
  prompt?: string;
};

export type PluginHookBeforeModelSelectEvent = {
  defaultProvider: string;
  defaultModel: string;
  sessionOverride?: { provider?: string; model: string };
};

export type PluginHookBeforeModelSelectResult = {
  provider?: string;
  model?: string;
};

// Add to PluginHookHandlerMap (line ~464)
export type PluginHookHandlerMap = {
  // ... existing handlers ...
  before_model_select: (
    event: PluginHookBeforeModelSelectEvent,
    ctx: PluginHookBeforeModelSelectContext,
  ) => Promise<PluginHookBeforeModelSelectResult | void> | PluginHookBeforeModelSelectResult | void;
};
```

#### 2. `src/plugins/hooks.ts` - Add Hook Runner

```typescript
// Add function to run model select hook
export async function runBeforeModelSelectHook(
  registry: PluginRegistry,
  event: PluginHookBeforeModelSelectEvent,
  ctx: PluginHookBeforeModelSelectContext,
): Promise<PluginHookBeforeModelSelectResult | undefined> {
  const handlers = registry.getHookHandlers("before_model_select");
  if (handlers.length === 0) return undefined;
  
  // Run handlers in priority order, first non-void result wins
  for (const { handler } of handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    try {
      const result = await handler(event, ctx);
      if (result?.model) {
        return result;
      }
    } catch (err) {
      // Log and continue
    }
  }
  return undefined;
}
```

#### 3. `src/auto-reply/reply/model-selection.ts` - Inject Hook

```typescript
// In createModelSelectionState() around line 287, after resolving stored override:

// FORK ADDITION: Run before_model_select hook
const hookOverride = await runBeforeModelSelectHook(pluginRegistry, {
  defaultProvider,
  defaultModel,
  sessionOverride: storedOverride ?? undefined,
}, {
  agentId: params.agentId,
  sessionKey: params.sessionKey,
  prompt: params.prompt,
});

if (hookOverride?.model) {
  const key = modelKey(hookOverride.provider || defaultProvider, hookOverride.model);
  if (allowedModelKeys.size === 0 || allowedModelKeys.has(key)) {
    provider = hookOverride.provider || defaultProvider;
    model = hookOverride.model;
  }
}
```

---

## Maintenance Schedule

### Weekly Sync (Every Monday)

```bash
cd ~/Dev/openclaw-fork

# 1. Fetch upstream
git fetch upstream

# 2. Check for new commits
git log HEAD..upstream/main --oneline | head -20

# 3. If updates exist, rebase
git checkout main
git rebase upstream/main

# 4. Rebase feature branch
git checkout feat/plugin-model-api
git rebase main

# 5. Resolve conflicts if any (see Conflict Resolution below)

# 6. Force push (feature branch only)
git push --force-with-lease origin feat/plugin-model-api
```

### On Upstream Release (Check CHANGELOG.md)

```bash
# 1. Check release notes
curl -s https://raw.githubusercontent.com/openclaw/openclaw/main/CHANGELOG.md | head -100

# 2. Check if our modified files changed
git diff upstream/main -- src/plugins/types.ts src/plugins/hooks.ts src/auto-reply/reply/model-selection.ts

# 3. If conflicts, resolve carefully (see below)
```

### Conflict Resolution Strategy

**Priority**: Upstream changes take precedence unless they break our hook.

| File | Conflict Type | Resolution |
|------|---------------|------------|
| `types.ts` | New hook added | Add ours after theirs |
| `types.ts` | Hook renamed | Update ours to match |
| `hooks.ts` | New runner pattern | Adapt ours to new pattern |
| `model-selection.ts` | Function signature changed | Update hook call site |
| `model-selection.ts` | Logic restructured | Find new injection point |

**If upstream adds `before_model_select` hook natively:**
- Compare functionality
- If equivalent → remove our fork modifications
- If different → adapt or keep ours

---

## Development Workflow

### Setup

```bash
cd ~/Dev/openclaw-fork

# Install dependencies
pnpm install

# Build
pnpm build

# Link globally for testing
npm link
```

### Testing Changes

```bash
# Run tests
pnpm test

# Test specific file
pnpm test src/plugins/hooks.test.ts

# Run with oh-my-moltbot
cd ~/Dev/oh-my-moltbot
npm link openclaw
bun run dev
```

### Creating Feature Branch

```bash
git checkout main
git pull upstream main
git checkout -b feat/plugin-model-api

# Make minimal changes
# ... edit files ...

git add -p  # Review each change
git commit -m "feat: add before_model_select plugin hook for external routing"
```

---

## Usage in oh-my-moltbot

```typescript
// In moltbot-plugin/index.ts

api.on('before_model_select', async (event, ctx) => {
  // Only route if gateway is enabled
  if (!gatewayRoutingEnabled) return;
  
  // Analyze prompt with local Ollama
  const routing = await gateway.analyze(ctx.prompt);
  const targetModel = CATEGORY_TO_MODEL[routing.category];
  
  if (targetModel) {
    const [provider, model] = targetModel.split('/');
    return { provider, model };
  }
  
  // Return undefined to use default
}, { priority: 100 });
```

---

## Upstream Contribution Path

If our hook proves useful, contribute back:

1. **Open Issue**: Describe use case for plugin model selection
2. **RFC**: Propose hook design
3. **PR**: Submit minimal implementation
4. **If Merged**: Remove fork, use official package

**PR Template**:
```markdown
## Summary
Add `before_model_select` plugin hook for external routing integration.

## Use Case
Plugins like oh-my-moltbot need to route requests to different models
based on prompt classification (local Ollama → paid API cascade).

## Changes
- Add hook type definitions to `src/plugins/types.ts`
- Add hook runner to `src/plugins/hooks.ts`
- Call hook in `src/auto-reply/reply/model-selection.ts`

## Backward Compatible
Yes - no changes to existing behavior if no plugins register the hook.
```

---

## Quick Reference

### Commands

```bash
# Sync with upstream
git fetch upstream && git rebase upstream/main

# Build and test
pnpm build && pnpm test

# Link for local dev
npm link

# Check diff against upstream
git diff upstream/main -- src/plugins/ src/auto-reply/
```

### Key Files

| File | Purpose |
|------|---------|
| `src/plugins/types.ts` | Hook type definitions |
| `src/plugins/hooks.ts` | Hook execution |
| `src/auto-reply/reply/model-selection.ts` | Model selection logic |
| `src/agents/model-selection.ts` | Model resolution utilities |
| `src/sessions/model-overrides.ts` | Session override persistence |

### Contacts

- **Upstream Issues**: https://github.com/openclaw/openclaw/issues
- **Fork**: https://github.com/dead-pool-aka-wilson/openclaw
