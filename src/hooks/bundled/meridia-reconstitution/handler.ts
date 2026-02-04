/**
 * Meridia Reconstitution Bootstrap Handler
 *
 * Hooks into agent:bootstrap to inject recent experiential context
 * from the Meridia continuity engine. This is the "morning briefing"
 * system — every new session starts with awareness of recent
 * significant events.
 */

import type { WorkspaceBootstrapFile } from "../../../agents/workspace.js";
import type { OpenClawConfig } from "../../../config/config.js";
import type { HookConfig } from "../../../config/types.js";
import type { HookHandler } from "../../hooks.js";
import { resolveHookConfig } from "../../config.js";

const reconstitutionHandler: HookHandler = async (event) => {
  // Only handle agent:bootstrap events
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  const context = event.context as {
    bootstrapFiles?: WorkspaceBootstrapFile[];
    cfg?: OpenClawConfig;
    sessionKey?: string;
  };

  if (!context || !Array.isArray(context.bootstrapFiles)) {
    return;
  }

  const cfg = context.cfg;

  // Read hook-specific configuration
  const hookCfg = resolveHookConfig(cfg, "meridia-reconstitution");

  // Check if explicitly disabled
  if (hookCfg?.enabled === false) {
    return;
  }

  // Parse configuration options
  const maxTokens = readPositiveNumber(hookCfg, "maxTokens", 2000);
  const lookbackHours = readPositiveNumber(hookCfg, "lookbackHours", 48);
  const minScore = readPositiveNumber(hookCfg, "minScore", 0.6);

  try {
    const { generateReconstitution } = await import("../../../meridia/reconstitute.js");

    const result = await generateReconstitution({
      config: cfg,
      maxTokens,
      lookbackHours,
      minScore,
    });

    if (!result || !result.text) {
      // No experiential context available — silent skip
      return;
    }

    // Inject as a bootstrap file
    const reconFile: WorkspaceBootstrapFile = {
      filename: "MERIDIA-CONTEXT.md",
      content: result.text,
      role: "system",
    };

    context.bootstrapFiles.push(reconFile);

    console.log(
      `[meridia-reconstitution] Injected ${result.estimatedTokens} tokens from ${result.recordCount} records (${result.sessionCount} sessions)`,
    );
  } catch (err) {
    // Non-fatal — session starts without experiential context
    console.error(
      `[meridia-reconstitution] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

function readPositiveNumber(
  hookCfg: HookConfig | undefined,
  key: string,
  fallback: number,
): number {
  if (!hookCfg) return fallback;
  const val = hookCfg[key];
  if (typeof val === "number" && Number.isFinite(val) && val > 0) {
    return val;
  }
  if (typeof val === "string") {
    const parsed = Number(val.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

export default reconstitutionHandler;
