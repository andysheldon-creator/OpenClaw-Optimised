# Execution Service Factsheet (v2)

**Status**: Architecture Redesign
**Last Updated**: 2025-02-04

---

## 1. Service Overview

### 1.1 Purpose

The Execution Service is the **core agent service** of the Multi-Agent System (MAS). It receives task-level goals, autonomously plans and executes work inside Docker containers using an LLM-in-a-loop architecture, and returns deliverables. The agent itself is the planner, executor, and evaluator — there is no separate orchestration service generating DAGs or managing FSMs.

A **thin Session Coordinator** handles concerns the agent cannot manage itself: user message routing, HITL injection, external event forwarding, pause/cancel control, and session concurrency.

### 1.2 Architecture Philosophy

This redesign follows the "third era" agent pattern (per Harrison Chase / LangChain):

| Era | Pattern | This Service |
|-----|---------|--------------|
| Era 1 | Chains / single prompts | — |
| Era 2 | Custom cognitive architectures, DAGs, FSMs, scaffolding | **Previous design** (Orchestration + Execution split) |
| Era 3 | LLM in a loop with tools + context engineering | **New design** |

**Core principle**: The algorithm is simple — run the LLM in a loop, let it decide what to do. Engineer the context, tools, and environment rather than encoding decision logic in code.

### 1.3 Core Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Task Execution** | Execute entire tasks (not subtasks) inside Docker containers using agent loops |
| **Planning** | Agent plans via a planning tool (in-context, not upfront DAG generation) |
| **Tool Orchestration** | Provide standardized tools (bash, read, write, edit, glob, grep, browser, web_search, web_fetch, plan, ask_user) |
| **Skills Discovery** | Enable agents to discover and use skill instructions (list_skills, read_skill) |
| **Sub-Agent Management** | Agent decides when to spawn sub-agents for context isolation |
| **Compaction** | Manage context window limits via summarization + pre-compaction memory flush |
| **File System Context** | Agent uses workspace files for notes, plans, and intermediate state |
| **Risk Control** | Classify action risk levels and enforce safety policies |
| **Result Packaging** | Package execution outputs, evidence, and deliverables |

### 1.4 What This Service Does NOT Do

| Not Responsible For | Belongs To |
|--------------------|------------|
| User message routing | Session Coordinator |
| Session concurrency control | Session Coordinator |
| Pause/cancel signal delivery | Session Coordinator |
| External event forwarding | Session Coordinator |
| HITL request/response routing | Session Coordinator |
| Memory storage | Context Service |
| UI rendering | UI Service |

### 1.5 What Was Removed (vs Previous Design)

The following components from the previous Orchestration Service are **eliminated**:

| Removed | Reason |
|---------|--------|
| Upfront DAG planning (SubtaskPlanGeneratingTask) | Agent plans incrementally via planning tool |
| SubtaskFSMState (9 states) | Conversation history IS the state |
| TaskLifecycleState (7 states) | Replaced by simple task status (running/completed/failed/paused/cancelled) |
| PostExecutionEvaluatingTask (8 action types) | Agent evaluates its own results in-loop |
| Delta-based plan updates (SubtaskPlanUpdatingTask) | Agent updates its plan naturally |
| TaskLevelVerifyingTask | Agent verifies its own work |
| 6 specialized taskchains, ~30 tasks, ~15 gateways | Replaced by agent loop + thin coordinator |
| Tiered context allocation (T1/T2/T3 budgets) | Agent manages context via file system + compaction |
| SubtaskContract, DependencyExpression, DecisionPoint | Agent decides dependencies and branching itself |
| RepairStrategySelectingTask | Agent retries and adapts in-loop |

---

## 2. Architecture Overview

### 2.1 System Architecture

```
                         ┌──────────────────────────────────────────────────┐
                         │              SESSION COORDINATOR                  │
                         │         (Thin routing + control layer)            │
                         │                                                   │
                         │  • Route user messages (new/continue/cancel)      │
                         │  • Inject HITL responses into agent context       │
                         │  • Forward external events as messages            │
                         │  • Enforce pause/cancel/timeout                   │
                         │  • Session concurrency limits                     │
                         └──────────────┬───────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              EXECUTION SERVICE                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐      │
│  │                         AGENT LOOP                                   │      │
│  │                                                                      │      │
│  │   while (true) {                                                     │      │
│  │     response = await llm.call(context, tools)                        │      │
│  │     if (response.hasToolCalls) {                                     │      │
│  │       results = await executeTools(response.toolCalls)               │      │
│  │       context.push(response, results)                                │      │
│  │     } else {                                                         │      │
│  │       break // agent produced final response                         │      │
│  │     }                                                                │      │
│  │     if (needsCompaction) await compactAndFlushMemory()               │      │
│  │     if (cancelled || paused || timeout) break                        │      │
│  │   }                                                                  │      │
│  │                                                                      │      │
│  │   Tools: bash, read, write, edit, glob, grep, browser,              │      │
│  │          web_search, web_fetch, update_plan, ask_user,              │      │
│  │          spawn_agent, list_skills, read_skill,                      │      │
│  │          save_memo, search_memo                                     │      │
│  │                                                                      │      │
│  │   ┌──────────────────────────────────────────────────────────┐      │      │
│  │   │              SUB-AGENTS (spawned by agent)                │      │      │
│  │   │                                                           │      │      │
│  │   │   Agent decides when to spawn for context isolation.      │      │      │
│  │   │   Each sub-agent: own context window, same tools,         │      │      │
│  │   │   shared workspace filesystem.                            │      │      │
│  │   │   Results passed back as text in parent context.          │      │      │
│  │   └──────────────────────────────────────────────────────────┘      │      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐      │
│  │                     CONTAINER MANAGER                                │      │
│  │                  (Docker per-task container)                          │      │
│  │                                                                      │      │
│  │   /workspace/           # Agent working directory (RW)               │      │
│  │   /workspace/.plan.md   # Current plan (planning tool output)        │      │
│  │   /workspace/.memo/     # Durable notes (survive compaction)         │      │
│  │   /workspace/.scratch/  # Temporary notes (may be compacted)         │      │
│  │   /workspace/output/    # Deliverables for user                      │      │
│  │   /skills/              # SKILL.md instruction files (RO)            │      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐      │
│  │                     COMPACTION ENGINE                                 │      │
│  │                                                                      │      │
│  │   1. Detect approaching context limit                                │      │
│  │   2. Memory flush: prompt agent to save notes to .memo/              │      │
│  │   3. Summarize older conversation turns                              │      │
│  │   4. Keep recent turns + tool results intact                         │      │
│  │   5. Agent recovers context via search_memo + file reads             │      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
         │                           │                            │
         ▼                           ▼                            ▼
┌────────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐
│ task-command    │    │   CONTEXT SERVICE   │    │ task-result              │
│ (Redis Stream)  │    │   (HTTP Client)     │    │ (Redis Stream)           │
└────────────────┘    └─────────────────────┘    └──────────────────────────┘
```

