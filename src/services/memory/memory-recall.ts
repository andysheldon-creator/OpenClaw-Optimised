/**
 * Memory Recall Service
 *
 * Provides the query interface for the tiered memory system.
 * Supports multiple recall modes:
 *
 * 1. Lexical (FTS5): Exact terms, names, commands
 * 2. Entity: "Tell me about X" — entity pages + linked facts
 * 3. Temporal: "What happened around date X" / "since last week"
 * 4. Opinion: "What does Andy prefer?" — with confidence + evidence
 * 5. Hybrid: Combines FTS + entity + temporal for best results
 *
 * Results are returned in an agent-friendly format with source citations,
 * suitable for injection into the LLM context window.
 */

import { defaultRuntime } from "../../runtime.js";
import {
  type Fact,
  type FtsResult,
  getAllEntities,
  getEntity,
  getEntityFacts,
  getEntityOpinions,
  getFactsByDay,
  getFactsByTimeRange,
  getMemoryStats,
  type MemoryStats,
  type Opinion,
  searchFts,
} from "./memory-store.js";

/** A single recall result with source attribution. */
export type RecallItem = {
  kind: "world" | "experience" | "opinion" | "observation";
  timestamp: number;
  entities: string[];
  content: string;
  source: string;
  confidence?: number;
  rank?: number;
};

/** Complete recall result. */
export type RecallResult = {
  items: RecallItem[];
  totalFound: number;
  durationMs: number;
  queryType: "lexical" | "entity" | "temporal" | "opinion" | "hybrid";
};

/** Maximum items to return from a recall query. */
const MAX_RECALL_ITEMS = 25;

/** Maximum total characters for recall context (to stay within token budget). */
const MAX_RECALL_CHARS = 4000;

// ─── Lexical Recall ──────────────────────────────────────────────────────────

/**
 * Search facts using full-text search (FTS5).
 * Best for: exact terms, names, commands, specific phrases.
 */
export function recallLexical(
  query: string,
  limit = MAX_RECALL_ITEMS,
): RecallResult {
  const started = Date.now();

  const results = searchFts(query, limit);
  const items = ftsToRecallItems(results);

  return {
    items: trimToCharBudget(items),
    totalFound: results.length,
    durationMs: Date.now() - started,
    queryType: "lexical",
  };
}

// ─── Entity Recall ───────────────────────────────────────────────────────────

/**
 * Recall everything known about an entity.
 * Returns: entity summary + linked facts + opinions.
 */
export function recallEntity(
  entitySlug: string,
  limit = MAX_RECALL_ITEMS,
): RecallResult {
  const started = Date.now();

  const entity = getEntity(entitySlug);
  const facts = getEntityFacts(entitySlug, limit);
  const opinions = getEntityOpinions(entitySlug);
  const items: RecallItem[] = [];

  // Add entity summary if available
  if (entity?.summary) {
    items.push({
      kind: "observation",
      timestamp: entity.lastUpdated,
      entities: [entitySlug],
      content: `[Entity Summary] ${entity.displayName}: ${entity.summary}`,
      source: `entity/${entitySlug}`,
    });
  }

  // Add opinions with confidence
  for (const opinion of opinions) {
    items.push(opinionToRecallItem(opinion));
  }

  // Add facts
  for (const fact of facts) {
    items.push(factToRecallItem(fact));
  }

  return {
    items: trimToCharBudget(items),
    totalFound: facts.length + opinions.length,
    durationMs: Date.now() - started,
    queryType: "entity",
  };
}

// ─── Temporal Recall ─────────────────────────────────────────────────────────

/**
 * Recall facts from a time range.
 * Best for: "what happened last week?", "since yesterday", etc.
 */
export function recallTemporal(
  startMs: number,
  endMs: number,
  limit = MAX_RECALL_ITEMS,
): RecallResult {
  const started = Date.now();

  const facts = getFactsByTimeRange(startMs, endMs, limit);
  const items = facts.map(factToRecallItem);

  return {
    items: trimToCharBudget(items),
    totalFound: facts.length,
    durationMs: Date.now() - started,
    queryType: "temporal",
  };
}

/**
 * Recall facts from a specific day.
 */
