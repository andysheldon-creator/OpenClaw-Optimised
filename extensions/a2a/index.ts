import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AgentCard } from "@a2a-js/sdk";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";

import { parseA2APluginConfig, type A2APluginConfig } from "./src/config.js";
import { buildAgentCard } from "./src/agent-card.js";
import { OpenClawAgentExecutor } from "./src/executor.js";
import { createA2AHttpHandlers, type A2AAuthConfig } from "./src/http-adapter.js";
import { createSendMessageToAgentTool, createGetAgentCardTool } from "./src/tool.js";
import { callGateway } from "./src/gateway-call.js";
import { generateApiKey } from "./src/inbound-auth.js";

const A2A_CONFIG_SCHEMA = {
  parse(value: unknown): A2APluginConfig {
    return parseA2APluginConfig(value);
  },
  uiHints: {
    agentId: {
      label: "Agent ID",
      help: "Which agent to expose via A2A (defaults to 'main')",
    },
    description: {
      label: "Description",
      help: "Custom description for the Agent Card",
    },
  },
};

/**
 * Determine whether inbound auth is required and gather valid keys.
 * If no keys are configured and allowUnauthenticated is not true,
 * auto-generate a key and persist it.
 */
async function resolveInboundAuth(
  pluginConfig: A2APluginConfig,
  api: OpenClawPluginApi,
): Promise<A2AAuthConfig | undefined> {
  const inbound = pluginConfig.inbound;

  // Explicit opt-out of authentication
  if (inbound?.allowUnauthenticated) {
    api.logger.info("[a2a] Inbound auth disabled (allowUnauthenticated: true)");
    return undefined;
  }

  // If keys are already configured, use them
  if (inbound?.apiKeys && inbound.apiKeys.length > 0) {
    api.logger.info(`[a2a] Inbound auth enabled with ${inbound.apiKeys.length} key(s)`);
    return { required: true, validKeys: inbound.apiKeys };
  }

  // Auto-generate a key on first enable
  api.logger.info("[a2a] No inbound API keys configured — generating one automatically");
  const key = generateApiKey();
  const label = "auto-generated";
  const newKeys = [{ label, key }];

  // Persist the generated key to config
  try {
    const currentConfig = await api.runtime.config.loadConfig();
    const pluginsEntries =
      (currentConfig.plugins as Record<string, unknown> | undefined)?.entries as
        | Record<string, unknown>
        | undefined;
    const a2aEntry = (pluginsEntries?.a2a ?? {}) as Record<string, unknown>;
    const a2aConfig = (a2aEntry.config ?? {}) as Record<string, unknown>;
    const existingInbound = (a2aConfig.inbound ?? {}) as Record<string, unknown>;

    const updatedConfig = {
      ...currentConfig,
      plugins: {
        ...(currentConfig.plugins as Record<string, unknown>),
        entries: {
          ...pluginsEntries,
          a2a: {
            ...a2aEntry,
            config: {
              ...a2aConfig,
              inbound: {
                ...existingInbound,
                apiKeys: newKeys,
              },
            },
          },
        },
      },
    };

    await api.runtime.config.writeConfigFile(updatedConfig);
    api.logger.info(`[a2a] Auto-generated API key stored in config (label: "${label}")`);
  } catch (err) {
    api.logger.warn(`[a2a] Failed to persist auto-generated key: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Log the key (only time it's shown in full)
  api.logger.info(`[a2a] Inbound API key: ${key}`);
  api.logger.info("[a2a] Use this key in the Authorization header: Bearer <key>");

  return { required: true, validKeys: newKeys };
}

function maskKey(key: string): string {
  if (key.length <= 8) {
    return "****";
  }
  return key.slice(0, 4) + "…" + key.slice(-4);
}

const a2aPlugin = {
  id: "a2a",
  name: "A2A Protocol",
  description:
    "A2A protocol plugin that allows OpenClaw to send and receive messages from other agents via A2A.",
  configSchema: A2A_CONFIG_SCHEMA,

  async register(api: OpenClawPluginApi) {
    const pluginConfig = A2A_CONFIG_SCHEMA.parse(api.pluginConfig);

    if (!pluginConfig.enabled) {
      api.logger.info("[a2a] Plugin disabled via config");
      return;
    }

    // Resolve inbound auth (may auto-generate key)
    const authConfig = await resolveInboundAuth(pluginConfig, api);
    const authRequired = authConfig?.required ?? false;

    // State for the A2A server components
    let agentCard: AgentCard | null = null;
    let requestHandler: DefaultRequestHandler | null = null;
    let httpHandlers: ReturnType<typeof createA2AHttpHandlers> | null = null;

    // Function to initialize the A2A server when we know the public URL
    const initializeA2AServer = (publicUrl: string) => {
      if (agentCard) {
        // Already initialized
        return;
      }

      api.logger.info(`[a2a] Initializing A2A server with URL: ${publicUrl}`);

      // Build agent card with security info
      agentCard = buildAgentCard({
        config: api.config,
        pluginConfig,
        publicUrl,
        authRequired,
      });

      // Create task store and executor
      const taskStore = new InMemoryTaskStore();
      const executor = new OpenClawAgentExecutor({
        config: api.config,
        pluginConfig,
        runtime: api.runtime,
        callGateway: async (params) => {
          const gatewayAuth = (api.config.gateway as Record<string, unknown> | undefined)?.auth as
            | Record<string, unknown>
            | undefined;
          return callGateway({
            method: params.method,
            params: params.params as Record<string, unknown> | undefined,
            timeoutMs: params.timeoutMs,
            token: typeof gatewayAuth?.token === "string" ? gatewayAuth.token : undefined,
          });
        },
      });

      // Create request handler
      requestHandler = new DefaultRequestHandler(
        agentCard,
        taskStore,
        executor,
      );

      // Create HTTP handlers with auth config
      httpHandlers = createA2AHttpHandlers({
        agentCard,
        requestHandler,
        auth: authConfig,
      });

      api.logger.info(
        `[a2a] A2A server initialized. Agent name: ${agentCard.name}`,
      );
    };

    // Register HTTP route for agent card
    api.registerHttpRoute({
      path: "/.well-known/agent-card.json",
      handler: async (req, res) => {
        // Lazy initialize on first request if not done yet
        if (!httpHandlers) {
          // Try to determine public URL from request
          const host = req.headers.host || "localhost";
          const protocol = req.headers["x-forwarded-proto"] || "https";
          const publicUrl = `${protocol}://${host}`;
          initializeA2AServer(publicUrl);
        }

        if (httpHandlers) {
          await httpHandlers.handleAgentCard(req, res);
        } else {
          res.statusCode = 503;
          res.end("A2A server not initialized");
        }
      },
    });

    // Register HTTP route for JSON-RPC endpoint
    api.registerHttpRoute({
      path: "/a2a",
      handler: async (req, res) => {
        // Lazy initialize on first request if not done yet
        if (!httpHandlers) {
          const host = req.headers.host || "localhost";
          const protocol = req.headers["x-forwarded-proto"] || "https";
          const publicUrl = `${protocol}://${host}`;
          initializeA2AServer(publicUrl);
        }

        if (httpHandlers) {
          await httpHandlers.handleJsonRpc(req, res);
        } else {
          res.statusCode = 503;
          res.end("A2A server not initialized");
        }
      },
    });

    // Register A2A tools (with remoteAgents captured via closure for key isolation)
    api.registerTool(createSendMessageToAgentTool(pluginConfig.remoteAgents));
    api.registerTool(createGetAgentCardTool(pluginConfig.remoteAgents));

    // Register CLI key management commands
    api.registerCommand({
      name: "a2a generate-key",
      description: "Generate a new inbound API key for A2A authentication",
      acceptsArgs: true,
      handler: async (ctx) => {
        const label = ctx.args?.trim() || `key-${Date.now()}`;
        const key = generateApiKey();

        try {
          const currentConfig = await api.runtime.config.loadConfig();
          const pluginsEntries =
            (currentConfig.plugins as Record<string, unknown> | undefined)?.entries as
              | Record<string, unknown>
              | undefined;
          const a2aEntry = (pluginsEntries?.a2a ?? {}) as Record<string, unknown>;
          const a2aConfig = (a2aEntry.config ?? {}) as Record<string, unknown>;
          const existingInbound = (a2aConfig.inbound ?? {}) as Record<string, unknown>;
          const existingKeys = Array.isArray(existingInbound.apiKeys) ? existingInbound.apiKeys : [];

          const updatedConfig = {
            ...currentConfig,
            plugins: {
              ...(currentConfig.plugins as Record<string, unknown>),
              entries: {
                ...pluginsEntries,
                a2a: {
                  ...a2aEntry,
                  config: {
                    ...a2aConfig,
                    inbound: {
                      ...existingInbound,
                      apiKeys: [...existingKeys, { label, key }],
                    },
                  },
                },
              },
            },
          };

          await api.runtime.config.writeConfigFile(updatedConfig);
          return { text: `Generated API key "${label}": ${key}\n\nThis is the only time this key will be shown in full. Restart the gateway to apply.` };
        } catch (err) {
          return { text: `Failed to generate key: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    api.registerCommand({
      name: "a2a list-keys",
      description: "List configured inbound A2A API keys (values masked)",
      acceptsArgs: false,
      handler: async () => {
        try {
          const currentConfig = await api.runtime.config.loadConfig();
          const a2aEntry =
            ((currentConfig.plugins as Record<string, unknown> | undefined)?.entries as Record<string, unknown> | undefined)
              ?.a2a as Record<string, unknown> | undefined;
          const a2aConfig = parseA2APluginConfig(a2aEntry?.config);
          const keys = a2aConfig.inbound?.apiKeys ?? [];

          if (keys.length === 0) {
            return { text: "No inbound API keys configured." };
          }

          const lines = keys.map((k) => `- ${k.label}: ${maskKey(k.key)}`);
          return { text: `Inbound API keys:\n${lines.join("\n")}` };
        } catch (err) {
          return { text: `Failed to list keys: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    api.registerCommand({
      name: "a2a revoke-key",
      description: "Revoke an inbound A2A API key by label",
      acceptsArgs: true,
      handler: async (ctx) => {
        const label = ctx.args?.trim();
        if (!label) {
          return { text: "Usage: a2a revoke-key <label>" };
        }

        try {
          const currentConfig = await api.runtime.config.loadConfig();
          const pluginsEntries =
            (currentConfig.plugins as Record<string, unknown> | undefined)?.entries as
              | Record<string, unknown>
              | undefined;
          const a2aEntry = (pluginsEntries?.a2a ?? {}) as Record<string, unknown>;
          const a2aConfig = (a2aEntry.config ?? {}) as Record<string, unknown>;
          const existingInbound = (a2aConfig.inbound ?? {}) as Record<string, unknown>;
          const existingKeys = Array.isArray(existingInbound.apiKeys) ? existingInbound.apiKeys : [];

          const filtered = existingKeys.filter(
            (k: Record<string, unknown>) => k.label !== label,
          );

          if (filtered.length === existingKeys.length) {
            return { text: `No key found with label "${label}".` };
          }

          const updatedConfig = {
            ...currentConfig,
            plugins: {
              ...(currentConfig.plugins as Record<string, unknown>),
              entries: {
                ...pluginsEntries,
                a2a: {
                  ...a2aEntry,
                  config: {
                    ...a2aConfig,
                    inbound: {
                      ...existingInbound,
                      apiKeys: filtered.length > 0 ? filtered : undefined,
                    },
                  },
                },
              },
            },
          };

          await api.runtime.config.writeConfigFile(updatedConfig);
          return { text: `Revoked key "${label}". Restart the gateway to apply.` };
        } catch (err) {
          return { text: `Failed to revoke key: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    // Register service for lifecycle management
    api.registerService({
      id: "a2a",
      start: async () => {
        api.logger.info("[a2a] A2A service started");
      },
      stop: async () => {
        api.logger.info("[a2a] A2A service stopped");
        agentCard = null;
        requestHandler = null;
        httpHandlers = null;
      },
    });

    api.logger.info("[a2a] Plugin registered successfully");
  },
};

export default a2aPlugin;
