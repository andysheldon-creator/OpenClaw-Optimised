import { describe, expect, it } from "vitest";
import { resolveCliBackendConfig } from "./cli-backends.js";

describe("resolveCliBackendConfig clearEnv merge", () => {
  it("uses default clearEnv when no override provided", () => {
    const result = resolveCliBackendConfig("claude-cli");
    expect(result).not.toBeNull();
    expect(result!.config.clearEnv).toEqual(["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_OLD"]);
  });

  it("override clearEnv replaces default (not union)", () => {
    const result = resolveCliBackendConfig("claude-cli", {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              clearEnv: ["CUSTOM_KEY"],
            },
          },
        },
      },
    } as unknown as Parameters<typeof resolveCliBackendConfig>[1]);
    expect(result).not.toBeNull();
    expect(result!.config.clearEnv).toEqual(["CUSTOM_KEY"]);
  });

  it("override clearEnv: [] clears all defaults", () => {
    const result = resolveCliBackendConfig("claude-cli", {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              clearEnv: [],
            },
          },
        },
      },
    } as unknown as Parameters<typeof resolveCliBackendConfig>[1]);
    expect(result).not.toBeNull();
    expect(result!.config.clearEnv).toEqual([]);
  });
});
