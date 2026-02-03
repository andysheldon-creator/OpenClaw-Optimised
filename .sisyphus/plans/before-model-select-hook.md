# before_model_select Plugin Hook Implementation

## TL;DR

> **Quick Summary**: Implement a `before_model_select` plugin hook that allows plugins to intercept model selection and route prompts to appropriate models (e.g., local Ollama classification for model routing).
> 
> **Deliverables**:
> - Type definitions for hook event/result in `types.ts`
> - Hook runner function `runBeforeModelSelect()` in `hooks.ts`
> - Hook integration in `model-selection.ts`
> - Comprehensive test coverage for both hook runner and integration
> 
> **Estimated Effort**: Medium (4-6 hours)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 6 → Task 7

---

## Context

### Original Request
Implement `before_model_select` plugin hook in OpenClaw fork with TDD workflow and git-opencode-workflow. The hook enables oh-my-moltbot to classify prompts with local Ollama and route to appropriate models.

### Interview Summary
**Key Discussions**:
- Event data: Rich context with `{ provider, model, sessionKey, allowedModelKeys, prompt? }`
- Allowlist: Strict enforcement - validate hook result against allowlist
- Result type: Simple `{ provider?, model? }` - keep it minimal
- Use case: Prompt classification for intelligent model routing

**Research Findings**:
- Existing hooks use `runModifyingHook` pattern with merge function (hooks.ts:133-173)
- Model selection already validates overrides against `allowedModelKeys` (model-selection.ts:349-352)
- Test patterns use `vi.mock()` and helper functions (model-selection.inherit-parent.test.ts)
- Hook runner accessed via `getGlobalHookRunner()` from `hook-runner-global.ts`

### Self-Review (Gap Analysis)

**Identified Gaps (addressed)**:
- `createModelSelectionState` doesn't receive `prompt` - Added as optional param in Task 4
- Need to handle empty allowedModelKeys (size 0 means all allowed) - Addressed in acceptance criteria
- Need to import hook runner in model-selection.ts - Added explicit step in Task 4

---

## Work Objectives

### Core Objective
Enable plugins to intercept and modify model selection before it's finalized, allowing intelligent routing based on prompt content.

### Concrete Deliverables
- `PluginHookBeforeModelSelectEvent` type in `src/plugins/types.ts`
- `PluginHookBeforeModelSelectResult` type in `src/plugins/types.ts`
- Handler entry in `PluginHookHandlerMap` in `src/plugins/types.ts`
- `runBeforeModelSelect()` function in `src/plugins/hooks.ts`
- Hook call integration in `src/auto-reply/reply/model-selection.ts`
- Test file `src/plugins/hooks.before-model-select.test.ts`
- Test file `src/auto-reply/reply/model-selection.before-model-select.test.ts`

### Definition of Done
- [ ] All new types compile without errors: `pnpm build`
- [ ] All tests pass: `pnpm test`
- [ ] Hook is called during model selection (verified by test)
- [ ] Hook result respects allowlist (verified by test)
- [ ] No plugins registered = no change in behavior (backward compatible)

### Must Have
- Type-safe event and result types
- Priority-ordered hook execution (following existing pattern)
- Allowlist validation for hook results
- Backward compatibility when no plugins registered

### Must NOT Have (Guardrails)
- NO changes to existing hook behavior
- NO changes to config schema
- NO documentation changes (separate task)
- NO example plugin code (separate task)
- NO changes to other model selection logic
- NO `any` types - full TypeScript compliance

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (vitest configured)
- **User wants tests**: YES (TDD)
- **Framework**: vitest

### TDD Workflow
Each implementation task follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Setup branch and verify test infrastructure
└── (sequential gate)

Wave 2 (After Wave 1):
├── Task 2: Type definitions + tests (types.ts)
└── Task 3: Hook runner tests (hooks.ts test file - RED phase)

Wave 3 (After Wave 2):
├── Task 4: Hook runner implementation (hooks.ts - GREEN phase)
└── Task 5: Integration tests (model-selection.ts test file - RED phase)

Wave 4 (After Wave 3):
├── Task 6: Integration implementation (model-selection.ts - GREEN phase)

Wave 5 (After Wave 4):
└── Task 7: Full verification and commit squash if needed

