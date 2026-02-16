import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentMessage,
  AgentToolResult,
} from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";

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
  const sessionVersion = 2;
  const entry = {
    type: "session",
    version: sessionVersion,
    id: params.sessionId,
    timestamp: new Date().toISOString(),
    cwd: params.cwd,
  };
  await fs.writeFile(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

type ContentBlock = AgentToolResult<unknown>["content"][number];

export async function sanitizeSessionMessagesImages(
  messages: AgentMessage[],
  label: string,
): Promise<AgentMessage[]> {
  // We sanitize historical session messages because Anthropic can reject a request
  // if the transcript contains oversized base64 images (see MAX_IMAGE_DIMENSION_PX).
  const out: AgentMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    const role = (msg as { role?: unknown }).role;
    if (role === "toolResult") {
      const toolMsg = msg as Extract<AgentMessage, { role: "toolResult" }>;
      const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
      const nextContent = (await sanitizeContentBlocksImages(
        content as ContentBlock[],
        label,
      )) as unknown as typeof toolMsg.content;
      out.push({ ...toolMsg, content: nextContent });
      continue;
    }

    if (role === "user") {
      const userMsg = msg as Extract<AgentMessage, { role: "user" }>;
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

/**
 * Strip orphaned toolResult messages whose corresponding assistant tool_use
 * block is missing from the conversation history.
 *
 * This happens when conversation windowing, summarisation, or session
 * restoration removes an assistant message but leaves its tool results.
 * The Anthropic API rejects requests containing tool_result blocks
 * without a matching tool_use in the preceding assistant message.
 */
export function stripOrphanedToolResults(
  messages: AgentMessage[],
): AgentMessage[] {
  // Collect all tool_use IDs from assistant messages.
  const knownToolCallIds = new Set<string>();
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = (msg as { role?: unknown }).role;
    if (role === "assistant") {
      const content = (msg as { content?: unknown[] }).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "toolCall" &&
            typeof (block as { id?: unknown }).id === "string"
          ) {
            knownToolCallIds.add((block as { id: string }).id);
          }
        }
      }
    }
  }

  // Filter out toolResult messages with no matching tool_use.
  return messages.filter((msg) => {
    if (!msg || typeof msg !== "object") return true;
    const role = (msg as { role?: unknown }).role;
    if (role !== "toolResult") return true;
    const toolCallId = (msg as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId !== "string") return true;
    return knownToolCallIds.has(toolCallId);
  });
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
