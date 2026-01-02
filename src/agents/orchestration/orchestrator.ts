/**
 * AgentOrchestrator - Multi-agent orchestration system for Clawdis.
 *
 * This module provides the core orchestration capabilities for spawning,
 * coordinating, and aggregating results from specialized agents.
 */

import type { AgentToolResult } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import {
  type AgentCapability,
  type AgentDefinition,
  AgentRegistry,
  type AnyAgentTool,
  detectIntent,
  findAgentsByCapability,
  getAllAgentDefinitions,
  getRecommendedAgent,
  type SpecializedAgentType,
  type TaskIntent,
} from "./agent-types.js";
import type {
  AgentRole,
  OrchestrationResult,
  OrchestrationTask,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status of an orchestrated workflow.
 */
export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Priority levels for workflow execution.
 */
export type WorkflowPriority = "low" | "normal" | "high" | "critical";

/**
 * A single step in a multi-agent workflow.
 */
export interface WorkflowStep {
  id: string;
  agentType: SpecializedAgentType;
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  status: WorkflowStatus;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * A complete multi-agent workflow.
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  priority: WorkflowPriority;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Result from task decomposition.
 */
export interface DecompositionResult {
  mainTask: string;
  intent: TaskIntent;
  recommendedAgent: SpecializedAgentType;
  steps: Array<{
    description: string;
    agentType: SpecializedAgentType;
    action: string;
    priority: number;
    dependsOn: string[];
  }>;
  estimatedComplexity: "simple" | "moderate" | "complex";
}

/**
 * Aggregated results from multiple agents.
 */
export interface AggregatedResult {
  workflowId: string;
  status: WorkflowStatus;
  stepResults: Array<{
    stepId: string;
    agentType: SpecializedAgentType;
    action: string;
    status: WorkflowStatus;
    result?: unknown;
    error?: string;
  }>;
  summary: string;
  insights: string[];
  actionItems: string[];
}

/**
 * Options for spawning an agent.
 */
export interface SpawnOptions {
  agentType: SpecializedAgentType;
  action: string;
  params: Record<string, unknown>;
  context?: string;
  timeout?: number;
}

/**
 * Result from spawning an agent.
 */
export interface SpawnResult {
  agentType: SpecializedAgentType;
  action: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Workflow Store
// ─────────────────────────────────────────────────────────────────────────────

const workflowStore = new Map<string, Workflow>();

function generateId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateStepId(): string {
  return `step-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentOrchestrator Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central orchestrator for multi-agent workflows.
 *
 * The AgentOrchestrator manages:
 * - Task decomposition into agent-specific steps
 * - Agent spawning and execution
 * - Workflow state management
 * - Result aggregation
 */
export class AgentOrchestrator {
  private readonly agentRegistry: Record<SpecializedAgentType, AgentDefinition>;

  constructor() {
    this.agentRegistry = AgentRegistry;
  }

  /**
   * Decompose a complex task into steps for multiple agents.
   */
  decomposeTask(task: string): DecompositionResult {
    const intent = detectIntent(task);
    const recommendedAgent = getRecommendedAgent(task);
    const lowerTask = task.toLowerCase();

    const steps: DecompositionResult["steps"] = [];

    // Analyze task for multi-agent decomposition
    // This is a heuristic-based decomposition - in production,
    // this could use an LLM for more sophisticated analysis

    // Check for research components
    if (
      lowerTask.includes("research") ||
      lowerTask.includes("find out") ||
      lowerTask.includes("investigate")
    ) {
      steps.push({
        description: "Research the topic and gather information",
        agentType: "research_assistant",
        action: "research_topic",
        priority: 1,
        dependsOn: [],
      });
    }

    // Check for email/message components
    if (
      lowerTask.includes("email") ||
      lowerTask.includes("inbox") ||
      lowerTask.includes("message")
    ) {
      steps.push({
        description: "Triage and prioritize messages",
        agentType: "inbox_manager",
        action: "triage",
        priority: 1,
        dependsOn: [],
      });
    }

    // Check for scheduling components
    if (
      lowerTask.includes("schedule") ||
      lowerTask.includes("meeting") ||
      lowerTask.includes("calendar")
    ) {
      steps.push({
        description: "Find available time slots and schedule",
        agentType: "scheduler",
        action: "find_time",
        priority: 2,
        dependsOn: steps.length > 0 ? [steps[0].description] : [],
      });
    }

    // Check for task tracking components
    if (
      lowerTask.includes("track") ||
      lowerTask.includes("progress") ||
      lowerTask.includes("deadline")
    ) {
      steps.push({
        description: "Track task progress and deadlines",
        agentType: "task_coordinator",
        action: "track_progress",
        priority: 3,
        dependsOn: [],
      });
    }

    // Check for report/summary components
    if (
      lowerTask.includes("report") ||
      lowerTask.includes("summary") ||
      lowerTask.includes("briefing")
    ) {
      steps.push({
        description: "Generate a summary briefing",
        agentType: "research_assistant",
        action: "create_briefing",
        priority: 4,
        dependsOn:
          steps.length > 0
            ? steps.filter((s) => s.priority < 4).map((s) => s.description)
            : [],
      });
    }

    // If no specific patterns matched, default to the recommended agent
    if (steps.length === 0) {
      steps.push({
        description: `Process task: ${task}`,
        agentType: recommendedAgent.type,
        action: getDefaultAction(recommendedAgent.type),
        priority: 1,
        dependsOn: [],
      });
    }

    // Determine complexity
    let estimatedComplexity: DecompositionResult["estimatedComplexity"];
    if (steps.length === 1) {
      estimatedComplexity = "simple";
    } else if (steps.length <= 3) {
      estimatedComplexity = "moderate";
    } else {
      estimatedComplexity = "complex";
    }

    return {
      mainTask: task,
      intent,
      recommendedAgent: recommendedAgent.type,
      steps,
      estimatedComplexity,
    };
  }

  /**
   * Create a new workflow from decomposed steps.
   */
  createWorkflow(
    name: string,
    description: string,
    decomposition: DecompositionResult,
    priority: WorkflowPriority = "normal",
  ): Workflow {
    const now = Date.now();
    const workflowId = generateId();

    const steps: WorkflowStep[] = decomposition.steps.map((step) => ({
      id: `${workflowId}-${generateStepId()}`,
      agentType: step.agentType,
      action: step.action,
      params: { description: step.description },
      dependsOn: step.dependsOn,
      status: "pending",
    }));

    const workflow: Workflow = {
      id: workflowId,
      name,
      description,
      steps,
      status: "pending",
      priority,
      createdAt: now,
      updatedAt: now,
    };

    workflowStore.set(workflowId, workflow);
    return workflow;
  }

  /**
   * Spawn a specialized agent to execute a specific action.
   */
  async spawnAgent(options: SpawnOptions): Promise<SpawnResult> {
    const { agentType, action, params, context } = options;
    const startTime = Date.now();

    const agentDef = this.agentRegistry[agentType];
    if (!agentDef) {
      return {
        agentType,
        action,
        success: false,
        error: `Unknown agent type: ${agentType}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Create the agent's tools
      const tools = agentDef.createTools();
      const tool = tools.find(
        (t) =>
          t.name === agentType ||
          t.name === agentType.replace(/_/g, "-") ||
          t.name.includes(agentType.split("_")[0]),
      );

      if (!tool) {
        // Return instructions instead of executing
        return {
          agentType,
          action,
          success: true,
          result: {
            type: "agent_instructions",
            agentType,
            action,
            params,
            systemPrompt: agentDef.systemPrompt,
            capabilities: agentDef.capabilities,
            context,
            message: `Agent ${agentDef.name} should execute action "${action}" with the provided parameters`,
          },
          durationMs: Date.now() - startTime,
        };
      }

      // Execute the tool
      const toolParams = { action, ...params };
      const result = await tool.execute(
        `orchestrator-${Date.now()}`,
        toolParams,
        undefined,
      );

      return {
        agentType,
        action,
        success: true,
        result: result.details ?? result.content,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        agentType,
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a workflow step by step.
   */
  async executeWorkflow(workflowId: string): Promise<AggregatedResult> {
    const workflow = workflowStore.get(workflowId);
    if (!workflow) {
      return {
        workflowId,
        status: "failed",
        stepResults: [],
        summary: `Workflow ${workflowId} not found`,
        insights: [],
        actionItems: [],
      };
    }

    workflow.status = "running";
    workflow.updatedAt = Date.now();

    const stepResults: AggregatedResult["stepResults"] = [];
    const completedStepIds = new Set<string>();

    // Execute steps in dependency order
    for (const step of workflow.steps) {
      // Check dependencies
      const unmetDeps = step.dependsOn.filter(
        (depId) => !completedStepIds.has(depId),
      );
      if (unmetDeps.length > 0) {
        step.status = "pending";
        stepResults.push({
          stepId: step.id,
          agentType: step.agentType,
          action: step.action,
          status: "pending",
          error: `Waiting for dependencies: ${unmetDeps.join(", ")}`,
        });
        continue;
      }

      step.status = "running";
      step.startedAt = Date.now();

      const result = await this.spawnAgent({
        agentType: step.agentType,
        action: step.action,
        params: step.params,
      });

      if (result.success) {
        step.status = "completed";
        step.result = result.result;
        completedStepIds.add(step.id);
      } else {
        step.status = "failed";
        step.error = result.error;
      }

      step.completedAt = Date.now();

      stepResults.push({
        stepId: step.id,
        agentType: step.agentType,
        action: step.action,
        status: step.status,
        result: step.result,
        error: step.error,
      });
    }

    // Determine overall workflow status
    const allCompleted = workflow.steps.every((s) => s.status === "completed");
    const anyFailed = workflow.steps.some((s) => s.status === "failed");

    if (allCompleted) {
      workflow.status = "completed";
      workflow.completedAt = Date.now();
    } else if (anyFailed) {
      workflow.status = "failed";
    }

    workflow.updatedAt = Date.now();

    // Generate summary and insights
    const aggregated = this.aggregateResults(workflow, stepResults);
    return aggregated;
  }

  /**
   * Aggregate results from multiple agents into a cohesive summary.
   */
  aggregateResults(
    workflow: Workflow,
    stepResults: AggregatedResult["stepResults"],
  ): AggregatedResult {
    const completedSteps = stepResults.filter((s) => s.status === "completed");
    const failedSteps = stepResults.filter((s) => s.status === "failed");

    const insights: string[] = [];
    const actionItems: string[] = [];

    // Extract insights from each agent's results
    for (const step of completedSteps) {
      const result = step.result as Record<string, unknown> | undefined;
      if (!result) continue;

      // Extract insights based on agent type
      switch (step.agentType) {
        case "inbox_manager":
          if (result.instructions) {
            insights.push("Inbox triage instructions generated");
          }
          break;
        case "scheduler":
          if (result.slots || result.slotsFound) {
            const slotCount =
              (result.slotsFound as number) ??
              (result.slots as unknown[])?.length ??
              0;
            insights.push(`Found ${slotCount} available time slots`);
          }
          if (result.conflicts) {
            const conflictCount = (result.conflictsFound as number) ?? 0;
            if (conflictCount > 0) {
              actionItems.push(`Resolve ${conflictCount} calendar conflict(s)`);
            }
          }
          break;
        case "research_assistant":
          if (result.research) {
            insights.push("Research topic initialized with keywords");
          }
          if (result.briefing) {
            insights.push("Research briefing generated");
          }
          break;
        case "task_coordinator":
          if (result.taskId) {
            insights.push(
              `Task decomposed: ${result.subtaskCount ?? 0} subtasks`,
            );
          }
          if (result.overdue && (result.overdue as unknown[]).length > 0) {
            actionItems.push(
              `Address ${(result.overdue as unknown[]).length} overdue task(s)`,
            );
          }
          break;
      }
    }

    // Add action items for failed steps
    for (const step of failedSteps) {
      actionItems.push(`Retry failed step: ${step.action} (${step.error})`);
    }

    // Generate summary
    let summary: string;
    if (workflow.status === "completed") {
      summary = `Workflow "${workflow.name}" completed successfully. ${completedSteps.length} step(s) executed.`;
    } else if (workflow.status === "failed") {
      summary = `Workflow "${workflow.name}" encountered errors. ${failedSteps.length} step(s) failed out of ${stepResults.length}.`;
    } else {
      summary = `Workflow "${workflow.name}" is in progress. ${completedSteps.length}/${stepResults.length} step(s) completed.`;
    }

    return {
      workflowId: workflow.id,
      status: workflow.status,
      stepResults,
      summary,
      insights,
      actionItems,
    };
  }

  /**
   * Get the status of a workflow.
   */
  getWorkflowStatus(workflowId: string): Workflow | undefined {
    return workflowStore.get(workflowId);
  }

  /**
   * List all workflows with optional filtering.
   */
  listWorkflows(filter?: {
    status?: WorkflowStatus;
    limit?: number;
  }): Workflow[] {
    let workflows = Array.from(workflowStore.values());

    if (filter?.status) {
      workflows = workflows.filter((w) => w.status === filter.status);
    }

    workflows.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.limit) {
      workflows = workflows.slice(0, filter.limit);
    }

    return workflows;
  }

  /**
   * Get information about available agents.
   */
  getAvailableAgents(): Array<{
    type: SpecializedAgentType;
    name: string;
    description: string;
    capabilities: AgentCapability[];
  }> {
    return getAllAgentDefinitions().map((agent) => ({
      type: agent.type,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities,
    }));
  }

  /**
   * Find agents that can handle a specific capability.
   */
  findAgentsForCapability(capability: AgentCapability): AgentDefinition[] {
    return findAgentsByCapability(capability);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Interface Methods (as specified in types.ts)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Decompose a complex task description into manageable OrchestrationTasks.
   *
   * This async version aligns with the OrchestrationTask type from types.ts.
   * It analyzes the description, identifies distinct work items, and assigns
   * appropriate agent roles to each task.
   */
  async decomposeTaskAsync(description: string): Promise<OrchestrationTask[]> {
    const decomposition = this.decomposeTask(description);
    const now = Date.now();
    const tasks: OrchestrationTask[] = [];

    for (const step of decomposition.steps) {
      const task: OrchestrationTask = {
        id: `task-${generateStepId()}`,
        description: step.description,
        assignedAgent: step.agentType as AgentRole,
        status: "pending",
        createdAt: now,
      };
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Select the most appropriate agent for a given OrchestrationTask.
   *
   * This matches the task description and requirements against agent
   * capabilities to find the best fit.
   */
  async selectAgent(task: OrchestrationTask): Promise<AgentRole> {
    // If already assigned, return that
    if (task.assignedAgent) {
      return task.assignedAgent;
    }

    const recommendedAgent = getRecommendedAgent(task.description);
    return recommendedAgent.type as AgentRole;
  }

  /**
   * Execute a single OrchestrationTask with the assigned agent.
   *
   * Returns the result from the agent's execution.
   */
  async executeTask(task: OrchestrationTask): Promise<unknown> {
    const agent = task.assignedAgent ?? (await this.selectAgent(task));
    const agentDef = this.agentRegistry[agent as SpecializedAgentType];

    if (!agentDef) {
      throw new Error(`Unknown agent type: ${agent}`);
    }

    // Update task status
    task.status = "in_progress";
    task.assignedAgent = agent;

    try {
      const result = await this.spawnAgent({
        agentType: agent as SpecializedAgentType,
        action: getDefaultAction(agent as SpecializedAgentType),
        params: { description: task.description },
      });

      if (result.success) {
        task.status = "completed";
        task.result = result.result;
        task.completedAt = Date.now();
        return result.result;
      } else {
        task.status = "failed";
        throw new Error(result.error ?? "Task execution failed");
      }
    } catch (error) {
      task.status = "failed";
      throw error;
    }
  }

  /**
   * Full orchestration flow for a complex objective.
   *
   * This method:
   * 1. Decomposes the objective into OrchestrationTasks
   * 2. Selects agents for each task
   * 3. Executes tasks sequentially
   * 4. Aggregates and returns the OrchestrationResult
   */
  async orchestrate(objective: string): Promise<OrchestrationResult> {
    const taskId = generateId();
    const tasks = await this.decomposeTaskAsync(objective);
    const results: unknown[] = [];
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        const result = await this.executeTask(task);
        results.push(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`${task.id}: ${errorMessage}`);
      }
    }

    const allSucceeded = tasks.every((t) => t.status === "completed");

    return {
      taskId,
      success: allSucceeded,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getDefaultAction(agentType: SpecializedAgentType): string {
  const defaults: Record<SpecializedAgentType, string> = {
    inbox_manager: "triage",
    scheduler: "find_time",
    research_assistant: "research_topic",
    task_coordinator: "track_progress",
  };
  return defaults[agentType] ?? "execute";
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
// Orchestrator Tool Schema
// ─────────────────────────────────────────────────────────────────────────────

const OrchestratorSchema = Type.Union([
  // Decompose a complex task
  Type.Object({
    action: Type.Literal("decompose"),
    task: Type.String({
      description: "Complex task to decompose into agent-specific steps",
    }),
  }),

  // Spawn a specific agent
  Type.Object({
    action: Type.Literal("spawn"),
    agentType: Type.Union([
      Type.Literal("inbox_manager"),
      Type.Literal("scheduler"),
      Type.Literal("research_assistant"),
      Type.Literal("task_coordinator"),
    ]),
    agentAction: Type.String({
      description: "Action for the agent to execute",
    }),
    params: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Parameters for the agent action",
      }),
    ),
    context: Type.Optional(
      Type.String({ description: "Additional context for the agent" }),
    ),
  }),

  // Create and execute a workflow
  Type.Object({
    action: Type.Literal("orchestrate"),
    task: Type.String({ description: "Task to orchestrate across agents" }),
    name: Type.Optional(Type.String({ description: "Workflow name" })),
    priority: Type.Optional(
      Type.Union([
        Type.Literal("low"),
        Type.Literal("normal"),
        Type.Literal("high"),
        Type.Literal("critical"),
      ]),
    ),
    autoExecute: Type.Optional(
      Type.Boolean({
        description: "Automatically execute the workflow after creation",
        default: false,
      }),
    ),
  }),

  // Execute an existing workflow
  Type.Object({
    action: Type.Literal("execute"),
    workflowId: Type.String({ description: "Workflow ID to execute" }),
  }),

  // Get workflow status
  Type.Object({
    action: Type.Literal("status"),
    workflowId: Type.Optional(
      Type.String({ description: "Specific workflow ID" }),
    ),
  }),

  // List workflows
  Type.Object({
    action: Type.Literal("list"),
    status: Type.Optional(
      Type.Union([
        Type.Literal("pending"),
        Type.Literal("running"),
        Type.Literal("completed"),
        Type.Literal("failed"),
        Type.Literal("cancelled"),
      ]),
    ),
    limit: Type.Optional(Type.Number({ default: 10 })),
  }),

  // List available agents
  Type.Object({
    action: Type.Literal("agents"),
    capability: Type.Optional(
      Type.String({ description: "Filter by capability" }),
    ),
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator Tool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the orchestrator tool for multi-agent coordination.
 */
export function createOrchestratorTool(): AnyAgentTool {
  const orchestrator = new AgentOrchestrator();

  return {
    label: "Agent Orchestrator",
    name: "orchestrate",
    description: `Multi-agent orchestration tool for complex task coordination. Spawns specialized agents (Inbox Manager, Scheduler, Research Assistant, Task Coordinator) and coordinates their work.

Actions:
- decompose: Break a complex task into agent-specific steps
- spawn: Directly spawn a specific agent with an action
- orchestrate: Create a workflow and optionally auto-execute it
- execute: Execute a pending workflow
- status: Get workflow status
- list: List all workflows
- agents: List available agents and their capabilities

Use this for complex tasks requiring multiple agent capabilities.`,
    parameters: OrchestratorSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = params.action as string;

      switch (action) {
        case "decompose": {
          const task = params.task as string;
          const result = orchestrator.decomposeTask(task);
          return jsonResult({
            success: true,
            decomposition: result,
            message: `Task decomposed into ${result.steps.length} step(s) with ${result.estimatedComplexity} complexity`,
          });
        }

        case "spawn": {
          const agentType = params.agentType as SpecializedAgentType;
          const agentAction = params.agentAction as string;
          const agentParams = (params.params as Record<string, unknown>) ?? {};
          const context = params.context as string | undefined;

          const result = await orchestrator.spawnAgent({
            agentType,
            action: agentAction,
            params: agentParams,
            context,
          });

          return jsonResult({
            success: result.success,
            agentType,
            action: agentAction,
            result: result.result,
            error: result.error,
            durationMs: result.durationMs,
          });
        }

        case "orchestrate": {
          const task = params.task as string;
          const name =
            (params.name as string) ?? `Workflow: ${task.slice(0, 50)}`;
          const priority = (params.priority as WorkflowPriority) ?? "normal";
          const autoExecute = (params.autoExecute as boolean) ?? false;

          // Decompose the task
          const decomposition = orchestrator.decomposeTask(task);

          // Create the workflow
          const workflow = orchestrator.createWorkflow(
            name,
            task,
            decomposition,
            priority,
          );

          // Optionally execute
          if (autoExecute) {
            const result = await orchestrator.executeWorkflow(workflow.id);
            return jsonResult({
              success: true,
              workflowId: workflow.id,
              decomposition,
              execution: result,
              message: `Workflow created and executed. Status: ${result.status}`,
            });
          }

          return jsonResult({
            success: true,
            workflowId: workflow.id,
            decomposition,
            workflow: {
              id: workflow.id,
              name: workflow.name,
              status: workflow.status,
              stepCount: workflow.steps.length,
            },
            message: `Workflow created with ${workflow.steps.length} step(s). Use execute action to run it.`,
          });
        }

        case "execute": {
          const workflowId = params.workflowId as string;
          const result = await orchestrator.executeWorkflow(workflowId);
          return jsonResult({
            success: result.status === "completed",
            execution: result,
          });
        }

        case "status": {
          const workflowId = params.workflowId as string | undefined;
          if (workflowId) {
            const workflow = orchestrator.getWorkflowStatus(workflowId);
            if (!workflow) {
              return jsonResult({
                success: false,
                error: `Workflow ${workflowId} not found`,
              });
            }
            return jsonResult({
              success: true,
              workflow: {
                id: workflow.id,
                name: workflow.name,
                status: workflow.status,
                priority: workflow.priority,
                steps: workflow.steps.map((s) => ({
                  id: s.id,
                  agentType: s.agentType,
                  action: s.action,
                  status: s.status,
                })),
                createdAt: new Date(workflow.createdAt).toISOString(),
                completedAt: workflow.completedAt
                  ? new Date(workflow.completedAt).toISOString()
                  : null,
              },
            });
          }

          // Return summary of all workflows
          const workflows = orchestrator.listWorkflows({ limit: 10 });
          return jsonResult({
            success: true,
            totalWorkflows: workflows.length,
            workflows: workflows.map((w) => ({
              id: w.id,
              name: w.name,
              status: w.status,
              stepCount: w.steps.length,
            })),
          });
        }

        case "list": {
          const status = params.status as WorkflowStatus | undefined;
          const limit = (params.limit as number) ?? 10;
          const workflows = orchestrator.listWorkflows({ status, limit });

          return jsonResult({
            success: true,
            count: workflows.length,
            workflows: workflows.map((w) => ({
              id: w.id,
              name: w.name,
              status: w.status,
              priority: w.priority,
              stepCount: w.steps.length,
              createdAt: new Date(w.createdAt).toISOString(),
            })),
          });
        }

        case "agents": {
          const capability = params.capability as AgentCapability | undefined;

          if (capability) {
            const agents = orchestrator.findAgentsForCapability(capability);
            return jsonResult({
              success: true,
              capability,
              agents: agents.map((a) => ({
                type: a.type,
                name: a.name,
                description: a.description,
              })),
            });
          }

          const agents = orchestrator.getAvailableAgents();
          return jsonResult({
            success: true,
            agents,
          });
        }

        default:
          return jsonResult({
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: [
              "decompose",
              "spawn",
              "orchestrate",
              "execute",
              "status",
              "list",
              "agents",
            ],
          });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all orchestration tools as an array.
 */
export function createOrchestrationTools(): AnyAgentTool[] {
  return [createOrchestratorTool()];
}

export default AgentOrchestrator;
