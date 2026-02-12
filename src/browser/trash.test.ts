import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock runExec before importing the module under test.
const runExecMock = vi.fn();
vi.mock("../process/exec.js", () => ({
  runExec: (...args: unknown[]) => runExecMock(...args),
}));

import { movePathToTrash } from "./trash.js";

describe("movePathToTrash", () => {
  let tmpDir: string;
  let targetFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trash-test-"));
    targetFile = path.join(tmpDir, "test-file.txt");
    fs.writeFileSync(targetFile, "hello");
    runExecMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the expected trash destination when the first trash command succeeds", async () => {
    runExecMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const result = await movePathToTrash(targetFile);

    // On macOS (default test platform), the trash destination is ~/.Trash/<basename>.
    const expected = path.join(os.homedir(), ".Trash", "test-file.txt");
    expect(result).toBe(expected);
    expect(runExecMock).toHaveBeenCalledTimes(1);
    expect(runExecMock).toHaveBeenCalledWith("trash", [targetFile], { timeoutMs: 10_000 });
  });

  it("tries subsequent commands when earlier ones fail (Linux)", async () => {
    // Simulate Linux platform for this test.
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", writable: true });

    // Use a custom XDG_DATA_HOME so the expected path is deterministic.
    const originalXdg = process.env["XDG_DATA_HOME"];
    const xdgDataHome = path.join(tmpDir, ".local", "share");
    process.env["XDG_DATA_HOME"] = xdgDataHome;

    try {
      // trash fails, gio trash succeeds
      runExecMock.mockRejectedValueOnce(new Error("trash not found"));
      runExecMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await movePathToTrash(targetFile);

      const expected = path.join(xdgDataHome, "Trash", "files", "test-file.txt");
      expect(result).toBe(expected);
      expect(runExecMock).toHaveBeenCalledTimes(2);
      expect(runExecMock).toHaveBeenNthCalledWith(1, "trash", [targetFile], { timeoutMs: 10_000 });
      expect(runExecMock).toHaveBeenNthCalledWith(2, "gio", ["trash", targetFile], {
        timeoutMs: 10_000,
      });
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
      if (originalXdg === undefined) {
        delete process.env["XDG_DATA_HOME"];
      } else {
        process.env["XDG_DATA_HOME"] = originalXdg;
      }
    }
  });

  it("tries trash-put when trash and gio both fail (Linux)", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", writable: true });

    // Use a custom XDG_DATA_HOME so the expected path is deterministic.
    const originalXdg = process.env["XDG_DATA_HOME"];
    const xdgDataHome = path.join(tmpDir, ".local", "share");
    process.env["XDG_DATA_HOME"] = xdgDataHome;

    try {
      runExecMock.mockRejectedValueOnce(new Error("trash not found"));
      runExecMock.mockRejectedValueOnce(new Error("gio not found"));
      runExecMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await movePathToTrash(targetFile);

      const expected = path.join(xdgDataHome, "Trash", "files", "test-file.txt");
      expect(result).toBe(expected);
      expect(runExecMock).toHaveBeenCalledTimes(3);
      expect(runExecMock).toHaveBeenNthCalledWith(3, "trash-put", [targetFile], {
        timeoutMs: 10_000,
      });
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
      if (originalXdg === undefined) {
        delete process.env["XDG_DATA_HOME"];
      } else {
        process.env["XDG_DATA_HOME"] = originalXdg;
      }
    }
  });

  it("falls back to manual XDG move on Linux when all commands fail", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", writable: true });

    // Use a custom XDG_DATA_HOME inside tmpDir so the test stays hermetic.
    const originalXdg = process.env["XDG_DATA_HOME"];
    const xdgDataHome = path.join(tmpDir, ".local", "share");
    process.env["XDG_DATA_HOME"] = xdgDataHome;

    try {
      // All commands fail.
      runExecMock.mockRejectedValue(new Error("not found"));

      const result = await movePathToTrash(targetFile);

      // File should no longer exist at original location.
      expect(fs.existsSync(targetFile)).toBe(false);

      // File should be in XDG trash.
      const trashFilesDir = path.join(xdgDataHome, "Trash", "files");
      const trashedEntries = fs.readdirSync(trashFilesDir);
      expect(trashedEntries.length).toBe(1);
      expect(fs.existsSync(path.join(trashFilesDir, trashedEntries[0]))).toBe(true);

      // Return value should be the actual trash destination.
      expect(result).toBe(path.join(trashFilesDir, trashedEntries[0]));

      // A .trashinfo file should exist in the info directory.
      const infoFile = path.join(xdgDataHome, "Trash", "info", `${trashedEntries[0]}.trashinfo`);
      expect(fs.existsSync(infoFile)).toBe(true);
      const infoContent = fs.readFileSync(infoFile, "utf8");
      expect(infoContent).toContain("[Trash Info]");
      expect(infoContent).toContain(`Path=${path.resolve(targetFile)}`);
      expect(infoContent).toContain("DeletionDate=");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
      if (originalXdg === undefined) {
        delete process.env["XDG_DATA_HOME"];
      } else {
        process.env["XDG_DATA_HOME"] = originalXdg;
      }
    }
  });

  it("falls back to ~/.Trash on macOS when trash command fails", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });

    try {
      runExecMock.mockRejectedValue(new Error("not found"));

      const result = await movePathToTrash(targetFile);

      // Return value should be the actual trash destination (inside ~/.Trash).
      const trashDir = path.join(os.homedir(), ".Trash");
      expect(result).toContain(trashDir);
      expect(result).toContain("test-file.txt");
      expect(fs.existsSync(targetFile)).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
    }
  });

  it("only tries trash command on macOS (no gio/trash-put)", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });

    try {
      runExecMock.mockRejectedValue(new Error("not found"));

      await movePathToTrash(targetFile);

      // On macOS only the `trash` command should be tried before manual fallback.
      expect(runExecMock).toHaveBeenCalledTimes(1);
      expect(runExecMock).toHaveBeenCalledWith("trash", [targetFile], { timeoutMs: 10_000 });
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
    }
  });
});
