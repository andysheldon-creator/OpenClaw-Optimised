/**
 * Task Coordinator Agent for Clawdis - orchestrates complex tasks across multiple agents.
 *
 * Responsibilities:
 * 1. Break down complex tasks into subtasks
 * 2. Track task progress and dependencies
 * 3. Delegate tasks to appropriate specialist agents
 * 4. Monitor deadlines and send reminders
 * 5. Aggregate results from multiple agents
 */

import * as crypto from "node:crypto";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-ai";
import { type TSchema, Type } from "@sinclair/typebox";

type AnyAgentTool = AgentTool<TSchema, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Types and Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type AgentType =
  | "researcher"
  | "coder"
  | "reviewer"
  | "tester"
  | "analyst"
  | "coordinator"
  | "general";

export interface TaskDependency {
  taskId: string;
  type: "blocks" | "requires" | "relates_to";
}

export interface SubTask {
  id: string;
  parentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgent?: AgentType;
  priority: TaskPriority;
  dependencies: TaskDependency[];
  estimatedMinutes?: number;
  deadlineIso?: string;
  result?: unknown;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  subtasks: SubTask[];
  dependencies: TaskDependency[];
  deadlineIso?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface TaskCoordinatorAgent {
  name: string;
  description: string;
  capabilities: string[];
  tools: AnyAgentTool[];
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Task Store (for demonstration - integrate with memory-tool for persistence)
// ─────────────────────────────────────────────────────────────────────────────

const taskStore = new Map<string, Task>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Schema Definitions
// ─────────────────────────────────────────────────────────────────────────────

const TaskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("blocked"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);

const TaskPrioritySchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("critical"),
]);

const AgentTypeSchema = Type.Union([
  Type.Literal("researcher"),
  Type.Literal("coder"),
  Type.Literal("reviewer"),
  Type.Literal("tester"),
  Type.Literal("analyst"),
  Type.Literal("coordinator"),
  Type.Literal("general"),
]);

const DependencyTypeSchema = Type.Union([
  Type.Literal("blocks"),
  Type.Literal("requires"),
  Type.Literal("relates_to"),
]);

const SubTaskInputSchema = Type.Object({
  title: Type.String({ description: "Subtask title" }),
  description: Type.String({ description: "Detailed description of the subtask" }),
  assignedAgent: Type.Optional(AgentTypeSchema),
  priority: Type.Optional(TaskPrioritySchema),
  estimatedMinutes: Type.Optional(Type.Number({ description: "Estimated time in minutes" })),
  dependsOn: Type.Optional(
    Type.Array(Type.String({ description: "IDs of subtasks this depends on" }))
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool Schemas
// ─────────────────────────────────────────────────────────────────────────────

const DecomposeTaskSchema = Type.Object({
  action: Type.Literal("decompose_task"),
  title: Type.String({ description: "Main task title" }),
  description: Type.String({ description: "Detailed description of the complex task" }),
  subtasks: Type.Array(SubTaskInputSchema, {
    description: "List of subtasks to break the main task into",
  }),
  priority: Type.Optional(TaskPrioritySchema),
  deadlineIso: Type.Optional(
    Type.String({ description: "ISO 8601 deadline for the entire task" })
  ),
  metadata: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Additional metadata for the task",
    })
  ),
});

const TrackProgressSchema = Type.Object({
  action: Type.Literal("track_progress"),
  taskId: Type.Optional(Type.String({ description: "Specific task ID to check" })),
  includeSubtasks: Type.Optional(Type.Boolean({ default: true })),
  statusFilter: Type.Optional(TaskStatusSchema),
});

const UpdateTaskSchema = Type.Object({
  action: Type.Literal("update_task"),
  taskId: Type.String({ description: "Task or subtask ID to update" }),
  status: Type.Optional(TaskStatusSchema),
  result: Type.Optional(Type.Unknown({ description: "Result data from task completion" })),
  notes: Type.Optional(Type.String({ description: "Progress notes or comments" })),
});

const DelegateSchema = Type.Object({
  action: Type.Literal("delegate"),
  taskId: Type.String({ description: "Subtask ID to delegate" }),
  agentType: AgentTypeSchema,
  instructions: Type.Optional(
    Type.String({ description: "Additional instructions for the agent" })
  ),
});

