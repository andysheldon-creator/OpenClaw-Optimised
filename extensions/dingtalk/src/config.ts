/**
 * DingTalk configuration schema and account resolution
 */

import type { DingTalkConfig } from "./types.js";

export const DINGTALK_CHANNEL_ID = "dingtalk";
export const DEFAULT_ACCOUNT_ID = "default";

/**
 * Resolve DingTalk account configuration
 */
export function resolveDingTalkAccount(
  config: Record<string, unknown>,
  accountId: string,
): DingTalkConfig | null {
  const channelConfig = config.channels as Record<string, unknown> | undefined;
  if (!channelConfig) {
    return null;
  }

  const dingtalkConfig = channelConfig[DINGTALK_CHANNEL_ID] as DingTalkConfig | undefined;
  if (!dingtalkConfig) {
    return null;
  }

  // Only support default account for now (single webhook)
  if (accountId !== DEFAULT_ACCOUNT_ID) {
    return null;
  }

  // Validate required fields
  if (!dingtalkConfig.webhookUrl || !dingtalkConfig.secret) {
    return null;
  }

  return dingtalkConfig;
}

/**
 * Check if DingTalk is configured
 */
export function isDingTalkConfigured(config: Record<string, unknown>): boolean {
  return resolveDingTalkAccount(config, DEFAULT_ACCOUNT_ID) !== null;
}

/**
 * Get list of configured account IDs
 */
export function listDingTalkAccounts(config: Record<string, unknown>): string[] {
  return isDingTalkConfigured(config) ? [DEFAULT_ACCOUNT_ID] : [];
}
