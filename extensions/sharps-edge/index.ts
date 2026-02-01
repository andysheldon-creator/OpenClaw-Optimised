/**
 * SHARPS EDGE Builder Edition - OpenClaw Extension Plugin
 *
 * Transforms OpenClaw from a general-purpose assistant into a disciplined
 * autonomous builder agent governed by the Nine Laws.
 *
 * Hooks:
 *  - before_agent_start: Injects project charter + build status + tasks
 *  - before_tool_call: Runs 6 conflict detection checks (can block)
 *  - after_tool_call: Cost tracking + audit logging
 *  - message_received: Audit logging
 *  - gateway_stop: Persist cost state
 *
 * CLI:
 *  - openclaw sharps status|tasks|costs|logs|conflicts
 *
 * Chat commands:
 *  - /sharps-status (bypasses LLM)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { registerAuditLogger } from "./src/audit-logger.js";
import { registerCharterLoader } from "./src/charter-loader.js";
import { registerSharpsEdgeCli } from "./src/cli/register.js";
import { registerConflictDetector } from "./src/conflict-detector.js";
import { registerCostTracker } from "./src/cost-tracker.js";
import { createSeverityRouter } from "./src/severity-router.js";
import type { SharpsEdgeConfig } from "./src/types.js";

const sharpsEdgePlugin = {
  id: "sharps-edge",
  name: "SHARPS EDGE Builder Edition",
  description:
    "Project-scoped builder agent with conflict detection, cost tracking, and audit logging. Governed by the Nine Laws.",

  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig ?? {}) as SharpsEdgeConfig;

    api.logger.info?.("sharps-edge: Initializing Builder Edition...");

    // 1. Audit logger (foundation - other components depend on it)
    const auditLogger = registerAuditLogger(api, cfg);

    // 2. Cost tracker (needs audit logger for alerts)
    const costTracker = registerCostTracker(api, cfg, auditLogger);

    // 3. Severity router (needs audit logger)
    const _severityRouter = createSeverityRouter(api, cfg, auditLogger);

    // 4. Charter context injection (before_agent_start)
    registerCharterLoader(api, cfg);

    // 5. Conflict detection (before_tool_call, needs audit logger + cost tracker)
    registerConflictDetector(
      api,
      cfg,
      auditLogger,
      () => costTracker.getBudgetRatio(),
    );

    // 6. CLI commands (needs cost tracker for budget display)
    registerSharpsEdgeCli(api, cfg, costTracker);

    api.logger.info?.("sharps-edge: Builder Edition ready. Nine Laws active.");
  },
};

export default sharpsEdgePlugin;
