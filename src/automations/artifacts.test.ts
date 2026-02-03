/**
 * Tests for artifact storage system.
 */

import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArtifactStorage, formatBytes, resolveArtifactsDir } from "./artifacts.js";

describe("ArtifactStorage", () => {
  let tempDir: string;
  let storage: ArtifactStorage;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawdbrain-artifacts-test-${crypto.randomUUID()}`);
    storage = new ArtifactStorage({
      artifactsDir: tempDir,
      baseUrl: "/test/artifacts",
    });
    await storage.init();
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("init", () => {
    it("should create artifacts directory", async () => {
      expect(existsSync(tempDir)).toBe(true);
    });

    it("should handle existing directory", async () => {
      await storage.init();
      expect(existsSync(tempDir)).toBe(true);
    });
  });

  describe("storeBuffer", () => {
    it("should store a buffer artifact", async () => {
      const runId = "test-run-1";
      const name = "test-output.txt";
      const type = "text/plain";
      const data = Buffer.from("Hello, World!");

      const artifact = await storage.storeBuffer(runId, name, type, data);

      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe(name);
      expect(artifact.type).toBe(type);
      expect(artifact.size).toBe("13 B");
      expect(artifact.url).toBe("/test/artifacts/test-run-1/" + artifact.id);
    });

    it("should create run directory", async () => {
      const runId = "test-run-2";
      const data = Buffer.from("test");

      await storage.storeBuffer(runId, "test.txt", "text/plain", data);

      const runDir = path.join(tempDir, runId);
      expect(existsSync(runDir)).toBe(true);
    });
  });

  describe("storeFile", () => {
    it("should copy and store a file", async () => {
      const runId = "test-run-3";
      const sourcePath = path.join(tempDir, "source.txt");
      const fs = await import("node:fs/promises");
      await fs.writeFile(sourcePath, "source content");

      const artifact = await storage.storeFile(runId, "copied.txt", "text/plain", sourcePath);

      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe("copied.txt");
    });
  });

  describe("storeText", () => {
    it("should store text as artifact", async () => {
      const runId = "test-run-4";
      const content = "Text content for testing";

      const artifact = await storage.storeText(runId, "test.txt", "text/plain", content);

      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe("test.txt");
    });
  });

  describe("getArtifact", () => {
    it("should retrieve stored artifact", async () => {
      const runId = "test-run-5";
      const data = Buffer.from("test data");

      const stored = await storage.storeBuffer(runId, "test.txt", "text/plain", data);
      const retrieved = await storage.getArtifact(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.filePath).toBeDefined();
    });

    it("should return null for non-existent artifact", async () => {
      const result = await storage.getArtifact("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("deleteRunArtifacts", () => {
    it("should delete all artifacts for a run", async () => {
      const runId = "test-run-6";
      await storage.storeBuffer(runId, "test1.txt", "text/plain", Buffer.from("test1"));
      await storage.storeBuffer(runId, "test2.txt", "text/plain", Buffer.from("test2"));

      const runDir = path.join(tempDir, runId);
      expect(existsSync(runDir)).toBe(true);

      await storage.deleteRunArtifacts(runId);

      expect(existsSync(runDir)).toBe(false);
    });
  });
});

describe("formatBytes", () => {
  it("should format bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });
});

describe("resolveArtifactsDir", () => {
  it("should use custom directory when provided", () => {
    const customDir = "/custom/artifacts/path";
    const result = resolveArtifactsDir(customDir);
    expect(result).toBe(customDir);
  });

  it("should use default when no custom dir", () => {
    const result = resolveArtifactsDir();
    expect(result).toContain(".clawdbrain");
    expect(result).toContain("automations");
    expect(result).toContain("artifacts");
  });
});
