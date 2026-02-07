import { z } from "zod";
import type { WorkItem } from "../../types.js";
import type { GatewayCallFn, WorkflowLogger, WorkflowPlan } from "../types.js";
import { AGENT_LANE_SUBAGENT } from "../../../agents/lanes.js";
import { runAgentStep } from "../../../agents/tools/agent-step.js";

const MAX_REPAIR_ATTEMPTS = 2;

const WorkflowPlanSchema = z.object({
  intent: z.string().min(1),
  scope: z.string().min(1),
  discoveryQuestions: z.array(z.string()),
  constraints: z.array(z.string()),
  successCriteria: z.array(z.string()).min(1),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

function buildPlanPrompt(item: WorkItem): string {
  return [
    "You are a WorkflowPlanner. Analyze the following work item and produce a structured plan.",
    "",
    "## Work Item",
    `**Title:** ${item.title}`,
    item.description ? `**Description:** ${item.description}` : "",
    item.workstream ? `**Workstream:** ${item.workstream}` : "",
    item.payload && Object.keys(item.payload).length > 0
      ? `**Payload:**\n\`\`\`json\n${JSON.stringify(item.payload, null, 2)}\n\`\`\``
      : "",
    "",
    "## Requirements",
    "Output MUST be valid JSON only (no markdown, no commentary).",
    "Produce a plan object with these fields:",
    "- intent: What this work item aims to accomplish",
    "- scope: What is in-scope and what is out-of-scope",
    "- discoveryQuestions: Array of specific questions that need investigation before decomposition",
    "  (e.g. 'What is the current API surface of module X?', 'Are there existing tests for feature Y?')",
    "- constraints: Array of known constraints or limitations",
    "- successCriteria: Array of testable/verifiable criteria for completion",
    "- estimatedComplexity: 'low' | 'medium' | 'high'",
    "",
    "Focus on identifying what needs to be investigated (discoveryQuestions) to enable",
    "effective task decomposition in the next phase.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRepairPrompt(errors: string[], previousOutput: string): string {
  return [
    "Your previous output was invalid JSON or did not match the required schema.",
    "Return ONLY corrected JSON that matches the schema exactly. Do not add commentary.",
    "",
    "Validation errors:",
    errors.join("\n"),
    "",
    "Previous output:",
    previousOutput,
  ].join("\n");
}

export async function runPlanPhase(opts: {
  item: WorkItem;
  agentId: string;
  model?: string;
  thinking?: string;
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
}): Promise<WorkflowPlan> {
  const { item, agentId, log } = opts;
  const thinking = opts.thinking ?? "high";

  let validationErrors: string[] = [];
  let lastOutput = "";

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    // Reuse the same session across repair attempts so the agent has context
    // from prior attempts and can see what went wrong.
    const sessionKey = `agent:${agentId}:workflow:plan:${item.id}`;
    const message =
      attempt === 0 ? buildPlanPrompt(item) : buildRepairPrompt(validationErrors, lastOutput);

    const reply = await runAgentStep({
      sessionKey,
      message,
      extraSystemPrompt: "You are WorkflowPlanner. Reply with JSON only.",
      timeoutMs: 60_000,
      lane: AGENT_LANE_SUBAGENT,
      model: opts.model,
      thinking,
    });

    lastOutput = reply ?? "";
    if (!lastOutput.trim()) {
      validationErrors = ["empty planner output"];
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(lastOutput);
    } catch (err) {
      validationErrors = [err instanceof Error ? err.message : String(err)];
      continue;
    }

    const result = WorkflowPlanSchema.safeParse(parsed);
    if (!result.success) {
      validationErrors = result.error.issues.map((e) => e.message);
      continue;
    }

    log.info(`workflow[${agentId}]: plan phase completed for item ${item.id}`);
    return result.data;
  }

  throw new Error(`plan phase failed: ${validationErrors.join("; ")}`);
}
