import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { resolveUtilityModelRef } from "../agents/micro-model.js";
import { loadConfig } from "../config/config.js";
import {
  resolveSessionTranscriptPath,
  updateSessionStoreEntry,
  type SessionEntry,
} from "../config/sessions.js";
import { completeText } from "../plugin-sdk/llm.js";
import { resolveAgentIdFromSessionKey } from "../routing/session-key.js";

const DESCRIPTION_MAX_CHARS = 180;
const DESCRIPTION_MIN_TURN_COUNT = 1;
const DESCRIPTION_REFRESH_TURN_DELTA = 8;
const DESCRIPTION_REFRESH_MIN_AGE_MS = 15 * 60_000;

const SESSION_DESCRIPTION_INFLIGHT = new Set<string>();

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

function isSessionDescriptionEnabled(): boolean {
  if (isTestEnv()) {
    return false;
  }
  const raw = process.env.CLAWDBRAIN_SESSION_DESCRIPTION?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw);
}

export function shouldRefreshSessionDescription(entry: SessionEntry, now: number): boolean {
  const turns = typeof entry.turnCount === "number" ? entry.turnCount : 0;
  if (turns < DESCRIPTION_MIN_TURN_COUNT) {
    return false;
  }
  if (!entry.sessionId) {
    return false;
  }

  const hasDescription =
    typeof entry.description === "string" && entry.description.trim().length > 0;
  if (!hasDescription) {
    return true;
  }

  const lastTurn = typeof entry.descriptionTurnCount === "number" ? entry.descriptionTurnCount : 0;
  const lastAt = typeof entry.descriptionUpdatedAt === "number" ? entry.descriptionUpdatedAt : 0;
  if (turns - lastTurn < DESCRIPTION_REFRESH_TURN_DELTA) {
    return false;
  }
  if (now - lastAt < DESCRIPTION_REFRESH_MIN_AGE_MS) {
    return false;
  }
  return true;
}

