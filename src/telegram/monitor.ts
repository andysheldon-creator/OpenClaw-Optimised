import { type RunOptions, run } from "@grammyjs/runner";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveAgentMaxConcurrent } from "../config/agent-limits.js";
import { loadConfig } from "../config/config.js";
import { computeBackoff, sleepWithAbort } from "../infra/backoff.js";
import { formatErrorMessage } from "../infra/errors.js";
import { formatDurationMs } from "../infra/format-duration.js";
import { registerUnhandledRejectionHandler } from "../infra/unhandled-rejections.js";
import { resolveTelegramAccount } from "./accounts.js";
import { resolveTelegramAllowedUpdates } from "./allowed-updates.js";
import { createTelegramBot } from "./bot.js";
import { isRecoverableTelegramNetworkError } from "./network-errors.js";
import { makeProxyFetch } from "./proxy.js";
import { readTelegramUpdateOffset, writeTelegramUpdateOffset } from "./update-offset-store.js";
import { startTelegramWebhook } from "./webhook.js";

/**
 * Instance tracking state for single-instance enforcement.
 * Prevents duplicate Telegram provider instances during rapid restarts (e.g., SIGUSR1).
 */
type InstanceState = {
  running: boolean;
  starting: boolean;
  lastStartAttempt: number;
};

const instanceStates = new Map<string, InstanceState>();

/** Minimum delay between start attempts to debounce rapid restarts (ms) */
const START_DEBOUNCE_MS = 1500;

function getInstanceState(accountId: string): InstanceState {
  let state = instanceStates.get(accountId);
  if (!state) {
    state = { running: false, starting: false, lastStartAttempt: 0 };
    instanceStates.set(accountId, state);
  }
  return state;
}

function setInstanceRunning(accountId: string, running: boolean): void {
  const state = getInstanceState(accountId);
  state.running = running;
  // Clear starting flag on any state transition:
  // - running=true means we successfully started, so no longer "starting"
  // - running=false means we stopped, so also no longer "starting"
  state.starting = false;
}

function setInstanceStarting(accountId: string, starting: boolean): void {
  const state = getInstanceState(accountId);
  state.starting = starting;
}

function recordStartAttempt(accountId: string): void {
  const state = getInstanceState(accountId);
  state.lastStartAttempt = Date.now();
}

/**
 * Check if we should skip starting due to debounce or already running.
 * Returns a reason string if should skip, or null if OK to start.
 */
function shouldSkipStart(accountId: string): string | null {
  const state = getInstanceState(accountId);
  if (state.running) {
    return "instance already running";
  }
  if (state.starting) {
    return "instance currently starting";
  }
  const elapsed = Date.now() - state.lastStartAttempt;
  if (elapsed < START_DEBOUNCE_MS) {
    return `debounced (${elapsed}ms since last attempt, need ${START_DEBOUNCE_MS}ms)`;
  }
  return null;
}

export type MonitorTelegramOpts = {
  token?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  proxyFetch?: typeof fetch;
  webhookUrl?: string;
};

export function createTelegramRunnerOptions(cfg: OpenClawConfig): RunOptions<unknown> {
  return {
    sink: {
      concurrency: resolveAgentMaxConcurrent(cfg),
    },
    runner: {
      fetch: {
        // Match grammY defaults
        timeout: 30,
        // Request reactions without dropping default update types.
        allowed_updates: resolveTelegramAllowedUpdates(),
      },
      // Suppress grammY getUpdates stack traces; we log concise errors ourselves.
      silent: true,
      // Retry transient failures for a limited window before surfacing errors.
      maxRetryTime: 5 * 60 * 1000,
      retryInterval: "exponential",
    },
  };
}

const TELEGRAM_POLL_RESTART_POLICY = {
  initialMs: 2000,
  maxMs: 30_000,
  factor: 1.8,
  jitter: 0.25,
};

const isGetUpdatesConflict = (err: unknown) => {
  if (!err || typeof err !== "object") {
    return false;
  }
  const typed = err as {
    error_code?: number;
    errorCode?: number;
    description?: string;
    method?: string;
    message?: string;
  };
  const errorCode = typed.error_code ?? typed.errorCode;
  if (errorCode !== 409) {
    return false;
  }
  const haystack = [typed.method, typed.description, typed.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return haystack.includes("getupdates");
};

/** Check if error is a Grammy HttpError (used to scope unhandled rejection handling) */
const isGrammyHttpError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") {
    return false;
  }
  return (err as { name?: string }).name === "HttpError";
};