### 2.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent scope | Task-level (not subtask) | Agent plans and decomposes work itself |
| Planning | In-context planning tool | No upfront DAG; plan lives in conversation context and workspace file |
| State management | Conversation history + workspace files | No FSM; the context IS the state |
| Compaction | Pre-compaction memory flush + summarization | Inspired by OpenClaw's compaction-safeguard pattern |
| Sub-agents | Agent-initiated, not orchestration-scheduled | Agent decides when context isolation is needed |
| File system | Shared workspace per task | Context management, notes, deliverables — inspired by Chase's "file system pilled" insight |
| External input | Injected as messages into agent context | HITL responses, external events, user messages — all become context |
| Coordination | Thin Session Coordinator (separate) | Only handles what agents can't: routing, concurrency, control signals |

---

## 3. Session Coordinator (Thin Layer)

The Session Coordinator replaces the entire Orchestration Service. It is NOT an agent — it is a lightweight router and control plane.

### 3.1 Responsibilities

```typescript
class SessionCoordinator {
  /** Route incoming user message to the right agent session */
  async handleUserMessage(trigger: UserMessageTrigger): Promise<void>;

  /** Inject HITL response into the blocked agent's context */
  async handleHITLResponse(trigger: HITLResponseTrigger): Promise<void>;

  /** Forward external event as a message into agent context */
  async handleExternalEvent(trigger: ExternalEventTrigger): Promise<void>;

  /** Handle pause/resume/cancel commands */
  async handleTaskControl(trigger: TaskControlTrigger): Promise<void>;

  /** Route scheduled triggers (cron, deadline, monitoring timeout) */
  async handleScheduledTrigger(trigger: ScheduledTrigger): Promise<void>;
}
```

### 3.2 User Message Routing

The coordinator performs lightweight intent classification to decide how to handle a user message. This is the ONLY LLM call the coordinator makes.

```typescript
type RoutingDecision =
  | { type: 'new_task'; goal: string }
  | { type: 'inject_into_active'; task_id: string }
  | { type: 'cancel_task'; task_id: string; reason: string }
  | { type: 'pause_task'; task_id: string }
  | { type: 'resume_task'; task_id: string }
  | { type: 'small_talk'; response: string };
```

**Routing logic**:
- If no active task → `new_task`
- If active task and message is task-relevant → `inject_into_active` (steer the running agent)
- If user explicitly asks to stop/pause/cancel → `cancel_task` / `pause_task`
- If message is casual/off-topic → `small_talk` (respond directly, no agent needed)

**LLM Configuration for Router**:
- Temperature: 0.1
- Simple schema, ~50 line system prompt (not 120 lines)

### 3.3 Injection Pattern

All external inputs become messages in the agent's conversation context:

```typescript
interface AgentInjection {
  injection_type: 'user_message' | 'hitl_response' | 'external_event' | 'system_control';
  content: string;
  metadata?: Record<string, unknown>;
}
```

| Trigger | Injection |
|---------|-----------|
| User message (continue) | `{ type: 'user_message', content: "User says: ..." }` |
| HITL response | `{ type: 'hitl_response', content: "User responded to your question: ..." }` |
| External event | `{ type: 'external_event', content: "Event received: {payload}" }` |
| Resume from pause | `{ type: 'system_control', content: "Task resumed by user" }` |

The agent sees these as messages in its context and decides how to react. No gateways, no FSM transitions.

### 3.4 Session State (Coordinator-Level)

The coordinator maintains minimal session-level state. The agent's state is in its conversation history and workspace.

```typescript
interface SessionState {
  session_id: string;
  user_id: string;
  tasks: TaskEntry[];
  active_task_id?: string;
}

interface TaskEntry {
  task_id: string;
  goal_summary: string;
  status: TaskStatus;
  agent_session_id: string;
  container_id?: string;
  created_at: string;
  completed_at?: string;
  paused_at?: string;
  deadline?: string;
  deadline_action?: 'fail' | 'complete_partial' | 'pause_and_notify';
}

enum TaskStatus {
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
```

No FSM transition tables. Status changes are simple and direct:
- `RUNNING → PAUSED` (user pauses)
- `RUNNING → COMPLETED` (agent finishes)
- `RUNNING → FAILED` (agent fails / timeout / deadline)
- `RUNNING → CANCELLED` (user cancels)
- `PAUSED → RUNNING` (user resumes)
- `PAUSED → CANCELLED` (user cancels while paused)

### 3.5 Concurrency Control

```typescript
interface ConcurrencyConfig {
  max_concurrent_tasks_per_session: number;  // default: 3
  max_concurrent_sessions_per_user: number;  // default: 5
  session_lease_ttl_ms: number;              // default: 30000
}
```

Session lease is acquired before routing, released after injection. This prevents race conditions when multiple triggers arrive simultaneously for the same session.

### 3.6 Triggers

The coordinator consumes from the same Redis streams as before, but processing is dramatically simpler:

```typescript
type TriggerType =
  | 'user-message-received'
  | 'task-result-received'       // renamed from subtask-attempt-completed
  | 'hitl-response-received'
  | 'scheduled-trigger'
  | 'external-event-received'
  | 'task-control-received';
```

Each trigger is handled by a single method on the coordinator (see 3.1), not a taskchain with 10+ tasks and gateways.

---

## 4. Agent Loop (Core)

### 4.1 The Loop

This is the heart of the service. It replaces the previous Orchestration + Execution split.

```typescript
interface AgentLoopConfig {
  task_id: string;
  goal: string;
  context: TaskContext;           // from Context Service
  container: DockerContainer;
  tools: Tool[];
  risk_policy: RiskPolicy;
  model: string;
  max_iterations: number;        // default: 200
  timeout_ms: number;            // default: 600_000 (10 min)
  compaction_config: CompactionConfig;
}

interface AgentLoopResult {
  task_id: string;
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED_USER' | 'PAUSED' | 'CANCELLED';
  deliverables: Deliverable[];
  evidence_refs: EvidenceRef[];
  final_message?: string;
  working_memory: WorkingMemory;
  usage: UsageMetrics;
  error_details?: ErrorDetails;
}
```

