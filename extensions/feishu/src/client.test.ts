import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  client: [] as Array<Record<string, unknown>>,
  ws: [] as Array<Record<string, unknown>>,
}));

vi.mock("@larksuiteoapi/node-sdk", () => {
  return {
    Client: class {
      constructor(config: Record<string, unknown>) {
        calls.client.push(config);
      }
    },
    WSClient: class {
      constructor(config: Record<string, unknown>) {
        calls.ws.push(config);
      }
      start() {}
    },
    EventDispatcher: class {},
    AppType: {
      SelfBuild: "self-build",
    },
    Domain: {
      Feishu: "feishu-domain",
      Lark: "lark-domain",
    },
    LoggerLevel: {
      info: "info",
    },
  };
});

import { createFeishuClient, createFeishuWSClient } from "./client.js";

describe("feishu client creation", () => {
  beforeEach(() => {
    calls.client.length = 0;
    calls.ws.length = 0;
  });

  it("passes SelfBuild app type to rest client", () => {
    createFeishuClient({
      accountId: "main",
      appId: "cli_xxx",
      appSecret: "secret",
      domain: "feishu",
    });
    expect(calls.client[0]).toMatchObject({
      appId: "cli_xxx",
      appSecret: "secret",
      appType: "self-build",
      domain: "feishu-domain",
    });
  });

  it("passes SelfBuild app type to websocket client", () => {
    createFeishuWSClient({
      accountId: "main",
      enabled: true,
      configured: true,
      appId: "cli_xxx",
      appSecret: "secret",
      domain: "feishu",
      config: {},
    } as never);
    expect(calls.ws[0]).toMatchObject({
      appId: "cli_xxx",
      appSecret: "secret",
      appType: "self-build",
      domain: "feishu-domain",
      loggerLevel: "info",
    });
  });
});
