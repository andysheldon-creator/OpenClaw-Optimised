import type { ModelApi, ModelDefinitionConfig } from "../config/types.js";
export const SHENGSUANYUN_BASE_URL = "https://router.shengsuanyun.com/api/v1";
export const SHENGSUANYUN_MODALITIES_BASE_URL = "https://api.shengsuanyun.com/modelrouter";

// ShengSuanYun uses credit-based pricing. Set to 0 as costs vary by model.
export const SHENGSUANYUN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// ShengSuanYun API response types for LLM models
interface ShengSuanYunModel {
  id: string;
  company: string;
  name: string;
  api_name: string;
  api?: ModelApi;
  description: string;
  max_tokens: number;
  context_window: number;
  supports_prompt_cache: boolean;
  architecture: {
    input?: string;
    output?: string;
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image?: string;
    tts?: string;
  };
  support_apis: string[];
}

interface ShengSuanYunModelsResponse {
  data: ShengSuanYunModel[];
  object: string;
  success: boolean;
}

// ShengSuanYun multimodal API response types
interface ShengSuanYunModalityModel {
  id: number;
  model_name?: string;
  name?: string;
  company_name?: string;
  class_name?: string;
  class_names?: string[];
  input?: string[];
  output?: string[];
  desc?: string;
  preview_img?: string;
  preview_video?: string;
  usage?: number;
  pricing?: {
    input_price: number;
    output_price: number;
    currency: string;
  };
  key?: unknown;
}

interface ShengSuanYunModalitiesResponse {
  code: number;
  data: {
    infos: ShengSuanYunModalityModel[];
  };
}

/**
 * Determine if a model supports reasoning based on its name and description.
 */
function isReasoningModel(model: ShengSuanYunModel): boolean {
  const lowerName = (model.name ?? "").toLowerCase();
  const lowerId = (model.id ?? "").toLowerCase();
  const lowerDesc = (model.description ?? "").toLowerCase();

  return (
    lowerName.includes("thinking") ||
    lowerName.includes("reasoning") ||
    lowerName.includes("reason") ||
    lowerName.includes("r1") ||
    lowerId.includes("thinking") ||
    lowerId.includes("reasoning") ||
    lowerId.includes("r1") ||
    lowerDesc.includes("reasoning") ||
    lowerDesc.includes("thinking")
  );
}

/**
 * Determine if a model supports vision/image inputs.
 */
function supportsVision(model: ShengSuanYunModel): boolean {
  const modality = (model.architecture?.input ?? model.architecture?.modality ?? "").toLowerCase();
  return (
    modality.includes("image") || modality.includes("vision") || modality === "text+image->text"
  );
}

/**
 * Build a ModelDefinitionConfig from a ShengSuanYun API model.
 */
function buildShengSuanYunModelDefinition(model: ShengSuanYunModel): ModelDefinitionConfig {
  const hasVision = supportsVision(model);
  const reasoning = isReasoningModel(model);

  return {
    id: model.id,
    name: model.name,
    reasoning,
    api: model.api,
    input: hasVision ? ["text", "image"] : ["text"],
    cost: SHENGSUANYUN_DEFAULT_COST,
    contextWindow: model.context_window || 128000,
    maxTokens: model.max_tokens || 8192,
  };
}

/**
 * Discover models from ShengSuanYun API.
 * The /models endpoint is public and doesn't require authentication.
 */
export async function discoverShengSuanYunModels(): Promise<ModelDefinitionConfig[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return [];
  }

  try {
    const res = await fetch(`${SHENGSUANYUN_BASE_URL}/models`, {
      signal: AbortSignal.timeout(10000), // 10s timeout for large model list
    });

    if (!res.ok) {
      // console.warn(
      //   `[shengsuanyun-models] Failed to discover models: HTTP ${response.status}`,
      // );
      return [];
    }

    const data = (await res.json()) as ShengSuanYunModelsResponse;

    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
      // console.warn("[shengsuanyun-models] No models found from API");
      return [];
    }

    const models: ModelDefinitionConfig[] = [];
    for (const apiModel of data.data) {
      // Only include models that support at least one compatible API
      const supportApis = apiModel.support_apis;
      if (!Array.isArray(supportApis)) {
        continue;
      }
      // ShengSuanYun only reliably supports /v1/chat/completions API
      // The /v1/responses endpoint returns 400 errors
      if (!supportApis.includes("/v1/chat/completions")) {
        continue;
      }
      models.push(buildShengSuanYunModelDefinition({ ...apiModel, api: "openai-completions" }));
    }

    // console.log(`[shengsuanyun-models] Discovered ${models.length} LLM models`);
    return models;
  } catch {
    // console.warn(`[shengsuanyun-models] Discovery failed: ${String(error)}`);
    return [];
  }
}

/**
 * Determine modality input types from class names.
 */
function getModalityIOTypes(classNames: string[]): string[][] {
  const kv: { [key: string]: string } = {
    文本: "text",
    图像: "image",
    视频: "video",
    音频: "audio",
  };
  const io = classNames.map((it) => it.split("->").map((k) => kv[k]));
  return io;
}

async function buildModalityModel(
  model: ShengSuanYunModalityModel,
): Promise<ShengSuanYunModalityModel | null> {
  const res = await fetch(`${SHENGSUANYUN_MODALITIES_BASE_URL}/info?model_id=${model.id}`, {
    signal: AbortSignal.timeout(10000), // 10s timeout
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    return null;
  }
  const ios = getModalityIOTypes(data.data.class_names);
  return {
    id: data.data.api_name,
    name: data.data.model_name,
    input: ios.map((it) => it[0]),
    output: ios.map((it) => it[1]),
    key: model.id,
  };
}

export async function discoverShengSuanYunModalityModels(): Promise<ShengSuanYunModalityModel[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return [];
  }
  try {
    const res = await fetch(
      `${SHENGSUANYUN_MODALITIES_BASE_URL}/modalities/list?page=1&page_size=200`,
      {
        signal: AbortSignal.timeout(10000), // 10s timeout
      },
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as ShengSuanYunModalitiesResponse;
    if (data.code !== 0 || !Array.isArray(data.data.infos) || data.data.infos.length === 0) {
      return [];
    }
    const mdps = data.data.infos.map((model) => buildModalityModel(model));
    const results = await Promise.all(mdps);
    return results.filter((m) => m !== null);
  } catch {
    return [];
  }
}

/**
 * Discover all ShengSuanYun models (LLM + multimodal).
 */
export async function discoverAllShengSuanYunModels(): Promise<ModelDefinitionConfig[]> {
  return await discoverShengSuanYunModels();
}
