import {
  getChatChannelMeta,
  type ChannelPlugin,
  type ChannelGatewayContext,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk";
import { getSpixiRuntime } from "./runtime.js";
import { listSpixiAccountIds, resolveSpixiAccount } from "./accounts.js";
import { type ResolvedSpixiAccount } from "./types.js";
import { SpixiConfigSchema } from "./schema.js";
import mqtt from "mqtt";

const meta = getChatChannelMeta("spixi");

export const spixiPlugin: ChannelPlugin<ResolvedSpixiAccount> = {
  id: "spixi",
  meta: {
    ...meta,
    showConfigured: true,
    quickstartAllowFrom: true,
  },
  configSchema: buildChannelConfigSchema(SpixiConfigSchema),
  config: {
    listAccountIds: (cfg) => listSpixiAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveSpixiAccount({ cfg, accountId }),
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
      const mqttUrl = `mqtt://${config.mqttHost || "127.0.0.1"}:${config.mqttPort || 1884}`;
      
      log?.info(`[${account.accountId}] connecting to Spixi MQTT: ${mqttUrl}`);
      
      const client = mqtt.connect(mqttUrl);
      
      client.on("connect", () => {
        log?.info(`[${account.accountId}] Spixi MQTT Connected`);
        client.subscribe("Chat");
      });

      client.on("message", async (topic, message) => {
        if (topic === "Chat") {
          try {
            const data = JSON.parse(message.toString());
            const sender = data.sender;
            const text = data.data?.data || data.message;
            
            if (!text || (config.myWalletAddress && sender === config.myWalletAddress)) {
              return;
            }

            log?.info(`[${account.accountId}] Received Spixi message from ${sender}`);
            
            // Inbound relay logic to OpenClaw core
            ctx.onMessage?.({
              id: data.id || `spixi-${Date.now()}`,
              from: sender,
              text,
              timestamp: data.timestamp || Date.now(),
              raw: data,
            });
          } catch (e: any) {
            log?.error(`[${account.accountId}] Error processing Spixi message: ${e.message}`);
          }
        }
      });

      return {
        stop: async () => {
          log?.info(`[${account.accountId}] stopping spixi bridge`);
          client.end();
        }
      };
    },
  },
};
