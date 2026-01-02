/**
 * Temporal Reasoning Tool for Clawdis Agent
 *
 * Provides agent access to temporal reasoning capabilities:
 * - estimate_duration: Estimate time needed for a task
 * - check_deadline: Analyze deadline risk and get scheduling advice
 * - schedule_smart: Get optimal scheduling suggestions
 * - parse_recurring: Parse natural language recurring schedules
 * - record_duration: Record completed task duration for learning
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";

import {
  analyzeDeadline,
  calculateNextOccurrence,
  describeRiskLevel,
  estimateTaskDuration,
  formatDuration,
  formatRecurringSchedule,
  parseDuration,
  parseRecurringSchedule,
  recordTaskDuration,
  suggestOptimalSchedule,
  type TaskDurationRecord,
} from "./temporal-reasoning.js";

type AnyAgentTool = AgentTool<TSchema, unknown>;

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

// =============================================================================
// Tool Schema
// =============================================================================

const TemporalToolSchema = Type.Union([
  // Estimate duration for a task
  Type.Object({
    action: Type.Literal("estimate_duration"),
    taskName: Type.String({
      description:
        "Name of the task to estimate (e.g., 'write report', 'code review')",
    }),
    category: Type.Optional(
      Type.String({
        description:
          "Task category for fallback estimation (e.g., 'meeting', 'coding', 'writing')",
      }),
    ),
  }),

  // Check deadline and get risk analysis
  Type.Object({
    action: Type.Literal("check_deadline"),
    taskName: Type.String({ description: "Name of the task" }),
    deadline: Type.String({
      description:
        "Deadline as ISO date string or natural language (e.g., 'Friday 5pm', '2025-01-10T17:00:00')",
    }),
    category: Type.Optional(Type.String({ description: "Task category" })),
  }),

  // Get smart scheduling suggestions
  Type.Object({
    action: Type.Literal("schedule_smart"),
    taskName: Type.String({ description: "Name of the task to schedule" }),
    deadline: Type.Optional(
      Type.String({
        description: "Optional deadline (ISO or natural language)",
      }),
    ),
    duration: Type.Optional(
      Type.String({
        description:
          "Known duration (e.g., '2h', '30m', '1h 30m'). If not provided, will estimate.",
      }),
    ),
    busyTimes: Type.Optional(
      Type.Array(
        Type.Object({
          start: Type.String({ description: "Busy period start (ISO)" }),
          end: Type.String({ description: "Busy period end (ISO)" }),
        }),
      ),
    ),
    timezone: Type.Optional(Type.String({ default: "UTC" })),
  }),

  // Parse a recurring schedule pattern
  Type.Object({
    action: Type.Literal("parse_recurring"),
    pattern: Type.String({
      description:
        "Natural language recurring pattern (e.g., 'every other Tuesday', 'first Monday of the month at 3pm')",
    }),
  }),

  // Record a completed task duration for learning
  Type.Object({
    action: Type.Literal("record_duration"),
    taskName: Type.String({ description: "Name of the completed task" }),
    startTime: Type.String({ description: "When task started (ISO)" }),
    endTime: Type.String({ description: "When task ended (ISO)" }),
    category: Type.Optional(Type.String({ description: "Task category" })),
    estimatedDuration: Type.Optional(
      Type.String({ description: "Original estimate (e.g., '2h')" }),
    ),
  }),

  // Get next occurrence of a recurring pattern
  Type.Object({
    action: Type.Literal("next_occurrence"),
    pattern: Type.String({
      description: "Recurring pattern (e.g., 'every Friday at 2pm')",
    }),
    after: Type.Optional(
      Type.String({
        description: "Calculate after this date (ISO). Default: now",
      }),
    ),
  }),
]);

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Create the temporal reasoning tool for agent use.
 */
