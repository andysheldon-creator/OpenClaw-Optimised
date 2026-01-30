/**
 * OpenCode Zen model catalog with dynamic fetching, caching, and static fallback.
 *
 * OpenCode Zen is a $200/month subscription that provides proxy access to multiple
 * AI models (Claude, GPT, Gemini, etc.) through a single API endpoint.
 *
 * API endpoint: https://opencode.ai/zen/v1
 * Auth URL: https://opencode.ai/auth
 */

import crypto from "node:crypto";

import type { ModelApi, ModelDefinitionConfig } from "../config/types.js";

export const OPENCODE_ZEN_API_BASE_URL = "https://opencode.ai/zen/v1";
export const OPENCODE_ZEN_DEFAULT_MODEL = "claude-opus-4-5";
export const OPENCODE_ZEN_DEFAULT_MODEL_REF = `opencode/${OPENCODE_ZEN_DEFAULT_MODEL}`;

export const OPENCODE_ZEN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Static catalog of known OpenCode Zen models with metadata.
 * Serves as fallback when API is unreachable and for enriching
 * API-discovered models with known metadata.
 */
export const OPENCODE_ZEN_STATIC_CATALOG = [
  {
    id: "gpt-5.1-codex",
    name: "GPT-5.1 Codex",
    reasoning: true,
    input: ["text"] as Array<"text" | "image">,
    cost: { input: 1.07, output: 8.5, cacheRead: 0.107, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    reasoning: true,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    reasoning: true,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT-5.1 Codex Mini",
    reasoning: true,
    input: ["text"] as Array<"text" | "image">,
    cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    reasoning: true,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: { input: 1.07, output: 8.5, cacheRead: 0.107, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    reasoning: true,
    input: ["text"] as Array<"text" | "image">,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    reasoning: true,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gpt-5.1-codex-max",
    name: "GPT-5.1 Codex Max",
    reasoning: true,
    input: ["text"] as Array<"text" | "image">,
    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    reasoning: true,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
  },
] as const;

export const OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS: ModelDefinitionConfig[] =
  OPENCODE_ZEN_STATIC_CATALOG.map(buildOpencodeZenModelDefinition);

const OPENCODE_ZEN_CATALOG_BY_ID = new Map<string, OpencodeZenCatalogEntry>(
  OPENCODE_ZEN_STATIC_CATALOG.map((entry) => [entry.id, entry]),
);

export type OpencodeZenCatalogEntry = (typeof OPENCODE_ZEN_STATIC_CATALOG)[number];

/**
 * Build a ModelDefinitionConfig from a catalog entry.
 */
export function buildOpencodeZenModelDefinition(
  entry: OpencodeZenCatalogEntry,
): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    api: resolveOpencodeZenModelApi(entry.id),
    reasoning: entry.reasoning,
    input: [...entry.input],
    cost: entry.cost,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}

/**
 * Model aliases for convenient shortcuts.
 * Users can use "opus" instead of "claude-opus-4-5", etc.
 */
export const OPENCODE_ZEN_MODEL_ALIASES: Record<string, string> = {
  // Claude
  opus: "claude-opus-4-5",
  "opus-4.5": "claude-opus-4-5",
  "opus-4": "claude-opus-4-5",

  // Legacy Claude aliases (OpenCode Zen rotates model catalogs; keep old keys working).
  sonnet: "claude-opus-4-5",
  "sonnet-4": "claude-opus-4-5",
  haiku: "claude-opus-4-5",
  "haiku-3.5": "claude-opus-4-5",

  // GPT-5.x family
  gpt5: "gpt-5.2",
  "gpt-5": "gpt-5.2",
  "gpt-5.1": "gpt-5.1",

  // Legacy GPT aliases (keep old config/docs stable; map to closest current equivalents).
  gpt4: "gpt-5.1",
  "gpt-4": "gpt-5.1",
  "gpt-mini": "gpt-5.1-codex-mini",

  // Legacy O-series aliases (no longer in the Zen catalog; map to a strong default).
  o1: "gpt-5.2",
  o3: "gpt-5.2",
  "o3-mini": "gpt-5.1-codex-mini",

  // Codex family
  codex: "gpt-5.1-codex",
  "codex-mini": "gpt-5.1-codex-mini",
  "codex-max": "gpt-5.1-codex-max",

  // Gemini
  gemini: "gemini-3-pro",
  "gemini-pro": "gemini-3-pro",
  "gemini-3": "gemini-3-pro",
  flash: "gemini-3-flash",
  "gemini-flash": "gemini-3-flash",

  // Legacy Gemini 2.5 aliases (map to the nearest current Gemini tier).
  "gemini-2.5": "gemini-3-pro",
  "gemini-2.5-pro": "gemini-3-pro",
  "gemini-2.5-flash": "gemini-3-flash",

  // GLM (free)
  glm: "glm-4.7",
  "glm-free": "glm-4.7",
};

/**
 * Resolve a model alias to its full model ID.
 * Returns the input if no alias exists.
 */
export function resolveOpencodeZenAlias(modelIdOrAlias: string): string {
  const normalized = modelIdOrAlias.toLowerCase().trim();
  return OPENCODE_ZEN_MODEL_ALIASES[normalized] ?? modelIdOrAlias;
}

/**
 * OpenCode Zen routes models to specific API shapes by family.
 */
export function resolveOpencodeZenModelApi(modelId: string): ModelApi {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("gpt-")) {
    return "openai-responses";
  }
  if (lower.startsWith("claude-") || lower.startsWith("minimax-")) {
    return "anthropic-messages";
  }
  if (lower.startsWith("gemini-")) {
    return "google-generative-ai";
  }
  return "openai-completions";
}

