import { updateConfig } from "../commands/models/shared.js";
import { loadModelCatalog } from "./model-catalog.js";
import { scanOpenRouterModels } from "./model-scan.js";

export type RotationOptions = {
  date?: Date;
  maxCandidates?: number;
  includeOpenRouter?: boolean;
  probe?: boolean;
};

function scoreOpenRouterEntry(entry: any) {
  let score = 0;
  if (entry.isFree) score += 100;
  if (entry.tool?.ok) score += 50;
  if (entry.image?.ok) score += 20;
  score += (entry.inferredParamB ?? 0) * 5;
  // lower latency better
  const latency = entry.tool?.latencyMs ?? entry.image?.latencyMs ?? Infinity;
  if (typeof latency === "number" && isFinite(latency)) {
    score += Math.max(0, 50 - Math.min(50, Math.round(latency / 20)));
  }
  return score;
}

export async function computeDailyRotation(opts: RotationOptions = {}) {
  const date = opts.date ?? new Date();
  const catalog = await loadModelCatalog();
  const max = opts.maxCandidates ?? 6;

  const localPreferred = catalog
    .filter((e) => {
      const p = e.provider.toLowerCase();
      return p.includes("windsurf") || p.includes("cursor") || p.includes("antigravity");
    })
    .map((e) => ({ modelRef: `${e.provider}/${e.id}`, score: 200 }));

  let openRouterResults: any[] = [];
  if (opts.includeOpenRouter) {
    try {
      openRouterResults = await scanOpenRouterModels({ probe: Boolean(opts.probe) } as any);
    } catch (e) {
      // ignore
      openRouterResults = [];
    }
  }

  const scored = openRouterResults.map((r) => ({
    modelRef: r.modelRef,
    score: scoreOpenRouterEntry(r),
  }));

  const combined = [...localPreferred, ...scored];

  // deterministic daily shuffle: sort by (score, hash(date+modelRef))
  const dayKey = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  function dayHash(s: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    }
    return h;
  }

  combined.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ha = dayHash(`${dayKey}:${a.modelRef}`);
    const hb = dayHash(`${dayKey}:${b.modelRef}`);
    return ha - hb;
  });

  const unique = [] as string[];
  for (const c of combined) {
    if (!unique.includes(c.modelRef)) unique.push(c.modelRef);
    if (unique.length >= max) break;
  }

  return unique;
}

export async function applyRotationToConfig(opts: RotationOptions & { setPrimary?: boolean } = {}) {
  const list = await computeDailyRotation(opts);
  if (list.length === 0) return list;
  await updateConfig((cfg) => {
    const nextModels = { ...(cfg.agents?.defaults?.models ?? {}) } as Record<string, unknown>;
    for (const m of list) {
      if (!nextModels[m]) nextModels[m] = {};
    }
    const existingModel = cfg.agents?.defaults?.model as
      | { primary?: string; fallbacks?: string[] }
      | undefined;
    const defaults = {
      ...(cfg.agents?.defaults ?? {}),
      model: {
        ...(existingModel?.primary ? { primary: existingModel.primary } : undefined),
        fallbacks: list,
        ...(opts.setPrimary ? { primary: list[0] } : {}),
      },
      models: nextModels,
    } as NonNullable<NonNullable<typeof cfg.agents>["defaults"]>;
    return { ...cfg, agents: { ...cfg.agents, defaults } };
  });
  return list;
}

export default { computeDailyRotation, applyRotationToConfig };