export function createTemporalTool(): AnyAgentTool {
  return {
    label: "Temporal Reasoning",
    name: "clawdis_temporal",
    description: `Intelligent time management and scheduling tool. Use this to:

- Estimate how long a task will take based on past patterns
- Analyze deadline risk and get scheduling recommendations
- Find optimal time slots considering calendar and task patterns
- Parse and work with recurring schedules (e.g., "every other Tuesday")
- Record task durations to improve future estimates

Examples:
- estimate_duration: "How long will writing this report take?"
- check_deadline: "Report due Friday - am I at risk?"
- schedule_smart: "When should I start the quarterly review?"
- parse_recurring: "What does 'first Monday of the month' mean?"
- record_duration: "I just finished the code review, took 45 minutes"`,

    parameters: TemporalToolSchema,

    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      try {
        switch (action) {
          case "estimate_duration": {
            const taskName = params.taskName as string;
            const category = params.category as string | undefined;

            const estimate = await estimateTaskDuration(taskName, category);

            return jsonResult({
              taskName,
              estimate: {
                duration: formatDuration(estimate.estimatedMs),
                durationMs: estimate.estimatedMs,
                confidence: `${(estimate.confidence * 100).toFixed(0)}%`,
                basedOn: estimate.basedOn,
                sampleSize: estimate.sampleSize,
                range: {
                  min: formatDuration(estimate.range.min),
                  max: formatDuration(estimate.range.max),
                },
              },
              recommendation:
                estimate.basedOn === "default"
                  ? "No historical data available. Record task completions to improve estimates."
                  : estimate.confidence < 0.5
                    ? "Low confidence - more data needed for reliable estimates."
                    : "Good confidence based on historical patterns.",
            });
          }

          case "check_deadline": {
            const taskName = params.taskName as string;
            const deadlineStr = params.deadline as string;
            const category = params.category as string | undefined;

            // Parse deadline
            const deadlineMs = parseDeadlineString(deadlineStr);
            if (!deadlineMs) {
              return jsonResult({
                error: "invalid_deadline",
                message: `Could not parse deadline: "${deadlineStr}"`,
                hint: "Use ISO format (2025-01-10T17:00:00) or natural language (Friday 5pm)",
              });
            }

            const analysis = await analyzeDeadline(
              deadlineMs,
              taskName,
              category,
            );
            const now = Date.now();
            const timeUntilDeadline = deadlineMs - now;

            return jsonResult({
              taskName,
              deadline: new Date(deadlineMs).toISOString(),
              deadlineFormatted: new Date(deadlineMs).toLocaleString(),
              timeRemaining: formatDuration(timeUntilDeadline),
              analysis: {
                riskLevel: analysis.riskLevel,
                riskDescription: describeRiskLevel(analysis.riskLevel),
                urgencyScore: `${(analysis.urgencyScore * 100).toFixed(0)}%`,
                suggestedStart: new Date(
                  analysis.suggestedStartTime,
                ).toISOString(),
                suggestedStartFormatted: new Date(
                  analysis.suggestedStartTime,
                ).toLocaleString(),
                bufferTime: formatDuration(analysis.bufferTimeMs),
                factors: analysis.factors,
              },
              recommendation:
                analysis.riskLevel === "critical"
                  ? "Start immediately or consider requesting an extension."
                  : analysis.riskLevel === "high"
                    ? "Prioritize this task and block time now."
                    : analysis.riskLevel === "medium"
                      ? "Schedule soon with buffer time."
                      : "Comfortable timeline - schedule at convenience.",
            });
          }

          case "schedule_smart": {
            const taskName = params.taskName as string;
            const deadlineStr = params.deadline as string | undefined;
            const durationStr = params.duration as string | undefined;
            const busyTimesRaw = params.busyTimes as
              | Array<{ start: string; end: string }>
              | undefined;
            const timezone = (params.timezone as string) ?? "UTC";

            // Parse deadline if provided
            const deadlineMs = deadlineStr
              ? parseDeadlineString(deadlineStr)
              : undefined;

            // Parse duration if provided
            const durationMs = durationStr
              ? parseDuration(durationStr)
              : undefined;

            // Convert busy times to timestamps
            const busyPeriods = (busyTimesRaw ?? []).map((b) => ({
              start: new Date(b.start).getTime(),
              end: new Date(b.end).getTime(),
            }));

            const suggestion = await suggestOptimalSchedule(
              taskName,
              deadlineMs ?? undefined,
              durationMs ?? undefined,
              busyPeriods,
              timezone,
            );

            return jsonResult({
              taskName,
              scheduling: {
                suggestedStart: new Date(
                  suggestion.suggestedStart,
                ).toISOString(),
                suggestedStartFormatted: new Date(
                  suggestion.suggestedStart,
                ).toLocaleString(),
                suggestedEnd: new Date(suggestion.suggestedEnd).toISOString(),
                suggestedEndFormatted: new Date(
                  suggestion.suggestedEnd,
                ).toLocaleString(),
                estimatedDuration: formatDuration(
                  suggestion.estimatedDuration.estimatedMs,
                ),
                confidence: `${(suggestion.estimatedDuration.confidence * 100).toFixed(0)}%`,
              },
              deadline: deadlineMs
                ? {
                    date: new Date(deadlineMs).toISOString(),
                    riskLevel: suggestion.deadlineAnalysis?.riskLevel,
                    urgency: suggestion.deadlineAnalysis
                      ? `${(suggestion.deadlineAnalysis.urgencyScore * 100).toFixed(0)}%`
                      : undefined,
                  }
                : undefined,
              rationale: suggestion.rationale,
            });
          }

          case "parse_recurring": {
            const pattern = params.pattern as string;

            const schedule = parseRecurringSchedule(pattern);
            if (!schedule) {
              return jsonResult({
                error: "parse_failed",
                pattern,
                message: "Could not parse recurring pattern",
                examples: [
                  "every day at 9am",
                  "every Monday",
                  "every other Tuesday at 3pm",
                  "first Monday of the month",
                  "last Friday of every month at 5pm",
                  "every 2 weeks on Wednesday",
                  "monthly on the 15th",
                  "yearly on March 15",
                ],
              });
            }

            const nextOccurrence = calculateNextOccurrence(schedule);

            return jsonResult({
              pattern,
              parsed: {
                type: schedule.type,
                interval: schedule.interval,
                dayOfWeek: schedule.dayOfWeek,
                weekOfMonth: schedule.weekOfMonth,
                dayOfMonth: schedule.dayOfMonth,
                month: schedule.month,
                time:
                  schedule.hour !== undefined
                    ? `${schedule.hour}:${(schedule.minute ?? 0).toString().padStart(2, "0")}`
                    : undefined,
                confidence: `${(schedule.confidence * 100).toFixed(0)}%`,
              },
              formatted: formatRecurringSchedule(schedule),
              nextOccurrence: new Date(nextOccurrence).toISOString(),
              nextOccurrenceFormatted: new Date(nextOccurrence).toLocaleString(),
            });
          }

          case "record_duration": {
            const taskName = params.taskName as string;
            const startTimeStr = params.startTime as string;
            const endTimeStr = params.endTime as string;
            const category = (params.category as string) ?? "general";
            const estimatedStr = params.estimatedDuration as string | undefined;

            const startedAt = new Date(startTimeStr).getTime();
            const completedAt = new Date(endTimeStr).getTime();
            const durationMs = completedAt - startedAt;

            if (durationMs <= 0) {
              return jsonResult({
                error: "invalid_times",
                message: "End time must be after start time",
              });
            }

            const estimatedMs = estimatedStr
              ? parseDuration(estimatedStr)
              : undefined;

            const record: TaskDurationRecord = {
              taskId: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              taskName,
              category,
              startedAt,
              completedAt,
              durationMs,
              estimatedMs: estimatedMs ?? undefined,
            };

            const saved = await recordTaskDuration(record);

            return jsonResult({
              recorded: true,
              task: {
                id: saved.taskId,
                name: saved.taskName,
                category: saved.category,
                duration: formatDuration(saved.durationMs),
                durationMs: saved.durationMs,
              },
              accuracy: saved.accuracy
                ? {
                    ratio: saved.accuracy.toFixed(2),
                    description:
                      saved.accuracy < 0.8
                        ? "Finished faster than estimated"
                        : saved.accuracy > 1.2
                          ? "Took longer than estimated"
                          : "Close to estimate",
                  }
                : undefined,
              message:
                "Duration recorded. Future estimates will be more accurate.",
            });
          }

          case "next_occurrence": {
            const pattern = params.pattern as string;
            const afterStr = params.after as string | undefined;

            const schedule = parseRecurringSchedule(pattern);
            if (!schedule) {
              return jsonResult({
                error: "parse_failed",
                pattern,
                message: "Could not parse recurring pattern",
              });
            }

            const afterMs = afterStr
              ? new Date(afterStr).getTime()
              : Date.now();
            const nextMs = calculateNextOccurrence(schedule, afterMs);

            return jsonResult({
              pattern,
              formatted: formatRecurringSchedule(schedule),
              after: new Date(afterMs).toISOString(),
              nextOccurrence: new Date(nextMs).toISOString(),
              nextOccurrenceFormatted: new Date(nextMs).toLocaleString(),
              timeUntil: formatDuration(nextMs - Date.now()),
            });
          }

          default:
            return jsonResult({
              error: "unknown_action",
              action,
              availableActions: [
                "estimate_duration",
                "check_deadline",
                "schedule_smart",
                "parse_recurring",
                "record_duration",
                "next_occurrence",
              ],
            });
        }
      } catch (error) {
        return jsonResult({
          error: "execution_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a deadline string (ISO or natural language) to Unix ms.
 */
function parseDeadlineString(input: string): number | null {
  // Try ISO parse first
  const isoDate = new Date(input);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.getTime();
  }

  // Try natural language parsing
  const text = input.toLowerCase().trim();
  const now = new Date();

  // Day of week patterns
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  for (let i = 0; i < days.length; i++) {
    if (text.includes(days[i])) {
      const target = new Date(now);
      const currentDay = target.getDay();
      let daysToAdd = (i - currentDay + 7) % 7;
      if (daysToAdd === 0) daysToAdd = 7; // Next week if same day
      target.setDate(target.getDate() + daysToAdd);

      // Extract time if present
      const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const ampm = timeMatch[3]?.toLowerCase();
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        target.setHours(hour, minute, 0, 0);
      } else {
        target.setHours(17, 0, 0, 0); // Default to 5pm
      }

      return target.getTime();
    }
  }

  // "tomorrow" pattern
  if (text.includes("tomorrow")) {
    const target = new Date(now);
    target.setDate(target.getDate() + 1);

    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      target.setHours(hour, minute, 0, 0);
    } else {
      target.setHours(17, 0, 0, 0);
    }

    return target.getTime();
  }

  // "today" pattern
  if (text.includes("today")) {
    const target = new Date(now);

    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      target.setHours(hour, minute, 0, 0);
    } else {
      target.setHours(17, 0, 0, 0);
    }

    return target.getTime();
  }

  // "next week" pattern
  if (text.includes("next week")) {
    const target = new Date(now);
    target.setDate(target.getDate() + 7);
    target.setHours(17, 0, 0, 0);
    return target.getTime();
  }

  return null;
}
