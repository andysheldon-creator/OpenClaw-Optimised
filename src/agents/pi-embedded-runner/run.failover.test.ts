import { describe, it, expect, vi, beforeEach } from "vitest";
import * as authProfilesModule from "../auth-profiles.js";
import * as modelAuthModule from "../model-auth.js";
import { runEmbeddedPiAgent } from "./run.js";
import * as attemptModule from "./run/attempt.js";

// Mocks
vi.mock("./run/attempt.js");
vi.mock("../model-auth.js");
vi.mock("../auth-profiles.js");
vi.mock("./lanes.js", () => ({
  resolveSessionLane: () => "session-lane",
  resolveGlobalLane: () => "global-lane",
}));
vi.mock("./compact.js", () => ({
  compactEmbeddedPiSessionDirect: vi.fn(),
}));
vi.mock("./utils.js", () => ({
  describeUnknownError: (e: unknown) => String(e),
}));
vi.mock("../failover-error.js", () => ({
  FailoverError: class extends Error {},
  resolveFailoverStatus: () => 500,
}));
vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
  },
}));
vi.mock("../agent-paths.js", () => ({
  resolveOpenClawAgentDir: () => "/mock/agent/dir",
}));
vi.mock("./model.js", () => ({
  resolveModel: () => ({
    model: { id: "model1", provider: "provider1", contextWindow: 10000 },
    authStorage: { setRuntimeApiKey: vi.fn() },
    modelRegistry: {},
  }),
}));
vi.mock("../context-window-guard.js", () => ({
  evaluateContextWindowGuard: () => ({ shouldWarn: false, shouldBlock: false, tokens: 100 }),
  resolveContextWindowInfo: () => ({}),
  CONTEXT_WINDOW_WARN_BELOW_TOKENS: 1000,
  CONTEXT_WINDOW_HARD_MIN_TOKENS: 100,
}));
vi.mock("../model-selection.js", () => ({
  normalizeProviderId: (p) => p,
}));
vi.mock("./logger.js", () => ({
  log: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock("../../utils/message-channel.js", () => ({
  isMarkdownCapableMessageChannel: () => true,
  INTERNAL_MESSAGE_CHANNEL: "webchat",
  CHAT_CHANNEL_ORDER: ["telegram", "discord"],
}));
vi.mock("../defaults.js", () => ({
  DEFAULT_CONTEXT_TOKENS: 4096,
  DEFAULT_MODEL: "model1",
  DEFAULT_PROVIDER: "provider1",
}));
vi.mock("../models-config.js", () => ({
  ensureOpenClawModelsJson: vi.fn(),
}));
vi.mock("../pi-embedded-helpers.js", () => ({
  classifyFailoverReason: (msg: string) => (msg === "Rate limit exceeded" ? "rate_limit" : null),
  isFailoverAssistantError: (assistant: { errorMessage?: string }) => !!assistant?.errorMessage,
  isRateLimitAssistantError: () => false,
  isAuthAssistantError: () => false,
  isBillingAssistantError: () => false,
  isTimeoutErrorMessage: () => false,
  parseImageSizeError: () => null,
  parseImageDimensionError: () => null,
  pickFallbackThinkingLevel: () => null,
  isCompactionFailureError: () => false,
  isContextOverflowError: () => false,
  isFailoverErrorMessage: () => false,
  formatAssistantErrorText: () => "",
  BILLING_ERROR_USER_MESSAGE: "Billing error",
}));
vi.mock("../usage.js", () => ({
  normalizeUsage: () => ({}),
}));
vi.mock("./run/payloads.js", () => ({
  buildEmbeddedRunPayloads: () => [{ text: "mock payload" }],
}));

describe("runEmbeddedPiAgent - Failover Logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should set limitHistoryTurns to 5 when auth profile has rotated", async () => {
    // Setup scenarios:
    // 1. First call fails with a specific error that triggers rotation.
    // 2. Second call succeeds.

    // Mock resolveAuthProfileOrder to return multiple profiles
    vi.mocked(modelAuthModule.resolveAuthProfileOrder).mockReturnValue(["profile1", "profile2"]);
    vi.mocked(modelAuthModule.ensureAuthProfileStore).mockReturnValue({
      profiles: {
        profile1: { provider: "provider1", apiKey: "k1" },
        profile2: { provider: "provider1", apiKey: "k2" },
      },
    } as any);
    vi.mocked(modelAuthModule.getApiKeyForModel).mockResolvedValue({
      apiKey: "key",
      mode: "direct",
      profileId: "profile1",
    });

    // Mock auth profiles helpers
    vi.mocked(authProfilesModule.isProfileInCooldown).mockReturnValue(false);
    vi.mocked(authProfilesModule.markAuthProfileFailure).mockResolvedValue(undefined);
    vi.mocked(authProfilesModule.markAuthProfileGood).mockResolvedValue(undefined);
    vi.mocked(authProfilesModule.markAuthProfileUsed).mockResolvedValue(undefined);

    // runEmbeddedAttempt mock
    const attemptMock = vi.mocked(attemptModule.runEmbeddedAttempt);

    // First attempt: Fails with "Rate limit exceeded"
    attemptMock.mockResolvedValueOnce({
      aborted: false,
      promptError: null,
      timedOut: false,
      sessionIdUsed: "sess1",
      lastAssistant: {
        errorMessage: "Rate limit exceeded", // triggers rotation
        provider: "provider1",
        model: "model1",
      },
      messagingToolSentTexts: [],
    } as any);

    // Second attempt: Succeeds
    attemptMock.mockResolvedValueOnce({
      aborted: false,
      promptError: null,
      timedOut: false,
      sessionIdUsed: "sess1",
      lastAssistant: {
        content: "Success",
        provider: "provider1",
        model: "model1",
      },
      messagingToolSentTexts: [],
    } as any);

    const params = {
      sessionId: "sess1",
      prompt: "test",
      workspaceDir: "/tmp/workspace",
      config: { agents: { defaults: { model: { fallbacks: [] } } } },
      enqueue: vi.fn((fn: () => unknown) => fn()),
    };

    await runEmbeddedPiAgent(params as any);

    expect(attemptMock).toHaveBeenCalledTimes(2);

    // First call: limitHistoryTurns should be undefined (default)
    expect(attemptMock.mock.calls[0][0].limitHistoryTurns).toBeUndefined();

    // Second call: limitHistoryTurns should be 5 (FAILOVER_HISTORY_LIMIT)
    expect(attemptMock.mock.calls[1][0].limitHistoryTurns).toBe(5);
  });
});
