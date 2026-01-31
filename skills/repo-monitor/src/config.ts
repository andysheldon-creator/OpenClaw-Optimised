/**
 * Repo Monitor V2 - Configuration
 */

import type { MonitorConfig } from "./types.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");

export function getConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  return {
    repo: overrides.repo ?? process.env.REPO ?? "openclaw/openclaw",
    intervalHours: overrides.intervalHours ?? parseInt(process.env.INTERVAL_HOURS ?? "4", 10),
    stateFile: overrides.stateFile ?? process.env.STATE_FILE ?? resolve(SKILL_ROOT, "state.json"),
    reportsDir: overrides.reportsDir ?? process.env.REPORTS_DIR ?? resolve(SKILL_ROOT, "reports"),
    skillsDir: overrides.skillsDir ?? resolve(SKILL_ROOT, ".."),
    historyFile: overrides.historyFile ?? process.env.HISTORY_FILE ?? resolve(SKILL_ROOT, "history.json"),
    dashboardFile: overrides.dashboardFile ?? process.env.DASHBOARD_FILE ?? resolve(SKILL_ROOT, "dashboard.html"),
  };
}

export const SKILL_ROOT_PATH = SKILL_ROOT;