### 4.2 Loop Pseudocode

```typescript
async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const messages: Message[] = buildInitialContext(config);
  let iteration = 0;

  while (iteration < config.max_iterations) {
    // Check external signals
    if (isCancelled(config.task_id)) return { status: 'CANCELLED', ... };
    if (isPaused(config.task_id))    return { status: 'PAUSED', ... };
    if (isTimedOut(config))          return { status: 'FAILED', error: 'timeout', ... };

    // Think: call LLM
    const response = await llm.call({
      model: config.model,
      messages,
      tools: formatToolsForLLM(config.tools),
    });

    // No tool calls = agent is done
    if (!response.tool_calls || response.tool_calls.length === 0) {
      messages.push({ role: 'assistant', content: response.content });
      return packageResult(config, messages, 'COMPLETED');
    }

    // Act: execute tool calls
    messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });

    for (const toolCall of response.tool_calls) {
      // Risk check
      const risk = classifyRisk(toolCall, config.risk_policy);
      if (risk === 'CRITICAL') {
        messages.push(toolResult(toolCall.id, 'DENIED: This action is not permitted.'));
        continue;
      }
      if (risk === 'HIGH') {
        // Trigger HITL via ask_user-like mechanism
        return { status: 'BLOCKED_USER', pendingAction: toolCall, ... };
      }

      // Execute
      const result = await executeToolInContainer(config.container, toolCall);
      messages.push(toolResult(toolCall.id, result));
    }

    // Check injected messages (user input, HITL responses, external events)
    const injections = await drainInjections(config.task_id);
    for (const injection of injections) {
      messages.push({ role: 'user', content: formatInjection(injection) });
    }

    // Compaction check
    if (shouldCompact(messages, config.compaction_config)) {
      messages = await compactWithMemoryFlush(messages, config);
    }

    iteration++;
  }

  return packageResult(config, messages, 'FAILED', 'max_iterations_exceeded');
}
```

### 4.3 Initial Context Construction

```typescript
function buildInitialContext(config: AgentLoopConfig): Message[] {
  return [
    {
      role: 'system',
      content: buildSystemPrompt(config),
    },
    {
      role: 'user',
      content: buildTaskMessage(config),
    },
  ];
}
```

The system prompt includes:
1. **Identity & role** (~20 lines)
2. **Available tools** (auto-generated from tool registry)
3. **Planning instructions** — how to use update_plan tool
4. **File system instructions** — workspace layout, when to write notes
5. **Compaction awareness** — "I may summarize older messages; important info should be saved to .memo/"
6. **Safety & risk rules** (~30 lines)
7. **Output format** — how to structure deliverables
8. **Skills** — discovered skills loaded into prompt or referenced via tools

The task message includes:
1. **Goal** (from user / coordinator)
2. **Constraints** (if any)
3. **Relevant memories** (from Context Service)
4. **Previous attempt context** (if resuming)

### 4.4 Injection Queue

External inputs are queued and drained each iteration:

```typescript
interface InjectionQueue {
  /** Push an injection for the agent to see on its next iteration */
  push(taskId: string, injection: AgentInjection): Promise<void>;

  /** Drain all pending injections (called each iteration) */
  drain(taskId: string): Promise<AgentInjection[]>;
}
```

Implementation: Redis list per task_id. Coordinator pushes, agent loop drains.

---

## 5. Planning Tool (Context Engineering)

### 5.1 Purpose

The planning tool is a **context engineering strategy** to keep the agent on track during long-running tasks. It is inspired by Claude Code's todo list tool, which Harrison Chase describes as "basically a no-op — it's just a context engineering strategy."

The tool writes the plan to a workspace file AND returns it as the tool result, ensuring the plan is always visible in the agent's context window.

### 5.2 Tool Definition

```typescript
const updatePlanTool: Tool = {
  name: 'update_plan',
  description: `Update your current execution plan. Call this tool:
- At the start of a task to create your initial plan
- After completing a step to mark progress
- When you discover new information that changes the approach
- Before spawning sub-agents to clarify task division

The plan helps you stay on track over long execution horizons.`,
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped'] },
            notes: { type: 'string', description: 'Optional notes, findings, or blockers' },
          },
          required: ['id', 'description', 'status'],
        },
      },
      current_focus: {
        type: 'string',
        description: 'What you are working on right now',
      },
      overall_approach: {
        type: 'string',
        description: 'High-level approach summary',
      },
    },
    required: ['steps'],
  },
};
```

### 5.3 Tool Execution

```typescript
async function executeUpdatePlan(params: PlanParams, container: Container): Promise<string> {
  // Write to workspace file (persists across compaction)
  const planContent = formatPlanAsMarkdown(params);
  await container.writeFile('/workspace/.plan.md', planContent);

  // Return the plan as tool result (keeps it in context)
  return `Plan updated (${params.steps.filter(s => s.status === 'done').length}/${params.steps.length} done).\n\n${planContent}`;
}

function formatPlanAsMarkdown(params: PlanParams): string {
  let md = `# Execution Plan\n\n`;
  if (params.overall_approach) md += `**Approach**: ${params.overall_approach}\n\n`;
  if (params.current_focus) md += `**Current focus**: ${params.current_focus}\n\n`;
  md += `## Steps\n\n`;
  for (const step of params.steps) {
    const icon = { pending: '[ ]', in_progress: '[>]', done: '[x]', blocked: '[!]', skipped: '[-]' }[step.status];
    md += `- ${icon} **${step.id}**: ${step.description}`;
    if (step.notes) md += ` — _${step.notes}_`;
    md += `\n`;
  }
  return md;
}
```

---

## 6. Compaction Engine

### 6.1 Purpose

Long-running agents accumulate context that exceeds the model's context window. The compaction engine manages this by:
1. Giving the agent a chance to save important information (memory flush)
2. Summarizing older conversation turns
3. Preserving recent turns intact

Inspired by OpenClaw's `compaction-safeguard.ts` and `memory-flush.ts`.

### 6.2 Configuration

```typescript
interface CompactionConfig {
  /** Context window size of the model (tokens) */
  context_window_tokens: number;

  /** Reserved tokens for the model's response */
  response_reserve_tokens: number;        // default: 4096

  /** Trigger compaction when usage exceeds this ratio */
  compaction_trigger_ratio: number;        // default: 0.85

  /** Enable pre-compaction memory flush */
  memory_flush_enabled: boolean;           // default: true

