import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ToolResultMessage } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildToolResultPlaceholder,
  writeToolResultArtifact,
} from "./pi-extensions/context-pruning/artifacts.js";
import { getToolResultArtifactRef, withToolResultArtifactRef } from "./session-artifacts.js";

type SessionHeaderEntry = {
  type: "session";
  id?: string;
  version?: number;
  timestamp?: string;
  cwd?: string;
};

type SessionMessageEntry = {
  type: "message";
  message?: AgentMessage;
};

type ParsedEntry = SessionHeaderEntry | SessionMessageEntry | { type?: string };

type MigrationReport = {
  migrated: boolean;
  updatedEntries: number;
  createdArtifacts: number;
  backupPath?: string;
  reason?: string;
};

const ARTIFACT_TRANSCRIPT_VERSION = 3;
const PLACEHOLDER_PREFIX = "[Tool result omitted: stored as artifact]";

function isSessionHeader(entry: ParsedEntry | undefined): entry is SessionHeaderEntry {
  return Boolean(entry && entry.type === "session");
}

function isToolResultMessage(message: AgentMessage | undefined): message is ToolResultMessage {
  return Boolean(message && message.role === "toolResult");
}

function extractPlaceholderText(message: ToolResultMessage): string | null {
  if (!Array.isArray(message.content) || message.content.length === 0) {
    return null;
  }
  const first = message.content[0];
  if (!first || first.type !== "text") {
    return null;
  }
  const text = first.text?.trim();
  if (!text || !text.startsWith(PLACEHOLDER_PREFIX)) {
    return null;
  }
  return text;
}

function parseArtifactRefFromPlaceholder(text: string) {
  const lines = text.split("\n").map((line) => line.trim());
  const values = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value) {
      values.set(key, value);
    }
  }
  const id = values.get("id");
  const createdAt = values.get("created");
  const summary = values.get("summary");
  const pathValue = values.get("path");
  if (!id || !createdAt || !summary || !pathValue) {
    return null;
  }
  const sizeKbRaw = values.get("size");
  const sizeKb = sizeKbRaw ? Number.parseInt(sizeKbRaw.replace("KB", "").trim(), 10) : NaN;
  return {
    id,
    type: "tool-result" as const,
    toolName: values.get("tool"),
    createdAt,
    sizeBytes: Number.isFinite(sizeKb) ? sizeKb * 1024 : 0,
    summary,
    path: pathValue,
  };
}

export async function migrateSessionFileArtifactsIfNeeded(params: {
  sessionFile: string;
  sessionKey?: string;
  sessionId?: string;
  warn?: (message: string) => void;
}): Promise<MigrationReport> {
  const sessionFile = params.sessionFile.trim();
  if (!sessionFile) {
    return {
      migrated: false,
      updatedEntries: 0,
      createdArtifacts: 0,
      reason: "missing session file",
    };
  }
  let raw: string;
  try {
    raw = await fs.readFile(sessionFile, "utf-8");
  } catch (err) {
    const code = (err as { code?: unknown } | undefined)?.code;
    if (code === "ENOENT") {
      return {
        migrated: false,
        updatedEntries: 0,
        createdArtifacts: 0,
        reason: "missing session file",
      };
    }
    const reason = `failed to read session file: ${err instanceof Error ? err.message : "unknown error"}`;
    params.warn?.(`session artifact migration skipped: ${reason} (${path.basename(sessionFile)})`);
    return { migrated: false, updatedEntries: 0, createdArtifacts: 0, reason };
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return {
      migrated: false,
      updatedEntries: 0,
      createdArtifacts: 0,
      reason: "empty session file",
    };
  }
  const entries: ParsedEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as ParsedEntry);
    } catch {
      return {
        migrated: false,
        updatedEntries: 0,
        createdArtifacts: 0,
        reason: "invalid jsonl line",
      };
    }
  }

  const header = entries[0];
  if (!isSessionHeader(header)) {
    params.warn?.(
      `session artifact migration skipped: invalid session header (${path.basename(sessionFile)})`,
    );
    return {
      migrated: false,
      updatedEntries: 0,
      createdArtifacts: 0,
      reason: "invalid session header",
    };
  }

  const originalVersion = typeof header.version === "number" ? header.version : 0;
  const artifactDir = path.join(path.dirname(sessionFile), "artifacts");
  let updatedEntries = 0;
  let createdArtifacts = 0;

  for (const entry of entries) {
    if (entry.type !== "message") {
      continue;
    }
    const message = (entry as SessionMessageEntry).message;
    if (!isToolResultMessage(message)) {
      continue;
    }
    if (getToolResultArtifactRef(message)) {
      continue;
    }

    const placeholderText = extractPlaceholderText(message);
    if (placeholderText) {
      const parsedRef = parseArtifactRefFromPlaceholder(placeholderText);
      if (parsedRef) {
        const details = withToolResultArtifactRef(
          (message as { details?: unknown }).details,
          parsedRef,
        );
        (entry as SessionMessageEntry).message = {
          ...message,
          details,
        };
        updatedEntries += 1;
      }
      continue;
    }

    if (!Array.isArray(message.content)) {
      continue;
    }

    const ref = writeToolResultArtifact({
      artifactDir,
      toolName: message.toolName,
      content: message.content,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
    });
    const placeholder = buildToolResultPlaceholder(ref);
    const details = withToolResultArtifactRef((message as { details?: unknown }).details, ref);
    (entry as SessionMessageEntry).message = {
      ...message,
      content: [{ type: "text", text: placeholder }],
      details,
    };
    updatedEntries += 1;
    createdArtifacts += 1;
  }

  if (updatedEntries === 0 && originalVersion >= ARTIFACT_TRANSCRIPT_VERSION) {
    return {
      migrated: false,
      updatedEntries: 0,
      createdArtifacts: 0,
      reason: "already migrated",
    };
  }

  header.version = ARTIFACT_TRANSCRIPT_VERSION;
  const cleaned = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const backupPath = `${sessionFile}.bak-${process.pid}-${Date.now()}`;
  const tmpPath = `${sessionFile}.migrate-${process.pid}-${Date.now()}.tmp`;

  try {
    const stat = await fs.stat(sessionFile).catch(() => null);
    await fs.writeFile(backupPath, raw, "utf-8");
    if (stat) {
      await fs.chmod(backupPath, stat.mode);
    }
    await fs.writeFile(tmpPath, cleaned, "utf-8");
    if (stat) {
      await fs.chmod(tmpPath, stat.mode);
    }
    await fs.rename(tmpPath, sessionFile);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch (cleanupErr) {
      params.warn?.(
        `session artifact migration cleanup failed: ${
          cleanupErr instanceof Error ? cleanupErr.message : "unknown error"
        } (${path.basename(tmpPath)})`,
      );
    }
    return {
      migrated: false,
      updatedEntries,
      createdArtifacts,
      reason: `migration failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  return { migrated: true, updatedEntries, createdArtifacts, backupPath };
}
