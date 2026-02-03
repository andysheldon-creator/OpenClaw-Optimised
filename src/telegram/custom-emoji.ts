import type { Bot } from "grammy";
import { logVerbose } from "../globals.js";
import { fetchRemoteMedia } from "../media/fetch.js";
import { saveMediaBuffer } from "../media/store.js";

/** Maximum concurrent downloads for custom emoji files */
const MAX_CONCURRENT_DOWNLOADS = 3;

export interface CustomEmojiEntity {
  type: "custom_emoji";
  offset: number;
  length: number;
  custom_emoji_id: string;
}

export interface ResolvedCustomEmoji {
  id: string;
  emoji: string;
  setName?: string;
  fileId?: string;
  fileUniqueId?: string;
  filePath?: string;
  contentType?: string;
  cachedDescription?: string;
}

/**
 * Extract custom_emoji entities from message entities.
 * @param entities - Array of Telegram message entities
 * @returns Array of custom emoji entities with their IDs and positions
 */
export function extractCustomEmojiEntities(
  entities?: Array<{ type: string; offset: number; length: number; custom_emoji_id?: string }>,
): CustomEmojiEntity[] {
  if (!entities) {
    return [];
  }
  return entities.filter(
    (e): e is CustomEmojiEntity => e.type === "custom_emoji" && Boolean(e.custom_emoji_id),
  );
}

/**
 * Resolve custom emoji info by calling Telegram API.
 * Returns sticker info including emoji character and set name.
 * @param bot - Grammy bot instance
 * @param emojiIds - Array of custom emoji IDs to resolve
 * @returns Map of emoji ID to resolved info (emoji character, set name, file IDs)
 */
export async function resolveCustomEmojis(
  bot: Bot,
  emojiIds: string[],
): Promise<
  Map<string, { emoji: string; setName?: string; fileId?: string; fileUniqueId?: string }>
> {
  if (emojiIds.length === 0) {
    return new Map();
  }

  try {
    const stickers = await bot.api.getCustomEmojiStickers(emojiIds);
    const result = new Map<
      string,
      { emoji: string; setName?: string; fileId?: string; fileUniqueId?: string }
    >();

    for (const sticker of stickers) {
      if (sticker.custom_emoji_id) {
        result.set(sticker.custom_emoji_id, {
          emoji: sticker.emoji ?? "❓",
          setName: sticker.set_name,
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id,
        });
      }
    }

    return result;
  } catch (err) {
    // If API fails, return empty map - we'll fall back to placeholder text
    logVerbose(`Failed to resolve custom emojis: ${String(err)}`);
    return new Map();
  }
}

/**
 * Download a single custom emoji file.
 * @internal
 */
async function downloadSingleCustomEmoji(params: {
  id: string;
  info: { emoji: string; setName?: string; fileId?: string; fileUniqueId?: string };
  bot: Bot;
  token: string;
  maxBytes: number;
  fetchImpl: typeof fetch;
}): Promise<ResolvedCustomEmoji> {
  const { id, info, bot, token, maxBytes, fetchImpl } = params;

  if (!info.fileId) {
    return { id, emoji: info.emoji, setName: info.setName };
  }

  try {
    const file = await bot.api.getFile(info.fileId);
    if (!file.file_path) {
      return {
        id,
        emoji: info.emoji,
        setName: info.setName,
        fileId: info.fileId,
        fileUniqueId: info.fileUniqueId,
      };
    }

    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fetched = await fetchRemoteMedia({
      url,
      fetchImpl,
      filePathHint: file.file_path,
    });
    const saved = await saveMediaBuffer(fetched.buffer, fetched.contentType, "inbound", maxBytes);

    return {
      id,
      emoji: info.emoji,
      setName: info.setName,
      fileId: info.fileId,
      fileUniqueId: info.fileUniqueId,
      filePath: saved.path,
      contentType: saved.contentType,
    };
  } catch (err) {
    // If download fails, just include the emoji info without file
    logVerbose(`Failed to download custom emoji ${id}: ${String(err)}`);
    return {
      id,
      emoji: info.emoji,
      setName: info.setName,
      fileId: info.fileId,
      fileUniqueId: info.fileUniqueId,
    };
  }
}

