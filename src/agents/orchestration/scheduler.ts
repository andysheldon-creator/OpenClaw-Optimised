/**
 * Scheduler Agent for the Clawdis Hive Mind
 *
 * Provides intelligent calendar scheduling capabilities including:
 * - Finding optimal meeting times across participants
 * - Resolving calendar conflicts
 * - Handling natural language scheduling requests
 * - Managing recurring events and patterns
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";

import {
  type BusyPeriod,
  type FindSlotsOptions,
  type TimeSlot,
  findAvailableSlots,
  parseNaturalDateTime,
} from "../calendar-helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AnyAgentTool = AgentTool<TSchema, unknown>;

/**
 * Configuration for the Scheduler agent
 */
export interface SchedulerAgentConfig {
  /** Default timezone for scheduling operations */
  defaultTimezone: string;
  /** Default meeting duration in minutes */
  defaultDurationMinutes: number;
  /** Working hours start (0-23) */
  workingHoursStart: number;
  /** Working hours end (0-23) */
  workingHoursEnd: number;
  /** Whether to skip weekends by default */
  skipWeekends: boolean;
  /** Buffer time between meetings in minutes */
  bufferMinutes: number;
}

/**
 * Scheduler agent interface
 */
export interface SchedulerAgent {
  name: string;
  description: string;
  capabilities: string[];
  config: SchedulerAgentConfig;
}

/**
 * Conflict information between events
 */
export interface ConflictInfo {
  eventA: {
    id?: string;
    summary: string;
    start: string;
    end: string;
  };
  eventB: {
    id?: string;
    summary: string;
    start: string;
    end: string;
  };
  overlapStart: string;
  overlapEnd: string;
  overlapMinutes: number;
  severity: "partial" | "full" | "contained";
  suggestion: string;
}

/**
 * Availability analysis result
 */
export interface AvailabilityAnalysis {
  participant: string;
  busyPeriods: BusyPeriod[];
  freeSlots: TimeSlot[];
  busyPercentage: number;
  busiestDay?: string;
  suggestedTimes: TimeSlot[];
}

/**
 * Meeting scheduling result
 */
