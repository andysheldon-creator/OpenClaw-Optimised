import type { loadConfig } from "../config/config.js";
import { setCommandLaneConcurrency } from "../process/command-queue.js";

export function applyGatewayLaneConcurrency(cfg: ReturnType<typeof loadConfig>) {
  setCommandLaneConcurrency("cron", cfg.cron?.maxConcurrentRuns ?? 1);
  setCommandLaneConcurrency("main", cfg.agents?.defaults?.maxConcurrent ?? 1);
  // Unlimited by default; users can cap via config if needed
  setCommandLaneConcurrency("subagent", cfg.agents?.defaults?.subagents?.maxConcurrent ?? Infinity);
}