  /** Soft threshold: trigger flush this many tokens before compaction */
  memory_flush_soft_threshold_tokens: number;  // default: 4000

  /** Maximum summary length (tokens) */
  max_summary_tokens: number;              // default: 2000

  /** Number of recent turns to always preserve */
  preserve_recent_turns: number;           // default: 6
}
```

### 6.3 Compaction Flow

```
Token usage approaching limit?
        │
        ▼ YES
┌─────────────────────────────────────────────┐
│ PHASE 1: Memory Flush                        │
│                                              │
│ Inject a system message:                     │
│ "You are approaching context limits.         │
│  Save any important information to           │
│  /workspace/.memo/ before I summarize        │
│  older messages. Use save_memo tool."         │
│                                              │
│ Run 1-3 agent iterations for the flush.      │
│ Agent writes durable notes to .memo/ files.  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│ PHASE 2: Summarization                       │
│                                              │
│ 1. Split messages into:                      │
│    - Old turns (to summarize)                │
│    - Recent turns (to preserve)              │
│                                              │
│ 2. Chunk old turns by token budget           │
│    (adaptive chunk ratio based on avg size)  │
│                                              │
│ 3. For each chunk, generate summary via LLM: │
│    - Preserve tool failures and key findings │
│    - Include file paths modified              │
│    - Note decisions made and reasons          │
│                                              │
│ 4. Replace old turns with summary message    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│ PHASE 3: Reassembly                          │
│                                              │
│ New context:                                 │
│ [system prompt]                              │
│ [summary of older turns]                     │
│ [preserved recent turns]                     │
│                                              │
│ Agent continues from here.                   │
│ Can recover details via:                     │
│ - search_memo (semantic search over .memo/)  │
│ - read file from workspace                   │
└─────────────────────────────────────────────┘
```

### 6.4 Compaction Trigger Logic

```typescript
function shouldCompact(messages: Message[], config: CompactionConfig): boolean {
  const usedTokens = estimateTokens(messages);
  const availableTokens = config.context_window_tokens - config.response_reserve_tokens;
  return usedTokens / availableTokens > config.compaction_trigger_ratio;
}

function shouldFlushMemory(messages: Message[], config: CompactionConfig): boolean {
  if (!config.memory_flush_enabled) return false;
  const usedTokens = estimateTokens(messages);
  const threshold = config.context_window_tokens - config.response_reserve_tokens - config.memory_flush_soft_threshold_tokens;
  return usedTokens > threshold;
}
```

### 6.5 Summarization Strategy

```typescript
async function summarizeMessages(
  messages: Message[],
  config: CompactionConfig,
): Promise<string> {
  // Adaptive chunking: adjust chunk size based on average message size
  const avgTokensPerMessage = estimateTokens(messages) / messages.length;
  const chunkRatio = computeAdaptiveChunkRatio(avgTokensPerMessage);
  const chunkMaxTokens = Math.floor(config.max_summary_tokens * chunkRatio);

  const chunks = chunkMessagesByMaxTokens(messages, chunkMaxTokens);
  const summaries: string[] = [];

  for (const chunk of chunks) {
    const summary = await llm.call({
      model: config.summarization_model || 'fast-model',
      messages: [
        { role: 'system', content: SUMMARIZATION_PROMPT },
        { role: 'user', content: formatMessagesForSummary(chunk) },
      ],
    });
    summaries.push(summary.content);
  }

  return summaries.join('\n\n---\n\n');
}

const SUMMARIZATION_PROMPT = `Summarize this agent conversation segment. Preserve:
- Tool call failures and error messages (exact error text)
- File paths created, modified, or read
- Key decisions made and their reasoning
- Findings and factual information discovered
- Current state of the task plan
- Any user instructions or corrections received

Keep the summary concise but information-dense. Use bullet points.
Do NOT include raw file contents or full command outputs — summarize them.`;
```

---

## 7. File System Context Management

### 7.1 Workspace Layout

Every task gets an isolated workspace mounted into the Docker container:

```
/workspace/
├── .plan.md              # Current plan (written by update_plan tool)
├── .memo/                # Durable notes (survive compaction, agent reads via search_memo)
│   ├── findings.md       # Key discoveries
│   ├── decisions.md      # Decisions and reasoning
│   └── ...               # Agent creates as needed
├── .scratch/             # Temporary working files
├── output/               # Final deliverables
│   ├── report.md         # Example: generated report
│   ├── screenshot.png    # Example: evidence screenshot
│   └── ...
└── (task-specific files)  # Files the agent creates for the task
```

### 7.2 Memo Tools

```typescript
const saveMemoTool: Tool = {
  name: 'save_memo',
  description: `Save a note to your durable memo storage. Use this for:
- Important findings you might need later
- Decisions and their reasoning
- Key information that should survive context summarization
Notes are saved to /workspace/.memo/ and can be searched with search_memo.`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Name for the memo file (e.g., "api-findings.md")' },
      content: { type: 'string', description: 'Content to save' },
      append: { type: 'boolean', description: 'Append to existing file instead of overwriting', default: false },
    },
    required: ['filename', 'content'],
  },
};

