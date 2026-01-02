/**
 * Energy-Aware Scheduling - Learns user's productive hours from task completion
 * patterns and suggests optimal task scheduling.
 *
 * Features:
 * - Tracks task completions with timing and energy metadata
 * - Analyzes patterns to detect peak productivity hours
 * - Suggests optimal scheduling based on task complexity and energy alignment
 * - Integrates with calendar for conflict-aware suggestions
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";

import {
  createMemoryService,
  isMemoryEnabled,
  type MemoryService,
} from "../memory/index.js";
import {
  type BusyPeriod,
  findAvailableSlots,
  type TimeSlot,
} from "./calendar-helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Energy level assessment */
export type EnergyLevel = "high" | "medium" | "low" | "resting";

/** Task cognitive load classification */
export type CognitiveLoad =
  | "deep_work"
  | "collaborative"
  | "administrative"
  | "creative";

/** Time bucket for pattern analysis */
export type TimeBucket =
  | "early_morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

/** Chronotype classification */
export type Chronotype = "morning" | "evening" | "neutral";

/** A recorded task completion event */
export interface TaskCompletionEvent {
  /** Unique identifier */
  id: string;
  /** Task description or title */
  taskDescription: string;
  /** When the task was completed (Unix ms) */
  completedAt: number;
  /** How long the task took (minutes) */
  durationMinutes: number;
  /** Cognitive complexity 1-5 */
  complexity: 1 | 2 | 3 | 4 | 5;
  /** Self-reported energy level when completed */
  energyLevel?: EnergyLevel;
  /** Focus quality 0-1 */
  focusScore?: number;
  /** Category of work */
  cognitiveLoad?: CognitiveLoad;
  /** User/sender ID */
  senderId?: string;
}

/** Productivity score for a time period */
export interface ProductivityScore {
  /** Hour of day (0-23) */
  hour: number;
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek?: number;
  /** Productivity score 0-1 */
  score: number;
  /** Number of data points for this score */
  sampleCount: number;
  /** Average task complexity completed */
  avgComplexity: number;
  /** Average focus score */
  avgFocus: number;
}

/** User's energy/productivity profile */
export interface EnergyProfile {
  /** User identifier */
  userId: string;
  /** Detected chronotype */
  chronotype: Chronotype;
  /** Hours with highest productivity (sorted by score desc) */
  peakHours: number[];
  /** Hours with lowest productivity */
  troughHours: number[];
  /** Hourly productivity scores */
  hourlyScores: ProductivityScore[];
  /** Best days for complex work */
  bestDaysForDeepWork: number[];
  /** Recommended break duration (minutes) */
  recommendedBreakMinutes: number;
  /** Confidence in this profile (0-1) */
  confidence: number;
  /** When profile was last updated */
  updatedAt: number;
  /** Total completions analyzed */
  totalCompletions: number;
}

/** Scheduling suggestion */
export interface ScheduleSuggestion {
  /** Suggested time slot */
  timeSlot: TimeSlot;
  /** How well this slot aligns with user's energy (0-1) */
  energyAlignment: number;
  /** Recommended task type for this slot */
  recommendedCognitiveLoad: CognitiveLoad;
  /** Human-readable reason for suggestion */
  reason: string;
  /** Any calendar conflicts */
  conflicts?: string[];
}

