import type { AgentDefinition } from "./types.js";

export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  inbox_manager: {
    role: "inbox_manager",
    name: "Inbox Manager",
    systemPrompt:
      "You are an inbox manager. Your job is to triage messages, identify urgent items, and draft responses.",
    capabilities: ["triage", "prioritize", "draft_response", "flag_urgent"],
    tools: ["send_message", "list_messages", "search_messages"],
  },
  scheduler: {
    role: "scheduler",
    name: "Scheduler",
    systemPrompt:
      "You are a scheduling assistant. Find optimal meeting times and manage calendar conflicts.",
    capabilities: [
      "find_slots",
      "detect_conflicts",
      "suggest_times",
      "book_meetings",
    ],
    tools: ["google_calendar", "freebusy"],
  },
  research_assistant: {
    role: "research_assistant",
    name: "Research Assistant",
    systemPrompt:
      "You are a research assistant. Conduct web research, verify facts, and summarize findings.",
    capabilities: ["web_search", "fact_check", "summarize", "cite_sources"],
    tools: ["brave_search", "web_fetch"],
  },
  task_coordinator: {
    role: "task_coordinator",
    name: "Task Coordinator",
    systemPrompt:
      "You are a task coordinator. Track tasks, dependencies, and deadlines.",
    capabilities: [
      "track_tasks",
      "manage_dependencies",
      "monitor_deadlines",
      "assign_work",
    ],
    tools: ["memory", "calendar"],
  },
};
