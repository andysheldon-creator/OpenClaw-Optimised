/**
 * Message importance scoring for context compaction.
 *
 * Assigns 0-100 importance scores to messages for weighted retention
 * during context window pruning. Higher = more important to keep.
 */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ImportanceScore = {
  score: number;
  role: MessageRole;
  recencyBonus: number;
  baseScore: number;
};

const BASE_SCORES: Record<MessageRole, number> = {
  system: 100,
  user: 80,
  assistant: 60,
  tool: 40,
};

const _RECENCY_DECAY_RATE = 0.02; // lose 2 points per position from end

/**
 * Compute importance score for a message.
 *
 * @param role - Message role
 * @param positionFromEnd - 0 = most recent, higher = older
 * @param totalMessages - Total messages in history
 */
export function computeImportance(
  role: MessageRole,
  positionFromEnd: number,
  totalMessages: number,
): ImportanceScore {
  const baseScore = BASE_SCORES[role] ?? 40;

  // Recency bonus: recent messages get up to 20 extra points, decaying with age
  const maxRecencyBonus = 20;
  const normalizedPosition = totalMessages > 1 ? positionFromEnd / (totalMessages - 1) : 0;
  const recencyBonus = Math.round(maxRecencyBonus * (1 - normalizedPosition));

  const score = Math.min(100, Math.max(0, baseScore + recencyBonus));

  return { score, role, recencyBonus, baseScore };
}

/**
 * Score all messages and return indices sorted by importance (ascending = least important first).
 */
export function rankMessagesByImportance(
  messages: Array<{ role?: string }>,
): Array<{ index: number; score: ImportanceScore }> {
  const total = messages.length;
  const ranked = messages.map((msg, index) => {
    const role = normalizeRole(msg.role);
    const positionFromEnd = total - 1 - index;
    return { index, score: computeImportance(role, positionFromEnd, total) };
  });

  // Sort ascending by score (least important first for pruning)
  return ranked.toSorted((a, b) => a.score.score - b.score.score);
}

function normalizeRole(role?: string): MessageRole {
  if (role === "system" || role === "user" || role === "assistant" || role === "tool") {
    return role;
  }
  return "tool"; // default to lowest priority
}

export type PruneByImportanceResult = {
  keptIndices: number[];
  droppedIndices: number[];
  droppedByRole: Record<string, number>;
  droppedImportantMessages: number;
};

const IMPORTANT_THRESHOLD = 70;

/**
 * Select messages to drop based on importance scores until under budget.
 *
 * @param messages - Messages with estimated token counts
 * @param budgetTokens - Maximum tokens to keep
 */
export function selectDropsByImportance(
  messages: Array<{ role?: string; tokenEstimate: number }>,
  budgetTokens: number,
): PruneByImportanceResult {
  const totalTokens = messages.reduce((sum, m) => sum + m.tokenEstimate, 0);

  if (totalTokens <= budgetTokens) {
    return {
      keptIndices: messages.map((_, i) => i),
      droppedIndices: [],
      droppedByRole: {},
      droppedImportantMessages: 0,
    };
  }

  const ranked = rankMessagesByImportance(messages);
  const droppedIndices: number[] = [];
  const droppedByRole: Record<string, number> = {};
  let droppedImportantMessages = 0;
  let currentTokens = totalTokens;

  for (const { index, score } of ranked) {
    if (currentTokens <= budgetTokens) {
      break;
    }

    // Never drop system messages
    if (score.role === "system") {
      continue;
    }

    const tokens = messages[index].tokenEstimate;
    currentTokens -= tokens;
    droppedIndices.push(index);
    droppedByRole[score.role] = (droppedByRole[score.role] ?? 0) + 1;

    if (score.score >= IMPORTANT_THRESHOLD) {
      droppedImportantMessages += 1;
    }
  }

  const droppedSet = new Set(droppedIndices);
  const keptIndices = messages.map((_, i) => i).filter((i) => !droppedSet.has(i));

  return { keptIndices, droppedIndices, droppedByRole, droppedImportantMessages };
}
