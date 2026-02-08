import type { Api, Model } from "@mariozechner/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendCacheTtlTimestamp = vi.fn();
const isCacheTtlEligibleProvider = vi.fn(() => true);

const waitOrder: string[] = [];
const didAutoCompaction = vi.fn();
const waitForCompactionRetry = vi.fn(async () => {
  waitOrder.push("wait");
});

vi.mock("../cache-ttl.js", () => ({
  appendCacheTtlTimestamp: (...args: unknown[]) => appendCacheTtlTimestamp(...args),
  isCacheTtlEligibleProvider: (...args: unknown[]) => isCacheTtlEligibleProvider(...args),
}));

vi.mock("../../pi-embedded-subscribe.js", () => ({
  subscribeEmbeddedPiSession: () => ({
    assistantTexts: [],
    toolMetas: [],
    unsubscribe: vi.fn(),
    waitForCompactionRetry,
    didAutoCompaction: () => didAutoCompaction(),
    isCompacting: () => false,
    getMessagingToolSentTexts: () => [],
    getMessagingToolSentTargets: () => [],
    didSendViaMessagingTool: () => false,
    getLastToolError: () => undefined,
  }),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  streamSimple: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => {
  const sessionManager = {
    getLeafEntry: () => null,
    branch: vi.fn(),
    resetLeaf: vi.fn(),
    buildSessionContext: () => ({ messages: [] }),
    appendCustomEntry: vi.fn(),
    flushPendingToolResults: vi.fn(),
  };
  const session = {
    sessionId: "session:test",
    agent: { replaceMessages: vi.fn(), streamFn: vi.fn() },
    messages: [],
    isStreaming: false,
    prompt: vi.fn(async () => {}),
    steer: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  return {
    SessionManager: { open: vi.fn(() => sessionManager) },
    SettingsManager: { create: vi.fn(() => ({})) },
    createAgentSession: vi.fn(async () => ({ session })),
  };
});

vi.mock("../../../auto-reply/heartbeat.js", () => ({
  resolveHeartbeatPrompt: vi.fn(() => undefined),
}));

vi.mock("../../../config/channel-capabilities.js", () => ({
  resolveChannelCapabilities: vi.fn(() => ({ supportsImages: false })),
}));

vi.mock("../../../infra/machine-name.js", () => ({
  getMachineDisplayName: vi.fn(() => "test-host"),
}));

vi.mock("../../../media/constants.js", () => ({
  MAX_IMAGE_BYTES: 5_000_000,
}));

vi.mock("../../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => ({ hasHooks: () => false })),
}));

vi.mock("../../../routing/session-key.js", () => ({
  isSubagentSessionKey: vi.fn(() => false),
}));

vi.mock("../../../signal/reaction-level.js", () => ({
  resolveSignalReactionLevel: vi.fn(() => "off"),
}));

vi.mock("../../../telegram/inline-buttons.js", () => ({
  resolveTelegramInlineButtonsScope: vi.fn(() => "off"),
}));

vi.mock("../../../telegram/reaction-level.js", () => ({
  resolveTelegramReactionLevel: vi.fn(() => "off"),
}));

vi.mock("../../../tts/tts.js", () => ({
  buildTtsSystemPromptHint: vi.fn(() => undefined),
}));

vi.mock("../../../utils.js", () => ({
  resolveUserPath: vi.fn((p: string) => p),
}));

vi.mock("../../../utils/message-channel.js", () => ({
  normalizeMessageChannel: vi.fn((v?: string) => v),
}));

vi.mock("../../../utils/provider-utils.js", () => ({
  isReasoningTagProvider: vi.fn(() => false),
}));

vi.mock("../../agent-paths.js", () => ({
  resolveOpenClawAgentDir: vi.fn(() => "/tmp/agent-dir"),
}));

vi.mock("../../agent-scope.js", () => ({
  resolveSessionAgentIds: vi.fn(() => ({ sessionAgentId: "main", defaultAgentId: "main" })),
}));

vi.mock("../../anthropic-payload-log.js", () => ({
  createAnthropicPayloadLogger: vi.fn(() => ({
    recordUsage: vi.fn(),
    wrapStreamFn: vi.fn((fn: unknown) => fn),
  })),
}));

vi.mock("../../bootstrap-files.js", () => ({
  makeBootstrapWarn: vi.fn(() => ({ warn: vi.fn() })),
  resolveBootstrapContextForRun: vi.fn(async () => ({
    bootstrapFiles: [],
    contextFiles: [],
  })),
}));

vi.mock("../../cache-trace.js", () => ({
  createCacheTrace: vi.fn(() => ({
    recordStage: vi.fn(),
    wrapStreamFn: vi.fn((fn: unknown) => fn),
  })),
}));

vi.mock("../../channel-tools.js", () => ({
  listChannelSupportedActions: vi.fn(() => []),
  resolveChannelMessageToolHints: vi.fn(() => undefined),
}));

vi.mock("../../docs-path.js", () => ({
  resolveOpenClawDocsPath: vi.fn(async () => undefined),
}));

vi.mock("../../failover-error.js", () => ({
  isTimeoutError: vi.fn(() => false),
}));

vi.mock("../../model-auth.js", () => ({
  resolveModelAuthMode: vi.fn(() => "api-key"),
}));

vi.mock("../../model-selection.js", () => ({
  resolveDefaultModelForAgent: vi.fn(() => ({ provider: "anthropic", model: "claude" })),
}));

vi.mock("../../pi-embedded-helpers.js", () => ({
  isCloudCodeAssistFormatError: vi.fn(() => false),
  resolveBootstrapMaxChars: vi.fn(() => 0),
  validateAnthropicTurns: vi.fn(() => {}),
  validateGeminiTurns: vi.fn(() => {}),
}));

vi.mock("../../pi-settings.js", () => ({
  ensurePiCompactionReserveTokens: vi.fn(() => {}),
  resolveCompactionReserveTokensFloor: vi.fn(() => 0),
}));

vi.mock("../../pi-tool-definition-adapter.js", () => ({
  toClientToolDefinitions: vi.fn(() => []),
}));

vi.mock("../../pi-tools.js", () => ({
  createOpenClawCodingTools: vi.fn(() => []),
}));

vi.mock("../../sandbox.js", () => ({
  resolveSandboxContext: vi.fn(async () => undefined),
}));

vi.mock("../../sandbox/runtime-status.js", () => ({
  resolveSandboxRuntimeStatus: vi.fn(() => ({ mode: "off", sandboxed: false })),
}));

vi.mock("../../session-file-repair.js", () => ({
  repairSessionFileIfNeeded: vi.fn(async () => false),
}));

vi.mock("../../session-tool-result-guard-wrapper.js", () => ({
  guardSessionManager: vi.fn((sm) => sm),
}));

vi.mock("../../session-write-lock.js", () => ({
  acquireSessionWriteLock: vi.fn(async () => ({ release: vi.fn(async () => {}) })),
}));

vi.mock("../../skills.js", () => ({
  applySkillEnvOverrides: vi.fn(() => () => {}),
  applySkillEnvOverridesFromSnapshot: vi.fn(() => () => {}),
  loadWorkspaceSkillEntries: vi.fn(() => []),
  resolveSkillsPromptForRun: vi.fn(() => ""),
}));

vi.mock("../../system-prompt-params.js", () => ({
  buildSystemPromptParams: vi.fn(() => ({
    runtimeInfo: {},
    userTimezone: "UTC",
    userTime: "00:00",
    userTimeFormat: "24h",
  })),
}));

vi.mock("../../system-prompt-report.js", () => ({
  buildSystemPromptReport: vi.fn(() => ({ systemPrompt: "" })),
}));

vi.mock("../../transcript-policy.js", () => ({
  resolveTranscriptPolicy: vi.fn(() => ({ allowSyntheticToolResults: false })),
}));

vi.mock("../../workspace.js", () => ({
  DEFAULT_BOOTSTRAP_FILENAME: "OPENCLAW.md",
}));

vi.mock("../abort.js", () => ({
  isAbortError: vi.fn(() => false),
}));

vi.mock("../extensions.js", () => ({
  buildEmbeddedExtensionPaths: vi.fn(() => []),
}));

vi.mock("../extra-params.js", () => ({
  applyExtraParamsToAgent: vi.fn(() => {}),
}));

vi.mock("../google.js", () => ({
  logToolSchemasForGoogle: vi.fn(() => {}),
  sanitizeSessionHistory: vi.fn((messages) => messages),
  sanitizeToolsForGoogle: vi.fn((tools) => tools),
}));

vi.mock("../history.js", () => ({
  getDmHistoryLimitFromSessionKey: vi.fn(() => undefined),
  limitHistoryTurns: vi.fn(() => []),
}));

vi.mock("../logger.js", () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../model.js", () => ({
  buildModelAliasLines: vi.fn(() => []),
}));

