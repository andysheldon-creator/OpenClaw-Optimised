/**
 * Dynamic loader for internal hook handlers
 *
 * Loads hook handlers from external modules based on configuration
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerInternalHook } from './internal-hooks.js';
import type { ClawdbotConfig } from '../config/config.js';
import type { InternalHookHandler } from './internal-hooks.js';

/**
 * Load and register all internal hook handlers defined in the configuration
 *
 * @param cfg - Clawdbot configuration
 * @returns Number of handlers successfully loaded
 *
 * @example
 * ```ts
 * const config = await loadConfig();
 * const count = await loadInternalHooks(config);
 * console.log(`Loaded ${count} internal hook handlers`);
 * ```
 */
export async function loadInternalHooks(cfg: ClawdbotConfig): Promise<number> {
  console.log('[internal-hooks] loadInternalHooks called');
  // Check if internal hooks are enabled
  if (!cfg.hooks?.internal?.enabled) {
    console.log('[internal-hooks] Internal hooks not enabled in config');
    return 0;
  }

  const handlers = cfg.hooks.internal.handlers ?? [];
  console.log(`[internal-hooks] Found ${handlers.length} handlers to load`);
  let loadedCount = 0;

  for (const handlerConfig of handlers) {
    try {
      // Resolve module path (absolute or relative to cwd)
      const modulePath = path.isAbsolute(handlerConfig.module)
        ? handlerConfig.module
        : path.join(process.cwd(), handlerConfig.module);

      // Import the module
      const url = pathToFileURL(modulePath).href;
      const mod = (await import(url)) as Record<string, unknown>;

      // Get the handler function
      const exportName = handlerConfig.export ?? 'default';
      const handler = mod[exportName];

      if (typeof handler !== 'function') {
        console.error(
          `Internal hook error: Handler '${exportName}' from ${modulePath} is not a function`
        );
        continue;
      }

      // Register the handler
      registerInternalHook(handlerConfig.event, handler as InternalHookHandler);
      console.log(
        `Registered internal hook: ${handlerConfig.event} -> ${modulePath}${exportName !== 'default' ? `#${exportName}` : ''}`
      );
      loadedCount++;
    } catch (err) {
      console.error(
        `Failed to load internal hook handler from ${handlerConfig.module}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return loadedCount;
}
