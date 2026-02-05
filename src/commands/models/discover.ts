import type { RuntimeEnv } from "../../runtime.js";
import { loadModelCatalog } from "../../agents/model-catalog.js";
import { modelsScanCommand } from "./scan.js";
import { updateConfig } from "./shared.js";

export async function modelsDiscoverCommand(
  opts: { providers?: string; json?: boolean; setDefault?: boolean; yes?: boolean },
  runtime: RuntimeEnv,
) {
  // Load local discovered models (via pi-model-discovery)
  const catalog = await loadModelCatalog();

  // Filter catalog for provider hints (windsurf, cursor, antigravity)
  const providerFilter = (opts.providers ?? "").trim().toLowerCase();
  const interesting = catalog.filter((entry) => {
    const p = entry.provider.toLowerCase();
    if (providerFilter) {
      return p.includes(providerFilter);
    }
    return p.includes("windsurf") || p.includes("cursor") || p.includes("antigravity");
  });

  const results: Array<{ modelRef: string; provider: string; name: string }> = [];
  for (const entry of interesting) {
    results.push({ modelRef: `${entry.provider}/${entry.id}`, provider: entry.provider, name: entry.name });
  }

  // Also include OpenRouter free models via existing scan (non-probing by default)
  try {
    const scanResults = await modelsScanCommand({ provider: "openrouter", noProbe: true, json: false, maxCandidates: "6" } as any, runtime as any);
    // modelsScanCommand prints and updates config itself; here we only attempt to include discovered entries.
  } catch (e) {
    // ignore errors from scan (we'll still report catalog models)
  }

  if (opts.json) {
    runtime.log(JSON.stringify({ discovered: results }, null, 2));
    return;
  }

  if (results.length === 0) {
    runtime.log("No local catalog models found for Windsurf/Cursor/Antigravity.");
  } else {
    runtime.log("Discovered local catalog models:");
    for (const r of results) {
      runtime.log(` - ${r.modelRef} (${r.name})`);
    }
  }

  if (opts.setDefault && results.length > 0) {
    await updateConfig((cfg) => {
      const nextModels = { ...(cfg.agents?.defaults?.models ?? {}) } as Record<string, unknown>;
      for (const r of results) {
        if (!nextModels[r.modelRef]) {
          nextModels[r.modelRef] = {};
        }
      }
      const existingModel = cfg.agents?.defaults?.model as
        | { primary?: string; fallbacks?: string[] }
        | undefined;
      const defaults = {
        ...(cfg.agents?.defaults ?? {}),
        model: {
          ...(existingModel?.primary ? { primary: existingModel.primary } : undefined),
          fallbacks: results.map((r) => r.modelRef),
          ...(opts.setDefault ? { primary: results[0].modelRef } : {}),
        },
        models: nextModels,
      } satisfies NonNullable<NonNullable<typeof cfg.agents>["defaults"]>;
      return {
        ...cfg,
        agents: {
          ...cfg.agents,
          defaults,
        },
      };
    });
    runtime.log(`Configured ${results.length} discovered models as fallbacks.`);
  }
}

export default modelsDiscoverCommand;
