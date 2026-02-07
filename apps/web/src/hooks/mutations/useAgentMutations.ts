import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { uuidv7 } from "@/lib/ids";
import { getConfig, patchConfig } from "@/lib/api";
import {
  buildAgentEntry,
  buildAgentsPatch,
  getAgentsList,
  mapAgentEntryToAgent,
} from "@/lib/agents";
import type { Agent, AgentStatus } from "../queries/useAgents";
import { agentKeys } from "../queries/useAgents";
import { configKeys } from "../queries/useConfig";
import { useGatewayEnabled, useGatewayModeKey } from "../useGatewayEnabled";

type MutationSource = "gateway" | "mock";
type AgentResult = { agent: Agent; source: MutationSource };
type DeleteResult = { id: string; source: MutationSource };

// Mock API functions - retained for offline testing
async function createAgentMock(
  data: Omit<Agent, "id" | "lastActive">
): Promise<Agent> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    ...data,
    id: uuidv7(),
    lastActive: new Date().toISOString(),
  };
}

async function updateAgentMock(
  data: Partial<Agent> & { id: string }
): Promise<Agent> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return data as Agent;
}

async function deleteAgentMock(id: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return id;
}

async function updateAgentStatusMock(
  id: string,
  status: AgentStatus
): Promise<{ id: string; status: AgentStatus }> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { id, status };
}

async function resolveConfigSnapshot(): Promise<{ hash: string; config?: unknown } | null> {
  try {
    const snapshot = await getConfig();
    if (!snapshot?.hash) {return null;}
    return { hash: snapshot.hash, config: snapshot.config };
  } catch {
    return null;
  }
}

async function patchAgentsList(
  snapshot: { hash: string; config?: unknown },
  nextList: ReturnType<typeof getAgentsList>,
  note: string
) {
  const patch = buildAgentsPatch(snapshot.config, nextList);
  await patchConfig({
    baseHash: snapshot.hash,
    raw: JSON.stringify(patch),
    note,
  });
}

async function createAgentConfig(
  snapshot: { hash: string; config?: unknown },
  data: Omit<Agent, "id" | "lastActive">
): Promise<Agent> {
  const currentList = getAgentsList(snapshot.config);
  const id = uuidv7();
  const nextEntry = buildAgentEntry(
    {
      ...data,
      id,
    },
    undefined
  );
  const nextList = [...currentList, nextEntry];
  await patchAgentsList(snapshot, nextList, "Add agent");
  return mapAgentEntryToAgent(nextEntry);
}

async function updateAgentConfig(
  snapshot: { hash: string; config?: unknown },
  data: Partial<Agent> & { id: string }
): Promise<Agent> {
  const currentList = getAgentsList(snapshot.config);
  const existing = currentList.find((agent) => agent.id === data.id);
  if (!existing) {
    return updateAgentMock(data);
  }
  const nextEntry = buildAgentEntry(data, existing);
  const nextList = currentList.map((agent) =>
    agent.id === data.id ? nextEntry : agent
  );
  await patchAgentsList(snapshot, nextList, "Update agent");
  return mapAgentEntryToAgent(nextEntry);
}

async function deleteAgentConfig(
  snapshot: { hash: string; config?: unknown },
  id: string
): Promise<string> {
  const currentList = getAgentsList(snapshot.config);
  const nextList = currentList.filter((agent) => agent.id !== id);
  await patchAgentsList(snapshot, nextList, "Delete agent");
  return id;
}

