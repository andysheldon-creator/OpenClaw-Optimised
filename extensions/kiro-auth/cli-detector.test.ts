import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findKiroCli, isWSL2 } from "./cli-detector.js";

describe("cli-detector", () => {
  describe("findKiroCli", () => {
    let originalPath: string | undefined;
    let tempDir: string;

    beforeEach(() => {
      originalPath = process.env.PATH;
      tempDir = join(
        tmpdir(),
        `kiro-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      process.env.PATH = originalPath;
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it("returns null when PATH is empty", () => {
      process.env.PATH = "";
      expect(findKiroCli()).toBeNull();
    });

    it("returns null when kiro-cli is not in PATH", () => {
      process.env.PATH = tempDir;
      expect(findKiroCli()).toBeNull();
    });

    it("finds kiro-cli in PATH", () => {
      const cliPath = join(tempDir, "kiro-cli");
      writeFileSync(cliPath, "#!/bin/sh\nexit 0\n", "utf-8");
      if (process.platform !== "win32") {
        chmodSync(cliPath, 0o755);
      }

      process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
      const result = findKiroCli();
      expect(result).toBe(cliPath);
    });

    it("finds q binary as fallback", () => {
      const qPath = join(tempDir, "q");
      writeFileSync(qPath, "#!/bin/sh\nexit 0\n", "utf-8");
      if (process.platform !== "win32") {
        chmodSync(qPath, 0o755);
      }

      process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
      const result = findKiroCli();
      expect(result).toBe(qPath);
    });

    it("prefers kiro-cli over q when both exist", () => {
      const cliPath = join(tempDir, "kiro-cli");
      const qPath = join(tempDir, "q");
      writeFileSync(cliPath, "#!/bin/sh\nexit 0\n", "utf-8");
      writeFileSync(qPath, "#!/bin/sh\nexit 0\n", "utf-8");
      if (process.platform !== "win32") {
        chmodSync(cliPath, 0o755);
        chmodSync(qPath, 0o755);
      }

      process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
      const result = findKiroCli();
      expect(result).toBe(cliPath);
    });

    if (process.platform === "win32") {
      it("finds kiro-cli.cmd on Windows", () => {
        const cliPath = join(tempDir, "kiro-cli.cmd");
        writeFileSync(cliPath, "@echo off\nexit /b 0\n", "utf-8");

        process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
        const result = findKiroCli();
        expect(result).toBe(cliPath);
      });

      it("finds kiro-cli.exe on Windows", () => {
        const cliPath = join(tempDir, "kiro-cli.exe");
        writeFileSync(cliPath, "", "utf-8");

        process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
        const result = findKiroCli();
        expect(result).toBe(cliPath);
      });

      it("finds kiro-cli.bat on Windows", () => {
        const cliPath = join(tempDir, "kiro-cli.bat");
        writeFileSync(cliPath, "@echo off\nexit /b 0\n", "utf-8");

        process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ""}`;
        const result = findKiroCli();
        expect(result).toBe(cliPath);
      });
    }

    it("searches multiple PATH entries", () => {
      const dir1 = join(tempDir, "dir1");
      const dir2 = join(tempDir, "dir2");
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });

      const cliPath = join(dir2, "kiro-cli");
      writeFileSync(cliPath, "#!/bin/sh\nexit 0\n", "utf-8");
      if (process.platform !== "win32") {
        chmodSync(cliPath, 0o755);
      }

      process.env.PATH = `${dir1}${delimiter}${dir2}${delimiter}${originalPath ?? ""}`;
      const result = findKiroCli();
      expect(result).toBe(cliPath);
    });

    it("returns first match when kiro-cli exists in multiple PATH entries", () => {
      const dir1 = join(tempDir, "dir1");
      const dir2 = join(tempDir, "dir2");
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });

      const cliPath1 = join(dir1, "kiro-cli");
      const cliPath2 = join(dir2, "kiro-cli");
      writeFileSync(cliPath1, "#!/bin/sh\nexit 0\n", "utf-8");
      writeFileSync(cliPath2, "#!/bin/sh\nexit 0\n", "utf-8");
      if (process.platform !== "win32") {
        chmodSync(cliPath1, 0o755);
        chmodSync(cliPath2, 0o755);
      }

      process.env.PATH = `${dir1}${delimiter}${dir2}${delimiter}${originalPath ?? ""}`;
      const result = findKiroCli();
      expect(result).toBe(cliPath1);
    });
  });

  describe("isWSL2", () => {
    it("returns false on non-Linux platforms", () => {
      if (process.platform !== "linux") {
        expect(isWSL2()).toBe(false);
      }
    });

    // Note: We can't easily test the true case without mocking /proc/version
    // The function will return true only when running in actual WSL2
  });
});
