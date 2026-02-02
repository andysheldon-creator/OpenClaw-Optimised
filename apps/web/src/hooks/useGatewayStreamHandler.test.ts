import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGatewayStreamHandler } from "./useGatewayStreamHandler";

type GatewayEvent = { event: string; payload?: unknown };

const hoisted = vi.hoisted(() => {
  const toast = {
    loading: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
  };

  let gatewayEventHandler: ((event: GatewayEvent) => void) | null = null;
  const addEventListener = vi.fn((handler: (event: GatewayEvent) => void) => {
    gatewayEventHandler = handler;
    return () => {
      gatewayEventHandler = null;
    };
  });

  const state = {
    currentRunIds: {} as Record<string, string>,
    streamingMessages: {} as Record<string, unknown>,
  };

  const startStreaming = vi.fn((sessionKey: string, runId: string) => {
    state.currentRunIds[sessionKey] = runId;
    state.streamingMessages[sessionKey] = {
      content: "",
      toolCalls: [],
      isStreaming: true,
    };
  });

  const setStreamingContent = vi.fn();
  const appendStreamingContent = vi.fn();
  const updateToolCall = vi.fn();
  const finishStreaming = vi.fn();
  const clearStreaming = vi.fn();

  const findSessionKeyByRunId = vi.fn((runId: string) => {
    for (const [sessionKey, id] of Object.entries(state.currentRunIds)) {
      if (id === runId) return sessionKey;
    }
    return null;
  });

  return {
    toast,
    gateway: {
      addEventListener,
      getHandler: () => gatewayEventHandler,
      reset: () => {
        gatewayEventHandler = null;
      },
    },
    store: {
      state,
      startStreaming,
      setStreamingContent,
      appendStreamingContent,
      updateToolCall,
      finishStreaming,
      clearStreaming,
      findSessionKeyByRunId,
      reset: () => {
        state.currentRunIds = {};
        state.streamingMessages = {};
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: hoisted.toast,
}));

vi.mock("@/providers/GatewayProvider", () => ({
  useOptionalGateway: () => ({ addEventListener: hoisted.gateway.addEventListener }),
}));

vi.mock("@/stores/useSessionStore", () => {
  const useSessionStoreMock = (selector?: (s: unknown) => unknown) => {
    const store = {
      ...hoisted.store.state,
      startStreaming: hoisted.store.startStreaming,
      setStreamingContent: hoisted.store.setStreamingContent,
      appendStreamingContent: hoisted.store.appendStreamingContent,
      updateToolCall: hoisted.store.updateToolCall,
      finishStreaming: hoisted.store.finishStreaming,
      clearStreaming: hoisted.store.clearStreaming,
      findSessionKeyByRunId: hoisted.store.findSessionKeyByRunId,
    };
    return selector ? selector(store) : store;
  };

const useSessionStoreMock = Object.assign(
  vi.fn((selector?: (s: unknown) => unknown) => {
    const store = {
      ...state,
      startStreaming,
      setStreamingContent,
      appendStreamingContent,
      updateToolCall,
      finishStreaming,
      clearStreaming,
      findSessionKeyByRunId,
    };
    return selector ? selector(store) : store;
  }),
  {
    getState: () => ({
      ...state,
      startStreaming,
      setStreamingContent,
      appendStreamingContent,
      updateToolCall,
      finishStreaming,
      clearStreaming,
      findSessionKeyByRunId,
    }),
  },
);

  return { useSessionStore: useSessionStoreMock };
});

describe("useGatewayStreamHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.gateway.reset();
    hoisted.store.reset();
  });

  it("subscribes to gateway events when enabled", () => {
    renderHook(() => useGatewayStreamHandler({ enabled: true }));
    expect(hoisted.gateway.addEventListener).toHaveBeenCalledTimes(1);
    expect(typeof hoisted.gateway.getHandler()).toBe("function");
  });

  it("routes chat deltas as content snapshots", () => {
    renderHook(() => useGatewayStreamHandler({ enabled: true }));

    hoisted.gateway.getHandler()?.({
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "session-1",
        seq: 1,
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          timestamp: 0,
        },
      },
    });

    expect(hoisted.store.startStreaming).toHaveBeenCalledWith("session-1", "run-1");
    expect(hoisted.store.setStreamingContent).toHaveBeenCalledWith("session-1", "Hello");
    expect(hoisted.store.appendStreamingContent).not.toHaveBeenCalled();
  });

  it("routes agent tool stream events to tool calls (sessionKey fallback via runId)", () => {
    renderHook(() => useGatewayStreamHandler({ enabled: true }));

    // Seed runId -> sessionKey mapping via chat delta.
    hoisted.gateway.getHandler()?.({
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "session-1",
        seq: 1,
        state: "delta",
        message: { role: "assistant", content: [{ type: "text", text: "" }], timestamp: 0 },
      },
    });

    hoisted.gateway.getHandler()?.({
      event: "agent",
      payload: {
        runId: "run-1",
        seq: 2,
        stream: "tool",
        ts: 0,
        data: {
          phase: "start",
          toolCallId: "tool-123",
          name: "exec",
          input: { cmd: "ls" },
        },
      },
    });

    expect(hoisted.store.findSessionKeyByRunId).toHaveBeenCalledWith("run-1");
    expect(hoisted.store.updateToolCall).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        id: "tool-123",
        name: "exec",
        status: "running",
      }),
    );
  });

  it("shows compaction start/end toasts", () => {
    renderHook(() => useGatewayStreamHandler({ enabled: true }));

    hoisted.gateway.getHandler()?.({
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "session-1",
        seq: 1,
        state: "delta",
        message: { role: "assistant", content: [{ type: "text", text: "" }], timestamp: 0 },
      },
    });

    hoisted.gateway.getHandler()?.({
      event: "agent",
      payload: {
        runId: "run-1",
        seq: 2,
        stream: "compaction",
        ts: 0,
        data: { phase: "start" },
      },
    });

    expect(hoisted.toast.loading).toHaveBeenCalledWith("Compacting context\u2026", {
      id: "compaction:session-1",
    });

    hoisted.gateway.getHandler()?.({
      event: "agent",
      payload: {
        runId: "run-1",
        seq: 3,
        stream: "compaction",
        ts: 0,
        data: { phase: "end" },
      },
    });

    expect(hoisted.toast.dismiss).toHaveBeenCalledWith("compaction:session-1");
    expect(hoisted.toast.error).not.toHaveBeenCalled();
  });
});
