import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheCustomEmoji,
  cacheCustomEmojiAsync,
  getAllCachedCustomEmojis,
  getCachedCustomEmoji,
  getCustomEmojiCacheStats,
} from "./custom-emoji-cache.js";

// Mock the state directory to use a temp location
vi.mock("../config/paths.js", () => ({
  STATE_DIR: "/tmp/openclaw-test-custom-emoji-cache",
}));

const TEST_CACHE_DIR = "/tmp/openclaw-test-custom-emoji-cache/telegram";
const TEST_CACHE_FILE = path.join(TEST_CACHE_DIR, "custom-emoji-cache.json");

describe("custom-emoji-cache", () => {
  beforeEach(() => {
    // Clean up before each test
    if (fs.existsSync(TEST_CACHE_FILE)) {
      fs.unlinkSync(TEST_CACHE_FILE);
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (fs.existsSync(TEST_CACHE_FILE)) {
      fs.unlinkSync(TEST_CACHE_FILE);
    }
  });

  describe("getCachedCustomEmoji", () => {
    it("returns null for unknown ID", () => {
      const result = getCachedCustomEmoji("unknown-id");
      expect(result).toBeNull();
    });

    it("returns cached emoji after cacheCustomEmoji", () => {
      const emoji = {
        customEmojiId: "emoji123",
        fileId: "file123",
        fileUniqueId: "unique123",
        emoji: "🎉",
        setName: "TestPack",
        description: "A party popper emoji",
        cachedAt: "2026-01-26T12:00:00.000Z",
      };

      cacheCustomEmoji(emoji);
      const result = getCachedCustomEmoji("emoji123");

      expect(result).toEqual(emoji);
    });

    it("returns null after cache is cleared", () => {
      const emoji = {
        customEmojiId: "emoji123",
        emoji: "🎉",
        description: "test",
        cachedAt: "2026-01-26T12:00:00.000Z",
      };

      cacheCustomEmoji(emoji);
      expect(getCachedCustomEmoji("emoji123")).not.toBeNull();

      // Manually clear the cache file
      fs.unlinkSync(TEST_CACHE_FILE);

      expect(getCachedCustomEmoji("emoji123")).toBeNull();
    });
  });

  describe("cacheCustomEmoji", () => {
    it("adds entry to cache", () => {
      const emoji = {
        customEmojiId: "emoji456",
        emoji: "🦊",
        description: "A cute fox",
        cachedAt: "2026-01-26T12:00:00.000Z",
      };

      cacheCustomEmoji(emoji);

      const all = getAllCachedCustomEmojis();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(emoji);
    });

    it("updates existing entry", () => {
      const original = {
        customEmojiId: "emoji789",
        emoji: "🐱",
        description: "Original description",
        cachedAt: "2026-01-26T12:00:00.000Z",
      };
      const updated = {
        customEmojiId: "emoji789",
        emoji: "🐱",
        description: "Updated description",
        cachedAt: "2026-01-26T13:00:00.000Z",
      };

      cacheCustomEmoji(original);
      cacheCustomEmoji(updated);

      const result = getCachedCustomEmoji("emoji789");
      expect(result?.description).toBe("Updated description");
    });
  });

  describe("cacheCustomEmojiAsync", () => {
    it("adds entry to cache with locking", async () => {
      const emoji = {
        customEmojiId: "async-emoji",
        emoji: "🔥",
        description: "A fire emoji",
        cachedAt: "2026-01-26T12:00:00.000Z",
      };

      await cacheCustomEmojiAsync(emoji);

      const result = getCachedCustomEmoji("async-emoji");
      expect(result).toEqual(emoji);
    });

    it("handles concurrent writes without data loss", async () => {
      const emojis = Array.from({ length: 10 }, (_, i) => ({
        customEmojiId: `concurrent-${i}`,
        emoji: String.fromCodePoint(0x1f600 + i),
        description: `Emoji ${i}`,
        cachedAt: new Date().toISOString(),
      }));

      // Write all emojis concurrently
      await Promise.all(emojis.map((e) => cacheCustomEmojiAsync(e)));

      // Verify all emojis were saved
      const all = getAllCachedCustomEmojis();
      expect(all).toHaveLength(10);

      for (const emoji of emojis) {
        const cached = getCachedCustomEmoji(emoji.customEmojiId);
        expect(cached).not.toBeNull();
        expect(cached?.description).toBe(emoji.description);
      }
    });
  });

  describe("getAllCachedCustomEmojis", () => {
    it("returns empty array when cache is empty", () => {
      const result = getAllCachedCustomEmojis();
      expect(result).toEqual([]);
    });

    it("returns all cached emojis", () => {
      cacheCustomEmoji({
        customEmojiId: "a",
        emoji: "🅰️",
        description: "Letter A",
        cachedAt: "2026-01-26T10:00:00.000Z",
      });
      cacheCustomEmoji({
        customEmojiId: "b",
        emoji: "🅱️",
        description: "Letter B",
        cachedAt: "2026-01-26T11:00:00.000Z",
      });

      const result = getAllCachedCustomEmojis();
      expect(result).toHaveLength(2);
    });
  });

  describe("getCustomEmojiCacheStats", () => {
    it("returns count 0 when cache is empty", () => {
      const stats = getCustomEmojiCacheStats();
      expect(stats.count).toBe(0);
      expect(stats.oldestAt).toBeUndefined();
      expect(stats.newestAt).toBeUndefined();
    });

    it("returns correct stats with cached emojis", () => {
      cacheCustomEmoji({
        customEmojiId: "old",
        emoji: "👴",
        description: "Old emoji",
        cachedAt: "2026-01-20T10:00:00.000Z",
      });
      cacheCustomEmoji({
        customEmojiId: "new",
        emoji: "👶",
        description: "New emoji",
        cachedAt: "2026-01-26T10:00:00.000Z",
      });
      cacheCustomEmoji({
        customEmojiId: "mid",
        emoji: "🧑",
        description: "Middle emoji",
        cachedAt: "2026-01-23T10:00:00.000Z",
      });

      const stats = getCustomEmojiCacheStats();
      expect(stats.count).toBe(3);
      expect(stats.oldestAt).toBe("2026-01-20T10:00:00.000Z");
      expect(stats.newestAt).toBe("2026-01-26T10:00:00.000Z");
    });
  });

  describe("cache validation", () => {
    it("handles malformed cache gracefully", () => {
      // Write invalid JSON structure
      if (!fs.existsSync(TEST_CACHE_DIR)) {
        fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(TEST_CACHE_FILE, '{"version": 1, "emojis": "not-an-object"}');

      // Should return empty cache without throwing
      const result = getCachedCustomEmoji("any-id");
      expect(result).toBeNull();
    });

    it("handles version mismatch gracefully", () => {
      // Write cache with wrong version
      if (!fs.existsSync(TEST_CACHE_DIR)) {
        fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify({
          version: 999,
          emojis: {
            test: { customEmojiId: "test", emoji: "🎉", description: "test", cachedAt: "" },
          },
        }),
      );

      // Should return empty cache
      const result = getCachedCustomEmoji("test");
      expect(result).toBeNull();
    });

    it("handles missing required fields gracefully", () => {
      // Write cache with missing required fields
      if (!fs.existsSync(TEST_CACHE_DIR)) {
        fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify({
          version: 1,
          emojis: { test: { customEmojiId: "test" } }, // Missing required fields
        }),
      );

      // Should return empty cache without throwing
      const result = getCachedCustomEmoji("test");
      expect(result).toBeNull();
    });
  });
});
