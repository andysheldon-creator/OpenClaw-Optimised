import type { ModelDefinitionConfig } from "../config/types.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 8192;

// Claude model specifications
const CLAUDE_OPUS_46_CONTEXT = 1_000_000; // 1M tokens (beta)
const CLAUDE_OPUS_46_MAX_TOKENS = 128_000;
const CLAUDE_OPUS_45_CONTEXT = 200_000;
const CLAUDE_OPUS_45_MAX_TOKENS = 32_000;
const CLAUDE_SONNET_CONTEXT = 200_000;
const CLAUDE_SONNET_MAX_TOKENS = 64_000;
const CLAUDE_HAIKU_CONTEXT = 200_000;
const CLAUDE_HAIKU_MAX_TOKENS = 8192;

// Copilot model ids vary by plan/org and can change.
// We keep this list intentionally broad; if a model isn't available Copilot will
// return an error and users can remove it from their config.
const DEFAULT_MODEL_IDS = [
  // Claude models (Anthropic via Copilot)
  "claude-opus-4.6",
  "claude-opus-4.5",
  "claude-sonnet-4.5",
  "claude-sonnet-4",
  "claude-haiku-4.5",
  // OpenAI models
  "gpt-4o",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o1",
  "o1-mini",
  "o3-mini",
  // GPT-5 models
  "gpt-5",
  "gpt-5-mini",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.1-codex",
  "gpt-5.2-codex",
  // Gemini models
  "gemini-2.5-pro",
] as const;

type ClaudeModelSpec = { contextWindow: number; maxTokens: number };

function getClaudeModelSpec(modelId: string): ClaudeModelSpec | null {
  const id = modelId.toLowerCase();
  if (id.startsWith("claude-opus-4.6") || id.startsWith("claude-opus-46")) {
    return { contextWindow: CLAUDE_OPUS_46_CONTEXT, maxTokens: CLAUDE_OPUS_46_MAX_TOKENS };
  }
  if (id.startsWith("claude-opus")) {
    return { contextWindow: CLAUDE_OPUS_45_CONTEXT, maxTokens: CLAUDE_OPUS_45_MAX_TOKENS };
  }
  if (id.startsWith("claude-sonnet")) {
    return { contextWindow: CLAUDE_SONNET_CONTEXT, maxTokens: CLAUDE_SONNET_MAX_TOKENS };
  }
  if (id.startsWith("claude-haiku")) {
    return { contextWindow: CLAUDE_HAIKU_CONTEXT, maxTokens: CLAUDE_HAIKU_MAX_TOKENS };
  }
  return null;
}

export function getDefaultCopilotModelIds(): string[] {
  return [...DEFAULT_MODEL_IDS];
}

export function buildCopilotModelDefinition(modelId: string): ModelDefinitionConfig {
  const id = modelId.trim();
  if (!id) {
    throw new Error("Model id required");
  }
  
  const claudeSpec = getClaudeModelSpec(id);
  
  return {
    id,
    name: id,
    // pi-coding-agent's registry schema doesn't know about a "github-copilot" API.
    // We use OpenAI-compatible responses API, while keeping the provider id as
    // "github-copilot" (pi-ai uses that to attach Copilot-specific headers).
    api: "openai-responses",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: claudeSpec?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: claudeSpec?.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
}
