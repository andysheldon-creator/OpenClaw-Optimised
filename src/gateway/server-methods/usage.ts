import type { CostUsageSummary } from "../../infra/session-cost-usage.js";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { loadProviderUsageSummary } from "../../infra/provider-usage.js";
import { loadCostUsageSummary } from "../../infra/session-cost-usage.js";
import { getSpendAggregator } from "../../infra/spend-ledger.js";

const COST_USAGE_CACHE_TTL_MS = 30_000;

type CostUsageCacheEntry = {
  summary?: CostUsageSummary;
  updatedAt?: number;
  inFlight?: Promise<CostUsageSummary>;
};

const costUsageCache = new Map<number, CostUsageCacheEntry>();

const VALID_GROUP_BY = new Set(["day", "provider", "model"]);

const parseGroupBy = (raw: unknown): "day" | "provider" | "model" | undefined => {
  if (typeof raw === "string" && VALID_GROUP_BY.has(raw)) {
    return raw as "day" | "provider" | "model";
  }
  return undefined;
};

const parseDays = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return 30;
};

async function loadCostUsageSummaryCached(params: {
  days: number;
  config: ReturnType<typeof loadConfig>;
}): Promise<CostUsageSummary> {
  const days = Math.max(1, params.days);
  const now = Date.now();
  const cached = costUsageCache.get(days);
  if (cached?.summary && cached.updatedAt && now - cached.updatedAt < COST_USAGE_CACHE_TTL_MS) {
    return cached.summary;
  }

  if (cached?.inFlight) {
    if (cached.summary) {
      return cached.summary;
    }
    return await cached.inFlight;
  }

  const entry: CostUsageCacheEntry = cached ?? {};
  const inFlight = loadCostUsageSummary({ days, config: params.config })
    .then((summary) => {
      costUsageCache.set(days, { summary, updatedAt: Date.now() });
      return summary;
    })
    .catch((err) => {
      if (entry.summary) {
        return entry.summary;
      }
      throw err;
    })
    .finally(() => {
      const current = costUsageCache.get(days);
      if (current?.inFlight === inFlight) {
        current.inFlight = undefined;
        costUsageCache.set(days, current);
      }
    });

  entry.inFlight = inFlight;
  costUsageCache.set(days, entry);

  if (entry.summary) {
    return entry.summary;
  }
  return await inFlight;
}

export const usageHandlers: GatewayRequestHandlers = {
  "usage.status": async ({ respond }) => {
    const summary = await loadProviderUsageSummary();
    respond(true, summary, undefined);
  },
  "usage.cost": async ({ respond, params }) => {
    const config = loadConfig();
    const days = parseDays(params?.days);
    const summary = await loadCostUsageSummaryCached({ days, config });
    respond(true, summary, undefined);
  },
  "usage.spend": ({ respond, params }) => {
    const days = parseDays(params?.days);
    const provider = typeof params?.provider === "string" ? params.provider : undefined;
    const model = typeof params?.model === "string" ? params.model : undefined;
    const agentId = typeof params?.agentId === "string" ? params.agentId : undefined;
    const groupBy = parseGroupBy(params?.groupBy);
    const summary = getSpendAggregator().query({ days, provider, model, agentId, groupBy });
    respond(true, summary, undefined);
  },
};
