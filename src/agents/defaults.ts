// Defaults for agent metadata when upstream does not supply them.
// Model id uses a pinned inexpensive OpenRouter model for muscle work.
export const DEFAULT_PROVIDER = "openrouter";
export const DEFAULT_MODEL = "moonshotai/kimi-k2";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 200_000;
