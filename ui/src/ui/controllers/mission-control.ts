import type { AppViewState } from "../app-view-state.ts";

export const DEFAULT_MC_FORM = {
  type: "task",
  title: "",
  description: "",
  priority: 0,
  agent_id: null,
  tags: null,
};

export type MissionControlJob = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: "pending" | "running" | "review" | "revising" | "done" | "failed" | "success";
  priority: number;
  agent_id: string | null;
  created_at: number;
  updated_at: number | null;
  started_at: number | null;
  finished_at: number | null;
  result_summary: string | null;
  error_message: string | null;
  tags: string | null;
  session_key: string | null;
  fail_count: number;
  verifier_last_confidence: number | null;
  pr_number: number | null;
  pr_url: string | null;
  revision_count: number;
};

export type MissionControlListResult = {
  ok: boolean;
  jobs: MissionControlJob[];
};

export async function loadMissionControlTasks(state: AppViewState): Promise<void> {
  if (!state.connected) {
    return;
  }

  state.missionControlLoading = true;
  state.missionControlError = null;

  try {
    const result = await state.client?.request("missionControl.list", {});
    if (result?.ok && result.jobs) {
      state.missionControlTasks = result.jobs as MissionControlJob[];
    } else {
      state.missionControlError = "Failed to load tasks";
    }
  } catch (error) {
    state.missionControlError = String(error);
  } finally {
    state.missionControlLoading = false;
  }
}

export async function deleteMissionControlTask(state: AppViewState, taskId: string): Promise<void> {
  if (!state.connected) {
    return;
  }

  try {
    const result = await state.client?.request("missionControl.delete", { id: taskId });
    if (result?.ok) {
      // Reload tasks after successful delete
      await loadMissionControlTasks(state);
    } else {
      state.missionControlError = "Failed to delete task";
    }
  } catch (error) {
    state.missionControlError = String(error);
  }
}

export async function createMissionControlTask(
  state: AppViewState,
  task: Omit<MissionControlJob, "id" | "created_at" | "updated_at">,
): Promise<void> {
  if (!state.connected) {
    return;
  }

  try {
    const result = await state.client?.callMethod("missionControl.create", task);
    if (result?.ok) {
      await loadMissionControlTasks(state);
    } else {
      state.missionControlError = "Failed to create task";
    }
  } catch (error) {
    state.missionControlError = String(error);
  }
}

export async function updateMissionControlTaskStatus(
  state: AppViewState,
  taskId: string,
  status: MissionControlJob["status"],
): Promise<void> {
  if (!state.connected) {
    return;
  }

  try {
    const result = await state.client?.callMethod("missionControl.updateStatus", {
      id: taskId,
      status,
    });
    if (result?.ok) {
      await loadMissionControlTasks(state);
    } else {
      state.missionControlError = "Failed to update task status";
    }
  } catch (error) {
    state.missionControlError = String(error);
  }
}

export async function spawnAgentForTask(
  state: AppViewState,
  taskId: string,
  agentId?: string,
): Promise<void> {
  if (!state.connected) {
    return;
  }

  try {
    const result = await state.client?.callMethod("missionControl.spawn", {
      taskId,
      agentId,
    });
    if (!result?.ok) {
      state.missionControlError = "Failed to spawn agent for task";
    }
  } catch (error) {
    state.missionControlError = String(error);
  }
}
