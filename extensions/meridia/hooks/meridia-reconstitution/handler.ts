import type { OpenClawConfig } from "openclaw/plugin-sdk";
import crypto from "node:crypto";
import type { MeridiaTraceEvent } from "../../src/meridia/types.js";
import { resolveMeridiaPluginConfig } from "../../src/meridia/config.js";
import { createBackend } from "../../src/meridia/db/index.js";
import {
  type HookEvent,
  resolveHookConfig,
  readPositiveNumber,
  readBoolean,
} from "../../src/meridia/event.js";
import { resolveMeridiaDir } from "../../src/meridia/paths.js";
import { generateReconstitution } from "../../src/meridia/reconstitute.js";
// V2: Use enhanced reconstitution engine (Component 11)
import { generateEnhancedReconstitution } from "../../src/meridia/reconstitution/engine.js";
import { resolveTraceJsonlPath, appendJsonl } from "../../src/meridia/storage.js";

type WorkspaceBootstrapFile = {
  filename: string;
  content: string;
  role: "system" | "user";
};

// Local helpers removed — shared via event.js imports

const handler = async (event: HookEvent): Promise<void> => {
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  const context = (event.context ?? null) as {
    bootstrapFiles?: WorkspaceBootstrapFile[];
    cfg?: OpenClawConfig;
    sessionKey?: string;
  } | null;

  if (!context || !Array.isArray(context.bootstrapFiles)) {
    return;
  }

  const cfg = context.cfg;
  const hookCfg = resolveHookConfig(cfg, "meridia-reconstitution");
  if (hookCfg?.enabled === false) {
    return;
  }

  const maxTokens = readPositiveNumber(hookCfg, "maxTokens", 2000);
  const lookbackHours = readPositiveNumber(hookCfg, "lookbackHours", 48);
  const minScore = readPositiveNumber(hookCfg, "minScore", 0.6);
  const useEnhanced = readBoolean(hookCfg, "useEnhancedReconstitution", true);

  try {
    let resultText: string | undefined;

    if (useEnhanced) {
      // V2: Enhanced reconstitution with phenomenology and structured packs
      const enhanced = await generateEnhancedReconstitution({
        config: cfg,
        maxTokens,
        lookbackHours,
        minScore,
        sessionKey: context.sessionKey ?? event.sessionKey,
      });

      if (enhanced?.text) {
        resultText = enhanced.text;
      }
    }

    // Fallback to legacy reconstitution if enhanced returned nothing
    if (!resultText) {
      const legacy = await generateReconstitution({
        config: cfg,
        maxTokens,
        lookbackHours,
        minScore,
      });
      resultText = legacy?.text;
    }

    if (!resultText) {
      return;
    }

    context.bootstrapFiles.push({
      filename: "MERIDIA-CONTEXT.md",
      content: resultText,
      role: "system",
    });

    const ts = new Date().toISOString();
    const traceEvent: MeridiaTraceEvent = {
      id: crypto.randomUUID(),
      ts,
      kind: "bootstrap_inject",
      session: { key: context.sessionKey ?? event.sessionKey },
      decision: { decision: "capture" },
    };

    const meridiaDir = resolveMeridiaDir(cfg, "meridia-reconstitution");
    const tracePath = resolveTraceJsonlPath({ meridiaDir, date: event.timestamp });
    const writeTraceJsonl = resolveMeridiaPluginConfig(cfg).debug.writeTraceJsonl;
    try {
      const backend = createBackend({ cfg, hookKey: "meridia-reconstitution" });
      await backend.insertTraceEvent(traceEvent);
    } catch {
      // ignore
    }
    if (writeTraceJsonl) {
      await appendJsonl(tracePath, traceEvent);
    }
  } catch (err) {
    // Non-fatal — session starts without experiential context
    console.error(
      `[meridia-reconstitution] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export default handler;
