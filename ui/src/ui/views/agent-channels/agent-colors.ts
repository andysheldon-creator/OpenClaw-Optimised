/**
 * Color palette for agent identification in multi-agent chat UI.
 * Each agent gets a consistent color for visual distinction.
 */

export const AGENT_COLORS = [
  "#ea580c", // Orange
  "#0ea5e9", // Sky blue
  "#8b5cf6", // Violet
  "#22c55e", // Green
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#ef4444", // Red
  "#84cc16", // Lime
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#f97316", // Orange (darker)
] as const;

export type AgentColor = (typeof AGENT_COLORS)[number];

// Cache for agent -> color mappings
const colorAssignments = new Map<string, AgentColor>();
let nextColorIndex = 0;

/**
 * Get a consistent color for an agent.
 * Same agent always gets the same color within a session.
 */
export function getAgentColor(agentId: string): AgentColor {
  const existing = colorAssignments.get(agentId);
  if (existing) {
    return existing;
  }

  const color = AGENT_COLORS[nextColorIndex % AGENT_COLORS.length];
  colorAssignments.set(agentId, color);
  nextColorIndex++;

  return color;
}

/**
 * Get a lighter shade of an agent's color (for backgrounds).
 */
export function getAgentColorLight(agentId: string): string {
  const color = getAgentColor(agentId);
  return `${color}20`; // 20 = 12.5% opacity in hex
}

/**
 * Get status indicator color.
 */
export function getStatusColor(status: "active" | "busy" | "away" | "offline"): string {
  switch (status) {
    case "active":
      return "#22c55e"; // Green
    case "busy":
      return "#ef4444"; // Red
    case "away":
      return "#f59e0b"; // Amber
    case "offline":
      return "#6b7280"; // Gray
    default:
      return "#6b7280";
  }
}

/**
 * Get role badge color.
 */
export function getRoleColor(role: "owner" | "admin" | "member" | "observer"): string {
  switch (role) {
    case "owner":
      return "#fbbf24"; // Gold
    case "admin":
      return "#8b5cf6"; // Purple
    case "member":
      return "#3b82f6"; // Blue
    case "observer":
      return "#6b7280"; // Gray
    default:
      return "#6b7280";
  }
}

/**
 * Get role emoji/icon.
 */
export function getRoleIcon(role: "owner" | "admin" | "member" | "observer"): string {
  switch (role) {
    case "owner":
      return "👑";
    case "admin":
      return "⭐";
    case "member":
      return "";
    case "observer":
      return "👁";
    default:
      return "";
  }
}

/**
 * Get listening mode icon.
 */
export function getListeningModeIcon(
  mode: "active" | "mention-only" | "observer" | "coordinator",
): string {
  switch (mode) {
    case "active":
      return "🟢";
    case "mention-only":
      return "🔔";
    case "observer":
      return "👁";
    case "coordinator":
      return "🎯";
    default:
      return "";
  }
}

/**
 * Reset color assignments (for testing).
 */
export function resetColorAssignments(): void {
  colorAssignments.clear();
  nextColorIndex = 0;
}

/**
 * Pre-assign colors for a list of agents.
 * Useful when loading a channel to ensure consistent colors.
 */
export function preAssignColors(agentIds: string[]): void {
  for (const agentId of agentIds) {
    getAgentColor(agentId);
  }
}
