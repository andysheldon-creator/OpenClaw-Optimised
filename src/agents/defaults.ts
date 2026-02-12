// Defaults for agent metadata when upstream does not supply them.
// Model id uses pi-ai's built-in Anthropic catalog.
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-4-5";
// Context window: Opus 4.5 supports ~200k tokens (per pi-ai models.generated.ts).
export const DEFAULT_CONTEXT_TOKENS = 200_000;

/**
 * Maximum number of recent messages to send to the LLM on each turn.
 * Keeps only the last N messages from the session history, dramatically
 * reducing input token count (and therefore cost) while preserving
 * enough context for coherent conversation.
 *
 * Set to 0 or Infinity to disable windowing (send full history).
 * Configurable via `agent.maxHistoryWindow` in clawdis.json.
 */
export const DEFAULT_MAX_HISTORY_WINDOW = 10;