Critical Path: Task 1 → Task 2 → Task 4 → Task 6 → Task 7
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None (setup) |
| 2 | 1 | 3, 4, 5 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | 5, 6 | None |
| 5 | 4 | 6 | None |
| 6 | 5 | 7 | None |
| 7 | 6 | None | None (final) |

---

## TODOs

- [ ] 1. Setup: Create branch and verify environment

  **What to do**:
  - Checkout to openclaw-fork directory
  - Create branch `feat/plugin-model-api` from main
  - Verify issue #2 exists
  - Run `pnpm install` to ensure dependencies
  - Run `pnpm build` to verify clean baseline
  - Run `pnpm test` to verify test infrastructure

  **Must NOT do**:
  - Make any code changes
  - Commit anything yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple setup task with shell commands only
  - **Skills**: [`git-master`]
    - `git-master`: Branch creation and git operations

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (setup gate)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:
  - Repository: `/Users/koed/Dev/openclaw-fork`
  - Issue: #2 (existing)

  **Acceptance Criteria**:

  ```bash
  # Verify branch creation
  cd /Users/koed/Dev/openclaw-fork && git branch --show-current
  # Assert: Output is "feat/plugin-model-api"

  # Verify clean build
  pnpm build
  # Assert: Exit code 0, no errors

  # Verify tests pass
  pnpm test --run
  # Assert: Exit code 0, all tests pass
  ```

  **Commit**: NO (setup only)

---

- [ ] 2. Types: Add hook types to types.ts (TDD - types first)

  **What to do**:
  1. Add `"before_model_select"` to `PluginHookName` union type (after line 301)
  2. Add `PluginHookBeforeModelSelectEvent` type (after gateway types, ~line 461):
     ```typescript
     // before_model_select hook
     export type PluginHookBeforeModelSelectEvent = {
       provider: string;
       model: string;
       sessionKey?: string;
       allowedModelKeys: Set<string>;
       prompt?: string;
     };
     ```
  3. Add `PluginHookBeforeModelSelectResult` type:
     ```typescript
     export type PluginHookBeforeModelSelectResult = {
       provider?: string;
       model?: string;
     };
     ```
  4. Add handler to `PluginHookHandlerMap` (after gateway_stop, ~line 517):
     ```typescript
     before_model_select: (
       event: PluginHookBeforeModelSelectEvent,
       ctx: PluginHookAgentContext,
     ) => Promise<PluginHookBeforeModelSelectResult | void> | PluginHookBeforeModelSelectResult | void;
     ```

  **Must NOT do**:
  - Add any implementation code
  - Modify existing type definitions
  - Add runtime logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type additions following established patterns
  - **Skills**: []
    - No special skills needed - straightforward TypeScript types

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (first)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (existing types to follow):
  - `/Users/koed/Dev/openclaw-fork/src/plugins/types.ts:287-301` - PluginHookName union pattern
  - `/Users/koed/Dev/openclaw-fork/src/plugins/types.ts:311-320` - Event/Result type pattern (before_agent_start)
  - `/Users/koed/Dev/openclaw-fork/src/plugins/types.ts:464-518` - PluginHookHandlerMap entries pattern

  **Type References**:
  - `/Users/koed/Dev/openclaw-fork/src/plugins/types.ts:304-309` - PluginHookAgentContext (context type to use)

  **Acceptance Criteria**:

  ```bash
  # Verify types compile
  cd /Users/koed/Dev/openclaw-fork && pnpm build
  # Assert: Exit code 0, no type errors
  
  # Verify type exists (TypeScript will fail if missing)
  bun -e "import type { PluginHookBeforeModelSelectEvent, PluginHookBeforeModelSelectResult } from './src/plugins/types.js'; console.log('Types exist')"
  # Assert: Output "Types exist"
  ```

  **Commit**: YES
  - Message: `feat(#2): add before_model_select hook types`
  - Files: `src/plugins/types.ts`
  - Pre-commit: `pnpm build`

---

