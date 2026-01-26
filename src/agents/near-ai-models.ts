import type { ModelDefinitionConfig } from "../config/types.js";

export const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
export const NEAR_AI_DEFAULT_MODEL_ID = "zai-org/GLM-4.7";
export const NEAR_AI_DEFAULT_MODEL_REF = `near-ai/${NEAR_AI_DEFAULT_MODEL_ID}`;

// NEAR AI uses credit-based pricing (per million tokens).
export const NEAR_AI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Static catalog of NEAR AI models.
 *
 * NEAR AI provides privacy-focused inference using:
 * - Intel TDX (Trust Domain Extensions) for confidential VMs
 * - NVIDIA TEE for GPU-level isolation
 * - Cryptographic signing of all AI outputs inside TEE
 *
 * All inference is private by default - prompts/responses are not logged.
 */
export const NEAR_AI_MODEL_CATALOG = [
  {
    id: "deepseek-ai/DeepSeek-V3.1",
    name: "DeepSeek V3.1",
    reasoning: false,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 1.05, output: 3.1, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    reasoning: true,
    input: ["text"],
    contextWindow: 131000,
    maxTokens: 8192,
    cost: { input: 0.15, output: 0.55, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "Qwen/Qwen3-30B-A3B-Instruct-2507",
    name: "Qwen3 30B Instruct",
    reasoning: false,
    input: ["text"],
    contextWindow: 262144,
    maxTokens: 8192,
    cost: { input: 0.15, output: 0.55, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "zai-org/GLM-4.7",
    name: "GLM 4.7",
    reasoning: false,
    input: ["text"],
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.85, output: 3.3, cacheRead: 0, cacheWrite: 0 },
  },
] as const;

export type NearAiCatalogEntry = (typeof NEAR_AI_MODEL_CATALOG)[number];

/**
 * Build a ModelDefinitionConfig from a NEAR AI catalog entry.
 */
export function buildNearAiModelDefinition(entry: NearAiCatalogEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input],
    cost: entry.cost,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}
