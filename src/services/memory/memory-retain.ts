/**
 * Memory Retain Pipeline
 *
 * Extracts structured facts from conversation messages and stores them
 * in the memory database. This is the "Retain" phase of the
 * retain/recall/reflect loop.
 *
 * Fact extraction is done heuristically (no LLM call required):
 * - Classify message content into fact types (world/experience/opinion/observation)
 * - Extract entity mentions (names, projects, places)
 * - Estimate confidence for opinion-type facts
 * - Deduplicate against existing facts
 *
 * The pipeline runs in the background after each agent turn, similar
 * to RAG ingestion but storing structured facts instead of embeddings.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { defaultRuntime } from "../../runtime.js";
import { type FactType, factExists, insertFacts } from "./memory-store.js";

/** Minimum message length to extract facts from. */
const MIN_MESSAGE_LENGTH = 20;

/** Maximum text length to process per message. */
const MAX_RETAIN_LENGTH = 3000;

/** Patterns that indicate opinion/preference content. */
const OPINION_PATTERNS = [
  /\b(i think|i believe|i prefer|i like|i dislike|i hate|i love|in my opinion|imo)\b/i,
  /\b(should|shouldn't|better|worse|best|worst|recommend|suggest)\b/i,
  /\b(always|never|definitely|certainly|probably|maybe|perhaps)\b/i,
];

/** Patterns that indicate world/factual content. */
const WORLD_PATTERNS = [
  /\b(is|are|was|were|has|have|had)\b.*\b(located|built|created|founded|made|released|published)\b/i,
  /\b(currently|right now|at the moment|as of)\b/i,
  /\b(version|release|update|v\d+)\b/i,
  /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/,
];

/** Patterns that indicate experience/biographical content. */
const EXPERIENCE_PATTERNS = [
  /\b(i did|i made|i fixed|i built|i created|i implemented|i deployed|i configured)\b/i,
  /\b(we did|we made|we fixed|we built|we created|we implemented|we deployed)\b/i,
  /\b(successfully|completed|finished|resolved|solved)\b/i,
];

/** Common entity patterns: capitalised words, @mentions, quoted names. */
const ENTITY_PATTERNS = [
  /@(\w+)/g,
  /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g,
  /"([^"]{2,30})"/g,
];

/** Words to exclude from entity extraction. */
const ENTITY_STOPWORDS = new Set([
  "the",
  "this",
  "that",
  "then",
  "also",
  "just",
  "here",
  "there",
  "what",
  "when",
  "where",
  "which",
  "however",
  "although",
  "because",
  "therefore",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "please",
  "thanks",
  "thank",
  "sorry",
  "hello",
  "goodbye",
]);

/**
 * Extract text content from an AgentMessage.
 */
function extractText(msg: AgentMessage): string {
  const raw = msg as unknown as Record<string, unknown>;
  const content = raw.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as Record<string, unknown>).type === "text" &&
        "text" in block &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        texts.push((block as Record<string, unknown>).text as string);
      }
    }
    return texts.join(" ");
  }
  return "";
}

/**
 * Get the role from an AgentMessage.
 */
function extractRole(msg: AgentMessage): string {
  const raw = msg as unknown as Record<string, unknown>;
  return typeof raw.role === "string" ? raw.role : "unknown";
}

/**
 * Classify the fact type of a piece of text.
 */
function classifyFactType(text: string, role: string): FactType {
  const lower = text.toLowerCase();

  // Assistant messages are typically observations/summaries
  if (role === "assistant") return "observation";

  // Check opinion patterns first (most specific)
  for (const pattern of OPINION_PATTERNS) {
    if (pattern.test(lower)) return "opinion";
  }

  // Check experience patterns
  for (const pattern of EXPERIENCE_PATTERNS) {
    if (pattern.test(lower)) return "experience";
  }

  // Check world/factual patterns
  for (const pattern of WORLD_PATTERNS) {
    if (pattern.test(lower)) return "world";
  }

  // Default: observation
  return "observation";
}

/**
 * Extract entity mentions from text.
 * Returns normalised slugs (lowercase, hyphenated).
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>();

  for (const pattern of ENTITY_PATTERNS) {
    // Reset pattern state for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match) {
      const raw = match[1];
      if (raw && raw.length >= 2 && raw.length <= 30) {
        const slug = raw.toLowerCase().replace(/\s+/g, "-");
        // Skip stopwords and very short slugs
        if (!ENTITY_STOPWORDS.has(slug) && slug.length >= 2) {
          entities.add(slug);
        }
      }
      match = pattern.exec(text);
    }
  }

  return [...entities];
}

/**
 * Estimate confidence for opinion-type facts.
 * Higher confidence for stronger language.
 */
