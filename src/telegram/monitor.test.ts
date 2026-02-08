import { beforeEach, describe, expect, it, vi } from "vitest";
import { monitorTelegramProvider, __resetInstanceStates } from "./monitor.js";

type MockCtx = {
  message: {
    chat: { id: number; type: string; title?: string };
    text?: string;
    caption?: string;
  };
  me?: { username: string };
  getFile: () => Promise<unknown>;
};

// Fake bot to capture handler and API calls
const handlers: Record<string, (ctx: MockCtx) => Promise<void> | void> = {};
const api = {
  sendMessage: vi.fn(),
  sendPhoto: vi.fn(),
  sendVideo: vi.fn(),
  sendAudio: vi.fn(),
  sendDocument: vi.fn(),
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
};
const { initSpy, runSpy, loadConfig } = vi.hoisted(() => ({
  initSpy: vi.fn(async () => undefined),
  runSpy: vi.fn(() => ({
    task: () => Promise.resolve(),
    stop: vi.fn(),
  })),
  loadConfig: vi.fn(() => ({
    agents: { defaults: { maxConcurrent: 2 } },
    channels: { telegram: {} },
  })),
}));

const { computeBackoff, sleepWithAbort } = vi.hoisted(() => ({
  computeBackoff: vi.fn(() => 0),
  sleepWithAbort: vi.fn(async () => undefined),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig,
  };
});

vi.mock("./bot.js", () => ({
  createTelegramBot: () => {
    handlers.message = async (ctx: MockCtx) => {
      const chatId = ctx.message.chat.id;
      const isGroup = ctx.message.chat.type !== "private";
      const text = ctx.message.text ?? ctx.message.caption ?? "";
      if (isGroup && !text.includes("@mybot")) {
        return;
      }
      if (!text.trim()) {
        return;
      }
      await api.sendMessage(chatId, `echo:${text}`, { parse_mode: "HTML" });
    };
    return {
      on: vi.fn(),
      api,
      me: { username: "mybot" },
      init: initSpy,
      stop: vi.fn(),
      start: vi.fn(),
    };
  },
  createTelegramWebhookCallback: vi.fn(),
}));

// Mock the grammyjs/runner to resolve immediately
vi.mock("@grammyjs/runner", () => ({
  run: runSpy,
}));

vi.mock("../infra/backoff.js", () => ({
  computeBackoff,
  sleepWithAbort,
}));

vi.mock("../auto-reply/reply.js", () => ({
  getReplyFromConfig: async (ctx: { Body?: string }) => ({
    text: `echo:${ctx.Body}`,
  }),
}));

