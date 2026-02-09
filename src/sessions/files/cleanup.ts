import path from "node:path";
import type { SessionFileMetadata } from "./types.js";
import { loadIndex, saveIndex } from "./index.js";
import { resolveSessionFilesDir } from "./paths.js";
import { deleteFile } from "./storage.js";

export async function cleanupExpiredFiles(params: {
  sessionId: string;
  agentId?: string;
  filesDir?: string;
}): Promise<{ deleted: number }> {
  const { sessionId, agentId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");

  let index;
  try {
    index = await loadIndex(indexPath);
  } catch {
    return { deleted: 0 }; // No index file, nothing to clean
  }

  const now = Date.now();
  const expiredFiles: SessionFileMetadata[] = [];
  const validFiles: SessionFileMetadata[] = [];

  for (const file of index.files) {
    if (file.expiresAt <= now) {
      expiredFiles.push(file);
    } else {
      validFiles.push(file);
    }
  }

  // Delete expired files
  for (const file of expiredFiles) {
    try {
      await deleteFile({
        sessionId,
        agentId,
        fileId: file.id,
        filesDir,
      });
    } catch {
      // Continue even if deletion fails (file might already be deleted)
    }
  }

  // Update index if files were deleted
  if (expiredFiles.length > 0) {
    index.files = validFiles;
    await saveIndex(indexPath, index);
  }

  return { deleted: expiredFiles.length };
}
