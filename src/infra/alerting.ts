/**
 * Crash and restart alerting service.
 *
 * Sends notifications to configured channels when the bot crashes or
 * restarts. Uses the same multi-channel send infrastructure as heartbeat
 * and progress reporting.
 */

import type { ClawdisConfig } from "../config/config.js";
import { sendMessageDiscord } from "../discord/send.js";
import { createSubsystemLogger } from "../logging.js";
import { sendMessageSignal } from "../signal/send.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { resolveTelegramToken } from "../telegram/token.js";
import { sendMessageWhatsApp } from "../web/outbound.js";

const log = createSubsystemLogger("alerting");

// ─── Alert Delivery ──────────────────────────────────────────────────────────

async function sendAlert(cfg: ClawdisConfig, message: string): Promise<void> {
  const alertCfg = cfg.alerting;
  if (!alertCfg?.enabled || !alertCfg.channels?.length) return;

  const { token: telegramToken } = resolveTelegramToken(cfg);

  for (const channel of alertCfg.channels) {
    try {
      switch (channel.type) {
        case "webhook": {
          if (!channel.url) break;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          await fetch(channel.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: message,
              timestamp: new Date().toISOString(),
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          break;
        }
        case "telegram":
          if (channel.to) {
            await sendMessageTelegram(channel.to, message, {
              verbose: false,
              token: telegramToken || undefined,
            });
          }
          break;
        case "whatsapp":
          if (channel.to) {
            await sendMessageWhatsApp(channel.to, message, { verbose: false });
          }
          break;
        case "discord":
          if (channel.to) {
            await sendMessageDiscord(channel.to, message, { verbose: false });
          }
          break;
        case "signal":
          if (channel.to) {
            await sendMessageSignal(channel.to, message);
          }
          break;
      }
    } catch (err) {
      // Best-effort: log but don't throw during crash handling
      log.error(`Alert delivery to ${channel.type} failed: ${String(err)}`);
    }
  }
}

// ─── Crash Handler ───────────────────────────────────────────────────────────

let crashHandlerInstalled = false;

/**
 * Register process-level crash handlers that send an alert before exiting.
 * Safe to call multiple times — only installs handlers once.
 */
export function setupCrashAlertHandler(cfg: ClawdisConfig): void {
  const alertCfg = cfg.alerting;
  if (!alertCfg?.enabled || crashHandlerInstalled) return;
  crashHandlerInstalled = true;

  const onCrash = alertCfg.onCrash !== false; // default: true

  if (onCrash) {
    process.on("uncaughtException", (err) => {
      const message = `🚨 Bot crashed (uncaughtException): ${err.message}\n${err.stack?.slice(0, 500) ?? ""}`;
      log.error(message);
      // Best-effort async alert — process is dying so we don't await
      void sendAlert(cfg, message).finally(() => {
        process.exit(1);
      });
    });

    process.on("unhandledRejection", (reason) => {
      const reasonStr =
        reason instanceof Error
          ? `${reason.message}\n${reason.stack?.slice(0, 500) ?? ""}`
          : String(reason);
      const message = `🚨 Bot crashed (unhandledRejection): ${reasonStr}`;
      log.error(message);
      void sendAlert(cfg, message).finally(() => {
        process.exit(1);
      });
    });
  }

  log.info("Crash alert handlers installed");
}

/**
 * Send a "bot restarted" notification.
 */
export async function sendRestartAlert(cfg: ClawdisConfig): Promise<void> {
  const alertCfg = cfg.alerting;
  if (!alertCfg?.enabled) return;
  if (alertCfg.onRestart === false) return; // default: true

  const message = `✅ Bot restarted at ${new Date().toISOString()}`;
  await sendAlert(cfg, message);
  log.info("Restart alert sent");
}
