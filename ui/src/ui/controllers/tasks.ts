import type { GatewayBrowserClient } from "../gateway";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStep = {
  id: string;
  index: number;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  result?: string;
  error?: string;
  startedAtMs?: number;
  completedAtMs?: number;
  retryCount?: number;
};

export type Task = {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "paused";
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
  steps: TaskStep[];
  currentStepIndex: number;
  finalSummary?: string;
  reportChannel: string;
  reportTo?: string;
};

export type TaskFormState = {
  name: string;
  description: string;
  steps: string; // newline-separated step descriptions
};

export const DEFAULT_TASK_FORM: TaskFormState = {
  name: "",
  description: "",
  steps: "",
};

// ── State ─────────────────────────────────────────────────────────────────────

export type TasksState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  tasksLoading: boolean;
  tasks: Task[];
  tasksError: string | null;
  tasksFilter: string;
  taskForm: TaskFormState;
  tasksBusy: boolean;
  taskDetail: Task | null;
};

// ── Load Tasks ────────────────────────────────────────────────────────────────

export async function loadTasks(state: TasksState) {
  if (!state.client || !state.connected) return;
  if (state.tasksLoading) return;
  state.tasksLoading = true;
  state.tasksError = null;
  try {
    const res = (await state.client.request("tasks.list", {})) as {
      tasks?: Task[];
    };
    state.tasks = Array.isArray(res?.tasks) ? res.tasks : [];
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksLoading = false;
  }
}

// ── Get Task Detail ───────────────────────────────────────────────────────────

export async function loadTaskDetail(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("tasks.get", { id: taskId })) as {
      task?: Task;
    };
    state.taskDetail = res?.task ?? null;
  } catch (err) {
    state.tasksError = String(err);
  }
}

// ── Create Task ───────────────────────────────────────────────────────────────

export async function createTask(state: TasksState) {
  if (!state.client || !state.connected) return;
  const form = state.taskForm;
  if (!form.name.trim()) {
    state.tasksError = "Task name is required.";
    return;
  }
  const stepLines = form.steps
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (stepLines.length === 0) {
    state.tasksError = "At least one step is required.";
    return;
  }

  state.tasksBusy = true;
  state.tasksError = null;
  try {
    await state.client.request("tasks.create", {
      name: form.name.trim(),
      description: form.description.trim() || form.name.trim(),
      steps: stepLines.map((desc) => ({
        description: desc,
        prompt: desc,
      })),
    });
    // Reset form and reload
    state.taskForm = { ...DEFAULT_TASK_FORM };
    await loadTasks(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}

// ── Cancel Task ───────────────────────────────────────────────────────────────

export async function cancelTask(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) return;
  state.tasksBusy = true;
  try {
    await state.client.request("tasks.cancel", { id: taskId });
    await loadTasks(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}

// ── Pause Task ────────────────────────────────────────────────────────────────

export async function pauseTask(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) return;
  state.tasksBusy = true;
  try {
    await state.client.request("tasks.pause", { id: taskId });
    await loadTasks(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}

// ── Resume Task ───────────────────────────────────────────────────────────────

export async function resumeTask(state: TasksState, taskId: string) {
  if (!state.client || !state.connected) return;
  state.tasksBusy = true;
  try {
    await state.client.request("tasks.resume", { id: taskId });
    await loadTasks(state);
  } catch (err) {
    state.tasksError = String(err);
  } finally {
    state.tasksBusy = false;
  }
}
