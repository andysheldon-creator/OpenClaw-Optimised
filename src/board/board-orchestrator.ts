/**
 * Board of Directors — Reply Pipeline Orchestrator (FB-017)
 *
 * Integration layer between the reply pipeline (reply.ts) and the board
 * scaffolding modules. Handles:
 *
 * 1. Pre-reply: Message routing + session key derivation + personality injection
 * 2. Post-reply: Consultation tag extraction + meeting tag extraction
 *
 * The reply pipeline calls `prepareBoardContext()` before running the agent,
 * and `processAgentResponse()` after receiving the agent's reply. This keeps
 * the board logic cleanly separated from the reply pipeline.
 */

import type { ClawdisConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";

import { createAgentTask, initAgentTasks } from "./agent-tasks.js";
import { resolveAgentDef } from "./agents.js";
import {
  initMeetingRunner,
  startAsyncBoardMeeting,
} from "./meeting-runner.js";
import {
  buildConsultationPrompt,
  cancelConsultation,
  cleanupTimedOutConsultations,
  completeConsultation,
  createConsultation,
  formatConsultationResult,
} from "./consultation.js";
import {
  buildSynthesisPrompt,
  cancelMeeting,
  completeMeeting,
  createMeeting,
  failAgentInput,
  formatMeetingSummary,
  getMeeting,
  isMeetingTimedOut,
  recordAgentInput,
  startMeeting,
} from "./meeting.js";
import {
  buildBoardSystemPrompt,
  ensureBoardPersonalityFiles,
} from "./personality.js";
import {
  buildTopicMap,
  extractConsultTags,
  extractMeetingTag,
  routeMessage,
  stripConsultTags,
  stripMeetingTag,
} from "./router.js";
import { boardSessionKey } from "./session-keys.js";
import type { BoardAgentRole, BoardRoutingContext } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Result from prepareBoardContext(). Contains everything the reply
 * pipeline needs to route and personalise the agent run.
 */
export type BoardContext = {
  /** Whether the board is enabled and active. */
  enabled: boolean;
  /** Resolved agent role (default: "general"). */
  agentRole: BoardAgentRole;
  /** Routing reason (topic, mention, directive, keyword, default). */
  routeReason: string;
  /** Cleaned message body (routing directives stripped). */
  cleanedBody: string;
  /** Board-aware session key. */
  sessionKey: string;
  /** Extra system prompt fragment (agent personality + board context). */
  extraSystemPrompt: string;
  /** Agent-specific model override, if configured. */
  modelOverride?: string;
  /** Agent-specific thinking level, if configured. */
  thinkingOverride?: string;
  /** Full routing context for downstream use. */
  routingContext: BoardRoutingContext;
};

/**
 * Result from processAgentResponse(). May contain additional messages
 * to send back to the user (e.g., consultation results, meeting summaries).
 */
export type PostReplyResult = {
  /** The user-facing reply text (tags stripped). */
  cleanedReply: string;
  /** Consultation tags found in the agent's reply. */
  consultations: Array<{ toAgent: BoardAgentRole; question: string }>;
  /** Meeting tag found in the agent's reply. */
  meetingTopic?: string;
  /** Whether the reply should be followed up with more processing. */
  needsFollowUp: boolean;
};

/**
 * Callback the orchestrator uses to run an agent for consultations/meetings.
 * The reply pipeline provides this so the orchestrator doesn't need to know
 * about the agent runner internals.
 */
export type AgentRunCallback = (params: {
  prompt: string;
  agentRole: BoardAgentRole;
  extraSystemPrompt: string;
  sessionKeySuffix: string;
}) => Promise<string>;

// ─── Pre-Reply: Board Context Preparation ────────────────────────────────────

/**
 * Prepare board context for a message. Called by the reply pipeline
 * before running the agent.
 *
 * Returns a BoardContext with routing, session key, and personality.
 * If the board is disabled, returns a minimal context that doesn't
 * change the pipeline's default behaviour.
 */
export function prepareBoardContext(params: {
  body: string;
  baseSessionKey: string;
  workspaceDir: string;
  config: ClawdisConfig;
  telegramTopicId?: number;
  existingExtraPrompt?: string;
}): BoardContext {
  const {
    body,
    baseSessionKey,
    workspaceDir,
    config,
    telegramTopicId,
    existingExtraPrompt,
  } = params;
  const boardConfig = config.board;

  // Board disabled — return pass-through context
  if (!boardConfig?.enabled) {
    return {
      enabled: false,
      agentRole: "general",
      routeReason: "disabled",
      cleanedBody: body,
      sessionKey: baseSessionKey,
      extraSystemPrompt: existingExtraPrompt ?? "",
      routingContext: {
        agentRole: "general",
        isConsultation: false,
        consultationDepth: 0,
      },
    };
  }

  // Build topic map from config
  const topicMap = buildTopicMap(boardConfig.agents);

  // Route the message to an agent
  const route = routeMessage({ body, telegramTopicId, topicMap });

  // Derive board-aware session key
  const sessionKey = boardSessionKey(baseSessionKey, route.agentRole);

  // Ensure personality files exist
  ensureBoardPersonalityFiles(workspaceDir);

  // Build the board system prompt fragment
  const boardPrompt = buildBoardSystemPrompt(
    route.agentRole,
    workspaceDir,
    {
      configAgents: boardConfig.agents,
      consultationEnabled: boardConfig.consultation?.enabled ?? true,
      maxConsultationDepth: boardConfig.consultation?.maxDepth ?? 2,
      meetingsEnabled: boardConfig.meetings?.enabled ?? true,
    },
  );

  // Merge with existing extra prompt (e.g., group intro)
  const extraSystemPrompt = existingExtraPrompt
    ? `${existingExtraPrompt}\n\n${boardPrompt}`
    : boardPrompt;

  // Check for model/thinking overrides on this agent
  const agentDef = resolveAgentDef(route.agentRole, boardConfig.agents);

  defaultRuntime.log?.(
    `[board] routed to ${route.agentRole} (reason=${route.reason})`,
  );

  return {
    enabled: true,
    agentRole: route.agentRole,
    routeReason: route.reason,
    cleanedBody: route.cleanedBody,
    sessionKey,
    extraSystemPrompt,
    modelOverride: agentDef.model,
    thinkingOverride: agentDef.thinkingDefault,
    routingContext: {
      agentRole: route.agentRole,
      isConsultation: false,
      consultationDepth: 0,
    },
  };
}

// ─── Post-Reply: Agent Response Processing ───────────────────────────────────

/**
 * Process an agent's reply text to extract board directives.
 * Called by the reply pipeline after receiving the agent's response.
 *
 * Returns the cleaned reply (tags stripped) and any consultation/meeting
 * triggers that need follow-up processing.
 */
export function processAgentResponse(params: {
  replyText: string;
  agentRole: BoardAgentRole;
  config: ClawdisConfig;
}): PostReplyResult {
  const { replyText, agentRole, config } = params;
  const boardConfig = config.board;

  if (!boardConfig?.enabled) {
    return {
      cleanedReply: replyText,
      consultations: [],
      needsFollowUp: false,
    };
  }

  // Extract consultation tags
  const consultTags = extractConsultTags(replyText);
  const consultationsEnabled = boardConfig.consultation?.enabled ?? true;
  const validConsults = consultationsEnabled ? consultTags : [];

  // Extract meeting tag (only from general agent)
  const meetingTag =
    agentRole === "general" && (boardConfig.meetings?.enabled ?? true)
      ? extractMeetingTag(replyText)
      : undefined;

  // Strip all tags from the user-facing reply
  let cleaned = replyText;
  if (validConsults.length > 0) {
    cleaned = stripConsultTags(cleaned);
  }
  if (meetingTag) {
    cleaned = stripMeetingTag(cleaned);
  }

  const needsFollowUp = validConsults.length > 0 || meetingTag !== undefined;

  return {
    cleanedReply: cleaned,
    consultations: validConsults,
    meetingTopic: meetingTag?.topic,
    needsFollowUp,
  };
}

// ─── Consultation Execution (FB-020) ─────────────────────────────────────────

/**
 * Execute a batch of consultations and return the formatted results.
 * Uses the provided callback to run each consulted agent.
 */
export async function executeConsultations(params: {
  consultations: Array<{ toAgent: BoardAgentRole; question: string }>;
  fromAgent: BoardAgentRole;
  config: ClawdisConfig;
  workspaceDir: string;
  depth?: number;
  meetingId?: string;
  runAgent: AgentRunCallback;
}): Promise<string[]> {
  const {
    consultations,
    fromAgent,
    config,
    workspaceDir,
    depth = 0,
    meetingId,
    runAgent,
  } = params;
  const boardConfig = config.board;
  const maxDepth = boardConfig?.consultation?.maxDepth ?? 2;
  const timeoutMs = boardConfig?.consultation?.timeoutMs ?? 120_000;

  // Clean up stale consultations
  cleanupTimedOutConsultations();

  const results: string[] = [];

  for (const consult of consultations) {
    // Create the consultation request
    const request = createConsultation({
      fromAgent,
      toAgent: consult.toAgent,
      question: consult.question,
      depth,
      maxDepth,
      meetingId,
      timeoutMs,
    });

    if (!request) {
      defaultRuntime.log?.(
        `[board] consultation to ${consult.toAgent} rejected (depth=${depth}/${maxDepth})`,
      );
      results.push(
        `[Consultation to ${consult.toAgent} skipped — depth limit reached]`,
      );
      continue;
    }

    // Build the prompt for the consulted agent
    const consultPrompt = buildConsultationPrompt(request);

    // Build the consulted agent's system prompt
    const consultSystemPrompt = buildBoardSystemPrompt(
      consult.toAgent,
      workspaceDir,
      {
        configAgents: boardConfig?.agents,
        consultationEnabled: depth + 1 < maxDepth, // Disable further consults at depth limit
        maxConsultationDepth: maxDepth,
        meetingsEnabled: false, // Consulted agents don't trigger meetings
      },
    );

    try {
      // Run the consulted agent
      const agentResponse = await Promise.race([
        runAgent({
          prompt: consultPrompt,
          agentRole: consult.toAgent,
          extraSystemPrompt: consultSystemPrompt,
          sessionKeySuffix: `consult-${request.id}`,
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("consultation timeout")), timeoutMs),
        ),
      ]);

      // Complete the consultation
      const response = completeConsultation(request.id, agentResponse);
      if (response) {
        results.push(formatConsultationResult(response));

        defaultRuntime.log?.(
          `[board] consultation ${request.id} completed: ${consult.toAgent} → ${response.durationMs}ms`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      defaultRuntime.log?.(
        `[board] consultation ${request.id} failed: ${message}`,
      );
      cancelConsultation(request.id);
      results.push(
        `[Consultation to ${consult.toAgent} failed: ${message}]`,
      );
    }
  }

  return results;
}

// ─── Meeting Execution (FB-019) ──────────────────────────────────────────────

/**
 * Execute a full board meeting: run all specialists, then synthesize.
 * Returns the formatted meeting summary.
 */
export async function executeMeeting(params: {
  topic: string;
  config: ClawdisConfig;
  workspaceDir: string;
  runAgent: AgentRunCallback;
}): Promise<string> {
  const { topic, config, workspaceDir, runAgent } = params;
  const boardConfig = config.board;
  const meetingConfig = boardConfig?.meetings;

  // Create the meeting
  const meeting = createMeeting({
    topic,
    initiatedBy: "general",
    maxDurationMs: meetingConfig?.maxDurationMs ?? 600_000,
    maxTurnsPerAgent: meetingConfig?.maxTurnsPerAgent ?? 3,
    configAgents: boardConfig?.agents,
  });

  if (!meeting) {
    return "Could not start a board meeting — too many meetings in progress.";
  }

  defaultRuntime.log?.(
    `[board] meeting ${meeting.id} started: "${topic}" with ${meeting.inputs.length} specialists`,
  );

  // Start the meeting
  startMeeting(meeting.id);

  // Run all specialists in parallel
  const agentPromises = meeting.inputs.map(async (input) => {
    const agentRole = input.agent;

    // Build specialist system prompt
    const specialistPrompt = buildBoardSystemPrompt(
      agentRole,
      workspaceDir,
      {
        configAgents: boardConfig?.agents,
        consultationEnabled: false, // No consultations during meetings
        meetingsEnabled: false,
      },
    );

    const startTime = Date.now();

    try {
      // Check timeout before running
      if (isMeetingTimedOut(meeting.id)) {
        failAgentInput(meeting.id, agentRole, "Meeting timed out");
        return;
      }

      const response = await runAgent({
        prompt: input.prompt,
        agentRole,
        extraSystemPrompt: specialistPrompt,
        sessionKeySuffix: `meeting-${meeting.id}-${agentRole}`,
      });

      const durationMs = Date.now() - startTime;
      recordAgentInput(meeting.id, agentRole, response, durationMs);

      defaultRuntime.log?.(
        `[board] meeting ${meeting.id}: ${agentRole} responded (${durationMs}ms)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      defaultRuntime.log?.(
        `[board] meeting ${meeting.id}: ${agentRole} failed: ${message}`,
      );
      failAgentInput(meeting.id, agentRole, message);
    }
  });

  // Wait for all specialists
  await Promise.allSettled(agentPromises);

  // Get the updated meeting (should be in "synthesizing" state)
  const updatedMeeting = getMeeting(meeting.id);
  if (!updatedMeeting) {
    return "Board meeting failed — meeting lost.";
  }

  // Check for timeout
  if (isMeetingTimedOut(meeting.id)) {
    cancelMeeting(meeting.id);
    return `Board meeting on "${topic}" timed out after receiving ${updatedMeeting.inputs.filter((i) => i.status === "completed").length}/${updatedMeeting.inputs.length} responses.`;
  }

  // Build synthesis prompt and run the General agent
  const synthesisPrompt = buildSynthesisPrompt(updatedMeeting);
  const generalPrompt = buildBoardSystemPrompt("general", workspaceDir, {
    configAgents: boardConfig?.agents,
    consultationEnabled: false,
    meetingsEnabled: false,
  });

  try {
    const synthesis = await runAgent({
      prompt: synthesisPrompt,
      agentRole: "general",
      extraSystemPrompt: generalPrompt,
      sessionKeySuffix: `meeting-${meeting.id}-synthesis`,
    });

    completeMeeting(meeting.id, synthesis);

    defaultRuntime.log?.(
      `[board] meeting ${meeting.id} completed`,
    );

    return formatMeetingSummary(getMeeting(meeting.id)!);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.log?.(
      `[board] meeting ${meeting.id} synthesis failed: ${message}`,
    );
    cancelMeeting(meeting.id);
    return `Board meeting synthesis failed: ${message}`;
  }
}

// ─── Async Board Meeting (Task-Based) ─────────────────────────────────────

/**
 * Start an async board meeting where each specialist runs as an autonomous
 * task with real tools (web search, etc.). Progress reports appear in
 * each agent's Telegram topic. Synthesis is delivered automatically when
 * all specialists complete.
 *
 * Unlike executeMeeting() which blocks until all agents respond, this
 * returns immediately with an acknowledgment message. The actual work
 * happens asynchronously via the task runner.
 */
export async function executeAsyncMeeting(params: {
  topic: string;
  config: ClawdisConfig;
  workspaceDir: string;
}): Promise<string> {
  return startAsyncBoardMeeting(params);
}

// ─── Agent Task Creation (Directive Routing) ──────────────────────────────

/**
 * Create an autonomous task for a board agent. Called when a directive
 * is detected in the reply pipeline (e.g., "@research analyze UK EV market").
 *
 * Returns an acknowledgment message for the user.
 */
export { createAgentTask } from "./agent-tasks.js";

// ─── Board Initialization ─────────────────────────────────────────────────

/**
 * Initialize the board's autonomous capabilities.
 * Call after startTaskRunner() during bot startup.
 *
 * Sets up:
 * - Agent task completion hooks (for memory saving)
 * - Meeting runner hooks (for synthesis triggering)
 */
export function initBoard(): void {
  initAgentTasks();
  initMeetingRunner();
  defaultRuntime.log?.("[board] Autonomous board agents initialized");
}
