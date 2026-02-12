import type { OpenClawConfig } from "../config/config.js";

/**
 * Resolve whether auto-reply is enabled for a given channel and account.
 *
 * Precedence: per-account > per-channel > channels.defaults > true (hardcoded).
 *
 * When `false`, inbound messages are still delivered to the agent session
 * but replies are not sent back automatically. Explicit sends via the
 * message tool are not affected.
 */
export function resolveAutoReplyEnabled(params: {
  cfg: OpenClawConfig;
  channel: string;
  accountId?: string;
}): boolean {
  const { cfg, channel, accountId } = params;

  const channelCfg = cfg.channels?.[channel] as
    | { autoReply?: boolean; accounts?: Record<string, { autoReply?: boolean }> }
    | undefined;

  // Layer 1: Per-account override (most specific)
  const perAccount = accountId ? channelCfg?.accounts?.[accountId]?.autoReply : undefined;

  // Layer 2: Per-channel override
  const perChannel = channelCfg?.autoReply;

  // Layer 3: Global channel defaults
  const defaultVal = cfg.channels?.defaults?.autoReply;

  return perAccount ?? perChannel ?? defaultVal ?? true;
}
