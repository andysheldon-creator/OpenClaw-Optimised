import type { OpenClawConfig } from "openclaw/plugin-sdk";

export interface BlueskyAccountConfig {
  enabled?: boolean;
  name?: string;
  identifier?: string;
  appPassword?: string;
  service?: string;
  pollInterval?: number;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
}

export interface ResolvedBlueskyAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  identifier: string;
  service: string;
  appPassword: string;
  pollInterval: number;
  config: BlueskyAccountConfig;
}

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_SERVICE = "https://bsky.social";
const DEFAULT_POLL_INTERVAL = 5000;

/**
 * List all configured Bluesky account IDs
 */
export function listBlueskyAccountIds(cfg: OpenClawConfig): string[] {
  const bskyCfg = (cfg.channels as Record<string, unknown> | undefined)?.bluesky as
    | BlueskyAccountConfig
    | undefined;

  if (bskyCfg?.identifier && bskyCfg?.appPassword) {
    return [DEFAULT_ACCOUNT_ID];
  }

  return [];
}

/**
 * Get the default account ID
 */
export function resolveDefaultBlueskyAccountId(cfg: OpenClawConfig): string {
  const ids = listBlueskyAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a Bluesky account from config
 */
export function resolveBlueskyAccount(opts: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedBlueskyAccount {
  const accountId = opts.accountId ?? DEFAULT_ACCOUNT_ID;
  const bskyCfg = (opts.cfg.channels as Record<string, unknown> | undefined)?.bluesky as
    | BlueskyAccountConfig
    | undefined;

  const baseEnabled = bskyCfg?.enabled !== false;
  const identifier = bskyCfg?.identifier ?? "";
  const appPassword = bskyCfg?.appPassword ?? "";
  const configured = Boolean(identifier.trim() && appPassword.trim());

  return {
    accountId,
    name: bskyCfg?.name?.trim() || undefined,
    enabled: baseEnabled,
    configured,
    identifier,
    service: bskyCfg?.service ?? DEFAULT_SERVICE,
    appPassword,
    pollInterval: bskyCfg?.pollInterval ?? DEFAULT_POLL_INTERVAL,
    config: {
      enabled: bskyCfg?.enabled,
      name: bskyCfg?.name,
      identifier: bskyCfg?.identifier,
      appPassword: bskyCfg?.appPassword,
      service: bskyCfg?.service,
      pollInterval: bskyCfg?.pollInterval,
      dmPolicy: bskyCfg?.dmPolicy,
      allowFrom: bskyCfg?.allowFrom,
    },
  };
}
