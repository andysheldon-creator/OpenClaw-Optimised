/**
 * Feishu channel plugin implementation
 * @module extensions/feishu/channel
 */

import {
  applyAccountNameToChannelSection,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  setAccountEnabledInConfigSection,
  type ChannelMessageActionAdapter,
  type ChannelGroupContext,
  type ChannelOutboundContext,
  type ChannelPlugin,
  type OpenClawConfig,
  type GroupToolPolicyConfig,
  type ChannelMeta,
  type ReplyPayload,
} from "../../../src/plugin-sdk/index.js";

import { getFeishuRuntime } from "./runtime.js";

const DEFAULT_ACCOUNT_ID = "default";

const meta: ChannelMeta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu (Lark)",
  docsPath: "/channels/feishu",
  blurb: "Open-source team collaboration platform (fork of Larksuite)",
  aliases: ["lark"],
  quickstartAllowFrom: true,
};

type FeishuModule = typeof import("../../../src/feishu/index.js");

let feishuModulePromise: Promise<FeishuModule> | null = null;
let feishuMonitorPromise: Promise<{ stop: () => void }> | null = null;

async function loadFeishuModule(): Promise<FeishuModule> {
  if (!feishuModulePromise) {
    // @ts-expect-error - resolved in packaged builds via openclaw exports
    feishuModulePromise = import("openclaw/feishu").catch(async () =>
      import("../../../src/feishu/index.js"),
    );
  }
  return feishuModulePromise;
}

function resolveFeishuAccount(cfg: OpenClawConfig, accountId?: string | null) {
  return getFeishuRuntime().channel.feishu.resolveFeishuAccount({ cfg, accountId });
}

async function resolveFeishuClient(cfg: OpenClawConfig, accountId?: string | null) {
  const account = resolveFeishuAccount(cfg, accountId);
  const feishu = await loadFeishuModule();
  const existingClient = feishu.getFeishuClient?.(account.accountId);
  const client =
    existingClient ?? feishu.createFeishuBotFromAccount(account, { config: cfg }).client;
  return { account, client, feishu };
}

function resolveFileType(contentType?: string):
  | "opus"
  | "mp4"
  | "pdf"
  | "doc"
  | "xls"
  | "ppt"
  | "stream" {
  if (!contentType) return "stream";
  const lower = contentType.toLowerCase();
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("word")) return "doc";
  if (lower.includes("excel") || lower.includes("spreadsheet")) return "xls";
  if (lower.includes("powerpoint") || lower.includes("presentation")) return "ppt";
  if (lower.startsWith("video/")) return "mp4";
  if (lower.startsWith("audio/")) return "opus";
  return "stream";
}

async function sendFeishuText(params: {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  accountId?: string | null;
  replyToId?: string | null;
}) {
  const { cfg, to, text, accountId, replyToId } = params;
  const { client, feishu } = await resolveFeishuClient(cfg, accountId);
  if (replyToId) {
    return await feishu.replyMessage(client, replyToId, text);
  }
  return await feishu.sendTextMessage(client, to, text, { receiveIdType: "chat_id" });
}

async function sendFeishuMedia(params: {
  cfg: OpenClawConfig;
  to: string;
  text?: string;
  mediaUrl: string;
  accountId?: string | null;
  replyToId?: string | null;
}) {
  const { cfg, to, text, mediaUrl, accountId, replyToId } = params;
  const core = getFeishuRuntime();
  const { client, feishu } = await resolveFeishuClient(cfg, accountId);
  const maxMb = resolveFeishuAccount(cfg, accountId).config.mediaMaxMb ?? 10;
  const maxBytes = Math.max(1, maxMb) * 1024 * 1024;
  const media = await core.media.loadWebMedia(mediaUrl, maxBytes);

  if (text) {
    await feishu.sendTextMessage(client, to, text, { receiveIdType: "chat_id" });
  }

  if (media.contentType?.startsWith("image/")) {
    const imageKey = await feishu.uploadImage(client, media.buffer, "message");
    return await feishu.sendImageMessage(client, to, imageKey, { receiveIdType: "chat_id" });
  }

  const fileKey = await feishu.uploadFile(
    client,
    media.buffer,
    media.fileName ?? "file",
    resolveFileType(media.contentType),
  );
  return await feishu.sendFileMessage(client, to, fileKey, { receiveIdType: "chat_id" });
}

