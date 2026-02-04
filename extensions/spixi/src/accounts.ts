import { type OpenClawConfig, DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import { type ResolvedSpixiAccount, type SpixiAccountConfig } from "./types.js";

export function listSpixiAccountIds(cfg: any): string[] {
  const accounts = cfg.channels?.spixi?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [DEFAULT_ACCOUNT_ID];
  }
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (!key) continue;
    ids.add(normalizeAccountId(key));
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}

export function resolveSpixiAccount(params: {
  cfg: any;
  accountId?: string | null;
}): ResolvedSpixiAccount {
  const accountId = normalizeAccountId(params.accountId);
  const accounts = params.cfg.channels?.spixi?.accounts || {};
  const accountConfig = (accounts[accountId] || {}) as SpixiAccountConfig;

  const baseConfig = (params.cfg.channels?.spixi || {}) as SpixiAccountConfig;
  const merged = { ...baseConfig, ...accountConfig };

  // Check if configured (has any meaningful config set)
  const configured = Boolean(
    merged.mqttHost?.trim() ||
    merged.quixiApiUrl?.trim() ||
    merged.myWalletAddress?.trim() ||
    typeof merged.mqttPort === "number"
  );

  return {
    accountId,
    enabled: merged.enabled !== false,
    configured,
    name: merged.name,
    config: merged,
  };
}
