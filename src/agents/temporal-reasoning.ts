/**
 * Temporal Reasoning Module
 *
 * Provides task duration learning, deadline intelligence, and recurring pattern
 * detection for intelligent time management.
 *
 * Features:
 * - Learn from historical task durations using exponential moving average
 * - Analyze deadlines and suggest optimal start times
 * - Detect recurring patterns in task history
 * - Calculate urgency scores for prioritization
 */

import { type Static, Type } from "@sinclair/typebox";
import {
  createMemoryService,
  isMemoryEnabled,
  type MemoryCategory,
} from "../memory/index.js";

// =============================================================================
// Type Definitions (TypeBox schemas)
// =============================================================================

/** Task duration record for learning */
export const TaskDurationRecordSchema = Type.Object({
  taskId: Type.String({ description: "Unique task identifier" }),
  taskName: Type.String({ description: "Human-readable task name" }),
  category: Type.String({
    description: "Task category (e.g., 'meeting', 'coding', 'review')",
  }),
  startedAt: Type.Number({ description: "Start timestamp (Unix ms)" }),
  completedAt: Type.Number({ description: "Completion timestamp (Unix ms)" }),
  durationMs: Type.Number({ description: "Actual duration in milliseconds" }),
  estimatedMs: Type.Optional(
    Type.Number({ description: "Original estimate in ms" }),
  ),
  accuracy: Type.Optional(
    Type.Number({ description: "Accuracy ratio: actual/estimated" }),
  ),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type TaskDurationRecord = Static<typeof TaskDurationRecordSchema>;

/** Risk level for deadline intelligence */
export const RiskLevelSchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("critical"),
]);
export type RiskLevel = Static<typeof RiskLevelSchema>;

/** Deadline intelligence result */
export const DeadlineIntelligenceSchema = Type.Object({
  taskId: Type.String({ description: "Task identifier" }),
  deadline: Type.Number({ description: "Deadline timestamp (Unix ms)" }),
  urgencyScore: Type.Number({
    description: "Urgency score 0-1 (1 = most urgent)",
  }),
  suggestedStartTime: Type.Number({
    description: "Recommended start timestamp (Unix ms)",
  }),
  bufferTimeMs: Type.Number({
    description: "Buffer time before deadline in ms",
  }),
  riskLevel: RiskLevelSchema,
  factors: Type.Array(Type.String(), {
    description: "Factors affecting the analysis",
  }),
});
export type DeadlineIntelligence = Static<typeof DeadlineIntelligenceSchema>;

/** Recurring pattern frequency */
export const FrequencySchema = Type.Union([
  Type.Literal("daily"),
  Type.Literal("weekly"),
  Type.Literal("monthly"),
  Type.Literal("custom"),
]);
export type Frequency = Static<typeof FrequencySchema>;

/** Recurring pattern detection result */
export const RecurringPatternSchema = Type.Object({
  patternId: Type.String({ description: "Unique pattern identifier" }),
  taskName: Type.String({ description: "Task name pattern matches" }),
  frequency: FrequencySchema,
  interval: Type.Optional(
    Type.Number({ description: "Interval in ms for custom frequency" }),
  ),
  confidence: Type.Number({ description: "Pattern confidence 0-1" }),
  lastOccurrence: Type.Number({
    description: "Last occurrence timestamp (Unix ms)",
  }),
  nextPredicted: Type.Optional(
    Type.Number({ description: "Next predicted occurrence (Unix ms)" }),
  ),
  matchingTasks: Type.Array(Type.String(), {
    description: "Task IDs matching this pattern",
  }),
});
export type RecurringPattern = Static<typeof RecurringPatternSchema>;

/** Estimation basis types */
export const EstimationBasisSchema = Type.Union([
  Type.Literal("history"),
  Type.Literal("similar"),
  Type.Literal("category_average"),
  Type.Literal("default"),
]);
export type EstimationBasis = Static<typeof EstimationBasisSchema>;

/** Time estimation result */
export const TimeEstimateSchema = Type.Object({
  estimatedMs: Type.Number({
    description: "Estimated duration in milliseconds",
  }),
  confidence: Type.Number({ description: "Confidence score 0-1" }),
  basedOn: EstimationBasisSchema,
  sampleSize: Type.Number({
    description: "Number of samples used for estimation",
  }),
  range: Type.Object({
    min: Type.Number({ description: "Minimum expected duration (ms)" }),
    max: Type.Number({ description: "Maximum expected duration (ms)" }),
  }),
});
export type TimeEstimate = Static<typeof TimeEstimateSchema>;

// =============================================================================
// Constants
// =============================================================================

/** Memory prefix for task duration records */
const MEMORY_PREFIX = "taskDuration";

/** Exponential moving average alpha (weight for recent observations) */
const EMA_ALPHA = 0.3;

/** Default task duration in milliseconds (30 minutes) */
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

/** Buffer percentage to add to estimates (25%) */
const BUFFER_PERCENTAGE = 0.25;

/** Minimum sample size for high confidence */
const MIN_HIGH_CONFIDENCE_SAMPLES = 5;

