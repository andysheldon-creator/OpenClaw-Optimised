import { z } from "zod";
import type { GatewayCallFn, ReviewIteration, WorkflowLogger, WorkflowPlan } from "../types.js";
import { AGENT_LANE_SUBAGENT } from "../../../agents/lanes.js";
import { runAgentStep } from "../../../agents/tools/agent-step.js";

const DEFAULT_MAX_ITERATIONS = 2;

const ReviewResultSchema = z.object({
  approved: z.boolean(),
  feedback: z.string(),
  suggestedChanges: z.array(z.string()).optional(),
  revisedPlan: z
    .object({
      intent: z.string().optional(),
      scope: z.string().optional(),
      discoveryQuestions: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      successCriteria: z.array(z.string()).optional(),
      estimatedComplexity: z.enum(["low", "medium", "high"]).optional(),
    })
    .optional(),
});

function buildReviewPrompt(plan: WorkflowPlan, iteration: number): string {
  return [
    "You are a WorkflowReviewer. Assess the following plan for feasibility, completeness, and risks.",
    "",
    `## Plan (Review iteration ${iteration})`,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    "",
    "## Requirements",
    "Output MUST be valid JSON only (no markdown, no commentary).",
    "Produce a review object with these fields:",
    "- approved: boolean — true if the plan is ready to proceed",
    "- feedback: string — overall assessment",
    "- suggestedChanges: string[] — specific improvements (optional)",
    "- revisedPlan: partial plan object with only the fields you want to change (optional)",
    "",
    "Assess:",
    "1. Are discovery questions specific enough to yield actionable information?",
    "2. Are success criteria testable and complete?",
    "3. Are there missing constraints or scope issues?",
    "4. Is the complexity estimate reasonable?",
  ].join("\n");
}

function applyRevisedPlan(
  current: WorkflowPlan,
  revised: Partial<WorkflowPlan> | undefined,
): WorkflowPlan {
  if (!revised) {
    return current;
  }
  return {
    intent: revised.intent ?? current.intent,
    scope: revised.scope ?? current.scope,
    discoveryQuestions: revised.discoveryQuestions ?? current.discoveryQuestions,
    constraints: revised.constraints ?? current.constraints,
    successCriteria: revised.successCriteria ?? current.successCriteria,
    estimatedComplexity: revised.estimatedComplexity ?? current.estimatedComplexity,
  };
}

export async function runReviewPhase(opts: {
  plan: WorkflowPlan;
  agentId: string;
  reviewerAgentId?: string;
  maxIterations?: number;
  model?: string;
  thinking?: string;
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
}): Promise<{ plan: WorkflowPlan; iterations: ReviewIteration[] }> {
  const { log } = opts;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const thinking = opts.thinking ?? "high";
  const reviewerAgentId = opts.reviewerAgentId ?? opts.agentId;

  let currentPlan = opts.plan;
  const iterations: ReviewIteration[] = [];

  for (let i = 1; i <= maxIterations; i++) {
    const sessionKey = `agent:${reviewerAgentId}:workflow:review:${i}`;

    const reply = await runAgentStep({
      sessionKey,
      message: buildReviewPrompt(currentPlan, i),
      extraSystemPrompt: "You are WorkflowReviewer. Reply with JSON only.",
      timeoutMs: 60_000,
      lane: AGENT_LANE_SUBAGENT,
      model: opts.model,
      thinking,
    });

    if (!reply?.trim()) {
      log.warn(
        `workflow[${opts.agentId}]: review iteration ${i} returned empty — treating as approved`,
      );
      iterations.push({
        iteration: i,
        approved: true,
        autoApproved: true,
        feedback: "No response from reviewer — auto-approved.",
      });
      break;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(reply);
    } catch {
      log.warn(
        `workflow[${opts.agentId}]: review iteration ${i} returned invalid JSON — treating as approved`,
      );
      iterations.push({
        iteration: i,
        approved: true,
        autoApproved: true,
        feedback: reply.trim(),
      });
      break;
    }

    const result = ReviewResultSchema.safeParse(parsed);
    if (!result.success) {
      log.warn(
        `workflow[${opts.agentId}]: review iteration ${i} schema mismatch — treating as approved`,
      );
      iterations.push({
        iteration: i,
        approved: true,
        autoApproved: true,
        feedback: reply.trim(),
      });
      break;
    }

    const reviewData = result.data;
    iterations.push({
      iteration: i,
      approved: reviewData.approved,
      feedback: reviewData.feedback,
      suggestedChanges: reviewData.suggestedChanges,
      revisedPlan: reviewData.revisedPlan,
    });

    if (reviewData.approved) {
      currentPlan = applyRevisedPlan(currentPlan, reviewData.revisedPlan);
      log.info(`workflow[${opts.agentId}]: plan approved on iteration ${i}`);
      break;
    }

    // Apply revisions and continue.
    currentPlan = applyRevisedPlan(currentPlan, reviewData.revisedPlan);
    log.info(`workflow[${opts.agentId}]: review iteration ${i} — not approved, revising`);
  }

  // If max iterations reached without approval, proceed with best effort.
  if (iterations.length > 0 && !iterations[iterations.length - 1]?.approved) {
    log.warn(
      `workflow[${opts.agentId}]: max review iterations reached — proceeding with best plan`,
    );
  }

  return { plan: currentPlan, iterations };
}
