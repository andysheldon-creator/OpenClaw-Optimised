import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";

import { UniversalImConfigSchema } from "./config-schema.js";
import {
  formatAllowEntry,
  looksLikeUniversalImTargetId,
  normalizeAllowEntry,
  normalizeUniversalImMessagingTarget,
} from "./normalize.js";
import {
  listUniversalImAccountIds,
  resolveDefaultUniversalImAccountId,
  resolveUniversalImAccount,
  isUniversalImAccountConfigured,
  type ResolvedUniversalImAccount,
} from "./accounts.js";
import { monitorUniversalImProvider } from "./monitor.js";
import { sendMessageUniversalIm } from "./send.js";
import { getUniversalImRuntime } from "./runtime.js";

const meta = {
  id: "universal-im",
  label: "Universal IM",
  selectionLabel: "Universal IM (plugin)",
  detailLabel: "Universal IM",
  docsPath: "/channels/universal-im",
  docsLabel: "universal-im",
  blurb: "unified IM integration via webhooks and custom providers; install the plugin to enable.",
  systemImage: "bubble.left.and.bubble.right",
  order: 70,
  quickstartAllowFrom: true,
} as const;

export const universalImPlugin: ChannelPlugin<ResolvedUniversalImAccount> = {
  id: "universal-im",
  meta: {
    ...meta,
  },
  pairing: {
    idLabel: "userId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[universal-im] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel", "group", "thread"],
    threads: true,
    media: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.universal-im"] },
  configSchema: buildChannelConfigSchema(UniversalImConfigSchema),
  config: {
    listAccountIds: (cfg) => listUniversalImAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveUniversalImAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultUniversalImAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "universal-im",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "universal-im",
        accountId,
        clearBaseFields: ["provider", "transport", "webhook", "websocket", "polling", "outbound", "name"],
      }),
    isConfigured: (account) => isUniversalImAccountConfigured(account),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: isUniversalImAccountConfigured(account),
      mode: `${account.provider}/${account.transport}`,
      webhookPath: account.webhookPath,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveUniversalImAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => formatAllowEntry(String(entry))).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.["universal-im"]?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.universal-im.accounts.${resolvedAccountId}.`
        : "channels.universal-im.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("universal-im"),
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Universal IM: groupPolicy="open" allows any member to trigger. Set channels.universal-im.groupPolicy="allowlist" + channels.universal-im.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  messaging: {
    normalizeTarget: normalizeUniversalImMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeUniversalImTargetId,
      hint: "<userId|user:ID|channel:ID|group:ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getUniversalImRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error(
            "Delivering to Universal IM requires --to <userId|user:ID|channel:ID|group:ID>",
          ),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text, accountId, replyToId }) => {
      const result = await sendMessageUniversalIm(to, text, {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "universal-im", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) => {
      const result = await sendMessageUniversalIm(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "universal-im", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      mode: snapshot.mode ?? "custom/webhook",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      webhookPath: snapshot.webhookPath ?? null,
    }),
    probeAccount: async ({ account }) => {
      // Universal IM doesn't have a standard probe endpoint
      // Just check if configured
      return {
        ok: isUniversalImAccountConfigured(account),
        provider: account.provider,
        transport: account.transport,
      };
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: isUniversalImAccountConfigured(account),
      mode: `${account.provider}/${account.transport}`,
      webhookPath: account.webhookPath,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "universal-im",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      // Validate transport type if provided
      const transport = input.transport;
      if (transport && !["webhook", "websocket", "polling"].includes(transport)) {
        return `Invalid transport "${transport}". Must be one of: webhook, websocket, polling.`;
      }
      // Validate dmPolicy if provided
      const dmPolicy = input.dmPolicy;
      if (dmPolicy && !["pairing", "allowlist", "open", "disabled"].includes(dmPolicy)) {
        return `Invalid dmPolicy "${dmPolicy}". Must be one of: pairing, allowlist, open, disabled.`;
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "universal-im",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "universal-im",
            })
          : namedConfig;

      // Support both --webhook-url and --outbound-url for outbound URL
      const outboundUrl = (input.outboundUrl ?? input.webhookUrl)?.trim();
      const webhookPath = input.webhookPath?.trim();
      const provider = input.provider?.trim();
      const transport = input.transport?.trim() as "webhook" | "websocket" | "polling" | undefined;
      const dmPolicy = input.dmPolicy?.trim() as "pairing" | "allowlist" | "open" | "disabled" | undefined;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            "universal-im": {
              ...next.channels?.["universal-im"],
              enabled: true,
              ...(provider ? { provider } : {}),
              ...(transport ? { transport } : {}),
              ...(dmPolicy ? { dmPolicy } : {}),
              ...(dmPolicy === "open" ? { allowFrom: ["*"] } : {}),
              ...(webhookPath
                ? { webhook: { ...next.channels?.["universal-im"]?.webhook, path: webhookPath } }
                : {}),
              ...(outboundUrl
                ? { outbound: { ...next.channels?.["universal-im"]?.outbound, url: outboundUrl } }
                : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          "universal-im": {
            ...next.channels?.["universal-im"],
            enabled: true,
            accounts: {
              ...next.channels?.["universal-im"]?.accounts,
              [accountId]: {
                ...next.channels?.["universal-im"]?.accounts?.[accountId],
                enabled: true,
                ...(provider ? { provider } : {}),
                ...(transport ? { transport } : {}),
                ...(dmPolicy ? { dmPolicy } : {}),
                ...(dmPolicy === "open" ? { allowFrom: ["*"] } : {}),
                ...(webhookPath
                  ? {
                      webhook: {
                        ...next.channels?.["universal-im"]?.accounts?.[accountId]?.webhook,
                        path: webhookPath,
                      },
                    }
                  : {}),
                ...(outboundUrl
                  ? {
                      outbound: {
                        ...next.channels?.["universal-im"]?.accounts?.[accountId]?.outbound,
                        url: outboundUrl,
                      },
                    }
                  : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        mode: `${account.provider}/${account.transport}`,
        webhookPath: account.webhookPath,
      });
      ctx.log?.info(`[${account.accountId}] starting channel`);
      return monitorUniversalImProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
