import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { InputFileLimits } from "../../media/input-files.js";
import type { SessionFileType, SessionFileMetadata } from "./types.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import { extractPdfContent } from "../../media/input-files.js";
import { parseCsv } from "./csv-parser.js";
import { loadIndex, addFileToIndex, removeFileFromIndex } from "./index.js";
import { resolveSessionFilesDir } from "./paths.js";

export async function saveFile(params: {
  sessionId: string;
  agentId?: string;
  filename: string;
  type: SessionFileType;
  buffer: Buffer;
  filesDir?: string; // For testing
  retentionDays?: number; // File retention period in days (default: 7)
}): Promise<string> {
  const { sessionId, agentId, filename, type, buffer, filesDir, retentionDays = 7 } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");

  const fileId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const fileBase = `${fileId}-${filename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);

  await fs.mkdir(baseDir, { recursive: true });

  // Save raw content (no conversion)
  let content: string;
  if (type === "pdf") {
    // PDF still needs extraction (can't store as raw binary)
    const limits: InputFileLimits = {
      allowUrl: false,
      allowedMimes: new Set(["application/pdf"]),
      maxBytes: 50 * 1024 * 1024, // 50MB default
      maxChars: 1_000_000, // 1M chars default
      maxRedirects: 5,
      timeoutMs: 30_000,
      pdf: {
        maxPages: 100,
        maxPixels: 10_000_000,
        minTextChars: 10,
      },
    };
    try {
      const extracted = await extractPdfContent({ buffer, limits });
      content = extracted.text || "";
    } catch (err) {
      // If PDF extraction fails, log error and save empty string
      if (shouldLogVerbose()) {
        logVerbose(`PDF extraction failed for ${filename}: ${String(err)}`);
      }
      content = ""; // Empty string if extraction fails
    }
  } else {
    // All other types: save raw content
    content = buffer.toString("utf-8");
  }
  await fs.writeFile(mdPath, content, "utf-8");

  const metadata: SessionFileMetadata = {
    id: fileId,
    filename,
    type,
    storageFormat: "markdown", // Always markdown
    uploadedAt: Date.now(),
    size: buffer.byteLength,
    expiresAt: Date.now() + retentionDays * 24 * 60 * 60 * 1000,
  };

  // Parse CSV if needed
  if (type === "csv") {
    const csvText = buffer.toString("utf-8");
    const parsed = parseCsv(csvText);
    const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
    await fs.writeFile(parsedPath, JSON.stringify(parsed, null, 2));
    metadata.csvSchema = {
      columns: parsed.columns,
      rowCount: parsed.rows.length,
    };
  }

  await addFileToIndex(indexPath, metadata);
  return fileId;
}

export async function getFile(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<{ buffer: Buffer; metadata: SessionFileMetadata }> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }

  const fileBase = `${fileId}-${file.filename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);
  const rawPath = path.join(baseDir, `${fileBase}.raw`);

  // Try .md first, fallback to .raw for backward compatibility
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(mdPath);
  } catch {
    // Fallback to .raw for backward compatibility
    buffer = await fs.readFile(rawPath);
  }

  return { buffer, metadata: file };
}

export async function listFiles(params: {
  sessionId: string;
  agentId?: string;
  filesDir?: string;
}): Promise<SessionFileMetadata[]> {
  const { sessionId, agentId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  return index.files;
}

export async function getParsedCsv(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }
  if (file.type !== "csv") {
    throw new Error(`File ${fileId} is not a CSV file`);
  }
  const fileBase = `${fileId}-${file.filename}`;
  const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
  const content = await fs.readFile(parsedPath, "utf-8");
  return JSON.parse(content) as { columns: string[]; rows: Record<string, unknown>[] };
}

export async function deleteFile(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<void> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    return; // Already deleted
  }
  const fileBase = `${fileId}-${file.filename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);
  const rawPath = path.join(baseDir, `${fileBase}.raw`);

  // Delete .md file
  await fs.unlink(mdPath).catch(() => {});
  // Also try to delete .raw for cleanup (backward compatibility)
  await fs.unlink(rawPath).catch(() => {});

  if (file.type === "csv") {
    const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
    await fs.unlink(parsedPath).catch(() => {});
  }
  await removeFileFromIndex(indexPath, fileId);
}
