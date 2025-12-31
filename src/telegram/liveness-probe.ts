import type { Bot } from "grammy";
import { getChildLogger } from "../logging.js";

const logger = getChildLogger({ module: "telegram-liveness" });

export interface LivenessProbeOptions {
  bot: Bot;
  /** Interval in milliseconds to check liveness (default: 60000) */
  intervalMs?: number;
  /** Timeout for bot operations (default: 15000) */
  timeoutMs?: number;
  /** Number of consecutive failures before forcing exit (default: 3) */
  maxConsecutiveFailures?: number;
  /** Callback when liveness check fails (default: logs and exits) */
  onFailure?: (error: Error) => void;
}

/**
 * Starts a liveness probe for the Telegram bot that ensures the bot can
 * send/receive messages. If the bot becomes unresponsive, the process will
 * exit, allowing systemd to restart the service.
 * 
 * This addresses the critical issue where long-polling bots can silently
 * fail without crashing the process.
 */
export function startLivenessProbe(opts: LivenessProbeOptions) {
  const {
    bot,
    intervalMs = 60000, // 1 minute
    timeoutMs = 15000,  // 15 seconds
    maxConsecutiveFailures = 3,
    onFailure = (err) => {
      logger.error(`Liveness check failed: ${err.message}. Exiting to force restart.`);
      process.exit(1);
    },
  } = opts;

  let consecutiveFailures = 0;
  let intervalId: NodeJS.Timer | null = null;

  const checkLiveness = async () => {
    try {
      logger.debug("Running liveness check");
      
      // Try to get bot info - this verifies API connectivity
      // Use Promise.race for timeout instead of AbortController
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Liveness check timeout")), timeoutMs);
      });
      
      await Promise.race([
        bot.api.getMe(),
        timeoutPromise
      ]);
      
      // Success - reset failures
      if (consecutiveFailures > 0) {
        logger.info(`Liveness check recovered after ${consecutiveFailures} failures`);
        consecutiveFailures = 0;
      }
      
      logger.debug("Liveness check passed");
    } catch (err) {
      consecutiveFailures++;
      const error = err instanceof Error ? err : new Error(String(err));
      
      logger.error(`Liveness check failed (${consecutiveFailures}/${maxConsecutiveFailures}): ${error.message}`);
      
      if (consecutiveFailures >= maxConsecutiveFailures) {
        logger.error("Max consecutive liveness failures reached. Bot may be stuck.");
        onFailure(error);
      }
    }
  };

  // Start periodic checks
  intervalId = setInterval(checkLiveness, intervalMs);
  
  // Run first check after a delay
  setTimeout(checkLiveness, 5000);

  logger.info(`Started liveness probe (interval: ${intervalMs}ms, timeout: ${timeoutMs}ms)`);

  return {
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId as NodeJS.Timeout);
        intervalId = null;
        logger.info("Liveness probe stopped");
      }
    },
  };
}
