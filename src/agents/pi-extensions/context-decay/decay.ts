import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextDecayConfig } from "../../../config/types.agent-defaults.js";
import type { SummaryStore } from "../../context-decay/summary-store.js";
import { computeTurnAges } from "../../context-decay/turn-ages.js";
import { repairToolUseResultPairing } from "../../session-transcript-repair.js";

function isEnabled(value: number | undefined | null): value is number {
  return typeof value === "number" && value >= 1;
}

/**
 * Apply graduated context decay to messages.
 * Processing order:
 * 1. Strip thinking blocks from old assistant messages
 * 2. Apply pre-computed summaries for old tool results
 * 3. Strip tool results past the strip threshold
 * 4. Apply maxContextMessages hard cap
 * 5. Repair tool use/result pairing
 */
export function applyContextDecay(params: {
  messages: AgentMessage[];
  config: ContextDecayConfig;
  summaryStore: SummaryStore;
}): AgentMessage[] {
  const { messages, config, summaryStore } = params;

  if (messages.length === 0) {
    return messages;
  }

  // Check if any decay is actually enabled
  const hasStripThinking = isEnabled(config.stripThinkingAfterTurns);
  const hasSummarize = isEnabled(config.summarizeToolResultsAfterTurns);
  const hasStrip = isEnabled(config.stripToolResultsAfterTurns);
  const hasMaxMessages = isEnabled(config.maxContextMessages);

  if (!hasStripThinking && !hasSummarize && !hasStrip && !hasMaxMessages) {
    return messages;
  }

  // Validate graduated decay: summarize should fire before strip
  if (hasSummarize && hasStrip) {
    if (config.summarizeToolResultsAfterTurns! >= config.stripToolResultsAfterTurns!) {
      // Misconfigured: summarize threshold >= strip threshold.
      // Summarize is effectively skipped by the per-message guard below (line ~97).
    }
  }

  const turnAges = computeTurnAges(messages);
  let changed = false;
  let result = messages.map((msg, idx) => {
    const age = turnAges.get(idx) ?? 0;
    let mutated = false;
    let current = msg;

    // 1. Strip thinking blocks from old assistant messages
    if (
      hasStripThinking &&
      current.role === "assistant" &&
      age >= config.stripThinkingAfterTurns!
    ) {
      if (Array.isArray(current.content)) {
        const filtered = current.content.filter(
          (block: unknown) => (block as Record<string, unknown>)?.type !== "thinking",
        );
        if (filtered.length !== current.content.length) {
          current = { ...current, content: filtered };
          mutated = true;
        }
      }
    }

    // 2. Apply pre-computed summaries for old tool results
    if (
      hasSummarize &&
      current.role === "toolResult" &&
      age >= config.summarizeToolResultsAfterTurns! &&
      summaryStore[idx]
    ) {
      // Only apply summary if we're not past the strip threshold
      const skipSummarize = hasStrip && age >= config.stripToolResultsAfterTurns!;
      if (!skipSummarize) {
        const entry = summaryStore[idx];
        current = {
          ...current,
          content: [{ type: "text", text: `[Summarized] ${entry.summary}` }],
        } as AgentMessage;
        mutated = true;
      }
    }

    // 3. Strip tool results past the strip threshold
    if (hasStrip && current.role === "toolResult" && age >= config.stripToolResultsAfterTurns!) {
      current = {
        ...current,
        content: [
          {
            type: "text",
            text: `[Tool result removed — aged past ${config.stripToolResultsAfterTurns} turns]`,
          },
        ],
      } as AgentMessage;
      mutated = true;
    }

    if (mutated) {
      changed = true;
    }
    return current;
  });

  // 4. Apply maxContextMessages hard cap
  let truncated = false;
  if (hasMaxMessages && result.length > config.maxContextMessages!) {
    result = result.slice(result.length - config.maxContextMessages!);
    changed = true;
    truncated = true;
  }

  if (!changed) {
    return messages;
  }

  // 5. Repair tool use/result pairing after message truncation.
  //    Only needed when maxContextMessages dropped messages from the front,
  //    which can orphan tool_use or toolResult entries.
  if (truncated) {
    result = repairToolUseResultPairing(result).messages;
  }

  return result;
}
