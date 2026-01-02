/**
 * Energy scheduler tool for Clawdis agent - productivity optimization based on energy levels.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type Static, type TSchema, Type } from "@sinclair/typebox";

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

const TaskTypeSchema = Type.Union([
  Type.Literal("deep_work"),
  Type.Literal("creative"),
  Type.Literal("administrative"),
  Type.Literal("meetings"),
  Type.Literal("learning"),
  Type.Literal("routine"),
]);

const EnergyToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("analyze_productivity"),
    date: Type.Optional(
      Type.String({
        description: "Date to analyze (ISO format, defaults to today)",
      }),
    ),
    senderId: Type.Optional(
      Type.String({ description: "User identifier for personalized analysis" }),
    ),
  }),
  Type.Object({
    action: Type.Literal("suggest_schedule"),
    tasks: Type.Array(
      Type.Object({
        name: Type.String({ description: "Task name" }),
        taskType: TaskTypeSchema,
        duration: Type.Number({ description: "Duration in minutes" }),
        priority: Type.Optional(
          Type.Union([
            Type.Literal("high"),
            Type.Literal("medium"),
            Type.Literal("low"),
          ]),
        ),
        deadline: Type.Optional(
          Type.String({ description: "Deadline (ISO format)" }),
        ),
      }),
    ),
    date: Type.Optional(
      Type.String({
        description: "Date to schedule for (ISO format, defaults to today)",
      }),
    ),
    workStartHour: Type.Optional(
      Type.Number({ description: "Work start hour (0-23, default 9)" }),
    ),
    workEndHour: Type.Optional(
      Type.Number({ description: "Work end hour (0-23, default 17)" }),
    ),
    senderId: Type.Optional(
      Type.String({
        description: "User identifier for personalized scheduling",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("optimal_time"),
    taskType: TaskTypeSchema,
    duration: Type.Number({ description: "Duration in minutes" }),
    date: Type.Optional(
      Type.String({
        description: "Date to find slot (ISO format, defaults to today)",
      }),
    ),
    senderId: Type.Optional(
      Type.String({
        description: "User identifier for personalized recommendation",
      }),
    ),
  }),
  Type.Object({
    action: Type.Literal("record_task"),
    taskType: TaskTypeSchema,
    taskDescription: Type.String({
      description: "Description of the completed task",
    }),
    duration: Type.Number({ description: "Duration in minutes" }),
    completed: Type.Boolean({
      description: "Whether the task was completed successfully",
    }),
    energyLevel: Type.Optional(
      Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ]),
    ),
    focusQuality: Type.Optional(
      Type.Number({ description: "Focus quality rating 1-10" }),
    ),
    startTime: Type.Optional(
      Type.String({ description: "When the task started (ISO format)" }),
    ),
    senderId: Type.Optional(
      Type.String({ description: "User identifier for tracking" }),
    ),
  }),
]);

export type EnergyToolInput = Static<typeof EnergyToolSchema>;

/**
 * Default energy patterns based on typical circadian rhythms.
 * Users can override these through recorded task data.
 */
const DEFAULT_ENERGY_PATTERNS = {
  deep_work: { peakHours: [9, 10, 11], avoidHours: [13, 14, 15] },
  creative: { peakHours: [10, 11, 15, 16], avoidHours: [12, 13] },
  administrative: { peakHours: [14, 15, 16], avoidHours: [9, 10] },
  meetings: { peakHours: [10, 11, 14, 15], avoidHours: [8, 17] },
  learning: { peakHours: [9, 10, 16, 17], avoidHours: [13, 14] },
  routine: { peakHours: [8, 9, 16, 17], avoidHours: [] },
};

/**
 * Create the energy scheduler tool for agent use.
 */
