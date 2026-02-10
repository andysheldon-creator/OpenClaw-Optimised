import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SessionPreviewItem } from "./session-utils.types.js";
import { resolveSessionTranscriptPath } from "../config/sessions.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { recordTrace } from "../infra/perf-trace.js";
import { extractToolCallNames, hasToolCall } from "../utils/transcript-tools.js";
import { stripEnvelope } from "./chat-sanitize.js";

/**
 * Maximum bytes to read from the tail of a transcript file.
 * Callers cap to ≤1000 messages anyway, so reading the last 2 MB covers
 * even very large sessions without loading the entire file into memory.
 */
const SESSION_MESSAGES_TAIL_BYTES = 2 * 1024 * 1024;

export function readSessionMessages(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
): unknown[] {
  const t0 = performance.now();
  const result = readSessionMessagesImpl(sessionId, storePath, sessionFile);
  recordTrace("gateway.readSessionMessages", performance.now() - t0);
  return result;
}

function readSessionMessagesImpl(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
): unknown[] {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile);

  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return [];
  }

  // Tail-read: only load the last SESSION_MESSAGES_TAIL_BYTES of the file.
  // This avoids OOM on large transcripts while still returning enough data
  // for the caller's limit (typically ≤1000 messages).
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size === 0) {
      return [];
    }

    const readStart = Math.max(0, size - SESSION_MESSAGES_TAIL_BYTES);
    const readLen = Math.min(size, SESSION_MESSAGES_TAIL_BYTES);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/);
    // If we started mid-file, the first "line" is likely a partial JSON
    // record — skip it to avoid parse errors.
    const startIdx = readStart > 0 ? 1 : 0;

    const messages: unknown[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0 || (line.charCodeAt(0) <= 32 && !line.trim())) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        if (parsed?.message) {
          messages.push(parsed.message);
          continue;
        }

        // Compaction entries are not "message" records, but they're useful context for debugging.
        // Emit a lightweight synthetic message that the Web UI can render as a divider.
        if (parsed?.type === "compaction") {
          const ts =
            typeof parsed.timestamp === "string" ? Date.parse(parsed.timestamp) : Number.NaN;
          const timestamp = Number.isFinite(ts) ? ts : Date.now();
          messages.push({
            role: "system",
            content: [{ type: "text", text: "Compaction" }],
            timestamp,
            __openclaw: {
              kind: "compaction",
              id: typeof parsed.id === "string" ? parsed.id : undefined,
            },
          });
        }
      } catch {
        // ignore bad lines
      }
    }
    return messages;
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

export function resolveSessionTranscriptCandidates(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): string[] {
  const candidates: string[] = [];
  if (sessionFile) {
    candidates.push(sessionFile);
  }
  if (storePath) {
    const dir = path.dirname(storePath);
    candidates.push(path.join(dir, `${sessionId}.jsonl`));
  }
  if (agentId) {
    candidates.push(resolveSessionTranscriptPath(sessionId, agentId));
  }
  const home = resolveRequiredHomeDir(process.env, os.homedir);
  candidates.push(path.join(home, ".openclaw", "sessions", `${sessionId}.jsonl`));
  return candidates;
}

export function archiveFileOnDisk(filePath: string, reason: string): string {
  const ts = new Date().toISOString().replaceAll(":", "-");
  const archived = `${filePath}.${reason}.${ts}`;
  fs.renameSync(filePath, archived);
  return archived;
}

function jsonUtf8Bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

export function capArrayByJsonBytes<T>(
  items: T[],
  maxBytes: number,
): { items: T[]; bytes: number } {
  if (items.length === 0) {
    return { items, bytes: 2 };
  }
  const parts = items.map((item) => jsonUtf8Bytes(item));
  let bytes = 2 + parts.reduce((a, b) => a + b, 0) + (items.length - 1);
  let start = 0;
  while (bytes > maxBytes && start < items.length - 1) {
    bytes -= parts[start] + 1;
    start += 1;
  }
  const next = start > 0 ? items.slice(start) : items;
  return { items: next, bytes };
}

const MAX_LINES_TO_SCAN = 10;

type TranscriptMessage = {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
};

function extractTextFromContent(content: TranscriptMessage["content"]): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (!part || typeof part.text !== "string") {
      continue;
    }
    if (part.type === "text" || part.type === "output_text" || part.type === "input_text") {
      const trimmed = part.text.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

export function readFirstUserMessageFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): string | null {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return null;
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    if (bytesRead === 0) {
      return null;
    }
    const chunk = buf.toString("utf-8", 0, bytesRead);
    const lines = chunk.split(/\r?\n/).slice(0, MAX_LINES_TO_SCAN);

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message as TranscriptMessage | undefined;
        if (msg?.role === "user") {
          const text = extractTextFromContent(msg.content);
          if (text) {
            return text;
          }
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file read error
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
  return null;
}

const LAST_MSG_MAX_BYTES = 16384;
const LAST_MSG_MAX_LINES = 20;

export function readLastMessagePreviewFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile?: string,
  agentId?: string,
): string | null {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return null;
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size === 0) {
      return null;
    }

    const readStart = Math.max(0, size - LAST_MSG_MAX_BYTES);
    const readLen = Math.min(size, LAST_MSG_MAX_BYTES);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
    const tailLines = lines.slice(-LAST_MSG_MAX_LINES);

    for (let i = tailLines.length - 1; i >= 0; i--) {
      const line = tailLines[i];
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message as TranscriptMessage | undefined;
        if (msg?.role === "user" || msg?.role === "assistant") {
          const text = extractTextFromContent(msg.content);
          if (text) {
            return text;
          }
        }
      } catch {
        // skip malformed
      }
    }
  } catch {
    // file error
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
  return null;
}