const AggregateResultsSchema = Type.Object({
  action: Type.Literal("aggregate_results"),
  taskId: Type.String({ description: "Parent task ID to aggregate results from" }),
  format: Type.Optional(
    Type.Union([
      Type.Literal("summary"),
      Type.Literal("detailed"),
      Type.Literal("json"),
    ])
  ),
});

const CheckDeadlinesSchema = Type.Object({
  action: Type.Literal("check_deadlines"),
  hoursAhead: Type.Optional(
    Type.Number({
      description: "How many hours ahead to check for upcoming deadlines",
      default: 24,
    })
  ),
});

const ListTasksSchema = Type.Object({
  action: Type.Literal("list_tasks"),
  statusFilter: Type.Optional(TaskStatusSchema),
  limit: Type.Optional(Type.Number({ default: 20 })),
});

const TaskCoordinatorSchema = Type.Union([
  DecomposeTaskSchema,
  TrackProgressSchema,
  UpdateTaskSchema,
  DelegateSchema,
  AggregateResultsSchema,
  CheckDeadlinesSchema,
  ListTasksSchema,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleDecomposeTask(params: Record<string, unknown>): AgentToolResult<unknown> {
  const title = params.title as string;
  const description = params.description as string;
  const subtasksInput = params.subtasks as Array<Record<string, unknown>>;
  const priority = (params.priority as TaskPriority) ?? "medium";
  const deadlineIso = params.deadlineIso as string | undefined;
  const metadata = params.metadata as Record<string, unknown> | undefined;

  const now = Date.now();
  const taskId = generateId();

  // Create subtasks with proper IDs and dependencies
  const subtaskIdMap = new Map<number, string>();
  const subtasks: SubTask[] = subtasksInput.map((input, index) => {
    const subtaskId = `${taskId}-${generateId()}`;
    subtaskIdMap.set(index, subtaskId);
    return {
      id: subtaskId,
      parentId: taskId,
      title: input.title as string,
      description: input.description as string,
      status: "pending" as TaskStatus,
      assignedAgent: input.assignedAgent as AgentType | undefined,
      priority: (input.priority as TaskPriority) ?? priority,
      dependencies: [],
      estimatedMinutes: input.estimatedMinutes as number | undefined,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Resolve dependencies after all subtasks have IDs
  subtasksInput.forEach((input, index) => {
    const dependsOn = input.dependsOn as string[] | undefined;
    if (dependsOn && Array.isArray(dependsOn)) {
      const subtask = subtasks[index];
      for (const depIndex of dependsOn) {
        const depIdx = parseInt(depIndex, 10);
        if (!isNaN(depIdx) && subtaskIdMap.has(depIdx)) {
          subtask.dependencies.push({
            taskId: subtaskIdMap.get(depIdx)!,
            type: "requires",
          });
        }
      }
    }
  });

  const task: Task = {
    id: taskId,
    title,
    description,
    status: "pending",
    priority,
    subtasks,
    dependencies: [],
    deadlineIso,
    metadata,
    createdAt: now,
    updatedAt: now,
  };

  taskStore.set(taskId, task);

  return jsonResult({
    success: true,
    taskId,
    title,
    subtaskCount: subtasks.length,
    subtasks: subtasks.map((st) => ({
      id: st.id,
      title: st.title,
      assignedAgent: st.assignedAgent,
      dependencies: st.dependencies.map((d) => d.taskId),
    })),
    message: `Task "${title}" decomposed into ${subtasks.length} subtasks`,
  });
}

function handleTrackProgress(params: Record<string, unknown>): AgentToolResult<unknown> {
  const taskId = params.taskId as string | undefined;
  const includeSubtasks = params.includeSubtasks !== false;
  const statusFilter = params.statusFilter as TaskStatus | undefined;

  if (taskId) {
    const task = taskStore.get(taskId);
    if (!task) {
      return jsonResult({ error: "not_found", message: `Task ${taskId} not found` });
    }

    const completedSubtasks = task.subtasks.filter((st) => st.status === "completed").length;
    const totalSubtasks = task.subtasks.length;
    const progressPercent =
      totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

    let filteredSubtasks = task.subtasks;
    if (statusFilter) {
      filteredSubtasks = task.subtasks.filter((st) => st.status === statusFilter);
    }

    return jsonResult({
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      progress: {
        completed: completedSubtasks,
        total: totalSubtasks,
        percent: progressPercent,
      },
      deadline: task.deadlineIso,
      subtasks: includeSubtasks
        ? filteredSubtasks.map((st) => ({
            id: st.id,
            title: st.title,
            status: st.status,
            assignedAgent: st.assignedAgent,
            dependencies: st.dependencies.length,
          }))
        : undefined,
    });
  }

  // Return summary of all tasks
  const tasks = Array.from(taskStore.values());
  const filteredTasks = statusFilter
    ? tasks.filter((t) => t.status === statusFilter)
    : tasks;

  return jsonResult({
    totalTasks: filteredTasks.length,
    byStatus: {
      pending: filteredTasks.filter((t) => t.status === "pending").length,
      in_progress: filteredTasks.filter((t) => t.status === "in_progress").length,
      completed: filteredTasks.filter((t) => t.status === "completed").length,
      blocked: filteredTasks.filter((t) => t.status === "blocked").length,
      failed: filteredTasks.filter((t) => t.status === "failed").length,
    },
    tasks: filteredTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      subtaskProgress: `${t.subtasks.filter((st) => st.status === "completed").length}/${t.subtasks.length}`,
    })),
  });
}

function handleUpdateTask(params: Record<string, unknown>): AgentToolResult<unknown> {
  const taskId = params.taskId as string;
  const newStatus = params.status as TaskStatus | undefined;
  const result = params.result;
  const notes = params.notes as string | undefined;
  const now = Date.now();

  // Check if it's a main task
  let task = taskStore.get(taskId);
  if (task) {
    if (newStatus) {
      task.status = newStatus;
      if (newStatus === "completed") {
        task.completedAt = now;
      }
    }
    task.updatedAt = now;
    if (notes && task.metadata) {
      task.metadata.lastNote = notes;
    } else if (notes) {
      task.metadata = { lastNote: notes };
    }

    return jsonResult({
      success: true,
      taskId,
      status: task.status,
      message: `Task "${task.title}" updated`,
    });
  }

  // Check if it's a subtask
  const taskEntries = Array.from(taskStore.entries());
  for (const [, parentTask] of taskEntries) {
    const subtask = parentTask.subtasks.find((st) => st.id === taskId);
    if (subtask) {
      if (newStatus) {
        subtask.status = newStatus;
        if (newStatus === "completed") {
          subtask.completedAt = now;
        }
      }
      if (result !== undefined) {
        subtask.result = result;
      }
      subtask.updatedAt = now;

      // Check if all subtasks are completed
      const allComplete = parentTask.subtasks.every((st) => st.status === "completed");
      if (allComplete && parentTask.status !== "completed") {
        parentTask.status = "completed";
        parentTask.completedAt = now;
      }

      // Update parent's in_progress status if any subtask is in_progress
      const anyInProgress = parentTask.subtasks.some((st) => st.status === "in_progress");
      if (anyInProgress && parentTask.status === "pending") {
        parentTask.status = "in_progress";
      }

      parentTask.updatedAt = now;

      return jsonResult({
        success: true,
        subtaskId: taskId,
        parentId: parentTask.id,
        status: subtask.status,
        parentStatus: parentTask.status,
        message: `Subtask "${subtask.title}" updated`,
      });
    }
  }

  return jsonResult({ error: "not_found", message: `Task or subtask ${taskId} not found` });
}

function handleDelegate(params: Record<string, unknown>): AgentToolResult<unknown> {
  const taskId = params.taskId as string;
  const agentType = params.agentType as AgentType;
  const instructions = params.instructions as string | undefined;
  const now = Date.now();

  // Find the subtask
  const delegateEntries = Array.from(taskStore.entries());
  for (const [, parentTask] of delegateEntries) {
    const subtask = parentTask.subtasks.find((st) => st.id === taskId);
    if (subtask) {
      // Check dependencies
      const unblockedDeps = subtask.dependencies.filter((dep) => {
        const depSubtask = parentTask.subtasks.find((st) => st.id === dep.taskId);
        return depSubtask && depSubtask.status !== "completed";
      });

      if (unblockedDeps.length > 0) {
        return jsonResult({
          error: "blocked",
          taskId,
          message: `Cannot delegate: task is blocked by ${unblockedDeps.length} incomplete dependencies`,
          blockedBy: unblockedDeps.map((d) => d.taskId),
        });
      }

      subtask.assignedAgent = agentType;
      subtask.status = "in_progress";
      subtask.updatedAt = now;

      if (parentTask.status === "pending") {
        parentTask.status = "in_progress";
        parentTask.updatedAt = now;
      }

      return jsonResult({
        success: true,
        taskId,
        assignedTo: agentType,
        title: subtask.title,
        description: subtask.description,
        instructions: instructions ?? null,
        message: `Subtask "${subtask.title}" delegated to ${agentType} agent`,
        context: {
          parentTask: parentTask.title,
          priority: subtask.priority,
          estimatedMinutes: subtask.estimatedMinutes,
        },
      });
    }
  }

  return jsonResult({ error: "not_found", message: `Subtask ${taskId} not found` });
}

function handleAggregateResults(params: Record<string, unknown>): AgentToolResult<unknown> {
  const taskId = params.taskId as string;
  const format = (params.format as string) ?? "summary";

  const task = taskStore.get(taskId);
  if (!task) {
    return jsonResult({ error: "not_found", message: `Task ${taskId} not found` });
  }

  const completedSubtasks = task.subtasks.filter((st) => st.status === "completed");
  const failedSubtasks = task.subtasks.filter((st) => st.status === "failed");
  const pendingSubtasks = task.subtasks.filter(
    (st) => st.status === "pending" || st.status === "in_progress"
  );

  if (format === "json") {
    return jsonResult({
      taskId: task.id,
      title: task.title,
      status: task.status,
      results: completedSubtasks.map((st) => ({
        subtaskId: st.id,
        title: st.title,
        result: st.result,
        completedAt: st.completedAt,
      })),
      failures: failedSubtasks.map((st) => ({
        subtaskId: st.id,
        title: st.title,
        result: st.result,
      })),
      pending: pendingSubtasks.map((st) => ({
        subtaskId: st.id,
        title: st.title,
        status: st.status,
      })),
    });
  }

  if (format === "detailed") {
    const resultsSummary = completedSubtasks
      .map((st) => `- [${st.title}]: ${JSON.stringify(st.result ?? "completed")}`)
      .join("\n");

    return jsonResult({
      taskId: task.id,
      title: task.title,
      status: task.status,
      summary: {
        completed: completedSubtasks.length,
        failed: failedSubtasks.length,
        pending: pendingSubtasks.length,
        total: task.subtasks.length,
      },
      detailedResults: resultsSummary || "No completed subtasks yet",
      failureDetails: failedSubtasks.length > 0
        ? failedSubtasks.map((st) => `- ${st.title}: ${st.result ?? "unknown error"}`).join("\n")
        : null,
    });
  }

  // Default: summary format
  const progressPercent = Math.round(
    (completedSubtasks.length / task.subtasks.length) * 100
  );

  return jsonResult({
    taskId: task.id,
    title: task.title,
    status: task.status,
    progress: `${completedSubtasks.length}/${task.subtasks.length} (${progressPercent}%)`,
    hasFailures: failedSubtasks.length > 0,
    isComplete: pendingSubtasks.length === 0 && failedSubtasks.length === 0,
  });
}

function handleCheckDeadlines(params: Record<string, unknown>): AgentToolResult<unknown> {
  const hoursAhead = (params.hoursAhead as number) ?? 24;
  const now = Date.now();
  const futureMs = now + hoursAhead * 60 * 60 * 1000;

  const urgentTasks: Array<{
    taskId: string;
    title: string;
    deadline: string;
    hoursRemaining: number;
    status: TaskStatus;
    isOverdue: boolean;
  }> = [];

  const deadlineEntries = Array.from(taskStore.entries());
  for (const [, task] of deadlineEntries) {
    if (task.deadlineIso && task.status !== "completed" && task.status !== "cancelled") {
      const deadlineMs = new Date(task.deadlineIso).getTime();
      if (deadlineMs <= futureMs) {
        const hoursRemaining = Math.round((deadlineMs - now) / (60 * 60 * 1000) * 10) / 10;
        urgentTasks.push({
          taskId: task.id,
          title: task.title,
          deadline: task.deadlineIso,
          hoursRemaining,
          status: task.status,
          isOverdue: deadlineMs < now,
        });
      }
    }
  }

  // Sort by deadline (most urgent first)
  urgentTasks.sort((a, b) => a.hoursRemaining - b.hoursRemaining);

  const overdueTasks = urgentTasks.filter((t) => t.isOverdue);
  const upcomingTasks = urgentTasks.filter((t) => !t.isOverdue);

  return jsonResult({
    checkedHoursAhead: hoursAhead,
    overdue: overdueTasks,
    upcoming: upcomingTasks,
    totalUrgent: urgentTasks.length,
    message:
      urgentTasks.length > 0
        ? `Found ${overdueTasks.length} overdue and ${upcomingTasks.length} upcoming deadline(s)`
        : "No urgent deadlines found",
  });
}

function handleListTasks(params: Record<string, unknown>): AgentToolResult<unknown> {
  const statusFilter = params.statusFilter as TaskStatus | undefined;
  const limit = (params.limit as number) ?? 20;

  let tasks = Array.from(taskStore.values());

  if (statusFilter) {
    tasks = tasks.filter((t) => t.status === statusFilter);
  }

  // Sort by priority (critical first) then by creation time
  const priorityOrder: Record<TaskPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  tasks.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt - a.createdAt;
  });

  tasks = tasks.slice(0, limit);

  return jsonResult({
    total: taskStore.size,
    returned: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      subtasks: `${t.subtasks.filter((st) => st.status === "completed").length}/${t.subtasks.length}`,
      deadline: t.deadlineIso ?? null,
      createdAt: new Date(t.createdAt).toISOString(),
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Tool Creation
// ─────────────────────────────────────────────────────────────────────────────

export function createTaskCoordinatorTool(): AnyAgentTool {
  return {
    label: "Task Coordinator",
    name: "task_coordinator",
    description: `Orchestrate complex tasks by breaking them into subtasks, tracking progress, delegating to agents, and aggregating results.

Actions:
- decompose_task: Break a complex task into manageable subtasks with dependencies
- track_progress: Check progress on a specific task or all tasks
- update_task: Update status or add results to a task/subtask
- delegate: Assign a subtask to a specialist agent
- aggregate_results: Collect and summarize results from completed subtasks
- check_deadlines: Find tasks with upcoming or overdue deadlines
- list_tasks: List all tasks with optional filtering

Best practices:
- Decompose complex tasks before starting work
- Set realistic deadlines and priorities
- Track dependencies between subtasks
- Delegate to appropriate agent types (researcher, coder, reviewer, etc.)
- Aggregate results when subtasks complete`,
    parameters: TaskCoordinatorSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        case "decompose_task":
          return handleDecomposeTask(params);
        case "track_progress":
          return handleTrackProgress(params);
        case "update_task":
          return handleUpdateTask(params);
        case "delegate":
          return handleDelegate(params);
        case "aggregate_results":
          return handleAggregateResults(params);
        case "check_deadlines":
          return handleCheckDeadlines(params);
        case "list_tasks":
          return handleListTasks(params);
        default:
          return jsonResult({ error: "unknown_action", action });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Configuration Export
// ─────────────────────────────────────────────────────────────────────────────

export const taskCoordinatorAgent: TaskCoordinatorAgent = {
  name: "TaskCoordinator",
  description:
    "Orchestrates complex tasks by decomposing them into subtasks, tracking progress, delegating to specialist agents, monitoring deadlines, and aggregating results.",
  capabilities: [
    "task_decomposition",
    "progress_tracking",
    "dependency_management",
    "agent_delegation",
    "deadline_monitoring",
    "result_aggregation",
  ],
  tools: [createTaskCoordinatorTool()],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Exports for Integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all tasks from the store (for external integration)
 */
export function getAllTasks(): Task[] {
  return Array.from(taskStore.values());
}

/**
 * Get a specific task by ID
 */
export function getTask(taskId: string): Task | undefined {
  return taskStore.get(taskId);
}

/**
 * Clear all tasks (for testing)
 */
export function clearTasks(): void {
  taskStore.clear();
}

/**
 * Import tasks from external source (e.g., from persistent memory)
 */
export function importTasks(tasks: Task[]): void {
  for (const task of tasks) {
    taskStore.set(task.id, task);
  }
}

export default taskCoordinatorAgent;
