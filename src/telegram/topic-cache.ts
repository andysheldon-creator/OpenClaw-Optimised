import path from "node:path";
import { STATE_DIR } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";

const CACHE_FILE = path.join(STATE_DIR, "telegram", "topic-cache.json");
const CACHE_VERSION = 1;

type TelegramTopicCacheEntry = {
  chatId: string;
  topicId: number;
  name: string;
  cachedAt: string;
};

type TelegramTopicCache = {
  version: number;
  topics: Record<string, TelegramTopicCacheEntry>;
};

type TelegramTopicNameSource = {
  forum_topic_created?: { name?: string };
  forum_topic_edited?: { name?: string };
};

function buildTopicCacheKey(chatId: string | number, topicId: number): string {
  return `${chatId}:${topicId}`;
}

function loadTopicCache(): TelegramTopicCache {
  const data = loadJsonFile(CACHE_FILE);
  if (!data || typeof data !== "object") {
    return { version: CACHE_VERSION, topics: {} };
  }
  const cache = data as TelegramTopicCache;
  if (cache.version !== CACHE_VERSION || typeof cache.topics !== "object") {
    return { version: CACHE_VERSION, topics: {} };
  }
  return cache;
}

function saveTopicCache(cache: TelegramTopicCache): void {
  saveJsonFile(CACHE_FILE, cache);
}

export function normalizeTelegramTopicLabelToken(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const dashed = trimmed.replace(/\s+/g, "-");
  let token = dashed.replace(/[^a-z0-9#@._+-]+/g, "-");
  token = token.replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  if (token.startsWith("#")) {
    token = token.replace(/^#+/, "");
  }
  return token;
}

export function extractTelegramTopicNameFromMessage(msg: TelegramTopicNameSource): string | null {
  const createdName = msg.forum_topic_created?.name;
  const editedName = msg.forum_topic_edited?.name;
  const candidate = typeof createdName === "string" ? createdName : editedName;
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  return trimmed ? trimmed : null;
}

export function cacheTelegramTopicName(params: {
  chatId: string | number;
  topicId: number;
  name: string;
}): void {
  const trimmed = params.name.trim();
  if (!trimmed) {
    return;
  }
  const cache = loadTopicCache();
  const key = buildTopicCacheKey(params.chatId, params.topicId);
  cache.topics[key] = {
    chatId: String(params.chatId),
    topicId: params.topicId,
    name: trimmed,
    cachedAt: new Date().toISOString(),
  };
  saveTopicCache(cache);
}

export function getCachedTelegramTopicName(
  chatId: string | number,
  topicId: number,
): string | null {
  const cache = loadTopicCache();
  const key = buildTopicCacheKey(chatId, topicId);
  const entry = cache.topics[key];
  return entry?.name ?? null;
}

export function buildTelegramTopicLabel(params: {
  topicId: number;
  topicName?: string | null;
  agentId?: string | null;
  multiAgent?: boolean;
}): string {
  const normalized = params.topicName ? normalizeTelegramTopicLabelToken(params.topicName) : "";
  const topicToken = normalized || String(Math.trunc(params.topicId));
  const base = `telegram:${topicToken}`;
  if (params.multiAgent && params.agentId) {
    const agent = params.agentId.trim() || "main";
    return `${agent}:${base}`;
  }
  return base;
}
