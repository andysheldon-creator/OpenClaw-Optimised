import path from "node:path";
import { z } from "zod";
import type { OpenClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { describeImageWithVision } from "./vision-describe.js";

const CACHE_FILE = path.join(STATE_DIR, "telegram", "custom-emoji-cache.json");
const CACHE_VERSION = 1;

export interface CachedCustomEmoji {
  customEmojiId: string;
  fileId?: string;
  fileUniqueId?: string;
  emoji: string;
  setName?: string;
  description: string;
  cachedAt: string;
}

// Zod schema for runtime validation of cache structure
const CachedCustomEmojiSchema = z.object({
  customEmojiId: z.string(),
  fileId: z.string().optional(),
  fileUniqueId: z.string().optional(),
  emoji: z.string(),
  setName: z.string().optional(),
  description: z.string(),
  cachedAt: z.string(),
});

const CustomEmojiCacheSchema = z.object({
  version: z.number(),
  emojis: z.record(z.string(), CachedCustomEmojiSchema),
});

type CustomEmojiCache = z.infer<typeof CustomEmojiCacheSchema>;

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

function loadCache(): CustomEmojiCache {
  const data = loadJsonFile(CACHE_FILE);
  if (!data || typeof data !== "object") {
    return { version: CACHE_VERSION, emojis: {} };
  }

  // Validate cache structure with Zod
  const result = CustomEmojiCacheSchema.safeParse(data);
  if (!result.success) {
    return { version: CACHE_VERSION, emojis: {} };
  }

  if (result.data.version !== CACHE_VERSION) {
    return { version: CACHE_VERSION, emojis: {} };
  }

  return result.data;
}

function saveCache(cache: CustomEmojiCache): void {
  saveJsonFile(CACHE_FILE, cache);
}

/**
 * Get a cached custom emoji by its ID.
 */
export function getCachedCustomEmoji(customEmojiId: string): CachedCustomEmoji | null {
  const cache = loadCache();
  return cache.emojis[customEmojiId] ?? null;
}

/**
 * Add or update a custom emoji in the cache.
 */
export function cacheCustomEmoji(emoji: CachedCustomEmoji): void {
  const cache = loadCache();
  cache.emojis[emoji.customEmojiId] = emoji;
  saveCache(cache);
}

/**
 * Add or update a custom emoji in the cache with locking.
 * Prevents race conditions during concurrent writes.
 */
export async function cacheCustomEmojiAsync(emoji: CachedCustomEmoji): Promise<void> {
  await withCacheLock(() => {
    const cache = loadCache();
    cache.emojis[emoji.customEmojiId] = emoji;
    saveCache(cache);
  });
}

/**
 * Get all cached custom emojis.
 */
export function getAllCachedCustomEmojis(): CachedCustomEmoji[] {
  const cache = loadCache();
  return Object.values(cache.emojis);
}

/**
 * Get cache statistics.
 */
export function getCustomEmojiCacheStats(): {
  count: number;
  oldestAt?: string;
  newestAt?: string;
} {
  const cache = loadCache();
  const emojis = Object.values(cache.emojis);
  if (emojis.length === 0) {
    return { count: 0 };
  }
  const sorted = [...emojis].toSorted(
    (a, b) => new Date(a.cachedAt).getTime() - new Date(b.cachedAt).getTime(),
  );
  return {
    count: emojis.length,
    oldestAt: sorted[0]?.cachedAt,
    newestAt: sorted[sorted.length - 1]?.cachedAt,
  };
}

const CUSTOM_EMOJI_DESCRIPTION_PROMPT =
  "Describe this custom emoji/sticker image in 1-2 sentences. Focus on what it depicts (character, object, action, emotion). Be concise.";

export interface DescribeCustomEmojiParams {
  imagePath: string;
  cfg: OpenClawConfig;
  agentDir?: string;
  agentId?: string;
  contentType?: string;
}

/**
 * Describe a custom emoji image using vision API.
 * Auto-detects an available vision provider based on configured API keys.
 * Returns null if no vision provider is available.
 */
export async function describeCustomEmojiImage(
  params: DescribeCustomEmojiParams,
): Promise<string | null> {
  return describeImageWithVision({
    imagePath: params.imagePath,
    cfg: params.cfg,
    agentDir: params.agentDir,
    agentId: params.agentId,
    prompt: CUSTOM_EMOJI_DESCRIPTION_PROMPT,
    fileName: "custom-emoji.webp",
    logPrefix: "telegram",
    contentType: params.contentType,
  });
}
