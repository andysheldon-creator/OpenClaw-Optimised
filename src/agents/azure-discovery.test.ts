import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const execMock = vi.fn();

vi.mock("node:child_process", () => ({
  exec: execMock,
}));

vi.mock("node:util", () => ({
  promisify: (fn: unknown) => fn,
}));

global.fetch = fetchMock as never;

describe("azure-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("discovers chat and embedding models", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "/subscriptions/.../deployments/gpt-4",
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Succeeded",
            },
          },
          {
            id: "/subscriptions/.../deployments/text-embedding-3-large",
            name: "text-embedding-3-large",
            properties: {
              model: { name: "text-embedding-3-large", version: "1" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
    });

    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: "gpt-4",
      name: "gpt-4 (0613)",
      reasoning: false,
      input: ["text", "image"],
    });
    expect(models[1]).toMatchObject({
      id: "text-embedding-3-large",
      name: "text-embedding-3-large (1)",
      input: ["text"],
    });
  });

  it("filters out non-succeeded deployments", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Failed",
            },
          },
          {
            name: "claude-opus",
            properties: {
              model: { name: "claude-3-opus", version: "20240229" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
    });

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("claude-opus");
  });

  it("uses configured defaults for context and max tokens", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
      config: { defaultContextWindow: 200000, defaultMaxTokens: 32000 },
    });

    expect(models[0]).toMatchObject({ contextWindow: 200000, maxTokens: 32000 });
  });

  it("caches results when refreshInterval is enabled", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
    });
    await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips cache when refreshInterval is 0", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
      config: { refreshInterval: 0 },
    });
    await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
      config: { refreshInterval: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses Azure CLI auth when no API key provided", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    execMock.mockResolvedValueOnce({ stdout: "test-az-token\n", stderr: "" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "gpt-4",
            properties: {
              model: { name: "gpt-4", version: "0613" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
    });

    expect(models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-az-token",
        }),
      }),
    );
  });

  it("returns empty array on API error", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "invalid-key",
    });

    expect(models).toHaveLength(0);
  });

  it("infers reasoning support for o1 models", async () => {
    const { discoverAzureModels, resetAzureDiscoveryCacheForTest } =
      await import("./azure-discovery.js");
    resetAzureDiscoveryCacheForTest();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "o1-preview",
            properties: {
              model: { name: "o1-preview", version: "2024-09-12" },
              provisioningState: "Succeeded",
            },
          },
        ],
      }),
    });

    const models = await discoverAzureModels({
      endpoint: "https://test.openai.azure.com",
      apiKey: "test-key",
    });

    expect(models[0].reasoning).toBe(true);
  });
});
