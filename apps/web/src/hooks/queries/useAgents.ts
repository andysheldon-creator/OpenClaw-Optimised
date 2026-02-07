import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { listAgents, getAgentStatus, type GatewayAgent, type AgentStatusEntry } from "@/lib/api";
import { useGateway } from "@/providers";
import { useAgentStore } from "@/stores/useAgentStore";
import { useGatewayEnabled } from "../useGatewayEnabled";

// Re-export types from store for consistency
export type { Agent, AgentStatus } from "../../stores/useAgentStore";
import type { Agent, AgentStatus } from "../../stores/useAgentStore";

// Query keys factory for type-safe cache management
export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, "detail"] as const,
  detail: (id: string, mode?: "live" | "mock") => [...agentKeys.details(), id, mode] as const,
};

const mockAgents: Agent[] = [
  {
    id: "1",
    name: "Research Assistant",
    role: "Researcher",
    model: "anthropic/claude-3.5-sonnet",
    runtime: "pi",
    status: "online",
    description: "Helps with research tasks and information gathering",
    tags: ["research", "analysis", "data"],
    taskCount: 5,
    lastActive: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Code Helper",
    role: "Developer",
    model: "openai/gpt-4o",
    runtime: "pi",
    status: "busy",
    currentTask: "Refactoring routing guardrails",
    description: "Assists with coding, debugging, and code reviews",
    tags: ["code", "debug", "review"],
    taskCount: 3,
    lastActive: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "3",
    name: "Writing Coach",
    role: "Editor",
    model: "anthropic/claude-3-opus",
    runtime: "pi",
    status: "online",
    description: "Helps improve writing and provides editorial feedback",
    tags: ["writing", "editing", "grammar"],
    taskCount: 2,
    lastActive: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "4",
    name: "Task Manager",
    role: "Coordinator",
    model: "openai/gpt-4-turbo",
    runtime: "pi",
    status: "paused",
    currentTask: "Approve tool access for export flow",
    pendingApprovals: 2,
    pendingToolCallIds: ["tool-approval-1", "tool-approval-2"],
    description: "Coordinates tasks and manages workflows",
    tags: ["tasks", "coordination", "planning"],
    taskCount: 8,
    lastActive: new Date(Date.now() - 86400000).toISOString(),
  },
];

async function fetchMockAgents(): Promise<Agent[]> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockAgents;
}

/**
 * Map a GatewayAgent (from agents.list RPC) to our UI Agent type.
 */
function mapGatewayAgentToAgent(ga: GatewayAgent, statusEntry?: AgentStatusEntry): Agent {
  const healthToStatus: Record<string, AgentStatus> = {
    active: "online",
    idle: "online",
    stalled: "busy",
    errored: "offline",
  };

  return {
    id: ga.id,
    name: ga.name,
    role: "Assistant",
    model: ga.model,
    status: statusEntry ? (healthToStatus[statusEntry.health] ?? "offline") : "offline",
    description: ga.systemPrompt,
    tags: statusEntry?.tags ?? [],
    taskCount: statusEntry?.sessionCount ?? 0,
    lastActive: statusEntry?.lastActivityAt
      ? new Date(statusEntry.lastActivityAt).toISOString()
      : undefined,
    currentTask: statusEntry?.currentTask,
    pendingApprovals: statusEntry?.pendingApprovals,
  };
}

async function fetchAgents(liveMode: boolean): Promise<Agent[]> {
  if (!liveMode) {
    return fetchMockAgents();
  }
  try {
    // Fetch agents from the agents.list RPC
    const agentsResult = await listAgents();

    // Try to get live status info to enrich agent data
    let statusMap: Map<string, AgentStatusEntry> | undefined;
    try {
      const statusSnapshot = await getAgentStatus(true);
      statusMap = new Map(statusSnapshot.agents.map((a) => [a.id, a]));
    } catch {
      // Status endpoint may not be available; continue without it
    }

    return agentsResult.agents.map((ga) =>
      mapGatewayAgentToAgent(ga, statusMap?.get(ga.id))
    );
  } catch {
    return fetchMockAgents();
  }
}

async function fetchAgent(id: string, liveMode: boolean): Promise<Agent | null> {
  const agents = await fetchAgents(liveMode);
  return agents.find((a) => a.id === id) ?? null;
}

async function fetchAgentsByStatus(status: Agent["status"], liveMode: boolean): Promise<Agent[]> {
  const agents = await fetchAgents(liveMode);
  return agents.filter((a) => a.status === status);
}

// Query hooks
export function useAgents() {
  const { isConnected } = useGateway();
  const gatewayEnabled = useGatewayEnabled();
  const liveMode = gatewayEnabled || isConnected;
  const modeKey = liveMode ? "live" : "mock";
  const upsertAgents = useAgentStore((s) => s.upsertAgents);
  const storeAgents = useAgentStore((s) => s.agents);

  const query = useQuery({
    queryKey: agentKeys.list({ mode: modeKey }),
    queryFn: () => fetchAgents(liveMode),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  React.useEffect(() => {
    if (query.data && query.data.length > 0) {
      upsertAgents(query.data);
    }
  }, [query.data, upsertAgents]);

  const mergedAgents = React.useMemo(() => {
    if (!query.data) {return query.data;}
    if (storeAgents.length === 0) {return query.data;}
    const byId = new Map(storeAgents.map((agent) => [agent.id, agent]));
    return query.data.map((agent) => {
      const live = byId.get(agent.id);
      if (!live) {return agent;}
      return {
        ...agent,
        ...live,
        currentTask: live.currentTask ?? agent.currentTask,
        pendingApprovals: live.pendingApprovals ?? agent.pendingApprovals,
        pendingToolCallIds: live.pendingToolCallIds ?? agent.pendingToolCallIds,
      };
    });
  }, [query.data, storeAgents]);

  return {
    ...query,
    data: mergedAgents,
  };
}

export function useAgent(id: string) {
  const { isConnected } = useGateway();
  const gatewayEnabled = useGatewayEnabled();
  const liveMode = gatewayEnabled || isConnected;
  const modeKey = liveMode ? "live" : "mock";
  return useQuery({
    queryKey: agentKeys.detail(id, modeKey),
    queryFn: () => fetchAgent(id, liveMode),
    enabled: !!id,
  });
}

export function useAgentsByStatus(status: Agent["status"]) {
  const { isConnected } = useGateway();
  const gatewayEnabled = useGatewayEnabled();
  const liveMode = gatewayEnabled || isConnected;
  const modeKey = liveMode ? "live" : "mock";
  return useQuery({
    queryKey: agentKeys.list({ status, mode: modeKey }),
    queryFn: () => fetchAgentsByStatus(status, liveMode),
    enabled: !!status,
  });
}
