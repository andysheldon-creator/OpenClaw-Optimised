import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../globals.js", () => ({
  logVerbose: vi.fn(),
}));

import { logVerbose } from "../globals.js";
import { attachDiscordGatewayLogging } from "./gateway-logging.js";

const makeRuntime = () => ({
  log: vi.fn(),
});

describe("attachDiscordGatewayLogging", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs debug events and promotes reconnect/close to info", () => {
    const emitter = new EventEmitter();
    const runtime = makeRuntime();

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
    });

    emitter.emit("debug", "WebSocket connection opened");
    emitter.emit("debug", "WebSocket connection closed with code 1001");
    emitter.emit("debug", "Reconnecting with backoff: 1000ms after code 1001");

    const logVerboseMock = vi.mocked(logVerbose);
    expect(logVerboseMock).toHaveBeenCalledTimes(3);
    expect(runtime.log).toHaveBeenCalledTimes(2);
    expect(runtime.log).toHaveBeenNthCalledWith(
      1,
      "discord gateway: WebSocket connection closed with code 1001",
    );
    expect(runtime.log).toHaveBeenNthCalledWith(
      2,
      "discord gateway: Reconnecting with backoff: 1000ms after code 1001",
    );

    cleanup();
  });

  it("logs warnings and metrics only to verbose", () => {
    const emitter = new EventEmitter();
    const runtime = makeRuntime();

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
    });

    emitter.emit("warning", "High latency detected: 1200ms");
    emitter.emit("metrics", { latency: 42, errors: 1 });

    const logVerboseMock = vi.mocked(logVerbose);
    expect(logVerboseMock).toHaveBeenCalledTimes(2);
    expect(runtime.log).not.toHaveBeenCalled();

    cleanup();
  });

  it("removes listeners on cleanup", () => {
    const emitter = new EventEmitter();
    const runtime = makeRuntime();

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
    });
    cleanup();

    const logVerboseMock = vi.mocked(logVerbose);
    logVerboseMock.mockClear();

    emitter.emit("debug", "WebSocket connection closed with code 1001");
    emitter.emit("warning", "High latency detected: 1200ms");
    emitter.emit("metrics", { latency: 42 });

    expect(logVerboseMock).not.toHaveBeenCalled();
    expect(runtime.log).not.toHaveBeenCalled();
  });
});

describe("attachDiscordGatewayLogging zombie detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("triggers reconnect when isConnected remains false after timeout", async () => {
    const emitter = new EventEmitter();
    const runtime = { log: vi.fn(), error: vi.fn() };
    const gateway = {
      isConnected: false,
      disconnect: vi.fn(),
      connect: vi.fn(),
    };

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
      gateway,
    });

    // Simulate WebSocket open but no HELLO
    emitter.emit("debug", "WebSocket connection opened");

    // Advance past the 30s timeout
    await vi.advanceTimersByTimeAsync(30_000);

    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("connection stalled"),
    );
    expect(gateway.disconnect).toHaveBeenCalled();
    expect(gateway.connect).toHaveBeenCalledWith(false);

    cleanup();
  });

  it("does not trigger reconnect when isConnected becomes true", async () => {
    const emitter = new EventEmitter();
    const runtime = { log: vi.fn(), error: vi.fn() };
    const gateway = {
      isConnected: false,
      disconnect: vi.fn(),
      connect: vi.fn(),
    };

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
      gateway,
    });

    // Simulate WebSocket open
    emitter.emit("debug", "WebSocket connection opened");

    // Simulate HELLO received (isConnected becomes true)
    gateway.isConnected = true;

    // Advance past the 30s timeout
    await vi.advanceTimersByTimeAsync(30_000);

    expect(runtime.error).not.toHaveBeenCalled();
    expect(gateway.disconnect).not.toHaveBeenCalled();

    cleanup();
  });

  it("clears timeout on cleanup", async () => {
    const emitter = new EventEmitter();
    const runtime = { log: vi.fn(), error: vi.fn() };
    const gateway = {
      isConnected: false,
      disconnect: vi.fn(),
      connect: vi.fn(),
    };

    const cleanup = attachDiscordGatewayLogging({
      emitter,
      runtime,
      gateway,
    });

    emitter.emit("debug", "WebSocket connection opened");

    // Cleanup before timeout fires
    cleanup();

    await vi.advanceTimersByTimeAsync(30_000);

    // Should not have triggered reconnect
    expect(gateway.disconnect).not.toHaveBeenCalled();
  });
});
