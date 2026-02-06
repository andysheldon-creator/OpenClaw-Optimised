import { describe, expect, it } from "vitest";

import { parseA2APluginConfig } from "./config.js";

describe("parseA2APluginConfig", () => {
  it("returns default config for undefined input", () => {
    const result = parseA2APluginConfig(undefined);

    expect(result).toEqual({ enabled: true });
  });

  it("returns default config for null input", () => {
    const result = parseA2APluginConfig(null);

    expect(result).toEqual({ enabled: true });
  });

  it("returns default config for non-object input", () => {
    const result = parseA2APluginConfig("string");

    expect(result).toEqual({ enabled: true });
  });

  it("returns default config for array input", () => {
    const result = parseA2APluginConfig([1, 2, 3]);

    expect(result).toEqual({ enabled: true });
  });

  it("parses enabled field", () => {
    const result = parseA2APluginConfig({ enabled: false });

    expect(result.enabled).toBe(false);
  });

  it("parses agentId field", () => {
    const result = parseA2APluginConfig({ agentId: "custom-agent" });

    expect(result.agentId).toBe("custom-agent");
  });

  it("trims agentId field", () => {
    const result = parseA2APluginConfig({ agentId: "  agent-with-spaces  " });

    expect(result.agentId).toBe("agent-with-spaces");
  });

  it("ignores empty agentId", () => {
    const result = parseA2APluginConfig({ agentId: "   " });

    expect(result.agentId).toBeUndefined();
  });

  it("parses description field", () => {
    const result = parseA2APluginConfig({ description: "My custom agent" });

    expect(result.description).toBe("My custom agent");
  });

  it("trims description field", () => {
    const result = parseA2APluginConfig({ description: "  trimmed description  " });

    expect(result.description).toBe("trimmed description");
  });

  it("ignores empty description", () => {
    const result = parseA2APluginConfig({ description: "" });

    expect(result.description).toBeUndefined();
  });

  it("parses full config", () => {
    const result = parseA2APluginConfig({
      enabled: true,
      agentId: "bot1",
      description: "A helpful bot",
    });

    expect(result).toEqual({
      enabled: true,
      agentId: "bot1",
      description: "A helpful bot",
    });
  });

  it("ignores unknown fields", () => {
    const result = parseA2APluginConfig({
      enabled: true,
      unknownField: "value",
      anotherUnknown: 123,
    });

    expect(result).toEqual({ enabled: true });
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
  });
});

describe("parseA2APluginConfig — remoteAgents", () => {
  it("ignores non-array remoteAgents", () => {
    const result = parseA2APluginConfig({ remoteAgents: "not-an-array" });
    expect(result.remoteAgents).toBeUndefined();
  });

  it("parses valid remote agents", () => {
    const result = parseA2APluginConfig({
      remoteAgents: [
        { url: "https://agent.example.com", headers: { "X-Key": "val" } },
        { url: "https://other.example.com" },
      ],
    });
    expect(result.remoteAgents).toEqual([
      { url: "https://agent.example.com", headers: { "X-Key": "val" } },
      { url: "https://other.example.com" },
    ]);
  });

  it("trims URLs", () => {
    const result = parseA2APluginConfig({
      remoteAgents: [{ url: "  https://agent.example.com  " }],
    });
    expect(result.remoteAgents?.[0].url).toBe("https://agent.example.com");
  });

  it("skips entries without url", () => {
    const result = parseA2APluginConfig({
      remoteAgents: [
        { url: "" },
        { headers: { "X-Key": "val" } },
        { url: "https://agent.example.com" },
      ],
    });
    expect(result.remoteAgents).toEqual([{ url: "https://agent.example.com" }]);
  });

  it("returns undefined for empty valid entries", () => {
    const result = parseA2APluginConfig({
      remoteAgents: [{ url: "" }, null, "invalid"],
    });
    expect(result.remoteAgents).toBeUndefined();
  });

  it("ignores non-object headers", () => {
    const result = parseA2APluginConfig({
      remoteAgents: [{ url: "https://agent.example.com", headers: "invalid" }],
    });
    expect(result.remoteAgents?.[0].headers).toBeUndefined();
  });
});

describe("parseA2APluginConfig — inbound", () => {
  it("ignores non-object inbound", () => {
    const result = parseA2APluginConfig({ inbound: "not-an-object" });
    expect(result.inbound).toBeUndefined();
  });

  it("parses allowUnauthenticated", () => {
    const result = parseA2APluginConfig({
      inbound: { allowUnauthenticated: true },
    });
    expect(result.inbound?.allowUnauthenticated).toBe(true);
  });

  it("parses apiKeys", () => {
    const result = parseA2APluginConfig({
      inbound: {
        apiKeys: [
          { label: "key1", key: "secret1" },
          { label: "key2", key: "secret2" },
        ],
      },
    });
    expect(result.inbound?.apiKeys).toEqual([
      { label: "key1", key: "secret1" },
      { label: "key2", key: "secret2" },
    ]);
  });

  it("trims labels", () => {
    const result = parseA2APluginConfig({
      inbound: { apiKeys: [{ label: "  key1  ", key: "secret1" }] },
    });
    expect(result.inbound?.apiKeys?.[0].label).toBe("key1");
  });

  it("skips entries with empty label", () => {
    const result = parseA2APluginConfig({
      inbound: {
        apiKeys: [
          { label: "", key: "secret1" },
          { label: "valid", key: "secret2" },
        ],
      },
    });
    expect(result.inbound?.apiKeys).toEqual([{ label: "valid", key: "secret2" }]);
  });

  it("skips entries with empty key", () => {
    const result = parseA2APluginConfig({
      inbound: {
        apiKeys: [
          { label: "key1", key: "" },
          { label: "key2", key: "secret2" },
        ],
      },
    });
    expect(result.inbound?.apiKeys).toEqual([{ label: "key2", key: "secret2" }]);
  });

  it("returns undefined inbound when no valid fields", () => {
    const result = parseA2APluginConfig({
      inbound: { unknownField: "value" },
    });
    expect(result.inbound).toBeUndefined();
  });

  it("returns undefined apiKeys when all entries invalid", () => {
    const result = parseA2APluginConfig({
      inbound: { apiKeys: [{ label: "", key: "" }] },
    });
    expect(result.inbound).toBeUndefined();
  });

  it("parses full inbound config", () => {
    const result = parseA2APluginConfig({
      inbound: {
        allowUnauthenticated: false,
        apiKeys: [{ label: "alpha", key: "secret" }],
      },
    });
    expect(result.inbound).toEqual({
      allowUnauthenticated: false,
      apiKeys: [{ label: "alpha", key: "secret" }],
    });
  });
});
