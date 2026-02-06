import { describe, expect, it } from "vitest";

import { resolveOutboundHeaders } from "./outbound-auth.js";
import type { A2ARemoteAgent } from "./config.js";

const remoteAgents: A2ARemoteAgent[] = [
  {
    url: "https://agent-a.example.com",
    headers: { "X-API-Key": "key-a" },
  },
  {
    url: "https://agent-b.example.com/v2",
    headers: { Authorization: "Bearer key-b" },
  },
  {
    url: "https://agent-c.example.com",
    // No headers configured
  },
];

describe("resolveOutboundHeaders", () => {
  it("matches exact origin", () => {
    const headers = resolveOutboundHeaders("https://agent-a.example.com", remoteAgents);
    expect(headers).toEqual({ "X-API-Key": "key-a" });
  });

  it("matches origin with path", () => {
    const headers = resolveOutboundHeaders("https://agent-a.example.com/some/path", remoteAgents);
    expect(headers).toEqual({ "X-API-Key": "key-a" });
  });

  it("matches URL with trailing slash", () => {
    const headers = resolveOutboundHeaders("https://agent-a.example.com/", remoteAgents);
    expect(headers).toEqual({ "X-API-Key": "key-a" });
  });

  it("matches configured path prefix", () => {
    const headers = resolveOutboundHeaders("https://agent-b.example.com/v2/endpoint", remoteAgents);
    expect(headers).toEqual({ Authorization: "Bearer key-b" });
  });

  it("matches exact configured path", () => {
    const headers = resolveOutboundHeaders("https://agent-b.example.com/v2", remoteAgents);
    expect(headers).toEqual({ Authorization: "Bearer key-b" });
  });

  it("does not match different path prefix", () => {
    // /v2other is not a sub-path of /v2
    const headers = resolveOutboundHeaders("https://agent-b.example.com/v2other", remoteAgents);
    expect(headers).toBeUndefined();
  });

  it("does not match wrong origin", () => {
    const headers = resolveOutboundHeaders("https://unknown.example.com", remoteAgents);
    expect(headers).toBeUndefined();
  });

  it("does not send key-a headers to agent-b URL (key isolation)", () => {
    const headers = resolveOutboundHeaders("https://agent-b.example.com", remoteAgents);
    // agent-b root path does not match /v2 prefix
    expect(headers).toBeUndefined();
  });

  it("returns undefined for agent with no headers", () => {
    const headers = resolveOutboundHeaders("https://agent-c.example.com", remoteAgents);
    expect(headers).toBeUndefined();
  });

  it("returns undefined for empty remoteAgents", () => {
    const headers = resolveOutboundHeaders("https://agent-a.example.com", []);
    expect(headers).toBeUndefined();
  });

  it("returns undefined for undefined remoteAgents", () => {
    const headers = resolveOutboundHeaders("https://agent-a.example.com", undefined);
    expect(headers).toBeUndefined();
  });

  it("returns undefined for invalid agentUrl", () => {
    const headers = resolveOutboundHeaders("not-a-url", remoteAgents);
    expect(headers).toBeUndefined();
  });

  it("skips remote agents with invalid URLs", () => {
    const agents: A2ARemoteAgent[] = [
      { url: "invalid-url", headers: { "X-Key": "val" } },
      { url: "https://agent-a.example.com", headers: { "X-Key": "correct" } },
    ];
    const headers = resolveOutboundHeaders("https://agent-a.example.com", agents);
    expect(headers).toEqual({ "X-Key": "correct" });
  });

  it("does not match different ports", () => {
    const agents: A2ARemoteAgent[] = [
      { url: "https://agent.example.com:8443", headers: { "X-Key": "val" } },
    ];
    const headers = resolveOutboundHeaders("https://agent.example.com", agents);
    expect(headers).toBeUndefined();
  });

  it("does not match different protocols", () => {
    const agents: A2ARemoteAgent[] = [
      { url: "http://agent.example.com", headers: { "X-Key": "val" } },
    ];
    const headers = resolveOutboundHeaders("https://agent.example.com", agents);
    expect(headers).toBeUndefined();
  });
});
