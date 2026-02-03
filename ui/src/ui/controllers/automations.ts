import type { GatewayBrowserClient } from "../gateway";
import { showDangerConfirmDialog } from "../components/confirm-dialog";
import { toast } from "../components/toast";

export type AutomationStatus = "active" | "suspended" | "error";
export type AutomationType = "smart-sync-fork" | "custom-script" | "webhook";

export interface AutomationSchedule {
  type: "at" | "every" | "cron";
  atMs?: number;
  everyMs?: number;
  expr?: string;
  tz?: string;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  type: AutomationType;
  status: AutomationStatus;
  enabled: boolean;
  schedule: AutomationSchedule;
  nextRunAt?: number;
  lastRun?: {
    at: number;
    status: "success" | "failed" | "running";
    durationMs?: number;
    summary?: string;
  };
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRunRecord {
  id: string;
  automationId: string;
  automationName: string;
  startedAt: number;
  completedAt?: number;
  status: "success" | "failed" | "running" | "cancelled";
  summary?: string;
  error?: string;
  durationMs?: number;
  timeline: AutomationRunMilestone[];
  artifacts: AutomationArtifact[];
  conflicts: AutomationConflict[];
  aiModel?: {
    name: string;
    version: string;
    tokensUsed: number;
    cost: string;
  };
}

export interface AutomationRunMilestone {
  id: string;
  title: string;
  status: "completed" | "current" | "pending";
  timestamp?: string;
}

export interface AutomationArtifact {
  id: string;
  name: string;
  type: string;
  size: string;
  url: string;
}

export interface AutomationConflict {
  type: string;
  description: string;
  resolution: string;
}

export type AutomationsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  automations: Automation[];
  searchQuery: string;
  statusFilter: "all" | AutomationStatus;
  error: string | null;
  selectedId: string | null;
  expandedIds: Set<string>;
  runningIds: Set<string>;
};

// Status configuration for rendering
export const statusConfig: Record<
  AutomationStatus,
  { icon: string; class: string; label: string }
> = {
  active: { icon: "check-circle", class: "status-active", label: "Active" },
  suspended: { icon: "pause", class: "status-suspended", label: "Suspended" },
  error: { icon: "alert-circle", class: "status-error", label: "Error" },
};

export async function loadAutomations(state: AutomationsState) {
  if (!state.client || !state.connected || state.loading) return;

  state.loading = true;
  state.error = null;
  try {
    const res = (await state.client.request("automations.list", {}, { timeoutMs: 10_000 })) as {
      automations?: Automation[];
    };
    state.automations = res.automations ?? [];
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to load automations");
  } finally {
    state.loading = false;
  }
}

export async function runAutomation(state: AutomationsState, id: string) {
  if (!state.client || !state.connected) return;

  state.runningIds.add(id);
  try {
    await state.client.request("automations.run", { id }, { timeoutMs: 30_000 });
    toast.success("Automation started");
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to start automation");
  } finally {
    state.runningIds.delete(id);
  }
}

export async function toggleSuspendAutomation(state: AutomationsState, id: string) {
  if (!state.client || !state.connected) return;

  const automation = state.automations.find((a) => a.id === id);
  if (!automation) return;

  const newStatus = automation.status === "suspended" ? "active" : "suspended";
  const enabled = newStatus === "active";

  try {
    await state.client.request("automations.update", { id, enabled });
    state.automations = state.automations.map((a) =>
      a.id === id ? { ...a, enabled, status: newStatus } : a,
    );
    toast.success(`Automation ${newStatus === "active" ? "resumed" : "suspended"}`);
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to update automation");
  }
}

export async function deleteAutomation(state: AutomationsState, id: string) {
  const automation = state.automations.find((a) => a.id === id);
  if (!automation) return;

  const confirmed = await showDangerConfirmDialog(
    "Delete Automation",
    `Delete automation "${automation.name}"? This action cannot be undone.`,
    "Delete",
  );

  if (!confirmed) return;

  if (!state.client || !state.connected) return;

  try {
    await state.client.request("automations.delete", { id });
    state.automations = state.automations.filter((a) => a.id !== id);
    toast.success("Automation deleted");
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to delete automation");
  }
}

