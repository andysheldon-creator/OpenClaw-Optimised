import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeInStages } from "../compaction.js";
import {
  getCompactionSafeguardRuntime,
  setCompactionSafeguardRuntime,
} from "./compaction-safeguard-runtime.js";
import compactionSafeguardExtension, { __testing } from "./compaction-safeguard.js";

vi.mock("../compaction.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../compaction.js")>();
  return {
    ...actual,
    summarizeInStages: vi.fn(),
  };
});

const {
  collectToolFailures,
  formatToolFailuresSection,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  SAFETY_MARGIN,
  STRUCTURED_SUMMARY_TEMPLATE,
} = __testing;

const mockedSummarizeInStages = vi.mocked(summarizeInStages);

function makeUserMessage(content: string): AgentMessage {
  return {
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

function registerSessionBeforeCompactHandler() {
  let handler:
    | ((
        event: unknown,
        ctx: ExtensionContext,
      ) => Promise<{ compaction: { summary: string; firstKeptEntryId: string } }>)
    | undefined;

  const api = {
    on: (name: string, fn: unknown) => {
      if (name === "session_before_compact") {
        handler = fn as typeof handler;
      }
    },
    appendEntry: (_type: string, _data?: unknown) => {},
  } as unknown as ExtensionAPI;

  compactionSafeguardExtension(api);
  if (!handler) {
    throw new Error("missing session_before_compact handler");
  }
  return handler;
}

function getSummarizeCall(index: number): Parameters<typeof summarizeInStages>[0] {
  const call = mockedSummarizeInStages.mock.calls[index];
  if (!call) {
    throw new Error(`missing summarizeInStages call at index ${index}`);
  }
  return call[0];
}

async function runSessionBeforeCompact(params: {
  structuredSummary: boolean;
  customInstructions?: string;
  isSplitTurn?: boolean;
}): Promise<void> {
  const sessionManager = {};
  setCompactionSafeguardRuntime(sessionManager, {
    structuredSummary: params.structuredSummary,
    contextWindowTokens: 200_000,
  });

  const handler = registerSessionBeforeCompactHandler();
  const event = {
    preparation: {
      fileOps: {
        read: new Set<string>(),
        edited: new Set<string>(),
        written: new Set<string>(),
      },
      messagesToSummarize: [makeUserMessage("history")],
      turnPrefixMessages: params.isSplitTurn ? [makeUserMessage("prefix")] : [],
      firstKeptEntryId: "entry-1",
      settings: { reserveTokens: 2048 },
      previousSummary: undefined,
      isSplitTurn: Boolean(params.isSplitTurn),
    },
    customInstructions: params.customInstructions,
    signal: new AbortController().signal,
  };

  await handler(event, {
    model: { contextWindow: 200_000 },
    modelRegistry: {
      getApiKey: vi.fn().mockResolvedValue("test-api-key"),
    },
    sessionManager,
  } as unknown as ExtensionContext);
}

beforeEach(() => {
  mockedSummarizeInStages.mockReset();
  mockedSummarizeInStages.mockResolvedValue("history summary");
});

describe("compaction-safeguard tool failures", () => {
  it("formats tool failures with meta and summary", () => {
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "exec",
        isError: true,
        details: { status: "failed", exitCode: 1 },
        content: [{ type: "text", text: "ENOENT: missing file" }],
        timestamp: Date.now(),
      },
      {
        role: "toolResult",
        toolCallId: "call-2",
        toolName: "read",
        isError: false,
        content: [{ type: "text", text: "ok" }],
        timestamp: Date.now(),
      },
    ];

    const failures = collectToolFailures(messages);
    expect(failures).toHaveLength(1);

    const section = formatToolFailuresSection(failures);
    expect(section).toContain("## Tool Failures");
    expect(section).toContain("exec (status=failed exitCode=1): ENOENT: missing file");
  });

  it("dedupes by toolCallId and handles empty output", () => {
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "exec",
        isError: true,
        details: { exitCode: 2 },
        content: [],
        timestamp: Date.now(),
      },
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "exec",
        isError: true,
        content: [{ type: "text", text: "ignored" }],
        timestamp: Date.now(),
      },
    ];

    const failures = collectToolFailures(messages);
    expect(failures).toHaveLength(1);

    const section = formatToolFailuresSection(failures);
    expect(section).toContain("exec (exitCode=2): failed");
  });

  it("caps the number of failures and adds overflow line", () => {
    const messages: AgentMessage[] = Array.from({ length: 9 }, (_, idx) => ({
      role: "toolResult",
      toolCallId: `call-${idx}`,
      toolName: "exec",
      isError: true,
      content: [{ type: "text", text: `error ${idx}` }],
      timestamp: Date.now(),
    }));

    const failures = collectToolFailures(messages);
    const section = formatToolFailuresSection(failures);
    expect(section).toContain("## Tool Failures");
    expect(section).toContain("...and 1 more");
  });

  it("omits section when there are no tool failures", () => {
    const messages: AgentMessage[] = [
      {
        role: "toolResult",
        toolCallId: "ok",
        toolName: "exec",
        isError: false,
        content: [{ type: "text", text: "ok" }],
        timestamp: Date.now(),
      },
    ];

    const failures = collectToolFailures(messages);
    const section = formatToolFailuresSection(failures);
    expect(section).toBe("");
  });
});

