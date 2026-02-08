import type { BrowserAction } from "./browser-runner.js";
import type {
  GoogleAdsMutationAction,
  GoogleAdsMutationResult,
  GoogleAdsSessionProbeResult,
} from "./google-ads-types.js";
import { BrowserRunner } from "./browser-runner.js";

export type GoogleAdsBrowserAdapterOptions = {
  runner?: BrowserRunner;
  timeoutMs?: number;
};

function accountUrl(accountId: string): string {
  const base = "https://ads.google.com/aw";
  const encoded = encodeURIComponent(accountId);
  return `${base}/campaigns?ocid=${encoded}`;
}

function buildDefaultActionPlan(action: GoogleAdsMutationAction): {
  url: string;
  actions: BrowserAction[];
} {
  const url = accountUrl(action.accountId);

  switch (action.type) {
    case "campaign.create_or_update":
      return {
        url,
        actions: [
          { type: "wait", selector: "body" },
          { type: "extract", selector: "h1" },
        ],
      };
    case "ad_group.create_or_update":
      return {
        url,
        actions: [
          { type: "wait", selector: "body" },
          { type: "extract", selector: "h1" },
        ],
      };
    case "keyword.add_or_update":
      return {
        url,
        actions: [
          { type: "wait", selector: "body" },
          { type: "extract", selector: "h1" },
        ],
      };
    case "ad.add_or_pause":
      return {
        url,
        actions: [
          { type: "wait", selector: "body" },
          { type: "extract", selector: "h1" },
        ],
      };
    default:
      return {
        url,
        actions: [{ type: "wait", selector: "body" }],
      };
  }
}

function validateAction(action: GoogleAdsMutationAction): string[] {
  const errors: string[] = [];
  if (!action.id.trim()) {
    errors.push("action id is required");
  }
  if (!action.accountId.trim()) {
    errors.push("accountId is required");
  }
  if (!action.campaignName.trim()) {
    errors.push("campaignName is required");
  }
  if (
    (action.type === "ad_group.create_or_update" ||
      action.type === "keyword.add_or_update" ||
      action.type === "ad.add_or_pause") &&
    !action.adGroupName?.trim()
  ) {
    errors.push(`adGroupName is required for ${action.type}`);
  }
  return errors;
}

export class GoogleAdsBrowserAdapter {
  private readonly runner: BrowserRunner;
  private readonly timeoutMs: number;

  constructor(opts: GoogleAdsBrowserAdapterOptions = {}) {
    this.runner = opts.runner ?? new BrowserRunner();
    this.timeoutMs = opts.timeoutMs ?? 45_000;
  }

  async probeSession(accountId?: string): Promise<GoogleAdsSessionProbeResult> {
    const url = accountId ? accountUrl(accountId) : "https://ads.google.com/aw";
    try {
      const result = await this.runner.execute({
        url,
        actions: [
          { type: "wait", selector: "body" },
          { type: "extract", selector: "h1" },
        ],
        timeout_ms: this.timeoutMs,
        screenshot: true,
      });

      const finalUrl = result.final_url.toLowerCase();
      const redirectedToLogin =
        finalUrl.includes("accounts.google.com") ||
        finalUrl.includes("servicelogin") ||
        finalUrl.includes("signin");

      if (redirectedToLogin) {
        return {
          ok: false,
          adapter: "browser",
          accountId,
          checkedAt: new Date().toISOString(),
          detail: "Browser session is not authenticated for Google Ads.",
          metadata: {
            finalUrl: result.final_url,
            pageTitle: result.page_title,
          },
        };
      }

      return {
        ok: true,
        adapter: "browser",
        accountId,
        checkedAt: new Date().toISOString(),
        detail: "Google Ads browser session appears authenticated.",
        metadata: {
          finalUrl: result.final_url,
          pageTitle: result.page_title,
          screenshotCount: result.screenshots.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        adapter: "browser",
        accountId,
        checkedAt: new Date().toISOString(),
        detail: String(error),
      };
    }
  }

  async executeAction(
    action: GoogleAdsMutationAction,
    opts?: { dryRun?: boolean; timeoutMs?: number; allowCommitActions?: boolean },
  ): Promise<GoogleAdsMutationResult> {
    const validationErrors = validateAction(action);
    if (validationErrors.length > 0) {
      return {
        ok: false,
        actionId: action.id,
        adapter: "browser",
        accountId: action.accountId,
        errorCategory: "validation",
        errorMessage: validationErrors.join("; "),
        details: { validationErrors },
      };
    }

    const dryRun = Boolean(opts?.dryRun);

    const planOverride =
      action.payload.browser && typeof action.payload.browser === "object"
        ? (action.payload.browser as { url?: unknown; actions?: unknown })
        : null;

    const defaultPlan = buildDefaultActionPlan(action);
    const url =
      typeof planOverride?.url === "string" && planOverride.url.trim()
        ? planOverride.url
        : defaultPlan.url;
    const actions =
      Array.isArray(planOverride?.actions) &&
      planOverride.actions.every((item) => item && typeof item === "object" && "type" in item)
        ? (planOverride.actions as BrowserAction[])
        : defaultPlan.actions;

    if (dryRun) {
      return {
        ok: true,
        actionId: action.id,
        adapter: "browser",
        accountId: action.accountId,
        details: {
          dryRun: true,
          url,
          actions,
        },
      };
    }

    try {
      const result = await this.runner.execute({
        url,
        actions,
        timeout_ms: opts?.timeoutMs ?? this.timeoutMs,
        screenshot: true,
        allow_commit_actions: Boolean(opts?.allowCommitActions),
      });

      return {
        ok: true,
        actionId: action.id,
        adapter: "browser",
        accountId: action.accountId,
        externalResourceId:
          typeof action.resourceId === "string" && action.resourceId.trim().length > 0
            ? action.resourceId
            : undefined,
        details: {
          pageTitle: result.page_title,
          finalUrl: result.final_url,
          extractedData: result.extracted_data,
          screenshotCount: result.screenshots.length,
          actionResults: result.action_results,
        },
      };
    } catch (error) {
      return {
        ok: false,
        actionId: action.id,
        adapter: "browser",
        accountId: action.accountId,
        errorCategory: String(error).toLowerCase().includes("approval") ? "permission" : "unknown",
        errorMessage: String(error),
        details: {
          url,
          actions,
        },
      };
    }
  }
}
