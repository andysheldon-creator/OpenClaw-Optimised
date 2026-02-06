import { describe, expect, it, vi, afterEach } from "vitest";

const triggerInternalHook = vi.fn(async () => {});

vi.mock("./internal-hooks.js", () => ({
  createInternalHookEvent: (
    type: string,
    action: string,
    sessionKey: string,
    context: unknown,
  ) => ({
    type,
    action,
    sessionKey,
    context,
    timestamp: new Date(),
    messages: [],
  }),
  triggerInternalHook,
}));

import { startCompactionScheduler, stopCompactionScheduler } from "./compaction-scheduler.js";

describe("compaction scheduler", () => {
  afterEach(() => {
    stopCompactionScheduler();
    triggerInternalHook.mockClear();
    vi.useRealTimers();
  });

  it("emits scheduled compaction hooks on interval", () => {
    vi.useFakeTimers();
    startCompactionScheduler({
      hooks: {
        internal: {
          enabled: true,
          entries: {
            compaction: {
              enabled: true,
              strategy: "scheduled",
              scheduleIntervalHours: 0.001,
            },
          },
        },
      },
    });

    vi.advanceTimersByTime(3600);
    expect(triggerInternalHook).toHaveBeenCalled();
  });
});
