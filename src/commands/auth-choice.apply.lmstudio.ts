import type { OpenClawConfig } from "../config/config.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { applyPrimaryModel } from "./model-picker.js";

const DEFAULT_LMSTUDIO_BASE_URL = "http://127.0.0.1:1234";
const DEFAULT_LMSTUDIO_API = "openai-responses";
const DEFAULT_CONTEXT_WINDOW = 8192;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MODEL_INPUT = ["text"] satisfies Array<"text" | "image">;

function normalizeLmStudioBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/g, "");
  url.pathname = path.endsWith("/v1") ? path : `${path || ""}/v1`;
  return url.toString().replace(/\/+$/g, "");
}

function normalizeLmStudioModelId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withoutPrefix = trimmed.replace(/^lmstudio\//i, "");
  if (!withoutPrefix.includes("/")) {
    return null;
  }
  return withoutPrefix;
}

function upsertLmStudioProviderModel(cfg: OpenClawConfig, modelId: string): OpenClawConfig {
  const providers = { ...cfg.models?.providers };
  const existingProvider = providers.lmstudio;
  const existingModels = Array.isArray(existingProvider?.models) ? existingProvider.models : [];
  const hasModel = existingModels.some((model) => model.id === modelId);
  const models = hasModel
    ? existingModels
    : [
        ...existingModels,
        {
          id: modelId,
          name: modelId,
          reasoning: false,
          input: DEFAULT_MODEL_INPUT,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: DEFAULT_CONTEXT_WINDOW,
          maxTokens: DEFAULT_MAX_TOKENS,
        },
      ];

  providers.lmstudio = {
    ...(existingProvider ? { ...existingProvider } : {}),
    baseUrl: existingProvider?.baseUrl ?? `${DEFAULT_LMSTUDIO_BASE_URL}/v1`,
    apiKey: existingProvider?.apiKey ?? "lmstudio",
    api: existingProvider?.api ?? DEFAULT_LMSTUDIO_API,
    models,
  };

  return {
    ...cfg,
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}

export async function applyAuthChoiceLmStudio(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "lmstudio") {
    return null;
  }

  const existingProvider = params.config.models?.providers?.lmstudio;
  const baseUrlDefault = existingProvider?.baseUrl ?? DEFAULT_LMSTUDIO_BASE_URL;
  const baseUrlDefaultNormalized =
    normalizeLmStudioBaseUrl(baseUrlDefault) ?? `${DEFAULT_LMSTUDIO_BASE_URL}/v1`;
  const baseUrlInput = await params.prompter.text({
    message: "LM Studio base URL (host:port or full URL)",
    initialValue: baseUrlDefaultNormalized,
    placeholder: `${DEFAULT_LMSTUDIO_BASE_URL}/v1`,
    validate: (value) =>
      normalizeLmStudioBaseUrl(String(value ?? "")) ? undefined : "Enter a valid host:port or URL",
  });
  const normalizedBaseUrl = normalizeLmStudioBaseUrl(String(baseUrlInput)) as string;

  const configuredRaw =
    typeof params.config.agents?.defaults?.model === "string"
      ? params.config.agents.defaults.model
      : params.config.agents?.defaults?.model?.primary;
  const providerModelDefault = Array.isArray(existingProvider?.models)
    ? existingProvider?.models?.[0]?.id
    : undefined;
  const modelDefault = configuredRaw?.startsWith("lmstudio/")
    ? configuredRaw.replace(/^lmstudio\//, "")
    : providerModelDefault;

  const modelInput = await params.prompter.text({
    message: "LM Studio model (vendor/model)",
    initialValue: modelDefault,
    placeholder: "openai/gpt-oss-20b",
    validate: (value) =>
      normalizeLmStudioModelId(String(value ?? ""))
        ? undefined
        : "Use vendor/model (e.g. openai/gpt-oss-20b)",
  });
  const modelId = normalizeLmStudioModelId(String(modelInput)) as string;
  const modelRef = `lmstudio/${modelId}`;

  let nextConfig: OpenClawConfig = {
    ...params.config,
    models: {
      mode: params.config.models?.mode ?? "merge",
      providers: {
        ...params.config.models?.providers,
        lmstudio: {
          ...(existingProvider ? { ...existingProvider } : {}),
          baseUrl: normalizedBaseUrl,
          apiKey: existingProvider?.apiKey ?? "lmstudio",
          api: existingProvider?.api ?? DEFAULT_LMSTUDIO_API,
          models: Array.isArray(existingProvider?.models) ? existingProvider.models : [],
        },
      },
    },
  };

  nextConfig = upsertLmStudioProviderModel(nextConfig, modelId);
  if (params.setDefaultModel) {
    nextConfig = applyPrimaryModel(nextConfig, modelRef);
    await params.prompter.note(`Default model set to ${modelRef}.`, "Model configured");
    return { config: nextConfig, agentModelOverride: params.agentId ? modelRef : undefined };
  }
  return { config: nextConfig };
}
