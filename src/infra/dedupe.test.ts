import { describe, expect, it } from "vitest";
import { createDedupeCache, createLruCache } from "./dedupe.js";

describe("createDedupeCache", () => {
  it("marks duplicates within TTL", () => {
    const cache = createDedupeCache({ ttlMs: 1000, maxSize: 10 });
    expect(cache.check("a", 100)).toBe(false);
    expect(cache.check("a", 500)).toBe(true);
  });

  it("expires entries after TTL", () => {
    const cache = createDedupeCache({ ttlMs: 1000, maxSize: 10 });
    expect(cache.check("a", 100)).toBe(false);
    expect(cache.check("a", 1501)).toBe(false);
  });

  it("evicts oldest entries when over max size", () => {
    const cache = createDedupeCache({ ttlMs: 10_000, maxSize: 2 });
    expect(cache.check("a", 100)).toBe(false);
    expect(cache.check("b", 200)).toBe(false);
    expect(cache.check("c", 300)).toBe(false);
    expect(cache.check("a", 400)).toBe(false);
  });

  it("prunes expired entries even when refreshed keys are older in insertion order", () => {
    const cache = createDedupeCache({ ttlMs: 100, maxSize: 10 });
    expect(cache.check("a", 0)).toBe(false);
    expect(cache.check("b", 50)).toBe(false);
    expect(cache.check("a", 120)).toBe(false);
    expect(cache.check("c", 200)).toBe(false);
    expect(cache.size()).toBe(2);
  });
});

describe("createLruCache", () => {
  it("stores and retrieves values", () => {
    const cache = createLruCache<string>();
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = createLruCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest entries when maxSize exceeded", () => {
    const cache = createLruCache<number>({ maxSize: 2, ttlMs: 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined(); // evicted
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("expires entries after TTL", async () => {
    const cache = createLruCache<string>({ ttlMs: 50 });
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("key")).toBeUndefined();
  });

  it("updates LRU order on get", () => {
    const cache = createLruCache<number>({ maxSize: 2, ttlMs: 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // Touch 'a', making 'b' oldest
    cache.set("c", 3); // Should evict 'b'
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("has() returns correct values", () => {
    const cache = createLruCache<string>();
    expect(cache.has("key")).toBe(false);
    cache.set("key", "value");
    expect(cache.has("key")).toBe(true);
  });

  it("delete() removes entries", () => {
    const cache = createLruCache<string>();
    cache.set("key", "value");
    expect(cache.delete("key")).toBe(true);
    expect(cache.get("key")).toBeUndefined();
  });

  it("clear() removes all entries", () => {
    const cache = createLruCache<number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