function sanitizeDescriptionText(text: string): string | null {
  const normalized = text
    .replace(/^description\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+/, "")
    .replace(/["'“”]+$/, "")
    .trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= DESCRIPTION_MAX_CHARS) {
    return normalized;
  }
  const cut = normalized.slice(0, DESCRIPTION_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > DESCRIPTION_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

type TranscriptMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  text?: string;
};

function extractMessageText(msg: TranscriptMessage | undefined): string | null {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  if (typeof msg.content === "string") {
    const trimmed = msg.content.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(msg.content)) {
    const parts = msg.content
      .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
      .filter(Boolean);
    const joined = parts.join("\n").trim();
    return joined ? joined : null;
  }
  if (typeof msg.text === "string") {
    const trimmed = msg.text.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function resolveTranscriptCandidates(params: {
  entry: SessionEntry;
  storePath: string | undefined;
  agentId: string | undefined;
}): string[] {
  const candidates: string[] = [];
  const sessionFile = params.entry.sessionFile?.trim();
  if (sessionFile) {
    candidates.push(sessionFile);
  }
  if (params.storePath) {
    const dir = path.dirname(params.storePath);
    candidates.push(path.join(dir, `${params.entry.sessionId}.jsonl`));
  }
  if (params.agentId) {
    candidates.push(resolveSessionTranscriptPath(params.entry.sessionId, params.agentId));
  }
  candidates.push(
    path.join(os.homedir(), ".clawdbrain", "sessions", `${params.entry.sessionId}.jsonl`),
  );
  return candidates;
}

function readConversationExcerptFromTranscript(params: {
  entry: SessionEntry;
  storePath: string | undefined;
  agentId: string | undefined;
  maxMessages?: number;
  maxBytes?: number;
}): string | null {
  const maxMessages = Math.max(6, Math.min(params.maxMessages ?? 24, 48));
  const maxBytes = Math.max(32 * 1024, Math.min(params.maxBytes ?? 256 * 1024, 2 * 1024 * 1024));

  const filePath = resolveTranscriptCandidates({
    entry: params.entry,
    storePath: params.storePath,
    agentId: params.agentId,
  }).find((candidate) => fs.existsSync(candidate));
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
    const readStart = Math.max(0, size - maxBytes);
    const readLen = Math.min(size, maxBytes);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);
    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const collected: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      try {
        const parsed = JSON.parse(line) as { message?: TranscriptMessage; type?: string } | null;
        const msg = parsed?.message;
        const role = typeof msg?.role === "string" ? msg.role.toLowerCase() : "";
        if (role !== "user" && role !== "assistant") {
          continue;
        }
        const text = extractMessageText(msg);
        if (!text) {
          continue;
        }
        if (role === "user" && text.trim().startsWith("/")) {
          continue;
        }
        const compact = text.replace(/\s+/g, " ").trim();
        if (!compact) {
          continue;
        }
        const truncated = compact.length > 320 ? `${compact.slice(0, 317)}...` : compact;
        collected.push(`${role}: ${truncated}`);
        if (collected.length >= maxMessages) {
          break;
        }
      } catch {
        // ignore malformed lines
      }
    }

    if (collected.length === 0) {
      return null;
    }
    return collected.toReversed().join("\n");
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

async function generateDescriptionViaLLM(params: {
  cfg: OpenClawConfig;
  agentId: string;
  conversation: string;
}): Promise<{ description: string; provider: string; model: string } | null> {
  const modelRef = await resolveUtilityModelRef({
    cfg: params.cfg,
    feature: "sessionDescription",
    agentId: params.agentId,
  });

  try {
    const prompt = [
      "Write a short, UI-friendly description (max 1-2 sentences) of what this conversation is about.",
      "Rules: plain text only, no markdown, no quotes, no usernames/phone numbers, no secrets, be specific but concise.",
      "",
      "Conversation excerpt:",
      params.conversation.slice(0, 4000),
      "",
      "Reply with ONLY the description.",
    ].join("\n");

    const result = await completeText({
      cfg: params.cfg,
      provider: modelRef.provider,
      model: modelRef.model,
      prompt,
      timeoutMs: 12_000,
      maxTokens: 256,
    });

    const sanitized = sanitizeDescriptionText(result.text);
    if (!sanitized) {
      return null;
    }
    return { description: sanitized, provider: modelRef.provider, model: modelRef.model };
  } catch {
    return null;
  }
}

export function queueSessionDescriptionRefresh(params: {
  storePath: string;
  sessionKey: string;
  entry: SessionEntry;
}): void {
  if (!isSessionDescriptionEnabled()) {
    return;
  }
  const storePath = params.storePath.trim();
  const sessionKey = params.sessionKey.trim();
  if (!storePath || !sessionKey) {
    return;
  }

  const inflightKey = `${storePath}::${sessionKey}`;
  if (SESSION_DESCRIPTION_INFLIGHT.has(inflightKey)) {
    return;
  }

  const now = Date.now();
  if (!shouldRefreshSessionDescription(params.entry, now)) {
    return;
  }

  SESSION_DESCRIPTION_INFLIGHT.add(inflightKey);
  void (async () => {
    try {
      const cfg = loadConfig();
      const agentId = resolveAgentIdFromSessionKey(sessionKey);
      const conversation = readConversationExcerptFromTranscript({
        entry: params.entry,
        storePath,
        agentId,
      });
      if (!conversation) {
        return;
      }

      const generated = await generateDescriptionViaLLM({ cfg, agentId, conversation });
      if (!generated?.description) {
        return;
      }

      const targetSessionId = params.entry.sessionId;
      const targetTurnCount =
        typeof params.entry.turnCount === "number" ? params.entry.turnCount : 0;
      const startedAt = now;

      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (current) => {
          if (current.sessionId !== targetSessionId) {
            return null;
          }
          const currentTurn = typeof current.turnCount === "number" ? current.turnCount : 0;
          const currentDescTurn =
            typeof current.descriptionTurnCount === "number" ? current.descriptionTurnCount : 0;
          const currentDescAt =
            typeof current.descriptionUpdatedAt === "number" ? current.descriptionUpdatedAt : 0;
          if (currentDescAt > startedAt) {
            return null;
          }
          if (currentDescTurn > targetTurnCount) {
            return null;
          }
          if (!shouldRefreshSessionDescription(current, Date.now())) {
            return null;
          }
          return {
            description: generated.description,
            descriptionUpdatedAt: Date.now(),
            descriptionTurnCount: currentTurn,
          };
        },
      });
    } finally {
      SESSION_DESCRIPTION_INFLIGHT.delete(inflightKey);
    }
  })();
}
