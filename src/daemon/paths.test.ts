import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".clawdbrain"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", CLAWDBRAIN_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".clawdbrain-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", CLAWDBRAIN_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".clawdbrain"));
  });

  it("uses CLAWDBRAIN_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", CLAWDBRAIN_STATE_DIR: "/var/lib/clawdbrain" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/clawdbrain"));
  });

  it("expands ~ in CLAWDBRAIN_STATE_DIR", () => {
    const env = { HOME: "/Users/test", CLAWDBRAIN_STATE_DIR: "~/clawdbrain-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/clawdbrain-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { CLAWDBRAIN_STATE_DIR: "C:\\State\\clawdbrain" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\clawdbrain");
  });
});
