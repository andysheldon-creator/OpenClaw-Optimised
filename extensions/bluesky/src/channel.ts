import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import { BlueskyConfigSchema } from "./config-schema.js";
import { BlueskyClient } from "./bluesky-client.js";
import { BlueskyPoller } from "./bluesky-poller.js";
import { getBlueskyRuntime } from "./runtime.js";
import {
  listBlueskyAccountIds,
  resolveDefaultBlueskyAccountId,
  resolveBlueskyAccount,
  type ResolvedBlueskyAccount,
} from "./types.js";

// Active pollers per account
const activePollers = new Map<string, BlueskyPoller>();
// Active clients per account (for outbound sends)
const activeClients = new Map<string, BlueskyClient>();

export const blueskyPlugin: ChannelPlugin<ResolvedBlueskyAccount> = {
  id: "bluesky",
  meta: {
    id: "bluesky",
    label: "Bluesky",
    selectionLabel: "Bluesky (AT Protocol DMs)",
    docsPath: "/channels/bluesky",
    docsLabel: "bluesky",
    blurb: "Decentralized social DMs via AT Protocol",
    order: 56,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false, // Bluesky DMs only support text currently
  },
  reload: { configPrefixes: ["channels.bluesky"] },
  configSchema: buildChannelConfigSchema(BlueskyConfigSchema),

  config: {
    listAccountIds: (cfg) => listBlueskyAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveBlueskyAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultBlueskyAccountId(cfg),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      identifier: account.identifier,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveBlueskyAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean),
  },

  pairing: {
    idLabel: "blueskyDid",
    normalizeAllowEntry: (entry) => entry.trim(),
    notifyApproval: async ({ id }) => {
      const client = activeClients.get(DEFAULT_ACCOUNT_ID);
      if (client) {
        await client.sendMessage(id, "Your pairing request has been approved!");
      }
    },
  },

  security: {
    resolveDmPolicy: ({ account }) => {
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: "channels.bluesky.dmPolicy",
        allowFromPath: "channels.bluesky.allowFrom",
        approveHint: formatPairingApproveHint("bluesky"),
        normalizeEntry: (raw) => raw.trim(),
      };
    },
  },

  messaging: {
    normalizeTarget: (target) => target.trim(),
    targetResolver: {
      looksLikeId: (input) => {
        const trimmed = input.trim();
        // Match DIDs (did:plc:...) or handles (*.bsky.social, user.example.com)
        return trimmed.startsWith("did:") || trimmed.includes(".");
      },
      hint: "<handle|did:plc:...>",
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 10000, // Bluesky DM text limit
    sendText: async ({ to, text, accountId }) => {
      const core = getBlueskyRuntime();
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const client = activeClients.get(aid);
      if (!client) {
        throw new Error(`Bluesky client not running for account ${aid}`);
      }

      const tableMode = core.channel.text.resolveMarkdownTableMode({
        cfg: core.config.loadConfig(),
        channel: "bluesky",
        accountId: aid,
      });
      const message = core.channel.text.convertMarkdownTables(text ?? "", tableMode);

      // Resolve handle to DID if needed
      let recipientDid = to;
      if (!to.startsWith("did:")) {
        recipientDid = await client.resolveHandle(to);
      }

      await client.sendMessage(recipientDid, message);
      return { channel: "bluesky", to: recipientDid };
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
        if (!lastError) return [];
        return [
          {
            channel: "bluesky",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      identifier: snapshot.identifier ?? null,
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
      identifier: account.identifier,
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
        identifier: account.identifier,
      });
      ctx.log?.info(
        `[${account.accountId}] starting Bluesky provider (handle: ${account.identifier})`,
      );

      if (!account.configured) {
        throw new Error("Bluesky identifier and app password not configured");
      }

      const runtime = getBlueskyRuntime();

      // Create and authenticate the client
      const client = new BlueskyClient({
        identifier: account.identifier,
        appPassword: account.appPassword,
        service: account.service,
      });

      const did = await client.login();
      ctx.log?.info(`[${account.accountId}] authenticated as ${did}`);

      activeClients.set(account.accountId, client);

      // Start the DM poller
      const poller = new BlueskyPoller({
        client,
        pollInterval: account.pollInterval,
        onMessage: async (message) => {
          ctx.log?.debug(
            `[${account.accountId}] DM from ${message.senderDid}: ${message.text.slice(0, 50)}...`,
          );

          await runtime.channel.reply.handleInboundMessage({
            channel: "bluesky",
            accountId: account.accountId,
            senderId: message.senderDid,
            chatType: "direct",
            chatId: message.senderDid,
            text: message.text,
            reply: async (responseText: string) => {
              await client.sendMessage(message.senderDid, responseText);
            },
          });
        },
        onError: (error, context) => {
          ctx.log?.error(
            `[${account.accountId}] Bluesky error (${context}): ${error.message}`,
          );
        },
      });

      poller.start();
      activePollers.set(account.accountId, poller);

      ctx.log?.info(
        `[${account.accountId}] Bluesky provider started, polling every ${account.pollInterval}ms`,
      );

      return {
        stop: () => {
          poller.stop();
          activePollers.delete(account.accountId);
          activeClients.delete(account.accountId);
          void client.logout();
          ctx.log?.info(`[${account.accountId}] Bluesky provider stopped`);
        },
      };
    },
  },
};
