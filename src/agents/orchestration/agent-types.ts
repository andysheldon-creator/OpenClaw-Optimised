/**
 * Unified agent type definitions for multi-agent orchestration in Clawdis.
 *
 * This module defines the core types and configurations for specialized agents
 * that can be spawned by the AgentOrchestrator for complex task handling.
 */

import type { AgentTool } from "@mariozechner/pi-ai";
import type { TSchema } from "@sinclair/typebox";

// ─────────────────────────────────────────────────────────────────────────────
// Core Type Aliases
// ─────────────────────────────────────────────────────────────────────────────

export type AnyAgentTool = AgentTool<TSchema, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Agent Capability Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categories of capabilities that agents can have.
 */
export type AgentCapability =
  // Inbox Manager capabilities
  | "message_triage"
  | "message_summarization"
  | "message_categorization"
  | "response_suggestion"
  | "priority_detection"
  | "sender_analysis"
  | "thread_tracking"
  // Scheduler capabilities
  | "find_time"
  | "resolve_conflict"
  | "schedule_meeting"
  | "analyze_availability"
  | "parse_scheduling_request"
  | "suggest_reschedule"
  // Research Assistant capabilities
  | "web_research"
  | "document_analysis"
  | "topic_tracking"
  | "synthesis"
  | "briefing_generation"
  | "memory_integration"
  // Task Coordinator capabilities
  | "task_decomposition"
  | "progress_tracking"
  | "dependency_management"
  | "agent_delegation"
  | "deadline_monitoring"
  | "result_aggregation";

/**
 * Unique identifiers for each specialized agent type.
 */
export type SpecializedAgentType =
  | "inbox_manager"
  | "scheduler"
  | "research_assistant"
  | "task_coordinator";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Definition Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete definition of a specialized agent including its capabilities,
 * system prompt, and available tools.
 */
