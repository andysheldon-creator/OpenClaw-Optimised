import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireSummaryLock, isLockHeld } from "./lock.js";

vi.mock("../../config/paths.js", () => ({
  resolveStateDir: vi.fn(),
}));

import { resolveStateDir } from "../../config/paths.js";

describe("file-based locking", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hmem-lock-test-"));
    vi.mocked(resolveStateDir).mockReturnValue(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("acquireSummaryLock", () => {
    it("acquires lock when no lock file exists", async () => {
      const lock = await acquireSummaryLock("test-agent");
      expect(lock).not.toBeNull();
      await lock!.release();
    });

    it("returns null when lock file exists and is fresh", async () => {
      const lock1 = await acquireSummaryLock("test-agent");
      expect(lock1).not.toBeNull();

      const lock2 = await acquireSummaryLock("test-agent");
      expect(lock2).toBeNull();

      await lock1!.release();
    });

    it("acquires lock when existing lock is stale", async () => {
      // Acquire and release to create the file structure
      const lock1 = await acquireSummaryLock("test-agent");
      expect(lock1).not.toBeNull();

      // Find and age the lock file
      const lockDir = path.join(tempDir, "agents", "test-agent", "memory", "summaries");
      const lockFile = path.join(lockDir, ".worker.lock");

      // Set mtime to 15 minutes ago (stale threshold is 10 min)
      const staleTime = new Date(Date.now() - 15 * 60 * 1000);
      await fs.utimes(lockFile, staleTime, staleTime);

      // Should acquire because lock is stale
      const lock2 = await acquireSummaryLock("test-agent");
      expect(lock2).not.toBeNull();
      await lock2!.release();
    });

    it("release() removes the lock file", async () => {
      const lock = await acquireSummaryLock("test-agent");
      expect(lock).not.toBeNull();

      const lockDir = path.join(tempDir, "agents", "test-agent", "memory", "summaries");
      const lockFile = path.join(lockDir, ".worker.lock");

      // File should exist
      await expect(fs.stat(lockFile)).resolves.toBeTruthy();

      await lock!.release();

      // File should be gone
      await expect(fs.stat(lockFile)).rejects.toThrow();
    });

    it("release() does not throw when lock file already removed", async () => {
      const lock = await acquireSummaryLock("test-agent");
      expect(lock).not.toBeNull();

      // Manually remove the lock file
      const lockDir = path.join(tempDir, "agents", "test-agent", "memory", "summaries");
      const lockFile = path.join(lockDir, ".worker.lock");
      await fs.unlink(lockFile);

      // Release should not throw
      await expect(lock!.release()).resolves.toBeUndefined();
    });
  });

  describe("isLockHeld", () => {
    it("returns false when no lock file exists", async () => {
      expect(await isLockHeld("test-agent")).toBe(false);
    });

    it("returns true when lock file exists and is fresh", async () => {
      const lock = await acquireSummaryLock("test-agent");
      expect(lock).not.toBeNull();

      expect(await isLockHeld("test-agent")).toBe(true);
      await lock!.release();
    });

    it("returns false when lock file exists but is stale", async () => {
      const lock = await acquireSummaryLock("test-agent");
      expect(lock).not.toBeNull();

      // Age the lock file
      const lockDir = path.join(tempDir, "agents", "test-agent", "memory", "summaries");
      const lockFile = path.join(lockDir, ".worker.lock");
      const staleTime = new Date(Date.now() - 15 * 60 * 1000);
      await fs.utimes(lockFile, staleTime, staleTime);

      expect(await isLockHeld("test-agent")).toBe(false);
    });
  });
});