vi.mock("../runs.js", () => ({
  clearActiveEmbeddedRun: vi.fn(() => {}),
  setActiveEmbeddedRun: vi.fn(() => {}),
}));

vi.mock("../sandbox-info.js", () => ({
  buildEmbeddedSandboxInfo: vi.fn(() => undefined),
}));

vi.mock("../session-manager-cache.js", () => ({
  prewarmSessionFile: vi.fn(async () => {}),
  trackSessionManagerAccess: vi.fn(() => {}),
}));

vi.mock("../session-manager-init.js", () => ({
  prepareSessionManagerForRun: vi.fn(async () => {}),
}));

vi.mock("../system-prompt.js", () => ({
  applySystemPromptOverrideToSession: vi.fn(() => {}),
  buildEmbeddedSystemPrompt: vi.fn(() => ""),
  createSystemPromptOverride: vi.fn((prompt: string) => () => prompt),
}));

vi.mock("../tool-split.js", () => ({
  splitSdkTools: vi.fn(() => ({ builtInTools: [], customTools: [] })),
}));

vi.mock("../utils.js", () => ({
  describeUnknownError: vi.fn((err: unknown) => String(err)),
  mapThinkingLevel: vi.fn(() => "off"),
}));

vi.mock("./images.js", () => ({
  detectAndLoadPromptImages: vi.fn(async () => ({
    images: [],
    historyImagesByIndex: new Map(),
  })),
}));

