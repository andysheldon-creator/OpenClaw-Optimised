import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { resolveClawdbotAgentDir } from "../agents/agent-paths.js";
import type { ClawdbotConfig } from "../config/config.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyAuthProfileConfig } from "./onboard-auth.js";

const QUOTIO_DEFAULT_BASE_URL = "http://127.0.0.1:18317/v1";
const QUOTIO_DEFAULT_API_KEY = "quotio-local";

type QuotioModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
};

type QuotioModelsResponse = {
  object: string;
  data: QuotioModel[];
};

async function discoverQuotioModels(
  baseUrl: string,
  apiKey: string,
): Promise<{ models: QuotioModel[]; error?: string }> {
  try {
    const modelsUrl = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;
    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { models: [], error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = (await response.json()) as QuotioModelsResponse;
    if (!data.data || !Array.isArray(data.data)) {
      return { models: [], error: "Invalid response format from /models endpoint" };
    }

    return { models: data.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { models: [], error: message };
  }
}

function buildModelDefinition(model: QuotioModel): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.id,
    reasoning: false,
    input: ["text", "image"] as Array<"text" | "image">,
    contextWindow: 200000,
    maxTokens: 32000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function applyQuotioProviderConfig(
  config: ClawdbotConfig,
  baseUrl: string,
  apiKey: string,
  models: ModelDefinitionConfig[],
): ClawdbotConfig {
  return {
    ...config,
    models: {
      ...config.models,
      providers: {
        ...config.models?.providers,
        quotio: {
          baseUrl,
          apiKey,
          api: "openai-completions",
          models,
        },
      },
    },
  };
}

function applyQuotioDefaultModel(config: ClawdbotConfig, modelRef: string): ClawdbotConfig {
  const models = { ...config.agents?.defaults?.models };
  models[modelRef] = models[modelRef] ?? {};

  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        models,
        model: {
          primary: modelRef,
        },
      },
    },
  };
}

export async function applyAuthChoiceQuotio(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "quotio") return null;

  let nextConfig = params.config;
  const agentDir = params.agentDir ?? resolveClawdbotAgentDir();

  await params.prompter.note(
    [
      "Quotio is a local OpenAI-compatible proxy that routes to various AI models.",
      "Make sure Quotio is running before continuing.",
      "Default endpoint: http://127.0.0.1:18317/v1",
    ].join("\n"),
    "Quotio",
  );

  const baseUrl = await params.prompter.text({
    message: "Enter Quotio base URL",
    initialValue: QUOTIO_DEFAULT_BASE_URL,
    validate: (value) => {
      if (!value?.trim()) return "Base URL is required";
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Invalid URL format";
      }
    },
  });

  const apiKey = await params.prompter.text({
    message: "Enter Quotio API key (or leave default for local)",
    initialValue: QUOTIO_DEFAULT_API_KEY,
  });

  const normalizedBaseUrl = String(baseUrl).trim() || QUOTIO_DEFAULT_BASE_URL;
  const normalizedApiKey = String(apiKey).trim() || QUOTIO_DEFAULT_API_KEY;

  await params.prompter.note("Discovering available models from Quotio...", "Connecting");

  const { models: discoveredModels, error } = await discoverQuotioModels(
    normalizedBaseUrl,
    normalizedApiKey,
  );

  if (error || discoveredModels.length === 0) {
    await params.prompter.note(
      error
        ? `Could not fetch models: ${error}\nPlease ensure Quotio is running and try again.`
        : "No models found. Please check your Quotio configuration.",
      "Discovery Failed",
    );
    return { config: params.config };
  }

  await params.prompter.note(
    `Found ${discoveredModels.length} model(s) available.`,
    "Discovery Complete",
  );

  const modelOptions = discoveredModels.map((m) => ({
    value: m.id,
    label: m.id,
    hint: m.owned_by ? `by ${m.owned_by}` : undefined,
  }));

  const selectedModelId = await params.prompter.select({
    message: "Select default model",
    options: modelOptions,
  });

  const modelDefinitions = discoveredModels.map(buildModelDefinition);
  const defaultModelRef = `quotio/${String(selectedModelId)}`;

  upsertAuthProfile({
    profileId: "quotio:default",
    credential: {
      type: "api_key",
      provider: "quotio",
      key: normalizedApiKey,
    },
    agentDir,
  });

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "quotio:default",
    provider: "quotio",
    mode: "api_key",
  });

  nextConfig = applyQuotioProviderConfig(
    nextConfig,
    normalizedBaseUrl,
    normalizedApiKey,
    modelDefinitions,
  );

  let agentModelOverride: string | undefined;
  if (params.setDefaultModel) {
    nextConfig = applyQuotioDefaultModel(nextConfig, defaultModelRef);
    await params.prompter.note(`Default model set to ${defaultModelRef}`, "Model configured");
  } else if (params.agentId) {
    agentModelOverride = defaultModelRef;
    await params.prompter.note(
      `Default model set to ${defaultModelRef} for agent "${params.agentId}".`,
      "Model configured",
    );
  }

  return { config: nextConfig, agentModelOverride };
}
