import crypto from "node:crypto";
import type { MarketingAction, MarketingAdapterKind } from "./types.js";

export type MarketingPlanCampaignKeyword = {
  text: string;
  matchType?: "exact" | "phrase" | "broad";
  bidUsd?: number;
};

export type MarketingPlanAd = {
  headline: string;
  description: string;
  finalUrl: string;
  state?: "enabled" | "paused";
};

export type MarketingPlanAdGroup = {
  name: string;
  keywords: MarketingPlanCampaignKeyword[];
  ads: MarketingPlanAd[];
};

export type MarketingPlanCampaign = {
  name: string;
  objective: string;
  dailyBudgetUsd: number;
  status: "enabled" | "paused";
  targeting: {
    locations: string[];
    languages?: string[];
  };
  adGroups: MarketingPlanAdGroup[];
};

export type MarketingPlan = {
  title: string;
  accountId: string;
  mode: "dry-run" | "live";
  preferredAdapter?: MarketingAdapterKind | "auto";
  constraints?: {
    maxDailyBudgetDeltaUsd?: number;
    maxBidDeltaPct?: number;
    blockCampaignActivation?: boolean;
  };
  campaigns: MarketingPlanCampaign[];
};

export type MarketingCompileResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  actionGraphHash?: string;
  actions: MarketingAction[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateMarketingPlan(input: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["Plan payload must be an object."] };
  }
  const plan = input as Partial<MarketingPlan>;

  if (!isNonEmptyString(plan.title)) {
    errors.push("title is required");
  }
  if (!isNonEmptyString(plan.accountId)) {
    errors.push("accountId is required");
  }
  if (plan.mode !== "dry-run" && plan.mode !== "live") {
    errors.push("mode must be dry-run or live");
  }
  if (!Array.isArray(plan.campaigns) || plan.campaigns.length === 0) {
    errors.push("campaigns must contain at least one campaign");
  }

  for (const [campaignIndex, campaign] of (plan.campaigns ?? []).entries()) {
    if (!campaign || typeof campaign !== "object") {
      errors.push(`campaign[${campaignIndex}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(campaign.name)) {
      errors.push(`campaign[${campaignIndex}].name is required`);
    }
    if (!Number.isFinite(campaign.dailyBudgetUsd) || (campaign.dailyBudgetUsd ?? 0) < 0) {
      errors.push(`campaign[${campaignIndex}].dailyBudgetUsd must be a non-negative number`);
    }
    if (campaign.status !== "enabled" && campaign.status !== "paused") {
      errors.push(`campaign[${campaignIndex}].status must be enabled or paused`);
    }
    if (!campaign.targeting || !Array.isArray(campaign.targeting.locations)) {
      errors.push(`campaign[${campaignIndex}].targeting.locations is required`);
    }
    if (!Array.isArray(campaign.adGroups) || campaign.adGroups.length === 0) {
      errors.push(`campaign[${campaignIndex}].adGroups must contain at least one ad group`);
      continue;
    }

    for (const [groupIndex, adGroup] of campaign.adGroups.entries()) {
      if (!isNonEmptyString(adGroup.name)) {
        errors.push(`campaign[${campaignIndex}].adGroups[${groupIndex}].name is required`);
      }
      if (!Array.isArray(adGroup.keywords)) {
        errors.push(`campaign[${campaignIndex}].adGroups[${groupIndex}].keywords must be an array`);
      }
      if (!Array.isArray(adGroup.ads) || adGroup.ads.length === 0) {
        errors.push(
          `campaign[${campaignIndex}].adGroups[${groupIndex}].ads must contain at least one ad`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function hashActionGraph(actions: MarketingAction[]): string {
  const payload = actions.map((action) => ({
    id: action.id,
    type: action.type,
    adapter: action.adapter,
    accountId: action.accountId,
    campaignName: action.campaignName,
    adGroupName: action.adGroupName,
    payload: action.payload,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function createDeterministicActionId(params: {
  accountId: string;
  type: MarketingAction["type"];
  campaignName: string;
  adGroupName?: string;
  payload: Record<string, unknown>;
  ordinal: number;
}): string {
  const seed = JSON.stringify({
    accountId: params.accountId,
    type: params.type,
    campaignName: params.campaignName,
    adGroupName: params.adGroupName ?? "",
    payload: params.payload,
    ordinal: params.ordinal,
  });
  const digest = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `act-${digest}`;
}

function classifyRisk(params: {
  dailyBudgetUsd?: number;
  bidUsd?: number;
  campaignStatus?: string;
}): MarketingAction["risk"] {
  const budget = params.dailyBudgetUsd ?? 0;
  const bid = params.bidUsd ?? 0;

  if (params.campaignStatus === "enabled" && budget >= 2_000) {
    return "critical";
  }
  if (budget >= 1_000 || bid >= 15) {
    return "high";
  }
  if (budget >= 250 || bid >= 5) {
    return "medium";
  }
  return "low";
}

function chooseAdapter(plan: MarketingPlan, fallback: MarketingAdapterKind): MarketingAdapterKind {
  if (plan.preferredAdapter === "browser" || plan.preferredAdapter === "cli") {
    return plan.preferredAdapter;
  }
  return fallback;
}

export function compileMarketingPlan(
  input: unknown,
  opts?: { defaultAdapter?: MarketingAdapterKind },
): MarketingCompileResult {
  const validation = validateMarketingPlan(input);
  if (!validation.ok) {
    return {
      valid: false,
      errors: validation.errors,
      warnings: [],
      actions: [],
    };
  }

  const plan = input as MarketingPlan;
  const actions: MarketingAction[] = [];
  const warnings: string[] = [];
  const defaultAdapter = opts?.defaultAdapter ?? "browser";
  let ordinal = 0;

  for (const campaign of plan.campaigns) {
    const campaignPayload = {
      objective: campaign.objective,
      status: campaign.status,
      dailyBudgetUsd: campaign.dailyBudgetUsd,
      targeting: campaign.targeting,
    };
    actions.push({
      id: createDeterministicActionId({
        accountId: plan.accountId,
        type: "campaign.create_or_update",
        campaignName: campaign.name,
        payload: campaignPayload,
        ordinal: ordinal++,
      }),
      accountId: plan.accountId,
      type: "campaign.create_or_update",
      adapter: chooseAdapter(plan, defaultAdapter),
      campaignName: campaign.name,
      payload: campaignPayload,
      risk: classifyRisk({
        dailyBudgetUsd: campaign.dailyBudgetUsd,
        campaignStatus: campaign.status,
      }),
    });

    for (const adGroup of campaign.adGroups) {
      const groupPayload = {
        targeting: campaign.targeting,
      };
      actions.push({
        id: createDeterministicActionId({
          accountId: plan.accountId,
          type: "ad_group.create_or_update",
          campaignName: campaign.name,
          adGroupName: adGroup.name,
          payload: groupPayload,
          ordinal: ordinal++,
        }),
        accountId: plan.accountId,
        type: "ad_group.create_or_update",
        adapter: chooseAdapter(plan, defaultAdapter),
        campaignName: campaign.name,
        adGroupName: adGroup.name,
        payload: groupPayload,
        risk: classifyRisk({ dailyBudgetUsd: campaign.dailyBudgetUsd }),
      });

      for (const keyword of adGroup.keywords) {
        if (!isNonEmptyString(keyword.text)) {
          warnings.push(`Skipped empty keyword in ad group "${adGroup.name}".`);
          continue;
        }
        const keywordPayload = {
          keyword: keyword.text,
          matchType: keyword.matchType ?? "broad",
          bidUsd: keyword.bidUsd,
        };
        actions.push({
          id: createDeterministicActionId({
            accountId: plan.accountId,
            type: "keyword.add_or_update",
            campaignName: campaign.name,
            adGroupName: adGroup.name,
            payload: keywordPayload,
            ordinal: ordinal++,
          }),
          accountId: plan.accountId,
          type: "keyword.add_or_update",
          adapter: chooseAdapter(plan, defaultAdapter),
          campaignName: campaign.name,
          adGroupName: adGroup.name,
          payload: keywordPayload,
          risk: classifyRisk({
            dailyBudgetUsd: campaign.dailyBudgetUsd,
            bidUsd: keyword.bidUsd,
          }),
        });
      }

      for (const ad of adGroup.ads) {
        if (!isNonEmptyString(ad.finalUrl)) {
          warnings.push(`Skipped ad without finalUrl in ad group "${adGroup.name}".`);
          continue;
        }
        const adPayload = {
          headline: ad.headline,
          description: ad.description,
          finalUrl: ad.finalUrl,
          state: ad.state ?? "enabled",
        };
        actions.push({
          id: createDeterministicActionId({
            accountId: plan.accountId,
            type: "ad.add_or_pause",
            campaignName: campaign.name,
            adGroupName: adGroup.name,
            payload: adPayload,
            ordinal: ordinal++,
          }),
          accountId: plan.accountId,
          type: "ad.add_or_pause",
          adapter: chooseAdapter(plan, defaultAdapter),
          campaignName: campaign.name,
          adGroupName: adGroup.name,
          payload: adPayload,
          risk: classifyRisk({ dailyBudgetUsd: campaign.dailyBudgetUsd }),
        });
      }
    }
  }

  if (actions.length === 0) {
    return {
      valid: false,
      errors: ["No executable actions were generated from the plan."],
      warnings,
      actions: [],
    };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    actions,
    actionGraphHash: hashActionGraph(actions),
  };
}

export function actionRequiresApproval(action: MarketingAction): boolean {
  return action.risk === "high" || action.risk === "critical";
}

export function computeActionFingerprint(action: MarketingAction): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        type: action.type,
        accountId: action.accountId,
        campaignName: action.campaignName,
        adGroupName: action.adGroupName,
        payload: action.payload,
      }),
    )
    .digest("hex");
}