export function setSearchQuery(state: AutomationsState, query: string) {
  state.searchQuery = query;
}

export function setStatusFilter(state: AutomationsState, filter: AutomationsState["statusFilter"]) {
  state.statusFilter = filter;
}

export function toggleExpand(state: AutomationsState, id: string) {
  if (state.expandedIds.has(id)) {
    state.expandedIds.delete(id);
  } else {
    state.expandedIds.add(id);
  }
}

// Filter automations based on search and status
export function filterAutomations(state: AutomationsState): Automation[] {
  return state.automations.filter((automation) => {
    const matchesSearch =
      automation.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      (automation.description ?? "").toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesStatus = state.statusFilter === "all" || automation.status === state.statusFilter;
    return matchesSearch && matchesStatus;
  });
}

// Run history state and functions
export interface AutomationRunHistoryState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  records: AutomationRunRecord[];
  expandedRows: Set<string>;
  currentPage: number;
  statusFilter: "all" | "success" | "failed" | "running";
  dateFrom: string;
  dateTo: string;
  itemsPerPage: number;
  error: string | null;
  automationId: string | null;
}

export async function loadAutomationRuns(
  state: AutomationRunHistoryState,
  automationId: string,
  limit = 50,
) {
  if (!state.client || !state.connected) return;

  state.loading = true;
  state.error = null;
  state.automationId = automationId;
  try {
    const res = (await state.client.request(
      "automations.history",
      { id: automationId, limit },
      { timeoutMs: 10_000 },
    )) as {
      records?: AutomationRunRecord[];
    };
    state.records = res.records ?? [];
    state.currentPage = 1;
  } catch (err) {
    state.error = String(err);
    toast.error("Failed to load run history");
  } finally {
    state.loading = false;
  }
}

export function toggleHistoryRow(state: AutomationRunHistoryState, id: string): void {
  if (state.expandedRows.has(id)) {
    state.expandedRows.delete(id);
  } else {
    state.expandedRows.add(id);
  }
}

export function getFilteredHistoryData(state: AutomationRunHistoryState): AutomationRunRecord[] {
  return state.records.filter((record) => {
    if (state.statusFilter !== "all" && record.status !== state.statusFilter) return false;
    if (state.dateFrom && record.startedAt < new Date(state.dateFrom).getTime()) return false;
    if (state.dateTo && record.startedAt > new Date(state.dateTo).getTime()) return false;
    return true;
  });
}

export function getTotalHistoryPages(
  state: AutomationRunHistoryState,
  filteredData: AutomationRunRecord[],
): number {
  return Math.ceil(filteredData.length / state.itemsPerPage);
}

export function getPaginatedHistoryData(
  state: AutomationRunHistoryState,
  filteredData: AutomationRunRecord[],
): AutomationRunRecord[] {
  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  return filteredData.slice(startIndex, startIndex + state.itemsPerPage);
}

export function clearHistoryFilters(state: AutomationRunHistoryState): void {
  state.statusFilter = "all";
  state.dateFrom = "";
  state.dateTo = "";
}

// Progress modal state and functions
export interface ProgressModalState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  isOpen: boolean;
  automationName: string;
  currentMilestone: string;
  progress: number;
  milestones: AutomationRunMilestone[];
  elapsedTime: string;
  conflicts: number;
  status: "running" | "complete" | "failed" | "cancelled";
  sessionId: string;
  automationId: string;
}

export async function cancelAutomation(state: ProgressModalState): Promise<void> {
  if (!state.client || !state.connected) return;

  try {
    await state.client.request("automations.cancel", { id: state.automationId });
    state.status = "cancelled";
    toast.success("Automation cancelled");
  } catch (err) {
    toast.error("Failed to cancel automation");
  }
}

export function jumpToChat(state: ProgressModalState): void {
  window.location.hash = `#sessions?sessionId=${state.sessionId}`;
}

