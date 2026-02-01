import { describe, expect, it } from "vitest";

import type { OpenClawConfig } from "../config/config.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectEnvTokenExposureFindings,
  collectExposureMatrixFindings,
  collectSyncedFolderFindings,
} from "./audit-extra.js";

describe("collectEnvTokenExposureFindings", () => {
  it("detects all 13 sensitive env var patterns", () => {
    const env: Record<string, string> = {
      OPENCLAW_GATEWAY_TOKEN: "tok1",
      OPENCLAW_GATEWAY_PASSWORD: "pw1",
      CLAWDBOT_GATEWAY_TOKEN: "tok2",
      CLAWDBOT_GATEWAY_PASSWORD: "pw2",
      DISCORD_BOT_TOKEN: "tok3",
      TELEGRAM_BOT_TOKEN: "tok4",
      SLACK_BOT_TOKEN: "tok5",
      SLACK_APP_TOKEN: "tok6",
      OPENAI_API_KEY: "key1",
      ANTHROPIC_API_KEY: "key2",
      BRAVE_API_KEY: "key3",
      PERPLEXITY_API_KEY: "key4",
      OPENROUTER_API_KEY: "key5",
    };
    const findings = collectEnvTokenExposureFindings(env);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("env.sensitive_tokens");
    expect(findings[0].detail).toContain("13 sensitive env var");
  });

  it("ignores non-sensitive env vars", () => {
    const env: Record<string, string> = {
      HOME: "/home/user",
      PATH: "/usr/bin",
      NODE_ENV: "production",
      MY_CUSTOM_KEY: "val",
    };
    const findings = collectEnvTokenExposureFindings(env);
    expect(findings).toHaveLength(0);
  });

  it("ignores empty/whitespace-only sensitive vars", () => {
    const env: Record<string, string> = {
      OPENAI_API_KEY: "  ",
      DISCORD_BOT_TOKEN: "",
    };
    const findings = collectEnvTokenExposureFindings(env);
    expect(findings).toHaveLength(0);
  });

  it("returns empty for empty environment", () => {
    const findings = collectEnvTokenExposureFindings({});
    expect(findings).toHaveLength(0);
  });
});

describe("collectAttackSurfaceSummaryFindings", () => {
  it("returns info finding with surface details", () => {
    const cfg = {
      channels: {
        discord: { groupPolicy: "open" },
        telegram: { groupPolicy: "allowlist" },
      },
      tools: { elevated: { enabled: true } },
      hooks: { enabled: true },
      browser: { enabled: false },
    } as never as OpenClawConfig;

    const findings = collectAttackSurfaceSummaryFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].detail).toContain("open=1");
    expect(findings[0].detail).toContain("allowlist=1");
    expect(findings[0].detail).toContain("tools.elevated: enabled");
    expect(findings[0].detail).toContain("hooks: enabled");
    expect(findings[0].detail).toContain("browser control: disabled");
  });

  it("handles empty config", () => {
    const findings = collectAttackSurfaceSummaryFindings({} as never as OpenClawConfig);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("open=0");
  });
});

describe("collectSyncedFolderFindings", () => {
  it("warns when stateDir is in iCloud", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/me/Library/Mobile Documents/iCloud/openclaw",
      configPath: "/Users/me/.config/openclaw.json5",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("fs.synced_dir");
  });

  it("warns when configPath is in Dropbox", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/var/openclaw",
      configPath: "/Users/me/Dropbox/openclaw.json5",
    });
    expect(findings).toHaveLength(1);
  });

  it("warns for Google Drive path", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/me/Google Drive/state",
      configPath: "/etc/openclaw.json5",
    });
    expect(findings).toHaveLength(1);
  });

  it("warns for OneDrive path", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/me/OneDrive/state",
      configPath: "/etc/openclaw.json5",
    });
    expect(findings).toHaveLength(1);
  });

  it("returns empty for local paths", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/var/openclaw",
      configPath: "/etc/openclaw.json5",
    });
    expect(findings).toHaveLength(0);
  });
});

describe("collectExposureMatrixFindings", () => {
  it("flags open groupPolicy with elevated tools", () => {
    const cfg = {
      channels: {
        discord: { groupPolicy: "open" },
      },
      tools: { elevated: { enabled: true } },
    } as never as OpenClawConfig;

    const findings = collectExposureMatrixFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].checkId).toBe("security.exposure.open_groups_with_elevated");
  });

  it("returns empty when no open groups", () => {
    const cfg = {
      channels: {
        discord: { groupPolicy: "allowlist" },
      },
      tools: { elevated: { enabled: true } },
    } as never as OpenClawConfig;

    const findings = collectExposureMatrixFindings(cfg);
    expect(findings).toHaveLength(0);
  });

  it("returns empty when elevated disabled", () => {
    const cfg = {
      channels: {
        discord: { groupPolicy: "open" },
      },
      tools: { elevated: { enabled: false } },
    } as never as OpenClawConfig;

    const findings = collectExposureMatrixFindings(cfg);
    expect(findings).toHaveLength(0);
  });
});
