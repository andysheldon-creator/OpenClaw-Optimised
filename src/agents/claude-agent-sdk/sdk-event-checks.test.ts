import { describe, it, expect } from "vitest";
import { isSdkTerminalToolEventType } from "./sdk-event-checks.js";

describe("isSdkTerminalToolEventType", () => {
  it("returns true for tool_execution_end", () => {
    expect(isSdkTerminalToolEventType("tool_execution_end")).toBe(true);
  });

  it("returns true for tool_result", () => {
    expect(isSdkTerminalToolEventType("tool_result")).toBe(true);
  });

  it("returns false for tool_use", () => {
    expect(isSdkTerminalToolEventType("tool_use")).toBe(false);
  });

  it("returns false for tool_execution_start", () => {
    expect(isSdkTerminalToolEventType("tool_execution_start")).toBe(false);
  });

  it("returns false for other event types", () => {
    expect(isSdkTerminalToolEventType("assistant_message")).toBe(false);
    expect(isSdkTerminalToolEventType("error")).toBe(false);
    expect(isSdkTerminalToolEventType("result")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(isSdkTerminalToolEventType(undefined)).toBe(false);
    expect(isSdkTerminalToolEventType(null)).toBe(false);
    expect(isSdkTerminalToolEventType(123)).toBe(false);
  });
});
