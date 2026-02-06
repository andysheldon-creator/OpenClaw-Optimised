import type { Api, AssistantMessage, Context, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { HistoryEntry } from "../../auto-reply/reply/history.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { ChimeInConfig } from "../../config/types.discord.js";
import { resolveAgentDir, resolveAgentModelPrimary } from "../../agents/agent-scope.js";
import { getApiKeyForModel, requireApiKey } from "../../agents/model-auth.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { ensureOpenClawModelsJson } from "../../agents/models-config.js";
import { extractAssistantText } from "../../agents/pi-embedded-utils.js";
import { discoverAuthStorage, discoverModels } from "../../agents/pi-model-discovery.js";
import { logVerbose } from "../../globals.js";

const DEFAULT_CHIME_IN_PROMPT =
  "You are monitoring a group chat. Based on the following recent messages, decide if you should chime in with a response. Only respond YES if the conversation is relevant to you or someone seems to need help. Respond NO if the conversation is casual chat between users that doesn't need your input. Reply with only YES or NO.";

export async function evaluateChimeIn(params: {
  history: HistoryEntry[];
  chimeInConfig: ChimeInConfig;
  cfg: OpenClawConfig;
  agentId: string;
  channelId: string;
}): Promise<boolean> {
  try {
    const { chimeInConfig, cfg, agentId, history } = params;

    const historyText = history.map((entry) => `${entry.sender}: ${entry.body}`).join("\n");

    if (!historyText.trim()) return false;

    const prompt = chimeInConfig.prompt ?? DEFAULT_CHIME_IN_PROMPT;
    const fullPrompt = `${prompt}\n\nRecent messages:\n${historyText}`;

    let provider: string;
    let modelId: string;
    const modelRef = chimeInConfig.model;
    if (modelRef) {
      const parts = modelRef.split("/");
      provider = normalizeProviderId(parts[0]);
      modelId = parts.slice(1).join("/");
    } else {
      const defaultModel = resolveAgentModelPrimary(cfg, agentId);
      if (!defaultModel) {
        logVerbose("discord: chimeIn evaluation skipped (no model configured)");
        return false;
      }
      const parts = defaultModel.split("/");
      provider = normalizeProviderId(parts[0]);
      modelId = parts.slice(1).join("/");
    }

    const agentDir = resolveAgentDir(cfg, agentId);
    await ensureOpenClawModelsJson(cfg, agentDir);
    const authStorage = discoverAuthStorage(agentDir);
    const modelRegistry = discoverModels(authStorage, agentDir);
    const model = modelRegistry.find(provider, modelId) as Model<Api> | null;
    if (!model) {
      logVerbose(`discord: chimeIn evaluation skipped (model not found: ${provider}/${modelId})`);
      return false;
    }
    const apiKeyInfo = await getApiKeyForModel({ model, cfg, agentDir });
    const apiKey = requireApiKey(apiKeyInfo, model.provider);
    authStorage.setRuntimeApiKey(model.provider, apiKey);

    const context: Context = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: fullPrompt }],
          timestamp: Date.now(),
        },
      ],
    };

    const response = (await complete(model, context, {
      apiKey,
      maxTokens: 10,
    })) as AssistantMessage;

    const responseText = extractAssistantText(response);
    const shouldRespond = responseText.trim().toUpperCase().startsWith("YES");
    logVerbose(
      `discord: chimeIn evaluation for channel ${params.channelId}: ${shouldRespond ? "YES" : "NO"} (response: ${responseText.trim().slice(0, 20)})`,
    );
    return shouldRespond;
  } catch (err) {
    logVerbose(`discord: chimeIn evaluation failed: ${String(err)}`);
    return false;
  }
}