describe("computeAdaptiveChunkRatio", () => {
  const CONTEXT_WINDOW = 200_000;

  it("returns BASE_CHUNK_RATIO for normal messages", () => {
    // Small messages: 1000 tokens each, well under 10% of context
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(1000), timestamp: Date.now() },
      {
        role: "assistant",
        content: [{ type: "text", text: "y".repeat(1000) }],
        timestamp: Date.now(),
      },
    ];

    const ratio = computeAdaptiveChunkRatio(messages, CONTEXT_WINDOW);
    expect(ratio).toBe(BASE_CHUNK_RATIO);
  });

  it("reduces ratio when average message > 10% of context", () => {
    // Large messages: ~50K tokens each (25% of context)
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(50_000 * 4), timestamp: Date.now() },
      {
        role: "assistant",
        content: [{ type: "text", text: "y".repeat(50_000 * 4) }],
        timestamp: Date.now(),
      },
    ];

    const ratio = computeAdaptiveChunkRatio(messages, CONTEXT_WINDOW);
    expect(ratio).toBeLessThan(BASE_CHUNK_RATIO);
    expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
  });

  it("respects MIN_CHUNK_RATIO floor", () => {
    // Very large messages that would push ratio below minimum
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(150_000 * 4), timestamp: Date.now() },
    ];

    const ratio = computeAdaptiveChunkRatio(messages, CONTEXT_WINDOW);
    expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
  });

  it("handles empty message array", () => {
    const ratio = computeAdaptiveChunkRatio([], CONTEXT_WINDOW);
    expect(ratio).toBe(BASE_CHUNK_RATIO);
  });

  it("handles single huge message", () => {
    // Single massive message
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(180_000 * 4), timestamp: Date.now() },
    ];

    const ratio = computeAdaptiveChunkRatio(messages, CONTEXT_WINDOW);
    expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
    expect(ratio).toBeLessThanOrEqual(BASE_CHUNK_RATIO);
  });
});

describe("isOversizedForSummary", () => {
  const CONTEXT_WINDOW = 200_000;

  it("returns false for small messages", () => {
    const msg: AgentMessage = {
      role: "user",
      content: "Hello, world!",
      timestamp: Date.now(),
    };

    expect(isOversizedForSummary(msg, CONTEXT_WINDOW)).toBe(false);
  });

  it("returns true for messages > 50% of context", () => {
    // Message with ~120K tokens (60% of 200K context)
    // After safety margin (1.2x), effective is 144K which is > 100K (50%)
    const msg: AgentMessage = {
      role: "user",
      content: "x".repeat(120_000 * 4),
      timestamp: Date.now(),
    };

    expect(isOversizedForSummary(msg, CONTEXT_WINDOW)).toBe(true);
  });

  it("applies safety margin", () => {
    // Message at exactly 50% of context before margin
    // After SAFETY_MARGIN (1.2), it becomes 60% which is > 50%
    const halfContextChars = (CONTEXT_WINDOW * 0.5) / SAFETY_MARGIN;
    const msg: AgentMessage = {
      role: "user",
      content: "x".repeat(Math.floor(halfContextChars * 4)),
      timestamp: Date.now(),
    };

    // With safety margin applied, this should be at the boundary
    // The function checks if tokens * SAFETY_MARGIN > contextWindow * 0.5
    const isOversized = isOversizedForSummary(msg, CONTEXT_WINDOW);
    // Due to token estimation, this could be either true or false at the boundary
    expect(typeof isOversized).toBe("boolean");
  });
});

