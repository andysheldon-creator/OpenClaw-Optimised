/**
 * Multi-Agent Orchestration System for Clawdis
 *
 * This module provides intelligent agent coordination for complex tasks by:
 * - Spawning specialized agents based on task requirements
 * - Routing tasks to the most appropriate agents
 * - Managing inter-agent communication
 * - Coordinating multi-step workflows
 *
 * Available agents:
 * - Inbox Manager: Email/message triage and prioritization
 * - Scheduler: Calendar management and meeting coordination
 * - Research Assistant: Information gathering and analysis
 * - Task Coordinator: Complex task decomposition and tracking
 */

import type { AgentTool } from "@mariozechner/pi-ai";
import type { TSchema } from "@sinclair/typebox";

// Agent implementations
import {
  createInboxManagerTool,
  inboxManagerAgent,
  type InboxManagerAgent,
  type MessagePriority,
  type MessageCategory,
  type MessageSource,
  type UnifiedMessage,
  type TriagedMessage,
  type MessageSummary,
  type ResponseSuggestion,
} from "./inbox-manager.js";

import {
  createSchedulerTool,
  createSchedulerTools,
  schedulerAgent,
  type SchedulerAgent,
  type SchedulerAgentConfig,
  type ConflictInfo,
  type AvailabilityAnalysis,
  type SchedulingResult,
} from "./scheduler.js";

import {
  createResearchAssistantTool,
  createResearchAssistantTools,
  ResearchAssistantConfig,
  type ResearchTopic,
  type ResearchSource,
  type ResearchFinding,
  type ResearchBriefing,
  type SynthesisResult,
} from "./research-assistant.js";

import {
  createTaskCoordinatorTool,
  taskCoordinatorAgent,
  getAllTasks,
  getTask,
  clearTasks,
  importTasks,
  type Task,
  type SubTask,
  type TaskDependency,
  type TaskCoordinatorAgent,
  type TaskStatus as CoordinatorTaskStatus,
  type TaskPriority as CoordinatorTaskPriority,
  type AgentType as CoordinatorAgentType,
} from "./task-coordinator.js";

