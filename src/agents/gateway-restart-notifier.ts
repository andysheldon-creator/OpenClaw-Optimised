/**
 * Gateway Restart Notifier
 *
 * Sends a notification to the main session when gateway restarts,
 * informing DyDo what was happening before the restart.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { loadBubbleRegistry, type BubbleRegistryEntry } from "./claude-code/bubble-service.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const log = createSubsystemLogger("gateway/restart-notifier");

const RESTART_MARKER_PATH = path.join(os.homedir(), ".clawdbot", "last-restart.json");

interface RestartMarker {
  timestamp: number;
  pid: number;
  activeSessions: Array<{
    sessionId: string;
    projectName: string;
    resumeToken: string;
  }>;
}

/**
 * Write restart marker before gateway stops.
 */
export function writeRestartMarker(): void {
  try {
    const registry = loadBubbleRegistry();
    const marker: RestartMarker = {
      timestamp: Date.now(),
      pid: process.pid,
      activeSessions: registry.map((entry: BubbleRegistryEntry) => ({
        sessionId: entry.sessionId,
        projectName: entry.projectName,
        resumeToken: entry.resumeToken,
      })),
    };

    fs.writeFileSync(RESTART_MARKER_PATH, JSON.stringify(marker, null, 2), "utf-8");
    log.info(`Wrote restart marker with ${marker.activeSessions.length} active sessions`);
  } catch (err) {
    log.error(`Failed to write restart marker: ${err}`);
  }
}

/**
 * Notify main session about gateway restart.
 * Called after bubble recovery on startup.
 */
export async function notifyGatewayRestart(): Promise<void> {
  // Check if restart marker exists
  if (!fs.existsSync(RESTART_MARKER_PATH)) {
    log.info("No restart marker found - clean startup");
    return;
  }

  try {
    const markerData = fs.readFileSync(RESTART_MARKER_PATH, "utf-8");
    const marker: RestartMarker = JSON.parse(markerData);

    // Check if marker is recent (within last 5 minutes)
    const age = Date.now() - marker.timestamp;
    if (age > 5 * 60 * 1000) {
      log.info(`Restart marker too old (${Math.floor(age / 1000)}s) - ignoring`);
      fs.unlinkSync(RESTART_MARKER_PATH);
      return;
    }

    // Build notification message
    const activeSessions = marker.activeSessions.length;
    let message = `✅ **Gateway 已重啟完成**\n\n`;
    message += `**PID:** ${process.pid}\n`;
    message += `**重啟時間:** ${new Date(marker.timestamp).toLocaleTimeString("zh-TW")}\n\n`;

    if (activeSessions > 0) {
      message += `**恢復了 ${activeSessions} 個 session：**\n`;
      for (const session of marker.activeSessions.slice(0, 3)) {
        message += `• ${session.projectName}\n`;
      }
      if (activeSessions > 3) {
        message += `_(+${activeSessions - 3} more)_\n`;
      }
    } else {
      message += `無進行中的 session\n`;
    }

    // Send to main session via Telegram
    // Hardcoded for now - send to Hsc's user ID
    const { sendMessageTelegram } = await import("../telegram/send.js");
    const targetChatId = "1359438700"; // Hsc's Telegram user ID

    await sendMessageTelegram(targetChatId, message, {
      disableLinkPreview: true,
    });

    log.info(`Sent restart notification to ${targetChatId}`);

    // Clean up marker
    fs.unlinkSync(RESTART_MARKER_PATH);
  } catch (err) {
    log.error(`Failed to notify restart: ${err}`);
    // Try to clean up marker even on error
    try {
      fs.unlinkSync(RESTART_MARKER_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }
}
