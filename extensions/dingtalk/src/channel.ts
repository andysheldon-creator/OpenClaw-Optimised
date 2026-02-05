/**
 * DingTalk channel plugin
 */

import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
} from "openclaw/plugin-sdk";
import { z } from "zod";
import type { DingTalkConfig } from "./types.js";
import {
  DINGTALK_CHANNEL_ID,
  resolveDingTalkAccount,
  listDingTalkAccounts,
  isDingTalkConfigured,
} from "./config.js";
import { dingtalkOnboardingAdapter } from "./onboarding.js";
import { sendTextMessage, chunkMessage } from "./outbound.js";
import { probeDingTalk } from "./probe.js";

type ResolvedDingTalkAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
};

const meta = {
  id: DINGTALK_CHANNEL_ID,
  label: "DingTalk",
  selectionLabel: "DingTalk (钉钉)",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb: "DingTalk custom robot integration for group messaging.",
  aliases: ["钉钉"] as string[],
  order: 65,
} as const;

// Local config schema for the extension
const DingTalkConfigSchemaLocal = z
  .object({
    enabled: z.boolean().optional(),
    webhookUrl: z.string(),
    secret: z.string(),
    dmPolicy: z.enum(["open", "allowlist", "pairing", "disabled"]).optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),
  })
  .strict();

export const dingtalkPlugin: ChannelPlugin<ResolvedDingTalkAccount> = {
  id: DINGTALK_CHANNEL_ID,
  meta: {
    ...meta,
  },
  onboarding: dingtalkOnboardingAdapter,
  pairing: {
    idLabel: "dingtalkUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(dingtalk|user):/i, ""),
    notifyApproval: async ({ cfg }) => {
      const config = resolveDingTalkAccount(cfg, DEFAULT_ACCOUNT_ID);
      if (!config) {
        return;
      }
      await sendTextMessage(config, PAIRING_APPROVED_MESSAGE);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    media: false,
    polls: false,
    threads: false,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- DingTalk supports text and markdown messages.",
      "- Use @mentions with phone numbers or user IDs.",
      "- Messages are sent to the configured group webhook.",
    ],
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: buildChannelConfigSchema(DingTalkConfigSchemaLocal),
  config: {
    listAccountIds: (cfg) => listDingTalkAccounts(cfg),
    resolveAccount: (cfg) => ({
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: (cfg.channels?.dingtalk as DingTalkConfig | undefined)?.enabled !== false,
      configured: isDingTalkConfigured(cfg),
    }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => {
      const dingtalkConfig = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          dingtalk: {
            ...dingtalkConfig,
            enabled,
          },
        },
      };
    },
    deleteAccount: ({ cfg }) => {
      const next = { ...cfg } as OpenClawConfig;
      const nextChannels = { ...cfg.channels };
      delete nextChannels.dingtalk;
      if (Object.keys(nextChannels).length > 0) {
        next.channels = nextChannels;
      } else {
        delete next.channels;
      }
      return next;
    },
    isConfigured: (_account, cfg) => isDingTalkConfigured(cfg),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg }) =>
      (cfg.channels?.dingtalk as DingTalkConfig | undefined)?.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => {
      const dingtalkConfig = cfg.channels?.dingtalk as DingTalkConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          dingtalk: {
            ...dingtalkConfig,
            enabled: true,
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ cfg, text }) => {
      const config = resolveDingTalkAccount(cfg, DEFAULT_ACCOUNT_ID);
      if (!config) {
        throw new Error("DingTalk not configured");
      }

      if (!text) {
        throw new Error("Message text is required");
      }

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        const result = await sendTextMessage(config, chunk);
        if (!result.success) {
          throw new Error(result.error || "Failed to send message");
        }
      }

      return {
        ok: true,
        channel: DINGTALK_CHANNEL_ID,
        messageId: Date.now().toString(),
      };
    },
  },
  status: {
    probeAccount: async ({ account, cfg }) => {
      const config = resolveDingTalkAccount(cfg, account.accountId);
      if (!config) {
        return {
          ok: false,
          error: "Not configured",
        };
      }

      const result = await probeDingTalk(config, false);
      return {
        ok: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      };
    },
    buildAccountSnapshot: async ({ account, cfg }) => {
      const config = resolveDingTalkAccount(cfg, account.accountId);

      return {
        accountId: account.accountId,
        configured: account.configured,
        enabled: account.enabled,
        webhookUrl: config?.webhookUrl,
        dmPolicy: config?.dmPolicy || "pairing",
      };
    },
  },
};
