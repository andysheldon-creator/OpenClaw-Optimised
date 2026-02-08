export type GoogleAdsMutationActionType =
  | "campaign.create_or_update"
  | "ad_group.create_or_update"
  | "keyword.add_or_update"
  | "ad.add_or_pause";

export type GoogleAdsMutationAction = {
  id: string;
  accountId: string;
  type: GoogleAdsMutationActionType;
  campaignName: string;
  adGroupName?: string;
  resourceId?: string;
  payload: Record<string, unknown>;
};

export type GoogleAdsActionErrorCategory =
  | "validation"
  | "auth"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "unknown";

export type GoogleAdsMutationResult = {
  ok: boolean;
  actionId: string;
  adapter: "browser" | "cli";
  accountId: string;
  externalResourceId?: string;
  errorCategory?: GoogleAdsActionErrorCategory;
  errorMessage?: string;
  details: Record<string, unknown>;
};

export type GoogleAdsSessionProbeResult = {
  ok: boolean;
  adapter: "browser" | "cli";
  accountId?: string;
  checkedAt: string;
  detail: string;
  metadata?: Record<string, unknown>;
};
