import type { ChannelId } from "../channels/plugins/types.js";
import type { OpenClawConfig } from "./config.js";
import type { GroupToolPolicyBySenderConfig, GroupToolPolicyConfig } from "./types.tools.js";
import { normalizeAccountId } from "../routing/session-key.js";

export type GroupPolicyChannel = ChannelId;

export type ChannelGroupConfig = {
  requireMention?: boolean;
  tools?: GroupToolPolicyConfig;
  toolsBySender?: GroupToolPolicyBySenderConfig;
};

export type ChannelDmConfig = {
  verified?: boolean;
  toolsBySender?: GroupToolPolicyBySenderConfig;
};

export type ChannelGroupPolicy = {
  allowlistEnabled: boolean;
  allowed: boolean;
  groupConfig?: ChannelGroupConfig;
  defaultConfig?: ChannelGroupConfig;
};

type ChannelGroups = Record<string, ChannelGroupConfig>;

const CHANNEL_VERIFIED_DEFAULTS: Record<string, boolean> = {
  whatsapp: true,
  imessage: true,
  signal: true,
  sms: false,
};

function resolveChannelGroupConfig(
  groups: ChannelGroups | undefined,
  groupId: string,
  caseInsensitive = false,
): ChannelGroupConfig | undefined {
  if (!groups) {
    return undefined;
  }
  const direct = groups[groupId];
  if (direct) {
    return direct;
  }
  if (!caseInsensitive) {
    return undefined;
  }
  const target = groupId.toLowerCase();
  const matchedKey = Object.keys(groups).find((key) => key !== "*" && key.toLowerCase() === target);
  if (!matchedKey) {
    return undefined;
  }
  return groups[matchedKey];
}

export type GroupToolPolicySender = {
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
};

function normalizeSenderKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return withoutAt.toLowerCase();
}

export function resolveToolsBySender(
  params: {
    toolsBySender?: GroupToolPolicyBySenderConfig;
  } & GroupToolPolicySender,
): GroupToolPolicyConfig | undefined {
  const toolsBySender = params.toolsBySender;
  if (!toolsBySender) {
    return undefined;
  }
  const entries = Object.entries(toolsBySender);
  if (entries.length === 0) {
    return undefined;
  }

  const normalized = new Map<string, GroupToolPolicyConfig>();
  let wildcard: GroupToolPolicyConfig | undefined;
  for (const [rawKey, policy] of entries) {
    if (!policy) {
      continue;
    }
    const key = normalizeSenderKey(rawKey);
    if (!key) {
      continue;
    }
    if (key === "*") {
      wildcard = policy;
      continue;
    }
    if (!normalized.has(key)) {
      normalized.set(key, policy);
    }
  }

  const candidates: string[] = [];
  const pushCandidate = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    candidates.push(trimmed);
  };
  pushCandidate(params.senderId);
  pushCandidate(params.senderE164);
  pushCandidate(params.senderUsername);
  pushCandidate(params.senderName);

  for (const candidate of candidates) {
    const key = normalizeSenderKey(candidate);
    if (!key) {
      continue;
    }
    const match = normalized.get(key);
    if (match) {
      return match;
    }
  }
  return wildcard;
}

function resolveChannelGroups(
  cfg: OpenClawConfig,
  channel: GroupPolicyChannel,
  accountId?: string | null,
): ChannelGroups | undefined {
  const normalizedAccountId = normalizeAccountId(accountId);
  const channelConfig = cfg.channels?.[channel] as
    | {
        accounts?: Record<string, { groups?: ChannelGroups }>;
        groups?: ChannelGroups;
      }
    | undefined;
  if (!channelConfig) {
    return undefined;
  }
  const accountGroups = resolveAccountConfig(channelConfig.accounts, normalizedAccountId)?.groups;
  return accountGroups ?? channelConfig.groups;
}

function resolveAccountConfig<T>(
  accounts: Record<string, T> | undefined,
  normalizedAccountId: string,
): T | undefined {
  if (!accounts) {
    return undefined;
  }
  return (
    accounts[normalizedAccountId] ??
    accounts[
      Object.keys(accounts).find(
        (key) => key.toLowerCase() === normalizedAccountId.toLowerCase(),
      ) ?? ""
    ]
  );
}

function resolveChannelDmConfigs(
  cfg: OpenClawConfig,
  channel: GroupPolicyChannel,
  accountId?: string | null,
): { account?: ChannelDmConfig; channel?: ChannelDmConfig } {
  const normalizedAccountId = normalizeAccountId(accountId);
  const channelConfig = cfg.channels?.[channel] as
    | (ChannelDmConfig & {
        accounts?: Record<string, ChannelDmConfig>;
      })
    | undefined;
  if (!channelConfig) {
    return {};
  }
  return {
    account: resolveAccountConfig(channelConfig.accounts, normalizedAccountId),
    channel: channelConfig,
  };
}