describe("monitorTelegramProvider (grammY)", () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({
      agents: { defaults: { maxConcurrent: 2 } },
      channels: { telegram: {} },
    });
    initSpy.mockClear();
    // Use mockReset to clear both call history AND implementation queue
    runSpy.mockReset();
    // Restore default implementation after reset
    runSpy.mockImplementation(() => ({
      task: () => Promise.resolve(),
      stop: vi.fn(),
    }));
    computeBackoff.mockClear();
    sleepWithAbort.mockClear();
    // Reset instance states between tests
    __resetInstanceStates();
  });

  it("processes a DM and sends reply", async () => {
    Object.values(api).forEach((fn) => {
      fn?.mockReset?.();
    });
    await monitorTelegramProvider({ token: "tok" });
    expect(handlers.message).toBeDefined();
    await handlers.message?.({
      message: {
        message_id: 1,
        chat: { id: 123, type: "private" },
        text: "hi",
      },
      me: { username: "mybot" },
      getFile: vi.fn(async () => ({})),
    });
    expect(api.sendMessage).toHaveBeenCalledWith(123, "echo:hi", {
      parse_mode: "HTML",
    });
  });

  it("uses agent maxConcurrent for runner concurrency", async () => {
    runSpy.mockClear();
    loadConfig.mockReturnValue({
      agents: { defaults: { maxConcurrent: 3 } },
      channels: { telegram: {} },
    });

    await monitorTelegramProvider({ token: "tok" });

    expect(runSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sink: { concurrency: 3 },
        runner: expect.objectContaining({
          silent: true,
          maxRetryTime: 5 * 60 * 1000,
          retryInterval: "exponential",
        }),
      }),
    );
  });

  it("requires mention in groups by default", async () => {
    Object.values(api).forEach((fn) => {
      fn?.mockReset?.();
    });
    await monitorTelegramProvider({ token: "tok" });
    await handlers.message?.({
      message: {
        message_id: 2,
        chat: { id: -99, type: "supergroup", title: "G" },
        text: "hello all",
      },
      me: { username: "mybot" },
      getFile: vi.fn(async () => ({})),
    });
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("retries on recoverable network errors", async () => {
    const networkError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    runSpy
      .mockImplementationOnce(() => ({
        task: () => Promise.reject(networkError),
        stop: vi.fn(),
      }))
      .mockImplementationOnce(() => ({
        task: () => Promise.resolve(),
        stop: vi.fn(),
      }));

    await monitorTelegramProvider({ token: "tok" });

    expect(computeBackoff).toHaveBeenCalled();
    expect(sleepWithAbort).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledTimes(2);
  });

  it("surfaces non-recoverable errors", async () => {
    runSpy.mockImplementationOnce(() => ({
      task: () => Promise.reject(new Error("bad token")),
      stop: vi.fn(),
    }));

    await expect(monitorTelegramProvider({ token: "tok" })).rejects.toThrow("bad token");
  });

  it("prevents duplicate instances from starting simultaneously", async () => {
    // First call - should start
    const abort1 = new AbortController();
    let resolveTask1: (() => void) | undefined;
    const task1Promise = new Promise<void>((resolve) => {
      resolveTask1 = resolve;
    });
    runSpy.mockImplementationOnce(() => ({
      task: () => task1Promise,
      stop: vi.fn(() => {
        resolveTask1?.();
      }),
    }));

    const promise1 = monitorTelegramProvider({ token: "tok", abortSignal: abort1.signal });

    // Small delay to let first instance mark as running
    await new Promise((r) => setTimeout(r, 10));

    // Second call while first is running - should be skipped
    const abort2 = new AbortController();
    const promise2 = monitorTelegramProvider({ token: "tok", abortSignal: abort2.signal });

    // promise2 should return immediately since instance is already running
    await promise2;

    // run should only have been called once (for the first instance)
    expect(runSpy).toHaveBeenCalledTimes(1);

    // Clean up first instance
    abort1.abort();
    await promise1;
  });

  it("debounces rapid start attempts", async () => {
    // First call - completes quickly
    runSpy.mockImplementationOnce(() => ({
      task: () => Promise.resolve(),
      stop: vi.fn(),
    }));

    await monitorTelegramProvider({ token: "tok" });

    // Second call immediately after - should be debounced
    runSpy.mockImplementationOnce(() => ({
      task: () => Promise.resolve(),
      stop: vi.fn(),
    }));

    await monitorTelegramProvider({ token: "tok" });

    // run should only have been called once (second was debounced)
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("allows start after debounce period", async () => {
    // Mock Date.now to control timing
    const originalNow = Date.now;
    let mockTime = 1000000;
    vi.spyOn(Date, "now").mockImplementation(() => mockTime);

    try {
      // First call
      runSpy.mockImplementationOnce(() => ({
        task: () => Promise.resolve(),
        stop: vi.fn(),
      }));

      await monitorTelegramProvider({ token: "tok" });
      expect(runSpy).toHaveBeenCalledTimes(1);

      // Advance time past debounce period (1500ms)
      mockTime += 2000;

      // Second call after debounce - should work
      runSpy.mockImplementationOnce(() => ({
        task: () => Promise.resolve(),
        stop: vi.fn(),
      }));

      await monitorTelegramProvider({ token: "tok" });
      expect(runSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });

  it("clears running state on error allowing subsequent starts", async () => {
    // This test verifies that after an error, the instance state is properly
    // cleared so a subsequent start can proceed.

    // First, let's verify the error surfaces correctly (similar to existing test)
    runSpy.mockImplementationOnce(() => ({
      task: () => Promise.reject(new Error("unique-error-123")),
      stop: vi.fn(),
    }));

    await expect(monitorTelegramProvider({ token: "tok" })).rejects.toThrow("unique-error-123");

    // After an error, instance state should be cleared (running=false)
    // Wait past debounce time and try again
    const originalNow = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => originalNow + 2000);

    try {
      // Second call should succeed - instance state was cleared on error
      runSpy.mockImplementationOnce(() => ({
        task: () => Promise.resolve(),
        stop: vi.fn(),
      }));

      await monitorTelegramProvider({ token: "tok" });
      // If we get here without being blocked, the test passes
      expect(runSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });
});