function estimateConfidence(text: string): number {
  const lower = text.toLowerCase();
  let confidence = 0.5;

  if (/\b(definitely|certainly|absolutely|always|never)\b/.test(lower)) {
    confidence = 0.9;
  } else if (/\b(probably|likely|usually|often)\b/.test(lower)) {
    confidence = 0.7;
  } else if (/\b(maybe|perhaps|might|could|sometimes)\b/.test(lower)) {
    confidence = 0.4;
  } else if (/\b(i think|i believe|in my opinion|imo)\b/.test(lower)) {
    confidence = 0.6;
  }

  return confidence;
}

/**
 * Split a message into sentence-level fact candidates.
 * Filters out very short or uninformative sentences.
 */
function splitIntoFacts(text: string): string[] {
  // Split on sentence boundaries
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_MESSAGE_LENGTH);

  // If the text is short enough, treat the whole thing as one fact
  if (text.length < 200 && sentences.length <= 1) {
    return text.trim().length >= MIN_MESSAGE_LENGTH ? [text.trim()] : [];
  }

  return sentences;
}

/**
 * Get the source day string (YYYY-MM-DD) from a timestamp.
 */
function sourceDay(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Result of retaining messages. */
export type RetainResult = {
  factsExtracted: number;
  factsStored: number;
  entitiesFound: string[];
  durationMs: number;
};

/**
 * Extract and store facts from a batch of messages.
 *
 * @param params.sessionId - Session these messages belong to
 * @param params.messages - Messages to extract facts from
 * @param params.timestamp - Override timestamp (default: now)
 */
export function retainMessages(params: {
  sessionId: string;
  messages: AgentMessage[];
  timestamp?: number;
}): RetainResult {
  const started = Date.now();
  const allEntities = new Set<string>();
  let extracted = 0;

  const factsToInsert: Array<{
    sessionId: string;
    factType: FactType;
    content: string;
    timestamp: number;
    sourceDay: string;
    confidence?: number;
    entities?: string[];
  }> = [];

  for (const msg of params.messages) {
    const text = extractText(msg);
    if (text.trim().length < MIN_MESSAGE_LENGTH) continue;

    const role = extractRole(msg);
    const truncated = text.slice(0, MAX_RETAIN_LENGTH);
    const factCandidates = splitIntoFacts(truncated);
    const ts = params.timestamp ?? Date.now();
    const day = sourceDay(ts);

    for (const candidate of factCandidates) {
      // Deduplicate: skip if this exact content already exists
      if (factExists(candidate, params.sessionId)) continue;

      const factType = classifyFactType(candidate, role);
      const entities = extractEntities(candidate);
      const confidence =
        factType === "opinion" ? estimateConfidence(candidate) : undefined;

      for (const e of entities) {
        allEntities.add(e);
      }

      factsToInsert.push({
        sessionId: params.sessionId,
        factType,
        content: candidate,
        timestamp: ts,
        sourceDay: day,
        confidence,
        entities: entities.length > 0 ? entities : undefined,
      });

      extracted++;
    }
  }

  // Batch insert
  let stored = 0;
  if (factsToInsert.length > 0) {
    try {
      const ids = insertFacts(factsToInsert);
      stored = ids.length;
    } catch (err) {
      defaultRuntime.log?.(
        `[memory-retain] batch insert failed: ${String(err)}`,
      );
    }
  }

  const duration = Date.now() - started;

  if (stored > 0) {
    defaultRuntime.log?.(
      `[memory-retain] session=${params.sessionId} extracted=${extracted} stored=${stored} ` +
        `entities=[${[...allEntities].join(",")}] duration=${duration}ms`,
    );
  }

  return {
    factsExtracted: extracted,
    factsStored: stored,
    entitiesFound: [...allEntities],
    durationMs: duration,
  };
}

/**
 * Background retain: fire-and-forget wrapper that won't throw.
 */
export function backgroundRetain(params: {
  sessionId: string;
  messages: AgentMessage[];
}): void {
  try {
    retainMessages(params);
  } catch (err) {
    defaultRuntime.log?.(
      `[memory-retain] background retain failed: ${String(err)}`,
    );
  }
}
