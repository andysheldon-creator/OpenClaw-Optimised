import type { ModelDefinitionConfig } from "../config/types.js";

export const ASKSAGE_BASE_URL = "https://api.asksage.ai/server/anthropic/v1/messages";
export const ASKSAGE_DEFAULT_MODEL_ID = "claude-4-sonnet";
export const ASKSAGE_DEFAULT_MODEL_REF = `asksage/${ASKSAGE_DEFAULT_MODEL_ID}`;

// Ask Sage uses per-request pricing that varies by underlying model.
// Set to 0 as costs vary by model and account type.
export const ASKSAGE_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Complete catalog of Ask Sage models.
 *
 * Ask Sage provides enterprise AI access through multiple providers:
 * - AWS Bedrock (Government cloud models)
 */
export const ASKSAGE_MODEL_CATALOG = [
  // ============================================
  // ANTHROPIC CLAUDE MODELS
  // ============================================

  // Google-hosted Claude models
  {
    id: "google-claude-4-sonnet",
    name: "Claude 4 Sonnet (Google Cloud)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "google-claude-4-opus",
    name: "Claude 4 Opus (Google Cloud)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "google-claude-45-haiku",
    name: "Claude 4.5 Haiku (Google Cloud)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "google-claude-45-sonnet",
    name: "Claude 4.5 Sonnet (Google Cloud)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "google-claude-45-opus",
    name: "Claude 4.5 Opus (Google Cloud)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },

  // AWS Bedrock Claude models (Government)
  {
    id: "aws-bedrock-claude-35-sonnet-gov",
    name: "Claude 3.5 Sonnet (AWS Gov)",
    reasoning: false,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "aws-bedrock-claude-37-sonnet-gov",
    name: "Claude 3.7 Sonnet (AWS Gov)",
    reasoning: false,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "aws-bedrock-claude-45-sonnet-gov",
    name: "Claude 4.5 Sonnet (AWS Gov)",
    reasoning: true,
    input: ["text"],
    contextWindow: 200000,
    maxTokens: 8192,
  }
]

export type AskSageCatalogEntry = (typeof ASKSAGE_MODEL_CATALOG)[number];

/**
 * Build a ModelDefinitionConfig from an Ask Sage catalog entry.
 */
export function buildAskSageModelDefinition(entry: AskSageCatalogEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input] as ("text")[],
    cost: ASKSAGE_DEFAULT_COST,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}