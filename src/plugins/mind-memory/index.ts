import { GraphService } from "../../services/memory/GraphService.js";
import { SubconsciousService } from "../../services/memory/SubconsciousService.js";
import { ConsolidationService } from "../../services/memory/ConsolidationService.js";
import { ensureGraphitiDocker, installDocker } from "./docker.js";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveModel } from "../../agents/pi-embedded-runner/model.js";
import { complete } from "@mariozechner/pi-ai";

export default function register(api: any) {
  const config = api.config?.plugins?.entries?.["mind-memory"]?.config || {};
  const graphitiUrl = config.graphiti?.baseUrl || "http://localhost:8001";
  const debug = !!config.debug;

  const graphService = new GraphService(graphitiUrl, debug);
  const subconscious = new SubconsciousService(graphService, debug);
  const consolidator = new ConsolidationService(graphService, debug);

  // 1. Register Background Service for Docker management
  api.registerService({
    id: "mind-memory-docker",
    start: async () => {
      if (config.graphiti?.autoStart) {
        // Resolve plugin dir (root of src/plugins/mind-memory or dist/plugins/mind-memory)
        const pluginDir = path.dirname(fileURLToPath(import.meta.url));
        await ensureGraphitiDocker(pluginDir);
      }
    },
    stop: async () => {
      // We usually don't want to stop Graphiti automatically as it's shared
    },
  });

  // 1.1 Register CLI Command for Setup
  api.registerCli(({ program }: any) => {
    const parent = program.command("mind-memory").description("Mind Memory commands");

    parent
      .command("setup")
      .description("Prepare the environment for Mind Memory (Installs Docker if missing)")
      .option("--bootstrap", "Force generate historical autobiography (STORY.md) from legacy files")
      .action(async (options: any) => {
        const ok = await installDocker();
        if (ok) {
          api.logger.info("✅ Docker installation process finished. Now starting Graphiti...");
          const pluginDir = path.dirname(fileURLToPath(import.meta.url));
          await ensureGraphitiDocker(pluginDir);

          if (options.bootstrap) {
            api.logger.info("📖 Generating historical autobiography...");
            const sessionId = "global-user-memory";
            const memoryDir = config.memoryDir || path.join(process.cwd(), "memory");
            const storyPath = path.join(path.dirname(memoryDir), "STORY.md");

            // We need a lightweight agent for this
            const agentDir = path.dirname(pluginDir);
            const { model: llm, error } = resolveModel(
              "github-copilot",
              "gemini-3-flash-preview",
              agentDir,
              api.config,
            );

            if (llm) {
              const { resolveApiKeyForProvider } = await import("../../agents/model-auth.js");
              const auth = await resolveApiKeyForProvider({
                provider: "github-copilot",
                cfg: api.config,
                agentDir,
              });

              if (!auth.apiKey) {
                api.logger.error(
                  "❌ No GitHub token found. Please configure it or set GITHUB_TOKEN environment variable.",
                );
                return;
              }

              let runtimeKey = auth.apiKey;
              if (auth.apiKey.startsWith("gh")) {
                const { resolveCopilotApiToken } =
                  await import("../../providers/github-copilot-token.js");
                const copilotAuth = await resolveCopilotApiToken({ githubToken: auth.apiKey });
                runtimeKey = copilotAuth.token;
              }

              // Simple bridge for the consolidation service
              const bridge = {
                complete: async (prompt: string) => {
                  const res = await complete(
                    llm as any,
                    { messages: [{ role: "user", content: prompt }] } as any,
                    { apiKey: runtimeKey },
                  );
                  return { text: (res as any).content || "" };
                },
              };
              await (consolidator as any).bootstrapFromLegacyMemory(
                sessionId,
                storyPath,
                bridge,
                "You are a helpful assistant.",
                100000,
              );
              api.logger.info("✅ Historical autobiography generated.");
            } else {
              api.logger.error(`❌ Could not resolve model: ${error}`);
            }
          }
        } else {
          api.logger.error("❌ Setup failed.");
        }
      });
  });

  // 2. Register Gateway Methods for the core agent runner to call
  // This allows the runner to be decoupled from the internal implementation.
  api.registerGatewayMethod(
    "narrative.getFlashbacks",
    async ({ params, respond }: { params: any; respond: (ok: boolean, payload?: any) => void }) => {
      const { prompt, oldestContextTimestamp, llmClient } = params;
      // Use stable global ID to ensure memory persists across chat sessions
      const sessionId = "global-user-memory";
      try {
        // Bootstrap historical episodes BEFORE flashback retrieval (if graph is empty)
        const memoryDir =
          api.config?.plugins?.entries?.["mind-memory"]?.config?.memoryDir ||
          `${process.cwd()}/memory`;
        await consolidator.bootstrapHistoricalEpisodes(sessionId, memoryDir);

        const flashbacks = await subconscious.getFlashback(
          sessionId,
          prompt,
          llmClient,
          oldestContextTimestamp ? new Date(oldestContextTimestamp) : undefined,
        );
        respond(true, { flashbacks });
      } catch (e: any) {
        respond(false, { error: e.message });
      }
    },
  );

  // REMOVED: narrative.consolidate gateway - Graphiti extracts entities automatically from episodes

  api.registerGatewayMethod(
    "narrative.addEpisode",
    async ({ params, respond }: { params: any; respond: (ok: boolean, payload?: any) => void }) => {
      const { text } = params;
      const sessionId = "global-user-memory";
      try {
        await graphService.addEpisode(sessionId, text);
        respond(true, { ok: true });
      } catch (e: any) {
        respond(false, { error: e.message });
      }
    },
  );

  api.registerGatewayMethod(
    "narrative.searchNodes",
    async ({ params, respond }: { params: any; respond: (ok: boolean, payload?: any) => void }) => {
      const { query } = params;
      const sessionId = "global-user-memory";
      try {
        const nodes = await graphService.searchNodes(sessionId, query);
        respond(true, { nodes });
      } catch (e: any) {
        respond(false, { error: e.message });
      }
    },
  );

  api.registerGatewayMethod(
    "narrative.searchFacts",
    async ({ params, respond }: { params: any; respond: (ok: boolean, payload?: any) => void }) => {
      const { query } = params;
      const sessionId = "global-user-memory";
      try {
        const facts = await graphService.searchFacts(sessionId, query);
        respond(true, { facts });
      } catch (e: any) {
        respond(false, { error: e.message });
      }
    },
  );

  // 3. Register Explicit Tool for Conscious Memory Access
  api.registerTool({
    name: "remember",
    description:
      "Search the long-term knowledge graph for memories, facts, and entities related to a query. Use this when you need to explicitly recall information from previous conversations or specific details about the user that might not be in the immediate context.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query keywords to find relevant memories.",
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId: string, params: { query: string }) => {
      const { query } = params;
      const sessionId = "global-user-memory";

      try {
        const [nodes, facts] = await Promise.all([
          graphService.searchNodes(sessionId, query),
          graphService.searchFacts(sessionId, query),
        ]);

        const combined = [...nodes, ...facts];

        if (combined.length === 0) {
          return {
            content: [{ type: "text", text: "No relevant memories found." }],
          };
        }

        // Simple formatting for the tool result
        const lines = combined
          .map((item) => {
            const content = item.content || item.fact || JSON.stringify(item);
            const date = item.timestamp
              ? `[${new Date(item.timestamp).toISOString().split("T")[0]}] `
              : "";
            return `- ${date}${content}`;
          })
          .slice(0, 20); // Limit to top 20 to avoid overwhelming

        return {
          content: [
            {
              type: "text",
              text: `Found ${combined.length} memories:\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error searching memory: ${e.message}` }],
          isError: true,
        };
      }
    },
  });

  api.logger.info("Mind Memory plugin registered (Mind v1.0 Modular)");
  api.logger.info("  └─ Tool registered: remember (Conscious Access)");
}
