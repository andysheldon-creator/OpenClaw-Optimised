import { describe, expect, it } from "vitest";
import { isHallucinatedToolCall } from "./pi-embedded-utils.js";

describe("isHallucinatedToolCall", () => {
  it("detects a hallucinated telegram tool call", () => {
    const json = JSON.stringify({
      name: "telegram",
      arguments: { action: "send_message", chatId: "6116232975", text: "ok" },
    });
    expect(isHallucinatedToolCall(json)).toBe(true);
  });

  it("detects a hallucinated browser tool call", () => {
    const json = JSON.stringify({
      name: "browser",
      arguments: { action: "status" },
    });
    expect(isHallucinatedToolCall(json)).toBe(true);
  });

  it("detects a tool call with 'parameters' key", () => {
    const json = JSON.stringify({
      name: "bash",
      parameters: { command: "ls" },
    });
    expect(isHallucinatedToolCall(json)).toBe(true);
  });

  it("rejects normal text", () => {
    expect(isHallucinatedToolCall("Hello, how are you?")).toBe(false);
  });

  it("rejects JSON without a name field", () => {
    const json = JSON.stringify({ action: "status", target: "browser" });
    expect(isHallucinatedToolCall(json)).toBe(false);
  });

  it("rejects JSON with name but no arguments/parameters", () => {
    const json = JSON.stringify({ name: "telegram", result: "ok" });
    expect(isHallucinatedToolCall(json)).toBe(false);
  });

  it("rejects an array", () => {
    const json = JSON.stringify([{ name: "bash", arguments: {} }]);
    expect(isHallucinatedToolCall(json)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isHallucinatedToolCall("")).toBe(false);
  });

  it("rejects non-JSON that starts with {", () => {
    expect(isHallucinatedToolCall("{ this is just text }")).toBe(false);
  });

  it("handles whitespace around JSON", () => {
    const json = `  ${JSON.stringify({ name: "bash", arguments: { command: "ls" } })}  `;
    expect(isHallucinatedToolCall(json)).toBe(true);
  });
});
