/**
 * DingTalk health check and probing
 */

import type { DingTalkConfig } from "./types.js";
import { sendTextMessage } from "./outbound.js";

export interface ProbeResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Probe DingTalk webhook by sending a test message
 */
export async function probeDingTalk(
  config: DingTalkConfig,
  sendTestMessage = false,
): Promise<ProbeResult> {
  const startTime = Date.now();

  try {
    // Validate webhook URL format
    try {
      new URL(config.webhookUrl);
    } catch {
      return {
        success: false,
        error: "Invalid webhook URL format",
      };
    }

    // Validate secret exists
    if (!config.secret || config.secret.length === 0) {
      return {
        success: false,
        error: "Secret is required",
      };
    }

    // Optionally send test message
    if (sendTestMessage) {
      const result = await sendTextMessage(config, "🔍 OpenClaw health check");

      const latencyMs = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          latencyMs,
          error: result.error,
        };
      }

      return {
        success: true,
        latencyMs,
      };
    }

    // Basic validation passed
    return {
      success: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
