import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing,
  consumeGatewaySigusr1RestartAuthorization,
  isGatewaySigusr1RestartExternallyAllowed,
  scheduleGatewaySigusr1Restart,
  setGatewaySigusr1RestartPolicy,
  setPreRestartDeferralCheck,
} from "./restart.js";

describe("restart authorization", () => {
  beforeEach(() => {
    __testing.resetSigusr1State();
    vi.useFakeTimers();
    vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
    __testing.resetSigusr1State();
  });

  it("consumes a scheduled authorization once", async () => {
    expect(consumeGatewaySigusr1RestartAuthorization()).toBe(false);

    scheduleGatewaySigusr1Restart({ delayMs: 0 });

    expect(consumeGatewaySigusr1RestartAuthorization()).toBe(true);
    expect(consumeGatewaySigusr1RestartAuthorization()).toBe(false);

    await vi.runAllTimersAsync();
  });

  it("tracks external restart policy", () => {
    expect(isGatewaySigusr1RestartExternallyAllowed()).toBe(false);
    setGatewaySigusr1RestartPolicy({ allowExternal: true });
    expect(isGatewaySigusr1RestartExternallyAllowed()).toBe(true);
  });
});

describe("pre-restart deferral check", () => {
  beforeEach(() => {
    __testing.resetSigusr1State();
    vi.useFakeTimers();
    vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
    vi.restoreAllMocks();
    __testing.resetSigusr1State();
  });

  it("emits SIGUSR1 immediately when no deferral check is registered", async () => {
    const emitSpy = vi.spyOn(process, "emit");
    // Ensure a SIGUSR1 listener exists so it uses emit path
    const handler = () => {};
    process.on("SIGUSR1", handler);
    try {
      scheduleGatewaySigusr1Restart({ delayMs: 0 });
      await vi.advanceTimersByTimeAsync(0);
      expect(emitSpy).toHaveBeenCalledWith("SIGUSR1");
    } finally {
      process.removeListener("SIGUSR1", handler);
    }
  });

  it("emits SIGUSR1 immediately when deferral check returns 0", async () => {
    const emitSpy = vi.spyOn(process, "emit");
    const handler = () => {};
    process.on("SIGUSR1", handler);
    try {
      setPreRestartDeferralCheck(() => 0);
      scheduleGatewaySigusr1Restart({ delayMs: 0 });
      await vi.advanceTimersByTimeAsync(0);
      expect(emitSpy).toHaveBeenCalledWith("SIGUSR1");
    } finally {
      process.removeListener("SIGUSR1", handler);
    }
  });

  it("defers SIGUSR1 until deferral check returns 0", async () => {
    const emitSpy = vi.spyOn(process, "emit");
    const handler = () => {};
    process.on("SIGUSR1", handler);
    try {
      let pending = 2;
      setPreRestartDeferralCheck(() => pending);
      scheduleGatewaySigusr1Restart({ delayMs: 0 });

      // After initial delay fires, deferral check returns 2 — should NOT emit yet
      await vi.advanceTimersByTimeAsync(0);
      expect(emitSpy).not.toHaveBeenCalledWith("SIGUSR1");

      // After one poll (500ms), still pending
      await vi.advanceTimersByTimeAsync(500);
      expect(emitSpy).not.toHaveBeenCalledWith("SIGUSR1");

      // Drain pending work
      pending = 0;
      await vi.advanceTimersByTimeAsync(500);
      expect(emitSpy).toHaveBeenCalledWith("SIGUSR1");
    } finally {
      process.removeListener("SIGUSR1", handler);
    }
  });

  it("emits SIGUSR1 after deferral timeout even if still pending", async () => {
    const emitSpy = vi.spyOn(process, "emit");
    const handler = () => {};
    process.on("SIGUSR1", handler);
    try {
      setPreRestartDeferralCheck(() => 5); // always pending
      scheduleGatewaySigusr1Restart({ delayMs: 0 });

      // Fire initial timeout
      await vi.advanceTimersByTimeAsync(0);
      expect(emitSpy).not.toHaveBeenCalledWith("SIGUSR1");

      // Advance past the 30s max deferral wait
      await vi.advanceTimersByTimeAsync(30_000);
      expect(emitSpy).toHaveBeenCalledWith("SIGUSR1");
    } finally {
      process.removeListener("SIGUSR1", handler);
    }
  });

  it("emits SIGUSR1 if deferral check throws", async () => {
    const emitSpy = vi.spyOn(process, "emit");
    const handler = () => {};
    process.on("SIGUSR1", handler);
    try {
      setPreRestartDeferralCheck(() => {
        throw new Error("boom");
      });
      scheduleGatewaySigusr1Restart({ delayMs: 0 });
      await vi.advanceTimersByTimeAsync(0);
      expect(emitSpy).toHaveBeenCalledWith("SIGUSR1");
    } finally {
      process.removeListener("SIGUSR1", handler);
    }
  });
});
