/**
 * Tests for automations store.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  loadAutomationsStore,
  saveAutomationsStore,
  resolveAutomationsStorePath,
  cleanOldHistory,
  DEFAULT_AUTOMATIONS_DIR,
  DEFAULT_AUTOMATIONS_STORE_PATH,
} from "./store.js";
import type { AutomationStoreFile } from "./types.js";

describe("Automations Store", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `clawdbrain-automations-test-${crypto.randomUUID()}`);
    storePath = path.join(tempDir, "automations.json");
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("resolveAutomationsStorePath", () => {
    it("should use custom path when provided", () => {
      const customPath = "/custom/store/path.json";
      const result = resolveAutomationsStorePath(customPath);
      expect(result).toBe(customPath);
    });

    it("should use default when no custom path", () => {
      const result = resolveAutomationsStorePath();
      expect(result).toContain(".clawdbrain");
      expect(result).toContain("automations");
      expect(result).toContain("automations.json");
    });
  });

  describe("DEFAULT_AUTOMATIONS_DIR", () => {
    it("should contain automations path", () => {
      expect(DEFAULT_AUTOMATIONS_DIR).toContain("automations");
    });
  });

  describe("DEFAULT_AUTOMATIONS_STORE_PATH", () => {
    it("should end with automations.json", () => {
      expect(DEFAULT_AUTOMATIONS_STORE_PATH).toMatch(/automations\.json$/);
    });
  });

  describe("loadAutomationsStore", () => {
    it("should create new store if file does not exist", async () => {
      const store = await loadAutomationsStore(storePath);

      expect(store.version).toBe(1);
      expect(store.automations).toEqual([]);
      expect(store.runHistory).toEqual([]);
    });

    it("should load existing store", async () => {
      const fs = await import("node:fs/promises");
      const testStore: AutomationStoreFile = {
        version: 1,
        automations: [],
        runHistory: [],
        historyRetentionDays: 30,
        historyMaxRunsPerAutomation: 100,
      };
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(testStore, null, 2));

      const loaded = await loadAutomationsStore(storePath);

      expect(loaded.version).toBe(1);
      expect(loaded.automations).toEqual([]);
    });
  });

  describe("saveAutomationsStore", () => {
    it("should save store to file", async () => {
      const testStore: AutomationStoreFile = {
        version: 1,
        automations: [],
        runHistory: [],
        historyRetentionDays: 30,
        historyMaxRunsPerAutomation: 100,
      };

      await saveAutomationsStore(storePath, testStore);

      expect(existsSync(storePath)).toBe(true);

      const fs = await import("node:fs/promises");
      const content = await fs.readFile(storePath, "utf-8");
      const parsed = JSON.parse(content) as AutomationStoreFile;

      expect(parsed.version).toBe(1);
      expect(parsed.automations).toEqual([]);
    });

    it("should create backup", async () => {
      const testStore: AutomationStoreFile = {
        version: 1,
        automations: [],
        runHistory: [],
        historyRetentionDays: 30,
        historyMaxRunsPerAutomation: 100,
      };

      await saveAutomationsStore(storePath, testStore);

      const backupPath = `${storePath}.bak`;
      expect(existsSync(backupPath)).toBe(true);
    });
  });

  describe("cleanOldHistory", () => {
    it("should remove old run history entries", () => {
      const now = Date.now();
      const testStore: AutomationStoreFile = {
        version: 1,
        automations: [],
        runHistory: [
          {
            id: "old-run",
            automationId: "auto-1",
            automationName: "Test Automation",
            startedAt: new Date(now - 40 * 24 * 60 * 60 * 1000), // 40 days ago
            status: "success",
            milestones: [],
            artifacts: [],
            conflicts: [],
            triggeredBy: "schedule",
          },
          {
            id: "recent-run",
            automationId: "auto-1",
            automationName: "Test Automation",
            startedAt: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago
            status: "success",
            milestones: [],
            artifacts: [],
            conflicts: [],
            triggeredBy: "schedule",
          },
        ],
        historyRetentionDays: 30,
        historyMaxRunsPerAutomation: 100,
      };

      cleanOldHistory(testStore);

      expect(testStore.runHistory).toHaveLength(1);
      expect(testStore.runHistory[0].id).toBe("recent-run");
    });

    it("should limit runs per automation", () => {
      const testStore: AutomationStoreFile = {
        version: 1,
        automations: [],
        runHistory: Array.from({ length: 150 }, (_, i) => ({
          id: `run-${i}`,
          automationId: "auto-1",
          automationName: "Test Automation",
          startedAt: new Date(),
          status: "success" as const,
          milestones: [],
          artifacts: [],
          conflicts: [],
          triggeredBy: "schedule" as const,
        })),
        historyRetentionDays: 30,
        historyMaxRunsPerAutomation: 100,
      };

      cleanOldHistory(testStore);

      const autoRuns = testStore.runHistory.filter((r) => r.automationId === "auto-1");
      expect(autoRuns.length).toBeLessThanOrEqual(100);
    });
  });
});
