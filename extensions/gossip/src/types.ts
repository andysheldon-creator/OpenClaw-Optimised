import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { decodeFromBase64, encodeUserId, isValidUserId } from "@massalabs/gossip-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { DEFAULT_PROTOCOL_URL, DEFAULT_USERNAME } from "./onboarding.js";

export interface GossipAccountConfig {
  enabled?: boolean;
  name?: string;
  mnemonic?: string;
  username?: string;
  protocolUrl?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: Array<string | number>;
}

export interface ResolvedGossipAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  mnemonic: string;
  username: string;
  protocolUrl: string;
  userId?: string; // Set after session is opened
  config: GossipAccountConfig;
}
/**
 * List all configured Gossip account IDs
 */
export function listGossipAccountIds(cfg: OpenClawConfig): string[] {
  const gossipCfg = (cfg.channels as Record<string, unknown> | undefined)?.gossip as
    | GossipAccountConfig
    | undefined;

  // If mnemonic is configured at top level, we have a default account
  // Also consider configured if no mnemonic (will auto-generate)
  if (gossipCfg?.enabled !== false) {
    return [DEFAULT_ACCOUNT_ID];
  }

  return [];
}

/**
 * Get the default account ID
 */
export function resolveDefaultGossipAccountId(cfg: OpenClawConfig): string {
  const ids = listGossipAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a Gossip account from config
 */
export function resolveGossipAccount(opts: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedGossipAccount {
  const accountId = opts.accountId ?? DEFAULT_ACCOUNT_ID;
  const gossipCfg = (opts.cfg.channels as Record<string, unknown> | undefined)?.gossip as
    | GossipAccountConfig
    | undefined;

  const baseEnabled = gossipCfg?.enabled !== false;
  const mnemonic = gossipCfg?.mnemonic ?? "";
  const username = gossipCfg?.username ?? DEFAULT_USERNAME;
  const protocolUrl = gossipCfg?.protocolUrl ?? DEFAULT_PROTOCOL_URL;

  // Account is considered "configured" if enabled.
  // Mnemonic can be auto-generated if not provided.
  const configured = baseEnabled;

  return {
    accountId,
    name: gossipCfg?.name?.trim() || undefined,
    enabled: baseEnabled,
    configured,
    mnemonic,
    username,
    protocolUrl,
    userId: undefined, // Set when session is opened
    config: {
      enabled: gossipCfg?.enabled,
      name: gossipCfg?.name,
      mnemonic: gossipCfg?.mnemonic,
      username: gossipCfg?.username,
      protocolUrl: gossipCfg?.protocolUrl,
      dmPolicy: gossipCfg?.dmPolicy,
      allowFrom: gossipCfg?.allowFrom,
    },
  };
}

/**
 * Normalize a Gossip user ID for comparison.
 * Gossip user IDs are base64-encoded 32-byte values.
 */
export function normalizeGossipUserId(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed) {
    return "";
  }
  // If already a valid bech32 Gossip user ID, use as-is.
  if (isValidUserId(trimmed)) {
    return trimmed;
  }
  // If base64-encoded 32-byte ID, convert to bech32 gossip1… format for consistency.
  try {
    const decoded = decodeFromBase64(trimmed);
    if (decoded.length === 32) {
      return encodeUserId(decoded);
    }
  } catch {
    // ignore and fall back
  }
  return trimmed;
}