/** Options for schedule suggestions */
export interface ScheduleOptions {
  /** User/sender ID */
  senderId?: string;
  /** Days ahead to look (default: 7) */
  lookaheadDays?: number;
  /** Calendar busy periods to avoid */
  busyPeriods?: BusyPeriod[];
  /** Minimum energy alignment score (default: 0.5) */
  minEnergyAlignment?: number;
  /** Maximum suggestions to return (default: 5) */
  maxSuggestions?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum completions needed before making confident suggestions */
const MIN_COMPLETIONS_FOR_CONFIDENCE = 10;

/** Hours typically considered morning peak */
const MORNING_PEAK_HOURS = [9, 10, 11];

/** Hours typically considered afternoon peak */
const AFTERNOON_PEAK_HOURS = [14, 15, 16];

/** Hours typically considered energy dip (used for pattern analysis) */
const _POST_LUNCH_DIP_HOURS = [13, 14];

/** Default working hours */
const DEFAULT_WORK_START = 9;
const DEFAULT_WORK_END = 18;

/** Time bucket boundaries */
const TIME_BUCKETS: Record<TimeBucket, [number, number]> = {
  early_morning: [5, 8],
  morning: [8, 12],
  midday: [12, 14],
  afternoon: [14, 18],
  evening: [18, 21],
  night: [21, 5],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Get the time bucket for an hour */
function getTimeBucket(hour: number): TimeBucket {
  for (const [bucket, [start, end]] of Object.entries(TIME_BUCKETS)) {
    if (bucket === "night") {
      if (hour >= start || hour < end) return bucket as TimeBucket;
    } else if (hour >= start && hour < end) {
      return bucket as TimeBucket;
    }
  }
  return "morning"; // fallback
}

/** Calculate weighted productivity score from a completion */
function calculateProductivityScore(event: TaskCompletionEvent): number {
  // Base score from complexity (higher complexity = more impressive to complete)
  const complexityWeight = event.complexity / 5;

  // Efficiency: completing faster than expected is good
  // Assume 30 min baseline per complexity level
  const expectedDuration = event.complexity * 30;
  const efficiencyRatio = Math.min(expectedDuration / event.durationMinutes, 2);
  const efficiencyWeight = efficiencyRatio / 2;

  // Energy and focus multipliers
  const energyMultiplier =
    event.energyLevel === "high"
      ? 1.2
      : event.energyLevel === "medium"
        ? 1.0
        : event.energyLevel === "low"
          ? 0.8
          : 1.0;

  const focusMultiplier = event.focusScore ?? 0.8;

  return (
    (complexityWeight * 0.4 + efficiencyWeight * 0.3 + focusMultiplier * 0.3) *
    energyMultiplier
  );
}

/** Detect chronotype from hourly productivity scores */
function detectChronotype(hourlyScores: ProductivityScore[]): Chronotype {
  const morningScore = hourlyScores
    .filter((s) => MORNING_PEAK_HOURS.includes(s.hour))
    .reduce((sum, s) => sum + s.score * s.sampleCount, 0);

  const afternoonScore = hourlyScores
    .filter((s) => AFTERNOON_PEAK_HOURS.includes(s.hour))
    .reduce((sum, s) => sum + s.score * s.sampleCount, 0);

  const ratio = morningScore / (afternoonScore || 1);

  if (ratio > 1.3) return "morning";
  if (ratio < 0.7) return "evening";
  return "neutral";
}

/** Map cognitive load to required energy level */
function cognitiveLoadToEnergyRequirement(load: CognitiveLoad): number {
  switch (load) {
    case "deep_work":
      return 0.8;
    case "creative":
      return 0.7;
    case "collaborative":
      return 0.5;
    case "administrative":
      return 0.3;
  }
}

/** Generate unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EnergySchedulerService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Service for analyzing productivity patterns and suggesting optimal schedules.
 */
export class EnergySchedulerService {
  private readonly memory: MemoryService;

  constructor(memory: MemoryService) {
    this.memory = memory;
  }

  /**
   * Log a task completion event for pattern analysis.
   */
  async logTaskCompletion(
    event: Omit<TaskCompletionEvent, "id">,
  ): Promise<TaskCompletionEvent> {
    const completion: TaskCompletionEvent = {
      ...event,
      id: generateId(),
    };

    const date = new Date(completion.completedAt);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const timeBucket = getTimeBucket(hour);
    const productivityScore = calculateProductivityScore(completion);

    // Store in memory with rich metadata for later analysis
    await this.memory.save({
      content: `Task completed: "${completion.taskDescription}" at ${date.toLocaleTimeString()} (${timeBucket}), complexity ${completion.complexity}/5, ${completion.durationMinutes}min, productivity score ${productivityScore.toFixed(2)}`,
      category: "context",
      source: "auto",
      senderId: completion.senderId ?? "global",
      metadata: {
        type: "task_completion",
        ...completion,
        hour,
        dayOfWeek,
        timeBucket,
        productivityScore,
      },
    });

    return completion;
  }

  /**
   * Analyze task completions to build an energy profile for a user.
   */
  async analyzeProductivityPatterns(
    senderId?: string,
  ): Promise<EnergyProfile | null> {
    // Search for all task completion memories
    const memories = await this.memory.search("task completed productivity", {
      senderId: senderId ?? "global",
      limit: 100,
      minScore: 0.3,
    });

    // Filter to actual task completions with metadata
    const completions = memories.filter(
      (m) =>
        m.metadata?.type === "task_completion" &&
        typeof m.metadata.hour === "number",
    );

    if (completions.length < 3) {
      return null; // Not enough data
    }

    // Aggregate by hour
    const hourlyData = new Map<
      number,
      {
        scores: number[];
        complexities: number[];
        focuses: number[];
      }
    >();

    for (let h = 0; h < 24; h++) {
      hourlyData.set(h, { scores: [], complexities: [], focuses: [] });
    }

    for (const mem of completions) {
      if (!mem.metadata) continue;
      const hour = mem.metadata.hour as number;
      const data = hourlyData.get(hour);
      if (!data) continue;
      data.scores.push(mem.metadata.productivityScore as number);
      data.complexities.push(mem.metadata.complexity as number);
      if (typeof mem.metadata.focusScore === "number") {
        data.focuses.push(mem.metadata.focusScore);
      }
    }

    // Calculate hourly productivity scores
    const hourlyScores: ProductivityScore[] = [];
    for (const [hour, data] of Array.from(hourlyData.entries())) {
      if (data.scores.length > 0) {
        const avgScore =
          data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        const avgComplexity =
          data.complexities.reduce((a, b) => a + b, 0) /
          data.complexities.length;
        const avgFocus =
          data.focuses.length > 0
            ? data.focuses.reduce((a, b) => a + b, 0) / data.focuses.length
            : 0.5;

        hourlyScores.push({
          hour,
          score: avgScore,
          sampleCount: data.scores.length,
          avgComplexity,
          avgFocus,
        });
      }
    }

    // Sort to find peak and trough hours
    const sortedByScore = [...hourlyScores].sort((a, b) => b.score - a.score);
    const peakHours = sortedByScore.slice(0, 4).map((s) => s.hour);
    const troughHours = sortedByScore.slice(-3).map((s) => s.hour);

    // Detect chronotype
    const chronotype = detectChronotype(hourlyScores);

    // Calculate confidence based on data volume
    const confidence = Math.min(
      completions.length / MIN_COMPLETIONS_FOR_CONFIDENCE,
      1,
    );

    // Analyze day-of-week patterns for deep work
    const dayScores = new Map<number, number[]>();
    for (const mem of completions) {
      if (!mem.metadata) continue;
      const day = mem.metadata.dayOfWeek as number;
      const complexity = mem.metadata.complexity as number;
      if (complexity >= 4) {
        // Only high-complexity tasks
        if (!dayScores.has(day)) dayScores.set(day, []);
        dayScores.get(day)?.push(mem.metadata.productivityScore as number);
      }
    }

    const bestDaysForDeepWork = Array.from(dayScores.entries())
      .map(([day, scores]) => ({
        day,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3)
      .map((d) => d.day);

    const profile: EnergyProfile = {
      userId: senderId ?? "global",
      chronotype,
      peakHours,
      troughHours,
      hourlyScores,
      bestDaysForDeepWork:
        bestDaysForDeepWork.length > 0 ? bestDaysForDeepWork : [2, 3, 4], // Default: Tue-Thu
      recommendedBreakMinutes: 20, // Standard ultradian rhythm break
      confidence,
      updatedAt: Date.now(),
      totalCompletions: completions.length,
    };

    // Store the profile in memory for quick retrieval
    await this.memory.save({
      content: `Energy profile: ${chronotype} chronotype, peak hours ${peakHours.join(",")}, ${completions.length} tasks analyzed, confidence ${(confidence * 100).toFixed(0)}%`,
      category: "preference",
      source: "auto",
      senderId: senderId ?? "global",
      metadata: {
        type: "energy_profile",
        ...profile,
      },
    });

    return profile;
  }

  /**
   * Get the current energy profile for a user.
   * Returns cached profile if recent, otherwise re-analyzes.
   */
  async getEnergyProfile(senderId?: string): Promise<EnergyProfile | null> {
    // Try to find cached profile
    const cached = await this.memory.search("energy profile chronotype", {
      senderId: senderId ?? "global",
      category: "preference",
      limit: 1,
      minScore: 0.5,
    });

    if (cached.length > 0 && cached[0].metadata?.type === "energy_profile") {
      const profile = cached[0].metadata as unknown as EnergyProfile;

      // Use cached if less than 24 hours old
      const ageHours = (Date.now() - profile.updatedAt) / (1000 * 60 * 60);
      if (ageHours < 24) {
        return profile;
      }
    }

    // Re-analyze
    return this.analyzeProductivityPatterns(senderId);
  }

  /**
   * Suggest optimal time slots for a task based on energy patterns.
   */
  async suggestSchedule(
    _taskDescription: string,
    durationMinutes: number,
    cognitiveLoad: CognitiveLoad,
    options: ScheduleOptions = {},
  ): Promise<ScheduleSuggestion[]> {
    const {
      senderId,
      lookaheadDays = 7,
      busyPeriods = [],
      minEnergyAlignment = 0.5,
      maxSuggestions = 5,
    } = options;

    // Get user's energy profile
    const profile = await this.getEnergyProfile(senderId);

    // Get available time slots
    const now = new Date();
    const rangeEnd = new Date(
      now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
    );

    const availableSlots = findAvailableSlots({
      durationMinutes,
      rangeStart: now,
      rangeEnd,
      busyPeriods,
      workingHoursOnly: true,
      workingHoursStart: DEFAULT_WORK_START,
      workingHoursEnd: DEFAULT_WORK_END,
      maxSlots: maxSuggestions * 3, // Get more than needed for filtering
    });

    // Score each slot by energy alignment
    const requiredEnergy = cognitiveLoadToEnergyRequirement(cognitiveLoad);
    const suggestions: ScheduleSuggestion[] = [];

    for (const slot of availableSlots) {
      const hour = slot.start.getHours();
      const dayOfWeek = slot.start.getDay();

      // Calculate energy alignment
      let energyAlignment = 0.5; // Default

      if (profile) {
        const hourScore = profile.hourlyScores.find((s) => s.hour === hour);
        if (hourScore) {
          // Higher score = better for demanding tasks
          // Match required energy level to user's typical score at this hour
          energyAlignment = Math.min(hourScore.score / requiredEnergy, 1);
        }

        // Bonus for peak hours
        if (profile.peakHours.includes(hour)) {
          energyAlignment = Math.min(energyAlignment + 0.2, 1);
        }

        // Penalty for trough hours on demanding tasks
        if (
          profile.troughHours.includes(hour) &&
          cognitiveLoad === "deep_work"
        ) {
          energyAlignment *= 0.7;
        }

        // Bonus for best deep work days
        if (
          profile.bestDaysForDeepWork.includes(dayOfWeek) &&
          cognitiveLoad === "deep_work"
        ) {
          energyAlignment = Math.min(energyAlignment + 0.1, 1);
        }
      }

      if (energyAlignment >= minEnergyAlignment) {
        // Determine what type of work is best for this slot
        let recommendedLoad: CognitiveLoad = "administrative";
        if (profile?.peakHours.includes(hour)) {
          recommendedLoad = "deep_work";
        } else if (profile?.troughHours.includes(hour)) {
          recommendedLoad = "administrative";
        } else if (hour >= 10 && hour <= 16) {
          recommendedLoad = "collaborative";
        }

        // Generate reason
        const reasons: string[] = [];
        if (profile) {
          if (profile.peakHours.includes(hour)) {
            reasons.push("This is one of your peak productivity hours");
          }
          if (profile.bestDaysForDeepWork.includes(dayOfWeek)) {
            reasons.push(
              `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek]} is typically good for deep work`,
            );
          }
          if (energyAlignment > 0.8) {
            reasons.push("Excellent energy alignment for this task type");
          }
        }
        if (reasons.length === 0) {
          reasons.push("Available slot within working hours");
        }

        suggestions.push({
          timeSlot: slot,
          energyAlignment,
          recommendedCognitiveLoad: recommendedLoad,
          reason: reasons.join(". "),
        });
      }
    }

    // Sort by energy alignment and return top suggestions
    return suggestions
      .sort((a, b) => b.energyAlignment - a.energyAlignment)
      .slice(0, maxSuggestions);
  }

  /**
   * Get a quick energy assessment for the current moment.
   */
  async getCurrentEnergyAssessment(senderId?: string): Promise<{
    currentHour: number;
    timeBucket: TimeBucket;
    predictedEnergy: EnergyLevel;
    bestTaskType: CognitiveLoad;
    suggestion: string;
  }> {
    const now = new Date();
    const currentHour = now.getHours();
    const timeBucket = getTimeBucket(currentHour);

    const profile = await this.getEnergyProfile(senderId);

    let predictedEnergy: EnergyLevel = "medium";
    let bestTaskType: CognitiveLoad = "collaborative";
    let suggestion = "Standard productivity expected. Good for general tasks.";

    if (profile && profile.confidence > 0.5) {
      const hourScore = profile.hourlyScores.find(
        (s) => s.hour === currentHour,
      );

      if (hourScore) {
        if (hourScore.score > 0.7) {
          predictedEnergy = "high";
          bestTaskType = "deep_work";
          suggestion =
            "High energy predicted! Ideal for complex, focused work.";
        } else if (hourScore.score > 0.5) {
          predictedEnergy = "medium";
          bestTaskType = "collaborative";
          suggestion =
            "Moderate energy. Good for meetings and collaborative tasks.";
        } else {
          predictedEnergy = "low";
          bestTaskType = "administrative";
          suggestion =
            "Lower energy period. Best for routine tasks, email, and admin work.";
        }
      }

      // Check if in peak/trough
      if (profile.peakHours.includes(currentHour)) {
        predictedEnergy = "high";
        bestTaskType = "deep_work";
        suggestion = `Peak hour detected (${currentHour}:00). Maximize this time for your most important work!`;
      } else if (profile.troughHours.includes(currentHour)) {
        predictedEnergy = "low";
        bestTaskType = "administrative";
        suggestion =
          "Energy dip period. Consider taking a break or handling simple tasks.";
      }
    }

    return {
      currentHour,
      timeBucket,
      predictedEnergy,
      bestTaskType,
      suggestion,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Service
// ─────────────────────────────────────────────────────────────────────────────

let serviceInstance: EnergySchedulerService | null = null;
let initPromise: Promise<EnergySchedulerService | null> | null = null;

/**
 * Get or create the EnergySchedulerService singleton.
 */
export async function createEnergySchedulerService(): Promise<EnergySchedulerService | null> {
  if (serviceInstance) return serviceInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!isMemoryEnabled()) {
        console.log("EnergyScheduler: Memory system not enabled");
        return null;
      }

      const memory = await createMemoryService();
      if (!memory) {
        console.log("EnergyScheduler: Memory service not available");
        return null;
      }

      serviceInstance = new EnergySchedulerService(memory);
      return serviceInstance;
    } catch (error) {
      console.error("Failed to initialize EnergySchedulerService:", error);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Reset the service singleton (for testing).
 */
export function resetEnergySchedulerService(): void {
  serviceInstance = null;
  initPromise = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Tool
// ─────────────────────────────────────────────────────────────────────────────

type AnyAgentTool = AgentTool<TSchema, unknown>;

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

const EnergyLevelSchema = Type.Union([
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
  Type.Literal("resting"),
]);

const CognitiveLoadSchema = Type.Union([
  Type.Literal("deep_work"),
  Type.Literal("collaborative"),
  Type.Literal("administrative"),
  Type.Literal("creative"),
]);

const EnergyToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("log_completion"),
    taskDescription: Type.String({ description: "What task was completed" }),
    durationMinutes: Type.Number({ description: "How long it took" }),
    complexity: Type.Number({
      minimum: 1,
      maximum: 5,
      description: "Cognitive complexity 1-5",
    }),
    energyLevel: Type.Optional(EnergyLevelSchema),
    focusScore: Type.Optional(
      Type.Number({ minimum: 0, maximum: 1, description: "Focus quality 0-1" }),
    ),
    cognitiveLoad: Type.Optional(CognitiveLoadSchema),
    senderId: Type.Optional(Type.String()),
  }),
  Type.Object({
    action: Type.Literal("get_profile"),
    senderId: Type.Optional(Type.String()),
  }),
  Type.Object({
    action: Type.Literal("suggest_schedule"),
    taskDescription: Type.String({ description: "What needs to be scheduled" }),
    durationMinutes: Type.Number({ description: "Expected duration" }),
    cognitiveLoad: CognitiveLoadSchema,
    senderId: Type.Optional(Type.String()),
    lookaheadDays: Type.Optional(Type.Number({ default: 7 })),
  }),
  Type.Object({
    action: Type.Literal("current_energy"),
    senderId: Type.Optional(Type.String()),
  }),
  Type.Object({
    action: Type.Literal("analyze"),
    senderId: Type.Optional(Type.String()),
  }),
  // New action: analyze_productivity - get detailed productivity patterns
  Type.Object({
    action: Type.Literal("analyze_productivity"),
    senderId: Type.Optional(Type.String()),
    dayOfWeek: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 6,
        description: "Filter by day of week (0=Sun, 6=Sat)",
      }),
    ),
  }),
  // New action: optimal_time - find single best time for a task type
  Type.Object({
    action: Type.Literal("optimal_time"),
    cognitiveLoad: CognitiveLoadSchema,
    durationMinutes: Type.Number({
      description: "Expected duration in minutes",
    }),
    senderId: Type.Optional(Type.String()),
    rangeStart: Type.Optional(
      Type.String({ description: "Start of search range (ISO date)" }),
    ),
    rangeEnd: Type.Optional(
      Type.String({ description: "End of search range (ISO date)" }),
    ),
  }),
]);

/**
 * Create the energy scheduler tool for agent use.
 */
export function createEnergySchedulerTool(): AnyAgentTool {
  return {
    label: "Energy Scheduler",
    name: "clawdis_energy_scheduler",
    description: `Track task completions and get energy-optimized scheduling suggestions.

Actions:
- log_completion: Record a completed task with timing and energy data
- get_profile: Get user's productivity/energy profile
- suggest_schedule: Get optimal time slots for a task based on energy patterns
- current_energy: Get current energy assessment and task recommendation
- analyze: Re-analyze productivity patterns
- analyze_productivity: Get detailed hourly productivity patterns (peak hours, low hours)
- optimal_time: Find single best time slot for a task type (deep_work, admin, etc.)

Task scheduling tips:
- Schedule deep_work during peak hours (e.g., 9-11am)
- Save emails/admin for low-energy periods (e.g., post-lunch)
- Use optimal_time to find the best single slot
- Use suggest_schedule for multiple options

cognitive_load types:
- deep_work: Focused coding, writing, complex analysis
- collaborative: Meetings, calls, pair work
- administrative: Email, scheduling, routine tasks
- creative: Brainstorming, design, ideation

Best practices:
- Log completions consistently to build accurate patterns
- Include energy level and focus score when possible
- Use complexity 1-5 (1=trivial, 5=very complex)`,
    parameters: EnergyToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      const service = await createEnergySchedulerService();
      if (!service) {
        return jsonResult({
          error: "not_available",
          message:
            "Energy scheduler requires memory system. Check Qdrant connection.",
        });
      }

      switch (action) {
        case "log_completion": {
          const event = await service.logTaskCompletion({
            taskDescription: params.taskDescription as string,
            durationMinutes: params.durationMinutes as number,
            complexity: params.complexity as 1 | 2 | 3 | 4 | 5,
            energyLevel: params.energyLevel as EnergyLevel | undefined,
            focusScore: params.focusScore as number | undefined,
            cognitiveLoad: params.cognitiveLoad as CognitiveLoad | undefined,
            senderId: params.senderId as string | undefined,
            completedAt: Date.now(),
          });

          return jsonResult({
            logged: true,
            id: event.id,
            taskDescription: event.taskDescription,
            completedAt: new Date(event.completedAt).toISOString(),
            message:
              "Task completion logged. This helps improve scheduling suggestions.",
          });
        }

        case "get_profile": {
          const profile = await service.getEnergyProfile(
            params.senderId as string | undefined,
          );

          if (!profile) {
            return jsonResult({
              profile: null,
              message:
                "No profile yet. Log more task completions to build your energy profile.",
            });
          }

          return jsonResult({
            profile: {
              chronotype: profile.chronotype,
              peakHours: profile.peakHours,
              troughHours: profile.troughHours,
              bestDaysForDeepWork: profile.bestDaysForDeepWork.map(
                (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
              ),
              confidence: `${(profile.confidence * 100).toFixed(0)}%`,
              totalCompletions: profile.totalCompletions,
              updatedAt: new Date(profile.updatedAt).toISOString(),
            },
          });
        }

        case "suggest_schedule": {
          const suggestions = await service.suggestSchedule(
            params.taskDescription as string,
            params.durationMinutes as number,
            params.cognitiveLoad as CognitiveLoad,
            {
              senderId: params.senderId as string | undefined,
              lookaheadDays: (params.lookaheadDays as number) ?? 7,
            },
          );

          return jsonResult({
            taskDescription: params.taskDescription,
            cognitiveLoad: params.cognitiveLoad,
            suggestions: suggestions.map((s) => ({
              start: s.timeSlot.start.toISOString(),
              end: s.timeSlot.end.toISOString(),
              energyAlignment: `${(s.energyAlignment * 100).toFixed(0)}%`,
              reason: s.reason,
            })),
          });
        }

        case "current_energy": {
          const assessment = await service.getCurrentEnergyAssessment(
            params.senderId as string | undefined,
          );

          return jsonResult(assessment);
        }

        case "analyze": {
          const profile = await service.analyzeProductivityPatterns(
            params.senderId as string | undefined,
          );

          if (!profile) {
            return jsonResult({
              analyzed: false,
              message: "Not enough data to analyze. Log more task completions.",
            });
          }

          return jsonResult({
            analyzed: true,
            chronotype: profile.chronotype,
            peakHours: profile.peakHours,
            confidence: `${(profile.confidence * 100).toFixed(0)}%`,
            totalCompletions: profile.totalCompletions,
            message: "Productivity patterns re-analyzed successfully.",
          });
        }

        case "analyze_productivity": {
          const profile = await service.getEnergyProfile(
            params.senderId as string | undefined,
          );

          if (!profile) {
            return jsonResult({
              error: "no_data",
              message:
                "Not enough data to analyze productivity. Log more task completions first.",
              tip: "Use log_completion to record tasks with timing and energy data.",
            });
          }

          const dayOfWeek = params.dayOfWeek as number | undefined;
          const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];

          // Filter patterns by day if specified
          let patterns = profile.hourlyScores;
          if (dayOfWeek !== undefined) {
            patterns = patterns.filter((p) => p.dayOfWeek === dayOfWeek);
          }

          // Format patterns for output
          const formattedPatterns = patterns
            .filter((p) => p.sampleCount > 0)
            .map((p) => ({
              hour: p.hour,
              formatted: `${p.hour.toString().padStart(2, "0")}:00`,
              productivity: `${(p.score * 100).toFixed(0)}%`,
              avgComplexity: p.avgComplexity.toFixed(1),
              avgFocus: p.avgFocus.toFixed(2),
              dataPoints: p.sampleCount,
            }))
            .sort((a, b) => b.hour - a.hour);

          // Identify deep work vs shallow work windows
          const deepWorkHours = profile.peakHours.map((h) => `${h}:00`);
          const shallowWorkHours = profile.troughHours.map((h) => `${h}:00`);

          // Detect energy dips
          const energyDips: Array<{ hour: string; description: string }> = [];
          const postLunchPattern = patterns.find(
            (p) => p.hour >= 13 && p.hour <= 14 && p.score < 0.5,
          );
          if (postLunchPattern) {
            energyDips.push({
              hour: `${postLunchPattern.hour}:00`,
              description: "Post-lunch energy dip detected",
            });
          }
          const lateAfternoonPattern = patterns.find(
            (p) => p.hour >= 15 && p.hour <= 16 && p.score < 0.5,
          );
          if (lateAfternoonPattern) {
            energyDips.push({
              hour: `${lateAfternoonPattern.hour}:00`,
              description: "Late afternoon energy dip",
            });
          }

          return jsonResult({
            senderId: params.senderId ?? "global",
            dayFilter:
              dayOfWeek !== undefined ? dayNames[dayOfWeek] : "all days",
            chronotype: profile.chronotype,
            insights: {
              deepWorkWindows: deepWorkHours,
              shallowWorkWindows: shallowWorkHours,
              energyDips,
              bestDaysForDeepWork: profile.bestDaysForDeepWork.map(
                (d) => dayNames[d],
              ),
            },
            hourlyPatterns: formattedPatterns,
            summary: {
              peakHours: profile.peakHours.map((h) => `${h}:00`),
              lowEnergyHours: profile.troughHours.map((h) => `${h}:00`),
              totalDataPoints: profile.totalCompletions,
              confidence: `${(profile.confidence * 100).toFixed(0)}%`,
            },
          });
        }

        case "optimal_time": {
          const cognitiveLoad = params.cognitiveLoad as CognitiveLoad;
          const durationMinutes = params.durationMinutes as number;
          const senderId = params.senderId as string | undefined;

          const now = new Date();
          const rangeStart = params.rangeStart
            ? new Date(params.rangeStart as string)
            : now;
          const rangeEnd = params.rangeEnd
            ? new Date(params.rangeEnd as string)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days default

          // Get suggestions and pick the best one
          const suggestions = await service.suggestSchedule(
            `${cognitiveLoad} task`,
            durationMinutes,
            cognitiveLoad,
            {
              senderId,
              lookaheadDays: Math.ceil(
                (rangeEnd.getTime() - rangeStart.getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
              minEnergyAlignment: 0.4,
              maxSuggestions: 10,
            },
          );

          // Filter to range and find best
          const inRangeSuggestions = suggestions.filter(
            (s) => s.timeSlot.start >= rangeStart && s.timeSlot.end <= rangeEnd,
          );

          if (inRangeSuggestions.length === 0) {
            return jsonResult({
              found: false,
              cognitiveLoad,
              durationMinutes,
              searchRange: {
                start: rangeStart.toISOString(),
                end: rangeEnd.toISOString(),
              },
              message:
                "No optimal time slot found in the search range. Try expanding the range or reducing duration.",
            });
          }

          const best = inRangeSuggestions[0];
          const dayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];

          return jsonResult({
            found: true,
            cognitiveLoad,
            durationMinutes,
            optimal: {
              start: best.timeSlot.start.toISOString(),
              end: best.timeSlot.end.toISOString(),
              formatted: `${dayNames[best.timeSlot.start.getDay()]} ${best.timeSlot.start.toLocaleTimeString(
                "en-US",
                {
                  hour: "numeric",
                  minute: "2-digit",
                },
              )} - ${best.timeSlot.end.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}`,
              energyAlignment: `${(best.energyAlignment * 100).toFixed(0)}%`,
              reason: best.reason,
            },
            alternatives: inRangeSuggestions.slice(1, 3).map((s) => ({
              start: s.timeSlot.start.toISOString(),
              formatted: `${dayNames[s.timeSlot.start.getDay()]} ${s.timeSlot.start.toLocaleTimeString(
                "en-US",
                {
                  hour: "numeric",
                  minute: "2-digit",
                },
              )}`,
              energyAlignment: `${(s.energyAlignment * 100).toFixed(0)}%`,
            })),
          });
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}
