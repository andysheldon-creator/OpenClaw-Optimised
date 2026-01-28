import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type OpenClawConfig,
  type ReplyPayload,
} from "openclaw/plugin-sdk";
import { GossipConfigSchema } from "./config-schema.js";
import { startGossipBus, isValidGossipUserId, type GossipBusHandle } from "./gossip-bus.js";
import { gossipOnboardingAdapter } from "./onboarding.js";
import { getGossipRuntime } from "./runtime.js";
import {
  listGossipAccountIds,
  resolveDefaultGossipAccountId,
  resolveGossipAccount,
  normalizeGossipUserId,
  type ResolvedGossipAccount,
} from "./types.js";

// Store active bus handles per account
const activeBuses = new Map<string, GossipBusHandle>();

export const gossipPlugin: ChannelPlugin<ResolvedGossipAccount> = {
  id: "gossip",
  meta: {
    id: "gossip",
    label: "Gossip",
    selectionLabel: "Gossip",
    docsPath: "/channels/gossip",
    docsLabel: "gossip",
    blurb: "Privacy-focused decentralized messenger with post-quantum encryption",
    order: 100,
  },
  capabilities: {
    chatTypes: ["direct"], // DMs only for now
    media: false, // No media for initial release
  },
  reload: { configPrefixes: ["channels.gossip"] },
  configSchema: buildChannelConfigSchema(GossipConfigSchema),
  onboarding: gossipOnboardingAdapter,

  config: {
    listAccountIds: (cfg) => listGossipAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveGossipAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultGossipAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "gossip",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "gossip",
        accountId,
        clearBaseFields: [
          "name",
          "mnemonic",
          "username",
          "protocolUrl",
          "dmPolicy",
          "allowFrom",
          "enabled",
          "markdown",
        ],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      userId: account.userId,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveGossipAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => {
          if (entry === "*") {
            return "*";
          }
          return normalizeGossipUserId(entry);
        })
        .filter(Boolean),
  },

  pairing: {
    idLabel: "gossipUserId",
    normalizeAllowEntry: (entry) => {
      return normalizeGossipUserId(entry);
    },
    notifyApproval: async ({ id }) => {
      // Get the default account's bus and send approval message
      const bus = activeBuses.get(DEFAULT_ACCOUNT_ID);
      if (bus) {
        await bus.sendDm(id, "Your pairing request has been approved!");
      }
    },
  },

  security: {
    resolveDmPolicy: ({ account }) => {
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: "channels.gossip.dmPolicy",
        allowFromPath: "channels.gossip.allowFrom",
        approveHint: formatPairingApproveHint("gossip"),
        normalizeEntry: (raw) => {
          return normalizeGossipUserId(raw.trim());
        },
      };
    },
  },

  messaging: {
    normalizeTarget: (target) => {
      return normalizeGossipUserId(target.trim());
    },
    targetResolver: {
      looksLikeId: (input) => {
        const trimmed = input.trim();
        return isValidGossipUserId(trimmed);
      },
      hint: "<gossip user ID>",
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const core = getGossipRuntime();
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const bus = activeBuses.get(aid);
      if (!bus) {
        throw new Error(`Gossip bus not running for account ${aid}`);
      }
      const tableMode = core.channel.text.resolveMarkdownTableMode({
        cfg: core.config.loadConfig(),
        channel: "gossip",
        accountId: aid,
      });
      const message = core.channel.text.convertMarkdownTables(text ?? "", tableMode);
      const normalizedTo = normalizeGossipUserId(to);
      await bus.sendDm(normalizedTo, message);
      return { channel: "gossip", to: normalizedTo };
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
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) {
          return [];
        }
        return [
          {
            channel: "gossip",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      userId: snapshot.userId ?? null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      userId: account.userId,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        userId: account.userId,
      });
      ctx.log?.info(`[${account.accountId}] starting Gossip provider`);

      if (!account.configured) {
        throw new Error("Gossip channel not configured");
      }

      const runtime = getGossipRuntime();

      const bus = await startGossipBus({
        accountId: account.accountId,
        mnemonic: account.mnemonic || undefined,
        username: account.username,
        protocolUrl: account.protocolUrl,
        log: ctx.log,
        onMessage: async (senderId, text, reply) => {
          ctx.log?.debug(`[${account.accountId}] DM from ${senderId}: ${text.slice(0, 50)}...`);

          const cfg = runtime.config.loadConfig() as OpenClawConfig;

          // Resolve agent route for this DM
          const route = runtime.channel.routing.resolveAgentRoute({
            cfg,
            channel: "gossip",
            accountId: account.accountId,
            peer: { kind: "dm", id: senderId },
          });

          const rawBody = text;
          const body = runtime.channel.reply.formatAgentEnvelope({
            channel: "Gossip",
            from: senderId,
            envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(cfg),
            body: rawBody,
          });

          const ctxPayload = runtime.channel.reply.finalizeInboundContext({
            Body: body,
            RawBody: rawBody,
            CommandBody: rawBody,
            From: `gossip:${senderId}`,
            To: `gossip:${account.userId ?? account.accountId}`,
            SessionKey: route.sessionKey,
            AccountId: route.accountId,
            ChatType: "direct",
            SenderName: senderId,
            SenderId: senderId,
            Provider: "gossip",
            Surface: "gossip",
            OriginatingChannel: "gossip",
            OriginatingTo: `gossip:${account.userId ?? account.accountId}`,
          });

          // Record session metadata
          const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
            agentId: route.agentId,
          });
          await runtime.channel.session.recordInboundSession({
            storePath,
            sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
            ctx: ctxPayload,
            onRecordError: (err) => {
              ctx.log?.error(`[${account.accountId}] Failed updating session meta: ${String(err)}`);
            },
          });

          const tableMode = runtime.channel.text.resolveMarkdownTableMode({
            cfg,
            channel: "gossip",
            accountId: account.accountId,
          });

          // Dispatch through the standard reply pipeline
          await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
              deliver: async (payload: ReplyPayload) => {
                if (!payload.text) {
                  return;
                }
                const message = runtime.channel.text.convertMarkdownTables(payload.text, tableMode);
                await reply(message);
                ctx.setStatus({ lastOutboundAt: Date.now() });
              },
            },
          });
        },
        onError: (error, context) => {
          ctx.log?.error(`[${account.accountId}] Gossip error (${context}): ${error.message}`);
        },
        onReady: (userId) => {
          ctx.log?.info(`[${account.accountId}] Gossip provider ready, user ID: ${userId}`);
          ctx.setStatus({ userId });
        },
        onDiscussionRequest: (discussion, contact) => {
          ctx.log?.debug(
            `[${account.accountId}] Discussion request from ${contact.userId} (auto-accepting)`,
          );
        },
      });

      // Store the bus handle
      activeBuses.set(account.accountId, bus);

      ctx.log?.info(`[${account.accountId}] Gossip provider started`);

      // Return cleanup function
      return {
        stop: async () => {
          await bus.close();
          activeBuses.delete(account.accountId);
          ctx.log?.info(`[${account.accountId}] Gossip provider stopped`);
        },
      };
    },
  },
};

/**
 * Get an active Gossip bus handle.
 * Returns undefined if account is not running.
 */
export function getGossipBus(accountId: string = DEFAULT_ACCOUNT_ID): GossipBusHandle | undefined {
  return activeBuses.get(accountId);
}

/**
 * Get all active Gossip bus handles.
 * Useful for debugging and status reporting.
 */
export function getActiveGossipBuses(): Map<string, GossipBusHandle> {
  return new Map(activeBuses);
}