- [ ] 3. Tests (RED): Write failing tests for hook runner

  **What to do**:
  1. Create test file `src/plugins/hooks.before-model-select.test.ts`
  2. Write tests for:
     - Hook executes with correct event data
     - Hook respects priority ordering (higher priority first)
     - Multiple hooks merge results (last non-undefined wins)
     - Hook returning undefined doesn't change selection
     - Error in hook is caught and logged (doesn't throw)
  3. Tests MUST FAIL initially (RED phase) - implementation doesn't exist yet

  **Must NOT do**:
  - Implement the actual hook runner function
  - Modify hooks.ts
  - Make tests pass yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation following established patterns
  - **Skills**: []
    - No special skills - vitest patterns are straightforward

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Test References** (testing patterns to follow):
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.inherit-parent.test.ts` - Test structure, vi.mock patterns, helper functions
  - `/Users/koed/Dev/openclaw-fork/src/plugins/loader.test.ts` - Plugin test patterns

  **Pattern References** (hook runner to test):
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:183-199` - runBeforeAgentStart pattern (what we're testing)
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:133-173` - runModifyingHook implementation

  **Test File Template**:
  ```typescript
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import { createHookRunner } from "./hooks.js";
  import type { PluginRegistry } from "./registry.js";
  import type {
    PluginHookBeforeModelSelectEvent,
    PluginHookAgentContext,
  } from "./types.js";

  // Test that runBeforeModelSelect:
  // 1. Calls handlers in priority order
  // 2. Merges results correctly
  // 3. Returns undefined when no handlers
  // 4. Catches errors gracefully
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify test file exists
  ls /Users/koed/Dev/openclaw-fork/src/plugins/hooks.before-model-select.test.ts
  # Assert: File exists

  # Verify tests fail (RED phase)
  cd /Users/koed/Dev/openclaw-fork && pnpm test src/plugins/hooks.before-model-select.test.ts --run 2>&1 || true
  # Assert: Tests run but FAIL (property 'runBeforeModelSelect' does not exist or similar)
  ```

  **Commit**: YES
  - Message: `test(#2): add failing tests for runBeforeModelSelect hook runner`
  - Files: `src/plugins/hooks.before-model-select.test.ts`
  - Pre-commit: `pnpm build` (tests can fail, build must pass)

---

- [ ] 4. Implementation (GREEN): Implement runBeforeModelSelect in hooks.ts

  **What to do**:
  1. Add import for new types in hooks.ts (line ~36):
     ```typescript
     PluginHookBeforeModelSelectEvent,
     PluginHookBeforeModelSelectResult,
     ```
  2. Add re-export for new types (line ~63):
     ```typescript
     PluginHookBeforeModelSelectEvent,
     PluginHookBeforeModelSelectResult,
     ```
  3. Add `runBeforeModelSelect` function (after runAfterCompaction, ~line 231):
     ```typescript
     /**
      * Run before_model_select hook.
      * Allows plugins to intercept and modify model selection.
      * Runs sequentially in priority order, merging results.
      */
     async function runBeforeModelSelect(
       event: PluginHookBeforeModelSelectEvent,
       ctx: PluginHookAgentContext,
     ): Promise<PluginHookBeforeModelSelectResult | undefined> {
       return runModifyingHook<"before_model_select", PluginHookBeforeModelSelectResult>(
         "before_model_select",
         event,
         ctx,
         (acc, next) => ({
           provider: next.provider ?? acc?.provider,
           model: next.model ?? acc?.model,
         }),
       );
     }
     ```
  4. Add to return object (line ~447, in Agent hooks section):
     ```typescript
     runBeforeModelSelect,
     ```
  5. Run tests to verify GREEN

  **Must NOT do**:
  - Modify existing hook implementations
  - Change runModifyingHook behavior
  - Add extra logic beyond the pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Following established pattern exactly
  - **Skills**: []
    - No special skills - copy existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 3

  **References**:

  **Pattern References** (exact pattern to follow):
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:183-199` - runBeforeAgentStart implementation (COPY THIS PATTERN)
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:253-265` - runMessageSending (another modifying hook example)

  **Type References**:
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:38-64` - Type re-exports section
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hooks.ts:442-465` - Return object structure

  **Acceptance Criteria**:

  ```bash
  # Verify build passes
  cd /Users/koed/Dev/openclaw-fork && pnpm build
  # Assert: Exit code 0

  # Verify hook runner tests now pass (GREEN)
  pnpm test src/plugins/hooks.before-model-select.test.ts --run
  # Assert: Exit code 0, all tests pass

  # Verify function is exported
  bun -e "import { createHookRunner } from './src/plugins/hooks.js'; const r = createHookRunner({ hooks: [], typedHooks: [] }); console.log(typeof r.runBeforeModelSelect)"
  # Assert: Output "function"
  ```

  **Commit**: YES
  - Message: `feat(#2): implement runBeforeModelSelect hook runner`
  - Files: `src/plugins/hooks.ts`
  - Pre-commit: `pnpm test src/plugins/hooks.before-model-select.test.ts --run`

---

- [ ] 5. Tests (RED): Write failing tests for model-selection integration

  **What to do**:
  1. Create test file `src/auto-reply/reply/model-selection.before-model-select.test.ts`
  2. Write tests for:
     - Hook is called during model selection with correct event data
     - Hook result overrides model when in allowlist
     - Hook result is ignored when NOT in allowlist (strict enforcement)
     - Hook result is applied when allowlist is empty (all allowed)
     - No hook registered = original selection unchanged
     - Hook receives prompt when provided
  3. Mock `getGlobalHookRunner` to control hook behavior
  4. Tests MUST FAIL initially (RED phase)

  **Must NOT do**:
  - Modify model-selection.ts
  - Implement integration yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation with mocking
  - **Skills**: []
    - Standard vitest mocking patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Test References**:
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.inherit-parent.test.ts` - EXACT test structure to follow (makeEntry, resolveState helpers, vi.mock patterns)

  **Pattern References**:
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hook-runner-global.ts:42-44` - getGlobalHookRunner to mock
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.ts:340-353` - Where hook will be called (context for test setup)

  **Test File Template**:
  ```typescript
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import type { OpenClawConfig } from "../../config/config.js";
  import { createModelSelectionState } from "./model-selection.js";

  vi.mock("../../agents/model-catalog.js", () => ({
    loadModelCatalog: vi.fn(async () => [...]),
  }));

  vi.mock("../../plugins/hook-runner-global.js", () => ({
    getGlobalHookRunner: vi.fn(() => null), // Override per test
  }));

  // Test hook integration:
  // 1. Hook called with correct event
  // 2. Result applied when allowed
  // 3. Result ignored when not allowed
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify test file exists
  ls /Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.before-model-select.test.ts
  # Assert: File exists

  # Verify tests fail (RED phase - hook not called yet)
  cd /Users/koed/Dev/openclaw-fork && pnpm test src/auto-reply/reply/model-selection.before-model-select.test.ts --run 2>&1 || true
  # Assert: Tests run but FAIL (hook not being called in implementation)
  ```

  **Commit**: YES
  - Message: `test(#2): add failing tests for before_model_select integration`
  - Files: `src/auto-reply/reply/model-selection.before-model-select.test.ts`
  - Pre-commit: `pnpm build`

---

- [ ] 6. Implementation (GREEN): Integrate hook in model-selection.ts

  **What to do**:
  1. Add import at top of model-selection.ts:
     ```typescript
     import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
     ```
  2. Add `prompt?: string` to `createModelSelectionState` params (line ~273)
  3. After stored override is resolved (after line 353), add hook call:
     ```typescript
     // Run before_model_select hook
     const hookRunner = getGlobalHookRunner();
     if (hookRunner) {
       const hookEvent = {
         provider,
         model,
         sessionKey,
         allowedModelKeys,
         prompt: params.prompt,
       };
       const hookCtx = { sessionKey };
       const hookResult = await hookRunner.runBeforeModelSelect(hookEvent, hookCtx);
       if (hookResult) {
         const candidateProvider = hookResult.provider ?? provider;
         const candidateModel = hookResult.model ?? model;
         if (candidateModel) {
           const key = modelKey(candidateProvider, candidateModel);
           if (allowedModelKeys.size === 0 || allowedModelKeys.has(key)) {
             provider = candidateProvider;
             model = candidateModel;
           }
         }
       }
     }
     ```
  4. Run tests to verify GREEN

  **Must NOT do**:
  - Change existing model selection logic
  - Bypass allowlist validation
  - Add logging or debug code
  - Modify other parts of the function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single integration point following existing pattern
  - **Skills**: []
    - Standard TypeScript implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Pattern References** (validation pattern to follow):
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.ts:346-352` - Existing override validation pattern (FOLLOW THIS EXACTLY)

  **Import References**:
  - `/Users/koed/Dev/openclaw-fork/src/plugins/hook-runner-global.ts:42-44` - getGlobalHookRunner function

  **Integration Point**:
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/model-selection.ts:353` - Insert hook call AFTER this line

  **Call Site Reference** (needs prompt param):
  - `/Users/koed/Dev/openclaw-fork/src/auto-reply/reply/get-reply-directives.ts:380-393` - Main call site (may need update to pass prompt)

  **Acceptance Criteria**:

  ```bash
  # Verify build passes
  cd /Users/koed/Dev/openclaw-fork && pnpm build
  # Assert: Exit code 0

  # Verify integration tests now pass (GREEN)
  pnpm test src/auto-reply/reply/model-selection.before-model-select.test.ts --run
  # Assert: Exit code 0, all tests pass

  # Verify hook runner tests still pass
  pnpm test src/plugins/hooks.before-model-select.test.ts --run
  # Assert: Exit code 0

  # Verify existing model-selection tests still pass
  pnpm test src/auto-reply/reply/model-selection.inherit-parent.test.ts --run
  # Assert: Exit code 0 (backward compatibility)
  ```

  **Commit**: YES
  - Message: `feat(#2): integrate before_model_select hook in model selection`
  - Files: `src/auto-reply/reply/model-selection.ts`
  - Pre-commit: `pnpm test --run`

---

- [ ] 7. Verification: Full test suite and commit cleanup

  **What to do**:
  1. Run full build: `pnpm build`
  2. Run full test suite: `pnpm test --run`
  3. Check commit count: `git log --oneline feat/plugin-model-api ^main | wc -l`
  4. If > 7 commits, squash to consolidate
  5. Run `git log --oneline` to verify commit messages follow `feat(#2):` pattern
  6. Verify no uncommitted changes: `git status`

  **Must NOT do**:
  - Push to remote (user will do this)
  - Create PR (user will do this)
  - Make additional code changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification and git cleanup only
  - **Skills**: [`git-master`]
    - `git-master`: Squash/rebase if needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (final)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:
  - Git workflow: Max 7 commits, squash if more
  - Commit format: `feat(#2): <description>`

  **Acceptance Criteria**:

  ```bash
  # Full build verification
  cd /Users/koed/Dev/openclaw-fork && pnpm build
  # Assert: Exit code 0

  # Full test suite
  pnpm test --run
  # Assert: Exit code 0, all tests pass

  # Commit count check
  git log --oneline feat/plugin-model-api ^main | wc -l
  # Assert: Output ≤ 7

  # Verify commit format
  git log --oneline feat/plugin-model-api ^main
  # Assert: All commits match pattern "feat(#2): *" or "test(#2): *"

  # Verify clean working directory
  git status --porcelain
  # Assert: Empty output (no uncommitted changes)
  ```

  **Commit**: NO (verification only, squash if needed)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 2 | `feat(#2): add before_model_select hook types` | types.ts | pnpm build |
| 3 | `test(#2): add failing tests for runBeforeModelSelect hook runner` | hooks.before-model-select.test.ts | pnpm build |
| 4 | `feat(#2): implement runBeforeModelSelect hook runner` | hooks.ts | pnpm test hooks.before-model-select |
| 5 | `test(#2): add failing tests for before_model_select integration` | model-selection.before-model-select.test.ts | pnpm build |
| 6 | `feat(#2): integrate before_model_select hook in model selection` | model-selection.ts | pnpm test --run |

**Total commits**: 5 (within 7 limit)

---

## Success Criteria

### Verification Commands
```bash
# Full build
pnpm build
# Expected: Exit code 0

# All tests pass
pnpm test --run
# Expected: Exit code 0, includes new test files

# Specific hook tests
pnpm test src/plugins/hooks.before-model-select.test.ts --run
pnpm test src/auto-reply/reply/model-selection.before-model-select.test.ts --run
# Expected: Both pass
```

### Final Checklist
- [ ] `before_model_select` added to PluginHookName type
- [ ] Event type includes provider, model, sessionKey, allowedModelKeys, prompt
- [ ] Result type includes optional provider and model
- [ ] Handler added to PluginHookHandlerMap
- [ ] `runBeforeModelSelect` function in hooks.ts
- [ ] Types re-exported from hooks.ts
- [ ] Hook called in model-selection.ts after stored override resolution
- [ ] Hook result validated against allowlist (strict)
- [ ] Backward compatible - no change when no plugins registered
- [ ] All tests pass
- [ ] ≤ 7 commits with proper format