const PREVIEW_READ_SIZES = [64 * 1024, 256 * 1024, 1024 * 1024];
const PREVIEW_MAX_LINES = 200;

type TranscriptContentEntry = {
  type?: string;
  text?: string;
  name?: string;
};

type TranscriptPreviewMessage = {
  role?: string;
  content?: string | TranscriptContentEntry[];
  text?: string;
  toolName?: string;
  tool_name?: string;
};

function normalizeRole(role: string | undefined, isTool: boolean): SessionPreviewItem["role"] {
  if (isTool) {
    return "tool";
  }
  switch ((role ?? "").toLowerCase()) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    case "tool":
      return "tool";
    default:
      return "other";
  }
}

function truncatePreviewText(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) {
    return text;
  }
  if (maxChars <= 3) {
    return text.slice(0, maxChars);
  }
  return `${text.slice(0, maxChars - 3)}...`;
}

function extractPreviewText(message: TranscriptPreviewMessage): string | null {
  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .filter((text) => text.trim().length > 0);
    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }
  if (typeof message.text === "string") {
    const trimmed = message.text.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function isToolCall(message: TranscriptPreviewMessage): boolean {
  return hasToolCall(message as Record<string, unknown>);
}

function extractToolNames(message: TranscriptPreviewMessage): string[] {
  return extractToolCallNames(message as Record<string, unknown>);
}

function extractMediaSummary(message: TranscriptPreviewMessage): string | null {
  if (!Array.isArray(message.content)) {
    return null;
  }
  for (const entry of message.content) {
    const raw = typeof entry?.type === "string" ? entry.type.trim().toLowerCase() : "";
    if (!raw || raw === "text" || raw === "toolcall" || raw === "tool_call") {
      continue;
    }
    return `[${raw}]`;
  }
  return null;
}

function buildPreviewItems(
  messages: TranscriptPreviewMessage[],
  maxItems: number,
  maxChars: number,
): SessionPreviewItem[] {
  const items: SessionPreviewItem[] = [];
  for (const message of messages) {
    const toolCall = isToolCall(message);
    const role = normalizeRole(message.role, toolCall);
    let text = extractPreviewText(message);
    if (!text) {
      const toolNames = extractToolNames(message);
      if (toolNames.length > 0) {
        const shown = toolNames.slice(0, 2);
        const overflow = toolNames.length - shown.length;
        text = `call ${shown.join(", ")}`;
        if (overflow > 0) {
          text += ` +${overflow}`;
        }
      }
    }
    if (!text) {
      text = extractMediaSummary(message);
    }
    if (!text) {
      continue;
    }
    let trimmed = text.trim();
    if (!trimmed) {
      continue;
    }
    if (role === "user") {
      trimmed = stripEnvelope(trimmed);
    }
    trimmed = truncatePreviewText(trimmed, maxChars);
    items.push({ role, text: trimmed });
  }

  if (items.length <= maxItems) {
    return items;
  }
  return items.slice(-maxItems);
}

function readRecentMessagesFromTranscript(
  filePath: string,
  maxMessages: number,
  readBytes: number,
): TranscriptPreviewMessage[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size === 0) {
      return [];
    }

    const readStart = Math.max(0, size - readBytes);
    const readLen = Math.min(size, readBytes);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
    const tailLines = lines.slice(-PREVIEW_MAX_LINES);

    const collected: TranscriptPreviewMessage[] = [];
    for (let i = tailLines.length - 1; i >= 0; i--) {
      const line = tailLines[i];
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message as TranscriptPreviewMessage | undefined;
        if (msg && typeof msg === "object") {
          collected.push(msg);
          if (collected.length >= maxMessages) {
            break;
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return collected.toReversed();
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

export function readSessionPreviewItemsFromTranscript(
  sessionId: string,
  storePath: string | undefined,
  sessionFile: string | undefined,
  agentId: string | undefined,
  maxItems: number,
  maxChars: number,
): SessionPreviewItem[] {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile, agentId);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return [];
  }

  const boundedItems = Math.max(1, Math.min(maxItems, 50));
  const boundedChars = Math.max(20, Math.min(maxChars, 2000));

  for (const readSize of PREVIEW_READ_SIZES) {
    const messages = readRecentMessagesFromTranscript(filePath, boundedItems, readSize);
    if (messages.length > 0 || readSize === PREVIEW_READ_SIZES[PREVIEW_READ_SIZES.length - 1]) {
      return buildPreviewItems(messages, boundedItems, boundedChars);
    }
  }

  return [];
}
