import type { AgentMessage } from "@mariozechner/pi-agent-core";

/**
 * Count turns backward from end. A "turn" is defined by user messages as boundaries.
 * Returns a Map from message index to the turn age (0 = current turn, 1 = previous, etc.)
 */
export function computeTurnAges(messages: AgentMessage[]): Map<number, number> {
  const ages = new Map<number, number>();
  let turnAge = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    ages.set(i, turnAge);
    if (messages[i].role === "user" && i > 0) {
      turnAge++;
    }
  }
  return ages;
}
