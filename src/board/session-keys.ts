/**
 * Board of Directors — Session Key Resolution
 *
 * Derives board-aware session keys so each agent maintains its own
 * conversation context. Backward-compatible: when board is disabled,
 * keys are unchanged.
 */

import type { BoardAgentRole } from "./types.js";

// ── Session Key Derivation ───────────────────────────────────────────────────

/**
 * Derive a board-specific session key for an agent.
 *
 * Format:
 *   Direct chat:  "board:<role>"          (e.g., "board:finance")
 *   Group chat:   "board:<role>:<groupKey>" (e.g., "board:finance:g-my-group")
 *
 * The "general" role in a direct chat maps to the main session key for
 * backward compatibility — the generalist agent keeps its existing session.
 */
export function boardSessionKey(
  baseKey: string,
  agentRole: BoardAgentRole,
): string {
  // General agent in direct chat keeps the original session key
  const isGroup =
    baseKey.startsWith("group:") ||
    baseKey.includes(":group:") ||
    baseKey.includes(":channel:") ||
    baseKey.startsWith("g-");

  if (agentRole === "general" && !isGroup) {
    return baseKey;
  }

  if (isGroup) {
    return `board:${agentRole}:${baseKey}`;
  }

  return `board:${agentRole}`;
}

/**
 * Extract the agent role from a board session key.
 * Returns undefined if the key is not a board session key.
 */
export function extractRoleFromSessionKey(
  key: string,
): BoardAgentRole | undefined {
  const match = key.match(/^board:([a-z]+)/);
  if (!match) return undefined;
  const role = match[1];
  const validRoles: string[] = [
    "general",
    "research",
    "content",
    "finance",
    "strategy",
    "critic",
  ];
  return validRoles.includes(role) ? (role as BoardAgentRole) : undefined;
}

/**
 * Check if a session key belongs to the board system.
 */
export function isBoardSessionKey(key: string): boolean {
  return key.startsWith("board:");
}
