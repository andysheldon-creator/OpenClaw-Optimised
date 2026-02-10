import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  persistSession,
  loadPersistedSession,
  findInterruptedSessions,
  removePersistedSession,
  cleanupStaleSessions,
  shouldPersist,
  formatResumePrompt,
  type PersistedSession,
} from "./session-persistence.js";

function makeSession(overrides: Partial<PersistedSession> = {}): PersistedSession {
  return {
    sessionKey: "test-session-1",
    channelType: "slack",
    channelId: "C123",
    messages: [
      { role: "user", content: "hello", timestamp: Date.now() - 5000 },
      { role: "assistant", content: "hi there", timestamp: Date.now() - 4000 },
    ],
    tokenCount: 1500,
    contextTokens: 128000,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    messageCount: 10,
    metadata: {},
    ...overrides,
  };
}

describe("session-persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-persist-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("shouldPersist", () => {
    it("returns true at interval boundaries", () => {
      expect(shouldPersist(10)).toBe(true);
      expect(shouldPersist(20)).toBe(true);
      expect(shouldPersist(30)).toBe(true);
    });
    it("returns false otherwise", () => {
      expect(shouldPersist(0)).toBe(false);
      expect(shouldPersist(5)).toBe(false);
      expect(shouldPersist(11)).toBe(false);
    });
  });

  describe("persistSession / loadPersistedSession", () => {
    it("saves and loads session", () => {
      const session = makeSession();
      persistSession(session, { persistDir: tmpDir });

      const loaded = loadPersistedSession(tmpDir, "test-session-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionKey).toBe("test-session-1");
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.tokenCount).toBe(1500);
    });

    it("returns null for nonexistent session", () => {
      expect(loadPersistedSession(tmpDir, "nonexistent")).toBeNull();
    });
  });

  describe("findInterruptedSessions", () => {
    it("finds recent sessions", () => {
      persistSession(makeSession({ sessionKey: "s1", updatedAt: Date.now() }), {
        persistDir: tmpDir,
      });
      persistSession(makeSession({ sessionKey: "s2", updatedAt: Date.now() - 1000 }), {
        persistDir: tmpDir,
      });

      const found = findInterruptedSessions({ persistDir: tmpDir });
      expect(found).toHaveLength(2);
      expect(found[0].sessionKey).toBe("s1"); // most recent first
    });

    it("excludes stale sessions", () => {
      persistSession(
        makeSession({ sessionKey: "old", updatedAt: Date.now() - 48 * 60 * 60 * 1000 }),
        { persistDir: tmpDir },
      );
      const found = findInterruptedSessions({ persistDir: tmpDir, maxAgeMs: 24 * 60 * 60 * 1000 });
      expect(found).toHaveLength(0);
    });
  });

  describe("removePersistedSession", () => {
    it("removes session file", () => {
      persistSession(makeSession(), { persistDir: tmpDir });
      expect(loadPersistedSession(tmpDir, "test-session-1")).not.toBeNull();

      removePersistedSession(tmpDir, "test-session-1");
      expect(loadPersistedSession(tmpDir, "test-session-1")).toBeNull();
    });
  });

  describe("cleanupStaleSessions", () => {
    it("removes only stale sessions", () => {
      persistSession(makeSession({ sessionKey: "fresh", updatedAt: Date.now() }), {
        persistDir: tmpDir,
      });
      persistSession(
        makeSession({ sessionKey: "stale", updatedAt: Date.now() - 48 * 60 * 60 * 1000 }),
        { persistDir: tmpDir },
      );

      const cleaned = cleanupStaleSessions({ persistDir: tmpDir, maxAgeMs: 24 * 60 * 60 * 1000 });
      expect(cleaned).toBe(1);
      expect(loadPersistedSession(tmpDir, "fresh")).not.toBeNull();
      expect(loadPersistedSession(tmpDir, "stale")).toBeNull();
    });
  });

  describe("formatResumePrompt", () => {
    it("formats prompt for interrupted sessions", () => {
      const sessions = [makeSession({ sessionKey: "s1", messageCount: 42, model: "opus" })];
      const prompt = formatResumePrompt(sessions);
      expect(prompt).toContain("Interrupted sessions");
      expect(prompt).toContain("s1");
      expect(prompt).toContain("42 messages");
    });

    it("returns empty for no sessions", () => {
      expect(formatResumePrompt([])).toBe("");
    });
  });
});