export interface SchedulingResult {
  success: boolean;
  proposedTime?: TimeSlot;
  alternativeTimes?: TimeSlot[];
  conflicts?: ConflictInfo[];
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SchedulerAgentConfig = {
  defaultTimezone: "Europe/Vienna",
  defaultDurationMinutes: 60,
  workingHoursStart: 9,
  workingHoursEnd: 17,
  skipWeekends: true,
  bufferMinutes: 15,
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scheduler agent configuration export
 */
export const schedulerAgent: SchedulerAgent = {
  name: "scheduler",
  description:
    "Intelligent calendar scheduling agent that finds optimal meeting times, resolves conflicts, and handles natural language scheduling requests",
  capabilities: [
    "find_time",
    "resolve_conflict",
    "schedule_meeting",
    "analyze_availability",
    "parse_scheduling_request",
    "suggest_reschedule",
  ],
  config: DEFAULT_CONFIG,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * Check if two time periods overlap
 */
function getOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): { start: Date; end: Date; minutes: number } | null {
  const overlapStart = new Date(Math.max(startA.getTime(), startB.getTime()));
  const overlapEnd = new Date(Math.min(endA.getTime(), endB.getTime()));

  if (overlapStart < overlapEnd) {
    const minutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
    return { start: overlapStart, end: overlapEnd, minutes };
  }
  return null;
}

/**
 * Determine conflict severity
 */
function getConflictSeverity(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): "partial" | "full" | "contained" {
  // Check if one event fully contains the other
  if (startA <= startB && endA >= endB) return "contained";
  if (startB <= startA && endB >= endA) return "contained";

  // Check if events are the same
  if (
    startA.getTime() === startB.getTime() &&
    endA.getTime() === endB.getTime()
  ) {
    return "full";
  }

  return "partial";
}

/**
 * Generate conflict resolution suggestion
 */
function generateConflictSuggestion(
  severity: "partial" | "full" | "contained",
  overlapMinutes: number,
): string {
  switch (severity) {
    case "full":
      return "These events completely overlap. Consider canceling one or merging them if related.";
    case "contained":
      return "One event is entirely within the other. Consider shortening or rescheduling the inner event.";
    case "partial":
      if (overlapMinutes <= 15) {
        return `Minor overlap of ${overlapMinutes} minutes. Consider adjusting start/end times by ${overlapMinutes} minutes.`;
      }
      return `Significant overlap of ${overlapMinutes} minutes. Recommend rescheduling one of the events.`;
  }
}

/**
 * Merge overlapping busy periods
 */
function mergeBusyPeriods(periods: BusyPeriod[]): BusyPeriod[] {
  if (periods.length === 0) return [];

  const sorted = [...periods].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const merged: BusyPeriod[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (new Date(current.start) <= new Date(last.end)) {
      // Overlapping - extend the end if needed
      if (new Date(current.end) > new Date(last.end)) {
        last.end = current.end;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Find common available slots across multiple participant calendars
 */
function findCommonSlots(
  participantBusyPeriods: BusyPeriod[][],
  options: Omit<FindSlotsOptions, "busyPeriods">,
): TimeSlot[] {
  // Merge all busy periods from all participants
  const allBusy = participantBusyPeriods.flat();
  const mergedBusy = mergeBusyPeriods(allBusy);

  return findAvailableSlots({
    ...options,
    busyPeriods: mergedBusy,
  });
}

/**
 * Analyze availability patterns
 */
function analyzeAvailabilityPatterns(
  busyPeriods: BusyPeriod[],
  rangeStart: Date,
  rangeEnd: Date,
): { busyPercentage: number; busiestDay?: string } {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  let busyMs = 0;
  const dayBusy: Record<string, number> = {};

  for (const period of busyPeriods) {
    const start = new Date(period.start);
    const end = new Date(period.end);

    // Clamp to range
    const effectiveStart = new Date(
      Math.max(start.getTime(), rangeStart.getTime()),
    );
    const effectiveEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));

    if (effectiveStart < effectiveEnd) {
      const periodMs = effectiveEnd.getTime() - effectiveStart.getTime();
      busyMs += periodMs;

      // Track by day
      const dayKey = effectiveStart.toISOString().split("T")[0];
      dayBusy[dayKey] = (dayBusy[dayKey] || 0) + periodMs;
    }
  }

  const busyPercentage = Math.round((busyMs / totalMs) * 100);

  let busiestDay: string | undefined;
  let maxBusy = 0;
  for (const [day, ms] of Object.entries(dayBusy)) {
    if (ms > maxBusy) {
      maxBusy = ms;
      busiestDay = day;
    }
  }

  return { busyPercentage, busiestDay };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definitions
// ─────────────────────────────────────────────────────────────────────────────

const SchedulerSchema = Type.Union([
  // Find optimal meeting time
  Type.Object({
    action: Type.Literal("find_time"),
    durationMinutes: Type.Number({
      description: "Meeting duration in minutes",
    }),
    participantsBusy: Type.Optional(
      Type.Array(
        Type.Object({
          participant: Type.String({ description: "Participant identifier" }),
          busyPeriods: Type.Array(
            Type.Object({
              start: Type.String({ description: "ISO datetime" }),
              end: Type.String({ description: "ISO datetime" }),
            }),
          ),
        }),
      ),
    ),
    rangeStart: Type.Optional(
      Type.String({
        description: "Start of search range (ISO date). Defaults to now.",
      }),
    ),
    rangeEnd: Type.Optional(
      Type.String({
        description:
          "End of search range (ISO date). Defaults to 7 days from now.",
      }),
    ),
    workingHoursOnly: Type.Optional(
      Type.Boolean({
        description: "Only suggest slots during working hours. Default true.",
      }),
    ),
    maxSlots: Type.Optional(
      Type.Number({ description: "Maximum slots to return. Default 5." }),
    ),
    timezone: Type.Optional(
      Type.String({ description: "Timezone. Default Europe/Vienna." }),
    ),
    preferMorning: Type.Optional(
      Type.Boolean({ description: "Prefer morning slots" }),
    ),
    preferAfternoon: Type.Optional(
      Type.Boolean({ description: "Prefer afternoon slots" }),
    ),
  }),

  // Resolve calendar conflicts
  Type.Object({
    action: Type.Literal("resolve_conflict"),
    events: Type.Array(
      Type.Object({
        id: Type.Optional(Type.String()),
        summary: Type.String({ description: "Event title" }),
        start: Type.String({ description: "Start datetime (ISO)" }),
        end: Type.String({ description: "End datetime (ISO)" }),
        priority: Type.Optional(
          Type.Union([
            Type.Literal("high"),
            Type.Literal("medium"),
            Type.Literal("low"),
          ]),
        ),
        flexible: Type.Optional(
          Type.Boolean({ description: "Whether this event can be moved" }),
        ),
      }),
    ),
    suggestAlternatives: Type.Optional(
      Type.Boolean({
        description: "Whether to suggest alternative times for conflicts",
      }),
    ),
  }),

  // Schedule a meeting with natural language
  Type.Object({
    action: Type.Literal("schedule_meeting"),
    request: Type.String({
      description:
        "Natural language scheduling request (e.g., 'Schedule a 1-hour meeting with John tomorrow afternoon')",
    }),
    participantsBusy: Type.Optional(
      Type.Array(
        Type.Object({
          participant: Type.String(),
          busyPeriods: Type.Array(
            Type.Object({
              start: Type.String(),
              end: Type.String(),
            }),
          ),
        }),
      ),
    ),
    timezone: Type.Optional(Type.String()),
  }),

  // Analyze availability
  Type.Object({
    action: Type.Literal("analyze_availability"),
    participant: Type.String({ description: "Participant identifier" }),
    busyPeriods: Type.Array(
      Type.Object({
        start: Type.String(),
        end: Type.String(),
      }),
    ),
    rangeStart: Type.Optional(Type.String()),
    rangeEnd: Type.Optional(Type.String()),
    timezone: Type.Optional(Type.String()),
    suggestOptimalSlots: Type.Optional(
      Type.Boolean({
        description: "Include suggested optimal meeting times",
      }),
    ),
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Tool Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the Scheduler agent tool
 */
export function createSchedulerTool(
  config: Partial<SchedulerAgentConfig> = {},
): AnyAgentTool {
  const agentConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    label: "Scheduler Agent",
    name: "scheduler",
    description:
      "Intelligent scheduling agent that finds optimal meeting times, resolves conflicts, analyzes availability, and handles natural language scheduling requests.",
    parameters: SchedulerSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        // ─────────────────────────────────────────────────────────────────────
        // Find optimal meeting time
        // ─────────────────────────────────────────────────────────────────────
        case "find_time": {
          const durationMinutes = params.durationMinutes as number;
          const timezone =
            (params.timezone as string) ?? agentConfig.defaultTimezone;
          const workingHoursOnly =
            (params.workingHoursOnly as boolean) ?? true;
          const maxSlots = (params.maxSlots as number) ?? 5;
          const preferMorning = params.preferMorning as boolean | undefined;
          const preferAfternoon = params.preferAfternoon as boolean | undefined;

          const now = new Date();
          const rangeStart = params.rangeStart
            ? new Date(params.rangeStart as string)
            : now;
          const rangeEnd = params.rangeEnd
            ? new Date(params.rangeEnd as string)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          // Collect busy periods from all participants
          const participantsBusy = (params.participantsBusy as
            | Array<{
                participant: string;
                busyPeriods: BusyPeriod[];
              }>
            | undefined) ?? [];

          const allBusyPeriods = participantsBusy.map((p) => p.busyPeriods);

          // Determine working hours based on preferences
          let workingHoursStart = agentConfig.workingHoursStart;
          let workingHoursEnd = agentConfig.workingHoursEnd;

          if (preferMorning) {
            workingHoursEnd = 12;
          } else if (preferAfternoon) {
            workingHoursStart = 12;
          }

          const slots =
            allBusyPeriods.length > 0
              ? findCommonSlots(allBusyPeriods, {
                  durationMinutes,
                  rangeStart,
                  rangeEnd,
                  workingHoursOnly,
                  workingHoursStart,
                  workingHoursEnd,
                  maxSlots: maxSlots * 2, // Get extra for filtering
                  timezone,
                })
              : findAvailableSlots({
                  durationMinutes,
                  rangeStart,
                  rangeEnd,
                  busyPeriods: [],
                  workingHoursOnly,
                  workingHoursStart,
                  workingHoursEnd,
                  maxSlots: maxSlots * 2,
                  timezone,
                });

          // Format slots
          const formattedSlots = slots.slice(0, maxSlots).map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            formatted: `${slot.start.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: timezone,
            })} ${slot.start.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: timezone,
            })} - ${slot.end.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: timezone,
            })}`,
          }));

          return jsonResult({
            action: "find_time",
            durationMinutes,
            rangeStart: rangeStart.toISOString(),
            rangeEnd: rangeEnd.toISOString(),
            workingHoursOnly,
            timezone,
            participantCount: participantsBusy.length,
            slotsFound: formattedSlots.length,
            slots: formattedSlots,
            recommendation:
              formattedSlots.length > 0
                ? `Best available time: ${formattedSlots[0].formatted}`
                : "No available slots found in the specified range.",
          });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Resolve calendar conflicts
        // ─────────────────────────────────────────────────────────────────────
        case "resolve_conflict": {
          const events = params.events as Array<{
            id?: string;
            summary: string;
            start: string;
            end: string;
            priority?: "high" | "medium" | "low";
            flexible?: boolean;
          }>;
          const suggestAlternatives =
            (params.suggestAlternatives as boolean) ?? true;

          const conflicts: ConflictInfo[] = [];

          // Check all pairs of events for conflicts
          for (let i = 0; i < events.length; i++) {
            for (let j = i + 1; j < events.length; j++) {
              const eventA = events[i];
              const eventB = events[j];

              const startA = new Date(eventA.start);
              const endA = new Date(eventA.end);
              const startB = new Date(eventB.start);
              const endB = new Date(eventB.end);

              const overlap = getOverlap(startA, endA, startB, endB);

              if (overlap) {
                const severity = getConflictSeverity(
                  startA,
                  endA,
                  startB,
                  endB,
                );
                const suggestion = generateConflictSuggestion(
                  severity,
                  overlap.minutes,
                );

                conflicts.push({
                  eventA: {
                    id: eventA.id,
                    summary: eventA.summary,
                    start: eventA.start,
                    end: eventA.end,
                  },
                  eventB: {
                    id: eventB.id,
                    summary: eventB.summary,
                    start: eventB.start,
                    end: eventB.end,
                  },
                  overlapStart: overlap.start.toISOString(),
                  overlapEnd: overlap.end.toISOString(),
                  overlapMinutes: Math.round(overlap.minutes),
                  severity,
                  suggestion,
                });
              }
            }
          }

          // Generate alternative times if requested
          let alternatives: Array<{
            conflict: number;
            suggestedTime: string;
          }> = [];

          if (suggestAlternatives && conflicts.length > 0) {
            // Find the flexible events and suggest alternatives
            const busyPeriods: BusyPeriod[] = events.map((e) => ({
              start: e.start,
              end: e.end,
            }));

            for (let i = 0; i < conflicts.length; i++) {
              const conflict = conflicts[i];
              // Determine which event to move (prefer the one marked flexible or lower priority)
              const eventAInfo = events.find(
                (e) => e.summary === conflict.eventA.summary,
              );
              const eventBInfo = events.find(
                (e) => e.summary === conflict.eventB.summary,
              );

              const moveEventB =
                eventBInfo?.flexible ||
                (eventAInfo?.priority === "high" &&
                  eventBInfo?.priority !== "high");
              const eventToMove = moveEventB
                ? conflict.eventB
                : conflict.eventA;
              const durationMs =
                new Date(eventToMove.end).getTime() -
                new Date(eventToMove.start).getTime();
              const durationMinutes = durationMs / 60000;

              // Find alternative slot
              const now = new Date();
              const rangeEnd = new Date(
                now.getTime() + 7 * 24 * 60 * 60 * 1000,
              );

              // Exclude the event being moved from busy periods
              const otherBusy = busyPeriods.filter(
                (b) =>
                  b.start !== eventToMove.start || b.end !== eventToMove.end,
              );

              const slots = findAvailableSlots({
                durationMinutes,
                rangeStart: now,
                rangeEnd,
                busyPeriods: otherBusy,
                workingHoursOnly: true,
                maxSlots: 1,
              });

              if (slots.length > 0) {
                alternatives.push({
                  conflict: i,
                  suggestedTime: `Move "${eventToMove.summary}" to ${slots[0].start.toLocaleDateString(
                    "en-US",
                    { weekday: "short", month: "short", day: "numeric" },
                  )} ${slots[0].start.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`,
                });
              }
            }
          }

          return jsonResult({
            action: "resolve_conflict",
            totalEvents: events.length,
            conflictsFound: conflicts.length,
            conflicts,
            alternatives,
            summary:
              conflicts.length === 0
                ? "No conflicts detected."
                : `Found ${conflicts.length} conflict(s). ${alternatives.length} alternative(s) suggested.`,
          });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Schedule meeting from natural language
        // ─────────────────────────────────────────────────────────────────────
        case "schedule_meeting": {
          const request = params.request as string;
          const timezone =
            (params.timezone as string) ?? agentConfig.defaultTimezone;
          const participantsBusy = (params.participantsBusy as
            | Array<{
                participant: string;
                busyPeriods: BusyPeriod[];
              }>
            | undefined) ?? [];

          // Parse the natural language request
          const parsed = parseNaturalDateTime(request, timezone);

          if (!parsed) {
            return jsonResult({
              action: "schedule_meeting",
              success: false,
              request,
              error: "Could not parse the scheduling request.",
              suggestion:
                "Please specify a time like 'tomorrow at 3pm' or 'next Monday morning'.",
            });
          }

          // Extract duration from text if present
          let durationMinutes = agentConfig.defaultDurationMinutes;
          const durationMatch = request.match(
            /(\d+)\s*(?:hour|hr)s?|(\d+)\s*(?:minute|min)s?/i,
          );
          if (durationMatch) {
            if (durationMatch[1]) {
              durationMinutes = parseInt(durationMatch[1], 10) * 60;
            } else if (durationMatch[2]) {
              durationMinutes = parseInt(durationMatch[2], 10);
            }
          }

          const proposedStart = new Date(parsed.start);
          const proposedEnd = new Date(
            proposedStart.getTime() + durationMinutes * 60000,
          );

          // Check for conflicts with participant schedules
          const allBusy = participantsBusy.flatMap((p) => p.busyPeriods);
          const hasConflict = allBusy.some((busy) => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return getOverlap(proposedStart, proposedEnd, busyStart, busyEnd);
          });

          if (hasConflict && participantsBusy.length > 0) {
            // Find alternative times
            const alternatives = findCommonSlots(
              participantsBusy.map((p) => p.busyPeriods),
              {
                durationMinutes,
                rangeStart: new Date(),
                rangeEnd: new Date(
                  Date.now() + 7 * 24 * 60 * 60 * 1000,
                ),
                workingHoursOnly: true,
                maxSlots: 3,
                timezone,
              },
            );

            return jsonResult({
              action: "schedule_meeting",
              success: false,
              request,
              parsedTime: parsed.parsed,
              conflict: true,
              message: `The proposed time (${parsed.parsed}) conflicts with existing schedules.`,
              alternativeTimes: alternatives.map((slot) => ({
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
                formatted: `${slot.start.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: timezone,
                })} ${slot.start.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: timezone,
                })}`,
              })),
            });
          }

          return jsonResult({
            action: "schedule_meeting",
            success: true,
            request,
            parsedTime: parsed.parsed,
            proposedMeeting: {
              start: proposedStart.toISOString(),
              end: proposedEnd.toISOString(),
              durationMinutes,
              formatted: `${proposedStart.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: timezone,
              })} from ${proposedStart.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
              })} to ${proposedEnd.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
              })}`,
            },
            message: "Meeting time parsed successfully. Ready to create event.",
          });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Analyze availability
        // ─────────────────────────────────────────────────────────────────────
        case "analyze_availability": {
          const participant = params.participant as string;
          const busyPeriods = params.busyPeriods as BusyPeriod[];
          const timezone =
            (params.timezone as string) ?? agentConfig.defaultTimezone;
          const suggestOptimalSlots =
            (params.suggestOptimalSlots as boolean) ?? true;

          const now = new Date();
          const rangeStart = params.rangeStart
            ? new Date(params.rangeStart as string)
            : now;
          const rangeEnd = params.rangeEnd
            ? new Date(params.rangeEnd as string)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          // Analyze patterns
          const { busyPercentage, busiestDay } = analyzeAvailabilityPatterns(
            busyPeriods,
            rangeStart,
            rangeEnd,
          );

          // Find free slots
          const freeSlots = findAvailableSlots({
            durationMinutes: agentConfig.defaultDurationMinutes,
            rangeStart,
            rangeEnd,
            busyPeriods,
            workingHoursOnly: true,
            maxSlots: 10,
            timezone,
          });

          // Find optimal slots (morning or afternoon based on pattern)
          let suggestedSlots: TimeSlot[] = [];
          if (suggestOptimalSlots) {
            // Prefer times when the person is typically less busy
            suggestedSlots = freeSlots.slice(0, 5);
          }

          return jsonResult({
            action: "analyze_availability",
            participant,
            rangeStart: rangeStart.toISOString(),
            rangeEnd: rangeEnd.toISOString(),
            analysis: {
              totalBusyPeriods: busyPeriods.length,
              busyPercentage: `${busyPercentage}%`,
              busiestDay: busiestDay
                ? new Date(busiestDay).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : null,
              availableSlots: freeSlots.length,
            },
            freeSlots: freeSlots.map((slot) => ({
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
              formatted: `${slot.start.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: timezone,
              })} ${slot.start.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
              })}`,
            })),
            suggestedSlots: suggestOptimalSlots
              ? suggestedSlots.map((slot) => ({
                  start: slot.start.toISOString(),
                  end: slot.end.toISOString(),
                  formatted: `${slot.start.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: timezone,
                  })} ${slot.start.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: timezone,
                  })}`,
                }))
              : [],
            recommendation:
              busyPercentage > 80
                ? `${participant} has a very busy schedule (${busyPercentage}% occupied). Consider scheduling well in advance.`
                : busyPercentage > 50
                  ? `${participant} has a moderately busy schedule. Several slots are available.`
                  : `${participant} has good availability with many open slots.`,
          });
        }

        default:
          throw new Error(`Unknown scheduler action: ${action}`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create scheduler tools array for agent registration
 */
export function createSchedulerTools(
  config?: Partial<SchedulerAgentConfig>,
): AnyAgentTool[] {
  return [createSchedulerTool(config)];
}

export default schedulerAgent;