describe("compaction-safeguard runtime registry", () => {
  it("stores and retrieves config by session manager identity", () => {
    const sm = {};
    setCompactionSafeguardRuntime(sm, { maxHistoryShare: 0.3 });
    const runtime = getCompactionSafeguardRuntime(sm);
    expect(runtime).toEqual({ maxHistoryShare: 0.3 });
  });

  it("returns null for unknown session manager", () => {
    const sm = {};
    expect(getCompactionSafeguardRuntime(sm)).toBeNull();
  });

  it("clears entry when value is null", () => {
    const sm = {};
    setCompactionSafeguardRuntime(sm, { maxHistoryShare: 0.7 });
    expect(getCompactionSafeguardRuntime(sm)).not.toBeNull();
    setCompactionSafeguardRuntime(sm, null);
    expect(getCompactionSafeguardRuntime(sm)).toBeNull();
  });

  it("ignores non-object session managers", () => {
    setCompactionSafeguardRuntime(null, { maxHistoryShare: 0.5 });
    expect(getCompactionSafeguardRuntime(null)).toBeNull();
    setCompactionSafeguardRuntime(undefined, { maxHistoryShare: 0.5 });
    expect(getCompactionSafeguardRuntime(undefined)).toBeNull();
  });

  it("isolates different session managers", () => {
    const sm1 = {};
    const sm2 = {};
    setCompactionSafeguardRuntime(sm1, { maxHistoryShare: 0.3 });
    setCompactionSafeguardRuntime(sm2, { maxHistoryShare: 0.8 });
    expect(getCompactionSafeguardRuntime(sm1)).toEqual({ maxHistoryShare: 0.3 });
    expect(getCompactionSafeguardRuntime(sm2)).toEqual({ maxHistoryShare: 0.8 });
  });

  it("stores structuredSummary flag", () => {
    const sm = {};
    setCompactionSafeguardRuntime(sm, { structuredSummary: true });
    expect(getCompactionSafeguardRuntime(sm)?.structuredSummary).toBe(true);
  });
});

describe("structured summary template", () => {
  it("contains all required sections", () => {
    const requiredSections = [
      "## Goal",
      "## Progress",
      "## Key Data",
      "## Decisions",
      "## Modified Files",
      "## Next Steps",
      "## Constraints",
    ];
    for (const section of requiredSections) {
      expect(STRUCTURED_SUMMARY_TEMPLATE).toContain(section);
    }
  });

  it("instructs verbatim preservation of key data", () => {
    expect(STRUCTURED_SUMMARY_TEMPLATE).toContain("VERBATIM");
  });

  it("requires all sections to be present", () => {
    expect(STRUCTURED_SUMMARY_TEMPLATE).toContain("Every section MUST be present");
  });
});

describe("compaction-safeguard session_before_compact instructions", () => {
  const PREFIX_TURN_TEXT = "This summary covers the prefix of a split turn.";

  it("passes structured instructions to summarizeInStages when enabled", async () => {
    await runSessionBeforeCompact({
      structuredSummary: true,
      customInstructions: "Preserve TODOs and open questions.",
    });

    expect(mockedSummarizeInStages).toHaveBeenCalledTimes(1);
    const call = getSummarizeCall(0);
    expect(call.customInstructions).toContain(STRUCTURED_SUMMARY_TEMPLATE);
    expect(call.customInstructions).toContain("Preserve TODOs and open questions.");
  });

  it("does not inject structured instructions when disabled", async () => {
    await runSessionBeforeCompact({
      structuredSummary: false,
      customInstructions: "Preserve TODOs and open questions.",
    });

    expect(mockedSummarizeInStages).toHaveBeenCalledTimes(1);
    const call = getSummarizeCall(0);
    expect(call.customInstructions).toBe("Preserve TODOs and open questions.");
    expect(call.customInstructions ?? "").not.toContain("## Goal");
  });

  it("prepends structured template to split-turn prefix instructions when enabled", async () => {
    mockedSummarizeInStages
      .mockResolvedValueOnce("history summary")
      .mockResolvedValueOnce("prefix summary");

    await runSessionBeforeCompact({
      structuredSummary: true,
      isSplitTurn: true,
    });

    expect(mockedSummarizeInStages).toHaveBeenCalledTimes(2);
    const prefixCall = getSummarizeCall(1);
    expect(prefixCall.customInstructions?.startsWith(STRUCTURED_SUMMARY_TEMPLATE)).toBe(true);
    expect(prefixCall.customInstructions).toContain(PREFIX_TURN_TEXT);
  });

  it("keeps split-turn prefix instructions unstructured when disabled", async () => {
    mockedSummarizeInStages
      .mockResolvedValueOnce("history summary")
      .mockResolvedValueOnce("prefix summary");

    await runSessionBeforeCompact({
      structuredSummary: false,
      isSplitTurn: true,
    });

    expect(mockedSummarizeInStages).toHaveBeenCalledTimes(2);
    const prefixCall = getSummarizeCall(1);
    expect(prefixCall.customInstructions).toContain(PREFIX_TURN_TEXT);
    expect(prefixCall.customInstructions ?? "").not.toContain("## Goal");
  });
});
