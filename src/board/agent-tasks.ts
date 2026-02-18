/**
 * Board of Directors — Agent Task Bridge
 *
 * Bridges board agents to the autonomous task system. When a user sends
 * a directive to a board agent (e.g., "@research analyze UK EV market"),
 * this module:
 *
 *   1. Loads the agent's personality + persistent memory
 *   2. Composes a full system prompt
 *   3. Creates a multi-step task (Plan → Execute → Synthesize)
 *   4. Routes progress reports to the agent's Telegram forum topic
 *   5. Saves memory on completion
 *
 * The task runner (src/tasks/runner.ts) calls back via `onAgentTaskComplete`
 * when a board agent task finishes.
 */

import type { ClawdisConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging.js";
import { createTask, onAgentTaskComplete } from "../tasks/runner.js";
import type { Task, TaskCreate } from "../tasks/types.js";

import {
  appendAgentMemory,
  extractMemoryFromResult,
  loadAgentMemory,
} from "./agent-memory.js";
import { resolveAgentDef } from "./agents.js";
import { buildBoardSystemPrompt } from "./personality.js";
import type { BoardAgentRole } from "./types.js";

const log = createSubsystemLogger("board:tasks");

// ── Types ───────────────────────────────────────────────────────────────────

export type CreateAgentTaskOpts = {
  /** The board agent role. */
  role: BoardAgentRole;
  /** The directive / instruction for the agent. */
  directive: string;
  /** Config for personality loading and report routing. */
  config: ClawdisConfig;
  /** Workspace directory for SOUL file loading. */
  workspaceDir: string;
  /** Optional meeting ID — if this task is part of a board meeting. */
  meetingId?: string;
  /**
   * Custom steps override. If not provided, a default 3-step plan is used:
   * Plan → Execute → Synthesize.
   */
  customSteps?: Array<{ description: string; prompt: string }>;
  /** Override step interval in ms (default: from config or 30s). */
  stepIntervalMs?: number;
  /** Override report frequency (default: every step). */
  reportEverySteps?: number;
};

export type AgentTaskResult = {
  /** The created task. */
  task: Task;
  /** Acknowledgment message for the user. */
  acknowledgment: string;
};

// ── Meeting Completion Tracking ──────────────────────────────────────────────

/**
 * Callback for meeting completion checking. Set by meeting-runner.ts.
 * When an agent task with a meetingId completes, we call this to check
 * if all specialist tasks are done and synthesis should begin.
 */
let meetingCompletionHook:
  | ((meetingId: string, completedTask: Task) => Promise<void>)
  | null = null;

/**
 * Register a callback for meeting task completion checking.
 * Called from meeting-runner.ts during startup.
 */
export function onMeetingTaskComplete(
  hook: (meetingId: string, completedTask: Task) => Promise<void>,
): void {
  meetingCompletionHook = hook;
}

// ── System Prompt Construction ──────────────────────────────────────────────

/**
 * Build the full system prompt for an autonomous agent task.
 * Combines: personality + board context + memory + tool-use instructions.
 */
function buildAgentTaskSystemPrompt(
  role: BoardAgentRole,
  directive: string,
  config: ClawdisConfig,
  workspaceDir: string,
): string {
  const boardConfig = config.board;

  // Base board prompt (personality, colleagues, consultation/meeting instructions)
  const boardPrompt = buildBoardSystemPrompt(role, workspaceDir, {
    configAgents: boardConfig?.agents,
    consultationEnabled: false, // No consultations during autonomous tasks
    meetingsEnabled: false, // No meetings during autonomous tasks
  });

  // Load persistent memory
  const memory = loadAgentMemory(role);
  const memoryBlock = memory
    ? `\n## Prior Knowledge (from previous tasks)\n${memory}\n`
    : "";

  // Tool-use guidance for autonomous work
  const toolInstructions = `
## Autonomous Task Execution

You are executing an autonomous task, not just answering a question. You have access to tools and should use them to do real work.

**Current directive:** ${directive}

**Key behaviors for autonomous tasks:**
- Use web search to gather real, current data when needed
- Be thorough — don't give surface-level answers. Dig into the details.
- Provide specific, actionable insights backed by evidence
- Structure your output clearly with headings and bullet points
- If you're asked to analyze something, provide quantitative data where possible
- Each step builds on the previous ones — use prior step results as context

**Output format:**
- Start with a brief summary of what you did in this step
- Include key findings as bullet points (these become your long-term memory)
- End with conclusions or recommendations relevant to the directive`;

  return `${boardPrompt}${memoryBlock}${toolInstructions}`;
}

// ── Default Step Templates ──────────────────────────────────────────────────

/**
 * Build the default 3-step task plan for an agent directive.
 */
function buildDefaultSteps(
  role: BoardAgentRole,
  directive: string,
): Array<{ description: string; prompt: string }> {
  const agentDef = resolveAgentDef(role);

  return [
    {
      description: `${agentDef.emoji} Planning: ${agentDef.name} scoping the directive`,
      prompt: [
        `You are the ${agentDef.name} (${agentDef.title}).`,
        `Your directive: "${directive}"`,
        "",
        "This is the PLANNING step. Your job:",
        "1. Break down what needs to be investigated or done",
        "2. Identify what data/information you need to gather",
        "3. List the specific questions you need to answer",
        "4. Outline your approach and methodology",
        "",
        "Output a clear plan with numbered steps. Be specific about what you'll search for or analyze.",
      ].join("\n"),
    },
    {
      description: `${agentDef.emoji} Executing: ${agentDef.name} doing the work`,
      prompt: [
        `You are the ${agentDef.name} (${agentDef.title}).`,
        `Your directive: "${directive}"`,
        "",
        "This is the EXECUTION step. Your job:",
        "1. Follow the plan from Step 1",
        "2. Use web search and other tools to gather real data",
        "3. Analyze what you find through the lens of your expertise",
        "4. Document your findings with specific facts and figures",
        "",
        "Be thorough. Use multiple searches if needed. Cross-reference sources.",
        "Structure your findings clearly with bullet points and evidence.",
      ].join("\n"),
    },
    {
      description: `${agentDef.emoji} Synthesizing: ${agentDef.name} delivering final report`,
      prompt: [
        `You are the ${agentDef.name} (${agentDef.title}).`,
        `Your directive: "${directive}"`,
        "",
        "This is the SYNTHESIS step. Your job:",
        "1. Review the plan (Step 1) and findings (Step 2)",
        "2. Synthesize everything into a clear, actionable report",
        "3. Highlight the most important insights",
        "4. Provide specific recommendations based on your expertise",
        "5. Note any caveats, risks, or areas needing further investigation",
        "",
        "Format as a professional report from a board specialist.",
        "- Lead with the key takeaway",
        "- Use bullet points for key findings",
        "- End with concrete recommendations",
      ].join("\n"),
    },
  ];
}

// ── Task Creation ───────────────────────────────────────────────────────────

/**
 * Create an autonomous task for a board agent.
 *
 * This is the main entry point — called from the reply pipeline when
 * a directive is detected for a board agent.
 */
export async function createAgentTask(
  opts: CreateAgentTaskOpts,
): Promise<AgentTaskResult> {
  const {
    role,
    directive,
    config,
    workspaceDir,
    meetingId,
    customSteps,
    stepIntervalMs,
    reportEverySteps,
  } = opts;

  const boardConfig = config.board;
  const agentDef = resolveAgentDef(role, boardConfig?.agents);

  // Build the full system prompt (personality + memory + tool instructions)
  const extraSystemPrompt = buildAgentTaskSystemPrompt(
    role,
    directive,
    config,
    workspaceDir,
  );

  // Resolve the Telegram group ID and agent's topic ID for delivery
  const telegramGroupId = boardConfig?.telegramGroupId;
  const reportTo = telegramGroupId
    ? String(telegramGroupId)
    : undefined;
  const reportTopicId = agentDef.telegramTopicId;

  // Use custom steps or the default 3-step plan
  const steps = customSteps ?? buildDefaultSteps(role, directive);

  // Create the task
  const taskCreate: TaskCreate = {
    name: `${agentDef.emoji} ${agentDef.name}: ${directive.slice(0, 80)}`,
    description: `Board agent task for ${agentDef.name} (${agentDef.title}): ${directive}`,
    steps,
    reportChannel: reportTo ? "telegram" : "last",
    reportTo,
    reportTopicId,
    reportEverySteps: reportEverySteps ?? 1,
    stepIntervalMs: stepIntervalMs ?? config.tasks?.defaultStepIntervalMs,
    metadata: {
      agentRole: role,
      directive,
      extraSystemPrompt,
      meetingId: meetingId ?? undefined,
    },
  };

  const task = await createTask(taskCreate);

  log.info(
    `Created agent task ${task.id} for ${role}: "${directive.slice(0, 60)}"` +
      (meetingId ? ` (meeting: ${meetingId})` : ""),
  );

  // Build acknowledgment message
  const topicNote = reportTopicId
    ? ` Progress will appear in the ${agentDef.name} topic.`
    : "";
  const acknowledgment =
    `${agentDef.emoji} **${agentDef.name}** is on it: "${directive}"` +
    `\n${task.steps.length} steps queued.${topicNote}`;

  return { task, acknowledgment };
}

// ── Task Completion Handler ─────────────────────────────────────────────────

/**
 * Called by the task runner when a board agent task completes.
 * Saves the agent's memory and checks meeting completion.
 */
async function handleAgentTaskComplete(task: Task): Promise<void> {
  const role = task.metadata?.agentRole;
  if (typeof role !== "string") return;

  const directive = typeof task.metadata?.directive === "string"
    ? task.metadata.directive
    : task.name;

  // Extract and save memory from the task results
  const resultText = task.finalResult ?? task.finalSummary ?? "";
  if (resultText) {
    const entry = extractMemoryFromResult(directive, resultText, task.id);
    appendAgentMemory(role as BoardAgentRole, entry);
    log.info(
      `Saved memory for ${role} from task ${task.id} (${entry.keyFacts.length} facts)`,
    );
  }

  // If this task is part of a meeting, notify the meeting runner
  const meetingId = task.metadata?.meetingId;
  if (typeof meetingId === "string" && meetingCompletionHook) {
    try {
      await meetingCompletionHook(meetingId, task);
    } catch (err) {
      log.error(
        `Meeting completion hook failed for meeting ${meetingId}: ${String(err)}`,
      );
    }
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

/**
 * Register the agent task completion hook with the task runner.
 * Call this during bot startup (after startTaskRunner).
 */
export function initAgentTasks(): void {
  onAgentTaskComplete(handleAgentTaskComplete);
  log.info("Agent task completion hook registered");
}
