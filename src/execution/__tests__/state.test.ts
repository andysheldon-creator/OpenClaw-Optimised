import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry, SessionSystemPromptReport } from "../../config/sessions.js";
import type { ExecutionRequest, RuntimeContext, TurnOutcome } from "../types.js";
import {
  createStateService,
  DefaultStateService,
  hasNonzeroUsageMetrics,
  type StateService,
} from "../state.js";

// Mock the session description refresh to prevent async background work
vi.mock("../../sessions/session-description.js", () => ({
  queueSessionDescriptionRefresh: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTestRequest(
  overrides: Partial<ExecutionRequest & { storePath?: string }> = {},
): ExecutionRequest & { storePath?: string } {
  return {
    agentId: "test-agent",
    sessionId: `test-session-${crypto.randomUUID()}`,
    sessionKey: "test-key",
    workspaceDir: "/tmp/test",
    prompt: "test prompt",
    storePath: undefined, // Will be set in tests
    ...overrides,
  };
}

function createTestOutcome(overrides: Partial<TurnOutcome> = {}): TurnOutcome {
  return {
    reply: "Test reply",
    payloads: [{ text: "Test reply" }],
    toolCalls: [],
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      durationMs: 1000,
    },
    fallbackUsed: false,
    didSendViaMessagingTool: false,
    ...overrides,
  };
}

function createTestContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    kind: "pi",
    provider: "test-provider",
    model: "test-model",
    toolPolicy: { enabled: true },
    sandbox: null,
    capabilities: {
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      supportsThinking: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

class TestSessionStore {
  private tempDir: string;
  private storePath: string;
  private store: Record<string, SessionEntry> = {};

  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-"));
    this.storePath = path.join(this.tempDir, "sessions.json");
  }

  get path(): string {
    return this.storePath;
  }

  setup(entries: Record<string, Partial<SessionEntry>> = {}): void {
    this.store = {};
    for (const [key, entry] of Object.entries(entries)) {
      this.store[key] = {
        sessionId: entry.sessionId ?? crypto.randomUUID(),
        updatedAt: entry.updatedAt ?? Date.now(),
        ...entry,
      } as SessionEntry;
    }
    this.save();
  }

  get(key: string): SessionEntry | undefined {
    this.reload();
    return this.store[key];
  }

  getAll(): Record<string, SessionEntry> {
    this.reload();
    return { ...this.store };
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private reload(): void {
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      this.store = JSON.parse(raw);
    } catch {
      this.store = {};
    }
  }

  cleanup(): void {
    fs.rmSync(this.tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StateService", () => {
  let store: TestSessionStore;
  let stateService: StateService;

  beforeEach(() => {
    store = new TestSessionStore();
    stateService = createStateService();
  });

  afterEach(() => {
    store.cleanup();
  });

  describe("persist", () => {
    it("should persist usage metrics to session store", async () => {
      const sessionKey = "test-key";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          turnCount: 5,
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome({
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          durationMs: 500,
        },
      });
      const context = createTestContext({
        provider: "anthropic",
        model: "claude-3-opus",
      });

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      expect(entry).toBeDefined();
      expect(entry?.inputTokens).toBe(200);
      expect(entry?.outputTokens).toBe(100);
      expect(entry?.modelProvider).toBe("anthropic");
      expect(entry?.model).toBe("claude-3-opus");
      expect(entry?.turnCount).toBe(6); // Incremented from 5
    });

    it("should increment turn count", async () => {
      const sessionKey = "turn-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          turnCount: 10,
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      expect(entry?.turnCount).toBe(11);
    });

    it("should start turn count at 1 for new sessions", async () => {
      const sessionKey = "new-session";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          // No turnCount set
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      expect(entry?.turnCount).toBe(1);
    });

    it("should update timestamp", async () => {
      const sessionKey = "timestamp-test";
      const oldTime = Date.now() - 60000;
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          updatedAt: oldTime,
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();

      const beforePersist = Date.now();
      await stateService.persist(request, outcome, context);
      const afterPersist = Date.now();

      const entry = store.get(sessionKey);
      expect(entry?.updatedAt).toBeGreaterThanOrEqual(beforePersist);
      expect(entry?.updatedAt).toBeLessThanOrEqual(afterPersist);
    });

    it("should persist provider and model", async () => {
      const sessionKey = "model-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          modelProvider: "old-provider",
          model: "old-model",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext({
        provider: "new-provider",
        model: "new-model",
      });

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      expect(entry?.modelProvider).toBe("new-provider");
      expect(entry?.model).toBe("new-model");
    });

    it("should preserve existing provider/model when context has none", async () => {
      const sessionKey = "preserve-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          modelProvider: "existing-provider",
          model: "existing-model",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext({
        provider: undefined as unknown as string,
        model: undefined as unknown as string,
      });

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      // Should preserve existing values when context values are undefined
      expect(entry?.modelProvider).toBe("existing-provider");
      expect(entry?.model).toBe("existing-model");
    });

    it("should calculate total tokens from cache values", async () => {
      const sessionKey = "cache-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome({
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheWriteTokens: 10,
          durationMs: 500,
        },
      });
      const context = createTestContext();

      await stateService.persist(request, outcome, context);

      const entry = store.get(sessionKey);
      expect(entry?.inputTokens).toBe(100);
      expect(entry?.outputTokens).toBe(50);
      // totalTokens = input + cacheRead + cacheWrite = 100 + 20 + 10 = 130
      expect(entry?.totalTokens).toBe(130);
    });

    it("should persist CLI session ID", async () => {
      const sessionKey = "cli-session-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext({ provider: "claude-cli" });

      await stateService.persist(request, outcome, context, {
        cliSessionId: "cli-session-abc123",
      });

      const entry = store.get(sessionKey);
      expect(entry?.cliSessionIds?.["claude-cli"]).toBe("cli-session-abc123");
      expect(entry?.claudeCliSessionId).toBe("cli-session-abc123");
    });

    it("should persist Claude SDK session ID", async () => {
      const sessionKey = "sdk-session-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();

      await stateService.persist(request, outcome, context, {
        claudeSdkSessionId: "sdk-session-xyz789",
      });

      const entry = store.get(sessionKey);
      expect(entry?.claudeSdkSessionId).toBe("sdk-session-xyz789");
    });

    it("should persist aborted flag", async () => {
      const sessionKey = "aborted-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          abortedLastRun: false,
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();

      await stateService.persist(request, outcome, context, { aborted: true });

      const entry = store.get(sessionKey);
      expect(entry?.abortedLastRun).toBe(true);
    });

    it("should persist system prompt report", async () => {
      const sessionKey = "report-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
        },
      });

      const request = createTestRequest({ sessionKey, storePath: store.path });
      const outcome = createTestOutcome();
      const context = createTestContext();
      const report: SessionSystemPromptReport = {
        source: "run",
        generatedAt: Date.now(),
        systemPrompt: { chars: 1000, projectContextChars: 500, nonProjectContextChars: 500 },
        injectedWorkspaceFiles: [],
        skills: { promptChars: 0, entries: [] },
        tools: { listChars: 0, schemaChars: 0, entries: [] },
      };

      await stateService.persist(request, outcome, context, {
        systemPromptReport: report,
      });

      const entry = store.get(sessionKey);
      expect(entry?.systemPromptReport).toEqual(report);
    });

    it("should skip persist when no storePath", async () => {
      const request = createTestRequest({ storePath: undefined });
      const outcome = createTestOutcome();
      const context = createTestContext();

      // Should not throw
      await stateService.persist(request, outcome, context);
    });

    it("should skip persist when no sessionKey", async () => {
      const request = createTestRequest({
        sessionKey: undefined,
        storePath: store.path,
      });
      const outcome = createTestOutcome();
      const context = createTestContext();

      // Should not throw
      await stateService.persist(request, outcome, context);
    });

    it("should handle errors gracefully", async () => {
      const request = createTestRequest({
        sessionKey: "error-test",
        storePath: "/nonexistent/path/sessions.json",
      });
      const outcome = createTestOutcome();
      const context = createTestContext();

      // Should not throw, just log the error
      await expect(stateService.persist(request, outcome, context)).resolves.not.toThrow();
    });
  });

  describe("incrementCompactionCount", () => {
    it("should increment compaction count", async () => {
      const sessionKey = "compact-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          compactionCount: 2,
        },
      });

      const result = await stateService.incrementCompactionCount({
        sessionKey,
        storePath: store.path,
      });

      expect(result?.compactionCount).toBe(3);
      expect(result?.success).toBe(true);

      const entry = store.get(sessionKey);
      expect(entry?.compactionCount).toBe(3);
    });

    it("should start compaction count at 1 for new sessions", async () => {
      const sessionKey = "new-compact-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          // No compactionCount
        },
      });

      const result = await stateService.incrementCompactionCount({
        sessionKey,
        storePath: store.path,
      });

      expect(result?.compactionCount).toBe(1);
      const entry = store.get(sessionKey);
      expect(entry?.compactionCount).toBe(1);
    });

    it("should update token counts after compaction", async () => {
      const sessionKey = "token-compact-test";
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        },
      });

      const result = await stateService.incrementCompactionCount({
        sessionKey,
        storePath: store.path,
        tokensAfter: 800,
      });

      expect(result?.success).toBe(true);

      const entry = store.get(sessionKey);
      expect(entry?.totalTokens).toBe(800);
      // Input/output should be cleared after compaction
      expect(entry?.inputTokens).toBeUndefined();
      expect(entry?.outputTokens).toBeUndefined();
    });

    it("should update timestamp on compaction", async () => {
      const sessionKey = "timestamp-compact-test";
      const oldTime = Date.now() - 60000;
      store.setup({
        [sessionKey]: {
          sessionId: "session-1",
          updatedAt: oldTime,
        },
      });

      const before = Date.now();
      await stateService.incrementCompactionCount({
        sessionKey,
        storePath: store.path,
        now: before,
      });
      const after = Date.now();

      const entry = store.get(sessionKey);
      // mergeSessionEntry uses Math.max(existing, patch, Date.now()) so timestamp
      // will be at least `before` and at most `after`
      expect(entry?.updatedAt).toBeGreaterThanOrEqual(before);
      expect(entry?.updatedAt).toBeLessThanOrEqual(after);
    });

    it("should return undefined for missing session", async () => {
      const result = await stateService.incrementCompactionCount({
        sessionKey: "nonexistent",
        storePath: store.path,
      });

      expect(result).toBeUndefined();
    });

    it("should return undefined when storePath missing", async () => {
      const result = await stateService.incrementCompactionCount({
        sessionKey: "test",
        storePath: "",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("resolveTranscriptPath", () => {
    it("should resolve transcript path for session", () => {
      const sessionId = "test-session-123";
      const result = stateService.resolveTranscriptPath(sessionId);

      expect(result).toContain(sessionId);
      expect(result).toMatch(/\.jsonl$/);
    });

    it("should include agent ID in path when provided", () => {
      const sessionId = "test-session-456";
      const agentId = "my-agent";
      const result = stateService.resolveTranscriptPath(sessionId, agentId);

      expect(result).toContain(sessionId);
      expect(result).toContain(agentId);
    });
  });
});

describe("hasNonzeroUsageMetrics", () => {
  it("should return true when inputTokens > 0", () => {
    expect(hasNonzeroUsageMetrics({ inputTokens: 100, outputTokens: 0, durationMs: 0 })).toBe(true);
  });

  it("should return true when outputTokens > 0", () => {
    expect(hasNonzeroUsageMetrics({ inputTokens: 0, outputTokens: 50, durationMs: 0 })).toBe(true);
  });

  it("should return true when cacheReadTokens > 0", () => {
    expect(
      hasNonzeroUsageMetrics({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 10,
        durationMs: 0,
      }),
    ).toBe(true);
  });

  it("should return true when cacheWriteTokens > 0", () => {
    expect(
      hasNonzeroUsageMetrics({
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 5,
        durationMs: 0,
      }),
    ).toBe(true);
  });

  it("should return false when all token values are zero", () => {
    expect(hasNonzeroUsageMetrics({ inputTokens: 0, outputTokens: 0, durationMs: 0 })).toBe(false);
  });

  it("should return false when only durationMs has value (no cache tokens)", () => {
    expect(hasNonzeroUsageMetrics({ inputTokens: 0, outputTokens: 0, durationMs: 100 })).toBe(
      false,
    );
  });
});

describe("createStateService", () => {
  it("should create a DefaultStateService instance", () => {
    const service = createStateService();
    expect(service).toBeInstanceOf(DefaultStateService);
  });

  it("should accept logger options", () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const service = createStateService({ logger });
    expect(service).toBeInstanceOf(DefaultStateService);
  });
});

describe("DefaultStateService with logger", () => {
  let store: TestSessionStore;
  let debugFn: ReturnType<typeof vi.fn>;
  let errorFn: ReturnType<typeof vi.fn>;
  let service: StateService;

  beforeEach(() => {
    store = new TestSessionStore();
    debugFn = vi.fn();
    errorFn = vi.fn();
    // Cast needed because vi.fn() doesn't exactly match the optional logger function type
    service = createStateService({
      logger: {
        debug: debugFn as unknown as (message: string) => void,
        error: errorFn as unknown as (message: string) => void,
      },
    });
  });

  afterEach(() => {
    store.cleanup();
  });

  it("should log debug message on successful persist", async () => {
    const sessionKey = "log-test";
    store.setup({
      [sessionKey]: { sessionId: "session-1" },
    });

    const request = createTestRequest({ sessionKey, storePath: store.path });
    const outcome = createTestOutcome();
    const context = createTestContext();

    await service.persist(request, outcome, context);

    expect(debugFn).toHaveBeenCalled();
  });

  it("should log debug message on successful compaction increment", async () => {
    const sessionKey = "log-compact-test";
    store.setup({
      [sessionKey]: { sessionId: "session-1" },
    });

    await service.incrementCompactionCount({
      sessionKey,
      storePath: store.path,
    });

    expect(debugFn).toHaveBeenCalled();
  });
});
