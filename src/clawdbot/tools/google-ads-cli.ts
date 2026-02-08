import type {
  GoogleAdsActionErrorCategory,
  GoogleAdsMutationAction,
  GoogleAdsMutationResult,
  GoogleAdsSessionProbeResult,
} from "./google-ads-types.js";
import { parseJsonOutput } from "./cli-parser.js";
import { CliRunner } from "./cli-runner.js";

export type GoogleAdsCliAdapterOptions = {
  binary?: string;
  timeoutMs?: number;
  runner?: CliRunner;
};

function toErrorCategory(stderr: string): GoogleAdsActionErrorCategory {
  const text = stderr.toLowerCase();
  if (text.includes("unauthorized") || text.includes("auth")) {
    return "auth";
  }
  if (text.includes("forbidden") || text.includes("permission")) {
    return "permission";
  }
  if (text.includes("rate") && text.includes("limit")) {
    return "rate_limit";
  }
  if (text.includes("timeout")) {
    return "timeout";
  }
  if (text.includes("invalid") || text.includes("missing")) {
    return "validation";
  }
  return "unknown";
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

  const budget = action.payload.dailyBudgetUsd;
  if (budget !== undefined) {
    const numeric = Number(budget);
    if (!Number.isFinite(numeric) || numeric < 0) {
      errors.push("payload.dailyBudgetUsd must be a non-negative number");
    }
  }

  return errors;
}

function buildDefaultArgs(action: GoogleAdsMutationAction): string[] {
  const base = ["--account", action.accountId, "--json"];
  switch (action.type) {
    case "campaign.create_or_update":
      return ["campaign", "upsert", "--name", action.campaignName, ...base];
    case "ad_group.create_or_update":
      return [
        "ad-group",
        "upsert",
        "--campaign",
        action.campaignName,
        "--name",
        action.adGroupName?.trim() ?? "",
        ...base,
      ];
    case "keyword.add_or_update":
      return [
        "keyword",
        "upsert",
        "--campaign",
        action.campaignName,
        "--ad-group",
        action.adGroupName?.trim() ?? "",
        ...base,
      ];
    case "ad.add_or_pause":
      return [
        "ad",
        "upsert",
        "--campaign",
        action.campaignName,
        "--ad-group",
        action.adGroupName?.trim() ?? "",
        ...base,
      ];
    default:
      return ["--help"];
  }
}

export class GoogleAdsCliAdapter {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly runner: CliRunner;

  constructor(opts: GoogleAdsCliAdapterOptions = {}) {
    this.binary = opts.binary?.trim() || process.env.OPENCLAW_GOOGLE_ADS_CLI_BIN?.trim() || "gads";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.runner = opts.runner ?? new CliRunner();
  }

  async probeSession(accountId?: string): Promise<GoogleAdsSessionProbeResult> {
    const args = accountId
      ? ["auth", "status", "--account", accountId, "--json"]
      : ["auth", "status", "--json"];
    try {
      const result = await this.runner.execute({
        command: this.binary,
        args,
        timeout_ms: this.timeoutMs,
      });

      if (result.exit_code !== 0) {
        return {
          ok: false,
          adapter: "cli",
          accountId,
          checkedAt: new Date().toISOString(),
          detail: result.stderr.trim() || "Google Ads CLI auth probe failed.",
          metadata: { exitCode: result.exit_code },
        };
      }

      return {
        ok: true,
        adapter: "cli",
        accountId,
        checkedAt: new Date().toISOString(),
        detail: "Google Ads CLI auth probe succeeded.",
        metadata: { stdout: result.stdout.trim() },
      };
    } catch (error) {
      return {
        ok: false,
        adapter: "cli",
        accountId,
        checkedAt: new Date().toISOString(),
        detail: String(error),
      };
    }
  }

  async executeAction(
    action: GoogleAdsMutationAction,
    opts?: { dryRun?: boolean; timeoutMs?: number },
  ): Promise<GoogleAdsMutationResult> {
    const validationErrors = validateAction(action);
    if (validationErrors.length > 0) {
      return {
        ok: false,
        actionId: action.id,
        adapter: "cli",
        accountId: action.accountId,
        errorCategory: "validation",
        errorMessage: validationErrors.join("; "),
        details: { validationErrors },
      };
    }

    const dryRun = Boolean(opts?.dryRun);
    const cliArgs =
      Array.isArray(action.payload.cliArgs) &&
      action.payload.cliArgs.every((item) => typeof item === "string")
        ? action.payload.cliArgs
        : buildDefaultArgs(action);

    if (dryRun) {
      return {
        ok: true,
        actionId: action.id,
        adapter: "cli",
        accountId: action.accountId,
        details: {
          dryRun: true,
          binary: this.binary,
          args: cliArgs,
        },
      };
    }

    try {
      const result = await this.runner.execute({
        command: this.binary,
        args: cliArgs,
        timeout_ms: opts?.timeoutMs ?? this.timeoutMs,
      });

      if (result.exit_code !== 0) {
        return {
          ok: false,
          actionId: action.id,
          adapter: "cli",
          accountId: action.accountId,
          errorCategory: toErrorCategory(result.stderr),
          errorMessage: result.stderr.trim() || "Google Ads CLI command failed",
          details: {
            exitCode: result.exit_code,
            stderr: result.stderr,
            stdout: result.stdout,
          },
        };
      }

      let parsed: unknown = null;
      try {
        parsed = parseJsonOutput(result.stdout);
      } catch {
        parsed = { raw: result.stdout.trim() };
      }

      const externalResourceId =
        typeof parsed === "object" &&
        parsed &&
        "id" in parsed &&
        typeof (parsed as { id: unknown }).id === "string"
          ? (parsed as { id: string }).id
          : undefined;

      return {
        ok: true,
        actionId: action.id,
        adapter: "cli",
        accountId: action.accountId,
        externalResourceId,
        details: {
          parsed,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exit_code,
          binary: this.binary,
          args: cliArgs,
        },
      };
    } catch (error) {
      return {
        ok: false,
        actionId: action.id,
        adapter: "cli",
        accountId: action.accountId,
        errorCategory: String(error).toLowerCase().includes("timed out") ? "timeout" : "unknown",
        errorMessage: String(error),
        details: {
          binary: this.binary,
          args: cliArgs,
        },
      };
    }
  }
}
