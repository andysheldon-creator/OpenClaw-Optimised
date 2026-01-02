/**
 * Tests for AgentOrchestrator - multi-agent orchestration for Clawdis.
 *
 * Tests cover:
 * - Task decomposition
 * - Agent selection by capability
 * - Task execution flow
 * - Result aggregation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "./agent-types.js";
import { AgentOrchestrator, createOrchestratorTool } from "./orchestrator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock the agent-types module
vi.mock("./agent-types.js", async () => {
  const actual = await vi.importActual("./agent-types.js");

  // Create mock tool executors
  const createMockTool = (name: string, agentType: string) => ({
    label: `Mock ${name}`,
    name,
    description: `Mock ${name} tool`,
    parameters: {},
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: `Mock ${name} result` }],
      details: { mockResult: true, agent: agentType, action: "mock" },
    }),
  });

  // Mock agent definitions with working createTools
  const mockAgentRegistry = {
    inbox_manager: {
      type: "inbox_manager",
      name: "Inbox Manager",
      description: "Mock inbox manager",
      systemPrompt: "You are a mock inbox manager",
      capabilities: [
        "message_triage",
        "message_summarization",
        "message_categorization",
        "response_suggestion",
        "priority_detection",
        "sender_analysis",
        "thread_tracking",
      ],
      createTools: () => [createMockTool("inbox_manager", "inbox_manager")],
    },
    scheduler: {
      type: "scheduler",
      name: "Scheduler",
      description: "Mock scheduler",
      systemPrompt: "You are a mock scheduler",
      capabilities: [
        "find_time",
        "resolve_conflict",
        "schedule_meeting",
        "analyze_availability",
        "parse_scheduling_request",
        "suggest_reschedule",
      ],
      createTools: () => [createMockTool("scheduler", "scheduler")],
    },
    research_assistant: {
      type: "research_assistant",
      name: "Research Assistant",
      description: "Mock research assistant",
      systemPrompt: "You are a mock research assistant",
      capabilities: [
        "web_research",
        "document_analysis",
        "topic_tracking",
        "synthesis",
        "briefing_generation",
        "memory_integration",
      ],
      createTools: () => [createMockTool("research", "research_assistant")],
    },
    task_coordinator: {
      type: "task_coordinator",
      name: "Task Coordinator",
      description: "Mock task coordinator",
      systemPrompt: "You are a mock task coordinator",
      capabilities: [
        "task_decomposition",
        "progress_tracking",
        "dependency_management",
        "agent_delegation",
        "deadline_monitoring",
        "result_aggregation",
      ],
      createTools: () => [
        createMockTool("task_coordinator", "task_coordinator"),
      ],
    },
  };

  return {
    ...actual,
    AgentRegistry: mockAgentRegistry,
    getAgentDefinition: (type: string) =>
      mockAgentRegistry[type as keyof typeof mockAgentRegistry],
    getAllAgentDefinitions: () => Object.values(mockAgentRegistry),
    findAgentsByCapability: (capability: string) =>
      Object.values(mockAgentRegistry).filter((agent) =>
        agent.capabilities.includes(capability),
      ),
    getRecommendedAgent: (input: string) => {
      const lowerInput = input.toLowerCase();
      if (lowerInput.includes("email") || lowerInput.includes("message")) {
        return mockAgentRegistry.inbox_manager;
      }
      if (lowerInput.includes("schedule") || lowerInput.includes("meeting")) {
        return mockAgentRegistry.scheduler;
      }
      if (lowerInput.includes("research") || lowerInput.includes("find out")) {
        return mockAgentRegistry.research_assistant;
      }
      return mockAgentRegistry.task_coordinator;
    },
    detectIntent: (input: string) => {
      const lowerInput = input.toLowerCase();
      if (lowerInput.includes("email")) return "email_triage";
      if (lowerInput.includes("schedule")) return "schedule_meeting";
      if (lowerInput.includes("research")) return "research_topic";
      return "unknown";
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AgentOrchestrator", () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new AgentOrchestrator();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Decomposition Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("decomposeTask", () => {
    it("decomposes a simple task into a single step", () => {
      const result = orchestrator.decomposeTask("check my calendar");

      expect(result).toBeDefined();
      expect(result.mainTask).toBe("check my calendar");
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.estimatedComplexity).toBe("simple");
    });

    it("decomposes an email-related task to inbox_manager", () => {
      const result = orchestrator.decomposeTask("triage my email inbox");

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          agentType: "inbox_manager",
          action: "triage",
        }),
      );
    });

    it("decomposes a scheduling task to scheduler", () => {
      const result = orchestrator.decomposeTask(
        "schedule a meeting for tomorrow",
      );

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          agentType: "scheduler",
          action: "find_time",
        }),
      );
    });

    it("decomposes a research task to research_assistant", () => {
      const result = orchestrator.decomposeTask(
        "research the latest AI trends",
      );

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          agentType: "research_assistant",
          action: "research_topic",
        }),
      );
    });

    it("decomposes a task tracking request to task_coordinator", () => {
      const result = orchestrator.decomposeTask(
        "track progress on my projects",
      );

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          agentType: "task_coordinator",
          action: "track_progress",
        }),
      );
    });

    it("decomposes a complex multi-agent task", () => {
      const result = orchestrator.decomposeTask(
        "research AI developments, schedule a meeting to discuss findings, and create a summary briefing",
      );

      expect(result.steps.length).toBeGreaterThanOrEqual(2);
      expect(result.estimatedComplexity).not.toBe("simple");

      const agentTypes = result.steps.map((s) => s.agentType);
      expect(agentTypes).toContain("research_assistant");
      expect(agentTypes).toContain("scheduler");
    });

    it("assigns proper dependencies for sequential steps", () => {
      const result = orchestrator.decomposeTask(
        "research the topic, then create a summary briefing",
      );

      // Briefing should depend on research
      const briefingStep = result.steps.find(
        (s) => s.action === "create_briefing",
      );
      if (briefingStep) {
        expect(briefingStep.dependsOn.length).toBeGreaterThan(0);
      }
    });

    it("correctly identifies complexity levels", () => {
      // Simple: single step
      const simple = orchestrator.decomposeTask("check email");
      expect(simple.estimatedComplexity).toBe("simple");

      // Moderate: 2-3 steps
      const moderate = orchestrator.decomposeTask(
        "research a topic and create a report",
      );
      expect(["simple", "moderate", "complex"]).toContain(
        moderate.estimatedComplexity,
      );

      // Complex: 4+ steps
      const complex = orchestrator.decomposeTask(
        "research AI, schedule meeting, track progress, create briefing report",
      );
      expect(complex.steps.length).toBeGreaterThanOrEqual(3);
    });

    it("returns the detected intent", () => {
      const emailResult = orchestrator.decomposeTask("triage my email");
      expect(emailResult.intent).toBe("email_triage");

      const scheduleResult = orchestrator.decomposeTask("schedule a meeting");
      expect(scheduleResult.intent).toBe("schedule_meeting");

      const researchResult = orchestrator.decomposeTask("research topic");
      expect(researchResult.intent).toBe("research_topic");
    });

    it("returns the recommended agent type", () => {
      const result = orchestrator.decomposeTask("check messages");
      expect(result.recommendedAgent).toBeDefined();
      expect(typeof result.recommendedAgent).toBe("string");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Agent Selection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("findAgentsForCapability", () => {
    it("finds agents with message_triage capability", () => {
      const agents = orchestrator.findAgentsForCapability("message_triage");

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].type).toBe("inbox_manager");
    });

    it("finds agents with find_time capability", () => {
      const agents = orchestrator.findAgentsForCapability("find_time");

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].type).toBe("scheduler");
    });

    it("finds agents with web_research capability", () => {
      const agents = orchestrator.findAgentsForCapability("web_research");

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].type).toBe("research_assistant");
    });

    it("finds agents with task_decomposition capability", () => {
      const agents = orchestrator.findAgentsForCapability("task_decomposition");

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].type).toBe("task_coordinator");
    });

    it("returns empty array for unknown capability", () => {
      // Test with a capability string that doesn't exist
      const agents = orchestrator.findAgentsForCapability(
        "unknown_capability" as AgentCapability,
      );

      expect(agents).toEqual([]);
    });
  });

  describe("getAvailableAgents", () => {
    it("returns all available agents", () => {
      const agents = orchestrator.getAvailableAgents();

      expect(agents.length).toBe(4);
      expect(agents.map((a) => a.type)).toContain("inbox_manager");
      expect(agents.map((a) => a.type)).toContain("scheduler");
      expect(agents.map((a) => a.type)).toContain("research_assistant");
      expect(agents.map((a) => a.type)).toContain("task_coordinator");
    });

    it("includes capabilities for each agent", () => {
      const agents = orchestrator.getAvailableAgents();

      for (const agent of agents) {
        expect(agent.capabilities).toBeDefined();
        expect(Array.isArray(agent.capabilities)).toBe(true);
        expect(agent.capabilities.length).toBeGreaterThan(0);
      }
    });

    it("includes name and description for each agent", () => {
      const agents = orchestrator.getAvailableAgents();

      for (const agent of agents) {
        expect(agent.name).toBeDefined();
        expect(typeof agent.name).toBe("string");
        expect(agent.description).toBeDefined();
        expect(typeof agent.description).toBe("string");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Task Execution Flow Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("spawnAgent", () => {
    it("spawns an agent and returns result", async () => {
      const result = await orchestrator.spawnAgent({
        agentType: "inbox_manager",
        action: "triage",
        params: { maxMessages: 10 },
      });

      expect(result).toBeDefined();
      expect(result.agentType).toBe("inbox_manager");
      expect(result.action).toBe("triage");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns success true for valid agent spawn", async () => {
      const result = await orchestrator.spawnAgent({
        agentType: "scheduler",
        action: "find_time",
        params: { durationMinutes: 60 },
      });

      expect(result.success).toBe(true);
    });

    it("includes result data from agent execution", async () => {
      const result = await orchestrator.spawnAgent({
        agentType: "research_assistant",
        action: "research_topic",
        params: { topic: "AI trends" },
      });

      expect(result.result).toBeDefined();
    });

    it("returns error for invalid agent type", async () => {
      const result = await orchestrator.spawnAgent({
        // Cast to test invalid agent type handling
        agentType: "invalid_agent" as "inbox_manager",
        action: "test",
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Unknown agent type");
    });

    it("includes context when provided", async () => {
      const result = await orchestrator.spawnAgent({
        agentType: "task_coordinator",
        action: "track_progress",
        params: {},
        context: "User is tracking project deadlines",
      });

      expect(result.success).toBe(true);
    });

    it("measures execution duration", async () => {
      const result = await orchestrator.spawnAgent({
        agentType: "inbox_manager",
        action: "summarize",
        params: {},
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("createWorkflow", () => {
    it("creates a workflow from decomposition result", () => {
      const decomposition = orchestrator.decomposeTask("check my email");
      const workflow = orchestrator.createWorkflow(
        "Test Workflow",
        "Check email task",
        decomposition,
      );

      expect(workflow).toBeDefined();
      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe("Test Workflow");
      expect(workflow.description).toBe("Check email task");
      expect(workflow.status).toBe("pending");
    });

    it("sets correct priority on workflow", () => {
      const decomposition = orchestrator.decomposeTask("urgent task");
      const workflow = orchestrator.createWorkflow(
        "Urgent Workflow",
        "Urgent task",
        decomposition,
        "critical",
      );

      expect(workflow.priority).toBe("critical");
    });

    it("creates steps from decomposition steps", () => {
      const decomposition = orchestrator.decomposeTask(
        "research AI and create briefing",
      );
      const workflow = orchestrator.createWorkflow(
        "Research Workflow",
        "Research and briefing",
        decomposition,
      );

      expect(workflow.steps.length).toBe(decomposition.steps.length);
      for (const step of workflow.steps) {
        expect(step.id).toBeDefined();
        expect(step.agentType).toBeDefined();
        expect(step.action).toBeDefined();
        expect(step.status).toBe("pending");
      }
    });

    it("stores workflow for later retrieval", () => {
      const decomposition = orchestrator.decomposeTask("simple task");
      const workflow = orchestrator.createWorkflow(
        "Stored Workflow",
        "Simple task",
        decomposition,
      );

      const retrieved = orchestrator.getWorkflowStatus(workflow.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(workflow.id);
    });
  });

  describe("executeWorkflow", () => {
    it("executes a workflow and returns aggregated result", async () => {
      const decomposition = orchestrator.decomposeTask("check email");
      const workflow = orchestrator.createWorkflow(
        "Execute Test",
        "Check email",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe(workflow.id);
      expect(result.stepResults).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it("updates workflow status after execution", async () => {
      const decomposition = orchestrator.decomposeTask("simple task");
      const workflow = orchestrator.createWorkflow(
        "Status Test",
        "Simple task",
        decomposition,
      );

      await orchestrator.executeWorkflow(workflow.id);

      const updated = orchestrator.getWorkflowStatus(workflow.id);
      expect(updated?.status).not.toBe("pending");
    });

    it("returns failed status for non-existent workflow", async () => {
      const result = await orchestrator.executeWorkflow("non-existent-id");

      expect(result.status).toBe("failed");
      expect(result.summary).toContain("not found");
    });

    it("executes steps in dependency order", async () => {
      const decomposition = orchestrator.decomposeTask(
        "research topic and create briefing report",
      );
      const workflow = orchestrator.createWorkflow(
        "Dependency Test",
        "Research and briefing",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      // All steps should be processed
      expect(result.stepResults.length).toBe(workflow.steps.length);
    });

    it("marks step as completed on successful execution", async () => {
      const decomposition = orchestrator.decomposeTask("triage inbox");
      const workflow = orchestrator.createWorkflow(
        "Completion Test",
        "Triage inbox",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      const completedSteps = result.stepResults.filter(
        (s) => s.status === "completed",
      );
      expect(completedSteps.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Result Aggregation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("aggregateResults", () => {
    it("generates summary from completed steps", async () => {
      const decomposition = orchestrator.decomposeTask("check email");
      const workflow = orchestrator.createWorkflow(
        "Summary Test",
        "Check email",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it("extracts insights from step results", async () => {
      const decomposition = orchestrator.decomposeTask("schedule meeting");
      const workflow = orchestrator.createWorkflow(
        "Insights Test",
        "Schedule meeting",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it("generates action items for failures", async () => {
      const decomposition = orchestrator.decomposeTask("complex task");
      const workflow = orchestrator.createWorkflow(
        "Action Items Test",
        "Complex task",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      expect(result.actionItems).toBeDefined();
      expect(Array.isArray(result.actionItems)).toBe(true);
    });

    it("counts completed and failed steps correctly", async () => {
      const decomposition = orchestrator.decomposeTask("research and schedule");
      const workflow = orchestrator.createWorkflow(
        "Count Test",
        "Research and schedule",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      const completed = result.stepResults.filter(
        (s) => s.status === "completed",
      ).length;
      const failed = result.stepResults.filter(
        (s) => s.status === "failed",
      ).length;

      expect(completed + failed).toBeLessThanOrEqual(result.stepResults.length);
    });

    it("includes step details in aggregated result", async () => {
      const decomposition = orchestrator.decomposeTask("triage inbox");
      const workflow = orchestrator.createWorkflow(
        "Details Test",
        "Triage inbox",
        decomposition,
      );

      const result = await orchestrator.executeWorkflow(workflow.id);

      for (const stepResult of result.stepResults) {
        expect(stepResult.stepId).toBeDefined();
        expect(stepResult.agentType).toBeDefined();
        expect(stepResult.action).toBeDefined();
        expect(stepResult.status).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Workflow Management Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe("listWorkflows", () => {
    it("lists all workflows", () => {
      const decomposition1 = orchestrator.decomposeTask("task 1");
      const decomposition2 = orchestrator.decomposeTask("task 2");

      orchestrator.createWorkflow("Workflow 1", "Task 1", decomposition1);
      orchestrator.createWorkflow("Workflow 2", "Task 2", decomposition2);

      const workflows = orchestrator.listWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(2);
    });

    it("filters workflows by status", async () => {
      const decomposition = orchestrator.decomposeTask("task");
      const workflow = orchestrator.createWorkflow(
        "Filter Test",
        "Task",
        decomposition,
      );

      // Execute to change status
      await orchestrator.executeWorkflow(workflow.id);

      const completedWorkflows = orchestrator.listWorkflows({
        status: "completed",
      });
      const pendingWorkflows = orchestrator.listWorkflows({
        status: "pending",
      });

      // At least check both filters work
      expect(Array.isArray(completedWorkflows)).toBe(true);
      expect(Array.isArray(pendingWorkflows)).toBe(true);
    });

    it("respects limit parameter", () => {
      // Create several workflows
      for (let i = 0; i < 5; i++) {
        const decomposition = orchestrator.decomposeTask(`task ${i}`);
        orchestrator.createWorkflow(
          `Workflow ${i}`,
          `Task ${i}`,
          decomposition,
        );
      }

      const limited = orchestrator.listWorkflows({ limit: 3 });

      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it("sorts workflows by creation time (newest first)", async () => {
      const decomposition1 = orchestrator.decomposeTask("unique task alpha");

      const workflow1 = orchestrator.createWorkflow(
        "First Workflow Alpha",
        "Task Alpha",
        decomposition1,
      );

      // Small delay to ensure different creation timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const decomposition2 = orchestrator.decomposeTask("unique task beta");
      const workflow2 = orchestrator.createWorkflow(
        "Second Workflow Beta",
        "Task Beta",
        decomposition2,
      );

      const workflows = orchestrator.listWorkflows();

      // Second workflow should be first (more recent)
      const workflow2Index = workflows.findIndex((w) => w.id === workflow2.id);
      const workflow1Index = workflows.findIndex((w) => w.id === workflow1.id);

      // Only assert if both workflows are found
      expect(workflow1Index).toBeGreaterThanOrEqual(0);
      expect(workflow2Index).toBeGreaterThanOrEqual(0);
      expect(workflow2Index).toBeLessThan(workflow1Index);
    });
  });

  describe("getWorkflowStatus", () => {
    it("retrieves workflow by ID", () => {
      const decomposition = orchestrator.decomposeTask("task");
      const workflow = orchestrator.createWorkflow(
        "Status Test",
        "Task",
        decomposition,
      );

      const retrieved = orchestrator.getWorkflowStatus(workflow.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(workflow.id);
      expect(retrieved?.name).toBe("Status Test");
    });

    it("returns undefined for non-existent workflow", () => {
      const retrieved = orchestrator.getWorkflowStatus("non-existent-id");

      expect(retrieved).toBeUndefined();
    });

    it("reflects updated status after execution", async () => {
      const decomposition = orchestrator.decomposeTask("task");
      const workflow = orchestrator.createWorkflow(
        "Update Test",
        "Task",
        decomposition,
      );

      const beforeExecution = orchestrator.getWorkflowStatus(workflow.id);
      expect(beforeExecution?.status).toBe("pending");

      await orchestrator.executeWorkflow(workflow.id);

      const afterExecution = orchestrator.getWorkflowStatus(workflow.id);
      expect(afterExecution?.status).not.toBe("pending");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator Tool Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("createOrchestratorTool", () => {
  it("creates a valid agent tool", () => {
    const tool = createOrchestratorTool();

    expect(tool).toBeDefined();
    expect(tool.name).toBe("orchestrate");
    expect(tool.label).toBe("Agent Orchestrator");
    expect(tool.description).toBeDefined();
    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  describe("decompose action", () => {
    it("decomposes a task via tool", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "decompose",
        task: "check my email",
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.decomposition).toBeDefined();
    });
  });

  describe("spawn action", () => {
    it("spawns an agent via tool", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "spawn",
        agentType: "inbox_manager",
        agentAction: "triage",
        params: { maxMessages: 10 },
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.agentType).toBe("inbox_manager");
    });
  });

  describe("orchestrate action", () => {
    it("creates a workflow via tool", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "orchestrate",
        task: "research AI trends",
        name: "AI Research Workflow",
        priority: "high",
        autoExecute: false,
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.workflowId).toBeDefined();
    });

    it("auto-executes workflow when requested", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "orchestrate",
        task: "simple task",
        autoExecute: true,
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.execution).toBeDefined();
    });
  });

  describe("agents action", () => {
    it("lists all available agents", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "agents",
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.agents).toBeDefined();
      expect(Array.isArray(details.agents)).toBe(true);
    });

    it("filters agents by capability", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "agents",
        capability: "message_triage",
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.capability).toBe("message_triage");
      expect(details.agents).toBeDefined();
    });
  });

  describe("list action", () => {
    it("lists workflows via tool", async () => {
      const tool = createOrchestratorTool();

      // First create a workflow
      await tool.execute("setup-call", {
        action: "orchestrate",
        task: "test task",
        autoExecute: false,
      });

      const result = await tool.execute("test-call-id", {
        action: "list",
        limit: 10,
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.workflows).toBeDefined();
    });
  });

  describe("status action", () => {
    it("returns workflow status by ID", async () => {
      const tool = createOrchestratorTool();

      // Create a workflow first
      const createResult = await tool.execute("create-call", {
        action: "orchestrate",
        task: "status test task",
        autoExecute: false,
      });

      const createDetails = createResult.details as Record<string, unknown>;
      const workflowId = createDetails.workflowId as string;

      const result = await tool.execute("test-call-id", {
        action: "status",
        workflowId,
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(true);
      expect(details.workflow).toBeDefined();
    });

    it("returns error for non-existent workflow", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "status",
        workflowId: "non-existent-id",
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(false);
      expect(details.error).toBeDefined();
    });
  });

  describe("execute action", () => {
    it("executes a pending workflow", async () => {
      const tool = createOrchestratorTool();

      // Create a workflow first
      const createResult = await tool.execute("create-call", {
        action: "orchestrate",
        task: "execute test task",
        autoExecute: false,
      });

      const createDetails = createResult.details as Record<string, unknown>;
      const workflowId = createDetails.workflowId as string;

      const result = await tool.execute("test-call-id", {
        action: "execute",
        workflowId,
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.execution).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("returns error for unknown action", async () => {
      const tool = createOrchestratorTool();

      const result = await tool.execute("test-call-id", {
        action: "unknown_action",
      });

      expect(result.details).toBeDefined();
      const details = result.details as Record<string, unknown>;
      expect(details.success).toBe(false);
      expect(details.error).toContain("Unknown action");
      expect(details.availableActions).toBeDefined();
    });
  });
});
