/**
 * Productivity Analyzer - Tracks task completions and identifies
 * peak productivity patterns stored in memory.
 *
 * Uses memory category "context" with type "productivity" in metadata.
 */

import {
  createMemoryService,
  isMemoryEnabled,
  type MemoryService,
} from "../../memory/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Task completion record */
export interface TaskCompletion {
  taskType: string;
  completedAt: Date;
  hour: number;
  dayOfWeek: number;
}

/** Peak hours range */
export interface PeakHoursRange {
  start: number;
  end: number;
}

/** Hourly productivity data */
interface HourlyProductivityData {
  hour: number;
  completionCount: number;
  taskTypes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum completions needed to identify a peak hour */
const MIN_COMPLETIONS_FOR_PEAK = 3;

/** Memory metadata type for productivity records */
const PRODUCTIVITY_MEMORY_TYPE = "productivity_completion";

/** Memory metadata type for productivity patterns */
const PRODUCTIVITY_PATTERN_TYPE = "productivity_pattern";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Format hour for display (e.g., "9:00 AM") */
function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

/** Get day name from day of week number */
function getDayName(dayOfWeek: number): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dayOfWeek] ?? "Unknown";
}

/** Check if two hours are adjacent or within 1 hour */
function areHoursAdjacent(hour1: number, hour2: number): boolean {
  const diff = Math.abs(hour1 - hour2);
  return diff <= 1 || diff === 23; // Handle wrap-around (23 and 0 are adjacent)
}

/** Group adjacent hours into ranges */
function groupAdjacentHours(hours: number[]): PeakHoursRange[] {
  if (hours.length === 0) return [];

  const sorted = [...hours].sort((a, b) => a - b);
  const ranges: PeakHoursRange[] = [];

  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (areHoursAdjacent(rangeEnd, current)) {
      rangeEnd = current;
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = current;
      rangeEnd = current;
    }
  }

  // Add the last range
  ranges.push({ start: rangeStart, end: rangeEnd });

  return ranges;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductivityAnalyzer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes task completion patterns to identify peak productivity hours
 * and suggest optimal times for different task types.
 */
export class ProductivityAnalyzer {
  constructor(private readonly memory: MemoryService) {}

  /**
   * Record a task completion for pattern analysis.
   * Stores the completion in memory with category "context" and productivity metadata.
   */
  async recordCompletion(taskType: string, completedAt: Date): Promise<void> {
    const hour = completedAt.getHours();
    const dayOfWeek = completedAt.getDay();

    await this.memory.save({
      content: `Task "${taskType}" completed at ${formatHour(hour)} on ${getDayName(dayOfWeek)}`,
      category: "context",
      source: "auto",
      senderId: "global",
      metadata: {
        type: PRODUCTIVITY_MEMORY_TYPE,
        taskType,
        completedAt: completedAt.getTime(),
        hour,
        dayOfWeek,
      },
    });
  }

  /**
   * Analyze past completions to find peak productivity hours.
   * Returns ranges of hours where task completions are most frequent.
   */
  async getPeakHours(): Promise<PeakHoursRange[]> {
    // Search for all productivity completions
    const memories = await this.memory.search("task completed productivity", {
      limit: 200,
      minScore: 0.3,
    });

    // Filter to actual productivity completions
    const completions = memories.filter(
      (m) => m.metadata?.type === PRODUCTIVITY_MEMORY_TYPE,
    );

    if (completions.length < MIN_COMPLETIONS_FOR_PEAK) {
      return []; // Not enough data
    }

    // Aggregate by hour
    const hourlyData = new Map<number, HourlyProductivityData>();

    for (const mem of completions) {
      const hour = mem.metadata?.hour as number;
      if (typeof hour !== "number") continue;

      const existing = hourlyData.get(hour);
      if (existing) {
        existing.completionCount++;
        const taskType = mem.metadata?.taskType as string;
        if (taskType && !existing.taskTypes.includes(taskType)) {
          existing.taskTypes.push(taskType);
        }
      } else {
        hourlyData.set(hour, {
          hour,
          completionCount: 1,
          taskTypes: [mem.metadata?.taskType as string].filter(Boolean),
        });
      }
    }

    // Find hours with above-average completions
    const counts = [...hourlyData.values()].map((d) => d.completionCount);
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;

    const peakHours = [...hourlyData.values()]
      .filter(
        (d) =>
          d.completionCount >= avgCount &&
          d.completionCount >= MIN_COMPLETIONS_FOR_PEAK,
      )
      .sort((a, b) => b.completionCount - a.completionCount)
      .map((d) => d.hour);

    // Group adjacent hours into ranges
    return groupAdjacentHours(peakHours);
  }

