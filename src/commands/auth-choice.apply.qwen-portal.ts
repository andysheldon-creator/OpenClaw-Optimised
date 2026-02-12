import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthChoicePluginProvider } from "./auth-choice.apply.plugin-provider.js";

export async function applyAuthChoiceQwenPortal(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  // Match qwen-portal (OAuth)
  if (params.authChoice === "qwen-portal") {
    return await applyAuthChoicePluginProvider(params, {
      authChoice: "qwen-portal",
      pluginId: "qwen-portal-auth",
      providerId: "qwen-portal",
      methodId: "device",
      label: "Qwen OAuth",
    });
  }

  // Match qwen-api-key (API Key)
  if (params.authChoice === "qwen-api-key") {
    return await applyAuthChoicePluginProvider(params, {
      authChoice: "qwen-api-key",
      pluginId: "qwen-portal-auth",
      providerId: "qwen-portal",
      methodId: "api-key",
      label: "Qwen API Key",
    });
  }

  return null;
}
