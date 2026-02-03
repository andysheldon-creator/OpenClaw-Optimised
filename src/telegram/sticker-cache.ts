import path from "node:path";
import { z } from "zod";
import type { OpenClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { describeImageWithVision } from "./vision-describe.js";

const CACHE_FILE = path.join(STATE_DIR, "telegram", "sticker-cache.json");
const CACHE_VERSION = 1;

export interface CachedSticker {
  fileId: string;
  fileUniqueId: string;
  emoji?: string;
  setName?: string;
  description: string;
  cachedAt: string;
  receivedFrom?: string;
}

// Zod schema for runtime validation of cache structure
const CachedStickerSchema = z.object({
  fileId: z.string(),
  fileUniqueId: z.string(),
  emoji: z.string().optional(),
  setName: z.string().optional(),
  description: z.string(),
  cachedAt: z.string(),
  receivedFrom: z.string().optional(),
});

const StickerCacheSchema = z.object({
  version: z.number(),
  stickers: z.record(z.string(), CachedStickerSchema),
});

type StickerCache = z.infer<typeof StickerCacheSchema>;

// Simple in-memory lock for cache operations to prevent race conditions
let cacheLock: Promise<void> = Promise.resolve();

async function withCacheLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const previousLock = cacheLock;
  let resolve: () => void;
  cacheLock = new Promise((r) => {
    resolve = r;
  });
  try {
    await previousLock;
    return await fn();
  } finally {
    resolve!();
  }
}

function loadCache(): StickerCache {
  const data = loadJsonFile(CACHE_FILE);
  if (!data || typeof data !== "object") {
    return { version: CACHE_VERSION, stickers: {} };
  }

  // Validate cache structure with Zod
  const result = StickerCacheSchema.safeParse(data);
  if (!result.success) {
    return { version: CACHE_VERSION, stickers: {} };
  }

  if (result.data.version !== CACHE_VERSION) {
    return { version: CACHE_VERSION, stickers: {} };
  }

  return result.data;
}

function saveCache(cache: StickerCache): void {
  saveJsonFile(CACHE_FILE, cache);
}

/**
 * Get a cached sticker by its unique ID.
 */
export function getCachedSticker(fileUniqueId: string): CachedSticker | null {
  const cache = loadCache();
  return cache.stickers[fileUniqueId] ?? null;
}

/**
 * Add or update a sticker in the cache.
 * Uses locking to prevent race conditions during concurrent writes.
 */
export function cacheSticker(sticker: CachedSticker): void {
  // Synchronous version for backwards compatibility
  const cache = loadCache();
  cache.stickers[sticker.fileUniqueId] = sticker;
  saveCache(cache);
}

/**
 * Add or update a sticker in the cache with locking.
 * Prevents race conditions during concurrent writes.
 */
export async function cacheStickerAsync(sticker: CachedSticker): Promise<void> {
  await withCacheLock(() => {
    const cache = loadCache();
    cache.stickers[sticker.fileUniqueId] = sticker;
    saveCache(cache);
  });
}

/**
 * Search cached stickers by text query (fuzzy match on description + emoji + setName).
 */
export function searchStickers(query: string, limit = 10): CachedSticker[] {
  const cache = loadCache();
  const queryLower = query.toLowerCase();
  const results: Array<{ sticker: CachedSticker; score: number }> = [];

  for (const sticker of Object.values(cache.stickers)) {
    let score = 0;
    const descLower = sticker.description.toLowerCase();

    // Exact substring match in description
    if (descLower.includes(queryLower)) {
      score += 10;
    }

    // Word-level matching
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    const descWords = descLower.split(/\s+/);
    for (const qWord of queryWords) {
      if (descWords.some((dWord) => dWord.includes(qWord))) {
        score += 5;
      }
    }

    // Emoji match
    if (sticker.emoji && query.includes(sticker.emoji)) {
      score += 8;
    }

    // Set name match
    if (sticker.setName?.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    if (score > 0) {
      results.push({ sticker, score });
    }
  }

  return results
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.sticker);
}

/**
 * Get all cached stickers (for debugging/listing).
 */
export function getAllCachedStickers(): CachedSticker[] {
  const cache = loadCache();
  return Object.values(cache.stickers);
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): { count: number; oldestAt?: string; newestAt?: string } {
  const cache = loadCache();
  const stickers = Object.values(cache.stickers);
  if (stickers.length === 0) {
    return { count: 0 };
  }
  const sorted = [...stickers].toSorted(
    (a, b) => new Date(a.cachedAt).getTime() - new Date(b.cachedAt).getTime(),
  );
  return {
    count: stickers.length,
    oldestAt: sorted[0]?.cachedAt,
    newestAt: sorted[sorted.length - 1]?.cachedAt,
  };
}

const STICKER_DESCRIPTION_PROMPT =
  "Describe this sticker image in 1-2 sentences. Focus on what the sticker depicts (character, object, action, emotion). Be concise and objective.";

export interface DescribeStickerParams {
  imagePath: string;
  cfg: OpenClawConfig;
  agentDir?: string;
  agentId?: string;
  contentType?: string;
}

/**
 * Describe a sticker image using vision API.
 * Auto-detects an available vision provider based on configured API keys.
 * Returns null if no vision provider is available.
 */
export async function describeStickerImage(params: DescribeStickerParams): Promise<string | null> {
  return describeImageWithVision({
    imagePath: params.imagePath,
    cfg: params.cfg,
    agentDir: params.agentDir,
    agentId: params.agentId,
    prompt: STICKER_DESCRIPTION_PROMPT,
    fileName: "sticker.webp",
    logPrefix: "telegram",
    contentType: params.contentType,
  });
}
