import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { AutoMemoryConfig } from "./src/types.js";
import { resolveAgentWorkspaceDir } from "../../src/agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../src/routing/session-key.js";
import { writeToMemory } from "./src/memory-writer.js";
import { analyzeMessages } from "./src/message-analyzer.js";
import { sendNotification } from "./src/notification.js";

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as AutoMemoryConfig;

  // Check if plugin is enabled
  if (cfg.enabled === false) {
    api.logger.info("auto-memory: plugin disabled");
    return;
  }

  const messageThreshold = cfg.messageThreshold ?? 5;
  const minImportance = cfg.minImportance ?? 0.7;
  const notificationEnabled = cfg.notificationEnabled !== false;
  const notificationMessage = cfg.notificationMessage ?? "💾 Memoria aggiornata";

  // Contatore per sessione
  const messageCounts = new Map<string, number>();

  api.on("agent_end", async (event, ctx) => {
    try {
      // Skip if not successful or no messages
      if (!event.success || !event.messages || event.messages.length === 0) {
        return;
      }

      const sessionKey = ctx.sessionKey;
      if (!sessionKey) {
        return;
      }

      // Increment message count for this session
      const currentCount = (messageCounts.get(sessionKey) ?? 0) + 1;
      messageCounts.set(sessionKey, currentCount);

      // Check if we've reached the threshold
      if (currentCount < messageThreshold) {
        return;
      }

      // Reset counter
      messageCounts.set(sessionKey, 0);

      api.logger.info(`auto-memory: analyzing conversation (session: ${sessionKey})`);

      // Analyze messages
      const agentId = ctx.agentId ?? resolveAgentIdFromSessionKey(sessionKey);
      const workspaceDir = ctx.workspaceDir ?? resolveAgentWorkspaceDir(api.config, agentId);
      if (!workspaceDir) {
        api.logger.warn("auto-memory: no workspaceDir available");
        return;
      }

      const analysis = await analyzeMessages(
        event.messages,
        api.config,
        workspaceDir,
        minImportance,
      );

      if (analysis.facts.length === 0) {
        api.logger.info("auto-memory: no important facts found");
        return;
      }

      api.logger.info(`auto-memory: extracted ${analysis.facts.length} facts`);

      // Write to memory
      const writeResult = await writeToMemory(analysis.facts, api.config, sessionKey, ctx.agentId);

      if (!writeResult.success) {
        api.logger.error(`auto-memory: failed to write memory: ${writeResult.error}`);
        return;
      }

      api.logger.info(`auto-memory: memory updated (${writeResult.filePath})`);

      // Send notification if enabled
      if (notificationEnabled) {
        const notifyResult = await sendNotification(
          notificationMessage,
          sessionKey,
          api.config,
          api.runtime,
        );

        if (!notifyResult.success) {
          api.logger.warn(`auto-memory: failed to send notification: ${notifyResult.error}`);
        }
      }
    } catch (err) {
      api.logger.error(`auto-memory: error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
