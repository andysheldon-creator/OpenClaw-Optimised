/**
 * COLLABORATION STORAGE
 *
 * Persists collaborative sessions and decisions to disk
 * Survives gateway restarts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/config.js";

export type CollaborationRecord = {
  sessionKey: string;
  topic: string;
  createdAt: number;
  updatedAt: number;
  members: string[];
  moderator?: string;
  status: "planning" | "debating" | "decided" | "archived";
  decisions: Array<{
    id: string;
    topic: string;
    proposals: Array<{
      from: string;
      proposal: string;
      reasoning: string;
      timestamp: number;
    }>;
    consensus?: {
      finalDecision: string;
      agreedBy: string[];
      decidedAt: number;
      decidedBy?: string;
      rationale?: string;
    };
  }>;
  messages: Array<{
    from: string;
    type: "proposal" | "challenge" | "clarification" | "agreement" | "decision";
    content: string;
    referencesDecision?: string;
    timestamp: number;
  }>;
};

function getCollaborationStorePath(): string {
  const cfg = loadConfig();
  const workspace = cfg.agents?.defaults?.workspace || "./";
  return path.join(workspace, ".collaboration-storage");
}

function getSessionPath(sessionKey: string): string {
  const storePath = getCollaborationStorePath();
  // Sanitize session key for file path
  const sanitized = sessionKey.replace(/[^a-z0-9-_]/g, "-");
  return path.join(storePath, `${sanitized}.json`);
}

/**
 * Save a collaboration session to disk
 */
export async function saveCollaborationSession(record: CollaborationRecord): Promise<void> {
  try {
    const storePath = getCollaborationStorePath();
    await fs.mkdir(storePath, { recursive: true });

    const sessionPath = getSessionPath(record.sessionKey);
    const content = JSON.stringify(record, null, 2);
    await fs.writeFile(sessionPath, content, "utf-8");
  } catch (err) {
    console.error("Failed to save collaboration session:", err);
    // Don't throw - allow in-memory operation to continue
  }
}

/**
 * Load a collaboration session from disk
 */
export async function loadCollaborationSession(
  sessionKey: string,
): Promise<CollaborationRecord | null> {
  try {
    const sessionPath = getSessionPath(sessionKey);
    const content = await fs.readFile(sessionPath, "utf-8");
    return JSON.parse(content) as CollaborationRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load collaboration session:", err);
    }
    return null;
  }
}

/**
 * List all collaboration sessions
 */
export async function listCollaborationSessions(): Promise<string[]> {
  try {
    const storePath = getCollaborationStorePath();
    const files = await fs.readdir(storePath);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

/**
 * Archive a collaboration session
 */
export async function archiveCollaborationSession(sessionKey: string): Promise<void> {
  try {
    const record = await loadCollaborationSession(sessionKey);
    if (!record) {
      return;
    }

    record.status = "archived";
    record.updatedAt = Date.now();
    await saveCollaborationSession(record);
  } catch (err) {
    console.error("Failed to archive collaboration session:", err);
  }
}

/**
 * Export collaboration sessions as markdown for documentation
 */
export async function exportCollaborationAsMarkdown(sessionKey: string): Promise<string> {
  const record = await loadCollaborationSession(sessionKey);
  if (!record) {
    return "";
  }

  let markdown = `# Collaboration Session: ${record.topic}\n\n`;
  markdown += `**Date**: ${new Date(record.createdAt).toISOString()}\n`;
  markdown += `**Status**: ${record.status}\n`;
  markdown += `**Team**: ${record.members.join(", ")}\n`;
  if (record.moderator) {
    markdown += `**Moderator**: ${record.moderator}\n`;
  }
  markdown += "\n## Discussion\n\n";

  for (const message of record.messages) {
    const typeEmoji: Record<string, string> = {
      proposal: "📋",
      challenge: "❓",
      clarification: "💡",
      agreement: "✅",
      decision: "🎯",
    };
    const emoji = typeEmoji[message.type] || "💬";
    markdown += `${emoji} **${message.from}** (${message.type}): ${message.content}\n\n`;
  }

  markdown += "\n## Decisions\n\n";
  for (const decision of record.decisions) {
    markdown += `### ${decision.topic}\n\n`;
    markdown += `**Proposals**:\n`;
    for (const proposal of decision.proposals) {
      markdown += `- ${proposal.from}: ${proposal.proposal}\n`;
      markdown += `  > ${proposal.reasoning}\n`;
    }
    if (decision.consensus) {
      markdown += `\n**Final Decision**:\n${decision.consensus.finalDecision}\n`;
      markdown += `\n**Agreed By**: ${decision.consensus.agreedBy.join(", ")}\n`;
      if (decision.consensus.rationale) {
        markdown += `\n**Rationale**: ${decision.consensus.rationale}\n`;
      }
    }
    markdown += "\n";
  }

  return markdown;
}

/**
 * Get metrics about a collaboration session
 */
export async function getCollaborationMetrics(sessionKey: string): Promise<{
  topicCount: number;
  messageCount: number;
  decisionCount: number;
  participantCount: number;
  averageProposalsPerTopic: number;
  consensusRate: number;
  durationMinutes: number;
} | null> {
  const record = await loadCollaborationSession(sessionKey);
  if (!record) {
    return null;
  }

  const decisionCount = record.decisions.length;
  const consensusCount = record.decisions.filter((d) => d.consensus).length;
  const durationMinutes = Math.round((record.updatedAt - record.createdAt) / 1000 / 60);

  let totalProposals = 0;
  for (const decision of record.decisions) {
    totalProposals += decision.proposals.length;
  }
  const averageProposalsPerTopic = decisionCount > 0 ? totalProposals / decisionCount : 0;

  return {
    topicCount: decisionCount,
    messageCount: record.messages.length,
    decisionCount,
    participantCount: record.members.length,
    averageProposalsPerTopic,
    consensusRate: decisionCount > 0 ? consensusCount / decisionCount : 0,
    durationMinutes,
  };
}