// Form state and functions
export interface AutomationFormState {
  currentStep: number;
  errors: Partial<Record<string, string>>;
  formData: {
    name: string;
    description: string;
    scheduleType: "at" | "every" | "cron";
    scheduleAt: string;
    scheduleEveryAmount: string;
    scheduleEveryUnit: "minutes" | "hours" | "days";
    scheduleCronExpr: string;
    scheduleCronTz: string;
    type: AutomationType;
    config: Record<string, unknown>;
  };
}

export const AUTOMATION_FORM_STEPS = [
  { id: 1, title: "Basic Info", description: "Name and description", icon: "file-text" },
  { id: 2, title: "Schedule", description: "Sync frequency", icon: "clock" },
  { id: 3, title: "Configuration", description: "Automation settings", icon: "settings" },
] as const;

export function setFormField(state: AutomationFormState, field: string, value: unknown): void {
  (state.formData as any)[field] = value;
  if (state.errors[field]) {
    delete state.errors[field];
  }
}

export function validateFormStep(state: AutomationFormState, step: number): boolean {
  const newErrors: Partial<Record<string, string>> = {};

  if (step === 1) {
    if (!state.formData.name.trim()) newErrors.name = "Name is required";
  }
  if (step === 2) {
    if (state.formData.scheduleType === "cron" && !state.formData.scheduleCronExpr.trim()) {
      newErrors.scheduleCronExpr = "Cron expression is required";
    }
    if (state.formData.scheduleType === "at" && !state.formData.scheduleAt) {
      newErrors.scheduleAt = "Run time is required";
    }
  }

  state.errors = newErrors;
  return Object.keys(newErrors).length === 0;
}

export function nextFormStep(state: AutomationFormState): void {
  if (validateFormStep(state, state.currentStep)) {
    state.currentStep = Math.min(state.currentStep + 1, AUTOMATION_FORM_STEPS.length);
  }
}

export function prevFormStep(state: AutomationFormState): void {
  state.currentStep = Math.max(state.currentStep - 1, 1);
}

export async function createAutomation(
  state: AutomationsState,
  formState: AutomationFormState,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;

  try {
    let schedule: AutomationSchedule;
    switch (formState.formData.scheduleType) {
      case "at":
        const ms = Date.parse(formState.formData.scheduleAt);
        if (!Number.isFinite(ms)) throw new Error("Invalid run time.");
        schedule = { type: "at", atMs: ms };
        break;
      case "every":
        const amount = Number(formState.formData.scheduleEveryAmount) || 1;
        const unit = formState.formData.scheduleEveryUnit;
        const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
        schedule = { type: "every", everyMs: amount * mult };
        break;
      case "cron":
        if (!formState.formData.scheduleCronExpr.trim()) {
          throw new Error("Cron expression is required.");
        }
        schedule = {
          type: "cron",
          expr: formState.formData.scheduleCronExpr.trim(),
          tz: formState.formData.scheduleCronTz.trim() || undefined,
        };
        break;
    }

    await state.client.request("automations.create", {
      name: formState.formData.name.trim(),
      description: formState.formData.description.trim() || undefined,
      type: formState.formData.type,
      schedule,
      enabled: true,
      config: formState.formData.config,
    });

    toast.success("Automation created");
    await loadAutomations(state);
    return true;
  } catch (err) {
    state.error = String(err);
    toast.error(`Failed to create automation: ${err}`);
    return false;
  }
}

// Artifact download function
export async function downloadArtifact(
  client: GatewayBrowserClient | null,
  connected: boolean,
  artifactId: string,
): Promise<string | null> {
  if (!client || !connected) {
    toast.error("Not connected to gateway");
    return null;
  }

  try {
    const res = (await client.request(
      "automations.artifact.download",
      { artifactId },
      { timeoutMs: 30_000 },
    )) as {
      url?: string;
      expiresAt?: number;
    };

    if (!res.url) {
      toast.error("Failed to get download URL");
      return null;
    }

    return res.url;
  } catch (err) {
    toast.error(`Failed to get download URL: ${err}`);
    return null;
  }
}
