/**
 * Memory Reflect Service
 *
 * The "Reflect" phase of the retain/recall/reflect loop.
 * Periodically reviews recent facts and:
 *
 * 1. Updates entity summaries from linked facts
 * 2. Evolves opinion confidence based on reinforcement/contradiction
 * 3. Identifies new entities from recent fact patterns
 *
 * This runs as a scheduled background job, not on the critical path.
 * The interval is configurable via MEMORY_REFLECT_INTERVAL (default: 24h).
 *
 * Design principles:
 * - Small confidence deltas (no big jumps without strong evidence)
 * - Explainable: each update traces back to specific facts
 * - Non-destructive: only updates derived data, never deletes source facts
 */

import { defaultRuntime } from "../../runtime.js";
import {
  type Fact,
  getAllEntities,
  getEntityFacts,
  getEntityOpinions,
  getFactsByTimeRange,
  getMemoryStats,
  updateEntitySummary,
  upsertOpinion,
} from "./memory-store.js";

/** Default reflect interval: 24 hours in milliseconds. */
const DEFAULT_REFLECT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Reflect interval from env (in seconds). */
const REFLECT_INTERVAL_MS = (() => {
  const envVal = process.env.MEMORY_REFLECT_INTERVAL;
  if (envVal) {
    const seconds = Number.parseInt(envVal, 10);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return DEFAULT_REFLECT_INTERVAL_MS;
})();

/** Last reflect timestamp. */
let lastReflectMs = 0;

/** Reflect timer handle (or `true` during startup to prevent races). */
let reflectTimer: ReturnType<typeof setInterval> | true | null = null;

/** Maximum facts to summarise per entity. */
const MAX_FACTS_PER_ENTITY = 30;

/** Maximum summary length. */
const MAX_SUMMARY_LENGTH = 500;

/** Confidence delta for reinforcing evidence. */
const CONFIDENCE_REINFORCE_DELTA = 0.05;

/** Confidence delta for contradicting evidence. */
const CONFIDENCE_CONTRADICT_DELTA = 0.08;

/** Minimum confidence floor. */
const CONFIDENCE_FLOOR = 0.1;

/** Maximum confidence ceiling. */
const CONFIDENCE_CEILING = 0.95;

/** Result of a reflect cycle. */
export type ReflectResult = {
  entitiesUpdated: number;
  opinionsUpdated: number;
  newOpinions: number;
  durationMs: number;
};

/**
 * Run a full reflect cycle.
 *
 * 1. Update entity summaries from recent facts
 * 2. Evolve opinion confidence
 * 3. Extract new opinions from recent opinion-type facts
 */
export function runReflect(): ReflectResult {
  const started = Date.now();
  let entitiesUpdated = 0;
  let opinionsUpdated = 0;
  let newOpinions = 0;

  try {
    const stats = getMemoryStats();
    if (stats.factCount === 0) {
      return {
        entitiesUpdated: 0,
        opinionsUpdated: 0,
        newOpinions: 0,
        durationMs: 0,
      };
    }

    // 1. Update entity summaries
    const entities = getAllEntities();
    for (const entity of entities) {
      const updated = updateEntityFromFacts(entity.slug);
      if (updated) entitiesUpdated++;
    }

    // 2. Evolve opinion confidence
    for (const entity of entities) {
      const result = evolveOpinions(entity.slug);
      opinionsUpdated += result.updated;
    }

    // 3. Extract new opinions from recent facts
    const recentWindow = Date.now() - REFLECT_INTERVAL_MS;
    const recentFacts = getFactsByTimeRange(recentWindow, Date.now(), 100);
    const opinionFacts = recentFacts.filter((f) => f.factType === "opinion");

    for (const fact of opinionFacts) {
      const created = maybeCreateOpinion(fact);
      if (created) newOpinions++;
    }

    lastReflectMs = Date.now();
  } catch (err) {
    defaultRuntime.log?.(
      `[memory-reflect] reflect cycle failed: ${String(err)}`,
    );
  }

  const duration = Date.now() - started;
  defaultRuntime.log?.(
    `[memory-reflect] cycle complete: entities=${entitiesUpdated} opinions_updated=${opinionsUpdated} ` +
      `new_opinions=${newOpinions} duration=${duration}ms`,
  );

  return {
    entitiesUpdated,
    opinionsUpdated,
    newOpinions,
    durationMs: duration,
  };
}

/**
 * Update an entity's summary from its linked facts.
 * Builds a concise summary from the most recent and important facts.
 */
function updateEntityFromFacts(entitySlug: string): boolean {
  const facts = getEntityFacts(entitySlug, MAX_FACTS_PER_ENTITY);
  if (facts.length === 0) return false;

  // Build summary from facts, prioritising recent and high-confidence
  const sortedFacts = [...facts].sort((a, b) => {
    // Prefer recent facts
    const timeDiff = b.timestamp - a.timestamp;
    // Prefer facts with confidence
    const confA = a.confidence ?? 0.5;
    const confB = b.confidence ?? 0.5;
    return timeDiff + (confB - confA) * 1e10;
  });

  // Take top facts and build summary
  const topFacts = sortedFacts.slice(0, 5);
  const summaryParts: string[] = [];
  let totalLength = 0;

  for (const fact of topFacts) {
    const part = fact.content.slice(0, 100);
    if (totalLength + part.length > MAX_SUMMARY_LENGTH) break;
    summaryParts.push(part);
    totalLength += part.length;
  }

  const summary = summaryParts.join(". ");
  if (summary.length === 0) return false;

  updateEntitySummary(entitySlug, summary);
  return true;
}

/**
 * Evolve opinion confidence for an entity based on recent facts.
 *
 * For each existing opinion:
 * - If recent facts support it → increase confidence slightly
 * - If recent facts contradict it → decrease confidence
 *
 * Uses keyword overlap to detect support/contradiction.
 */
function evolveOpinions(entitySlug: string): { updated: number } {
  const opinions = getEntityOpinions(entitySlug);
  const recentFacts = getEntityFacts(entitySlug, 20);
  let updated = 0;

  for (const opinion of opinions) {
    const opinionWords = extractKeywords(opinion.statement);
    let reinforced = false;
    let contradicted = false;

    const newSupporting = [...opinion.supportingFactIds];
    const newContradicting = [...opinion.contradictingFactIds];

    for (const fact of recentFacts) {
      // Skip facts already counted
      if (
        opinion.supportingFactIds.includes(fact.id) ||
        opinion.contradictingFactIds.includes(fact.id)
      ) {
        continue;
      }

      const factWords = extractKeywords(fact.content);
      const overlap = wordOverlap(opinionWords, factWords);

      if (overlap < 0.15) continue; // Not related

      // Check for contradiction signals
      const isContradiction = hasContradictionSignal(
        opinion.statement,
        fact.content,
      );

      if (isContradiction) {
        contradicted = true;
        newContradicting.push(fact.id);
      } else if (overlap > 0.25) {
        reinforced = true;
        newSupporting.push(fact.id);
      }
    }

    if (reinforced || contradicted) {
      let newConfidence = opinion.confidence;

      if (reinforced) {
        newConfidence = Math.min(
          CONFIDENCE_CEILING,
          newConfidence + CONFIDENCE_REINFORCE_DELTA,
        );
      }
      if (contradicted) {
        newConfidence = Math.max(
          CONFIDENCE_FLOOR,
          newConfidence - CONFIDENCE_CONTRADICT_DELTA,
        );
      }

      upsertOpinion({
        entitySlug,
        statement: opinion.statement,
        confidence: newConfidence,
        supportingFactIds: newSupporting,
        contradictingFactIds: newContradicting,
      });

      updated++;
    }
  }

  return { updated };
}

/**
 * Maybe create a new opinion from an opinion-type fact.
 * Only creates if no similar opinion exists for any of the fact's entities.
 */
function maybeCreateOpinion(fact: Fact): boolean {
  if (fact.entities.length === 0) return false;

  for (const entitySlug of fact.entities) {
    const existing = getEntityOpinions(entitySlug);

    // Check if a similar opinion already exists
    const similar = existing.some((op) => {
      const overlap = wordOverlap(
        extractKeywords(op.statement),
        extractKeywords(fact.content),
      );
      return overlap > 0.4;
    });

    if (!similar) {
      upsertOpinion({
        entitySlug,
        statement: fact.content,
        confidence: fact.confidence ?? 0.5,
        supportingFactIds: [fact.id],
      });
      return true;
    }
  }

  return false;
}

// ─── Scheduled Reflect ───────────────────────────────────────────────────────

/**
 * Start the periodic reflect job.
 * Runs reflect at the configured interval.
 */
export function startReflectSchedule(): void {
  if (reflectTimer) return; // Already running

  // Immediately mark as starting to prevent race conditions
  reflectTimer = true;

  // Run an initial reflect if we have data and haven't reflected recently
  const timeSinceLastReflect = Date.now() - lastReflectMs;
  if (timeSinceLastReflect > REFLECT_INTERVAL_MS) {
    try {
      runReflect();
    } catch {
      // Non-critical, will retry on schedule
    }
  }

  reflectTimer = setInterval(() => {
    try {
      runReflect();
    } catch (err) {
      defaultRuntime.log?.(
        `[memory-reflect] scheduled reflect failed: ${String(err)}`,
      );
    }
  }, REFLECT_INTERVAL_MS);

  // Don't prevent Node.js from exiting
  if (
    reflectTimer &&
    typeof reflectTimer === "object" &&
    "unref" in reflectTimer
  ) {
    reflectTimer.unref();
  }

  defaultRuntime.log?.(
    `[memory-reflect] started reflect schedule (interval=${REFLECT_INTERVAL_MS}ms)`,
  );
}

/**
 * Stop the periodic reflect job.
 */
export function stopReflectSchedule(): void {
  if (reflectTimer && reflectTimer !== true) {
    clearInterval(reflectTimer);
  }
  reflectTimer = null;
  defaultRuntime.log?.("[memory-reflect] stopped reflect schedule");
}

/**
 * Run reflect if enough time has passed since the last run.
 * Called opportunistically (e.g., after agent turns).
 */
export function maybeReflect(): void {
  const timeSinceLastReflect = Date.now() - lastReflectMs;
  if (timeSinceLastReflect > REFLECT_INTERVAL_MS) {
    try {
      runReflect();
    } catch (err) {
      defaultRuntime.log?.(
        `[memory-reflect] opportunistic reflect failed: ${String(err)}`,
      );
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract lowercase keywords from text for comparison.
 */
function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Calculate word overlap ratio between two keyword sets.
 */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const word of a) {
    if (b.has(word)) common++;
  }
  return common / Math.min(a.size, b.size);
}

/**
 * Check if two texts contain contradiction signals.
 * Simple heuristic: looks for negation words near overlapping content.
 */
function hasContradictionSignal(text1: string, text2: string): boolean {
  const negationWords = [
    "not",
    "no",
    "never",
    "don't",
    "doesn't",
    "didn't",
    "won't",
    "wouldn't",
    "shouldn't",
    "can't",
    "cannot",
    "isn't",
    "aren't",
    "wasn't",
    "weren't",
    "nor",
    "neither",
    "unlike",
    "instead",
    "rather",
    "actually",
    "however",
    "but",
    "although",
    "contrary",
    "opposite",
    "wrong",
    "incorrect",
    "false",
    "changed",
  ];

  const lower1 = text1.toLowerCase();
  const lower2 = text2.toLowerCase();

  // Count negation words in each text
  let neg1 = 0;
  let neg2 = 0;
  for (const word of negationWords) {
    if (lower1.includes(word)) neg1++;
    if (lower2.includes(word)) neg2++;
  }

  // If one text has significantly more negation, likely contradiction
  return Math.abs(neg1 - neg2) >= 2;
}
