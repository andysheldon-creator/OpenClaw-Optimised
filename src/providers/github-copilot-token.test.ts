import { beforeEach, describe, expect, it, vi } from "vitest";

const loadJsonFile = vi.fn();
const saveJsonFile = vi.fn();
const resolveStateDir = vi.fn().mockReturnValue("/tmp/openclaw-state");

vi.mock("../infra/json-file.js", () => ({
  loadJsonFile,
  saveJsonFile,
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir,
}));

describe("github-copilot token", () => {
  beforeEach(() => {
    vi.resetModules();
    loadJsonFile.mockReset();
    saveJsonFile.mockReset();
    resolveStateDir.mockReset();
    resolveStateDir.mockReturnValue("/tmp/openclaw-state");
  });

  it("derives baseUrl from token", async () => {
    const { deriveCopilotApiBaseUrlFromToken } = await import("./github-copilot-token.js");

    expect(deriveCopilotApiBaseUrlFromToken("token;proxy-ep=proxy.example.com;")).toBe(
      "https://api.example.com",
    );
    expect(deriveCopilotApiBaseUrlFromToken("token;proxy-ep=https://proxy.foo.bar;")).toBe(
      "https://api.foo.bar",
    );
  });

  it("uses cache when token is still valid", async () => {
    const now = Date.now();
    loadJsonFile.mockReturnValue({
      token: "cached;proxy-ep=proxy.example.com;",
      expiresAt: now + 60 * 60 * 1000,
      updatedAt: now,
    });

    const { resolveCopilotApiToken } = await import("./github-copilot-token.js");

    const fetchImpl = vi.fn();
    const res = await resolveCopilotApiToken({
      githubToken: "gh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.token).toBe("cached;proxy-ep=proxy.example.com;");
    expect(res.baseUrl).toBe("https://api.example.com");
    expect(String(res.source)).toContain("cache:");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches and stores token when cache is missing", async () => {
    loadJsonFile.mockReturnValue(undefined);

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: "fresh;proxy-ep=https://proxy.contoso.test;",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    });

    const { resolveCopilotApiToken } = await import("./github-copilot-token.js");

    const res = await resolveCopilotApiToken({
      githubToken: "gh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.token).toBe("fresh;proxy-ep=https://proxy.contoso.test;");
    expect(res.baseUrl).toBe("https://api.contoso.test");
    expect(saveJsonFile).toHaveBeenCalledTimes(1);
  });

  it("derives baseUrl from response endpoints.proxy for GHE Cloud", async () => {
    loadJsonFile.mockReturnValue(undefined);

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: "opaque-enterprise-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        endpoints: {
          proxy: "https://copilot-proxy.myorg.ghe.com",
        },
      }),
    });

    const { resolveCopilotApiToken } = await import("./github-copilot-token.js");

    const res = await resolveCopilotApiToken({
      githubToken: "gh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      githubHost: "myorg.ghe.com",
    });

    expect(res.token).toBe("opaque-enterprise-token");
    // copilot-proxy.* → copilot-api.* transformation
    expect(res.baseUrl).toBe("https://copilot-api.myorg.ghe.com");
  });

  it("uses host-derived default when no proxy-ep or endpoints.proxy", async () => {
    loadJsonFile.mockReturnValue(undefined);

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: "opaque-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    });

    const { resolveCopilotApiToken } = await import("./github-copilot-token.js");

    const res = await resolveCopilotApiToken({
      githubToken: "gh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      githubHost: "myorg.ghe.com",
    });

    expect(res.token).toBe("opaque-token");
    expect(res.baseUrl).toBe("https://copilot-api.myorg.ghe.com");
  });

  it("uses host-scoped cache path for Enterprise", async () => {
    const now = Date.now();
    loadJsonFile.mockReturnValue({
      token: "cached-enterprise",
      expiresAt: now + 60 * 60 * 1000,
      updatedAt: now,
    });

    const { resolveCopilotApiToken } = await import("./github-copilot-token.js");

    const fetchImpl = vi.fn();
    await resolveCopilotApiToken({
      githubToken: "gh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      githubHost: "myorg.ghe.com",
    });

    // Cache path should include the host
    const cachePath = loadJsonFile.mock.calls[0][0] as string;
    expect(cachePath).toContain("myorg.ghe.com");
  });

  it("deriveCopilotApiBaseUrlFromProxyEndpoint transforms copilot-proxy to copilot-api", async () => {
    const { deriveCopilotApiBaseUrlFromProxyEndpoint } = await import(
      "./github-copilot-token.js"
    );

    expect(deriveCopilotApiBaseUrlFromProxyEndpoint("https://copilot-proxy.myorg.ghe.com")).toBe(
      "https://copilot-api.myorg.ghe.com",
    );
    expect(
      deriveCopilotApiBaseUrlFromProxyEndpoint("https://copilot-proxy.githubusercontent.com"),
    ).toBe("https://copilot-api.githubusercontent.com");
    expect(deriveCopilotApiBaseUrlFromProxyEndpoint(null)).toBeNull();
    expect(deriveCopilotApiBaseUrlFromProxyEndpoint("")).toBeNull();
  });
});
