import { describe, test, expect, vi, beforeEach } from "vitest";

// Use class-based mocks to ensure constructor compatibility
vi.mock("./src/services/lancedb-store.js", () => {
  return {
    LanceDbStore: class {
      async search() {
        return [];
      }
      async store() {
        return { id: "123" };
      }
    },
  };
});

vi.mock("./src/services/openai-embedder.js", () => {
  return {
    OpenAiEmbedder: class {
      async embed() {
        return [];
      }
    },
  };
});

vi.mock("./src/services/openai-extractor.js", () => {
  return {
    OpenAiExtractor: class {
      async extract() {
        return [];
      }
      async summarizeUrl() {
        return "Mocked Summary of URL";
      }
    },
  };
});

vi.mock("./src/services/openai-expander.js", () => {
  return {
    OpenAiExpander: class {
      async expand() {
        return "expanded";
      }
    },
  };
});

vi.mock("./src/services/openai-synthesizer.js", () => {
  return {
    OpenAiSynthesizer: class {
      async synthesize() {
        return { merged: [], archived: [], summary: "" };
      }
    },
  };
});

vi.mock("./src/services/digest-service.js", () => {
  return {
    DigestService: class {
      async runDailyMaintenance() {
        return "Summary";
      }
    },
  };
});

vi.mock("./config.js", () => ({
  memoryConfigSchema: {
    parse: (cfg: unknown) => ({
      ...(cfg as Record<string, unknown>),
      embedding: { apiKey: "sk-mock", model: "text-embedding-3-small" },
      extraction: { apiKey: "sk-mock", model: "gpt-4o-mini" },
    }),
  },
  vectorDimsForModel: () => 1536,
  MEMORY_CATEGORIES: ["other"],
}));

describe("Inbox URL Summarization", () => {
  let memoryPlugin: unknown;
  let mockApi: unknown;
  let agentEndHandler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import index.js dynamically
    const module = await import("./index.js");
    memoryPlugin = module.default;

    // To spy on methods, we need to spy on the prototype or the instance.
    // Since we returned a class in the mock, we can spy on the prototype methods.
    const extractorModule = await import("./src/services/openai-extractor.js");
    vi.spyOn(extractorModule.OpenAiExtractor.prototype, "summarizeUrl");
    vi.spyOn(extractorModule.OpenAiExtractor.prototype, "extract");

    const registeredHooks: Record<string, unknown> = {};
    mockApi = {
      pluginConfig: {
        dbPath: "/tmp/test",
        autoCapture: true,
      },
      resolvePath: (p: string) => p,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      },
      registerTool: vi.fn(),
      registerCli: vi.fn(),
      registerService: vi.fn(),
      registerCron: vi.fn(),
      on: vi.fn((event, handler) => {
        registeredHooks[event] = handler;
      }),
    };

    memoryPlugin.register(mockApi);
    agentEndHandler = registeredHooks["agent_end"];
  });

  test("agent_end hook detects URL in DM and calls summarizeUrl", async () => {
    expect(agentEndHandler).toBeDefined();

    const mockEvent = {
      success: true,
      channelType: "dm",
      channelId: "test-dm",
      messages: [
        { role: "user", content: "Check this out https://example.com/article" },
        { role: "assistant", content: "Okay, I will." },
      ],
    };

    await agentEndHandler(mockEvent);

    const extractorModule = await import("./src/services/openai-extractor.js");
    expect(extractorModule.OpenAiExtractor.prototype.summarizeUrl).toHaveBeenCalledWith(
      "https://example.com/article",
      mockApi,
    );
  });

  test("agent_end hook ignores URL in Group chat", async () => {
    const mockEvent = {
      success: true,
      channelType: "group",
      channelId: "test-group",
      messages: [
        { role: "user", content: "Check this out https://example.com/article" },
        { role: "assistant", content: "Okay." },
      ],
    };

    await agentEndHandler(mockEvent);

    const extractorModule = await import("./src/services/openai-extractor.js");
    expect(extractorModule.OpenAiExtractor.prototype.summarizeUrl).not.toHaveBeenCalled();
  });
});
