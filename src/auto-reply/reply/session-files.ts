import type { OpenClawConfig } from "../../config/config.js";
import type { SessionFileType } from "../../sessions/files/types.js";
import type { MsgContext } from "../templating.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import { normalizeMimeType } from "../../media/mime.js";
import { saveFile } from "../../sessions/files/storage.js";

const SUPPORTED_MIMES = new Set([
  "text/csv",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
]);

function mimeToFileType(mime: string): SessionFileType | null {
  const normalized = normalizeMimeType(mime);
  if (normalized === "text/csv") {
    return "csv";
  }
  if (normalized === "application/pdf") {
    return "pdf";
  }
  if (normalized === "application/json") {
    return "json";
  }
  if (normalized.startsWith("text/")) {
    return "text";
  }
  return null;
}

export async function persistSessionFiles(params: {
  ctx: MsgContext;
  sessionId: string;
  agentId?: string;
  agentSessionKey?: string;
  cfg: OpenClawConfig;
}): Promise<void> {
  const { ctx, sessionId, agentId: providedAgentId, agentSessionKey, cfg } = params;
  const agentId =
    providedAgentId ??
    resolveSessionAgentId({
      sessionKey: agentSessionKey ?? ctx.SessionKey,
      config: cfg,
    });

  // Extract attachments from context
  const attachments = ctx.MediaPaths ?? (ctx.MediaPath ? [ctx.MediaPath] : []);
  const mediaTypes = ctx.MediaTypes ?? (ctx.MediaType ? [ctx.MediaType] : []);
  const mediaUrls = ctx.MediaUrls ?? (ctx.MediaUrl ? [ctx.MediaUrl] : []);

  if (attachments.length === 0 && mediaUrls.length === 0) {
    return; // No files to persist
  }

  // For now, we only support local file paths (MediaPaths)
  // URL-based files would require downloading first
  for (let i = 0; i < attachments.length; i++) {
    const path = attachments[i];
    if (!path) {
      continue;
    }

    const mime = mediaTypes[i] ?? "";
    const normalizedMime = normalizeMimeType(mime);
    if (!SUPPORTED_MIMES.has(normalizedMime)) {
      if (shouldLogVerbose()) {
        logVerbose(`session-files: skipping unsupported MIME type ${normalizedMime} for ${path}`);
      }
      continue;
    }

    const fileType = mimeToFileType(normalizedMime);
    if (!fileType) {
      continue;
    }

    try {
      const fs = await import("node:fs/promises");
      const buffer = await fs.readFile(path);
      const filename = path.split("/").pop() ?? `file-${i + 1}`;

      await saveFile({
        sessionId,
        agentId,
        filename,
        type: fileType,
        buffer,
      });

      if (shouldLogVerbose()) {
        logVerbose(`session-files: persisted ${filename} (${fileType}) to session ${sessionId}`);
      }
    } catch (err) {
      // Don't block on errors - log and continue
      if (shouldLogVerbose()) {
        logVerbose(`session-files: failed to persist ${path}: ${String(err)}`);
      }
    }
  }
}