export async function monitorTelegramProvider(opts: MonitorTelegramOpts = {}) {
  // Use mutable ref so handler closure sees updated accountId after resolution
  let resolvedAccountId = opts.accountId ?? "default";

  // Register handler for Grammy HttpError unhandled rejections FIRST,
  // before ANY other operations (including logger setup).
  // This catches network errors that escape the polling loop's try-catch
  // (e.g., from setMyCommands during bot setup).
  // We gate on isGrammyHttpError to avoid suppressing non-Telegram errors.
  const unregisterHandler = registerUnhandledRejectionHandler((err) => {
    if (isGrammyHttpError(err) && isRecoverableTelegramNetworkError(err, { context: "polling" })) {
      const logError = opts.runtime?.error ?? console.error;
      logError(
        `[telegram:${resolvedAccountId}] Suppressed network error: ${formatErrorMessage(err)}`,
      );
      return true; // handled - don't crash
    }
    return false;
  });

  const logError = opts.runtime?.error ?? console.error;
  const logInfo = opts.runtime?.log ?? console.log;

  try {
    // Resolve account early for instance tracking
    const cfg = opts.config ?? loadConfig();
    const account = resolveTelegramAccount({
      cfg,
      accountId: opts.accountId,
    });
    const accountId = account.accountId;
    resolvedAccountId = accountId; // Update for handler logging

    // Single-instance enforcement: check if already running or starting
    const skipReason = shouldSkipStart(accountId);
    if (skipReason) {
      logInfo(`[telegram:${accountId}] skipping start: ${skipReason}`);
      return;
    }

    // Mark as starting to prevent concurrent start attempts
    setInstanceStarting(accountId, true);
    const token = opts.token?.trim() || account.token;
    if (!token) {
      throw new Error(
        `Telegram bot token missing for account "${account.accountId}" (set channels.telegram.accounts.${account.accountId}.botToken/tokenFile or TELEGRAM_BOT_TOKEN for default).`,
      );
    }
    // Record timestamp AFTER validation passes (P2 fix: don't debounce on validation failures)
    recordStartAttempt(accountId);

    const proxyFetch =
      opts.proxyFetch ?? (account.config.proxy ? makeProxyFetch(account.config.proxy) : undefined);

    let lastUpdateId = await readTelegramUpdateOffset({
      accountId: account.accountId,
    });
    const persistUpdateId = async (updateId: number) => {
      if (lastUpdateId !== null && updateId <= lastUpdateId) {
        return;
      }
      lastUpdateId = updateId;
      try {
        await writeTelegramUpdateOffset({
          accountId: account.accountId,
          updateId,
        });
      } catch (err) {
        logError(`[telegram:${accountId}] failed to persist update offset: ${String(err)}`);
      }
    };

    const bot = createTelegramBot({
      token,
      runtime: opts.runtime,
      proxyFetch,
      config: cfg,
      accountId: account.accountId,
      updateOffset: {
        lastUpdateId,
        onUpdateId: persistUpdateId,
      },
    });

    if (opts.useWebhook) {
      // Explicitly clear starting flag before transitioning to running (P1 fix)
      setInstanceStarting(accountId, false);
      setInstanceRunning(accountId, true);
      try {
        await startTelegramWebhook({
          token,
          accountId: account.accountId,
          config: cfg,
          path: opts.webhookPath,
          port: opts.webhookPort,
          secret: opts.webhookSecret,
          runtime: opts.runtime as RuntimeEnv,
          fetch: proxyFetch,
          abortSignal: opts.abortSignal,
          publicUrl: opts.webhookUrl,
        });
      } finally {
        setInstanceRunning(accountId, false);
      }
      return;
    }

    // Explicitly clear starting flag before transitioning to running (P1 fix)
    setInstanceStarting(accountId, false);
    setInstanceRunning(accountId, true);
    logInfo(`[telegram:${accountId}] provider started (polling mode)`);

    // Use grammyjs/runner for concurrent update processing
    let restartAttempts = 0;

    while (!opts.abortSignal?.aborted) {
      const runner = run(bot, createTelegramRunnerOptions(cfg));
      const stopOnAbort = () => {
        if (opts.abortSignal?.aborted) {
          void runner.stop();
        }
      };
      opts.abortSignal?.addEventListener("abort", stopOnAbort, { once: true });
      try {
        // runner.task() returns a promise that resolves when the runner stops
        await runner.task();
        // Clean exit - reset restart attempts
        restartAttempts = 0;
        return;
      } catch (err) {
        if (opts.abortSignal?.aborted) {
          throw err;
        }
        const isConflict = isGetUpdatesConflict(err);
        const isRecoverable = isRecoverableTelegramNetworkError(err, { context: "polling" });
        if (!isConflict && !isRecoverable) {
          throw err;
        }
        restartAttempts += 1;
        const delayMs = computeBackoff(TELEGRAM_POLL_RESTART_POLICY, restartAttempts);
        const reason = isConflict ? "getUpdates conflict" : "network error";
        const errMsg = formatErrorMessage(err);
        logError(
          `[telegram:${accountId}] ${reason}: ${errMsg}; retrying in ${formatDurationMs(delayMs)} (attempt ${restartAttempts}).`,
        );
        try {
          await sleepWithAbort(delayMs, opts.abortSignal);
        } catch (sleepErr) {
          if (opts.abortSignal?.aborted) {
            return;
          }
          throw sleepErr;
        }
      } finally {
        opts.abortSignal?.removeEventListener("abort", stopOnAbort);
      }
    }
  } finally {
    // Always clean up instance state and unregister handler on exit.
    // Use resolvedAccountId which is always available (initialized before try block).
    setInstanceRunning(resolvedAccountId, false);
    logInfo(`[telegram:${resolvedAccountId}] provider stopped`);
    unregisterHandler();
  }
}

/**
 * Reset instance state for testing purposes.
 * @internal
 */
export function __resetInstanceStates(): void {
  instanceStates.clear();
}
