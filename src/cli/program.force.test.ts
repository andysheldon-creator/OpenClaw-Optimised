import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

import { execFileSync } from "node:child_process";
import {
  forceFreePort,
  forceFreePortAndWait,
  listPortListeners,
  type PortProcess,
  parseLsofOutput,
} from "./ports.js";

describe("gateway --force helpers", () => {
  let originalKill: typeof process.kill;

  beforeEach(() => {
    vi.clearAllMocks();
    originalKill = process.kill.bind(process);
  });

  afterEach(() => {
    process.kill = originalKill;
  });

  it("parses lsof output into pid/command pairs", () => {
    const sample = ["p123", "cnode", "p456", "cpython", ""].join("\n");
    const parsed = parseLsofOutput(sample);
    expect(parsed).toEqual<PortProcess[]>([
      { pid: 123, command: "node" },
      { pid: 456, command: "python" },
    ]);
  });

  it("returns empty list when lsof finds nothing", () => {
    if (process.platform === "win32") {
      // On Windows, netstat returns empty output when no listeners
      (execFileSync as unknown as vi.Mock).mockReturnValue("");
    } else {
      // On Unix, lsof exits with status 1 when no matches
      (execFileSync as unknown as vi.Mock).mockImplementation(() => {
        const err = new Error("no matches");
        // @ts-expect-error partial
        err.status = 1;
        throw err;
      });
    }
    expect(listPortListeners(18789)).toEqual([]);
  });

  it("throws when lsof missing", () => {
    (execFileSync as unknown as vi.Mock).mockImplementation(() => {
      const err = new Error("not found");
      // @ts-expect-error partial
      err.code = "ENOENT";
      throw err;
    });
    if (process.platform === "win32") {
      expect(() => listPortListeners(18789)).toThrow(/netstat not found/);
    } else {
      expect(() => listPortListeners(18789)).toThrow(/lsof not found/);
    }
  });

  it("kills each listener and returns metadata", () => {
    if (process.platform === "win32") {
      // Mock netstat output for Windows
      (execFileSync as unknown as vi.Mock).mockReturnValue(
        "  TCP    0.0.0.0:18789          0.0.0.0:0              LISTENING       42\n" +
          "  TCP    0.0.0.0:18789          0.0.0.0:0              LISTENING       99\n",
      );
    } else {
      // Mock lsof output for Unix
      (execFileSync as unknown as vi.Mock).mockReturnValue(
        ["p42", "cnode", "p99", "cssh", ""].join("\n"),
      );
    }

    const killMock = vi.fn();
    // @ts-expect-error override for test
    process.kill = killMock;

    const killed = forceFreePort(18789);

    expect(execFileSync).toHaveBeenCalled();

    if (process.platform === "win32") {
      // On Windows, taskkill is called instead of process.kill
      expect(execFileSync).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", "42", "/F"],
        expect.any(Object),
      );
      expect(execFileSync).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", "99", "/F"],
        expect.any(Object),
      );
      expect(killed).toEqual<PortProcess[]>([{ pid: 42 }, { pid: 99 }]);
    } else {
      expect(killMock).toHaveBeenCalledTimes(2);
      expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
      expect(killMock).toHaveBeenCalledWith(99, "SIGTERM");
      expect(killed).toEqual<PortProcess[]>([
        { pid: 42, command: "node" },
        { pid: 99, command: "ssh" },
      ]);
    }
  });

  it("retries until the port is free", async () => {
    vi.useFakeTimers();
    let call = 0;
    (execFileSync as unknown as vi.Mock).mockImplementation((...args) => {
      call += 1;
      // 1st call: initial listeners to kill; 2nd call: still listed; 3rd call: gone.
      if (process.platform === "win32") {
        // Windows: first call is netstat, subsequent calls are taskkill then netstat
        if (args[0] === "netstat") {
          if (call === 1 || call === 3) {
            return "  TCP    0.0.0.0:18789          0.0.0.0:0              LISTENING       42\n";
          }
          return "";
        }
        return ""; // taskkill output
      } else {
        // Unix: lsof output
        if (call === 1 || call === 2) {
          return ["p42", "cnode", ""].join("\n");
        }
        return "";
      }
    });

    const killMock = vi.fn();
    // @ts-expect-error override for test
    process.kill = killMock;

    const promise = forceFreePortAndWait(18789, {
      timeoutMs: 500,
      intervalMs: 100,
      sigtermTimeoutMs: 400,
    });

    await vi.runAllTimersAsync();
    const res = await promise;

    if (process.platform === "win32") {
      expect(execFileSync).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", "42", "/F"],
        expect.any(Object),
      );
      expect(res.killed).toEqual<PortProcess[]>([{ pid: 42 }]);
    } else {
      expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
      expect(res.killed).toEqual<PortProcess[]>([{ pid: 42, command: "node" }]);
    }
    expect(res.escalatedToSigkill).toBe(false);
    expect(res.waitedMs).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("escalates to SIGKILL if SIGTERM doesn't free the port", async () => {
    vi.useFakeTimers();
    let call = 0;
    (execFileSync as unknown as vi.Mock).mockImplementation((...args) => {
      call += 1;
      // 1st call: initial kill list; then keep showing until after SIGKILL.
      if (process.platform === "win32") {
        // Windows: netstat and taskkill calls
        if (args[0] === "netstat") {
          if (call <= 6) {
            return "  TCP    0.0.0.0:18789          0.0.0.0:0              LISTENING       42\n";
          }
          return "";
        }
        return ""; // taskkill output
      } else {
        // Unix: lsof output
        if (call <= 6) {
          return ["p42", "cnode", ""].join("\n");
        }
        return "";
      }
    });

    const killMock = vi.fn();
    // @ts-expect-error override for test
    process.kill = killMock;

    const promise = forceFreePortAndWait(18789, {
      timeoutMs: 800,
      intervalMs: 100,
      sigtermTimeoutMs: 300,
    });

    await vi.runAllTimersAsync();
    const res = await promise;

    if (process.platform === "win32") {
      // On Windows, taskkill is called multiple times (no distinction between SIGTERM/SIGKILL)
      expect(execFileSync).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", "42", "/F"],
        expect.any(Object),
      );
    } else {
      expect(killMock).toHaveBeenCalledWith(42, "SIGTERM");
      expect(killMock).toHaveBeenCalledWith(42, "SIGKILL");
    }
    expect(res.escalatedToSigkill).toBe(true);

    vi.useRealTimers();
  });
});
