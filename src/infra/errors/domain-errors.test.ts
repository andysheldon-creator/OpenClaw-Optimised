import { describe, expect, it } from "vitest";
import {
  BrowserError,
  ChannelError,
  ConfigError,
  GatewayError,
  MemoryError,
  PluginError,
  ToolError,
} from "./domain-errors.js";
import { OpenClawErrorCodes } from "./error-codes.js";

describe("domain error classes", () => {
  it("sets class names correctly", () => {
    expect(new GatewayError("x", OpenClawErrorCodes.GATEWAY_REQUEST_FAILED).name).toBe(
      "GatewayError",
    );
    expect(new MemoryError("x", OpenClawErrorCodes.MEMORY_INDEX_FAILED).name).toBe("MemoryError");
    expect(new ChannelError("x", OpenClawErrorCodes.CHANNEL_SEND_FAILED).name).toBe("ChannelError");
    expect(new ToolError("x", OpenClawErrorCodes.TOOL_EXECUTION_FAILED).name).toBe("ToolError");
    expect(new PluginError("x", OpenClawErrorCodes.PLUGIN_LOAD_FAILED).name).toBe("PluginError");
    expect(new ConfigError("x", OpenClawErrorCodes.CONFIG_VALIDATION_FAILED).name).toBe(
      "ConfigError",
    );
    expect(new BrowserError("x", OpenClawErrorCodes.BROWSER_TIMEOUT).name).toBe("BrowserError");
  });

  it("GatewayError.requestFailed sets code and method context", () => {
    const err = GatewayError.requestFailed("agent.invoke", new Error("bad"));
    expect(err.code).toBe(OpenClawErrorCodes.GATEWAY_REQUEST_FAILED);
    expect(err.context).toMatchObject({ module: "gateway", method: "agent.invoke" });
  });

  it("MemoryError.vectorUnavailable sets retry policy", () => {
    const err = MemoryError.vectorUnavailable("main");
    expect(err.code).toBe(OpenClawErrorCodes.MEMORY_VECTOR_UNAVAILABLE);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
  });

  it("ChannelError.sendFailed sets channel and recipient context", () => {
    const err = ChannelError.sendFailed("telegram", "user-1", new Error("offline"));
    expect(err.context).toMatchObject({
      module: "channel",
      channel: "telegram",
      to: "user-1",
    });
  });

  it("ToolError.timeout sets retryable true and timeout context", () => {
    const err = ToolError.timeout("bash", 10_000);
    expect(err.retryable).toBe(true);
    expect(err.context).toMatchObject({ module: "tool", tool: "bash", timeoutMs: 10_000 });
  });

  it("PluginError.hookFailed sets plugin and hook context", () => {
    const err = PluginError.hookFailed("my-plugin", "PreToolUse", new Error("hook fail"));
    expect(err.context).toMatchObject({
      module: "plugin",
      pluginId: "my-plugin",
      hookName: "PreToolUse",
    });
  });

  it("preserves cause chaining in domain errors", () => {
    const cause = new Error("root cause");
    const err = GatewayError.connectionFailed("ws://localhost:3000", cause);
    expect(err.cause).toBe(cause);
  });

  it("toErrorShape works for domain errors via inheritance", () => {
    const err = ChannelError.connectionLost("whatsapp");
    const shape = err.toErrorShape();
    expect(shape.code).toBe(OpenClawErrorCodes.CHANNEL_CONNECTION_LOST);
    expect(shape.message).toBe("Channel connection lost");
    expect(shape.retryable).toBe(true);
  });

  it("GatewayError.parseFailed marks module context", () => {
    const err = GatewayError.parseFailed("json", new Error("invalid"));
    expect(err.code).toBe(OpenClawErrorCodes.GATEWAY_PARSE_FAILED);
    expect(err.context.module).toBe("gateway");
  });

  it("ConfigError.validationFailed stores path and reason", () => {
    const err = ConfigError.validationFailed("config.yaml", "missing apiKey");
    expect(err.code).toBe(OpenClawErrorCodes.CONFIG_VALIDATION_FAILED);
    expect(err.context).toMatchObject({
      module: "config",
      path: "config.yaml",
      reason: "missing apiKey",
    });
  });
});