/** Category for temporal data in memory system */
const TEMPORAL_MEMORY_CATEGORY: MemoryCategory = "context";

/** Time constants for pattern detection */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;

/** Tolerance for pattern matching (10% of interval) */
const PATTERN_TOLERANCE = 0.1;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique ID for patterns.
 */
function generatePatternId(): string {
  return `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate exponential moving average.
 * @param current - Current EMA value (or null for first observation)
 * @param newValue - New observation
 * @param alpha - Smoothing factor (0-1, higher = more weight to recent)
 */
function calculateEMA(
  current: number | null,
  newValue: number,
  alpha: number = EMA_ALPHA,
): number {
  if (current === null) {
    return newValue;
  }
  return alpha * newValue + (1 - alpha) * current;
}

/**
 * Serialize a TaskDurationRecord for memory storage.
 */
function serializeRecord(record: TaskDurationRecord): string {
  return JSON.stringify({
    ...record,
    _prefix: MEMORY_PREFIX,
    _storedAt: Date.now(),
  });
}

/**
 * Deserialize a stored record from memory content.
 */
function deserializeRecord(content: string): TaskDurationRecord | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed._prefix !== MEMORY_PREFIX) {
      return null;
    }
    // Remove internal fields
    const { _prefix, _storedAt, ...record } = parsed;
    return record as TaskDurationRecord;
  } catch {
    return null;
  }
}

/**
 * Normalize a task name for matching (lowercase, trim, remove special chars).
 */
function normalizeTaskName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Calculate similarity between two task names (0-1).
 */
function calculateTaskNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeTaskName(name1);
  const norm2 = normalizeTaskName(name2);

  if (norm1 === norm2) return 1.0;

  // Check for substring match
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length >= norm2.length ? norm1 : norm2;
    return shorter.length / longer.length;
  }

  // Token overlap
  const tokens1 = norm1.split(" ");
  const tokens2 = norm2.split(" ");
  const tokens2Set = new Set(tokens2);
  const intersection = tokens1.filter((t) => tokens2Set.has(t));
  const unionSet = new Set(tokens1.concat(tokens2));

  return intersection.length / unionSet.size;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Record a completed task's duration for learning.
 *
 * Stores the duration record in the memory system for future estimation.
 *
 * @param record - The task duration record to save
 * @returns The saved record with computed accuracy if estimate was provided
 */
export async function recordTaskDuration(
  record: TaskDurationRecord,
): Promise<TaskDurationRecord> {
  // Calculate accuracy if we had an estimate
  const enrichedRecord: TaskDurationRecord = { ...record };
  if (record.estimatedMs && record.estimatedMs > 0) {
    enrichedRecord.accuracy = record.durationMs / record.estimatedMs;
  }

  // Store in memory if enabled
  if (isMemoryEnabled()) {
    const service = await createMemoryService();
    if (service) {
      await service.save({
        content: serializeRecord(enrichedRecord),
        category: TEMPORAL_MEMORY_CATEGORY,
        source: "agent",
        metadata: {
          type: MEMORY_PREFIX,
          taskId: record.taskId,
          taskName: record.taskName,
          category: record.category,
          durationMs: record.durationMs,
        },
      });
    }
  }

  return enrichedRecord;
}

/**
 * Estimate duration for a task based on historical data.
 *
 * Uses an exponential moving average of past durations for the same or similar tasks.
 * Falls back to category averages, then defaults if no data is available.
 *
 * @param taskName - Name of the task to estimate
 * @param category - Optional category for fallback estimation
 * @returns Time estimation with confidence and range
 */
export async function estimateTaskDuration(
  taskName: string,
  category?: string,
): Promise<TimeEstimate> {
  const history = await getTaskHistory({ limit: 100 });

  // 1. Find exact or similar task matches
  const exactMatches: TaskDurationRecord[] = [];
  const similarMatches: { record: TaskDurationRecord; similarity: number }[] =
    [];
  const categoryMatches: TaskDurationRecord[] = [];

  for (const record of history) {
    const similarity = calculateTaskNameSimilarity(taskName, record.taskName);

    if (similarity >= 0.9) {
      exactMatches.push(record);
    } else if (similarity >= 0.5) {
      similarMatches.push({ record, similarity });
    }

    if (category && record.category === category) {
      categoryMatches.push(record);
    }
  }

  // 2. Calculate estimate based on best available data
  let estimatedMs: number;
  let confidence: number;
  let basedOn: EstimationBasis;
  let sampleSize: number;
  let durations: number[];

  if (exactMatches.length > 0) {
    // Use EMA of exact matches
    durations = exactMatches.map((r) => r.durationMs);
    let ema: number | null = null;
    for (const d of durations) {
      ema = calculateEMA(ema, d);
    }
    estimatedMs = ema ?? DEFAULT_DURATION_MS;
    sampleSize = exactMatches.length;
    basedOn = "history";
    confidence = Math.min(0.95, 0.5 + sampleSize * 0.09);
  } else if (similarMatches.length > 0) {
    // Weight by similarity and use EMA
    similarMatches.sort((a, b) => b.similarity - a.similarity);
    durations = similarMatches.slice(0, 10).map((m) => m.record.durationMs);
    let ema: number | null = null;
    for (const d of durations) {
      ema = calculateEMA(ema, d);
    }
    estimatedMs = ema ?? DEFAULT_DURATION_MS;
    sampleSize = similarMatches.length;
    basedOn = "similar";
    confidence =
      Math.min(0.8, 0.3 + sampleSize * 0.05) * similarMatches[0].similarity;
  } else if (categoryMatches.length > 0) {
    // Use category average
    durations = categoryMatches.map((r) => r.durationMs);
    estimatedMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    sampleSize = categoryMatches.length;
    basedOn = "category_average";
    confidence = Math.min(0.6, 0.2 + sampleSize * 0.04);
  } else {
    // Fall back to default
    estimatedMs = DEFAULT_DURATION_MS;
    sampleSize = 0;
    basedOn = "default";
    confidence = 0.1;
    durations = [DEFAULT_DURATION_MS];
  }

  // 3. Calculate range
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const bufferMs = estimatedMs * BUFFER_PERCENTAGE;

  return {
    estimatedMs: Math.round(estimatedMs),
    confidence: Math.round(confidence * 100) / 100,
    basedOn,
    sampleSize,
    range: {
      min: Math.round(Math.max(min * 0.8, estimatedMs - bufferMs * 2)),
      max: Math.round(max * 1.2 + bufferMs),
    },
  };
}

/**
 * Analyze a deadline and provide intelligence for task scheduling.
 *
 * Calculates urgency score, risk level, and suggests optimal start time
 * based on estimated task duration and current time.
 *
 * @param deadline - Deadline timestamp in Unix ms
 * @param taskName - Task name for duration estimation
 * @param category - Optional category for estimation
 * @returns Deadline intelligence with scheduling recommendations
 */
export async function analyzeDeadline(
  deadline: number,
  taskName: string,
  category?: string,
): Promise<DeadlineIntelligence> {
  const now = Date.now();
  const timeUntilDeadline = deadline - now;
  const factors: string[] = [];

  // Get duration estimate
  const estimate = await estimateTaskDuration(taskName, category);
  const estimatedDuration = estimate.estimatedMs;
  const maxDuration = estimate.range.max;

  factors.push(`Estimated duration: ${formatDuration(estimatedDuration)}`);
  factors.push(
    `Estimate confidence: ${(estimate.confidence * 100).toFixed(0)}%`,
  );
  factors.push(`Based on: ${estimate.basedOn}`);

  // Calculate urgency score
  const urgencyScore = calculateUrgencyScore(deadline, estimatedDuration);

  // Calculate buffer time (use max range for safety)
  const bufferTimeMs = maxDuration * BUFFER_PERCENTAGE;

  // Suggest start time (deadline - max duration - buffer)
  const suggestedStartTime = Math.max(
    now,
    deadline - maxDuration - bufferTimeMs,
  );

  // Determine risk level
  let riskLevel: RiskLevel;
  if (timeUntilDeadline <= 0) {
    riskLevel = "critical";
    factors.push("Deadline has passed");
  } else if (timeUntilDeadline < estimatedDuration) {
    riskLevel = "critical";
    factors.push("Not enough time to complete at estimated pace");
  } else if (timeUntilDeadline < maxDuration + bufferTimeMs) {
    riskLevel = "high";
    factors.push("Tight timeline with minimal buffer");
  } else if (timeUntilDeadline < maxDuration * 2) {
    riskLevel = "medium";
    factors.push("Moderate timeline with some flexibility");
  } else {
    riskLevel = "low";
    factors.push("Comfortable timeline with ample buffer");
  }

  // Add context factors
  if (estimate.sampleSize < MIN_HIGH_CONFIDENCE_SAMPLES) {
    factors.push(`Limited historical data (${estimate.sampleSize} samples)`);
  }
  if (suggestedStartTime <= now) {
    factors.push("Should start immediately");
  } else {
    factors.push(
      `Can delay start by ${formatDuration(suggestedStartTime - now)}`,
    );
  }

  return {
    taskId: `task-${Date.now()}`,
    deadline,
    urgencyScore: Math.round(urgencyScore * 100) / 100,
    suggestedStartTime,
    bufferTimeMs: Math.round(bufferTimeMs),
    riskLevel,
    factors,
  };
}

/**
 * Calculate urgency score for a task (0-1, where 1 is most urgent).
 *
 * Uses a sigmoid-like function based on the ratio of time remaining
 * to estimated duration.
 *
 * @param deadline - Deadline timestamp in Unix ms
 * @param estimatedDuration - Estimated task duration in ms
 * @returns Urgency score between 0 and 1
 */
export function calculateUrgencyScore(
  deadline: number,
  estimatedDuration: number,
): number {
  const now = Date.now();
  const timeRemaining = deadline - now;

  // If deadline passed, maximum urgency
  if (timeRemaining <= 0) {
    return 1.0;
  }

  // Ratio of estimated duration to time remaining
  // ratio < 1: plenty of time
  // ratio = 1: exactly enough time
  // ratio > 1: not enough time
  const ratio = estimatedDuration / timeRemaining;

  // Sigmoid-like transformation
  // When ratio = 0.5, urgency ~= 0.25
  // When ratio = 1.0, urgency ~= 0.5
  // When ratio = 2.0, urgency ~= 0.75
  // When ratio = 4.0, urgency ~= 0.9
  const urgency = ratio / (1 + ratio);

  return Math.min(1.0, Math.max(0.0, urgency));
}

/**
 * Detect recurring patterns in task history.
 *
 * Analyzes task timestamps to identify daily, weekly, monthly, or custom
 * recurring patterns.
 *
 * @param taskHistory - Array of task duration records to analyze
 * @returns Array of detected recurring patterns
 */
export function detectRecurringPatterns(
  taskHistory: TaskDurationRecord[],
): RecurringPattern[] {
  if (taskHistory.length < 2) {
    return [];
  }

  // Group tasks by normalized name
  const taskGroups = new Map<string, TaskDurationRecord[]>();
  for (const record of taskHistory) {
    const key = normalizeTaskName(record.taskName);
    const group = taskGroups.get(key) || [];
    group.push(record);
    taskGroups.set(key, group);
  }

  const patterns: RecurringPattern[] = [];

  const taskGroupEntries = Array.from(taskGroups.entries());
  for (const [_taskKey, records] of taskGroupEntries) {
    if (records.length < 2) continue;

    // Sort by start time
    const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);

    // Calculate intervals between occurrences
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].startedAt - sorted[i - 1].startedAt);
    }

    if (intervals.length === 0) continue;

    // Calculate average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Calculate variance to determine consistency
    const variance =
      intervals.reduce((sum, i) => sum + (i - avgInterval) ** 2, 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / avgInterval;

    // Only consider patterns with reasonable consistency (CV < 0.5)
    if (coeffOfVariation > 0.5) continue;

    // Determine frequency type
    let frequency: Frequency;
    let interval: number | undefined;
    const tolerance = avgInterval * PATTERN_TOLERANCE;

    if (Math.abs(avgInterval - MS_PER_DAY) <= tolerance) {
      frequency = "daily";
    } else if (Math.abs(avgInterval - MS_PER_WEEK) <= tolerance) {
      frequency = "weekly";
    } else if (Math.abs(avgInterval - MS_PER_MONTH) <= tolerance) {
      frequency = "monthly";
    } else {
      frequency = "custom";
      interval = Math.round(avgInterval);
    }

    // Calculate confidence based on sample size and consistency
    const sampleFactor = Math.min(1, records.length / 10);
    const consistencyFactor = 1 - Math.min(1, coeffOfVariation);
    const confidence = 0.5 * sampleFactor + 0.5 * consistencyFactor;

    // Predict next occurrence
    const lastOccurrence = sorted[sorted.length - 1].startedAt;
    const nextPredicted = lastOccurrence + avgInterval;

    patterns.push({
      patternId: generatePatternId(),
      taskName: sorted[0].taskName,
      frequency,
      interval,
      confidence: Math.round(confidence * 100) / 100,
      lastOccurrence,
      nextPredicted: Math.round(nextPredicted),
      matchingTasks: sorted.map((r) => r.taskId),
    });
  }

  // Sort by confidence descending
  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Suggest the next deadline for a recurring pattern.
 *
 * @param pattern - The recurring pattern to analyze
 * @returns Suggested next occurrence timestamp, or undefined if unpredictable
 */
export function suggestNextDeadline(
  pattern: RecurringPattern,
): number | undefined {
  if (pattern.nextPredicted) {
    return pattern.nextPredicted;
  }

  // Calculate based on frequency and last occurrence
  const { frequency, interval, lastOccurrence } = pattern;

  switch (frequency) {
    case "daily":
      return lastOccurrence + MS_PER_DAY;
    case "weekly":
      return lastOccurrence + MS_PER_WEEK;
    case "monthly":
      return lastOccurrence + MS_PER_MONTH;
    case "custom":
      return interval ? lastOccurrence + interval : undefined;
    default:
      return undefined;
  }
}

/**
 * Retrieve task duration history from memory.
 *
 * @param opts - Query options (category filter, limit)
 * @returns Array of task duration records
 */
export async function getTaskHistory(opts?: {
  category?: string;
  limit?: number;
}): Promise<TaskDurationRecord[]> {
  const limit = opts?.limit ?? 50;

  if (!isMemoryEnabled()) {
    return [];
  }

  const service = await createMemoryService();
  if (!service) {
    return [];
  }

  // Search for task duration records
  const results = await service.search(`${MEMORY_PREFIX} task duration`, {
    category: TEMPORAL_MEMORY_CATEGORY,
    limit: limit * 2, // Fetch extra to account for non-matching records
    minScore: 0.3,
  });

  const records: TaskDurationRecord[] = [];

  for (const memory of results) {
    const record = deserializeRecord(memory.content);
    if (record) {
      // Filter by category if specified
      if (opts?.category && record.category !== opts.category) {
        continue;
      }
      records.push(record);
    }

    if (records.length >= limit) {
      break;
    }
  }

  // Sort by most recent first
  return records.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Get duration statistics for a category.
 *
 * @param category - Task category to analyze
 * @returns Statistics including average, min, max, and count
 */
export async function getCategoryStats(category: string): Promise<{
  category: string;
  count: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
} | null> {
  const history = await getTaskHistory({ category, limit: 100 });

  if (history.length === 0) {
    return null;
  }

  const durations = history.map((r) => r.durationMs);
  const totalMs = durations.reduce((a, b) => a + b, 0);

  return {
    category,
    count: history.length,
    averageMs: Math.round(totalMs / history.length),
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
    totalMs,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2h 30m", "45m", "1h 15m")
 */
export function formatDuration(ms: number): string {
  if (ms < 0) {
    return "overdue";
  }

  const minutes = Math.round(ms / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Parse a duration string to milliseconds.
 *
 * Supports formats like "2h", "30m", "2h 30m", "2 hours", "30 minutes"
 *
 * @param duration - Duration string to parse
 * @returns Duration in milliseconds, or null if unparseable
 */
export function parseDuration(duration: string): number | null {
  const input = duration.toLowerCase().trim();

  // Combined format: "2h 30m" or "2h30m"
  const combinedMatch = input.match(
    /(\d+)\s*h(?:ours?)?\s*(\d+)\s*m(?:in(?:ute)?s?)?/,
  );
  if (combinedMatch) {
    const hours = parseInt(combinedMatch[1], 10);
    const minutes = parseInt(combinedMatch[2], 10);
    return (hours * 60 + minutes) * 60 * 1000;
  }

  // Hours only: "2h" or "2 hours"
  const hoursMatch = input.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/);
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1]);
    return hours * 60 * 60 * 1000;
  }

  // Minutes only: "30m" or "30 minutes"
  const minutesMatch = input.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    return minutes * 60 * 1000;
  }

  // Plain number (assume minutes)
  const plainMatch = input.match(/^(\d+)$/);
  if (plainMatch) {
    const minutes = parseInt(plainMatch[1], 10);
    return minutes * 60 * 1000;
  }

  return null;
}

/**
 * Get a human-readable description of a risk level.
 */
export function describeRiskLevel(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "Low risk - plenty of time available";
    case "medium":
      return "Medium risk - schedule with some buffer";
    case "high":
      return "High risk - prioritize this task";
    case "critical":
      return "Critical - immediate attention required";
    default:
      return "Unknown risk level";
  }
}

// =============================================================================
// Recurring Task Handler - Smart Pattern Management
// =============================================================================

/** Parsed recurring schedule from natural language */
export type RecurringSchedule = {
  /** Base frequency type */
  type: "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";
  /** Interval multiplier (e.g., 2 for "every 2 weeks") */
  interval: number;
  /** Day of week (0=Sunday, 6=Saturday) for weekly patterns */
  dayOfWeek?: number;
  /** Which week in month (1-5, -1 for last) for monthly patterns */
  weekOfMonth?: number;
  /** Day of month (1-31) for monthly patterns */
  dayOfMonth?: number;
  /** Month (0-11) for yearly patterns */
  month?: number;
  /** Hour of day (0-23) */
  hour?: number;
  /** Minute of hour (0-59) */
  minute?: number;
  /** Original parsed text */
  parsedFrom: string;
  /** Confidence in the parsing (0-1) */
  confidence: number;
};

/** Recurring task with schedule */
export type RecurringTask = {
  id: string;
  name: string;
  schedule: RecurringSchedule;
  nextOccurrence: number;
  lastOccurrence?: number;
  category?: string;
  metadata?: Record<string, unknown>;
};

/** Day name to number mapping */
const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Month name to number mapping */
const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

/** Ordinal to number mapping */
const ORDINALS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
  last: -1,
};

/**
 * Parse a natural language recurring schedule.
 *
 * Supports patterns like:
 * - "every day", "daily"
 * - "every week", "weekly"
 * - "every other Tuesday"
 * - "first Monday of the month"
 * - "last Friday of every month"
 * - "every 2 weeks on Wednesday"
 * - "monthly on the 15th"
 * - "yearly on March 15"
 *
 * @param text - Natural language schedule description
 * @returns Parsed schedule or null if unparseable
 */
export function parseRecurringSchedule(text: string): RecurringSchedule | null {
  const input = text.toLowerCase().trim();

  // ─────────────────────────────────────────────────────────────────────────
  // Daily patterns
  // ─────────────────────────────────────────────────────────────────────────
  if (/\b(every\s*day|daily|each\s*day)\b/.test(input)) {
    const time = extractTime(input);
    return {
      type: "daily",
      interval: 1,
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.95,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Weekly patterns
  // ─────────────────────────────────────────────────────────────────────────

  // "every other [day]" - biweekly
  const everyOtherMatch = input.match(
    /every\s+other\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)/i,
  );
  if (everyOtherMatch) {
    const dayName = everyOtherMatch[1].toLowerCase();
    const time = extractTime(input);
    return {
      type: "biweekly",
      interval: 2,
      dayOfWeek: DAY_NAMES[dayName],
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.9,
    };
  }

  // "every [N] weeks on [day]" or "every [N] weeks"
  const everyNWeeksMatch = input.match(
    /every\s+(\d+)\s+weeks?\s*(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)?/i,
  );
  if (everyNWeeksMatch) {
    const interval = parseInt(everyNWeeksMatch[1], 10);
    const dayName = everyNWeeksMatch[2]?.toLowerCase();
    const time = extractTime(input);
    return {
      type: interval === 2 ? "biweekly" : "custom",
      interval,
      dayOfWeek: dayName ? DAY_NAMES[dayName] : undefined,
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: dayName ? 0.9 : 0.7,
    };
  }

  // "weekly on [day]" or "every [day]" or "weekly"
  const weeklyMatch = input.match(
    /(?:weekly|every\s+week|each\s+week)(?:\s+on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)?/i,
  );
  const everyDayMatch = input.match(
    /every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i,
  );

  if (weeklyMatch || everyDayMatch) {
    const dayName = (weeklyMatch?.[1] || everyDayMatch?.[1])?.toLowerCase();
    const time = extractTime(input);
    return {
      type: "weekly",
      interval: 1,
      dayOfWeek: dayName ? DAY_NAMES[dayName] : undefined,
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: dayName ? 0.9 : 0.7,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Monthly patterns - Nth weekday of month
  // ─────────────────────────────────────────────────────────────────────────

  // "[ordinal] [day] of [every/the/each] month"
  const nthDayMatch = input.match(
    /(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\s+(?:of\s+)?(?:every|the|each)?\s*month/i,
  );
  if (nthDayMatch) {
    const ordinalStr = nthDayMatch[1].toLowerCase();
    const dayName = nthDayMatch[2].toLowerCase();
    const time = extractTime(input);
    return {
      type: "monthly",
      interval: 1,
      dayOfWeek: DAY_NAMES[dayName],
      weekOfMonth: ORDINALS[ordinalStr],
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.95,
    };
  }

  // "monthly on the [N]th" or "every month on the [N]th"
  const monthlyDateMatch = input.match(
    /(?:monthly|every\s+month)\s+(?:on\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?/i,
  );
  if (monthlyDateMatch) {
    const dayOfMonth = parseInt(monthlyDateMatch[1], 10);
    const time = extractTime(input);
    return {
      type: "monthly",
      interval: 1,
      dayOfMonth: Math.min(31, Math.max(1, dayOfMonth)),
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.9,
    };
  }

  // Simple "monthly"
  if (/\b(monthly|every\s+month|each\s+month)\b/.test(input)) {
    const time = extractTime(input);
    return {
      type: "monthly",
      interval: 1,
      dayOfMonth: 1, // Default to 1st of month
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.7,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Yearly patterns
  // ─────────────────────────────────────────────────────────────────────────

  // "yearly on [month] [day]" or "every year on [month] [day]"
  const yearlyMatch = input.match(
    /(?:yearly|annually|every\s+year)\s+(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d+)(?:st|nd|rd|th)?/i,
  );
  if (yearlyMatch) {
    const monthName = yearlyMatch[1].toLowerCase();
    const dayOfMonth = parseInt(yearlyMatch[2], 10);
    const time = extractTime(input);
    return {
      type: "yearly",
      interval: 1,
      month: MONTH_NAMES[monthName],
      dayOfMonth: Math.min(31, Math.max(1, dayOfMonth)),
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.95,
    };
  }

  // Simple "yearly" or "annually"
  if (/\b(yearly|annually|every\s+year)\b/.test(input)) {
    const time = extractTime(input);
    return {
      type: "yearly",
      interval: 1,
      month: 0, // Default to January
      dayOfMonth: 1,
      hour: time?.hour ?? 9,
      minute: time?.minute ?? 0,
      parsedFrom: text,
      confidence: 0.6,
    };
  }

  return null;
}

/**
 * Extract time from a text string.
 */
function extractTime(text: string): { hour: number; minute: number } | null {
  const input = text.toLowerCase();

  // "at [N]:[MM] [am/pm]"
  const timeMatch = input.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    return { hour, minute };
  }

  // Time of day keywords
  if (/\bmorning\b/.test(input)) return { hour: 9, minute: 0 };
  if (/\bnoon\b/.test(input)) return { hour: 12, minute: 0 };
  if (/\bafternoon\b/.test(input)) return { hour: 14, minute: 0 };
  if (/\bevening\b/.test(input)) return { hour: 18, minute: 0 };

  return null;
}

/**
 * Calculate the next occurrence of a recurring schedule.
 *
 * @param schedule - The recurring schedule
 * @param after - Calculate next occurrence after this timestamp (default: now)
 * @returns Next occurrence timestamp in Unix ms
 */
export function calculateNextOccurrence(
  schedule: RecurringSchedule,
  after: number = Date.now(),
): number {
  const base = new Date(after);
  const next = new Date(base);

  // Set the time component
  next.setHours(schedule.hour ?? 9, schedule.minute ?? 0, 0, 0);

  switch (schedule.type) {
    case "daily": {
      // If today's time has passed, move to tomorrow
      if (next.getTime() <= after) {
        next.setDate(next.getDate() + schedule.interval);
      }
      break;
    }

    case "weekly":
    case "biweekly": {
      const targetDay = schedule.dayOfWeek ?? 1; // Default to Monday
      const currentDay = next.getDay();
      let daysToAdd = (targetDay - currentDay + 7) % 7;

      // If it's the target day but time has passed, move to next week
      if (daysToAdd === 0 && next.getTime() <= after) {
        daysToAdd = 7 * schedule.interval;
      } else if (daysToAdd > 0 && schedule.type === "biweekly") {
        // For biweekly, we need to check if we're in the right week
        // This is a simplified approach - would need proper week tracking
        daysToAdd += 7 * (schedule.interval - 1);
      }

      next.setDate(next.getDate() + daysToAdd);
      break;
    }

    case "monthly": {
      if (
        schedule.weekOfMonth !== undefined &&
        schedule.dayOfWeek !== undefined
      ) {
        // Nth weekday of month pattern
        let result = getNthWeekdayOfMonth(
          base,
          schedule.weekOfMonth,
          schedule.dayOfWeek,
          schedule.hour ?? 9,
          schedule.minute ?? 0,
        );

        // If this month's occurrence has passed, get next month's
        if (result.getTime() <= after) {
          const nextMonth = new Date(base);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          result = getNthWeekdayOfMonth(
            nextMonth,
            schedule.weekOfMonth,
            schedule.dayOfWeek,
            schedule.hour ?? 9,
            schedule.minute ?? 0,
          );
        }
        return result.getTime();
      }
      // Day of month pattern
      const targetDay = schedule.dayOfMonth ?? 1;
      next.setDate(targetDay);

      // If this month's date has passed, move to next month
      if (next.getTime() <= after) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(targetDay);
      }

      // Handle months with fewer days
      while (next.getDate() !== targetDay) {
        next.setDate(0); // Go to last day of previous month
        next.setDate(targetDay);
      }
      break;
    }

    case "yearly": {
      next.setMonth(schedule.month ?? 0);
      next.setDate(schedule.dayOfMonth ?? 1);

      // If this year's date has passed, move to next year
      if (next.getTime() <= after) {
        next.setFullYear(next.getFullYear() + 1);
      }
      break;
    }

    case "custom": {
      // Custom interval in weeks
      const targetDay = schedule.dayOfWeek ?? next.getDay();
      const currentDay = next.getDay();
      let daysToAdd = (targetDay - currentDay + 7) % 7;

      if (daysToAdd === 0 && next.getTime() <= after) {
        daysToAdd = 7 * schedule.interval;
      }

      next.setDate(next.getDate() + daysToAdd);
      break;
    }
  }

  return next.getTime();
}

/**
 * Get the Nth weekday of a given month.
 *
 * @param base - Base date to determine the month/year
 * @param weekOfMonth - Which week (1-5, -1 for last)
 * @param dayOfWeek - Day of week (0=Sunday, 6=Saturday)
 * @param hour - Hour to set
 * @param minute - Minute to set
 * @returns Date object for the Nth weekday
 */
function getNthWeekdayOfMonth(
  base: Date,
  weekOfMonth: number,
  dayOfWeek: number,
  hour: number,
  minute: number,
): Date {
  const result = new Date(base);
  result.setDate(1);
  result.setHours(hour, minute, 0, 0);

  if (weekOfMonth === -1) {
    // Last occurrence - start from end of month
    result.setMonth(result.getMonth() + 1);
    result.setDate(0); // Last day of target month

    while (result.getDay() !== dayOfWeek) {
      result.setDate(result.getDate() - 1);
    }
  } else {
    // Find first occurrence of the day in the month
    while (result.getDay() !== dayOfWeek) {
      result.setDate(result.getDate() + 1);
    }

    // Add weeks to get to Nth occurrence
    result.setDate(result.getDate() + (weekOfMonth - 1) * 7);
  }

  return result;
}

/**
 * Format a recurring schedule as human-readable text.
 *
 * @param schedule - The schedule to format
 * @returns Human-readable description
 */
export function formatRecurringSchedule(schedule: RecurringSchedule): string {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const ordinals = ["", "1st", "2nd", "3rd", "4th", "5th"];

  const timeStr =
    schedule.hour !== undefined
      ? ` at ${schedule.hour}:${(schedule.minute ?? 0).toString().padStart(2, "0")}`
      : "";

  switch (schedule.type) {
    case "daily":
      return `Every day${timeStr}`;

    case "weekly":
      return schedule.dayOfWeek !== undefined
        ? `Every ${dayNames[schedule.dayOfWeek]}${timeStr}`
        : `Every week${timeStr}`;

    case "biweekly":
      return schedule.dayOfWeek !== undefined
        ? `Every other ${dayNames[schedule.dayOfWeek]}${timeStr}`
        : `Every 2 weeks${timeStr}`;

    case "monthly":
      if (
        schedule.weekOfMonth !== undefined &&
        schedule.dayOfWeek !== undefined
      ) {
        const ordinal =
          schedule.weekOfMonth === -1 ? "last" : ordinals[schedule.weekOfMonth];
        return `${ordinal} ${dayNames[schedule.dayOfWeek]} of every month${timeStr}`;
      }
      if (schedule.dayOfMonth !== undefined) {
        return `Monthly on the ${schedule.dayOfMonth}${getOrdinalSuffix(schedule.dayOfMonth)}${timeStr}`;
      }
      return `Monthly${timeStr}`;

    case "yearly":
      if (schedule.month !== undefined && schedule.dayOfMonth !== undefined) {
        return `Yearly on ${monthNames[schedule.month]} ${schedule.dayOfMonth}${timeStr}`;
      }
      return `Yearly${timeStr}`;

    case "custom":
      return schedule.dayOfWeek !== undefined
        ? `Every ${schedule.interval} weeks on ${dayNames[schedule.dayOfWeek]}${timeStr}`
        : `Every ${schedule.interval} weeks${timeStr}`;
  }
}

/**
 * Get ordinal suffix for a number.
 */
function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Suggest optimal scheduling based on calendar availability and task patterns.
 *
 * @param taskName - Name of the task to schedule
 * @param deadline - Optional deadline timestamp
 * @param durationMs - Optional known duration (otherwise estimated)
 * @param busyPeriods - Array of busy time periods
 * @param _timezone - Timezone for working hours calculation
 * @returns Scheduling suggestion
 */
export async function suggestOptimalSchedule(
  taskName: string,
  deadline?: number,
  durationMs?: number,
  busyPeriods: Array<{ start: number; end: number }> = [],
  _timezone = "UTC",
): Promise<{
  suggestedStart: number;
  suggestedEnd: number;
  estimatedDuration: TimeEstimate;
  deadlineAnalysis?: DeadlineIntelligence;
  rationale: string[];
}> {
  // Get duration estimate if not provided
  const estimate = await estimateTaskDuration(taskName);
  const taskDuration = durationMs ?? estimate.estimatedMs;

  const now = Date.now();
  const rationale: string[] = [];

  // If there's a deadline, analyze it
  let deadlineAnalysis: DeadlineIntelligence | undefined;
  if (deadline) {
    deadlineAnalysis = await analyzeDeadline(deadline, taskName);
    rationale.push(`Deadline: ${new Date(deadline).toLocaleString()}`);
    rationale.push(`Risk level: ${deadlineAnalysis.riskLevel}`);
  }

  // Find available slots
  const slots = findFreeSlots(
    busyPeriods,
    now,
    deadline ?? now + 7 * MS_PER_DAY,
    taskDuration,
  );

  let suggestedStart: number;
  let suggestedEnd: number;

  if (slots.length > 0) {
    // Use the first available slot
    suggestedStart = slots[0].start;
    suggestedEnd = suggestedStart + taskDuration;
    rationale.push(`Found ${slots.length} available time slot(s)`);
  } else {
    // No free slots - suggest based on deadline or now
    if (deadline && deadlineAnalysis) {
      suggestedStart = deadlineAnalysis.suggestedStartTime;
    } else {
      suggestedStart = now;
    }
    suggestedEnd = suggestedStart + taskDuration;
    rationale.push(
      "No free slots in calendar - may need to reschedule other tasks",
    );
  }

  rationale.push(
    `Estimated duration: ${formatDuration(taskDuration)} (${estimate.basedOn})`,
  );

  return {
    suggestedStart,
    suggestedEnd,
    estimatedDuration: estimate,
    deadlineAnalysis,
    rationale,
  };
}

/**
 * Find free time slots given busy periods.
 */
function findFreeSlots(
  busyPeriods: Array<{ start: number; end: number }>,
  rangeStart: number,
  rangeEnd: number,
  minDuration: number,
): Array<{ start: number; end: number }> {
  // Sort busy periods by start time
  const sorted = [...busyPeriods].sort((a, b) => a.start - b.start);

  const slots: Array<{ start: number; end: number }> = [];
  let currentStart = rangeStart;

  for (const busy of sorted) {
    if (busy.start > currentStart) {
      const gapDuration = busy.start - currentStart;
      if (gapDuration >= minDuration) {
        slots.push({ start: currentStart, end: busy.start });
      }
    }
    currentStart = Math.max(currentStart, busy.end);
  }

  // Check for slot after all busy periods
  if (rangeEnd > currentStart) {
    const gapDuration = rangeEnd - currentStart;
    if (gapDuration >= minDuration) {
      slots.push({ start: currentStart, end: rangeEnd });
    }
  }

  return slots;
}
