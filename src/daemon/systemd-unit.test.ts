import { describe, expect, it } from "vitest";
import { buildSystemdUnit, parseSystemdExecStart } from "./systemd-unit.js";

describe("parseSystemdExecStart", () => {
  it("splits on whitespace outside quotes", () => {
    const execStart = "/usr/bin/openclaw gateway start --foo bar";
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--foo",
      "bar",
    ]);
  });

  it("preserves quoted arguments", () => {
    const execStart = '/usr/bin/openclaw gateway start --name "My Bot"';
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });

  it("parses path arguments", () => {
    const execStart = "/usr/bin/openclaw gateway start --path /tmp/openclaw";
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/openclaw",
      "gateway",
      "start",
      "--path",
      "/tmp/openclaw",
    ]);
  });
});

describe("buildSystemdUnit", () => {
  it("includes TimeoutStopSec for graceful shutdown", () => {
    const unit = buildSystemdUnit({
      description: "Test Gateway",
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
    });
    expect(unit).toContain("TimeoutStopSec=15");
  });

  it("includes StartLimitIntervalSec and StartLimitBurst to prevent restart loops", () => {
    const unit = buildSystemdUnit({
      description: "Test Gateway",
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
    });
    expect(unit).toContain("StartLimitIntervalSec=300");
    expect(unit).toContain("StartLimitBurst=10");
  });

  it("generates valid unit file structure", () => {
    const unit = buildSystemdUnit({
      description: "Test Gateway",
      programArguments: ["/usr/bin/openclaw", "gateway", "start"],
      workingDirectory: "/home/user",
    });
    expect(unit).toContain("[Unit]");
    expect(unit).toContain("[Service]");
    expect(unit).toContain("[Install]");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("KillMode=process");
    // WorkingDirectory is quoted by systemdEscapeArg when it contains path separators
    expect(unit).toMatch(/WorkingDirectory=.*\/home\/user/);
  });
});