export function recallDay(day: string, limit = MAX_RECALL_ITEMS): RecallResult {
  const started = Date.now();

  const facts = getFactsByDay(day, limit);
  const items = facts.map(factToRecallItem);

  return {
    items: trimToCharBudget(items),
    totalFound: facts.length,
    durationMs: Date.now() - started,
    queryType: "temporal",
  };
}

// ─── Opinion Recall ──────────────────────────────────────────────────────────

/**
 * Recall opinions about an entity, sorted by confidence.
 */
export function recallOpinions(entitySlug: string): RecallResult {
  const started = Date.now();

  const opinions = getEntityOpinions(entitySlug);
  const items = opinions.map(opinionToRecallItem);

  return {
    items: trimToCharBudget(items),
    totalFound: opinions.length,
    durationMs: Date.now() - started,
    queryType: "opinion",
  };
}

// ─── Hybrid Recall ───────────────────────────────────────────────────────────

/**
 * Hybrid recall: combines lexical search with entity matching.
 * This is the primary recall function used by the agent.
 *
 * Strategy:
 * 1. Run FTS5 search for the query text
 * 2. Extract potential entity references from the query
 * 3. Fetch entity facts for any matched entities
 * 4. Deduplicate and merge results
 * 5. Sort by relevance (FTS rank + recency)
 */
