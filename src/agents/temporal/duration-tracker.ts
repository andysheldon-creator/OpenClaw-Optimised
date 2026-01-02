/**
 * Task duration tracking for learning execution times.
 * Records task start/completion and provides duration estimates based on history.
 */

import type { MemoryStore } from "../../memory/qdrant.js";

/** In-flight task record (not yet completed) */
interface PendingTask {
  taskId: string;
  taskType: string;
  description: string;
  startedAtMs: number;
}

/** Completed task record stored in memory */
export interface TaskDurationRecord {
  taskId: string;
  taskType: string;
  description: string;
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
}

/** Memory category for task duration records */
const TASK_DURATION_CATEGORY = "custom" as const;
const TASK_DURATION_SENDER_ID = "task_duration";

/**
 * Tracks task execution durations and provides estimates based on historical data.
 */
export class DurationTracker {
  private pendingTasks = new Map<string, PendingTask>();

  constructor(private memoryStore: MemoryStore) {}

  /**
   * Record when a task starts execution.
   * @param taskType - Category/type of task (e.g., "code_review", "file_search")
   * @param description - Human-readable description of the task
   * @returns Unique task ID for tracking
   */
  async recordTaskStart(
    taskType: string,
    description: string,
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    const now = Date.now();

    const pendingTask: PendingTask = {
      taskId,
      taskType,
      description,
      startedAtMs: now,
    };

    this.pendingTasks.set(taskId, pendingTask);
    return taskId;
  }

  /**
   * Record when a task completes and save duration to memory.
   * @param taskId - The task ID returned from recordTaskStart
   */
  async recordTaskComplete(taskId: string): Promise<void> {
    const pending = this.pendingTasks.get(taskId);
    if (!pending) {
      // Task not found - might have been cleared or never started
      return;
    }

    const now = Date.now();
    const durationMs = now - pending.startedAtMs;

    const record: TaskDurationRecord = {
      taskId: pending.taskId,
      taskType: pending.taskType,
      description: pending.description,
      startedAtMs: pending.startedAtMs,
      completedAtMs: now,
      durationMs,
    };

    // Save to memory store with task_duration as sender ID for filtering
    await this.memoryStore.save({
      content: this.serializeRecord(record),
      category: TASK_DURATION_CATEGORY,
      source: "agent",
      senderId: TASK_DURATION_SENDER_ID,
      confidence: 1.0,
      metadata: {
        taskType: record.taskType,
        durationMs: record.durationMs,
        taskId: record.taskId,
      },
    });

    // Clean up pending task
    this.pendingTasks.delete(taskId);
  }

  /**
   * Estimate duration for a task type based on historical data.
   * @param taskType - Category/type of task to estimate
   * @returns Average duration in minutes, or null if no data available
   */
  async estimateDuration(taskType: string): Promise<number | null> {
    // Search for past tasks of this type
    const results = await this.memoryStore.search(`task duration ${taskType}`, {
      senderId: TASK_DURATION_SENDER_ID,
      category: TASK_DURATION_CATEGORY,
      limit: 50, // Get enough samples for good estimate
      minScore: 0.3, // Lower threshold to get more matches
    });

    if (results.length === 0) {
      return null;
    }

    // Filter to exact task type matches and extract durations
    const durations: number[] = [];
    for (const result of results) {
      const record = this.deserializeRecord(result.content);
      if (record && record.taskType === taskType) {
        durations.push(record.durationMs);
      }
    }

    if (durations.length === 0) {
      return null;
    }

    // Calculate average duration in milliseconds
    const totalMs = durations.reduce((sum, d) => sum + d, 0);
    const avgMs = totalMs / durations.length;

    // Convert to minutes
    return avgMs / 60000;
  }

  /**
   * Serialize a task duration record for storage.
   */
  private serializeRecord(record: TaskDurationRecord): string {
    return JSON.stringify({
      _type: "task_duration",
      ...record,
    });
  }

  /**
   * Deserialize a task duration record from storage.
   */
  private deserializeRecord(content: string): TaskDurationRecord | null {
    try {
      const parsed = JSON.parse(content);
      if (parsed._type !== "task_duration") {
        return null;
      }
      return {
        taskId: parsed.taskId,
        taskType: parsed.taskType,
        description: parsed.description,
        startedAtMs: parsed.startedAtMs,
        completedAtMs: parsed.completedAtMs,
        durationMs: parsed.durationMs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the number of pending (in-progress) tasks.
   */
  getPendingCount(): number {
    return this.pendingTasks.size;
  }

  /**
   * Clear a pending task without recording completion (e.g., on error/cancellation).
   */
  clearPendingTask(taskId: string): boolean {
    return this.pendingTasks.delete(taskId);
  }
}
