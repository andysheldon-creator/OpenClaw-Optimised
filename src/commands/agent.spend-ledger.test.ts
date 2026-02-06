import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
}));
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

const recordSpendFromResultMock = vi.fn();
vi.mock("../infra/spend-ledger.js", () => ({
  recordSpendFromResult: (...args: unknown[]) => recordSpendFromResultMock(...args),
}));

import type { RuntimeEnv } from "../runtime.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import * as configModule from "../config/config.js";
import { agentCommand } from "./agent.js";

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(() => {
    throw new Error("exit");
  }),
};

const configSpy = vi.spyOn(configModule, "loadConfig");

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "openclaw-agent-spend-" });
}

function mockConfig(home: string, storePath: string) {
  configSpy.mockReturnValue({
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        models: { "anthropic/claude-opus-4-5": {} },
        workspace: path.join(home, "openclaw"),
      },
    },
    session: { store: storePath, mainKey: "main" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadModelCatalog).mockResolvedValue([]);
});

describe("agentCommand spend ledger integration", () => {
  it("calls recordSpendFromResult with usage from agent result", async () => {
    const usage = { input: 200, output: 100, cacheRead: 500, cacheWrite: 20, total: 820 };
    vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
      payloads: [{ text: "result" }],
      meta: {
        durationMs: 500,
        agentMeta: {
          sessionId: "s-123",
          provider: "anthropic",
          model: "claude-opus-4-5",
          usage,
        },
      },
    });

    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hello", to: "+1555" }, runtime);

      expect(recordSpendFromResultMock).toHaveBeenCalledOnce();
      const call = recordSpendFromResultMock.mock.calls[0]?.[0];
      expect(call.usage).toEqual(usage);
      expect(call.provider).toBe("anthropic");
      expect(call.model).toBe("claude-opus-4-5");
      expect(typeof call.startedAt).toBe("number");
      expect(call.sessionId).toBeTruthy();
      expect(call.sessionKey).toBeTruthy();
    });
  });

  it("still calls recordSpendFromResult when usage has no cost config", async () => {
    vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: {
        durationMs: 10,
        agentMeta: {
          sessionId: "s",
          provider: "custom-provider",
          model: "custom-model",
          usage: { input: 5, output: 3 },
        },
      },
    });

    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hi", to: "+1222" }, runtime);

      expect(recordSpendFromResultMock).toHaveBeenCalledOnce();
      const call = recordSpendFromResultMock.mock.calls[0]?.[0];
      expect(call.provider).toBe("custom-provider");
      expect(call.model).toBe("custom-model");
    });
  });

  it("calls recordSpendFromResult with undefined usage when agent returns no usage", async () => {
    vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: {
        durationMs: 10,
        agentMeta: { sessionId: "s", provider: "p", model: "m" },
      },
    });

    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hi", to: "+1333" }, runtime);

      expect(recordSpendFromResultMock).toHaveBeenCalledOnce();
      const call = recordSpendFromResultMock.mock.calls[0]?.[0];
      // recordSpendFromResult is still called; it handles the no-usage case internally
      expect(call.usage).toBeUndefined();
    });
  });
});