const searchMemoTool: Tool = {
  name: 'search_memo',
  description: `Search your memo storage for previously saved notes. Use this to recall:
- Findings from earlier in the task
- Decisions you made and why
- Information that was saved before context summarization`,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (semantic search over memo contents)' },
    },
    required: ['query'],
  },
};
```

### 7.3 Context Recovery After Compaction

After compaction, the agent's context contains a summary + recent turns. If the agent needs details from before compaction:

1. **search_memo** — semantic search over `.memo/` files
2. **read** — direct file read from workspace (plans, scratch files, outputs)
3. **grep** — search workspace files for specific strings

This creates the tiered memory system:
- **Hot**: Current conversation context (recent turns)
- **Warm**: Compaction summary (compressed older turns)
- **Cold**: Workspace files (.memo/, .plan.md, task files)

---

## 8. Tool System

### 8.1 Complete Tool Inventory

| Tool | Description | Risk Level | Category |
|------|-------------|------------|----------|
| `bash` | Execute shell commands in container | MEDIUM-CRITICAL | Environment |
| `read` | Read file contents | LOW | File System |
| `write` | Write/create files | MEDIUM-HIGH | File System |
| `edit` | Edit files (diff-based) | LOW | File System |
| `glob` | File pattern matching | LOW | File System |
| `grep` | Search file contents | LOW | File System |
| `browser` | Browser automation (headless) | MEDIUM-HIGH | Environment |
| `web_search` | Search the web | MEDIUM | Information |
| `web_fetch` | Fetch URL content | MEDIUM | Information |
| `update_plan` | Update execution plan | LOW | Context Engineering |
| `save_memo` | Save durable notes | LOW | Context Engineering |
| `search_memo` | Search saved notes | LOW | Context Engineering |
| `ask_user` | Request user input (triggers HITL) | LOW | Communication |
| `spawn_agent` | Spawn sub-agent for isolated work | MEDIUM | Orchestration |
| `list_skills` | List available skills | LOW | Skills |
| `read_skill` | Read skill instructions | LOW | Skills |
| `publish_deliverable` | Mark a file as a deliverable | LOW | Output |

### 8.2 Tool Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TOOL SYSTEM                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ToolRegistry                                               │
│   ├── Stores all tool definitions                            │
│   ├── Formats tools for LLM (function calling schema)        │
│   └── Filters by risk policy                                 │
│                                                              │
│   ToolRunner                                                 │
│   ├── Validates parameters (Zod schemas)                     │
│   ├── Classifies risk before execution                       │
│   ├── Executes tools in container (or in-process)            │
│   ├── Handles retry for transient errors                     │
│   ├── Detects doom loops (repetitive failing calls)          │
│   ├── Truncates large outputs (configurable limit)           │
│   └── Records tool calls for observability                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 ask_user Tool (HITL Trigger)

When the agent calls `ask_user`, execution pauses and a HITL request is published:

```typescript
const askUserTool: Tool = {
  name: 'ask_user',
  description: `Ask the user a question. Use when you need:
- Clarification about ambiguous requirements
- Approval before a high-impact action
- A choice between multiple approaches
- Information only the user can provide

This will pause execution until the user responds.`,
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' }, description: 'Suggested options (optional)' },
      context: { type: 'string', description: 'Brief context for why you are asking' },
    },
    required: ['question'],
  },
};
```

**Execution flow**:
1. Agent calls `ask_user`
2. Agent loop returns `{ status: 'BLOCKED_USER', hitl_request: { question, options, context } }`
3. Coordinator publishes HITL request to UI Service
4. User responds
5. Coordinator injects response into agent's injection queue
6. Agent loop resumes, sees the response as a new user message

### 8.4 spawn_agent Tool (Sub-Agent)

```typescript
const spawnAgentTool: Tool = {
  name: 'spawn_agent',
  description: `Spawn an independent sub-agent to work on a specific task.
Use for context isolation: the sub-agent gets a fresh context window and works independently.
Good for:
- Long research tasks that would fill your context
- Parallel independent work streams
- Tasks that need deep focus without cluttering your context

The sub-agent shares your workspace filesystem.
Results are returned as text when the sub-agent completes.`,
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Clear task description for the sub-agent' },
      label: { type: 'string', description: 'Short label for tracking (e.g., "research-pricing")' },
      timeout_seconds: { type: 'number', description: 'Timeout in seconds', default: 300 },
      write_output_to: { type: 'string', description: 'File path in workspace to write results (optional)' },
    },
    required: ['task'],
  },
};
```

**Execution**:
1. Agent calls `spawn_agent`
2. A new agent loop starts in the same container (shared workspace, own context)
3. Sub-agent runs to completion or timeout
4. Sub-agent's **final assistant message** is extracted and returned as the tool result
5. If `write_output_to` is set, sub-agent's output is also written to that workspace file

This avoids the "look at my work above" failure mode — the parent always gets the explicit final text.

### 8.5 publish_deliverable Tool

```typescript
const publishDeliverableTool: Tool = {
  name: 'publish_deliverable',
  description: `Mark a file in your workspace as a deliverable for the user.
Call this when you have completed a piece of work that the user should review.
Deliverables are packaged in the final result.`,
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path relative to /workspace/ (e.g., "output/report.md")' },
      description: { type: 'string', description: 'What this deliverable is' },
      type: { type: 'string', enum: ['report', 'code', 'data', 'screenshot', 'other'] },
    },
    required: ['filepath', 'description', 'type'],
  },
};
```

### 8.6 Tool Output Truncation

Large tool outputs are truncated to prevent context window exhaustion. When truncated, the full output is written to a workspace file:

```typescript
const TOOL_OUTPUT_MAX_TOKENS = 8000;

async function truncateToolOutput(output: string, toolCallId: string, container: Container): Promise<string> {
  const tokens = estimateTokens(output);
  if (tokens <= TOOL_OUTPUT_MAX_TOKENS) return output;

  // Write full output to workspace
  const filepath = `/workspace/.scratch/tool-output-${toolCallId}.txt`;
  await container.writeFile(filepath, output);

  // Return truncated version with pointer
  const truncated = output.slice(0, approximateCharLimit(TOOL_OUTPUT_MAX_TOKENS));
  return `${truncated}\n\n[OUTPUT TRUNCATED — full output saved to ${filepath}. Use read tool to access.]`;
}
```

---

## 9. Sub-Agent Management

### 9.1 Design

Sub-agents are spawned by the main agent (via `spawn_agent` tool), not scheduled by an orchestration service. The agent decides when context isolation is needed.

```typescript
interface SubAgentManager {
  /** Spawn a sub-agent, returns when complete */
  spawn(config: SubAgentConfig): Promise<SubAgentResult>;

  /** Spawn multiple sub-agents in parallel */
  spawnParallel(configs: SubAgentConfig[]): Promise<SubAgentResult[]>;

  /** Cancel a running sub-agent */
  cancel(agentId: string): Promise<void>;

  /** Cancel all running sub-agents */
  cancelAll(): Promise<void>;
}

interface SubAgentConfig {
  task: string;
  label: string;
  timeout_ms: number;
  model?: string;
  write_output_to?: string;
}

interface SubAgentResult {
  label: string;
  status: 'completed' | 'failed' | 'timeout';
  output: string;       // Final assistant message (explicit, not "look above")
  usage: UsageMetrics;
  duration_ms: number;
  error?: string;
}
```

### 9.2 Sub-Agent Context

Each sub-agent gets:
- **Fresh context window** (own conversation history)
- **Minimal system prompt** (subset of parent's — tools, safety, workspace layout)
- **Shared workspace filesystem** (can read/write files the parent created)
- **Same tools** as the parent (except `spawn_agent` to prevent recursive spawning — configurable depth limit)
- **No injection queue** (sub-agents don't receive external input; they run to completion)

### 9.3 Result Passing

Sub-agent results are passed to the parent as the tool call result. The parent sees:

```
spawn_agent result:

Sub-agent "research-pricing" completed in 45s (2,340 tokens).

