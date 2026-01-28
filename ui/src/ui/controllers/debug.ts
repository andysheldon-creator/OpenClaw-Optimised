import type { GatewayBrowserClient } from "../gateway";
import type { HealthSnapshot, StatusSummary } from "../types";

export type DebugState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown | null;
  debugCronJobs: unknown[];
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
};

export async function loadDebug(state: DebugState) {
  if (!state.client || !state.connected) return;
  if (state.debugLoading) return;
  state.debugLoading = true;
  try {
    const [status, health, models, heartbeat, cronJobs] = await Promise.all([
      state.client.request("status", {}),
      state.client.request("health", {}),
      state.client.request("models.list", {}),
      state.client.request("last-heartbeat", {}),
      state.client.request("cron.list", {}).catch(() => ({ jobs: [] })),
    ]);
    state.debugStatus = status as StatusSummary;
    state.debugHealth = health as HealthSnapshot;
    const modelPayload = models as { models?: unknown[] } | undefined;
    state.debugModels = Array.isArray(modelPayload?.models)
      ? modelPayload?.models
      : [];
    state.debugHeartbeat = heartbeat as unknown;
    const cronPayload = cronJobs as { jobs?: unknown[] } | undefined;
    state.debugCronJobs = Array.isArray(cronPayload?.jobs) ? cronPayload.jobs : [];
  } catch (err) {
    state.debugCallError = String(err);
  } finally {
    state.debugLoading = false;
  }
}

export async function loadDebugStatus(state: DebugState) {
  if (!state.client || !state.connected) return;
  try {
    const status = await state.client.request("status", {});
    state.debugStatus = status as StatusSummary;
  } catch {
    // Silently fail; status cards will show stale or N/A
  }
}

export async function loadDebugHeartbeat(state: DebugState) {
  if (!state.client || !state.connected) return;
  try {
    const heartbeat = await state.client.request("last-heartbeat", {});
    state.debugHeartbeat = heartbeat as unknown;
  } catch {
    // Silently fail
  }
}

export async function callDebugMethod(state: DebugState) {
  if (!state.client || !state.connected) return;
  state.debugCallError = null;
  state.debugCallResult = null;
  try {
    const params = state.debugCallParams.trim()
      ? (JSON.parse(state.debugCallParams) as unknown)
      : {};
    const res = await state.client.request(state.debugCallMethod.trim(), params);
    state.debugCallResult = JSON.stringify(res, null, 2);
  } catch (err) {
    state.debugCallError = String(err);
  }
}