import { runEmbeddedAttempt } from "./attempt.js";

const model = {
  id: "claude-3",
  provider: "anthropic",
  api: "messages",
  input: ["text"],
} as unknown as Model<Api>;

const baseParams = {
  sessionId: "session:test",
  sessionKey: "main",
  sessionFile: "/tmp/session.jsonl",
  workspaceDir: "/tmp/workspace",
  prompt: "hi",
  provider: "anthropic",
  modelId: "claude-3",
  model,
  authStorage: {},
  modelRegistry: {},
  thinkLevel: "off",
  timeoutMs: 1000,
  runId: "run-1",
  config: {
    agents: {
      defaults: {
        contextPruning: { mode: "cache-ttl" },
      },
    },
  },
};

describe("runEmbeddedAttempt cache-ttl timing", () => {
  beforeEach(() => {
    appendCacheTtlTimestamp.mockClear();
    isCacheTtlEligibleProvider.mockClear();
    didAutoCompaction.mockReset();
    waitForCompactionRetry.mockClear();
    waitOrder.length = 0;
  });

  it("skips cache-ttl append when auto-compaction ran", async () => {
    didAutoCompaction.mockReturnValue(true);

    await runEmbeddedAttempt(baseParams);

    expect(waitForCompactionRetry).toHaveBeenCalledTimes(1);
    expect(appendCacheTtlTimestamp).not.toHaveBeenCalled();
  });

  it("appends cache-ttl after compaction retry wait when no auto-compaction ran", async () => {
    didAutoCompaction.mockReturnValue(false);
    appendCacheTtlTimestamp.mockImplementation(() => {
      waitOrder.push("append");
    });

    await runEmbeddedAttempt(baseParams);

    expect(waitForCompactionRetry).toHaveBeenCalledTimes(1);
    expect(appendCacheTtlTimestamp).toHaveBeenCalledTimes(1);
    expect(waitOrder).toEqual(["wait", "append"]);
  });
});