/**
 * Check if a model supports image input.
 * Used as fallback for unknown models from the API.
 */
function supportsImageInput(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes("glm") || lower.includes("minimax")) {
    return false;
  }
  return true;
}

/**
 * Format a model ID into a human-readable name.
 * Used as fallback for unknown models from the API.
 */
function formatModelName(modelId: string): string {
  const catalogEntry = OPENCODE_ZEN_CATALOG_BY_ID.get(modelId);
  if (catalogEntry) {
    return catalogEntry.name;
  }

  return modelId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Response shape from OpenCode Zen /models endpoint.
 * Returns OpenAI-compatible format.
 */
interface ZenModelsResponse {
  data: Array<{
    id: string;
    object: "model";
    created?: number;
    owned_by?: string;
  }>;
}

type OpencodeZenCacheEntry = {
  models: ModelDefinitionConfig[];
  timestamp: number;
};

/**
 * Cache for fetched models (1 hour TTL).
 * Scoped by a hashed API key to avoid cross-key leakage.
 */
const cachedModelsByKey = new Map<string, OpencodeZenCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function resolveCacheKey(apiKey?: string): string {
  if (!apiKey) return "public";
  return `key:${hashApiKey(apiKey)}`;
}

/**
 * Discover models from the OpenCode Zen API.
 * Fetches dynamically and merges with static catalog metadata.
 *
 * @param apiKey - OpenCode Zen API key for authentication (optional for discovery)
 * @returns Array of model definitions, or static fallback on failure
 */
export async function discoverOpencodeZenModels(apiKey?: string): Promise<ModelDefinitionConfig[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS;
  }

  // Return cached models if still valid
  const now = Date.now();
  const cacheKey = resolveCacheKey(apiKey);
  const cachedEntry = cachedModelsByKey.get(cacheKey);
  if (cachedEntry && now - cachedEntry.timestamp < CACHE_TTL_MS) {
    return cachedEntry.models;
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${OPENCODE_ZEN_API_BASE_URL}/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(
        `[opencode-zen] Failed to discover models: HTTP ${response.status}, using static catalog`,
      );
      return OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS;
    }

    const data = (await response.json()) as ZenModelsResponse;

    if (!data.data || !Array.isArray(data.data)) {
      console.warn(
        "[opencode-zen] Invalid response format from /models endpoint, using static catalog",
      );
      return OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS;
    }

    const models: ModelDefinitionConfig[] = [];

    for (const apiModel of data.data) {
      const catalogEntry = OPENCODE_ZEN_CATALOG_BY_ID.get(apiModel.id);

      if (catalogEntry) {
        // Use rich catalog metadata for known models
        models.push(buildOpencodeZenModelDefinition(catalogEntry));
      } else {
        // Create definition for newly discovered models not in catalog
        // This allows new models (like kimi-k2.5-free) to appear automatically
        const hasVision = supportsImageInput(apiModel.id);
        models.push({
          id: apiModel.id,
          name: formatModelName(apiModel.id),
          api: resolveOpencodeZenModelApi(apiModel.id),
          // Treat Zen models as reasoning-capable by default
          reasoning: true,
          input: hasVision ? ["text", "image"] : ["text"],
          cost: OPENCODE_ZEN_DEFAULT_COST,
          contextWindow: 128000,
          maxTokens: 8192,
        });
      }
    }

    // Cache the results
    cachedModelsByKey.set(cacheKey, { models, timestamp: now });

    return models;
  } catch (error) {
    console.warn(`[opencode-zen] Discovery failed: ${String(error)}, using static catalog`);
    return OPENCODE_ZEN_STATIC_MODEL_DEFINITIONS;
  }
}

/**
 * Clear the model cache (useful for testing or forcing refresh).
 */
export async function fetchOpencodeZenModels(apiKey?: string): Promise<ModelDefinitionConfig[]> {
  return discoverOpencodeZenModels(apiKey);
}

/**
 * Clear the model cache (useful for testing or forcing refresh).
 */
export function clearOpencodeZenModelCache(): void {
  cachedModelsByKey.clear();
}
