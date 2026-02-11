import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./worker.js", () => ({
  runHierarchicalMemoryWorker: vi.fn(),
}));

vi.mock("./config.js", () => ({
  resolveHierarchicalMemoryConfig: vi.fn(),
}));

import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveHierarchicalMemoryConfig } from "./config.js";
import { startHierarchicalMemoryTimer } from "./timer.js";
import { DEFAULT_HIERARCHICAL_MEMORY_CONFIG } from "./types.js";
import { runHierarchicalMemoryWorker } from "./worker.js";

describe("startHierarchicalMemoryTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  it("returns null when memory is disabled", () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: false,
    });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });
    expect(handle).toBeNull();
  });

  it("runs worker immediately on start", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 60_000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({ success: true });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });
    expect(handle).not.toBeNull();

    // Flush the immediate async call
    await vi.advanceTimersByTimeAsync(0);
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(1);

    handle!.stop();
  });

  it("runs worker on interval", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 5000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({ success: true });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    // Immediate run
    await vi.advanceTimersByTimeAsync(0);
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(1);

    // First interval
    await vi.advanceTimersByTimeAsync(5001);
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(2);

    handle!.stop();
  });

  it("stop() prevents further runs", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 1000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({ success: true });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(1);

    handle!.stop();

    await vi.advanceTimersByTimeAsync(5000);
    // No additional calls after stop
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(1);
  });

  it("logs info when chunks or merges are processed", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 60_000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({
      success: true,
      chunksProcessed: 3,
      mergesPerformed: 1,
      durationMs: 5000,
    });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("3 chunks"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("1 merges"));

    handle!.stop();
  });

  it("logs error when worker fails", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 60_000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({
      success: false,
      error: "API timeout",
    });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("API timeout"));

    handle!.stop();
  });

  it("logs error and continues when worker throws", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 1000,
    });
    vi.mocked(runHierarchicalMemoryWorker)
      .mockRejectedValueOnce(new Error("crash"))
      .mockResolvedValueOnce({ success: true });

    const handle = startHierarchicalMemoryTimer({
      agentId: "test",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    // First run: throws
    await vi.advanceTimersByTimeAsync(0);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("crash"));

    // Second run: should still work
    await vi.advanceTimersByTimeAsync(1001);
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(2);

    handle!.stop();
  });

  it("two timers have independent state", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      workerIntervalMs: 1000,
    });
    vi.mocked(runHierarchicalMemoryWorker).mockResolvedValue({
      success: true,
      chunksProcessed: 1,
      durationMs: 10,
    });

    const handle1 = startHierarchicalMemoryTimer({
      agentId: "agent1",
      config: {} as OpenClawConfig,
      log: mockLog,
    });
    const handle2 = startHierarchicalMemoryTimer({
      agentId: "agent2",
      config: {} as OpenClawConfig,
      log: mockLog,
    });

    await vi.advanceTimersByTimeAsync(0);
    // Both should have fired
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(2);

    // Stop timer 1, timer 2 should keep running
    handle1!.stop();

    await vi.advanceTimersByTimeAsync(1001);
    // Timer 1 didn't fire again, but timer 2 did
    expect(runHierarchicalMemoryWorker).toHaveBeenCalledTimes(3);
    expect(vi.mocked(runHierarchicalMemoryWorker).mock.calls[2][0].agentId).toBe("agent2");

    handle2!.stop();
  });
});
