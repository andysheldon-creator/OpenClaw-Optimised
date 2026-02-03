import { describe, expect, it, beforeEach } from "vitest";
import {
  drainSystemEvents,
  enqueueSystemEvent,
  resetSystemEventsForTest,
  setSuppressedSystemEventTypes,
} from "./system-events.js";

describe("system event filtering", () => {
  beforeEach(() => {
    resetSystemEventsForTest();
    setSuppressedSystemEventTypes([]);
  });

  it("should allow untyped events by default", () => {
    enqueueSystemEvent("test message", { sessionKey: "test" });
    const events = drainSystemEvents("test");
    expect(events).toEqual(["test message"]);
  });

  it("should allow typed events when not suppressed", () => {
    enqueueSystemEvent("exec completed", {
      sessionKey: "test",
      eventType: "exec-completion",
    });
    const events = drainSystemEvents("test");
    expect(events).toEqual(["exec completed"]);
  });

  it("should suppress configured event types", () => {
    setSuppressedSystemEventTypes(["exec-completion"]);

    enqueueSystemEvent("exec completed", {
      sessionKey: "test",
      eventType: "exec-completion",
    });
    enqueueSystemEvent("cron ran", {
      sessionKey: "test",
      eventType: "cron",
    });

    const events = drainSystemEvents("test");
    expect(events).toEqual(["cron ran"]);
  });

  it("should suppress multiple event types", () => {
    setSuppressedSystemEventTypes(["exec-completion", "heartbeat"]);

    enqueueSystemEvent("exec completed", {
      sessionKey: "test",
      eventType: "exec-completion",
    });
    enqueueSystemEvent("heartbeat ping", {
      sessionKey: "test",
      eventType: "heartbeat",
    });
    enqueueSystemEvent("system message", {
      sessionKey: "test",
      eventType: "system",
    });

    const events = drainSystemEvents("test");
    expect(events).toEqual(["system message"]);
  });

  it("should allow untyped events even when types are suppressed", () => {
    setSuppressedSystemEventTypes(["exec-completion"]);

    enqueueSystemEvent("exec completed", {
      sessionKey: "test",
      eventType: "exec-completion",
    });
    enqueueSystemEvent("untyped message", {
      sessionKey: "test",
    });

    const events = drainSystemEvents("test");
    expect(events).toEqual(["untyped message"]);
  });
});
