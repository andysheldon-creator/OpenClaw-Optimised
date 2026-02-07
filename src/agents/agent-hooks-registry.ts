/**
 * Pre-Answer Hook Registry
 *
 * Manages registration and execution of pre-answer hooks
 */

import {
  type ContextFragment,
  type HookExecutionResult,
  type PreAnswerHook,
  type PreAnswerHookParams,
  type PreAnswerHookResult,
} from "./agent-hooks-types.js";

class PreAnswerHookRegistry {
  private hooks: Map<string, PreAnswerHook> = new Map();
  private enabledHooks: Set<string> = new Set();

  /**
   * Register a hook
   */
  register(hook: PreAnswerHook): void {
    this.hooks.set(hook.id, hook);

    // Enable by default if the hook specifies it
    if (hook.enabledByDefault !== false) {
      this.enabledHooks.add(hook.id);
    }
  }

  /**
   * Unregister a hook
   */
  unregister(id: string): void {
    this.hooks.delete(id);
    this.enabledHooks.delete(id);
  }

  /**
   * Check if a hook is registered
   */
  has(id: string): boolean {
    return this.hooks.has(id);
  }

  /**
   * Get a specific hook
   */
  get(id: string): PreAnswerHook | undefined {
    return this.hooks.get(id);
  }

  /**
   * Get all registered hooks, sorted by priority
   */
  getAllHooks(): PreAnswerHook[] {
    return Array.from(this.hooks.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Enable a specific hook
   */
  enable(id: string): boolean {
    if (!this.hooks.has(id)) {
      return false;
    }
    this.enabledHooks.add(id);
    return true;
  }

  /**
   * Disable a specific hook
   */
  disable(id: string): boolean {
    if (!this.hooks.has(id)) {
      return false;
    }
    this.enabledHooks.delete(id);
    return true;
  }

  /**
   * Check if a hook is enabled
   */
  isEnabled(id: string): boolean {
    return this.enabledHooks.has(id);
  }

  /**
   * Get enabled hooks, sorted by priority
   */
  getEnabledHooks(): PreAnswerHook[] {
    return Array.from(this.enabledHooks)
      .map((id) => this.hooks.get(id))
      .filter((h): h is PreAnswerHook => h !== undefined)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute all enabled hooks for the given parameters
   */
  async execute(params: PreAnswerHookParams): Promise<HookExecutionResult[]> {
    const enabledHooks = this.getEnabledHooks();
    const results: HookExecutionResult[] = [];

    for (const hook of enabledHooks) {
      // Skip if hook has a shouldExecute filter that returns false
      if (hook.shouldExecute && !hook.shouldExecute(params)) {
        continue;
      }

      const startTime = Date.now();
      const timeoutMs = hook.timeoutMs ?? 30000;

      try {
        // Execute hook with timeout safety
        const result = await Promise.race([
          hook.execute(params),
          createTimeoutPromise<PreAnswerHookResult>(timeoutMs, `Hook ${hook.id} timed out`),
        ]);

        const executionTimeMs = Date.now() - startTime;

        results.push({
          ...result,
          hook,
          executionTimeMs,
          success: true,
        });
      } catch (error) {
        const executionTimeMs = Date.now() - startTime;
        const theError = error instanceof Error ? error : new Error(String(error));

        results.push({
          contextFragments: [],
          hook,
          executionTimeMs,
          success: false,
          error: theError,
          metadata: {
            errorMessage: theError.message,
          },
        });
      }
    }

    return results;
  }

  /**
   * Execute hooks and collect all context fragments, sorted by weight
   */
  async executeAndCollect(params: PreAnswerHookParams): Promise<ContextFragment[]> {
    const results = await this.execute(params);

    // Collect all fragments with metadata
    const fragments = results.flatMap((r) =>
      r.contextFragments.map((f) => ({
        ...f,
        weight: f.weight ?? 100,
        sourceHook: r.hook.id,
      })),
    );

    // Sort by weight (ascending)
    return fragments.sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100));
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.hooks.clear();
    this.enabledHooks.clear();
  }
}

/**
 * Create a promise that rejects after timeout
 */
function createTimeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

// Global singleton instance
export const preAnswerHookRegistry = new PreAnswerHookRegistry();

// Export class for testing
export { PreAnswerHookRegistry };