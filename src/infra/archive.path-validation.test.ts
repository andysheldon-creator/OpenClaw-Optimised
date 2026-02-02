import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinBase, extractArchive } from "./archive.js";

describe("isPathWithinBase security validation", () => {
  it("returns true for paths within base directory", () => {
    expect(isPathWithinBase("/tmp/foo", "/tmp/foo/bar.txt")).toBe(true);
    expect(isPathWithinBase("/tmp/foo", "bar.txt")).toBe(true);
    expect(isPathWithinBase("/tmp/foo", "subdir/baz.txt")).toBe(true);
  });

  it("returns false for paths outside base directory (path traversal)", () => {
    expect(isPathWithinBase("/tmp/foo", "../evil.txt")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "../../etc/passwd")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "subdir/../../../etc/passwd")).toBe(false);
  });

  it("returns false for startsWith bypass attacks", () => {
    // This is the specific vulnerability: /tmp/foobar starts with /tmp/foo
    expect(isPathWithinBase("/tmp/foo", "/tmp/foobar/evil.txt")).toBe(false);
    expect(isPathWithinBase("/home/user", "/home/username/secret.txt")).toBe(false);
  });

  it("returns false for absolute paths outside base", () => {
    expect(isPathWithinBase("/tmp/foo", "/etc/passwd")).toBe(false);
    expect(isPathWithinBase("/tmp/foo", "/home/user/.ssh/id_rsa")).toBe(false);
  });

  it("handles edge cases correctly", () => {
    // Empty path
    expect(isPathWithinBase("/tmp/foo", "")).toBe(false);
    // Same directory
    expect(isPathWithinBase("/tmp/foo", "/tmp/foo")).toBe(false); // Not a file path
    // Current directory reference
    expect(isPathWithinBase("/tmp/foo", "./file.txt")).toBe(true);
  });
});

describe("extractArchive path traversal protection", () => {
  it("rejects zip entries with path traversal", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
    const evilZipPath = path.join(tmpDir, "evil.zip");

    // Create a malicious zip with ../../etc/passwd entry
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("../../../etc/passwd", "root:x:0:0:root:/root:/bin/bash");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await fs.writeFile(evilZipPath, buffer);

    const extractDir = path.join(tmpDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });

    // Should throw when extracting malicious zip
    await expect(
      extractArchive({
        archivePath: evilZipPath,
        destDir: extractDir,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/escapes destination/);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects tar entries with path traversal", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
    const evilTarPath = path.join(tmpDir, "evil.tar.gz");
    const extractDir = path.join(tmpDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });

    // Create a malicious tar with ../../etc/passwd entry using tar command
    const { execSync } = await import("node:child_process");
    const maliciousFile = path.join(tmpDir, "passwd");
    await fs.writeFile(maliciousFile, "root:x:0:0:root:/root:/bin/bash");

    // Create tar with path traversal - this simulates malicious archive
    try {
      execSync(`tar -czf "${evilTarPath}" -C "${tmpDir}" --transform 's,^,../../etc/,' passwd`, {
        stdio: "ignore",
      });
    } catch {
      // If tar command fails, skip this test
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }

    // Should throw when extracting malicious tar
    await expect(
      extractArchive({
        archivePath: evilTarPath,
        destDir: extractDir,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow();

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("accepts valid zip entries", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
    const validZipPath = path.join(tmpDir, "valid.zip");

    // Create a valid zip
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("package/readme.txt", "Hello World");
    zip.file("package/src/index.js", "console.log('hello');");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await fs.writeFile(validZipPath, buffer);

    const extractDir = path.join(tmpDir, "extract");
    await fs.mkdir(extractDir, { recursive: true });

    // Should extract successfully
    await extractArchive({
      archivePath: validZipPath,
      destDir: extractDir,
      timeoutMs: 5000,
    });

    // Verify files were extracted
    const readme = await fs.readFile(path.join(extractDir, "package/readme.txt"), "utf-8");
    expect(readme).toBe("Hello World");

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