async function processFeishuInboundMessage(params: {
  ctx: Awaited<ReturnType<FeishuModule["buildFeishuMessageContext"]>>;
  cfg: OpenClawConfig;
  runtime: { log?: (message: string) => void; error?: (message: string) => void };
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}) {
  const { ctx, cfg, runtime, statusSink } = params;
  if (!ctx) return;
  const core = getFeishuRuntime();
  const isGroup = ctx.chatType === "group";
  const rawBody = ctx.text?.trim() || (ctx.media?.length ? "<media:attachment>" : "");
  if (!rawBody) return;

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "feishu",
    accountId: ctx.account.accountId,
    peer: {
      kind: isGroup ? "group" : "dm",
      id: ctx.chatId,
    },
  });

  const fromLabel = isGroup
    ? `group:${ctx.chatId}`
    : ctx.senderName?.trim() || `user:${ctx.senderId}`;
  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Feishu",
    from: fromLabel,
    timestamp: ctx.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const groupSystemPrompt = isGroup
    ? ctx.account.config.groups?.[ctx.chatId]?.systemPrompt?.trim() || undefined
    : undefined;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `feishu:${ctx.senderId}`,
    To: `feishu:${ctx.chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: ctx.senderName || undefined,
    SenderId: ctx.senderId,
    WasMentioned: isGroup ? ctx.isMentioned : undefined,
    Provider: "feishu",
    Surface: "feishu",
    MessageSid: ctx.messageId,
    ReplyToId: ctx.parentId,
    GroupSubject: isGroup ? ctx.chatId : undefined,
    GroupSystemPrompt: groupSystemPrompt,
    OriginatingChannel: "feishu",
    OriginatingTo: `feishu:${ctx.chatId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err: unknown) => {
      runtime.error?.(`feishu: failed updating session meta: ${String(err)}`);
    });

  statusSink?.({ lastInboundAt: Date.now() });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      deliver: async (payload: ReplyPayload) => {
        await deliverFeishuReply({
          payload,
          cfg,
          to: ctx.chatId,
          accountId: ctx.account.accountId,
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err: unknown, info: { kind: string }) => {
        runtime.error?.(`[${ctx.account.accountId}] feishu ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });
}

async function deliverFeishuReply(params: {
  payload: ReplyPayload;
  cfg: OpenClawConfig;
  to: string;
  accountId: string;
}) {
  const { payload, cfg, to, accountId } = params;
  const text = payload.text ?? "";
  const replyToId = payload.replyToId ?? null;
  const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
  if (mediaUrl) {
    await sendFeishuMedia({ cfg, to, text, mediaUrl, accountId, replyToId });
    return;
  }
  if (text) {
    await sendFeishuText({ cfg, to, text, accountId, replyToId });
  }
}

const feishuMessageActions: ChannelMessageActionAdapter = {
  listActions: (ctx: any) => getFeishuRuntime().channel.feishu.messageActions.listActions(ctx),
  extractToolSend: (ctx: any) =>
    getFeishuRuntime().channel.feishu.messageActions.extractToolSend(ctx),
  handleAction: async (ctx: any) =>
    await getFeishuRuntime().channel.feishu.messageActions.handleAction(ctx),
};

/**
 * Feishu channel plugin - simplified version that delegates to core runtime
 */
export const feishuPlugin: ChannelPlugin = {
  id: "feishu",
  meta,
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: {
    schema: {},
  },
  actions: feishuMessageActions,

  config: {
    listAccountIds: (cfg: OpenClawConfig) =>
      getFeishuRuntime().channel.feishu.listFeishuAccountIds(cfg),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveFeishuAccount(cfg, accountId),
    defaultAccountId: (cfg: OpenClawConfig) =>
      getFeishuRuntime().channel.feishu.resolveDefaultFeishuAccountId(cfg) ?? DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({
      cfg,
      accountId,
      enabled,
    }: {
      cfg: OpenClawConfig;
      accountId: string;
      enabled: boolean;
    }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "feishu",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "feishu",
        accountId,
        clearBaseFields: ["appId", "appSecret", "name"],
      }),
    isConfigured: (account: ReturnType<typeof resolveFeishuAccount>) =>
      Boolean(account.appId?.trim() && account.appSecret?.trim()),
    describeAccount: (account: ReturnType<typeof resolveFeishuAccount>) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({
      cfg,
      accountId,
    }: {
      cfg: OpenClawConfig;
      accountId?: string | null;
    }) =>
      (resolveFeishuAccount(cfg, accountId).config.allowFrom ?? []).map((entry: string | number) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }: { allowFrom: Array<string | number> }) =>
      allowFrom.map((e) => String(e).trim()).filter(Boolean),
  },

  security: {
    resolveDmPolicy: ({
      cfg,
      accountId,
      account,
    }: {
      cfg: OpenClawConfig;
      accountId?: string | null;
      account: ReturnType<typeof resolveFeishuAccount>;
    }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.feishu?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.feishu.accounts.${resolvedAccountId}.`
        : "channels.feishu.";
      return {
        policy: account.config?.dmPolicy ?? "pairing",
        allowFrom: account.config?.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("feishu"),
        normalizeEntry: (raw: string) => raw.trim(),
      };
    },
    collectWarnings: () => [],
  },

  groups: {
    resolveRequireMention: ({ cfg, accountId }: ChannelGroupContext) =>
      resolveFeishuAccount(cfg, accountId).config.requireMention ?? true,
    resolveToolPolicy: (): GroupToolPolicyConfig | undefined => undefined,
  },

  messaging: {
    normalizeTarget: (target: string) => target.trim(),
    targetResolver: {
      looksLikeId: (target: string) => /^[a-zA-Z0-9._@-]+$/.test(target.trim()),
      hint: "<open_id|user_id|email|chat_id>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },

  setup: {
    resolveAccountId: ({ accountId }: { accountId?: string }) =>
      getFeishuRuntime().channel.feishu.normalizeAccountId(accountId),
    applyAccountName: ({
      cfg,
      accountId,
      name,
    }: {
      cfg: OpenClawConfig;
      accountId: string;
      name?: string;
    }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "feishu",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      const typed = input as { appId?: string; appSecret?: string };
      if (!typed.appId || !typed.appSecret) {
        return "Feishu requires appId and appSecret.";
      }
      return null;
    },
    applyAccountConfig: ({
      cfg,
      accountId,
      input,
    }: {
      cfg: OpenClawConfig;
      accountId: string;
      input: { appId?: string; appSecret?: string; name?: string };
    }) => {
      const typed = input as { appId: string; appSecret: string; name?: string };
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "feishu",
        accountId,
        name: typed.name,
      });

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            feishu: {
              ...namedConfig.channels?.feishu,
              enabled: true,
              appId: typed.appId,
              appSecret: typed.appSecret,
            },
          },
        };
      }

      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          feishu: {
            ...namedConfig.channels?.feishu,
            enabled: true,
            accounts: {
              ...namedConfig.channels?.feishu?.accounts,
              [accountId]: {
                ...namedConfig.channels?.feishu?.accounts?.[accountId],
                enabled: true,
                appId: typed.appId,
                appSecret: typed.appSecret,
              },
            },
          },
        },
      };
    },
  },

  outbound: {
    deliveryMode: "direct",
    chunker: (text: any) => {
      const limit = 4000;
      if (text.length <= limit) return [text];
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
      }
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 4000,
    sendText: async ({ cfg, to, text, accountId, replyToId }: ChannelOutboundContext) => {
      const result = await sendFeishuText({ cfg, to, text, accountId, replyToId });
      return { channel: "feishu", ...result };
    },
    sendMedia: async ({
      cfg,
      to,
      text,
      mediaUrl,
      accountId,
      replyToId,
    }: ChannelOutboundContext) => {
      if (!mediaUrl) {
        const result = await sendFeishuText({ cfg, to, text, accountId, replyToId });
        return { channel: "feishu", ...result };
      }
      const result = await sendFeishuMedia({ cfg, to, text, mediaUrl, accountId, replyToId });
      return { channel: "feishu", ...result };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: () => [],
    buildChannelSummary: ({ snapshot }: any) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    probeAccount: async ({ account }: { account: ReturnType<typeof resolveFeishuAccount> }) =>
      await getFeishuRuntime().channel.feishu.probeFeishuBot(account),
    auditAccount: async () => undefined,
    buildAccountSnapshot: ({
      account,
      runtime,
      probe,
    }: {
      account: ReturnType<typeof resolveFeishuAccount>;
      runtime?: { running?: boolean; lastStartAt?: number | null; lastStopAt?: number | null; lastError?: string | null };
      probe?: unknown;
    }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
      tokenSource: account.tokenSource,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
    }),
  },

  gateway: {
    startAccount: async (ctx: any) => {
      const account = ctx.account;
      ctx.setStatus({ accountId: account.accountId });
      ctx.log?.info?.(`[${account.accountId}] starting Feishu provider`);

      if (!feishuMonitorPromise) {
        feishuMonitorPromise = getFeishuRuntime().channel.feishu.monitorFeishuProvider({
          cfg: ctx.cfg,
          runtime: ctx.runtime,
          onMessage: async (messageCtx: any) => {
            await processFeishuInboundMessage({
              ctx: messageCtx,
              cfg: ctx.cfg,
              runtime: ctx.runtime,
              statusSink: (patch) =>
                ctx.setStatus({ accountId: messageCtx.account.accountId, ...patch }),
            });
          },
          useLongConnection: true,
        });
      }

      return await feishuMonitorPromise;
    },

    stopAccount: async () => {
      const monitor = await feishuMonitorPromise;
      if (monitor) {
        monitor.stop();
        feishuMonitorPromise = null;
      }
    },

    logoutAccount: async ({ accountId, cfg }: any) => {
      const nextCfg = { ...cfg } as OpenClawConfig;
      const nextFeishu = cfg.channels?.feishu ? { ...cfg.channels.feishu } : undefined;
      let cleared = false;
      let changed = false;

      if (nextFeishu) {
        if (accountId === DEFAULT_ACCOUNT_ID && ((nextFeishu as any).appId || (nextFeishu as any).appSecret)) {
          delete (nextFeishu as any).appId;
          delete (nextFeishu as any).appSecret;
          cleared = true;
          changed = true;
        }

        const accounts = (nextFeishu as any).accounts && typeof (nextFeishu as any).accounts === "object"
          ? { ...(nextFeishu as any).accounts }
          : undefined;

        if (accounts && accountId in accounts) {
          const entry = accounts[accountId];
          if (entry && typeof entry === "object") {
            const nextEntry = { ...entry } as Record<string, unknown>;
            if ("appId" in nextEntry || "appSecret" in nextEntry) {
              cleared = true;
            }
            delete nextEntry.appId;
            delete nextEntry.appSecret;
            changed = true;

            if (Object.keys(nextEntry).length === 0) {
              delete accounts[accountId];
              changed = true;
            } else {
              accounts[accountId] = nextEntry as any;
            }
          }
        }

        if (accounts) {
          if (Object.keys(accounts).length === 0) {
            delete (nextFeishu as any).accounts;
            changed = true;
          } else {
            (nextFeishu as any).accounts = accounts;
          }
        }
      }

      if (changed) {
        if (nextFeishu && Object.keys(nextFeishu).length > 0) {
          nextCfg.channels = { ...nextCfg.channels, feishu: nextFeishu };
        } else {
          const nextChannels = { ...nextCfg.channels };
          delete (nextChannels as any).feishu;
          if (Object.keys(nextChannels).length > 0) {
            nextCfg.channels = nextChannels;
          } else {
            delete nextCfg.channels;
          }
        }
      }

      const loggedOut = !(nextCfg.channels?.feishu as any)?.accounts?.[accountId]?.appId;

      if (changed) {
        await getFeishuRuntime().config.writeConfigFile(nextCfg);
      }

      return { cleared, loggedOut };
    },
  },
};
