import type { OverseerPlan } from "../../../infra/overseer/store.types.js";
import type { DiscoveryResult, GatewayCallFn, WorkflowLogger, WorkflowPlan } from "../types.js";
import { generateOverseerPlan } from "../../../infra/overseer/planner.js";
import { aggregateDiscoveryReports } from "../report.js";

/**
 * Run the decompose phase: use the Overseer planner to generate a DAG
 * from the approved plan + discovery findings.
 */
export async function runDecomposePhase(opts: {
  plan: WorkflowPlan;
  discoveryResults: DiscoveryResult[];
  agentId: string;
  model?: string;
  thinking?: string;
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
}): Promise<OverseerPlan> {
  const { plan, discoveryResults, agentId, log } = opts;
  // Enforce minimum thinking level of "high" for decomposition.
  const thinking = opts.thinking ?? "high";

  // Aggregate discovery findings into context.
  const { consolidatedFindings, allInsights, allBlockers } =
    aggregateDiscoveryReports(discoveryResults);

  // Build enriched problem statement.
  const problemParts: string[] = [plan.scope, "", "## Discovery Findings", consolidatedFindings];

  if (allInsights.length > 0) {
    problemParts.push("", "## Key Insights");
    for (const insight of allInsights) {
      problemParts.push(`- ${insight}`);
    }
  }

  if (allBlockers.length > 0) {
    problemParts.push("", "## Known Blockers");
    for (const blocker of allBlockers) {
      problemParts.push(`- ${blocker}`);
    }
  }

  const problemStatement = problemParts.join("\n");

  // Build constraints including workflow plan constraints + discovery blockers.
  const constraints = [
    ...plan.constraints,
    ...(allBlockers.length > 0 ? [`Known blockers to address: ${allBlockers.join("; ")}`] : []),
  ];

  log.info(`workflow[${agentId}]: starting decompose phase (thinking: ${thinking})`);

  const result = await generateOverseerPlan({
    goalTitle: plan.intent,
    problemStatement,
    successCriteria: plan.successCriteria,
    constraints,
    repoContextSnapshot: consolidatedFindings,
    agentId,
    modelOverride: opts.model,
    thinkingOverride: thinking,
  });

  log.info(
    `workflow[${agentId}]: decompose phase completed — ${result.plan.phases.length} phase(s)`,
  );

  return result.plan;
}
