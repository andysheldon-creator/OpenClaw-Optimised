export type AutoCompactionRetryHookResult =
  | { action: "proceed" }
  | { action: "proceed"; systemPrompt: string }
  | { action: "cancel"; errorMessage: string };

export type AutoCompactionRetryHookContextLike = {
  estimates: {
    messageTokens: number;
    systemPromptTokens: number;
    totalTokens: number;
    tokenBudget: number;
    overheadTokensEstimate?: number;
    overBy: number;
  };
};

type LoggerLike = {
  warn: (message: string) => void;
};

export function createAutoCompactionRetryHook(params: {
  getRetrySystemPrompt: () => string;
  onDowngradeSystemPrompt: () => void;
  logger: LoggerLike;
  logPrefix: string;
}): (ctx: AutoCompactionRetryHookContextLike) => AutoCompactionRetryHookResult {
  const DEFAULT_OVERHEAD_TOKENS_ESTIMATE = 512;

  let cachedRetryPrompt: { text: string; tokens: number } | null = null;
  const getRetryPrompt = () => {
    if (cachedRetryPrompt) {
      return cachedRetryPrompt;
    }
    const retrySystemPrompt = params.getRetrySystemPrompt().trim();
    cachedRetryPrompt = {
      text: retrySystemPrompt,
      tokens: Math.ceil(retrySystemPrompt.length / 4),
    };
    return cachedRetryPrompt;
  };

  const cancelMessage =
    "Auto-compaction succeeded, but retry would still overflow due to system prompt size. " +
    "Try a larger-context model or reduce injected workspace files.";

  return (ctx) => {
    const overheadTokensEstimate =
      typeof ctx.estimates.overheadTokensEstimate === "number"
        ? ctx.estimates.overheadTokensEstimate
        : DEFAULT_OVERHEAD_TOKENS_ESTIMATE;
    const safeBudget = Math.max(0, ctx.estimates.tokenBudget - overheadTokensEstimate);

    if (ctx.estimates.totalTokens <= safeBudget) {
      return { action: "proceed" };
    }

    const retryPrompt = getRetryPrompt();
    const totalSlim = ctx.estimates.messageTokens + retryPrompt.tokens;
    if (totalSlim <= safeBudget) {
      try {
        params.logger.warn(
          `${params.logPrefix} auto-compaction retry prompt downgraded: ` +
            `overBy=${ctx.estimates.overBy} tokenBudget=${ctx.estimates.tokenBudget} ` +
            `messageTokens=${ctx.estimates.messageTokens} ` +
            `systemPromptTokens=${ctx.estimates.systemPromptTokens} ` +
            `retrySystemPromptTokens=${retryPrompt.tokens}`,
        );
      } catch {
        // Best-effort logging.
      }
      try {
        params.onDowngradeSystemPrompt();
      } catch {
        // Best-effort side effect.
      }
      return { action: "proceed", systemPrompt: retryPrompt.text };
    }

    try {
      params.logger.warn(
        `${params.logPrefix} auto-compaction retry blocked: ` +
          `stillOverBy=${Math.max(0, totalSlim - safeBudget)} ` +
          `tokenBudget=${ctx.estimates.tokenBudget} messageTokens=${ctx.estimates.messageTokens} ` +
          `retrySystemPromptTokens=${retryPrompt.tokens}`,
      );
    } catch {
      // Best-effort logging.
    }
    return { action: "cancel", errorMessage: cancelMessage };
  };
}