function resolveChannelVerifiedFlag(
  cfg: OpenClawConfig,
  channel: GroupPolicyChannel,
  accountId?: string | null,
): boolean {
  const { account, channel: channelConfig } = resolveChannelDmConfigs(cfg, channel, accountId);
  if (typeof account?.verified === "boolean") {
    return account.verified;
  }
  if (typeof channelConfig?.verified === "boolean") {
    return channelConfig.verified;
  }
  return CHANNEL_VERIFIED_DEFAULTS[channel.trim().toLowerCase()] ?? false;
}

export function resolveChannelGroupPolicy(params: {
  cfg: OpenClawConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
  groupIdCaseInsensitive?: boolean;
}): ChannelGroupPolicy {
  const { cfg, channel } = params;
  const groups = resolveChannelGroups(cfg, channel, params.accountId);
  const allowlistEnabled = Boolean(groups && Object.keys(groups).length > 0);
  const normalizedId = params.groupId?.trim();
  const groupConfig = normalizedId
    ? resolveChannelGroupConfig(groups, normalizedId, params.groupIdCaseInsensitive)
    : undefined;
  const defaultConfig = groups?.["*"];
  const allowAll = allowlistEnabled && Boolean(groups && Object.hasOwn(groups, "*"));
  const allowed = !allowlistEnabled || allowAll || Boolean(groupConfig);
  return {
    allowlistEnabled,
    allowed,
    groupConfig,
    defaultConfig,
  };
}

export function resolveChannelGroupRequireMention(params: {
  cfg: OpenClawConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
  groupIdCaseInsensitive?: boolean;
  requireMentionOverride?: boolean;
  overrideOrder?: "before-config" | "after-config";
}): boolean {
  const { requireMentionOverride, overrideOrder = "after-config" } = params;
  const { groupConfig, defaultConfig } = resolveChannelGroupPolicy(params);
  const configMention =
    typeof groupConfig?.requireMention === "boolean"
      ? groupConfig.requireMention
      : typeof defaultConfig?.requireMention === "boolean"
        ? defaultConfig.requireMention
        : undefined;

  if (overrideOrder === "before-config" && typeof requireMentionOverride === "boolean") {
    return requireMentionOverride;
  }
  if (typeof configMention === "boolean") {
    return configMention;
  }
  if (overrideOrder !== "before-config" && typeof requireMentionOverride === "boolean") {
    return requireMentionOverride;
  }
  return true;
}

export function resolveChannelGroupToolsPolicy(
  params: {
    cfg: OpenClawConfig;
    channel: GroupPolicyChannel;
    groupId?: string | null;
    accountId?: string | null;
    groupIdCaseInsensitive?: boolean;
  } & GroupToolPolicySender,
): GroupToolPolicyConfig | undefined {
  const { groupConfig, defaultConfig } = resolveChannelGroupPolicy(params);
  const groupSenderPolicy = resolveToolsBySender({
    toolsBySender: groupConfig?.toolsBySender,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  if (groupSenderPolicy) {
    return groupSenderPolicy;
  }
  if (groupConfig?.tools) {
    return groupConfig.tools;
  }
  const defaultSenderPolicy = resolveToolsBySender({
    toolsBySender: defaultConfig?.toolsBySender,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  if (defaultSenderPolicy) {
    return defaultSenderPolicy;
  }
  if (defaultConfig?.tools) {
    return defaultConfig.tools;
  }
  return undefined;
}

export function resolveChannelDMToolsPolicy(
  params: {
    cfg: OpenClawConfig;
    channel: GroupPolicyChannel;
    accountId?: string | null;
  } & GroupToolPolicySender,
): GroupToolPolicyConfig | undefined {
  const { cfg, channel, accountId } = params;
  const { account, channel: channelConfig } = resolveChannelDmConfigs(cfg, channel, accountId);
  const verified = resolveChannelVerifiedFlag(cfg, channel, accountId);
  const resolvePolicy = (toolsBySender?: GroupToolPolicyBySenderConfig) =>
    verified
      ? resolveToolsBySender({
          toolsBySender,
          senderId: params.senderId,
          senderName: params.senderName,
          senderUsername: params.senderUsername,
          senderE164: params.senderE164,
        })
      : resolveToolsBySender({ toolsBySender });

  return resolvePolicy(account?.toolsBySender) ?? resolvePolicy(channelConfig?.toolsBySender);
}
