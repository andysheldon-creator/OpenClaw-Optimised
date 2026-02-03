import type { HealthSummary } from "../../commands/health.js";
import { callGateway } from "../../gateway/call.js";

const TIMEOUT_MS = 8000;

export async function fetchHealth(): Promise<HealthSummary> {
  return callGateway<HealthSummary>({
    method: "health",
    params: { probe: true },
    timeoutMs: TIMEOUT_MS,
  });
}
