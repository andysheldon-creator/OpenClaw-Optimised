/**
 * Board of Directors — Personality Loading
 *
 * Loads agent-specific SOUL files from the workspace and builds the
 * system prompt fragment for each board agent.
 */

import fs from "node:fs";
import path from "node:path";

import { resolveAgentDef, resolveAllAgentDefs } from "./agents.js";
import type { BoardAgentRole } from "./types.js";

// ── SOUL File Loading ────────────────────────────────────────────────────────

/**
 * Attempt to load a custom personality file for an agent from the workspace.
 * Falls back to the default embedded personality if no file exists.
 *
 * File lookup order:
 *   1. `<workspace>/board/<role>.soul.md`
 *   2. Default personality from agents.ts
 */
export function loadAgentPersonality(
  role: BoardAgentRole,
  workspaceDir: string,
  configAgents?: Array<{
    role: string;
    soulFile?: string;
    name?: string;
    emoji?: string;
    model?: string;
    thinkingDefault?: string;
    telegramTopicId?: number;
  }>,
): string {
  const agent = resolveAgentDef(role, configAgents);

  // Check for custom soul file path in config
  const configEntry = configAgents?.find((a) => a.role === role);
  const customPath = configEntry?.soulFile?.trim();

  // Try custom path first, then standard location
  const candidates = [
    customPath
      ? path.isAbsolute(customPath)
        ? customPath
        : path.join(workspaceDir, customPath)
      : null,
    path.join(workspaceDir, "board", `${role}.soul.md`),
  ].filter(Boolean) as string[];

  for (const filepath of candidates) {
    try {
      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, "utf-8").trim();
        if (content) return content;
      }
    } catch {
      // Fall through to default
    }
  }

  return agent.personality;
}

// ── System Prompt Fragment ───────────────────────────────────────────────────

/**
 * Build the system prompt fragment for a board agent.
 * This gets injected into the main system prompt via `extraSystemPrompt`.
 */
export function buildBoardSystemPrompt(
  role: BoardAgentRole,
  workspaceDir: string,
  options?: {
    configAgents?: Array<{
      role: string;
      soulFile?: string;
      name?: string;
      emoji?: string;
      model?: string;
      thinkingDefault?: string;
      telegramTopicId?: number;
    }>;
    consultationEnabled?: boolean;
    maxConsultationDepth?: number;
    meetingsEnabled?: boolean;
  },
): string {
  const personality = loadAgentPersonality(
    role,
    workspaceDir,
    options?.configAgents,
  );
  const agent = resolveAgentDef(role, options?.configAgents);
  const allAgents = resolveAllAgentDefs(options?.configAgents);
  const consultEnabled = options?.consultationEnabled ?? true;
  const maxDepth = options?.maxConsultationDepth ?? 2;
  const meetingsEnabled = options?.meetingsEnabled ?? true;

  const lines: string[] = [
    `## Agent Role: ${agent.name} (${agent.title}) ${agent.emoji}`,
    "",
    personality,
    "",
    "## Board of Directors",
    "You are part of a board with these colleagues:",
    "",
  ];

  // List all agents with their roles
  for (const a of allAgents) {
    const isSelf = a.role === role;
    lines.push(
      `- **${a.name}** (${a.title}) ${a.emoji}${isSelf ? " ← You" : ""}`,
    );
  }

  lines.push("");

  // Consultation instructions
  if (consultEnabled) {
    lines.push("## Cross-Agent Consultation");
    lines.push(
      "You can ask other board members for their perspective by including a consultation tag in your reply:",
    );
    lines.push("");
    lines.push("```\n[[consult:<role>]] <question>\n```");
    lines.push("");
    lines.push("For example:");
    lines.push(
      "- `[[consult:finance]] What would this cost to implement over 6 months?`",
    );
    lines.push(
      "- `[[consult:research]] What does the data show about this market segment?`",
    );
    lines.push(
      "- `[[consult:critic]] What are the main risks with this approach?`",
    );
    lines.push("");
    lines.push(
      `Consultations have a maximum depth of ${maxDepth} — meaning a consulted agent can consult another agent, but the chain is limited.`,
    );
    lines.push(
      "Use consultation sparingly — only when another agent's expertise would meaningfully improve your answer.",
    );
    lines.push("");
  }

  // Meeting instructions (for the General agent)
  if (meetingsEnabled && role === "general") {
    lines.push("## Board Meetings");
    lines.push(
      'When the user asks you to "run a board meeting" or "get the board\'s opinion" on a topic:',
    );
    lines.push("");
    lines.push("1. Acknowledge the request and state the topic clearly.");
    lines.push(
      "2. Include a meeting tag to trigger the coordination protocol:",
    );
    lines.push("");
    lines.push("```\n[[board_meeting]] <topic>\n```");
    lines.push("");
    lines.push("For example:");
    lines.push(
      "- `[[board_meeting]] Should we expand into the European market?`",
    );
    lines.push("- `[[board_meeting]] Evaluate our pricing strategy for Q3`");
    lines.push("");
    lines.push(
      "The system will automatically consult all specialists and return their perspectives for you to synthesize.",
    );
    lines.push("");
  }

  // Role-specific routing guidance
  lines.push("## Message Routing");
  if (role === "general") {
    lines.push(
      "You receive all messages that don't target a specific specialist.",
    );
    lines.push("If a question is clearly in another agent's domain, you may:");
    lines.push("- Answer it yourself with a general perspective, OR");
    lines.push("- Consult the relevant specialist for a deeper answer, OR");
    lines.push(
      "- Suggest the user ask the specialist directly (in their topic).",
    );
  } else {
    lines.push(
      `You receive messages that are routed to the ${agent.title} topic or consultations from other agents.`,
    );
    lines.push(
      "Stay in your lane — focus on your area of expertise. If a question is outside your domain, say so and suggest which colleague would be better suited.",
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ── Workspace Setup ──────────────────────────────────────────────────────────

/**
 * Ensure the `board/` directory exists in the workspace with default
 * personality files for each agent. Only creates files that don't exist yet.
 */
export function ensureBoardPersonalityFiles(workspaceDir: string): void {
  const boardDir = path.join(workspaceDir, "board");
  try {
    if (!fs.existsSync(boardDir)) {
      fs.mkdirSync(boardDir, { recursive: true });
    }
  } catch {
    // Non-fatal — files just won't be created
    return;
  }

  const allAgents = resolveAllAgentDefs();
  for (const agent of allAgents) {
    // Skip general — uses root SOUL.md
    if (agent.role === "general") continue;

    const filepath = path.join(boardDir, `${agent.role}.soul.md`);
    if (!fs.existsSync(filepath)) {
      try {
        fs.writeFileSync(filepath, `${agent.personality}\n`, "utf-8");
      } catch {
        // Non-fatal
      }
    }
  }
}
