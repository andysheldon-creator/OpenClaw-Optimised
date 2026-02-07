import type { WorkerConfig } from "../../config/types.agents.js";
import type { WorkQueueStore } from "../store.js";
import type { WorkItem, WorkItemOutcome } from "../types.js";
import type { WorkstreamNotesStore } from "../workstream-notes.js";
import type { GatewayCallFn, WorkflowLogger } from "./types.js";
import { WorkerMetrics, type WorkerMetricsSnapshot } from "../worker-metrics.js";
import { WorkerWorkflowEngine } from "./engine.js";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_BASE_MS = 2000;

export type WorkflowWorkerAdapterDeps = {
  store: WorkQueueStore;
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
  notesStore?: WorkstreamNotesStore;
};

export type WorkflowWorkerAdapterOptions = {
  agentId: string;
  config: WorkerConfig;
  deps: WorkflowWorkerAdapterDeps;
};

/**
 * Adapter that provides the same interface as WorkQueueWorker
 * but delegates item processing to the WorkerWorkflowEngine.
 */
export class WorkflowWorkerAdapter {
  private abortController = new AbortController();
  private running = false;
  private consecutiveErrors = 0;
  private currentItemId: string | null = null;
  private loopPromise: Promise<void> | null = null;
  private metrics = new WorkerMetrics();
  private engine: WorkerWorkflowEngine;

  readonly agentId: string;
  private readonly config: WorkerConfig;
  private readonly deps: WorkflowWorkerAdapterDeps;

  constructor(opts: WorkflowWorkerAdapterOptions) {
    this.agentId = opts.agentId;
    this.config = opts.config;
    this.deps = opts.deps;

    this.engine = new WorkerWorkflowEngine({
      agentId: opts.agentId,
      config: opts.config,
      deps: {
        callGateway: opts.deps.callGateway,
        log: opts.deps.log,
        notesStore: opts.deps.notesStore,
      },
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentWorkItemId(): string | null {
    return this.currentItemId;
  }

  getConfig(): WorkerConfig {
    return this.config;
  }

  getMetrics(): WorkerMetricsSnapshot {
    return this.metrics.snapshot(this.agentId, this.currentItemId);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.abortController = new AbortController();
    const workstreams = this.targetWorkstreams.join(", ") || "(all)";
    this.deps.log.info(
      `workflow-worker[${this.agentId}]: starting (queue=${this.targetQueueId}, workstreams=${workstreams})`,
    );
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.deps.log.info(`workflow-worker[${this.agentId}]: stopping`);
    this.running = false;
    this.abortController.abort();
    if (this.loopPromise) {
      await this.loopPromise.catch(() => {});
      this.loopPromise = null;
    }
  }

  private async loop(): Promise<void> {
    const signal = this.abortController.signal;
    const pollMs = this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    while (this.running && !signal.aborted) {
      try {
        const item = await this.claimNext();
        if (!item) {
          await this.sleep(pollMs, signal);
          continue;
        }

        this.consecutiveErrors = 0;
        this.currentItemId = item.id;
        this.deps.log.info(
          `workflow-worker[${this.agentId}]: processing item ${item.id} "${item.title}" via workflow`,
        );

        const startTime = Date.now();
        const state = await this.engine.executeWorkflow(item);
        const durationMs = Date.now() - startTime;

        // Map workflow result to work item outcome.
        const outcome: WorkItemOutcome = state.phase === "completed" ? "success" : "error";

        const now = new Date().toISOString();
        // attemptNumber is 1-indexed; retryCount tracks how many re-attempts after the first.
        const attemptNumber = (item.retryCount ?? 0) + 1;

        // Record execution.
        await this.deps.store.recordExecution({
          itemId: item.id,
          attemptNumber,
          sessionKey: `workflow:${this.agentId}`,
          outcome,
          error: state.error,
          startedAt: item.startedAt ?? now,
          completedAt: now,
          durationMs,
        });

        // Update item.
        if (outcome === "success") {
          const progress = state.executionProgress;
          await this.deps.store.updateItem(item.id, {
            status: "completed",
            retryCount: attemptNumber,
            lastOutcome: "success",
            result: {
              summary: `Workflow completed: ${progress?.completedNodes ?? 0}/${progress?.totalNodes ?? 0} nodes`,
            },
            completedAt: now,
          });
          this.deps.log.info(`workflow-worker[${this.agentId}]: completed item ${item.id}`);
        } else {
          const maxRetries = item.maxRetries ?? 0;
          const exhausted = maxRetries > 0 && attemptNumber >= maxRetries;

          if (exhausted || maxRetries === 0) {
            await this.deps.store.updateItem(item.id, {
              status: "failed",
              retryCount: attemptNumber,
              lastOutcome: "error",
              error: { message: state.error ?? "workflow failed", recoverable: !exhausted },
              completedAt: now,
            });
          } else {
            await this.deps.store.updateItem(item.id, {
              status: "pending",
              retryCount: attemptNumber,
              lastOutcome: "error",
              statusReason: `retry ${attemptNumber}/${maxRetries}`,
              error: { message: state.error ?? "workflow failed", recoverable: true },
              assignedTo: undefined,
              startedAt: undefined,
              completedAt: undefined,
            });
          }
        }

        this.metrics.recordProcessing(durationMs, outcome === "success");
        this.currentItemId = null;
      } catch (err) {
        this.currentItemId = null;
        this.consecutiveErrors++;
        this.deps.log.error(
          `workflow-worker[${this.agentId}]: loop error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${String(err)}`,
        );
        if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const backoff =
            BACKOFF_BASE_MS * 2 ** Math.min(this.consecutiveErrors - MAX_CONSECUTIVE_ERRORS, 5);
          this.deps.log.warn(
            `workflow-worker[${this.agentId}]: backoff ${backoff}ms after ${this.consecutiveErrors} consecutive errors`,
          );
          await this.sleep(backoff, signal);
        }
      }
    }
  }

  private async claimNext(): Promise<WorkItem | null> {
    const queueId = this.targetQueueId;
    const workstreams = this.targetWorkstreams;
    if (workstreams && workstreams.length > 0) {
      for (const ws of workstreams) {
        const item = await this.deps.store.claimNextItem({
          queueId,
          assignTo: { agentId: this.agentId },
          workstream: ws,
        });
        if (item) {
          return item;
        }
      }
      return null;
    }
    return this.deps.store.claimNextItem({
      queueId,
      assignTo: { agentId: this.agentId },
    });
  }

  private get targetQueueId(): string {
    const configured = this.config.queueId?.trim();
    return configured || this.agentId;
  }

  private get targetWorkstreams(): string[] {
    return (this.config.workstreams ?? []).map((w) => w.trim()).filter((w) => w.length > 0);
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
