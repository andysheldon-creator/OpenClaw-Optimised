import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  applyAuthProfileConfig,
  applyOllamaProviderConfig,
  OLLAMA_BASE_URL,
  OLLAMA_DEFAULT_API_KEY,
  setOllamaApiKey,
} from "./onboard-auth.js";

export async function applyAuthChoiceOllama(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "ollama") {
    return null;
  }

  let nextConfig = params.config;

  await params.prompter.note(
    [
      "Ollama runs models locally or in the cloud.",
      "Make sure Ollama is installed and running: https://ollama.com",
      "Default server: http://127.0.0.1:11434",
    ].join("\n"),
    "Ollama",
  );

  const useDefault = await params.prompter.confirm({
    message: `Use default Ollama server (${OLLAMA_BASE_URL.replace("/v1", "")})?`,
    initialValue: true,
  });

  let baseUrl = OLLAMA_BASE_URL;
  if (!useDefault) {
    const customUrl = await params.prompter.text({
      message: "Enter Ollama server URL (e.g., http://192.168.1.100:11434)",
      validate: (value) => {
        if (!value?.trim()) return "URL is required";
        try {
          new URL(value.trim());
          return undefined;
        } catch {
          return "Invalid URL format";
        }
      },
    });
    // Append /v1 if not present for OpenAI-compatible endpoint
    const trimmedUrl = String(customUrl).trim().replace(/\/+$/, "");
    baseUrl = trimmedUrl.endsWith("/v1") ? trimmedUrl : `${trimmedUrl}/v1`;
  }

  // Store the placeholder API key to enable provider discovery
  await setOllamaApiKey(OLLAMA_DEFAULT_API_KEY, params.agentDir);

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "ollama:default",
    provider: "ollama",
    mode: "api_key",
  });

  nextConfig = applyOllamaProviderConfig(nextConfig, { baseUrl });

  await params.prompter.note(
    [
      "Ollama configured successfully.",
      "Models will be discovered automatically from your Ollama server.",
      "Use `ollama pull <model>` to download models, then `openclaw models list` to see them.",
    ].join("\n"),
    "Setup complete",
  );

  return { config: nextConfig };
}
