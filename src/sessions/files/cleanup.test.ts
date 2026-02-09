import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { cleanupExpiredFiles } from "./cleanup.js";
import { loadIndex } from "./index.js";
import { saveFile } from "./storage.js";

describe("cleanupExpiredFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-"));
  });

  it("deletes expired files", async () => {
    const sessionId = "test-session";
    const now = Date.now();
    const expiredTime = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago

    // Save a file with expired timestamp
    const buffer = Buffer.from("test content");
    const fileId = await saveFile({
      sessionId,
      filename: "test.txt",
      type: "text",
      buffer,
      filesDir: path.join(tempDir, "sessions", "files", sessionId),
    });

    // Manually set expired timestamp in index
    const indexPath = path.join(tempDir, "sessions", "files", sessionId, "index.json");
    const index = await loadIndex(indexPath);
    const file = index.files.find((f) => f.id === fileId);
    if (file) {
      file.expiresAt = expiredTime;
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    }

    // Run cleanup
    await cleanupExpiredFiles({
      sessionId,
      filesDir: path.join(tempDir, "sessions", "files", sessionId),
    });

    // Verify file is deleted
    const indexAfter = await loadIndex(indexPath);
    expect(indexAfter.files).toHaveLength(0);
  });

  it("keeps non-expired files", async () => {
    const sessionId = "test-session";

    // Save a file
    const buffer = Buffer.from("test content");
    await saveFile({
      sessionId,
      filename: "test.txt",
      type: "text",
      buffer,
      filesDir: path.join(tempDir, "sessions", "files", sessionId),
    });

    // Run cleanup
    await cleanupExpiredFiles({
      sessionId,
      filesDir: path.join(tempDir, "sessions", "files", sessionId),
    });

    // Verify file still exists
    const indexPath = path.join(tempDir, "sessions", "files", sessionId, "index.json");
    const indexAfter = await loadIndex(indexPath);
    expect(indexAfter.files).toHaveLength(1);
  });
});
