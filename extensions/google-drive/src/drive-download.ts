import type { drive_v3 } from "googleapis";
import { promises as fs } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createGoogleDriveClient } from "./client.js";
// Dynamic type import for OAuthCredentials (not in plugin SDK)
type OAuthCredentials = import("../../../src/agents/auth-profiles/types.js").OAuthCredentials;
import { getGoogleDriveFile } from "./drive-get.js";

const GOOGLE_WORKSPACE_MIME_TYPES = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
  drawing: "application/vnd.google-apps.drawing",
  form: "application/vnd.google-apps.form",
};

const EXPORT_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  html: "text/html",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
};

export async function downloadGoogleDriveFile(params: {
  credentials: OAuthCredentials;
  fileId: string;
  exportFormat?: string;
  outputPath?: string;
  workspaceDir?: string;
}): Promise<{
  path: string;
  size: number;
  mimeType: string;
  filename: string;
}> {
  const drive = createGoogleDriveClient(params.credentials);

  // Get file metadata first
  const fileInfo = await getGoogleDriveFile({
    credentials: params.credentials,
    fileId: params.fileId,
  });

  const isGoogleWorkspaceFile = fileInfo.isGoogleWorkspaceFile;
  const shouldExport = isGoogleWorkspaceFile && params.exportFormat;

  // Determine output path
  let outputPath: string;
  if (params.outputPath) {
    outputPath = params.workspaceDir
      ? join(params.workspaceDir, params.outputPath)
      : params.outputPath;
  } else {
    const baseName = fileInfo.name;
    const extension = shouldExport
      ? params.exportFormat
      : getFileExtension(fileInfo.mimeType, baseName);
    const filename = extension ? `${baseName}.${extension}` : baseName;
    outputPath = params.workspaceDir ? join(params.workspaceDir, filename) : filename;
  }

  // Ensure directory exists
  await fs.mkdir(dirname(outputPath), { recursive: true });

  // Download or export the file
  let response: { data: unknown };
  let mimeType: string;

  if (shouldExport) {
    const exportMimeType = EXPORT_MIME_TYPES[params.exportFormat.toLowerCase()];
    if (!exportMimeType) {
      throw new Error(
        `Unsupported export format: ${params.exportFormat}. Supported formats: ${Object.keys(EXPORT_MIME_TYPES).join(", ")}`,
      );
    }

    if (!fileInfo.exportFormats?.includes(exportMimeType)) {
      throw new Error(
        `Export format ${params.exportFormat} (${exportMimeType}) is not available for this file type (${fileInfo.mimeType}). Available formats: ${fileInfo.exportFormats?.join(", ") || "none"}`,
      );
    }

    response = await drive.files.export(
      {
        fileId: params.fileId,
        mimeType: exportMimeType,
        supportsAllDrives: true,
      },
      { responseType: "stream" },
    );
    mimeType = exportMimeType;
  } else {
    response = await drive.files.get(
      {
        fileId: params.fileId,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "stream" },
    );
    mimeType = fileInfo.mimeType;
  }

  // Write file to disk
  const stream = response.data as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  await fs.writeFile(outputPath, buffer);

  return {
    path: outputPath,
    size: buffer.length,
    mimeType,
    filename: basename(outputPath),
  };
}

function getFileExtension(mimeType: string, filename: string): string {
  // Try to get extension from filename first
  const match = filename.match(/\.([^.]+)$/);
  if (match) {
    return match[1];
  }

  // Fallback to mime type mapping
  const mimeToExt: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/html": "html",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "application/json": "json",
    "application/zip": "zip",
  };

  return mimeToExt[mimeType] || "bin";
}