// Core types
import type {
  Agent,
  AgentCapability,
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentHealthStatus,
  AgentMatch,
  AgentMessage,
  AgentTask,
  CapabilityDomain,
  OrchestratorStatus,
  RetryPolicy,
  RoutingDecision,
  SpecializedAgentType,
  TaskPriority,
  TaskRequirement,
  TaskStatus,
  Workflow,
  WorkflowStep,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Registry
// ─────────────────────────────────────────────────────────────────────────────

type AnyAgentTool = AgentTool<TSchema, unknown>;

/**
 * Registry of available specialized agents.
 */
export interface AgentRegistry {
  inbox_manager: {
    config: InboxManagerAgent;
    createTool: () => AnyAgentTool;
  };
  scheduler: {
    config: SchedulerAgent;
    createTool: (config?: Partial<SchedulerAgentConfig>) => AnyAgentTool;
    createTools: (config?: Partial<SchedulerAgentConfig>) => AnyAgentTool[];
  };
  research_assistant: {
    config: typeof ResearchAssistantConfig;
    createTool: () => AnyAgentTool;
    createTools: () => AnyAgentTool[];
  };
  task_coordinator: {
    config: TaskCoordinatorAgent;
    createTool: () => AnyAgentTool;
    utilities: {
      getAllTasks: typeof getAllTasks;
      getTask: typeof getTask;
      clearTasks: typeof clearTasks;
      importTasks: typeof importTasks;
    };
  };
}

/**
 * The agent registry providing access to all specialized agents.
 */
export const agentRegistry: AgentRegistry = {
  inbox_manager: {
    config: inboxManagerAgent,
    createTool: createInboxManagerTool,
  },
  scheduler: {
    config: schedulerAgent,
    createTool: createSchedulerTool,
    createTools: createSchedulerTools,
  },
  research_assistant: {
    config: ResearchAssistantConfig,
    createTool: createResearchAssistantTool,
    createTools: createResearchAssistantTools,
  },
  task_coordinator: {
    config: taskCoordinatorAgent,
    createTool: createTaskCoordinatorTool,
    utilities: {
      getAllTasks,
      getTask,
      clearTasks,
      importTasks,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Capability Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capability definitions for each agent type.
 */
export const agentCapabilities: Record<SpecializedAgentType, AgentCapability[]> = {
  inbox_manager: [
    { domain: "email", actions: ["triage", "summarize", "categorize", "suggest_response"], priority: 1 },
    { domain: "messaging", actions: ["triage", "summarize", "categorize"], priority: 2 },
  ],
  scheduler: [
    { domain: "calendar", actions: ["find_time", "create_event", "resolve_conflict"], priority: 1 },
    { domain: "scheduling", actions: ["schedule_meeting", "analyze_availability"], priority: 1 },
  ],
  research_assistant: [
    { domain: "research", actions: ["research_topic", "synthesize", "create_briefing"], priority: 1 },
    { domain: "documents", actions: ["analyze_document", "extract_facts"], priority: 1 },
    { domain: "memory", actions: ["track_topic", "search_research"], priority: 2 },
  ],
  task_coordinator: [
    { domain: "tasks", actions: ["decompose_task", "track_progress", "aggregate_results"], priority: 1 },
    { domain: "coordination", actions: ["delegate", "check_deadlines"], priority: 1 },
  ],
  general: [
    { domain: "general", actions: ["*"], priority: 10 },
  ],
};

/**
 * Find the best agent for a given task based on requirements.
 */
export function matchAgentToTask(
  requirements: TaskRequirement[],
  availableAgents: SpecializedAgentType[] = ["inbox_manager", "scheduler", "research_assistant", "task_coordinator"]
): AgentMatch | null {
  const candidates: AgentMatch[] = [];

  for (const agentType of availableAgents) {
    const capabilities = agentCapabilities[agentType];
    if (!capabilities) continue;

    let score = 0;
    const matchedCapabilities: string[] = [];

    for (const req of requirements) {
      const matchingCap = capabilities.find(
        (cap) => cap.domain === req.domain && (cap.actions.includes(req.action) || cap.actions.includes("*"))
      );

      if (matchingCap) {
        const weight = req.weight ?? 1;
        const priorityBonus = (10 - matchingCap.priority) * 0.1;
        score += weight * (1 + priorityBonus);
        matchedCapabilities.push(`${req.domain}:${req.action}`);
      } else if (!req.optional) {
        // Required capability not found - agent cannot handle this task
        score = -1;
        break;
      }
    }

    if (score > 0) {
      candidates.push({
        agent: {
          id: agentType,
          type: agentType,
          name: agentType,
          description: "",
          capabilities,
          tools: [],
          status: "idle",
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        },
        score,
        matchedCapabilities,
        reason: `Matched ${matchedCapabilities.length}/${requirements.length} capabilities`,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Return the best match
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all orchestration tools for agent use.
 */
export function createOrchestrationTools(): AnyAgentTool[] {
  return [
    createInboxManagerTool(),
    createSchedulerTool(),
    createResearchAssistantTool(),
    createTaskCoordinatorTool(),
  ];
}

/**
 * Create tools for a specific agent type.
 */
export function createAgentTools(agentType: SpecializedAgentType): AnyAgentTool[] {
  switch (agentType) {
    case "inbox_manager":
      return [createInboxManagerTool()];
    case "scheduler":
      return createSchedulerTools();
    case "research_assistant":
      return createResearchAssistantTools();
    case "task_coordinator":
      return [createTaskCoordinatorTool()];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

// Core types
export type {
  Agent,
  AgentCapability,
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentHealthStatus,
  AgentMatch,
  AgentMessage,
  AgentTask,
  CapabilityDomain,
  OrchestratorStatus,
  RetryPolicy,
  RoutingDecision,
  SpecializedAgentType,
  TaskPriority,
  TaskRequirement,
  TaskStatus,
  Workflow,
  WorkflowStep,
};

// Inbox Manager types
export type {
  InboxManagerAgent,
  MessagePriority,
  MessageCategory,
  MessageSource,
  UnifiedMessage,
  TriagedMessage,
  MessageSummary,
  ResponseSuggestion,
};

// Scheduler types
export type {
  SchedulerAgent,
  SchedulerAgentConfig,
  ConflictInfo,
  AvailabilityAnalysis,
  SchedulingResult,
};

// Research Assistant types
export type {
  ResearchTopic,
  ResearchSource,
  ResearchFinding,
  ResearchBriefing,
  SynthesisResult,
};

// Task Coordinator types
export type {
  Task,
  SubTask,
  TaskDependency,
  TaskCoordinatorAgent,
  CoordinatorTaskStatus,
  CoordinatorTaskPriority,
  CoordinatorAgentType,
};

// Agent configs
export {
  inboxManagerAgent,
  schedulerAgent,
  ResearchAssistantConfig,
  taskCoordinatorAgent,
};

// Tool creators
export {
  createInboxManagerTool,
  createSchedulerTool,
  createSchedulerTools,
  createResearchAssistantTool,
  createResearchAssistantTools,
  createTaskCoordinatorTool,
};

// Task coordinator utilities
export {
  getAllTasks,
  getTask,
  clearTasks,
  importTasks,
};

export default createOrchestrationTools;
