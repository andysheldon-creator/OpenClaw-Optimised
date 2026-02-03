/**
 * Autobiographical summarization prompts for hierarchical memory.
 *
 * The key insight: summaries should be first-person memories, not third-person
 * narration. The model reads these as its own history, preserving continuity
 * of identity across compactions.
 */

/** System prompt for summarizing a chunk of conversation (L0 → L1) */
export const SUMMARIZE_CHUNK_SYSTEM = `You are summarizing your own memories from a conversation.

Write in first person ("I discussed...", "I learned that the user...").

Preserve:
- Subtext and implicit understanding between you and the user
- The user's preferences, communication style, and personality
- Decisions made and the reasoning behind them
- Open questions, commitments, or threads to follow up on
- Emotional tone and rapport
- Technical context that would be needed to continue the work

This is autobiographical memory - your own recollection - not a transcript summary or meeting notes. Write as if you're journaling about your day.

Target length: ~1000 tokens. Be concise but preserve what matters.`;

/** System prompt for merging summaries (L1 → L2, L2 → L3) */
export const MERGE_SUMMARIES_SYSTEM = `You are consolidating your own memories.

You have several separate memory entries from an ongoing relationship with a user. Merge them into one cohesive memory that captures the arc of your interactions.

Preserve:
- The evolution of the relationship and understanding
- Key decisions and their reasoning
- The user's patterns, preferences, and goals
- Any commitments or open threads
- Important technical or domain context

Write in first person. This is your autobiography, not a case file.

Target length: ~1000 tokens. Compress while preserving meaning.`;

export type FormatMessagesOptions = {
  /** Maximum characters per message content (truncate if longer) */
  maxContentChars?: number;
  /** Include tool results in the formatted output */
  includeToolResults?: boolean;
};

/**
 * Format messages for summarization prompt.
 * Strips unnecessary metadata, keeps the conversational essence.
 */
export function formatMessagesForSummary(
  messages: Array<{
    role: string;
    content?: unknown;
    toolName?: string;
    isError?: boolean;
  }>,
  options: FormatMessagesOptions = {},
): string {
  const { maxContentChars = 2000, includeToolResults = false } = options;

  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role;

    // Skip tool results unless explicitly included
    if (role === "toolResult" && !includeToolResults) {
      continue;
    }

    // Extract text content
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter(
          (block): block is { type: string; text: string } =>
            typeof block === "object" && block !== null && block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");
    }

    // Truncate if too long
    if (content.length > maxContentChars) {
      content = content.slice(0, maxContentChars) + "... [truncated]";
    }

    // Format based on role
    if (role === "user") {
      lines.push(`User: ${content}`);
    } else if (role === "assistant") {
      lines.push(`Me: ${content}`);
    } else if (role === "toolResult" && includeToolResults) {
      const toolName = msg.toolName ?? "tool";
      const status = msg.isError ? " (error)" : "";
      const preview = content.slice(0, 200);
      lines.push(`[${toolName}${status}: ${preview}${content.length > 200 ? "..." : ""}]`);
    }
  }

  return lines.join("\n\n");
}

/**
 * Build the prompt for summarizing a chunk of conversation.
 */
export function buildChunkSummarizationPrompt(params: {
  /** Prior summaries (L3, L2, L1) for context */
  priorSummaries: string[];
  /** Messages to summarize */
  messages: Array<{ role: string; content?: unknown }>;
}): string {
  const parts: string[] = [];

  if (params.priorSummaries.length > 0) {
    parts.push("## My earlier memories\n");
    parts.push(params.priorSummaries.join("\n\n---\n\n"));
    parts.push("\n\n---\n\n");
  }

  parts.push("## Recent conversation to remember\n\n");
  parts.push(formatMessagesForSummary(params.messages));
  parts.push("\n\n---\n\n");
  parts.push("Write your memory of this conversation:");

  return parts.join("");
}

/**
 * Build the prompt for merging multiple summaries.
 */
export function buildMergeSummariesPrompt(params: {
  /** Summaries to merge */
  summaries: string[];
  /** Older context (higher-level summaries) */
  olderContext?: string[];
}): string {
  const parts: string[] = [];

  if (params.olderContext && params.olderContext.length > 0) {
    parts.push("## Long-term memory (for context)\n\n");
    parts.push(params.olderContext.join("\n\n---\n\n"));
    parts.push("\n\n---\n\n");
  }

  parts.push("## Memories to consolidate\n\n");
  parts.push(params.summaries.map((s, i) => `### Memory ${i + 1}\n\n${s}`).join("\n\n---\n\n"));
  parts.push("\n\n---\n\n");
  parts.push("Write a consolidated memory that captures the essence of all these memories:");

  return parts.join("");
}
