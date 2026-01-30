import { describe, expect, it, vi } from "vitest";

// Hoist mock implementations so they're available when vi.mock() runs (mocks are hoisted)
const {
  loadConfig,
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveAuthProfileDisplayLabel,
  resolveAuthStorePathForDisplay,
  resolveProfileUnusableUntilForDisplay,
  resolveEnvApiKey,
  resolveAwsSdkEnvVarName,
  getCustomProviderApiKey,
  loadModelRegistry,
} = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  ensureAuthProfileStore: vi.fn().mockReturnValue({ version: 1, profiles: {} }),
  listProfilesForProvider: vi.fn().mockReturnValue([]),
  resolveAuthProfileDisplayLabel: vi.fn(({ profileId }: { profileId: string }) => profileId),
  resolveAuthStorePathForDisplay: vi.fn().mockReturnValue("/tmp/openclaw-agent/auth-profiles.json"),
  resolveProfileUnusableUntilForDisplay: vi.fn().mockReturnValue(null),
  resolveEnvApiKey: vi.fn().mockReturnValue(undefined),
  resolveAwsSdkEnvVarName: vi.fn().mockReturnValue(undefined),
  getCustomProviderApiKey: vi.fn().mockReturnValue(undefined),
  loadModelRegistry: vi.fn().mockResolvedValue({
    registry: {},
    models: [],
    availableKeys: new Set<string>(),
  }),
}));

vi.mock("../config/config.js", () => ({
  CONFIG_PATH: "/tmp/openclaw.json",
  STATE_DIR: "/tmp/openclaw-state",
  loadConfig,
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore,
  listProfilesForProvider,
  resolveAuthProfileDisplayLabel,
  resolveAuthStorePathForDisplay,
  resolveProfileUnusableUntilForDisplay,
}));

vi.mock("../agents/model-auth.js", () => ({
  resolveEnvApiKey,
  resolveAwsSdkEnvVarName,
  getCustomProviderApiKey,
}));

vi.mock("./models/list.registry.js", () => ({
  loadModelRegistry,
  toModelRow: vi.fn(
    (params: { model?: unknown; key: string; tags: string[]; availableKeys?: Set<string> }) => {
      const { model, key, tags, availableKeys } = params;
      if (!model) {
        return {
          key,
          name: key,
          input: "-",
          contextWindow: null,
          local: null,
          available: null,
          tags: [...tags, "missing"],
          missing: true,
        };
      }
      const m = model as {
        provider: string;
        id: string;
        name?: string;
        input?: string[];
        contextWindow?: number;
        baseUrl?: string;
      };
      return {
        key,
        name: m.name || m.id,
        input: m.input?.join("+") || "text",
        contextWindow: m.contextWindow ?? null,
        local: false,
        available: availableKeys?.has(key) ?? false,
        tags,
        missing: false,
      };
    },
  ),
}));

// With mocks properly hoisted and loadModelRegistry mocked, we can import statically
import { modelsListCommand, modelsStatusCommand } from "./models/list.js";

function makeRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(() => {
      throw new Error("exit called");
    }),
  };
}

function modelKey(provider: string, id: string) {
  return `${provider}/${id}`;
}

