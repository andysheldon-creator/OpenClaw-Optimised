import type { DelegationMetrics } from "../agents/delegation-types.js";
import {
  resolveAgentConfig,
  resolveAgentRole,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { getAllDelegations, getAgentDelegationMetrics } from "../agents/delegation-registry.js";
import {
  listAllSubagentRuns,
  type SubagentRunRecord,
  type SubagentUsage,
} from "../agents/subagent-registry.js";
import { loadConfig } from "../config/config.js";
import { onAgentEvent } from "../infra/agent-events.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { getAllCollaborativeSessions } from "./server-methods/collaboration.js";

export type HierarchyEventType =
  | "spawn"
  | "start"
  | "end"
  | "error"
  | "usage-update"
  | "full-refresh"
  | "delegation-created"
  | "delegation-reviewed"
  | "delegation-completed";

export type HierarchyEvent = {
  type: HierarchyEventType;
  timestamp: number;
  runId?: string;
  sessionKey?: string;
  parentSessionKey?: string;
  label?: string;
  task?: string;
  status?: "running" | "completed" | "error" | "pending";
  outcome?: { status: string; error?: string };
};

export type HierarchyNode = {
  sessionKey: string;
  runId?: string;
  agentId?: string;
  agentRole?: string;
  label?: string;
  task?: string;
  status: "running" | "completed" | "error" | "pending";
  startedAt?: number;
  endedAt?: number;
  children: HierarchyNode[];
  usage?: SubagentUsage;
  interactionCount?: number;
  delegations?: DelegationMetrics;
};

export type CollaborationEdge = {
  source: string; // agentId
  target: string; // agentId
  type:
    | "proposal"
    | "challenge"
    | "agreement"
    | "decision"
    | "clarification"
    | "delegation"
    | "request"
    | "approval"
    | "rejection";
  topic?: string;
};

export type HierarchySnapshot = {
  roots: HierarchyNode[];
  collaborationEdges: CollaborationEdge[];
  updatedAt: number;
};

type HierarchyBroadcast = (
  event: string,
  payload: unknown,
  opts?: { dropIfSlow?: boolean },
) => void;

let hierarchyBroadcast: HierarchyBroadcast | null = null;
let listenerStop: (() => void) | null = null;
let lastEventSeq = 0;

function extractAgentIdFromSessionKey(sessionKey: string): string | undefined {
  const parsed = parseAgentSessionKey(sessionKey);
  return parsed?.agentId ?? undefined;
}

function buildHierarchySnapshot(): HierarchySnapshot {
  const runs = listAllSubagentRuns();
  const cfg = loadConfig();
  const childrenByParent = new Map<string, HierarchyNode[]>();
  const nodeBySession = new Map<string, HierarchyNode>();
  const childSessionKeys = new Set<string>();

  // First pass: create nodes for all runs
  for (const run of runs) {
    const status = resolveStatus(run);
    const agentId = extractAgentIdFromSessionKey(run.childSessionKey);
    const agentRole = agentId ? resolveAgentRole(cfg, agentId) : undefined;
    const agentName = agentId ? resolveAgentConfig(cfg, agentId)?.name : undefined;
    // Compute delegation metrics and interaction count for this agent
    const delegMetrics = agentId ? getAgentDelegationMetrics(agentId) : undefined;
    let interactionCount = 0;
    if (run.usage) {
      interactionCount += run.usage.toolCalls;
      interactionCount += Math.floor((run.usage.inputTokens + run.usage.outputTokens) / 10_000);
    }
    if (delegMetrics) {
      interactionCount += delegMetrics.sent + delegMetrics.received;
    }

    const node: HierarchyNode = {
      sessionKey: run.childSessionKey,
      runId: run.runId,
      agentId,
      agentRole,
      label: run.label || agentName || (agentId ? `Agent: ${agentId}` : undefined),
      task: run.task,
      status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      children: [],
      usage: run.usage,
      interactionCount,
      delegations: delegMetrics,
    };

    nodeBySession.set(run.childSessionKey, node);
    childSessionKeys.add(run.childSessionKey);

    const parentKey = run.requesterSessionKey;
    if (!childrenByParent.has(parentKey)) {
      childrenByParent.set(parentKey, []);
    }
    childrenByParent.get(parentKey)!.push(node);
  }

  // Second pass: link children
  for (const [parentKey, children] of childrenByParent.entries()) {
    const parentNode = nodeBySession.get(parentKey);
    if (parentNode) {
      parentNode.children = children;
    }
  }

  // Find roots: parents that are not themselves children
  const roots: HierarchyNode[] = [];
  const rootSessionKeysUsed = new Set<string>();
  const parentKeys = new Set(childrenByParent.keys());
  for (const parentKey of parentKeys) {
    if (!childSessionKeys.has(parentKey)) {
      const children = childrenByParent.get(parentKey) ?? [];
      if (children.length > 0) {
        const rootAgentId = extractAgentIdFromSessionKey(parentKey);
        const rootRole = rootAgentId ? resolveAgentRole(cfg, rootAgentId) : undefined;
        const rootName = rootAgentId ? resolveAgentConfig(cfg, rootAgentId)?.name : undefined;
        const rootNode: HierarchyNode = {
          sessionKey: parentKey,
          agentId: rootAgentId,
          agentRole: rootRole,
          label: rootName || (rootAgentId ? `Agent: ${rootAgentId}` : "Root Session"),
          status: "running",
          children,
        };
        roots.push(rootNode);
        rootSessionKeysUsed.add(parentKey);
      }
    }
  }

  // Always include the default (orchestrator) agent as a root,
  // even when no subagents have been spawned yet.
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const defaultSessionKey = `agent:${defaultAgentId}:main`;
  if (!rootSessionKeysUsed.has(defaultSessionKey)) {
    const defaultRole = resolveAgentRole(cfg, defaultAgentId);
    const defaultName = resolveAgentConfig(cfg, defaultAgentId)?.name;
    roots.unshift({
      sessionKey: defaultSessionKey,
      agentId: defaultAgentId,
      agentRole: defaultRole,
      label: defaultName || `Agent: ${defaultAgentId}`,
      status: "running",
      children: [],
    });
  }

  // Extract collaboration edges from active sessions
  const collaborationEdges: CollaborationEdge[] = [];
  try {
    const sessions = getAllCollaborativeSessions();
    for (const session of sessions) {
      const members = session.members;
      // Build edges from messages: each message implies interaction with all other members
      for (const msg of session.messages) {
        for (const member of members) {
          if (member !== msg.from) {
            collaborationEdges.push({
              source: msg.from,
              target: member,
              type: msg.type,
              topic: session.topic,
            });
          }
        }
      }
      // Build edges from decision proposals: proposer interacts with all who challenged/agreed
      for (const decision of session.decisions) {
        const proposers = decision.proposals.map((p) => p.from);
        // Each proposer connects to other proposers (they debated)
        for (let i = 0; i < proposers.length; i++) {
          for (let j = i + 1; j < proposers.length; j++) {
            collaborationEdges.push({
              source: proposers[i],
              target: proposers[j],
              type: "proposal",
              topic: decision.topic,
            });
          }
        }
      }
    }
  } catch {
    // Collaboration data is optional — don't break hierarchy if it fails
  }

  // Extract delegation edges from active delegations
  try {
    const allDelegations = getAllDelegations();
    for (const deleg of allDelegations) {
      let edgeType: CollaborationEdge["type"];
      if (deleg.state === "rejected") {
        edgeType = "rejection";
      } else if (
        deleg.state === "completed" ||
        deleg.state === "assigned" ||
        deleg.state === "in_progress"
      ) {
        edgeType = deleg.direction === "upward" ? "approval" : "delegation";
      } else if (deleg.state === "pending_review") {
        edgeType = "request";
      } else if (deleg.state === "redirected") {
        edgeType = "delegation";
      } else {
        edgeType = deleg.direction === "downward" ? "delegation" : "request";
      }

      collaborationEdges.push({
        source: deleg.fromAgentId,
        target: deleg.toAgentId,
        type: edgeType,
        topic: deleg.task.slice(0, 80),
      });

      // If redirected, add edge to the redirect target
      if (deleg.redirectedTo) {
        collaborationEdges.push({
          source: deleg.toAgentId,
          target: deleg.redirectedTo.agentId,
          type: "delegation",
          topic: deleg.redirectedTo.reason.slice(0, 80),
        });
      }
    }
  } catch {
    // Delegation data is optional
  }

  return {
    roots,
    collaborationEdges,
    updatedAt: Date.now(),
  };
}

function resolveStatus(run: SubagentRunRecord): HierarchyNode["status"] {
  if (run.outcome) {
    return run.outcome.status === "ok" ? "completed" : "error";
  }
  return run.startedAt ? "running" : "pending";
}

function broadcastHierarchyEvent(event: HierarchyEvent) {
  if (!hierarchyBroadcast) {
    return;
  }
  lastEventSeq++;
  const payload = {
    ...event,
    seq: lastEventSeq,
    snapshot: buildHierarchySnapshot(),
  };
  hierarchyBroadcast("hierarchy", payload, { dropIfSlow: true });
}

export function initHierarchyEventBroadcaster(broadcast: HierarchyBroadcast) {
  hierarchyBroadcast = broadcast;

  if (listenerStop) {
    listenerStop();
    listenerStop = null;
  }

  listenerStop = onAgentEvent((evt) => {
    if (!evt || evt.stream !== "lifecycle") {
      return;
    }

    const phase = evt.data?.phase;
    const runId = evt.runId;

    if (phase === "spawn") {
      const parentSessionKey =
        typeof evt.data?.parentSessionKey === "string" ? evt.data.parentSessionKey : undefined;
      const label = typeof evt.data?.label === "string" ? evt.data.label : undefined;
      const task = typeof evt.data?.task === "string" ? evt.data.task : undefined;
      broadcastHierarchyEvent({
        type: "spawn",
        timestamp: Date.now(),
        runId,
        sessionKey: evt.sessionKey,
        parentSessionKey,
        label,
        task,
        status: "pending",
      });
      return;
    }

    if (phase === "start") {
      broadcastHierarchyEvent({
        type: "start",
        timestamp: Date.now(),
        runId,
        sessionKey: evt.sessionKey,
        status: "running",
      });
      return;
    }

    if (phase === "end") {
      broadcastHierarchyEvent({
        type: "end",
        timestamp: Date.now(),
        runId,
        sessionKey: evt.sessionKey,
        status: "completed",
        outcome: { status: "ok" },
      });
      return;
    }

    if (phase === "error") {
      const errorMsg = typeof evt.data?.error === "string" ? evt.data.error : undefined;
      broadcastHierarchyEvent({
        type: "error",
        timestamp: Date.now(),
        runId,
        sessionKey: evt.sessionKey,
        status: "error",
        outcome: { status: "error", error: errorMsg },
      });
      return;
    }

    if (phase === "usage-update") {
      broadcastHierarchyEvent({
        type: "usage-update",
        timestamp: Date.now(),
        runId,
        sessionKey: evt.sessionKey,
        status: "running",
      });
      return;
    }
  });
}

export function broadcastHierarchySpawn(params: {
  runId: string;
  childSessionKey: string;
  parentSessionKey: string;
  label?: string;
  task: string;
}) {
  broadcastHierarchyEvent({
    type: "spawn",
    timestamp: Date.now(),
    runId: params.runId,
    sessionKey: params.childSessionKey,
    parentSessionKey: params.parentSessionKey,
    label: params.label,
    task: params.task,
    status: "pending",
  });
}

export function broadcastHierarchyFullRefresh() {
  broadcastHierarchyEvent({
    type: "full-refresh",
    timestamp: Date.now(),
  });
}

export function stopHierarchyEventBroadcaster() {
  if (listenerStop) {
    listenerStop();
    listenerStop = null;
  }
  hierarchyBroadcast = null;
}

export function getHierarchySnapshot(): HierarchySnapshot {
  return buildHierarchySnapshot();
}
