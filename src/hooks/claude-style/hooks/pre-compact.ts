/**
 * PreCompact hook integration.
 *
 * Fires before context compaction. Fire-and-forget (cannot prevent compaction).
 * Useful for logging, external backup, analytics.
 */

import type { ClaudeHookPreCompactInput, ClaudeHooksConfig } from "../types.js";
import { loadConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { isClaudeHooksEnabled } from "../config.js";
import { runClaudeHook } from "../executor.js";
import { hasHooksForEvent, matchHooks } from "../registry.js";

const log = createSubsystemLogger("hooks/claude/pre-compact");

// =============================================================================
// Types
// =============================================================================

export type PreCompactHookInput = {
  /** Session identifier. */
  session_id?: string;
  /** Number of messages before compaction. */
  message_count: number;
  /** Estimated token count (optional). */
  token_estimate?: number;
  /** Working directory. */
  cwd?: string;
};

// =============================================================================
// Config Access
// =============================================================================

/**
 * Get Claude hooks config from settings.
 * Returns undefined if feature flag is disabled.
 */
function getClaudeHooksConfig(): ClaudeHooksConfig | undefined {
  if (!isClaudeHooksEnabled()) {
    return undefined;
  }
  try {
    const config = loadConfig();
    return config.hooks?.claude;
  } catch {
    return undefined;
  }
}

// =============================================================================
// PreCompact Hook Execution
// =============================================================================

/**
 * Run all matching PreCompact hooks before context compaction.
 * Fire-and-forget: does not block compaction, errors are logged but don't propagate.
 *
 * @param input - Hook input with session_id, message_count, token_estimate, and cwd
 */
export async function runPreCompactHooks(input: PreCompactHookInput): Promise<void> {
  // Get config (returns undefined if feature disabled or no config)
  const config = getClaudeHooksConfig();
  if (!config) {
    return;
  }

  // PreCompact uses "*" matcher since it applies to all compaction events
  const handlers = matchHooks(config, "PreCompact", "*");
  if (handlers.length === 0) {
    return;
  }

  // Build hook input
  const hookInput: ClaudeHookPreCompactInput = {
    hook_event_name: "PreCompact",
    session_id: input.session_id,
    message_count: input.message_count,
    token_count: input.token_estimate,
    cwd: input.cwd,
  };

  log.debug(
    `Running PreCompact hooks: session=${input.session_id} messages=${input.message_count} handlers=${handlers.length}`,
  );

  // Run all hooks in parallel (fire-and-forget)
  const promises = handlers.map(async (handler) => {
    // Only command handlers supported currently
    if (handler.type !== "command") {
      log.debug(`Skipping unsupported handler type: ${handler.type}`);
      return;
    }

    try {
      const result = await runClaudeHook(handler, hookInput);

      if ("error" in result && result.error) {
        log.warn(`PreCompact hook error: session=${input.session_id} error=${result.message}`);
      } else if ("blocked" in result && result.blocked) {
        // PreCompact hooks cannot block, but log it
        log.debug(`PreCompact hook returned block (ignored): session=${input.session_id}`);
      } else {
        log.debug(`PreCompact hook completed: session=${input.session_id}`);
      }
    } catch (err) {
      log.warn(`PreCompact hook exception: session=${input.session_id} error=${String(err)}`);
    }
  });

  // Wait for all hooks to complete (but don't propagate errors)
  await Promise.allSettled(promises);
}

// =============================================================================
// Convenience Checks
// =============================================================================

/**
 * Check if any PreCompact hooks are configured.
 */
export function hasPreCompactHooks(): boolean {
  const config = getClaudeHooksConfig();
  if (!config) {
    return false;
  }
  return hasHooksForEvent(config, "PreCompact");
}