export function recallHybrid(
  query: string,
  limit = MAX_RECALL_ITEMS,
): RecallResult {
  const started = Date.now();
  const itemMap = new Map<string, RecallItem>();

  // 1. Lexical search
  const ftsResults = searchFts(query, limit);
  for (const fts of ftsResults) {
    const item = ftsToRecallItem(fts);
    const key = item.content.slice(0, 100);
    if (!itemMap.has(key)) {
      itemMap.set(key, item);
    }
  }

  // 2. Extract entity slugs from query
  const queryEntities = extractQueryEntities(query);

  // 3. Fetch entity facts
  for (const slug of queryEntities) {
    const entity = getEntity(slug);
    if (!entity) continue;

    // Add entity summary
    if (entity.summary) {
      const summaryKey = `summary:${slug}`;
      if (!itemMap.has(summaryKey)) {
        itemMap.set(summaryKey, {
          kind: "observation",
          timestamp: entity.lastUpdated,
          entities: [slug],
          content: `[${entity.displayName}] ${entity.summary}`,
          source: `entity/${slug}`,
        });
      }
    }

    // Add entity facts
    const facts = getEntityFacts(slug, 10);
    for (const fact of facts) {
      const key = fact.content.slice(0, 100);
      if (!itemMap.has(key)) {
        itemMap.set(key, factToRecallItem(fact));
      }
    }

    // Add entity opinions
    const opinions = getEntityOpinions(slug);
    for (const opinion of opinions) {
      const key = `opinion:${opinion.id}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, opinionToRecallItem(opinion));
      }
    }
  }

  const items = [...itemMap.values()];

  // Sort by recency (newer first), with FTS-ranked items getting a boost
  items.sort((a, b) => {
    // Items with rank get a boost
    const aBoost = a.rank !== undefined ? 1000000 : 0;
    const bBoost = b.rank !== undefined ? 1000000 : 0;
    return b.timestamp + bBoost - (a.timestamp + aBoost);
  });

  const trimmed = trimToCharBudget(items.slice(0, limit));

  const duration = Date.now() - started;
  defaultRuntime.log?.(
    `[memory-recall] hybrid query="${query.slice(0, 50)}" found=${items.length} ` +
      `returned=${trimmed.length} entities=[${queryEntities.join(",")}] duration=${duration}ms`,
  );

  return {
    items: trimmed,
    totalFound: items.length,
    durationMs: duration,
    queryType: "hybrid",
  };
}

// ─── Context Assembly ────────────────────────────────────────────────────────

/**
 * Build a context block from recall results, suitable for injecting
 * into the LLM prompt as supplementary memory context.
 */
export function buildMemoryContext(result: RecallResult): string {
  if (result.items.length === 0) return "";

  const lines: string[] = ["[Memory Context]"];

  for (const item of result.items) {
    const entityTag =
      item.entities.length > 0
        ? ` [${item.entities.map((e) => `@${e}`).join(", ")}]`
        : "";
    const confTag =
      item.confidence !== undefined ? ` (confidence: ${item.confidence})` : "";
    const typeTag = `[${item.kind}]`;

    lines.push(`${typeTag}${entityTag}${confTag} ${item.content}`);
  }

  return lines.join("\n");
}

// ─── Info & Stats ────────────────────────────────────────────────────────────

/**
 * Check if the memory system has enough data to be useful.
 */
export function hasMemoryData(): boolean {
  try {
    const stats = getMemoryStats();
    return stats.factCount > 0;
  } catch {
    return false;
  }
}

/**
 * Get memory statistics for diagnostics.
 */
export function getRecallStats(): MemoryStats & { entityList: string[] } {
  const stats = getMemoryStats();
  const entities = getAllEntities();
  return {
    ...stats,
    entityList: entities.map((e) => e.slug),
  };
}

// ─── Check if memory is enabled ──────────────────────────────────────────────

/**
 * Check if the tiered memory system is enabled.
 */
export function isMemoryEnabled(): boolean {
  return process.env.ENABLE_MEMORY !== "false";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert an FTS result to a RecallItem.
 */
function ftsToRecallItem(fts: FtsResult): RecallItem {
  return {
    kind: fts.factType,
    timestamp: fts.timestamp,
    entities: [],
    content: fts.content,
    source: `facts/${fts.factId} (${fts.sourceDay})`,
    rank: fts.rank,
  };
}

/**
 * Convert FTS results to RecallItems.
 */
function ftsToRecallItems(results: FtsResult[]): RecallItem[] {
  return results.map(ftsToRecallItem);
}

/**
 * Convert a Fact to a RecallItem.
 */
function factToRecallItem(fact: Fact): RecallItem {
  return {
    kind: fact.factType,
    timestamp: fact.timestamp,
    entities: fact.entities,
    content: fact.content,
    source: `facts/${fact.id} (${fact.sourceDay})`,
    confidence: fact.confidence ?? undefined,
  };
}

/**
 * Convert an Opinion to a RecallItem.
 */
function opinionToRecallItem(opinion: Opinion): RecallItem {
  return {
    kind: "opinion",
    timestamp: opinion.lastUpdated,
    entities: [opinion.entitySlug],
    content: opinion.statement,
    source: `opinions/${opinion.id}`,
    confidence: opinion.confidence,
  };
}

/** Cached entity list for fast lookup during recall. */
let entityCache: { slug: string; displayName: string }[] = [];
let entityCacheTimestamp = 0;
const ENTITY_CACHE_TTL_MS = 60_000; // 1 minute

function getCachedEntities(): { slug: string; displayName: string }[] {
  const now = Date.now();
  if (now - entityCacheTimestamp > ENTITY_CACHE_TTL_MS) {
    entityCache = getAllEntities().map((e) => ({
      slug: e.slug,
      displayName: e.displayName,
    }));
    entityCacheTimestamp = now;
  }
  return entityCache;
}

/**
 * Extract potential entity slugs from a query string.
 */
function extractQueryEntities(query: string): string[] {
  const entities = new Set<string>();
  const allKnown = getCachedEntities();
  const knownSlugs = new Set(allKnown.map((e) => e.slug));

  // Check for @mentions
  const mentionRegex = /@(\w+)/g;
  let match = mentionRegex.exec(query);
  while (match) {
    const slug = match[1].toLowerCase();
    if (knownSlugs.has(slug)) {
      entities.add(slug);
    }
    match = mentionRegex.exec(query);
  }

  // Check for known entity names in the query
  const queryLower = query.toLowerCase();
  for (const entity of allKnown) {
    if (
      queryLower.includes(entity.slug) ||
      queryLower.includes(entity.displayName.toLowerCase())
    ) {
      entities.add(entity.slug);
    }
  }

  return [...entities];
}

/**
 * Trim recall items to fit within the character budget.
 */
function trimToCharBudget(items: RecallItem[]): RecallItem[] {
  let totalChars = 0;
  const result: RecallItem[] = [];

  for (const item of items) {
    totalChars += item.content.length;
    if (totalChars > MAX_RECALL_CHARS && result.length > 0) break;
    result.push(item);
  }

  return result;
}