export interface AgentDefinition {
  /** Unique identifier for this agent type */
  type: SpecializedAgentType;
  /** Human-readable name */
  name: string;
  /** Detailed description of the agent's purpose */
  description: string;
  /** System prompt that shapes the agent's behavior */
  systemPrompt: string;
  /** List of capabilities this agent provides */
  capabilities: AgentCapability[];
  /** Factory function to create the agent's tools */
  createTools: () => AnyAgentTool[];
  /** Optional configuration for the agent */
  config?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent System Prompts
// ─────────────────────────────────────────────────────────────────────────────

const INBOX_MANAGER_SYSTEM_PROMPT = `You are the Inbox Manager, a specialized agent within the Clawdis Hive Mind.

Your primary responsibilities:
1. Triage incoming messages across Gmail and WhatsApp
2. Categorize messages by priority (urgent, high, normal, low) and type (work, personal, promotional, etc.)
3. Identify messages requiring immediate attention
4. Draft and suggest responses based on context and user preferences
5. Track conversation threads and flag follow-ups needed

When analyzing messages:
- Consider sender importance (check memory for VIP contacts)
- Detect urgency signals in subject/content
- Note deadlines or time-sensitive requests
- Identify actionable items

When suggesting responses:
- Match the tone of the conversation
- Consider the relationship with the sender
- Keep responses concise but complete
- Offer multiple response options when appropriate

Always prioritize user time by surfacing what matters most.`;

const SCHEDULER_SYSTEM_PROMPT = `You are the Scheduler, a specialized agent within the Clawdis Hive Mind.

Your primary responsibilities:
1. Find optimal meeting times across multiple participants
2. Resolve calendar conflicts intelligently
3. Parse natural language scheduling requests
4. Analyze availability patterns
5. Suggest rescheduling options when conflicts arise

When scheduling:
- Respect working hours (default 9am-5pm, configurable)
- Account for timezone differences
- Consider buffer time between meetings
- Prefer times that minimize calendar fragmentation
- Honor user preferences (morning vs afternoon person)

When resolving conflicts:
- Identify which events are flexible vs fixed
- Consider event priority and importance
- Suggest specific alternative times
- Explain trade-offs clearly

When parsing requests:
- Handle relative dates ("tomorrow", "next week")
- Understand duration specifications ("30 minutes", "1 hour")
- Recognize recurring patterns ("every Tuesday")
- Ask for clarification when ambiguous

Always aim to maximize productivity while respecting personal time.`;

const RESEARCH_ASSISTANT_SYSTEM_PROMPT = `You are the Research Assistant, a specialized agent within the Clawdis Hive Mind.

Your primary responsibilities:
1. Conduct thorough web research on requested topics
2. Analyze and extract key information from documents
3. Track research topics over time using memory
4. Synthesize information from multiple sources
5. Generate clear, actionable briefings

Research methodology:
- Start with broad searches, then narrow down
- Cross-reference multiple sources for accuracy
- Note source reliability (academic, news, blog, etc.)
- Track confidence levels for findings
- Identify gaps in available information

When analyzing documents:
- Extract key facts and figures
- Identify main themes and arguments
- Note any biases or limitations
- Summarize for different audience levels

When synthesizing:
- Combine complementary information
- Flag contradictions between sources
- Weight sources by reliability
- Present balanced conclusions

When creating briefings:
- Lead with executive summary
- Support claims with evidence
- Include actionable recommendations
- Cite sources appropriately

Always maintain intellectual honesty about uncertainty and limitations.`;

const TASK_COORDINATOR_SYSTEM_PROMPT = `You are the Task Coordinator, a specialized agent within the Clawdis Hive Mind.

Your primary responsibilities:
1. Break down complex tasks into manageable subtasks
2. Track task progress and dependencies
3. Delegate tasks to appropriate specialist agents
4. Monitor deadlines and send proactive reminders
5. Aggregate results from multiple agents

When decomposing tasks:
- Identify natural subtask boundaries
- Map dependencies between subtasks
- Estimate time requirements
- Assign appropriate priority levels
- Consider which agent type is best suited for each subtask

When tracking progress:
- Maintain clear status visibility
- Identify blockers early
- Calculate completion percentages
- Provide progress updates proactively

When delegating:
- Match tasks to agent capabilities
- Provide clear context and instructions
- Set expectations for deliverables
- Monitor for completion

When managing deadlines:
- Track all time-sensitive tasks
- Send reminders before deadlines
- Escalate overdue items
- Suggest timeline adjustments when needed

Always keep the user informed of progress and any issues that require attention.`;

// ─────────────────────────────────────────────────────────────────────────────
// Agent Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inbox Manager agent definition.
 * Handles email/message triage, categorization, and response suggestions.
 */
export const InboxManagerDefinition: AgentDefinition = {
  type: "inbox_manager",
  name: "Inbox Manager",
  description:
    "Triages messages, flags important items, categorizes by priority/type, and drafts response suggestions across Gmail and WhatsApp.",
  systemPrompt: INBOX_MANAGER_SYSTEM_PROMPT,
  capabilities: [
    "message_triage",
    "message_summarization",
    "message_categorization",
    "response_suggestion",
    "priority_detection",
    "sender_analysis",
    "thread_tracking",
  ],
  createTools: () => {
    // Lazy import to avoid circular dependencies
    const { createInboxManagerTool } = require("./inbox-manager.js");
    return [createInboxManagerTool()];
  },
  config: {
    defaultPriority: "normal",
    urgentKeywords: ["urgent", "asap", "emergency", "critical"],
    workCategories: ["meeting", "project", "deadline", "invoice"],
  },
};

/**
 * Scheduler agent definition.
 * Handles calendar management, meeting scheduling, and conflict resolution.
 */
export const SchedulerDefinition: AgentDefinition = {
  type: "scheduler",
  name: "Scheduler",
  description:
    "Finds optimal meeting times, manages calendar conflicts, parses natural language scheduling requests, and analyzes availability patterns.",
  systemPrompt: SCHEDULER_SYSTEM_PROMPT,
  capabilities: [
    "find_time",
    "resolve_conflict",
    "schedule_meeting",
    "analyze_availability",
    "parse_scheduling_request",
    "suggest_reschedule",
  ],
  createTools: () => {
    const { createSchedulerTool } = require("./scheduler.js");
    return [createSchedulerTool()];
  },
  config: {
    defaultTimezone: "Europe/Vienna",
    defaultDurationMinutes: 60,
    workingHoursStart: 9,
    workingHoursEnd: 17,
    skipWeekends: true,
    bufferMinutes: 15,
  },
};

/**
 * Research Assistant agent definition.
 * Handles web research, document analysis, and briefing generation.
 */
export const ResearchAssistantDefinition: AgentDefinition = {
  type: "research_assistant",
  name: "Research Assistant",
  description:
    "Conducts web research, analyzes documents, tracks research topics, synthesizes information from multiple sources, and generates briefings.",
  systemPrompt: RESEARCH_ASSISTANT_SYSTEM_PROMPT,
  capabilities: [
    "web_research",
    "document_analysis",
    "topic_tracking",
    "synthesis",
    "briefing_generation",
    "memory_integration",
  ],
  createTools: () => {
    const { createResearchAssistantTool } = require("./research-assistant.js");
    return [createResearchAssistantTool()];
  },
  config: {
    maxSourcesPerTopic: 20,
    maxFindingsPerTopic: 50,
    defaultReliability: "unknown",
    synthesisMinSources: 2,
  },
};

/**
 * Task Coordinator agent definition.
 * Handles task decomposition, progress tracking, and multi-agent delegation.
 */
export const TaskCoordinatorDefinition: AgentDefinition = {
  type: "task_coordinator",
  name: "Task Coordinator",
  description:
    "Breaks down complex tasks into subtasks, tracks progress and dependencies, delegates to specialist agents, monitors deadlines, and aggregates results.",
  systemPrompt: TASK_COORDINATOR_SYSTEM_PROMPT,
  capabilities: [
    "task_decomposition",
    "progress_tracking",
    "dependency_management",
    "agent_delegation",
    "deadline_monitoring",
    "result_aggregation",
  ],
  createTools: () => {
    const { createTaskCoordinatorTool } = require("./task-coordinator.js");
    return [createTaskCoordinatorTool()];
  },
  config: {
    defaultPriority: "medium",
    defaultHoursAhead: 24,
    maxTasksPerCoordination: 50,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of all available specialized agents.
 */
export const AgentRegistry: Record<SpecializedAgentType, AgentDefinition> = {
  inbox_manager: InboxManagerDefinition,
  scheduler: SchedulerDefinition,
  research_assistant: ResearchAssistantDefinition,
  task_coordinator: TaskCoordinatorDefinition,
};

/**
 * Get an agent definition by type.
 */
export function getAgentDefinition(
  type: SpecializedAgentType,
): AgentDefinition | undefined {
  return AgentRegistry[type];
}

/**
 * Get all registered agent definitions.
 */
export function getAllAgentDefinitions(): AgentDefinition[] {
  return Object.values(AgentRegistry);
}

/**
 * Find agents that have a specific capability.
 */
export function findAgentsByCapability(
  capability: AgentCapability,
): AgentDefinition[] {
  return getAllAgentDefinitions().filter((agent) =>
    agent.capabilities.includes(capability),
  );
}

/**
 * Get a list of all available agent types.
 */
export function getAvailableAgentTypes(): SpecializedAgentType[] {
  return Object.keys(AgentRegistry) as SpecializedAgentType[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Routing Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task intent detected from user input.
 */
export type TaskIntent =
  | "email_triage"
  | "schedule_meeting"
  | "find_time"
  | "research_topic"
  | "analyze_document"
  | "track_tasks"
  | "delegate_work"
  | "check_deadlines"
  | "generate_report"
  | "unknown";

/**
 * Mapping of task intents to the most appropriate agent type.
 */
export const IntentToAgentMap: Record<TaskIntent, SpecializedAgentType> = {
  email_triage: "inbox_manager",
  schedule_meeting: "scheduler",
  find_time: "scheduler",
  research_topic: "research_assistant",
  analyze_document: "research_assistant",
  track_tasks: "task_coordinator",
  delegate_work: "task_coordinator",
  check_deadlines: "task_coordinator",
  generate_report: "research_assistant",
  unknown: "task_coordinator", // Default to coordinator for routing
};

/**
 * Keywords that indicate specific intents.
 */
export const IntentKeywords: Record<TaskIntent, string[]> = {
  email_triage: [
    "email",
    "inbox",
    "messages",
    "unread",
    "triage",
    "prioritize",
    "sort",
  ],
  schedule_meeting: [
    "schedule",
    "meeting",
    "calendar",
    "book",
    "appointment",
    "arrange",
  ],
  find_time: [
    "find time",
    "available",
    "free slot",
    "when can",
    "availability",
  ],
  research_topic: [
    "research",
    "find out",
    "investigate",
    "look into",
    "learn about",
  ],
  analyze_document: [
    "analyze",
    "review document",
    "summarize",
    "extract",
    "read",
  ],
  track_tasks: ["tasks", "todo", "progress", "status", "track", "follow up"],
  delegate_work: ["delegate", "assign", "hand off", "distribute"],
  check_deadlines: ["deadline", "due date", "overdue", "upcoming"],
  generate_report: ["report", "briefing", "summary", "overview"],
  unknown: [],
};

/**
 * Detect the most likely intent from user input.
 */
export function detectIntent(input: string): TaskIntent {
  const lowerInput = input.toLowerCase();

  for (const [intent, keywords] of Object.entries(IntentKeywords)) {
    if (intent === "unknown") continue;
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword)) {
        return intent as TaskIntent;
      }
    }
  }

  return "unknown";
}

/**
 * Get the recommended agent for a given input.
 */
export function getRecommendedAgent(input: string): AgentDefinition {
  const intent = detectIntent(input);
  const agentType = IntentToAgentMap[intent];
  return AgentRegistry[agentType];
}