Result:
[Sub-agent's final assistant message text here]

Output written to: /workspace/output/pricing-research.md
```

---

## 10. Skills System

Skills remain **pure instruction files** (SKILL.md) pre-installed in containers. No changes from previous design.

### 10.1 Skill Discovery Flow

```
Agent: "I need to automate browser actions"
     │
     ▼
list_skills → ["browser-automation", "pdf", "xlsx", ...]
     │
     ▼
read_skill("browser-automation") → SKILL.md content with instructions
     │
     ▼
Agent follows instructions using browser/bash/other tools
```

### 10.2 SKILL.md Format

```markdown
---
name: browser-automation
description: Automate browser interactions
---

# Browser Automation Skill

## Navigation
- Use `browser navigate <url>` to open a page
- Use `browser screenshot` to capture current state

## Interaction
[instructions with tool usage examples]
```

---

## 11. Risk Control

### 11.1 Risk Classification

| Risk Level | Action |
|------------|--------|
| **LOW** | Allow |
| **MEDIUM** | Allow with logging |
| **HIGH** | Block → trigger HITL via `ask_user` internally |
| **CRITICAL** | Deny (return error to agent) |

### 11.2 Risk Rules

| Pattern | Risk Level |
|---------|------------|
| Read-only tools (read, glob, grep, list_skills, read_skill) | LOW |
| Context tools (update_plan, save_memo, search_memo, publish_deliverable) | LOW |
| File edit (edit) | LOW |
| File creation (write) | MEDIUM |
| Bash general commands | MEDIUM |
| Web search/fetch | MEDIUM |
| Browser navigation | MEDIUM |
| Browser form submission | HIGH |
| Bash with rm, chmod, chown | HIGH |
| Bash with rm -rf, sudo | CRITICAL |

### 11.3 Doom Loop Detection

```typescript
interface DoomLoopConfig {
  /** Max consecutive identical tool calls before intervention */
  max_identical_calls: number;     // default: 3

  /** Max consecutive failures before stopping */
  max_consecutive_failures: number; // default: 5

  /** Window size for pattern detection */
  pattern_window: number;          // default: 10
}
```

When a doom loop is detected:
1. Inject a system message: "You appear to be repeating the same action. Reconsider your approach."
2. If it continues, inject: "Stop and re-read your plan. What should you do differently?"
3. If still looping after 3 interventions, fail the task.

---

## 12. Docker Container Management

### 12.1 Container Lifecycle

```
Provision → Start → Execute (agent loop) → Cleanup
```

### 12.2 Container Configuration

| Setting | Default |
|---------|---------|
| Image | execution-agent:latest |
| Memory | 2GB |
| CPU | 2 cores |
| Network | bridge (restricted) |
| Workspace | /workspace/ (RW, mounted volume) |
| Skills | /skills/ (RO, mounted) |

### 12.3 Container Per Task

Each task gets its own container. Sub-agents share the parent's container (and workspace).

```typescript
interface ContainerManager {
  /** Provision a new container for a task */
  provision(config: ContainerConfig): Promise<DockerContainer>;

  /** Execute a command in the container */
  exec(container: DockerContainer, command: string, timeout_ms: number): Promise<ExecResult>;

  /** Read a file from the container */
  readFile(container: DockerContainer, path: string): Promise<string>;

  /** Write a file to the container */
  writeFile(container: DockerContainer, path: string, content: string): Promise<void>;

  /** Cleanup and remove container */
  cleanup(container: DockerContainer): Promise<void>;
}
```

---

## 13. Monitoring & Scheduled Tasks

### 13.1 Heartbeat Pattern

For tasks that need to monitor external conditions (e.g., "notify me when price drops below $100"):

1. Agent creates a monitoring plan via `update_plan`
2. Agent can use `bash` with cron-like polling scripts, or
3. Coordinator sends `scheduled-trigger` which injects a check message into the agent's context periodically

```typescript
// Coordinator side: periodic check injection
interface MonitoringSchedule {
  task_id: string;
  interval_seconds: number;
  check_prompt: string;      // e.g., "Check if the price condition is met"
  timeout_at: string;        // ISO 8601
  timeout_action: 'complete' | 'fail';
}
```

The agent handles monitoring naturally — it receives periodic "check now" messages, uses its tools to evaluate the condition, and decides whether to continue waiting or complete.

### 13.2 No Separate Monitoring FSM

The previous design had `SubtaskFSMState.MONITORING` with `MonitoringSubtaskStartingTask`, `MonitoringConditionEvaluatingTask`, `MonitoringResolvingTask`, etc. This is eliminated. The agent simply loops and checks — it's the LLM-in-a-loop pattern applied to monitoring.

---

## 14. External Event Handling

### 14.1 Flow

```
External system sends event
        │
        ▼
Session Coordinator receives (via Redis stream)
        │
        ▼
Coordinator injects into agent's injection queue:
  { type: 'external_event', content: "Event received: {payload}" }
        │
        ▼
Agent sees event on next iteration, decides how to react
```

The agent's system prompt includes instructions on handling external events:
```
When you receive an external event, evaluate whether it's relevant to your current task.
If it satisfies a condition you're waiting for, proceed accordingly.
If it's not relevant, acknowledge and continue your current work.
```

### 14.2 No Event Matching Logic in Code

The previous design had `ExternalEventMatchingTask` and `ExternalEventGateway` with condition evaluation. Now the agent itself evaluates conditions — it's just another message in its context that it reasons about.

---

## 15. Data Models

### 15.1 Input: TaskCommand

Replaces the previous `ExecutionCommand` (which was subtask-scoped):

```typescript
interface TaskCommand {
  command_id: string;
  session_id: string;
  task_id: string;
  goal: string;
  constraints?: string[];
  execution_config: {
    timeout_seconds: number;       // default: 600
    max_iterations: number;        // default: 200
    model: string;                 // default: "gpt-4o"
    compaction: CompactionConfig;
  };
  resume_context?: ResumeContext;  // If resuming from pause/blocked
}

interface ResumeContext {
  previous_messages: Message[];
  injection: AgentInjection;       // The HITL response or resume signal
}
```

### 15.2 Output: TaskResult

Replaces the previous `ExecutionResultPayload`:

```typescript
interface TaskResult {
  task_id: string;
  session_id: string;
  command_id: string;
  status: TaskResultStatus;
  deliverables: Deliverable[];
  final_message?: string;
  evidence_refs: EvidenceRef[];
  usage: UsageMetrics;
  error_details?: ErrorDetails;
  hitl_request?: HITLRequest;      // If status is BLOCKED_USER
}

enum TaskResultStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  BLOCKED_USER = 'BLOCKED_USER',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

interface Deliverable {
  filepath: string;
  description: string;
  type: 'report' | 'code' | 'data' | 'screenshot' | 'other';
  content?: string;      // Inline for small deliverables
  size_bytes?: number;
}

interface HITLRequest {
  request_id: string;
  question: string;
  options?: string[];
  context?: string;
}

interface UsageMetrics {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  iterations: number;
  tool_calls: number;
  sub_agents_spawned: number;
  compactions: number;
  duration_ms: number;
}

interface EvidenceRef {
  ref_id: string;
  type: 'screenshot' | 'file' | 'log' | 'url';
  uri: string;
  description?: string;
}
```

### 15.3 Agent Conversation State

No FSM. The state is the conversation history:

```typescript
interface AgentConversationState {
  task_id: string;
  messages: Message[];
  iteration: number;
  plan_snapshot?: string;           // Latest .plan.md content
  deliverables_registered: string[];
  sub_agents_active: string[];
  compaction_count: number;
  started_at: string;
}
```

---

## 16. Observability

### 16.1 Traces

Every agent loop execution produces a trace (JSONL file):

```typescript
interface TraceEntry {
  timestamp: string;
  iteration: number;
  event_type: TraceEventType;
  data: Record<string, unknown>;
}

type TraceEventType =
  | 'agent_start'
  | 'llm_request'
  | 'llm_response'
  | 'tool_call'
  | 'tool_result'
  | 'injection_received'
  | 'compaction_start'
  | 'compaction_end'
  | 'memory_flush'
  | 'sub_agent_spawn'
  | 'sub_agent_complete'
  | 'risk_check'
  | 'doom_loop_detected'
  | 'agent_end';
```

Traces are stored at `/workspace/.trace/{task_id}.jsonl` and also optionally published to an external observability system.

### 16.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `agent.loop.iterations` | Counter | task_id, status |
| `agent.loop.duration_ms` | Histogram | status |
| `agent.tool.calls` | Counter | tool_name, risk_level |
| `agent.tool.duration_ms` | Histogram | tool_name |
| `agent.tool.errors` | Counter | tool_name, error_type |
| `agent.compaction.count` | Counter | task_id |
| `agent.compaction.tokens_before` | Histogram | |
| `agent.compaction.tokens_after` | Histogram | |
| `agent.subagent.spawned` | Counter | |
| `agent.subagent.duration_ms` | Histogram | status |
| `agent.llm.latency_ms` | Histogram | model |
| `agent.llm.tokens` | Counter | direction (input/output) |
| `agent.doom_loop.detected` | Counter | |
| `coordinator.routing.decisions` | Counter | decision_type |
| `coordinator.injections` | Counter | injection_type |

### 16.3 Logs

| Event | Level | Fields |
|-------|-------|--------|
| Task started | INFO | task_id, goal, model |
| Tool executed | DEBUG | task_id, tool_name, duration_ms |
| Tool failed | WARN | task_id, tool_name, error |
| Compaction triggered | INFO | task_id, tokens_before, tokens_after |
| Memory flush | INFO | task_id, files_written |
| Sub-agent spawned | INFO | task_id, label, sub_agent_id |
| Sub-agent completed | INFO | task_id, label, status, duration_ms |
| Injection received | INFO | task_id, injection_type |
| Doom loop detected | WARN | task_id, pattern |
| Risk denied | WARN | task_id, tool_name, risk_level |
| Task completed | INFO | task_id, status, iterations, duration_ms |
| Task failed | ERROR | task_id, error_type, message |

---

## 17. Configuration

### 17.1 Environment Variables

```bash
# LLM (required)
LITELLM_API_KEY=your-api-key
LITELLM_API_BASE=http://localhost:4000
LITELLM_MODEL=gpt-4o

# Container
CONTAINER_MODE=docker|mock
CONTAINER_IMAGE=execution-agent:latest
CONTAINER_MEMORY=2g
CONTAINER_CPU=2

# Redis
REDIS_URL=redis://localhost:6379

# Context Service
CONTEXT_SERVICE_URL=http://localhost:3001

# Agent defaults
AGENT_MAX_ITERATIONS=200
AGENT_TIMEOUT_SECONDS=600
AGENT_COMPACTION_TRIGGER_RATIO=0.85
AGENT_MEMORY_FLUSH_ENABLED=true
AGENT_TOOL_OUTPUT_MAX_TOKENS=8000

# Sub-agents
SUBAGENT_MAX_DEPTH=2
SUBAGENT_DEFAULT_TIMEOUT_SECONDS=300

# Coordinator
COORDINATOR_MAX_CONCURRENT_TASKS=3
COORDINATOR_SESSION_LEASE_TTL_MS=30000
```

### 17.2 Per-Task Overrides

Tasks can override defaults via `execution_config` in the TaskCommand:

```typescript
interface ExecutionConfig {
  timeout_seconds?: number;
  max_iterations?: number;
  model?: string;
  compaction?: Partial<CompactionConfig>;
}
```

---

## 18. Error Handling

### 18.1 Error Categories

| Category | Examples | Handling |
|----------|----------|----------|
| Transient | Network timeout, rate limit, container startup | Retry with exponential backoff |
| Permanent | Invalid command, corrupted state | Fail immediately |
| Agent-level | Max iterations, doom loop, timeout | Fail with diagnostic |
| Tool-level | Command failed, file not found | Agent sees error, adapts |

### 18.2 LLM Error Handling

```typescript
interface LLMRetryConfig {
  max_retries: number;          // default: 3
  backoff_base_ms: number;      // default: 1000
  backoff_multiplier: number;   // default: 2
  max_backoff_ms: number;       // default: 30000
}
```

On LLM error:
1. Retry with exponential backoff
2. If rate limited, wait for retry-after header
3. If model unavailable, fail the task (no silent model fallback — explicit config required)

### 18.3 Container Error Handling

- Container startup failure → retry 2x, then fail task
- Container OOM → fail task with diagnostic
- Container network error → retry command, not container

---

## 19. Service Dependencies

### 19.1 Synchronous Dependencies

| Dependency | Purpose | Failure Impact |
|------------|---------|----------------|
| LLM Service | Agent reasoning | Task fails (with retry) |
| Context Service | Task context, memories | Task fails |
| Docker Engine | Container execution | Task fails |

### 19.2 Asynchronous Communication

| Stream | Direction | Purpose |
|--------|-----------|---------|
| `task-command` | IN | Receive task commands from Coordinator |
| `task-result` | OUT | Publish task results to Coordinator |
| `hitl-request-command` | OUT | Publish HITL requests to UI Service |
| `user-message-command` | OUT | Publish status updates to UI Service |

### 19.3 Redis Infrastructure

| Key Pattern | Purpose |
|-------------|---------|
| `injection:{task_id}` | Injection queue (list) per task |
| `task:status:{task_id}` | Task control flags (paused/cancelled) |
| `session:lease:{session_id}` | Coordinator session lease |

---

## 20. Migration Guide (From Previous Design)

### 20.1 What to Delete

| Previous Component | Action |
|-------------------|--------|
| `src/tasks/planning/SubtaskPlanGeneratingTask` | DELETE — agent plans via update_plan tool |
| `src/tasks/planning/SubtaskPlanUpdatingTask` | DELETE — agent updates plan naturally |
| `src/tasks/planning/SubtaskStateInitializingTask` | DELETE — no subtask states |
| `src/tasks/planning/SubtaskStateUpdatingTask` | DELETE — no subtask states |
| `src/tasks/resolution/PostExecutionEvaluatingTask` | DELETE — agent evaluates in-loop |
| `src/tasks/resolution/StateResolvingTask` | DELETE — no dependency resolution |
| `src/tasks/resolution/TaskLevelVerifyingTask` | DELETE — agent verifies itself |
| `src/tasks/resolution/RepairStrategySelectingTask` | DELETE — agent retries in-loop |
| `src/tasks/monitoring/` (all monitoring tasks) | DELETE — agent handles via injection |
| `src/gateways/` (most gateways) | DELETE — no gateway routing |
| `SubtaskFSMState` enum and transitions | DELETE |
| `TaskLifecycleState` (complex version) | REPLACE with simple `TaskStatus` |
| `SubtaskContract`, `SubtaskDAG`, `DependencyExpression` | DELETE |
| `TaskPlanBundle` | DELETE |
| `PostExecutionDecision` (8 action types) | DELETE |

### 20.2 What to Keep (Refactored)

| Previous Component | New Form |
|-------------------|----------|
| Agent loop (`src/agent/`) | Elevate from subtask-scope to task-scope |
| Tool system (`src/tools/`) | Add: update_plan, save_memo, search_memo, spawn_agent, publish_deliverable |
| Container manager (`src/container/`) | Keep, scope to per-task instead of per-subtask |
| Skills system | Keep as-is |
| Risk control (`src/risk/`) | Keep, add doom loop detection |
| Redis triggers (`src/triggers/`) | Simplify to task-command (not execution-command) |
| Result publisher (`src/services/`) | Simplify output to TaskResult |

### 20.3 What to Add

| New Component | Purpose |
|---------------|---------|
| `src/compaction/` | Compaction engine (summarization + memory flush) |
| `src/tools/plan-tool.ts` | update_plan tool |
| `src/tools/memo-tools.ts` | save_memo, search_memo tools |
| `src/tools/spawn-agent-tool.ts` | spawn_agent tool |
| `src/tools/deliverable-tool.ts` | publish_deliverable tool |
| `src/injection/` | Injection queue (Redis-backed) |
| `src/coordinator/` | Thin Session Coordinator |
| `src/trace/` | Trace recording (JSONL) |

---

## Appendix A: System Prompt Template

```markdown
# Agent Identity

You are an autonomous task execution agent. You receive a goal and work independently
to complete it, using your tools to interact with the environment.

# Planning

Before starting work, create a plan using the `update_plan` tool. Update it as you progress.
When you discover new information, revise your plan. A good plan keeps you on track during
long-running tasks.

# Tools

You have access to the following tools:
[auto-generated from tool registry]

# File System

Your workspace is at /workspace/. Use it to:
- Store intermediate results and notes
- Write deliverables to /workspace/output/
- Save important findings to .memo/ using `save_memo` (these survive context summarization)
- Your plan is at /workspace/.plan.md (managed by update_plan tool)

# Context Management

Your conversation may be summarized if it grows too long. Before summarization:
- Important information is saved to .memo/ (you'll be prompted)
- Your plan at .plan.md persists
- Workspace files persist

After summarization, recover details using `search_memo` or reading workspace files.

# Sub-Agents

Use `spawn_agent` when a subtask would benefit from a fresh context window.
Sub-agents share your workspace filesystem but have their own conversation context.
Good for: long research tasks, parallel independent work, deep focused analysis.

# Deliverables

When you complete a piece of work for the user, register it with `publish_deliverable`.
This marks the file as a final output.

# Safety

[risk rules from configuration]

# Completion

When you have completed the task:
1. Update your plan to show all steps done
2. Register all deliverables via `publish_deliverable`
3. Write a final summary message (your last response without tool calls)

If you cannot complete the task, explain what went wrong and what you tried.
If you need user input, use `ask_user` — do not guess.
```

---

## Appendix B: Comparison with Previous Design

| Aspect | Previous (Orchestration + Execution) | New (Agent-First) |
|--------|------|-----|
| Architecture | 2 services, 6 taskchains, ~45 tasks+gateways | 1 service + thin coordinator |
| Planning | Upfront DAG via LLM → delta updates via LLM | Agent plans in-context via tool |
| State | 2 FSMs (TaskLifecycle + SubtaskFSM) | Conversation history + workspace files |
| Decision making | LLM calls routed through deterministic gateways | Agent decides in its loop |
| Context management | Tiered budgets (T1/T2/T3) managed by code | File system + compaction managed by agent |
| Sub-agents | Orchestration schedules subtask execution | Agent spawns sub-agents when it decides to |
| External events | EventMatchingTask → ConditionEvaluatingTask → FSM transition | Injected as message → agent evaluates |
| HITL | Generated by Orchestration, routed through HITLRequestCommand | Agent calls ask_user → injected response |
| Verification | Separate TaskLevelVerifyingTask with LLM | Agent verifies its own work in-loop |
| Repair | RepairStrategySelectingTask → retry/replan/escalate/terminate | Agent retries and adapts naturally |
| Monitoring | MONITORING FSM state + MonitoringSubtaskStartingTask | Periodic injection + agent evaluates |
| LLM calls per task | 5-8 (router + planner + post-exec + verifier + ...) | 1 continuous loop (far more iterations, but simpler) |
| Code complexity | ~15,000 LOC (estimated) | ~3,000 LOC (estimated) |

---

*End of Execution Service Factsheet (v2)*
