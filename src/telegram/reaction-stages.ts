/**
 * Multi-stage reaction system for Telegram messages.
 *
 * Shows processing pipeline progress via emoji reactions that transition
 * through stages: RECEIVED → LLM_PROCESSING → TOOL_USE → DELIVERED / ERROR.
 *
 * Each stage REPLACES the previous reaction (not stacked).
 * All reaction API calls are best-effort — failures never block message processing.
 */

export type ReactionStageEmoji = {
  received: string;
  llmProcessing: string;
  toolUse: string;
  delivered: string;
  error: string;
};

export const DEFAULT_STAGE_EMOJI: ReactionStageEmoji = {
  received: "👀",
  llmProcessing: "🔥",
  toolUse: "⚡",
  delivered: "👍",
  error: "💔",
};

export type ReactionStagesConfig = {
  enabled?: boolean;
  emoji?: Partial<ReactionStageEmoji>;
};

export type ReactionApi = (
  chatId: number | string,
  messageId: number,
  reactions: Array<{ type: "emoji"; emoji: string }>,
) => Promise<unknown>;

export type ReactionTracker = {
  received: () => void;
  llmProcessing: () => void;
  toolUse: () => void;
  delivered: () => void;
  error: () => void;
  clear: () => Promise<void>;
  readonly currentStage: string | null;
  readonly emoji: ReactionStageEmoji;
};

export type CreateReactionTrackerParams = {
  reactionApi: ReactionApi | null;
  chatId: number | string;
  messageId: number;
  emoji?: Partial<ReactionStageEmoji>;
  log?: (msg: string) => void;
};

function resolveEmoji(overrides?: Partial<ReactionStageEmoji>): ReactionStageEmoji {
  if (!overrides) {
    return { ...DEFAULT_STAGE_EMOJI };
  }
  return {
    received: overrides.received ?? DEFAULT_STAGE_EMOJI.received,
    llmProcessing: overrides.llmProcessing ?? DEFAULT_STAGE_EMOJI.llmProcessing,
    toolUse: overrides.toolUse ?? DEFAULT_STAGE_EMOJI.toolUse,
    delivered: overrides.delivered ?? DEFAULT_STAGE_EMOJI.delivered,
    error: overrides.error ?? DEFAULT_STAGE_EMOJI.error,
  };
}

/**
 * Creates a no-op tracker for when the feature is disabled.
 * All methods are safe to call but do nothing.
 */
export function createNoopTracker(): ReactionTracker {
  const emoji = { ...DEFAULT_STAGE_EMOJI };
  return {
    received: () => {},
    llmProcessing: () => {},
    toolUse: () => {},
    delivered: () => {},
    error: () => {},
    clear: async () => {},
    get currentStage() {
      return null;
    },
    emoji,
  };
}

/**
 * Creates a reaction tracker that transitions through processing stages
 * by updating the Telegram message reaction emoji.
 *
 * - Deduplicates: skips if same stage already set
 * - Disposed: after `clear()`, all methods become no-ops
 * - Best-effort: API errors are caught and logged, never thrown
 */
export function createReactionTracker({
  reactionApi,
  chatId,
  messageId,
  emoji: emojiOverrides,
  log,
}: CreateReactionTrackerParams): ReactionTracker {
  if (!reactionApi || !chatId || !messageId) {
    return createNoopTracker();
  }

  const emoji = resolveEmoji(emojiOverrides);
  let currentStage: string | null = null;
  let disposed = false;

  const setStage = (emojiValue: string): void => {
    if (disposed) return;
    if (emojiValue === currentStage) return;
    currentStage = emojiValue;
    // Fire-and-forget: never await, never throw
    void (async () => {
      try {
        await reactionApi(chatId, messageId, [{ type: "emoji", emoji: emojiValue }]);
      } catch (err) {
        log?.(`reaction-stages: failed to set ${emojiValue}: ${String(err)}`);
      }
    })();
  };

  return {
    received: () => setStage(emoji.received),
    llmProcessing: () => setStage(emoji.llmProcessing),
    toolUse: () => setStage(emoji.toolUse),
    delivered: () => setStage(emoji.delivered),
    error: () => setStage(emoji.error),
    clear: async () => {
      disposed = true;
    },
    get currentStage() {
      return currentStage;
    },
    emoji,
  };
}