  /**
   * Suggest the best time slot for a given task type based on past patterns.
   * Returns a human-readable suggestion string.
   */
  async suggestOptimalTime(taskType: string): Promise<string> {
    // Search for completions of this specific task type
    const memories = await this.memory.search(`task ${taskType} completed`, {
      limit: 100,
      minScore: 0.3,
    });

    // Filter to matching task type completions
    const typeCompletions = memories.filter(
      (m) =>
        m.metadata?.type === PRODUCTIVITY_MEMORY_TYPE &&
        (m.metadata?.taskType as string)
          ?.toLowerCase()
          .includes(taskType.toLowerCase()),
    );

    if (typeCompletions.length < 2) {
      // Not enough task-specific data, use general peak hours
      const peakHours = await this.getPeakHours();

      if (peakHours.length === 0) {
        return `Not enough data yet for "${taskType}". Complete more tasks to get personalized suggestions.`;
      }

      const bestRange = peakHours[0];
      return `Based on general patterns, try scheduling "${taskType}" between ${formatHour(bestRange.start)} and ${formatHour(bestRange.end + 1)}.`;
    }

    // Find best hour for this task type
    const hourCounts = new Map<number, number>();
    for (const mem of typeCompletions) {
      const hour = mem.metadata?.hour as number;
      if (typeof hour === "number") {
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      }
    }

    // Find the hour with most completions
    let bestHour = 9; // Default to 9 AM
    let maxCount = 0;

    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestHour = hour;
      }
    }

    // Also check day of week patterns
    const dayCounts = new Map<number, number>();
    for (const mem of typeCompletions) {
      const day = mem.metadata?.dayOfWeek as number;
      if (typeof day === "number") {
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    }

    let bestDay = -1;
    let maxDayCount = 0;
    for (const [day, count] of dayCounts) {
      if (count > maxDayCount) {
        maxDayCount = count;
        bestDay = day;
      }
    }

    // Store the pattern for future reference
    await this.saveProductivityPattern(taskType, bestHour, bestDay);

    // Build suggestion
    const timeSuggestion = `around ${formatHour(bestHour)}`;
    const daySuggestion =
      bestDay >= 0 && maxDayCount >= 2
        ? `, especially on ${getDayName(bestDay)}s`
        : "";

    return `Based on ${typeCompletions.length} past completions, you're most productive with "${taskType}" ${timeSuggestion}${daySuggestion}.`;
  }

  /**
   * Save a productivity pattern to memory for quick retrieval.
   */
  private async saveProductivityPattern(
    taskType: string,
    bestHour: number,
    bestDay: number,
  ): Promise<void> {
    await this.memory.save({
      content: `Productivity pattern for "${taskType}": best hour ${formatHour(bestHour)}${bestDay >= 0 ? `, best day ${getDayName(bestDay)}` : ""}`,
      category: "context",
      source: "auto",
      senderId: "global",
      metadata: {
        type: PRODUCTIVITY_PATTERN_TYPE,
        taskType,
        bestHour,
        bestDay,
        updatedAt: Date.now(),
      },
    });
  }

  /**
   * Get a summary of all productivity patterns.
   */
  async getProductivitySummary(): Promise<{
    totalCompletions: number;
    peakHours: PeakHoursRange[];
    topTaskTypes: string[];
  }> {
    const memories = await this.memory.search("task completed productivity", {
      limit: 200,
      minScore: 0.3,
    });

    const completions = memories.filter(
      (m) => m.metadata?.type === PRODUCTIVITY_MEMORY_TYPE,
    );

    // Count task types
    const typeCounts = new Map<string, number>();
    for (const mem of completions) {
      const taskType = mem.metadata?.taskType as string;
      if (taskType) {
        typeCounts.set(taskType, (typeCounts.get(taskType) ?? 0) + 1);
      }
    }

    const topTaskTypes = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);

    const peakHours = await this.getPeakHours();

    return {
      totalCompletions: completions.length,
      peakHours,
      topTaskTypes,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

let analyzerInstance: ProductivityAnalyzer | null = null;
let initPromise: Promise<ProductivityAnalyzer | null> | null = null;

/**
 * Get or create the ProductivityAnalyzer singleton.
 * Returns null if memory system is not enabled.
 */
export async function createProductivityAnalyzer(): Promise<ProductivityAnalyzer | null> {
  if (analyzerInstance) return analyzerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!isMemoryEnabled()) {
        console.log("ProductivityAnalyzer: Memory system not enabled");
        return null;
      }

      const memory = await createMemoryService();
      if (!memory) {
        console.log("ProductivityAnalyzer: Memory service not available");
        return null;
      }

      analyzerInstance = new ProductivityAnalyzer(memory);
      return analyzerInstance;
    } catch (error) {
      console.error("Failed to initialize ProductivityAnalyzer:", error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Reset the analyzer singleton (for testing).
 */
export function resetProductivityAnalyzer(): void {
  analyzerInstance = null;
  initPromise = null;
}
