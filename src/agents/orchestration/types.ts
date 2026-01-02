/**
 * Core types for the Multi-Agent Orchestration System
 */

// ─────────────────────────────────────────────────────────────────────────────
// Agent Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Specialized agent types available in the orchestration system.
 */
export type SpecializedAgentType =
  | "inbox_manager"
  | "scheduler"
  | "research_assistant"
  | "task_coordinator"
  | "general";

/**
 * Capability domains that agents can operate in.
 */
export type CapabilityDomain =
  | "email"
  | "messaging"
  | "calendar"
  | "scheduling"
  | "research"
  | "documents"
  | "memory"
  | "tasks"
  | "coordination"
  | "general";

/**
 * Task priority levels.
 */
export type TaskPriority = "critical" | "high" | "medium" | "low";

/**
 * Task execution status.
 */
export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Capability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Describes a capability that an agent possesses.
 */
export interface AgentCapability {
  /** The domain this capability operates in */
  domain: CapabilityDomain;
  /** Actions the agent can perform in this domain */
  actions: string[];
  /** Priority for this capability (lower = higher priority) */
  priority: number;
}

/**
 * Requirements for a task that need to be matched to agent capabilities.
 */
export interface TaskRequirement {
  /** The domain required */
  domain: CapabilityDomain;
  /** The specific action required */
  action: string;
  /** Whether this requirement is optional */
  optional?: boolean;
  /** Weight for scoring (default: 1) */
  weight?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for creating an agent.
 */
export interface AgentConfig {
  /** Agent type */
  type: SpecializedAgentType;
  /** Human-readable name */
  name: string;
  /** Description of agent's purpose */
  description: string;
  /** Capabilities this agent provides */
  capabilities: AgentCapability[];
  /** Tool names this agent can use */
  tools: string[];
  /** Maximum concurrent tasks */
  maxConcurrentTasks?: number;
  /** Retry policy for failed tasks */
  retryPolicy?: RetryPolicy;
}

/**
 * Runtime agent instance.
 */
export interface Agent extends AgentConfig {
  /** Unique agent instance ID */
  id: string;
  /** Current agent status */
  status: "idle" | "busy" | "error" | "offline";
  /** Timestamp when agent was created */
  createdAt: number;
  /** Timestamp of last activity */
  lastActiveAt: number;
  /** Current tasks being processed */
  currentTasks?: string[];
  /** Health metrics */
  health?: AgentHealthStatus;
}

/**
 * Agent health status for monitoring.
 */
export interface AgentHealthStatus {
  /** Whether agent is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastCheck: number;
  /** Tasks completed successfully */
  tasksCompleted: number;
  /** Tasks that failed */
  tasksFailed: number;
  /** Average task duration in ms */
  avgTaskDuration: number;
  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Retry policy for failed tasks.
 */
export interface RetryPolicy {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay between retries in ms */
  baseDelay: number;
  /** Maximum delay between retries in ms */
  maxDelay: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of matching an agent to a task.
 */
export interface AgentMatch {
  /** The matched agent */
  agent: Agent;
  /** Match score (higher = better) */
  score: number;
  /** Capabilities that matched */
  matchedCapabilities: string[];
  /** Reason for the match */
  reason: string;
}

/**
 * Decision about which agent should handle a task.
 */
export interface RoutingDecision {
  /** Selected agent type */
  agentType: SpecializedAgentType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Alternative agents considered */
  alternatives: AgentMatch[];
  /** Reasoning for the decision */
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A task to be executed by an agent.
 */
export interface AgentTask {
  /** Unique task ID */
  id: string;
  /** Task type/action */
  type: string;
  /** Task description */
  description: string;
  /** Input parameters */
  input: Record<string, unknown>;
  /** Task priority */
  priority: TaskPriority;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent ID */
  assignedAgent?: string;
  /** Parent task ID (for subtasks) */
  parentTaskId?: string;
  /** Child task IDs */
  childTaskIds?: string[];
  /** Task dependencies (must complete before this task) */
  dependencies?: string[];
  /** Creation timestamp */
  createdAt: number;
  /** Start timestamp */
  startedAt?: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Task result */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Retry count */
  retryCount?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A workflow composed of multiple steps.
 */
export interface Workflow {
  /** Unique workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Current status */
  status: TaskStatus;
  /** Current step index */
  currentStep: number;
  /** Workflow context/state */
  context: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Completion timestamp */
  completedAt?: number;
}

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  /** Step ID */
  id: string;
  /** Step name */
  name: string;
  /** Agent type to execute this step */
  agentType: SpecializedAgentType;
  /** Action to perform */
  action: string;
  /** Input parameters (can reference context) */
  input: Record<string, unknown>;
  /** Output key in context */
  outputKey?: string;
  /** Condition for executing this step */
  condition?: string;
  /** Steps that must complete before this one */
  dependsOn?: string[];
  /** Whether this step can run in parallel */
  parallel?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Communication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message between agents.
 */
export interface AgentMessage {
  /** Message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID (or "broadcast") */
  to: string;
  /** Message type */
  type: "request" | "response" | "notification" | "error";
  /** Message topic */
  topic: string;
  /** Message payload */
  payload: unknown;
  /** Correlation ID for request/response */
  correlationId?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Event emitted by agents for coordination.
 */
export interface AgentEvent {
  /** Event type */
  type: string;
  /** Source agent ID */
  source: string;
  /** Event data */
  data: unknown;
  /** Timestamp */
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overall orchestrator status.
 */
export interface OrchestratorStatus {
  /** Whether orchestrator is running */
  running: boolean;
  /** Active agents */
  agents: Agent[];
  /** Pending tasks */
  pendingTasks: number;
  /** Running tasks */
  runningTasks: number;
  /** Completed tasks (recent) */
  completedTasks: number;
  /** Failed tasks (recent) */
  failedTasks: number;
  /** Active workflows */
  activeWorkflows: number;
  /** Uptime in ms */
  uptime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context passed to agents during task execution.
 */
export interface AgentContext {
  /** Current user information */
  user?: {
    id: string;
    name?: string;
    email?: string;
    timezone?: string;
  };
  /** Conversation/session context */
  session?: {
    id: string;
    startedAt: number;
    history?: AgentMessage[];
  };
  /** Shared memory/state */
  memory?: Record<string, unknown>;
  /** Available tools */
  tools?: string[];
  /** Configuration */
  config?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy types for backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRole =
  | "inbox_manager"
  | "scheduler"
  | "research_assistant"
  | "task_coordinator";

export interface AgentDefinition {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
}

export interface OrchestrationTask {
  id: string;
  description: string;
  assignedAgent?: AgentRole;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: unknown;
  createdAt: number;
  completedAt?: number;
}

export interface OrchestrationResult {
  taskId: string;
  success: boolean;
  results: unknown[];
  errors?: string[];
}
