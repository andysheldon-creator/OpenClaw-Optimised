import { describe, it, expect, vi, beforeEach } from "vitest";
import { monitorGmail } from "./monitor.js";
import { ResolvedGmailAccount } from "./accounts.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

describe("monitorGmail", () => {
  const mockAccount: ResolvedGmailAccount = {
    accountId: "acc-1",
    email: "test@example.com",
    enabled: true,
    allowFrom: ["*"],
    sessionTtlDays: 1,
    sessionTtlHours: 1, // Add missing required field
  };

  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const mockSetStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (execFile as any).mockImplementation((cmd, args, opts, cb) => {
        if (cb) cb(null, { stdout: JSON.stringify({ messages: [] }), stderr: "" });
    });
  });

  it("handles poll cycle correctly", async () => {
    const controller = new AbortController();
    const onMessage = vi.fn();

    // Mock search response
    (execFile as any).mockImplementation((cmd, args, opts, cb) => {
      // If asking for search
      if (args.includes("search")) {
         const result = {
             messages: [
                 { id: "msg-1", threadId: "t-1", from: "user@example.com", subject: "test", body: "hello", date: new Date().toISOString() }
             ]
         };
         cb(null, { stdout: JSON.stringify(result), stderr: "" });
         return;
      }
      // If asking for labels/modify (mark read)
      if (args.includes("modify")) {
          cb(null, { stdout: "{}", stderr: "" });
          return;
      }
      cb(null, { stdout: "{}", stderr: "" });
    });

    const promise = monitorGmail({
      account: { ...mockAccount, pollIntervalMs: 50 }, // slower poll
      onMessage,
      signal: controller.signal,
      log: mockLog,
      setStatus: mockSetStatus,
    });

    // Let it run for a bit
    await new Promise(r => setTimeout(r, 100));
    controller.abort();
    
    // Ensure we don't hang
    await promise;

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Starting monitor"));
  });

  it("respects circuit breaker on repeated errors", async () => {
     const controller = new AbortController();
     
     // Mock failure
     (execFile as any).mockImplementation((cmd, args, opts, cb) => {
         cb(new Error("ETIMEDOUT"), { stdout: "", stderr: "Connection timed out" });
     });

     const promise = monitorGmail({
        account: { ...mockAccount, pollIntervalMs: 50 },
        onMessage: vi.fn(),
        signal: controller.signal,
        log: mockLog,
        setStatus: mockSetStatus,
     });

     await new Promise(r => setTimeout(r, 100));
     controller.abort();
     await promise;

     // It should log errors
     expect(mockLog.error).toHaveBeenCalled();
  });
});