describe("models list/status", () => {
  it("models status resolves z.ai alias to canonical zai", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    await modelsStatusCommand({ json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.resolvedDefault).toBe("zai/glm-4.7");
  });

  it("models status plain outputs canonical zai model", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    await modelsStatusCommand({ plain: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    expect(runtime.log.mock.calls[0]?.[0]).toBe("zai/glm-4.7");
  });

  it("models list outputs canonical zai key for configured z.ai model", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const model = {
      provider: "zai",
      id: "glm-4.7",
      name: "GLM-4.7",
      input: ["text"],
      baseUrl: "https://api.z.ai/v1",
      contextWindow: 128000,
    };

    loadModelRegistry.mockResolvedValue({
      registry: {},
      models: [model],
      availableKeys: new Set([modelKey(model.provider, model.id)]),
    });

    await modelsListCommand({ json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.models[0]?.key).toBe("zai/glm-4.7");
  });

  it("models list plain outputs canonical zai key", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const model = {
      provider: "zai",
      id: "glm-4.7",
      name: "GLM-4.7",
      input: ["text"],
      baseUrl: "https://api.z.ai/v1",
      contextWindow: 128000,
    };

    loadModelRegistry.mockResolvedValue({
      registry: {},
      models: [model],
      availableKeys: new Set([modelKey(model.provider, model.id)]),
    });

    await modelsListCommand({ plain: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    expect(runtime.log.mock.calls[0]?.[0]).toBe("zai/glm-4.7");
  });

  it("models list provider filter normalizes z.ai alias", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const models = [
      {
        provider: "zai",
        id: "glm-4.7",
        name: "GLM-4.7",
        input: ["text"],
        baseUrl: "https://api.z.ai/v1",
        contextWindow: 128000,
      },
      {
        provider: "openai",
        id: "gpt-4.1-mini",
        name: "GPT-4.1 mini",
        input: ["text"],
        baseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
      },
    ];

    loadModelRegistry.mockResolvedValue({
      registry: {},
      models,
      availableKeys: new Set(models.map((m) => modelKey(m.provider, m.id))),
    });

    await modelsListCommand({ all: true, provider: "z.ai", json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.count).toBe(1);
    expect(payload.models[0]?.key).toBe("zai/glm-4.7");
  });

  it("models list provider filter normalizes Z.AI alias casing", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const models = [
      {
        provider: "zai",
        id: "glm-4.7",
        name: "GLM-4.7",
        input: ["text"],
        baseUrl: "https://api.z.ai/v1",
        contextWindow: 128000,
      },
      {
        provider: "openai",
        id: "gpt-4.1-mini",
        name: "GPT-4.1 mini",
        input: ["text"],
        baseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
      },
    ];

    loadModelRegistry.mockResolvedValue({
      registry: {},
      models,
      availableKeys: new Set(models.map((m) => modelKey(m.provider, m.id))),
    });

    await modelsListCommand({ all: true, provider: "Z.AI", json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.count).toBe(1);
    expect(payload.models[0]?.key).toBe("zai/glm-4.7");
  });

  it("models list provider filter normalizes z-ai alias", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const models = [
      {
        provider: "zai",
        id: "glm-4.7",
        name: "GLM-4.7",
        input: ["text"],
        baseUrl: "https://api.z.ai/v1",
        contextWindow: 128000,
      },
      {
        provider: "openai",
        id: "gpt-4.1-mini",
        name: "GPT-4.1 mini",
        input: ["text"],
        baseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
      },
    ];

    loadModelRegistry.mockResolvedValue({
      registry: {},
      models,
      availableKeys: new Set(models.map((m) => modelKey(m.provider, m.id))),
    });

    await modelsListCommand({ all: true, provider: "z-ai", json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.count).toBe(1);
    expect(payload.models[0]?.key).toBe("zai/glm-4.7");
  });

  it("models list marks auth as unavailable when ZAI key is missing", async () => {
    loadConfig.mockReturnValue({
      agents: { defaults: { model: "z.ai/glm-4.7" } },
    });
    const runtime = makeRuntime();

    const model = {
      provider: "zai",
      id: "glm-4.7",
      name: "GLM-4.7",
      input: ["text"],
      baseUrl: "https://api.z.ai/v1",
      contextWindow: 128000,
    };

    // Model is in registry but NOT in availableKeys (no auth)
    loadModelRegistry.mockResolvedValue({
      registry: {},
      models: [model],
      availableKeys: new Set<string>(), // Empty = no auth
    });

    await modelsListCommand({ all: true, json: true }, runtime);

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.models[0]?.available).toBe(false);
  });
});
