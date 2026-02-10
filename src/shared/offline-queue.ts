/**
 * Offline Mode with Task Queuing
 * Queues tasks when service is unreachable. Auto-retries on reconnect.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type QueuedTask = {
  id: string;
  timestamp: string;
  type: "message" | "command" | "api_call";
  payload: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  status: "pending" | "retrying" | "completed" | "failed";
  error?: string;
};
type QueueState = { tasks: QueuedTask[]; lastFlushAttempt?: string; serviceAvailable: boolean };

export class OfflineQueue {
  private state: QueueState;
  private filePath: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private onExecute?: (task: QueuedTask) => Promise<boolean>;

  constructor(queueDir: string, onExecute?: (task: QueuedTask) => Promise<boolean>) {
    this.filePath = path.join(queueDir, "offline-queue.json");
    this.onExecute = onExecute;
    try {
      this.state = fs.existsSync(this.filePath)
        ? JSON.parse(fs.readFileSync(this.filePath, "utf-8"))
        : { tasks: [], serviceAvailable: true };
    } catch {
      this.state = { tasks: [], serviceAvailable: true };
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  enqueue(type: QueuedTask["type"], payload: Record<string, unknown>, maxRetries = 10): QueuedTask {
    const task: QueuedTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      payload,
      retryCount: 0,
      maxRetries,
      status: "pending",
    };
    this.state.tasks.push(task);
    this.save();
    return task;
  }

  getPending(): QueuedTask[] {
    return this.state.tasks.filter((t) => t.status === "pending" || t.status === "retrying");
  }
  get size(): number {
    return this.getPending().length;
  }

  setServiceAvailable(available: boolean): void {
    this.state.serviceAvailable = available;
    this.save();
    if (available) {
      void this.flush();
    }
  }

  async flush(): Promise<{ completed: number; failed: number; remaining: number }> {
    if (!this.onExecute) {
      return { completed: 0, failed: 0, remaining: this.size };
    }
    this.state.lastFlushAttempt = new Date().toISOString();
    let completed = 0,
      failed = 0;
    for (const task of this.getPending()) {
      try {
        task.status = "retrying";
        if (await this.onExecute(task)) {
          task.status = "completed";
          completed++;
        } else {
          task.retryCount++;
          task.status = task.retryCount >= task.maxRetries ? (failed++, "failed") : "pending";
        }
      } catch (err) {
        task.retryCount++;
        task.error = err instanceof Error ? err.message : String(err);
        task.status = task.retryCount >= task.maxRetries ? (failed++, "failed") : "pending";
      }
    }
    this.save();
    return { completed, failed, remaining: this.size };
  }

  startAutoRetry(intervalMs = 5000): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        if (this.size > 0) {
          void this.flush();
        }
      }, intervalMs);
    }
  }
  stopAutoRetry(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  cleanup(): number {
    const before = this.state.tasks.length;
    this.state.tasks = this.state.tasks.filter(
      (t) => t.status === "pending" || t.status === "retrying",
    );
    this.save();
    return before - this.state.tasks.length;
  }

  getState(): QueueState {
    return { ...this.state };
  }
}
