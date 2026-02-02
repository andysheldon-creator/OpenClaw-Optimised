import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../config/config.js";
import { diagnosticLogger as diag } from "../logging/diagnostic.js";
import { normalizeProviderId } from "./model-selection.js";

/** Safety timeout: release the semaphore if the stream hasn't completed after this many ms. */
const SAFETY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Async semaphore for bounding concurrent operations.
 * Each `acquire()` decrements the permit count; `release()` increments it.
 * When permits are exhausted, `acquire()` awaits until a slot is freed.
 */
export class AsyncSemaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.permits = Math.max(1, Math.floor(maxConcurrent));
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  /** Current number of available permits. */
  get available(): number {
    return this.permits;
  }

  /** Number of tasks waiting for a permit. */
  get pendingCount(): number {
    return this.waiting.length;
  }
}

// Global map: normalized provider id → semaphore instance.
const providerSemaphores = new Map<string, AsyncSemaphore>();

/**
 * Set the max concurrent API streams for a provider.
 * Calling this replaces the previous semaphore (any tasks waiting on the old
 * instance will still resolve when released).
 */
export function setProviderMaxConcurrent(provider: string, maxConcurrent: number): void {
  const key = normalizeProviderId(provider);
  const clamped = Math.max(1, Math.floor(maxConcurrent));
  diag.debug(`provider-concurrency: set ${key} maxConcurrent=${clamped}`);
  providerSemaphores.set(key, new AsyncSemaphore(clamped));
}

/**
 * Read `models.providers.*.maxConcurrent` from config and initialize
 * semaphores for every provider that defines a concurrency limit.
 */
export function initProviderConcurrencyFromConfig(cfg: OpenClawConfig | undefined): void {
  const providers = cfg?.models?.providers;
  if (!providers) {
    return;
  }
  for (const [rawId, entry] of Object.entries(providers)) {
    const max = (entry as { maxConcurrent?: unknown } | undefined)?.maxConcurrent;
    if (typeof max === "number" && Number.isFinite(max) && max >= 1) {
      setProviderMaxConcurrent(rawId, max);
    }
  }
}

/**
 * Resolve the configured maxConcurrent for a provider (or undefined if unlimited).
 */
export function resolveProviderMaxConcurrent(
  cfg: OpenClawConfig | undefined,
  provider: string,
): number | undefined {
  const providers = cfg?.models?.providers;
  if (!providers) {
    return undefined;
  }
  const key = normalizeProviderId(provider);
  for (const [rawId, entry] of Object.entries(providers)) {
    if (normalizeProviderId(rawId) === key) {
      const max = (entry as { maxConcurrent?: unknown } | undefined)?.maxConcurrent;
      if (typeof max === "number" && Number.isFinite(max) && max >= 1) {
        return Math.max(1, Math.floor(max));
      }
    }
  }
  return undefined;
}

/**
 * Wrap a `StreamFn` so that each invocation acquires a permit from the
 * provider's semaphore before the API stream begins and releases it when the
 * stream completes (or errors).
 *
 * The wrapper acquires the semaphore, calls the underlying `streamFn`, then
 * hooks into the returned stream's `result()` promise to auto-release when
 * the stream finishes. A safety timeout prevents permanent slot leaks.
 *
 * If the provider has no concurrency limit configured, the original
 * `streamFn` is returned unchanged.
 */
export function wrapStreamFnWithConcurrencyGate(streamFn: StreamFn, provider: string): StreamFn {
  const key = normalizeProviderId(provider);
  const semaphore = providerSemaphores.get(key);
  if (!semaphore) {
    return streamFn;
  }

  const wrapped: StreamFn = async (...args) => {
    diag.debug(
      `provider-concurrency: acquiring slot for ${key} (available=${semaphore.available}, waiting=${semaphore.pendingCount})`,
    );
    await semaphore.acquire();
    diag.debug(`provider-concurrency: acquired slot for ${key}`);

    let released = false;
    const releaseOnce = () => {
      if (released) {
        return;
      }
      released = true;
      semaphore.release();
      diag.debug(
        `provider-concurrency: released slot for ${key} (available=${semaphore.available})`,
      );
    };

    try {
      const stream = await Promise.resolve(streamFn(...args));

      // Release when the stream completes or errors.
      void stream.result().then(releaseOnce, releaseOnce);

      // Safety net: release after timeout to prevent permanent leaks.
      const timer = setTimeout(releaseOnce, SAFETY_TIMEOUT_MS);
      void stream.result().then(
        () => clearTimeout(timer),
        () => clearTimeout(timer),
      );

      return stream;
    } catch (err) {
      releaseOnce();
      throw err;
    }
  };

  return wrapped;
}

/** Clear all configured provider semaphores (for testing). */
export function clearProviderConcurrency(): void {
  providerSemaphores.clear();
}

/** Get the semaphore for a provider (for testing/diagnostics). */
export function getProviderSemaphore(
  provider: string,
): { available: number; pendingCount: number } | undefined {
  const key = normalizeProviderId(provider);
  const sem = providerSemaphores.get(key);
  if (!sem) {
    return undefined;
  }
  return { available: sem.available, pendingCount: sem.pendingCount };
}