// Mutation hooks
export function useCreateAgent() {
  const queryClient = useQueryClient();
  const liveMode = useGatewayEnabled();
  const modeKey = useGatewayModeKey();
  const listKey = agentKeys.list({ mode: modeKey });

  return useMutation({
    mutationFn: async (data: Omit<Agent, "id" | "lastActive">): Promise<AgentResult> => {
      if (!liveMode) {
        return { agent: await createAgentMock(data), source: "mock" };
      }
      const snapshot = await resolveConfigSnapshot();
      if (!snapshot) {
        return { agent: await createAgentMock(data), source: "mock" };
      }
      const agent = await createAgentConfig(snapshot, data);
      return { agent, source: "gateway" };
    },
    onSuccess: (result) => {
      const newAgent = result.agent;
      // Optimistically add to cache
      queryClient.setQueryData<Agent[]>(listKey, (old) =>
        old ? [...old, newAgent] : [newAgent]
      );
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      if (result.source === "gateway") {
        queryClient.invalidateQueries({ queryKey: configKeys.all });
      }
      toast.success("Agent created successfully");
    },
    onError: (error) => {
      toast.error(
        `Failed to create agent: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  const liveMode = useGatewayEnabled();
  const modeKey = useGatewayModeKey();
  const listKey = agentKeys.list({ mode: modeKey });

  return useMutation({
    mutationFn: async (
      data: Partial<Agent> & { id: string }
    ): Promise<AgentResult> => {
      if (!liveMode) {
        return { agent: await updateAgentMock(data), source: "mock" };
      }
      const snapshot = await resolveConfigSnapshot();
      if (!snapshot) {
        return { agent: await updateAgentMock(data), source: "mock" };
      }
      const agent = await updateAgentConfig(snapshot, data);
      return { agent, source: "gateway" };
    },
    onMutate: async (updatedAgent) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: agentKeys.detail(updatedAgent.id, modeKey),
      });

      // Snapshot previous value
      const previousAgent = queryClient.getQueryData<Agent>(
        agentKeys.detail(updatedAgent.id, modeKey)
      );

      // Optimistically update
      queryClient.setQueryData<Agent>(
        agentKeys.detail(updatedAgent.id, modeKey),
        (old) => (old ? { ...old, ...updatedAgent } : undefined)
      );

      return { previousAgent };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.detail(variables.id, modeKey),
      });
      queryClient.invalidateQueries({ queryKey: listKey });
      if (result.source === "gateway") {
        queryClient.invalidateQueries({ queryKey: configKeys.all });
      }
      toast.success("Agent updated successfully");
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousAgent) {
        queryClient.setQueryData(
          agentKeys.detail(variables.id, modeKey),
          context.previousAgent
        );
      }
      toast.error(
        `Failed to update agent: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const liveMode = useGatewayEnabled();
  const modeKey = useGatewayModeKey();
  const listKey = agentKeys.list({ mode: modeKey });

  return useMutation({
    mutationFn: async (id: string): Promise<DeleteResult> => {
      if (!liveMode) {
        return { id: await deleteAgentMock(id), source: "mock" };
      }
      const snapshot = await resolveConfigSnapshot();
      if (!snapshot) {
        return { id: await deleteAgentMock(id), source: "mock" };
      }
      const deletedId = await deleteAgentConfig(snapshot, id);
      return { id: deletedId, source: "gateway" };
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      const previousAgents = queryClient.getQueryData<Agent[]>(
        listKey
      );

      // Optimistically remove from list
      queryClient.setQueryData<Agent[]>(listKey, (old) =>
        old ? old.filter((agent) => agent.id !== id) : []
      );

      return { previousAgents };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
      if (result.source === "gateway") {
        queryClient.invalidateQueries({ queryKey: configKeys.all });
      }
      toast.success("Agent deleted successfully");
    },
    onError: (error, _, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(listKey, context.previousAgents);
      }
      toast.error(
        `Failed to delete agent: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });
}

export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  const modeKey = useGatewayModeKey();
  const listKey = agentKeys.list({ mode: modeKey });

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AgentStatus }) =>
      updateAgentStatusMock(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({
        queryKey: agentKeys.detail(id, modeKey),
      });

      const previousAgent = queryClient.getQueryData<Agent>(
        agentKeys.detail(id, modeKey)
      );

      queryClient.setQueryData<Agent>(
        agentKeys.detail(id, modeKey),
        (old) => (old ? { ...old, status } : undefined)
      );

      // Also update in list
      queryClient.setQueryData<Agent[]>(listKey, (old) =>
        old
          ? old.map((agent) =>
              agent.id === id ? { ...agent, status } : agent
            )
          : []
      );

      return { previousAgent };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.detail(variables.id, modeKey),
      });
      toast.success(`Agent status updated to ${variables.status}`);
    },
    onError: (_error, variables, context) => {
      if (context?.previousAgent) {
        queryClient.setQueryData(
          agentKeys.detail(variables.id, modeKey),
          context.previousAgent
        );
      }
      toast.error("Failed to update agent status");
    },
  });
}