export function createEnergyTool(): AnyAgentTool {
  return {
    label: "Energy Scheduler",
    name: "clawdis_energy",
    description: `Optimize task scheduling based on energy levels and productivity patterns. Use this to:
- Analyze productivity patterns from recorded tasks
- Suggest optimal daily schedules based on task types and energy levels
- Find the best time for a specific type of task
- Record completed tasks to improve future recommendations

Task types:
- deep_work: Cognitively demanding tasks requiring focus (coding, writing, analysis)
- creative: Tasks requiring creative thinking (design, brainstorming, problem-solving)
- administrative: Routine admin tasks (emails, scheduling, paperwork)
- meetings: Synchronous communication (calls, meetings, collaboration)
- learning: Educational activities (reading, courses, skill development)
- routine: Low-effort recurring tasks (reviews, updates, maintenance)

Best practices:
- Record tasks consistently to improve personalization
- Schedule deep work during peak energy hours (typically morning)
- Use post-lunch dip for administrative tasks
- Consider deadlines and priorities when scheduling`,
    parameters: EnergyToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        case "analyze_productivity": {
          const date =
            (params.date as string) ?? new Date().toISOString().split("T")[0];
          const senderId = params.senderId as string | undefined;

          // TODO: Integrate with memory service to retrieve recorded tasks
          // For now, return default energy patterns
          return jsonResult({
            date,
            senderId: senderId ?? "global",
            patterns: DEFAULT_ENERGY_PATTERNS,
            recommendations: [
              "Schedule deep work tasks between 9-11 AM for optimal focus",
              "Use the post-lunch period (1-3 PM) for administrative tasks",
              "Creative work often peaks in late morning and mid-afternoon",
              "Record more tasks to get personalized recommendations",
            ],
            recordedTasks: 0,
            note: "Using default patterns. Record tasks to personalize.",
          });
        }

        case "suggest_schedule": {
          const tasks = params.tasks as Array<{
            name: string;
            taskType: string;
            duration: number;
            priority?: string;
            deadline?: string;
          }>;
          const date =
            (params.date as string) ?? new Date().toISOString().split("T")[0];
          const workStartHour = (params.workStartHour as number) ?? 9;
          const workEndHour = (params.workEndHour as number) ?? 17;

          if (!tasks || tasks.length === 0) {
            return jsonResult({
              error: "validation",
              message: "At least one task is required",
            });
          }

          // Sort tasks by priority and optimal time alignment
          const sortedTasks = [...tasks].sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const aPriority =
              priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
            const bPriority =
              priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
            return aPriority - bPriority;
          });

          // Schedule tasks based on energy patterns
          const schedule: Array<{
            name: string;
            taskType: string;
            startTime: string;
            endTime: string;
            duration: number;
            reason: string;
          }> = [];

          let currentHour = workStartHour;
          let currentMinute = 0;

          for (const task of sortedTasks) {
            const taskType =
              task.taskType as keyof typeof DEFAULT_ENERGY_PATTERNS;
            const pattern =
              DEFAULT_ENERGY_PATTERNS[taskType] ??
              DEFAULT_ENERGY_PATTERNS.routine;

            // Find best available hour
            let scheduledHour = currentHour;
            for (const peakHour of pattern.peakHours) {
              if (peakHour >= currentHour && peakHour < workEndHour) {
                scheduledHour = peakHour;
                break;
              }
            }

            // If no peak hour available, use current hour
            if (scheduledHour < currentHour) {
              scheduledHour = currentHour;
            }

            // Check if task fits in workday
            const taskHours = task.duration / 60;
            if (scheduledHour + taskHours > workEndHour) {
              schedule.push({
                name: task.name,
                taskType: task.taskType,
                startTime: `${date}T${String(scheduledHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}:00`,
                endTime: "overflow",
                duration: task.duration,
                reason: "Task extends beyond work hours - consider splitting",
              });
            } else {
              const endMinutes = currentMinute + task.duration;
              const endHour = scheduledHour + Math.floor(endMinutes / 60);
              const endMinute = endMinutes % 60;

              schedule.push({
                name: task.name,
                taskType: task.taskType,
                startTime: `${date}T${String(scheduledHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}:00`,
                endTime: `${date}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`,
                duration: task.duration,
                reason: pattern.peakHours.includes(scheduledHour)
                  ? `Scheduled during peak ${taskType} hours`
                  : "Scheduled in next available slot",
              });

              currentHour = endHour;
              currentMinute = endMinute;
            }
          }

          return jsonResult({
            date,
            workHours: { start: workStartHour, end: workEndHour },
            totalTasks: tasks.length,
            totalMinutes: tasks.reduce((sum, t) => sum + t.duration, 0),
            schedule,
          });
        }

        case "optimal_time": {
          const taskType =
            params.taskType as keyof typeof DEFAULT_ENERGY_PATTERNS;
          const duration = params.duration as number;
          const date =
            (params.date as string) ?? new Date().toISOString().split("T")[0];

          if (!taskType || !DEFAULT_ENERGY_PATTERNS[taskType]) {
            return jsonResult({
              error: "validation",
              message:
                "Valid taskType required (deep_work, creative, administrative, meetings, learning, routine)",
            });
          }

          if (!duration || duration <= 0) {
            return jsonResult({
              error: "validation",
              message: "duration (in minutes) required",
            });
          }

          const pattern = DEFAULT_ENERGY_PATTERNS[taskType];
          const suggestions = pattern.peakHours.map((hour) => ({
            startTime: `${date}T${String(hour).padStart(2, "0")}:00:00`,
            endTime: `${date}T${String(hour + Math.ceil(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}:00`,
            quality: "optimal",
            reason: `Peak energy hour for ${taskType}`,
          }));

          const avoidTimes = pattern.avoidHours.map((hour) => ({
            hour,
            reason: `Low energy for ${taskType}`,
          }));

          return jsonResult({
            taskType,
            duration,
            date,
            suggestions,
            avoidTimes,
            note: "Suggestions based on default circadian patterns. Record tasks to personalize.",
          });
        }

        case "record_task": {
          const taskType = params.taskType as string;
          const taskDescription = params.taskDescription as string;
          const duration = params.duration as number;
          const completed = params.completed as boolean;
          const energyLevel = params.energyLevel as string | undefined;
          const focusQuality = params.focusQuality as number | undefined;
          const startTime =
            (params.startTime as string) ?? new Date().toISOString();
          const senderId = params.senderId as string | undefined;

          if (!taskType) {
            return jsonResult({
              error: "validation",
              message: "taskType required",
            });
          }
          if (!taskDescription?.trim()) {
            return jsonResult({
              error: "validation",
              message: "taskDescription required",
            });
          }
          if (!duration || duration <= 0) {
            return jsonResult({
              error: "validation",
              message: "duration (in minutes) required",
            });
          }

          // TODO: Store in memory service for future pattern analysis
          const record = {
            id: `energy-${Date.now()}`,
            taskType,
            taskDescription: taskDescription.trim(),
            duration,
            completed,
            energyLevel: energyLevel ?? "medium",
            focusQuality: focusQuality ?? 5,
            startTime,
            hour: new Date(startTime).getHours(),
            senderId: senderId ?? "global",
            recordedAt: new Date().toISOString(),
          };

          return jsonResult({
            recorded: true,
            record,
            note: "Task recorded. More data improves schedule recommendations.",
          });
        }

        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}
