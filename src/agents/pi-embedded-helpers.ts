import fs from "node:fs/promises";
import path from "node:path";

import type { AppMessage } from "@mariozechner/pi-agent-core";
import type { AgentToolResult, AssistantMessage } from "@mariozechner/pi-ai";

import type { MemorySearchResult } from "../memory/index.js";
import type { ProactiveContext } from "./proactive.js";
import { sanitizeContentBlocksImages } from "./tool-images.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

export type EmbeddedContextFile = { path: string; content: string };

export async function ensureSessionHeader(params: {
  sessionFile: string;
  sessionId: string;
  cwd: string;
}) {
  const file = params.sessionFile;
  try {
    await fs.stat(file);
    return;
  } catch {
    // create
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const entry = {
    type: "session",
    id: params.sessionId,
    timestamp: new Date().toISOString(),
    cwd: params.cwd,
  };
  await fs.writeFile(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

type ContentBlock = AgentToolResult<unknown>["content"][number];

export async function sanitizeSessionMessagesImages(
  messages: AppMessage[],
  label: string,
): Promise<AppMessage[]> {
  // We sanitize historical session messages because Anthropic can reject a request
  // if the transcript contains oversized base64 images (see MAX_IMAGE_DIMENSION_PX).
  const out: AppMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    const role = (msg as { role?: unknown }).role;
    if (role === "toolResult") {
      const toolMsg = msg as Extract<AppMessage, { role: "toolResult" }>;
      const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
      const nextContent = (await sanitizeContentBlocksImages(
        content as ContentBlock[],
        label,
      )) as unknown as typeof toolMsg.content;
      out.push({ ...toolMsg, content: nextContent });
      continue;
    }

    if (role === "user") {
      const userMsg = msg as Extract<AppMessage, { role: "user" }>;
      const content = userMsg.content;
      if (Array.isArray(content)) {
        const nextContent = (await sanitizeContentBlocksImages(
          content as unknown as ContentBlock[],
          label,
        )) as unknown as typeof userMsg.content;
        out.push({ ...userMsg, content: nextContent });
        continue;
      }
    }

    out.push(msg);
  }
  return out;
}

export function buildBootstrapContextFiles(
  files: WorkspaceBootstrapFile[],
): EmbeddedContextFile[] {
  return files.map((file) => ({
    path: file.name,
    content: file.missing
      ? `[MISSING] Expected at: ${file.path}`
      : (file.content ?? ""),
  }));
}

export function formatAssistantErrorText(
  msg: AssistantMessage,
): string | undefined {
  if (msg.stopReason !== "error") return undefined;
  const raw = (msg.errorMessage ?? "").trim();
  if (!raw) return "LLM request failed with an unknown error.";

  const invalidRequest = raw.match(
    /"type":"invalid_request_error".*?"message":"([^"]+)"/,
  );
  if (invalidRequest?.[1]) {
    return `LLM request rejected: ${invalidRequest[1]}`;
  }

  // Keep it short for WhatsApp.
  return raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
}

/**
 * Format memory search results for injection into the agent's context.
 * Returns an empty string if no memories are provided.
 */
export function formatMemoryContext(memories: MemorySearchResult[]): string {
  if (!memories.length) return "";

  const lines = [
    "## Relevant Memories",
    "The following memories from previous conversations may be relevant to this request:",
    "",
  ];

  for (const mem of memories) {
    const date = new Date(mem.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const senderTag = mem.senderId !== "global" ? ` [${mem.senderId}]` : "";
    lines.push(
      `- [${mem.category}]${senderTag} ${mem.content} (${date}, relevance: ${(mem.score * 100).toFixed(0)}%)`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format proactive context (pre-briefs, conflicts) for injection into the agent's context.
 * Returns an empty string if no proactive context is provided.
 */
export function formatProactiveContext(context: ProactiveContext | null): string {
  if (!context) return "";

  const sections: string[] = [];

  // Meeting briefs section
  if (context.meetingBriefs.length > 0) {
    sections.push("## Upcoming Meetings");
    sections.push("");

    for (const brief of context.meetingBriefs) {
      const startDate = new Date(brief.startTime);
      const minutesUntil = Math.round((startDate.getTime() - Date.now()) / (1000 * 60));

      sections.push(`### ${brief.eventSummary}`);
      if (minutesUntil > 0) {
        sections.push(`Starting in ${minutesUntil} minutes`);
      } else {
        sections.push(`Start time: ${brief.startTime}`);
      }

      if (brief.attendees.length > 0) {
        sections.push(`Attendees: ${brief.attendees.slice(0, 5).join(", ")}${brief.attendees.length > 5 ? ` (+${brief.attendees.length - 5} more)` : ""}`);
      }

      if (brief.relevantMemories.length > 0) {
        sections.push("");
        sections.push("Relevant context from memory:");
        for (const mem of brief.relevantMemories.slice(0, 3)) {
          sections.push(`- ${mem.content.slice(0, 150)}${mem.content.length > 150 ? "..." : ""}`);
        }
      }

      if (brief.suggestedTopics && brief.suggestedTopics.length > 0) {
        sections.push("");
        sections.push(`Consider discussing: ${brief.suggestedTopics.join(", ")}`);
      }

      sections.push("");
    }
  }

  // Conflicts section
  if (context.conflicts.length > 0) {
    sections.push("## Schedule Alerts");
    sections.push("");

    for (const conflict of context.conflicts) {
      const severity = conflict.severity === "high" ? "[HIGH]" : conflict.severity === "medium" ? "[MEDIUM]" : "[LOW]";
      sections.push(`${severity} ${conflict.description}`);
      if (conflict.suggestion) {
        sections.push(`  Suggestion: ${conflict.suggestion}`);
      }
    }
    sections.push("");
  }

  // Surfaced memories section (context-based)
  if (context.surfacedMemories.length > 0) {
    sections.push("## Relevant Context");
    sections.push("");

    for (const mem of context.surfacedMemories) {
      const score = (mem.score * 100).toFixed(0);
      sections.push(`- [${mem.category}] ${mem.content} (relevance: ${score}%)`);
    }
    sections.push("");
  }

  if (sections.length === 0) return "";

  return sections.join("\n");
}
