import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "clawdbrain",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) throw new Error(res.error);
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "clawdbrain", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "clawdbrain", "--dev", "gateway"]);
    if (!res.ok) throw new Error(res.error);
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "clawdbrain", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "clawdbrain", "--profile", "work", "status"]);
    if (!res.ok) throw new Error(res.error);
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "clawdbrain", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "clawdbrain", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "clawdbrain", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "clawdbrain", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".clawdbrain-dev");
    expect(env.CLAWDBRAIN_PROFILE).toBe("dev");
    expect(env.CLAWDBRAIN_STATE_DIR).toBe(expectedStateDir);
    expect(env.CLAWDBRAIN_CONFIG_PATH).toBe(path.join(expectedStateDir, "clawdbrain.json"));
    expect(env.CLAWDBRAIN_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      CLAWDBRAIN_STATE_DIR: "/custom",
      CLAWDBRAIN_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.CLAWDBRAIN_STATE_DIR).toBe("/custom");
    expect(env.CLAWDBRAIN_GATEWAY_PORT).toBe("19099");
    expect(env.CLAWDBRAIN_CONFIG_PATH).toBe(path.join("/custom", "clawdbrain.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", {})).toBe("clawdbrain doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", { CLAWDBRAIN_PROFILE: "default" })).toBe(
      "clawdbrain doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", { CLAWDBRAIN_PROFILE: "Default" })).toBe(
      "clawdbrain doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", { CLAWDBRAIN_PROFILE: "bad profile" })).toBe(
      "clawdbrain doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("clawdbrain --profile work doctor --fix", { CLAWDBRAIN_PROFILE: "work" }),
    ).toBe("clawdbrain --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("clawdbrain --dev doctor", { CLAWDBRAIN_PROFILE: "dev" })).toBe(
      "clawdbrain --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", { CLAWDBRAIN_PROFILE: "work" })).toBe(
      "clawdbrain --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("clawdbrain doctor --fix", { CLAWDBRAIN_PROFILE: "  jbclawd  " })).toBe(
      "clawdbrain --profile jbclawd doctor --fix",
    );
  });

  it("handles command with no args after clawdbrain", () => {
    expect(formatCliCommand("clawdbrain", { CLAWDBRAIN_PROFILE: "test" })).toBe(
      "clawdbrain --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm clawdbrain doctor", { CLAWDBRAIN_PROFILE: "work" })).toBe(
      "pnpm clawdbrain --profile work doctor",
    );
  });
});
