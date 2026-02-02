import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinBase, extractArchive } from "./archive.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe("isPathWithinBase", () => {
  it("returns true for paths within base directory", () => {
    expect(isPathWithinBase("/tmp/foo", "bar.txt")).toBe(true);
    expect(isPathWithinBase("/tmp/foo", "subdir/bar.txt")).toBe(true);
    expect(isPathWithinBase("/tmp/foo", "/tmp/foo/bar.txt")).toBe(true);
  });

  it("returns false for paths outside base directory (path traversal)", () => {
    expect(isPathWithinBase("/tmp/foo", "../evil.txt")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "../../etc/passwd")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "subdir/../../../etc/passwd")).toBe(false);
  });

  it("returns false for startsWith bypass attempts", () => {
    // This is the specific vulnerability: /tmp/foobar passes startsWith("/tmp/foo")
    expect(isPathWithinBase("/tmp/foo", "/tmp/foobar/evil.txt")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "../foofoo/evil.txt")).toBe(false);
  });

  it("returns false for absolute paths outside base", () => {
    expect(isPathWithinBase("/tmp/foo", "/etc/passwd")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "/root/.ssh/id_rsa")).toBe(false);
  });

  it("handles edge cases correctly", () => {
    // Empty path
    expect(isPathWithinBase("/tmp/foo", "")).toBe(false);
    // Current directory
    expect(isPathWithinBase("/tmp/foo", ".")).toBe(false);
    // Same directory
    expect(isPathWithinBase("/tmp/foo", "./bar.txt")).toBe(true);
  });
});

describe("extractArchive zip path validation", () => {
  it("throws on zip entry with path traversal", async () => {
    await withTempDir(async (tmpDir) => {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Add a malicious entry that tries to escape the destination
      zip.file("../../../etc/passwd", "malicious content");
      zip.file("normal.txt", "normal content");

      const archivePath = path.join(tmpDir, "malicious.zip");
      const destDir = path.join(tmpDir, "extract");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(archivePath, buffer);

      // Should throw when extracting
      await expect(
        extractArchive({
          archivePath,
          destDir,
          timeoutMs: 5000,
        }),
      ).rejects.toThrow(/escapes destination/);

      // Verify the malicious file was NOT created
      const evilPath = path.join(destDir, "../../../etc/passwd");
      await expect(fs.access(evilPath)).rejects.toThrow();
    });
  });

  it("successfully extracts valid zip with nested directories", async () => {
    await withTempDir(async (tmpDir) => {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      zip.file("nested/deep/file.txt", "deep content");
      zip.file("top.txt", "top content");

      const archivePath = path.join(tmpDir, "valid.zip");
      const destDir = path.join(tmpDir, "extract");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      await fs.writeFile(archivePath, buffer);

      await extractArchive({
        archivePath,
        destDir,
        timeoutMs: 5000,
      });

      // Verify files were extracted correctly
      const deepContent = await fs.readFile(path.join(destDir, "nested/deep/file.txt"), "utf-8");
      expect(deepContent).toBe("deep content");

      const topContent = await fs.readFile(path.join(destDir, "top.txt"), "utf-8");
      expect(topContent).toBe("top content");
    });
  });
});

// Note: Tar extraction uses the same isPathWithinBase validation via the filter option.
// The comprehensive zip tests above verify the path validation logic.
// Tar-specific testing would require complex tar file manipulation for malicious entries.
