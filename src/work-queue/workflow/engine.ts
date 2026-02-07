import type { ResolvedAgentInstructions } from "../../agents/agent-instructions.js";
import type { WorkerConfig, WorkerWorkflowConfig } from "../../config/types.agents.js";
import type { WorkItem } from "../types.js";
import type { WorkstreamNotesStore } from "../workstream-notes.js";
import type { GatewayCallFn, WorkflowLogger, WorkflowState } from "./types.js";
import { runDecomposePhase } from "./phases/decompose.js";
import { runDiscoveryPhase } from "./phases/discover.js";
import { runExecutePhase } from "./phases/execute.js";
import { runPlanPhase } from "./phases/plan.js";
import { runReviewPhase } from "./phases/review.js";

export type WorkflowEngineDeps = {
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
  notesStore?: WorkstreamNotesStore;
};

export type WorkflowEngineOptions = {
  agentId: string;
  config: WorkerConfig;
  instructions?: ResolvedAgentInstructions;
  deps: WorkflowEngineDeps;
};

export class WorkerWorkflowEngine {
  private readonly agentId: string;
  private readonly config: WorkerConfig;
  private readonly workflow: WorkerWorkflowConfig;
  private readonly deps: WorkflowEngineDeps;

  constructor(opts: WorkflowEngineOptions) {
    this.agentId = opts.agentId;
    this.config = opts.config;
    this.workflow = opts.config.workflow ?? {};
    this.deps = opts.deps;
  }

  async executeWorkflow(item: WorkItem): Promise<WorkflowState> {
    const state: WorkflowState = {
      phase: "planning",
      workItemId: item.id,
      workItemTitle: item.title,
      reviewIterations: [],
      discoveryResults: [],
      startedAt: Date.now(),
    };

    const { log } = this.deps;

    try {
      // Phase 1: Plan
      state.phase = "planning";
      log.info(`workflow[${this.agentId}]: starting plan phase for item ${item.id}`);
      const plan = await runPlanPhase({
        item,
        agentId: this.agentId,
        model: this.config.model,
        thinking: this.config.thinking ?? "high",
        callGateway: this.deps.callGateway,
        log,
      });
      state.plan = plan;
      this.recordNote(item, "context", `Plan completed: ${plan.intent}`);

      // Phase 2: Review (if enabled, default: true)
      const reviewEnabled = this.workflow.review?.enabled !== false;
      if (reviewEnabled) {
        state.phase = "reviewing";
        log.info(`workflow[${this.agentId}]: starting review phase`);
        const reviewResult = await runReviewPhase({
          plan,
          agentId: this.agentId,
          reviewerAgentId: this.workflow.review?.reviewerAgentId,
          maxIterations: this.workflow.review?.maxIterations,
          model: this.config.model,
          thinking: this.workflow.review?.thinking ?? "high",
          callGateway: this.deps.callGateway,
          log,
        });
        state.plan = reviewResult.plan;
        state.reviewIterations = reviewResult.iterations;
        this.recordNote(
          item,
          "decision",
          `Review completed: ${reviewResult.iterations.length} iteration(s), ${
            reviewResult.iterations[reviewResult.iterations.length - 1]?.approved
              ? "approved"
              : "best-effort"
          }`,
        );
      }

      // Phase 3: Discovery — state.plan is guaranteed set by plan phase (and possibly updated by review).
      const currentPlan = state.plan;
      if (currentPlan.discoveryQuestions.length > 0) {
        state.phase = "discovering";
        log.info(
          `workflow[${this.agentId}]: starting discovery phase (${currentPlan.discoveryQuestions.length} question(s))`,
        );
        state.discoveryResults = await runDiscoveryPhase({
          plan: currentPlan,
          agentId: this.agentId,
          maxParallel: this.workflow.discovery?.maxParallel,
          timeoutSeconds: this.workflow.discovery?.timeoutSeconds,
          model: this.workflow.discovery?.model ?? this.config.model,
          thinking: this.workflow.discovery?.thinking,
          callGateway: this.deps.callGateway,
          log,
        });
        const okCount = state.discoveryResults.filter((r) => r.status === "ok").length;
        this.recordNote(
          item,
          "finding",
          `Discovery completed: ${okCount}/${state.discoveryResults.length} successful`,
        );
      }

      // Phase 4: Decompose
      state.phase = "decomposing";
      log.info(`workflow[${this.agentId}]: starting decompose phase`);
      state.dag = await runDecomposePhase({
        plan: currentPlan,
        discoveryResults: state.discoveryResults,
        agentId: this.agentId,
        model: this.workflow.decompose?.model ?? this.config.model,
        thinking: this.workflow.decompose?.thinking ?? "high",
        callGateway: this.deps.callGateway,
        log,
      });
      const totalNodes = state.dag.phases.reduce(
        (sum, p) => sum + p.tasks.reduce((ts, t) => ts + t.subtasks.length, 0),
        0,
      );
      this.recordNote(
        item,
        "context",
        `Decompose completed: ${state.dag.phases.length} phase(s), ${totalNodes} subtask(s)`,
      );

      // Phase 5: Execute
      state.phase = "executing";
      log.info(`workflow[${this.agentId}]: starting execute phase`);
      state.executionProgress = await runExecutePhase({
        dag: state.dag,
        agentId: this.agentId,
        model: this.config.model,
        thinking: this.config.thinking,
        sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
        callGateway: this.deps.callGateway,
        log,
        onProgress: (progress) => {
          state.executionProgress = progress;
        },
      });

      // Mark completed or failed based on execution results.
      const progress = state.executionProgress;
      if (progress.failedNodes > 0 && progress.completedNodes === 0) {
        state.phase = "failed";
        state.error = `All ${progress.failedNodes} execution node(s) failed`;
      } else {
        state.phase = "completed";
      }
      state.completedAt = Date.now();
      this.recordNote(
        item,
        "summary",
        `Workflow ${state.phase}: ${progress.completedNodes}/${progress.totalNodes} nodes succeeded`,
      );

      log.info(`workflow[${this.agentId}]: workflow completed for item ${item.id}`);
      return state;
    } catch (err) {
      const failedInPhase = state.phase;
      state.phase = "failed";
      state.error = String(err);
      state.completedAt = Date.now();
      log.error(`workflow[${this.agentId}]: workflow failed for item ${item.id}: ${state.error}`);
      this.recordNote(item, "blocker", `Workflow failed in ${failedInPhase}: ${state.error}`);
      return state;
    }
  }

  private recordNote(
    item: WorkItem,
    kind: "finding" | "decision" | "blocker" | "context" | "summary",
    content: string,
  ): void {
    if (!this.deps.notesStore || !item.workstream) {
      return;
    }
    try {
      this.deps.notesStore.append({
        workstream: item.workstream,
        itemId: item.id,
        kind,
        content,
        createdBy: { agentId: this.agentId },
      });
    } catch {
      // Best-effort.
    }
  }
}
