import { describe, expect, it } from "vitest";

import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "clawdbrain", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "clawdbrain", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "clawdbrain", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "clawdbrain", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "clawdbrain", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "clawdbrain", "status", "--", "ignored"], 2)).toEqual([
      "status",
    ]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "clawdbrain", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "clawdbrain"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "clawdbrain", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "clawdbrain", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "clawdbrain", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "clawdbrain", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "clawdbrain", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "clawdbrain", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "clawdbrain", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "clawdbrain", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "clawdbrain", "status", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "clawdbrain", "status", "--debug"], { includeDebug: true }),
    ).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "clawdbrain", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "clawdbrain", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "clawdbrain", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "clawdbrain", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node", "clawdbrain", "status"],
    });
    expect(nodeArgv).toEqual(["node", "clawdbrain", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node-22", "clawdbrain", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "clawdbrain", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node-22.2.0.exe", "clawdbrain", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "clawdbrain", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node-22.2", "clawdbrain", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "clawdbrain", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node-22.2.exe", "clawdbrain", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "clawdbrain", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["/usr/bin/node-22.2.0", "clawdbrain", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "clawdbrain", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["nodejs", "clawdbrain", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "clawdbrain", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["node-dev", "clawdbrain", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual([
      "node",
      "clawdbrain",
      "node-dev",
      "clawdbrain",
      "status",
    ]);

    const directArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["clawdbrain", "status"],
    });
    expect(directArgv).toEqual(["node", "clawdbrain", "status"]);

    const bunArgv = buildParseArgv({
      programName: "clawdbrain",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "clawdbrain",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "clawdbrain", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "clawdbrain", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "clawdbrain", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "clawdbrain", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "clawdbrain", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "clawdbrain", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "clawdbrain", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "clawdbrain", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
