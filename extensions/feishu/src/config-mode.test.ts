import { describe, expect, it } from "vitest";

import type { ClawdbotConfig } from "clawdbot/plugin-sdk";

import { resolveFeishuAccount } from "./accounts.js";
import { FeishuConfigSchema } from "./config-schema.js";

describe("Feishu config mode", () => {
  it("allows ws mode without webhook validation secrets", () => {
    const parsed = FeishuConfigSchema.parse({
      appId: "cli_test",
      appSecret: "secret_test",
      mode: "ws",
    });
    expect(parsed.mode).toBe("ws");
  });

  it("requires webhook validation secrets in http mode", () => {
    expect(() =>
      FeishuConfigSchema.parse({
        appId: "cli_test",
        appSecret: "secret_test",
        mode: "http",
      }),
    ).toThrow();
  });

  it("treats ws mode as configured with app credentials", () => {
    const cfg = {
      channels: {
        feishu: {
          appId: "cli_test",
          appSecret: "secret_test",
          mode: "ws",
        },
      },
    } as unknown as ClawdbotConfig;
    const resolved = resolveFeishuAccount({ cfg, accountId: "default" });
    expect(resolved.credentialSource).toBe("config");
  });
});
