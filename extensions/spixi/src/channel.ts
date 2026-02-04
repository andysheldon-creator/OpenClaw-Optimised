import {
  getChatChannelMeta,
  type ChannelPlugin,
  type ChannelGatewayContext,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk";
import { getSpixiRuntime, setSpixiBaseUrl } from "./runtime.js";
import { listSpixiAccountIds, resolveSpixiAccount } from "./accounts.js";
import { type ResolvedSpixiAccount } from "./types.js";
import { SpixiConfigSchema } from "./schema.js";
import { spixiOnboardingAdapter } from "./onboarding.js";
import mqtt from "mqtt";

const meta = getChatChannelMeta("spixi");

export const spixiPlugin: ChannelPlugin<ResolvedSpixiAccount> = {
  id: "spixi",
  meta: {
    ...meta,
    showConfigured: true,
    quickstartAllowFrom: true,
  },
  onboarding: spixiOnboardingAdapter,
  configSchema: buildChannelConfigSchema(SpixiConfigSchema),
  config: {
    listAccountIds: (cfg) => listSpixiAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveSpixiAccount({ cfg, accountId }),
    isConfigured: (account) => account.configured,
  },
  agentTools: () => [
    {
      name: "spixi_add_contact",
      description: "Add a new Spixi contact and send a friend request.",
      schema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "The Spixi wallet address to add.",
          },
        },
        required: ["address"],
      },
      run: async ({ address }) => {
        const runtime = getSpixiRuntime();
        return await runtime.channel.spixi.addContact(address);
      },
    },
    {
      name: "spixi_accept_contact",
      description: "Accept a pending Spixi friend request.",
      schema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "The Spixi wallet address to accept.",
          },
        },
        required: ["address"],
      },
      run: async ({ address }) => {
        const runtime = getSpixiRuntime();
        return await runtime.channel.spixi.acceptContact(address);
      },
    },
  ],
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    reactions: false,
    media: false,
  },
  outbound: {
    deliveryMode: "gateway",
    sendText: async ({ to, text, accountId }) => {
      const runtime = getSpixiRuntime();
      const result = await runtime.channel.spixi.sendMessage(to, text);
      return { channel: "spixi", ...result };
    },
  },
  gateway: {
    startAccount: async (ctx: ChannelGatewayContext<ResolvedSpixiAccount>) => {
      const { account, log } = ctx;
      const config = account.config;

      // Debug logging
      log?.info(`[${account.accountId}] Spixi config:`, JSON.stringify({
        enabled: account.enabled,
        configured: account.configured,
        mqttHost: config.mqttHost,
        mqttPort: config.mqttPort,
        quixiApiUrl: config.quixiApiUrl,
        allowFrom: config.allowFrom,
      }));

      const mqttUrl = `mqtt://${config.mqttHost || "127.0.0.1"}:${config.mqttPort || 1884}`;

      log?.info(`[${account.accountId}] connecting to Spixi MQTT: ${mqttUrl}`);

      // Configure QuIXI API base URL from config
      if (config.quixiApiUrl) {
        setSpixiBaseUrl(config.quixiApiUrl);
      }

      const runtime = getSpixiRuntime();

      // Auto-friend sync: fetch existing friends, add any from allowFrom that are missing
      try {
        const existingFriends = await runtime.channel.spixi.getFriendList();
        const existingSet = new Set(existingFriends.map(addr => addr.toLowerCase()));

        const allowFrom = config.allowFrom || [];
        for (const address of allowFrom) {
          const trimmed = address?.trim();
          if (!trimmed || trimmed === "*") continue;

          if (!existingSet.has(trimmed.toLowerCase())) {
            log?.info(`[${account.accountId}] Auto-adding friend: ${trimmed}`);
            try {
              await runtime.channel.spixi.addContact(trimmed);
              log?.info(`[${account.accountId}] Friend request sent to: ${trimmed}`);
            } catch (e: any) {
              log?.warn(`[${account.accountId}] Failed to add friend ${trimmed}: ${e.message}`);
            }
          }
        }

        log?.info(`[${account.accountId}] Friend sync complete. ${existingFriends.length} existing friends.`);
      } catch (e: any) {
        log?.warn(`[${account.accountId}] Could not sync friends: ${e.message}`);
      }

      const client = mqtt.connect(mqttUrl);

      client.on("connect", () => {
        log?.info(`[${account.accountId}] Spixi MQTT Connected`);
        client.subscribe("Chat");
        client.subscribe("RequestAdd2");
        client.subscribe("AcceptAdd2");
      });

      client.on("message", async (topic, message) => {
        const msgStr = message.toString();
        let data: any;
        try {
          data = JSON.parse(msgStr);
        } catch {
          log?.warn(`[${account.accountId}] Received invalid JSON on ${topic}`);
          return;
        }

        if (topic === "Chat") {
          try {
            const sender = data.sender;
            const text = data.data?.data || data.message;

            if (!text || (config.myWalletAddress && sender === config.myWalletAddress)) {
              return;
            }

            log?.info(`[${account.accountId}] Received Spixi message from ${sender}: ${text}`);

            // Inbound relay logic to OpenClaw core
            if (ctx.onMessage) {
              ctx.onMessage({
                id: data.id || `spixi-${Date.now()}`,
                from: sender,
                text,
                timestamp: data.timestamp || Date.now(),
                raw: data,
              });
            } else {
              log?.warn(`[${account.accountId}] ctx.onMessage not available - message dropped`);
            }
          } catch (e: any) {
            log?.error(`[${account.accountId}] Error processing Spixi chat: ${e.message}`);
          }
        } else if (topic === "RequestAdd2") {
          // Incoming friend request
          const sender = data.sender || data.address;
          log?.info(`[${account.accountId}] Received Friend Request from: ${sender}`);

          // Check if in allowFrom
          const allowFrom = (config.allowFrom || []).map(a => a.toLowerCase().trim());
          if (sender && allowFrom.includes(sender.toLowerCase())) {
            log?.info(`[${account.accountId}] Auto-accepting friend request from allowed sender: ${sender}`);
            try {
              const runtime = getSpixiRuntime();
              await runtime.channel.spixi.acceptContact(sender);
              log?.info(`[${account.accountId}] Accepted friend request from ${sender}`);
            } catch (e: any) {
              log?.error(`[${account.accountId}] Failed to accept friend: ${e.message}`);
            }
          } else {
            log?.info(`[${account.accountId}] Friend request from ${sender} pending (not in allowFrom)`);
            // TODO: Ideally create a system notification or similar
          }
        } else if (topic === "AcceptAdd2") {
          // Friend request accepted by other party
          const sender = data.sender || data.address;
          log?.info(`[${account.accountId}] Friend request ACCEPTED by: ${sender}`);
        }
      });

      // Attach capabilities to the shared runtime object so server.impl.ts can see them
      Object.assign(ctx.runtime, getSpixiRuntime());

      return new Promise<void>((resolve) => {
        const onAbort = () => {
          log?.info(`[${account.accountId}] stopping spixi bridge`);
          client.end();
          resolve();
        };

        if (ctx.abortSignal.aborted) {
          onAbort();
          return;
        }

        ctx.abortSignal.addEventListener("abort", () => {
          onAbort();
        });
      });
    },
  },
};
