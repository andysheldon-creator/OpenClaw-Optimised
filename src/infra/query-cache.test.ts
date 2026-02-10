import { describe, expect, it, beforeEach } from "vitest";
import { QueryCache, generateCacheKey, cachedQuery, resetGlobalQueryCache } from "./query-cache.js";

describe("query-cache", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache();
    resetGlobalQueryCache();
  });

  describe("generateCacheKey", () => {
    it("produces consistent keys for same inputs", () => {
      const k1 = generateCacheKey("web_search", "test query", { count: 5 });
      const k2 = generateCacheKey("web_search", "test query", { count: 5 });
      expect(k1).toBe(k2);
    });

    it("produces different keys for different inputs", () => {
      const k1 = generateCacheKey("web_search", "query 1");
      const k2 = generateCacheKey("web_search", "query 2");
      expect(k1).not.toBe(k2);
    });

    it("produces 32-char hex string", () => {
      const key = generateCacheKey("service", "query");
      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("QueryCache", () => {
    it("stores and retrieves values", () => {
      cache.set({ key: "k1", category: "web_search", value: { result: "hello" } });
      expect(cache.get("k1")).toEqual({ result: "hello" });
    });

    it("returns undefined for missing keys", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("respects TTL", () => {
      cache.set({ key: "k1", category: "web_search", value: "data", ttlMs: 1 });
      // Immediately should work
      expect(cache.has("k1")).toBe(true);
    });

    it("evicts expired entries on purge", async () => {
      cache.set({ key: "k1", category: "web_search", value: "data", ttlMs: 10 });
      await new Promise((r) => setTimeout(r, 20));
      const purged = cache.purgeExpired();
      expect(purged).toBe(1);
      expect(cache.get("k1")).toBeUndefined();
    });

    it("evicts when max entries exceeded", () => {
      const small = new QueryCache({ maxEntries: 3 });
      small.set({ key: "k1", category: "web_search", value: "a" });
      small.set({ key: "k2", category: "web_search", value: "b" });
      small.set({ key: "k3", category: "web_search", value: "c" });
      small.set({ key: "k4", category: "web_search", value: "d" });
      const stats = small.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(3);
      expect(stats.evictionCount).toBeGreaterThan(0);
    });

    it("tracks hit/miss stats", () => {
      cache.set({ key: "k1", category: "docs", value: "data" });
      cache.get("k1"); // hit
      cache.get("k1"); // hit
      cache.get("missing"); // miss
      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 1);
    });

    it("tracks entries by category", () => {
      cache.set({ key: "k1", category: "web_search", value: "a" });
      cache.set({ key: "k2", category: "web_search", value: "b" });
      cache.set({ key: "k3", category: "docs", value: "c" });
      const stats = cache.getStats();
      expect(stats.entriesByCategory.web_search).toBe(2);
      expect(stats.entriesByCategory.docs).toBe(1);
    });

    it("deletes entries", () => {
      cache.set({ key: "k1", category: "api", value: "data" });
      expect(cache.delete("k1")).toBe(true);
      expect(cache.get("k1")).toBeUndefined();
    });

    it("clears all entries", () => {
      cache.set({ key: "k1", category: "api", value: "a" });
      cache.set({ key: "k2", category: "api", value: "b" });
      cache.clear();
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitCount).toBe(0);
    });

    it("returns miss when disabled", () => {
      const disabled = new QueryCache({ enabled: false });
      disabled.set({ key: "k1", category: "api", value: "data" });
      expect(disabled.get("k1")).toBeUndefined();
    });
  });

  describe("cachedQuery", () => {
    it("executes on cache miss", async () => {
      let called = 0;
      const result = await cachedQuery({
        service: "test",
        query: "q1",
        category: "api",
        execute: async () => {
          called++;
          return "result";
        },
        cache,
      });
      expect(result.value).toBe("result");
      expect(result.cached).toBe(false);
      expect(called).toBe(1);
    });

    it("returns cached on hit", async () => {
      let called = 0;
      const execute = async () => {
        called++;
        return "result";
      };

      await cachedQuery({ service: "test", query: "q1", category: "api", execute, cache });
      const result = await cachedQuery({
        service: "test",
        query: "q1",
        category: "api",
        execute,
        cache,
      });

      expect(result.value).toBe("result");
      expect(result.cached).toBe(true);
      expect(called).toBe(1); // Only called once
    });

    it("uses different keys for different params", async () => {
      let called = 0;
      const execute = async () => {
        called++;
        return `result-${called}`;
      };

      const r1 = await cachedQuery({
        service: "s",
        query: "q",
        queryParams: { a: 1 },
        category: "api",
        execute,
        cache,
      });
      const r2 = await cachedQuery({
        service: "s",
        query: "q",
        queryParams: { a: 2 },
        category: "api",
        execute,
        cache,
      });

      expect(r1.value).toBe("result-1");
      expect(r2.value).toBe("result-2");
      expect(called).toBe(2);
    });
  });
});