/**
 * Download custom emoji sticker files with concurrency limit.
 * @param bot - Grammy bot instance
 * @param token - Telegram bot token for file downloads
 * @param emojiInfo - Map of emoji IDs to their resolved info
 * @param maxBytes - Maximum file size in bytes
 * @param proxyFetch - Optional custom fetch implementation
 * @returns Array of resolved emojis with file paths where available
 */
export async function downloadCustomEmojiFiles(
  bot: Bot,
  token: string,
  emojiInfo: Map<
    string,
    { emoji: string; setName?: string; fileId?: string; fileUniqueId?: string }
  >,
  maxBytes: number,
  proxyFetch?: typeof fetch,
): Promise<ResolvedCustomEmoji[]> {
  const fetchImpl = proxyFetch ?? globalThis.fetch;
  const entries = Array.from(emojiInfo.entries());

  if (entries.length === 0) {
    return [];
  }

  // Process in batches with concurrency limit
  const results: ResolvedCustomEmoji[] = [];
  for (let i = 0; i < entries.length; i += MAX_CONCURRENT_DOWNLOADS) {
    const batch = entries.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
    const batchResults = await Promise.all(
      batch.map(([id, info]) =>
        downloadSingleCustomEmoji({ id, info, bot, token, maxBytes, fetchImpl }),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Expand custom emoji in text by replacing placeholders with descriptive text.
 * Returns the expanded text and list of resolved emojis.
 * @param text - Original message text
 * @param entities - Array of custom emoji entities with offsets
 * @param resolved - Map of emoji IDs to resolved info
 * @returns Text with custom emoji placeholders replaced by annotations
 */
export function expandCustomEmojisInText(
  text: string,
  entities: CustomEmojiEntity[],
  resolved: Map<string, { emoji: string; setName?: string }>,
): string {
  if (entities.length === 0) {
    return text;
  }

  // Sort by offset descending to replace from end to start (preserves offsets)
  const sorted = [...entities].toSorted((a, b) => b.offset - a.offset);

  let result = text;
  for (const entity of sorted) {
    const info = resolved.get(entity.custom_emoji_id);
    if (!info) {
      continue;
    }

    // Replace the placeholder character with emoji + annotation
    const annotation = info.setName ? `[${info.emoji}:${info.setName}]` : `[${info.emoji}]`;
    result =
      result.slice(0, entity.offset) + annotation + result.slice(entity.offset + entity.length);
  }

  return result;
}

/**
 * Process custom emoji in a message: resolve, optionally download, and expand text.
 * @param params - Processing parameters
 * @param params.text - Original message text
 * @param params.entities - Message entities from Telegram
 * @param params.bot - Grammy bot instance
 * @param params.token - Telegram bot token
 * @param params.maxBytes - Maximum file size for downloads
 * @param params.downloadFiles - Whether to download emoji images
 * @param params.proxyFetch - Optional custom fetch implementation
 * @returns Object containing expanded text and array of resolved emojis
 */
export async function processCustomEmojis(params: {
  text: string;
  entities?: Array<{ type: string; offset: number; length: number; custom_emoji_id?: string }>;
  bot: Bot;
  token: string;
  maxBytes: number;
  downloadFiles?: boolean;
  proxyFetch?: typeof fetch;
}): Promise<{
  expandedText: string;
  customEmojis: ResolvedCustomEmoji[];
}> {
  const customEmojiEntities = extractCustomEmojiEntities(params.entities);
  if (customEmojiEntities.length === 0) {
    return { expandedText: params.text, customEmojis: [] };
  }

  const emojiIds = customEmojiEntities.map((e) => e.custom_emoji_id);
  const resolved = await resolveCustomEmojis(params.bot, emojiIds);

  const expandedText = expandCustomEmojisInText(params.text, customEmojiEntities, resolved);

  let customEmojis: ResolvedCustomEmoji[] = [];
  if (params.downloadFiles) {
    customEmojis = await downloadCustomEmojiFiles(
      params.bot,
      params.token,
      resolved,
      params.maxBytes,
      params.proxyFetch,
    );
  } else {
    // Just return resolved info without files
    for (const [id, info] of resolved) {
      customEmojis.push({ id, emoji: info.emoji, setName: info.setName });
    }
  }

  return { expandedText, customEmojis };
}
