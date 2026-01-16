import type { ClawdbotConfig } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.js";
import { normalizeChatChannelId } from "../channels/registry.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import { resolveTelegramToken } from "./token.js";

const debugAccounts = (...args: unknown[]) => {
  if (process.env.CLAWDBOT_DEBUG_TELEGRAM_ACCOUNTS === "1") {
    console.warn("[telegram:accounts]", ...args);
  }
};

export type ResolvedTelegramAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  token: string;
  tokenSource: "env" | "tokenFile" | "config" | "none";
  config: TelegramAccountConfig;
};

function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = cfg.channels?.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (!key) continue;
    ids.add(normalizeAccountId(key));
  }
  return [...ids];
}

function listBindingAccountIds(cfg: ClawdbotConfig): string[] {
  const legacyBindings = (cfg as { routing?: { bindings?: unknown } }).routing?.bindings;
  const bindings = [
    ...(Array.isArray(cfg.bindings) ? cfg.bindings : []),
    ...(Array.isArray(legacyBindings) ? legacyBindings : []),
  ];
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const match =
      binding.match && typeof binding.match === "object"
        ? (binding.match as { channel?: unknown; accountId?: unknown; accountID?: unknown })
        : undefined;
    const channelRaw = typeof match?.channel === "string" ? match.channel : undefined;
    if (normalizeChatChannelId(channelRaw) !== "telegram") continue;
    const accountIdRaw =
      typeof match?.accountId === "string"
        ? match.accountId
        : typeof match?.accountID === "string"
          ? match.accountID
          : undefined;
    if (!accountIdRaw) continue;
    ids.add(normalizeAccountId(accountIdRaw));
  }
  return [...ids];
}

function resolveDefaultTelegramAccountIdFromBindings(cfg: ClawdbotConfig): string | null {
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const legacyBindings = (cfg as { routing?: { bindings?: unknown } }).routing?.bindings;
  const bindings = [
    ...(Array.isArray(cfg.bindings) ? cfg.bindings : []),
    ...(Array.isArray(legacyBindings) ? legacyBindings : []),
  ];
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    if (binding.agentId !== defaultAgentId) continue;
    const match =
      binding.match && typeof binding.match === "object"
        ? (binding.match as { channel?: unknown; accountId?: unknown; accountID?: unknown })
        : undefined;
    const channelRaw = typeof match?.channel === "string" ? match.channel : undefined;
    if (normalizeChatChannelId(channelRaw) !== "telegram") continue;
    const accountIdRaw =
      typeof match?.accountId === "string"
        ? match.accountId
        : typeof match?.accountID === "string"
          ? match.accountID
          : undefined;
    if (!accountIdRaw) continue;
    return normalizeAccountId(accountIdRaw);
  }
  return null;
}

export function listTelegramAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = Array.from(
    new Set([...listConfiguredAccountIds(cfg), ...listBindingAccountIds(cfg)]),
  );
  debugAccounts("listTelegramAccountIds", ids);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultTelegramAccountId(cfg: ClawdbotConfig): string {
  const boundDefault = resolveDefaultTelegramAccountIdFromBindings(cfg);
  if (boundDefault) return boundDefault;
  const ids = listTelegramAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: ClawdbotConfig,
  accountId: string,
): TelegramAccountConfig | undefined {
  const accounts = cfg.channels?.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  const direct = accounts[accountId] as TelegramAccountConfig | undefined;
  if (direct) return direct;
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find(
    (key) => normalizeAccountId(key) === normalized,
  );
  return matchKey ? (accounts[matchKey] as TelegramAccountConfig | undefined) : undefined;
}

function mergeTelegramAccountConfig(cfg: ClawdbotConfig, accountId: string): TelegramAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.telegram ??
    {}) as TelegramAccountConfig & { accounts?: unknown };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveTelegramAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedTelegramAccount {
  const hasExplicitAccountId = Boolean(params.accountId?.trim());
  const baseEnabled = params.cfg.channels?.telegram?.enabled !== false;

  const resolve = (accountId: string) => {
    const merged = mergeTelegramAccountConfig(params.cfg, accountId);
    const accountEnabled = merged.enabled !== false;
    const enabled = baseEnabled && accountEnabled;
    const tokenResolution = resolveTelegramToken(params.cfg, { accountId });
    debugAccounts("resolve", {
      accountId,
      enabled,
      tokenSource: tokenResolution.source,
    });
    return {
      accountId,
      enabled,
      name: merged.name?.trim() || undefined,
      token: tokenResolution.token,
      tokenSource: tokenResolution.source,
      config: merged,
    } satisfies ResolvedTelegramAccount;
  };

  const normalized = normalizeAccountId(params.accountId);
  const primary = resolve(normalized);
  if (hasExplicitAccountId) return primary;
  if (primary.tokenSource !== "none") return primary;

  // If accountId is omitted, prefer a configured account token over failing on
  // the implicit "default" account. This keeps env-based setups working (env
  // still wins) while making config-only tokens work for things like heartbeats.
  const fallbackId = resolveDefaultTelegramAccountId(params.cfg);
  if (fallbackId === primary.accountId) return primary;
  const fallback = resolve(fallbackId);
  if (fallback.tokenSource === "none") return primary;
  return fallback;
}

export function listEnabledTelegramAccounts(cfg: ClawdbotConfig): ResolvedTelegramAccount[] {
  return listTelegramAccountIds(cfg)
    .map((accountId) => resolveTelegramAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
