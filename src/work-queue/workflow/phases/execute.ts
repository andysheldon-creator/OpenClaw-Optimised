import crypto from "node:crypto";
import type { OverseerPlan } from "../../../infra/overseer/store.types.js";
import type { ExecutionProgress, GatewayCallFn, WorkflowLogger } from "../types.js";
import { AGENT_LANE_SUBAGENT } from "../../../agents/lanes.js";
import { readLatestAssistantReply } from "../../../agents/tools/agent-step.js";

const DEFAULT_NODE_TIMEOUT_S = 300;

type FlatNode = {
  id: string;
  name: string;
  objective?: string;
  acceptanceCriteria?: string[];
  dependsOn?: string[];
  phaseName: string;
  taskName: string;
};

/**
 * Flatten the DAG into a topologically sorted list of leaf nodes (subtasks).
 */
function flattenDag(plan: OverseerPlan): FlatNode[] {
  const nodes: FlatNode[] = [];

  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      for (const subtask of task.subtasks) {
        nodes.push({
          id: subtask.id,
          name: subtask.name,
          objective: subtask.objective,
          acceptanceCriteria: subtask.acceptanceCriteria,
          dependsOn: subtask.dependsOn,
          phaseName: phase.name,
          taskName: task.name,
        });
      }
    }
  }

  // Topological sort based on dependencies.
  return topologicalSort(nodes);
}

function topologicalSort(nodes: FlatNode[]): FlatNode[] {
  const nodeMap = new Map<string, FlatNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: FlatNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) {
      return;
    }
    if (visiting.has(nodeId)) {
      throw new Error(`Cycle detected in execution DAG at node "${nodeId}"`);
    }
    visiting.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) {
      visiting.delete(nodeId);
      return;
    }
    for (const depId of node.dependsOn ?? []) {
      visit(depId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    sorted.push(node);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return sorted;
}

function buildNodeSystemPrompt(node: FlatNode, priorContext: string[]): string {
  const parts: string[] = [
    "## Execution Node",
    `**Phase:** ${node.phaseName}`,
    `**Task:** ${node.taskName}`,
    `**Subtask:** ${node.name}`,
  ];

  if (node.objective) {
    parts.push(`**Objective:** ${node.objective}`);
  }

  if (node.acceptanceCriteria && node.acceptanceCriteria.length > 0) {
    parts.push("**Acceptance Criteria:**");
    for (const criteria of node.acceptanceCriteria) {
      parts.push(`- ${criteria}`);
    }
  }

  if (priorContext.length > 0) {
    parts.push("", "## Prior Context (from completed nodes)");
    parts.push(priorContext.slice(-5).join("\n\n"));
  }

  parts.push("", "## Instructions");
  parts.push(
    "Complete the subtask described above. When finished, summarize what you accomplished in your final message.",
  );

  return parts.join("\n");
}

export async function runExecutePhase(opts: {
  dag: OverseerPlan;
  agentId: string;
  model?: string;
  thinking?: string;
  sessionTimeoutSeconds?: number;
  callGateway: GatewayCallFn;
  log: WorkflowLogger;
  onProgress?: (progress: ExecutionProgress) => void;
}): Promise<ExecutionProgress> {
  const { dag, agentId, log } = opts;
  const timeoutS = opts.sessionTimeoutSeconds ?? DEFAULT_NODE_TIMEOUT_S;

  const nodes = flattenDag(dag);
  const progress: ExecutionProgress = {
    totalNodes: nodes.length,
    completedNodes: 0,
    failedNodes: 0,
  };

  if (nodes.length === 0) {
    log.info(`workflow[${agentId}]: no execution nodes — nothing to execute`);
    return progress;
  }

  log.info(`workflow[${agentId}]: executing ${nodes.length} node(s) sequentially`);

  const priorContext: string[] = [];

  for (const node of nodes) {
    progress.currentNodeId = node.id;
    opts.onProgress?.(progress);

    const runId = crypto.randomUUID();
    const sessionKey = `agent:${agentId}:workflow:exec:${node.id}:${runId.slice(0, 8)}`;
    const systemPrompt = buildNodeSystemPrompt(node, priorContext);

    log.info(`workflow[${agentId}]: executing node ${node.id} "${node.name}"`);

    try {
      // Spawn agent session for this node.
      const spawnResult = await opts.callGateway<{ runId: string }>({
        method: "agent",
        params: {
          message: `Execute: ${node.name}${node.objective ? ` — ${node.objective}` : ""}`,
          sessionKey,
          idempotencyKey: runId,
          deliver: false,
          lane: AGENT_LANE_SUBAGENT,
          extraSystemPrompt: systemPrompt,
          model: opts.model,
          thinking: opts.thinking,
          timeout: timeoutS,
          label: `Workflow node: ${node.name}`,
          spawnedBy: `workflow:${agentId}`,
        },
        timeoutMs: 10_000,
      });

      const actualRunId = spawnResult?.runId ?? runId;

      // Wait for completion.
      const waitResult = await opts.callGateway<{
        status?: string;
        error?: string;
      }>({
        method: "agent.wait",
        params: {
          runId: actualRunId,
          timeoutMs: timeoutS * 1000,
        },
        timeoutMs: timeoutS * 1000 + 5000,
      });

      const nodeStatus = waitResult?.status === "ok" ? "ok" : "error";

      // Read result for context carryover.
      let reply: string | undefined;
      try {
        reply = await readLatestAssistantReply({ sessionKey });
      } catch {
        // Best-effort.
      }

      if (nodeStatus === "ok") {
        progress.completedNodes++;
        if (reply) {
          priorContext.push(`[${node.name}] ${reply.slice(0, 500)}`);
        }
        log.info(`workflow[${agentId}]: node ${node.id} completed successfully`);
      } else {
        progress.failedNodes++;
        log.warn(`workflow[${agentId}]: node ${node.id} failed: ${waitResult?.error ?? "unknown"}`);
      }

      // Clean up session (best-effort).
      opts
        .callGateway({
          method: "sessions.delete",
          params: { key: sessionKey, deleteTranscript: true },
          timeoutMs: 10_000,
        })
        .catch(() => {});
    } catch (err) {
      progress.failedNodes++;
      log.error(`workflow[${agentId}]: node ${node.id} error: ${String(err)}`);
    }
  }

  progress.currentNodeId = undefined;
  log.info(
    `workflow[${agentId}]: execute phase completed — ${progress.completedNodes}/${progress.totalNodes} succeeded, ${progress.failedNodes} failed`,
  );

  return progress;
}
