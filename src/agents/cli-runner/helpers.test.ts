import { describe, expect, it } from "vitest";
import type { CliBackendConfig } from "../../config/types.js";
import { buildCliArgs, parseCliJson } from "./helpers.js";

const MINIMAL_BACKEND: CliBackendConfig = {
  command: "claude",
  args: ["-p", "--output-format", "json"],
  output: "json",
  input: "arg",
  sessionIdFields: ["session_id"],
};

describe("parseCliJson", () => {
  it("parses a single JSON object with result field", () => {
    const raw = JSON.stringify({ result: "Hello!", session_id: "s1" });
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("Hello!");
    expect(out!.sessionId).toBe("s1");
  });

  it("parses a single JSON object with message.content", () => {
    const raw = JSON.stringify({
      message: { content: [{ type: "text", text: "Hi there" }] },
      session_id: "s2",
    });
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("Hi there");
    expect(out!.sessionId).toBe("s2");
  });

  it("parses a JSON array from Claude CLI --output-format json", () => {
    const raw = JSON.stringify([
      {
        type: "system",
        subtype: "init",
        session_id: "abc-123",
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "It is 11 AM." }],
        },
        session_id: "abc-123",
      },
      {
        type: "result",
        subtype: "success",
        result: "It is 11 AM.",
        session_id: "abc-123",
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    ]);
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("It is 11 AM.");
    expect(out!.sessionId).toBe("abc-123");
    expect(out!.usage).toBeDefined();
    expect(out!.usage!.input).toBe(100);
    expect(out!.usage!.output).toBe(20);
  });

  it("extracts message content from array when result is missing", () => {
    const raw = JSON.stringify([
      { type: "system", session_id: "s1" },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Fallback text" }] },
      },
    ]);
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("Fallback text");
  });

  it("returns null for empty array", () => {
    expect(parseCliJson("[]", MINIMAL_BACKEND)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCliJson("", MINIMAL_BACKEND)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseCliJson("{bad json", MINIMAL_BACKEND)).toBeNull();
  });

  it("falls back to top-level text on array entry", () => {
    const raw = JSON.stringify([
      { type: "system", session_id: "s1" },
      { type: "response", text: "top-level text" },
    ]);
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("top-level text");
  });

  it("prefers last matching text in array (result overwrites earlier message)", () => {
    const raw = JSON.stringify([
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "partial" }] },
      },
      {
        type: "result",
        result: "final answer",
      },
    ]);
    const out = parseCliJson(raw, MINIMAL_BACKEND);
    expect(out).not.toBeNull();
    expect(out!.text).toBe("final answer");
  });
});

describe("buildCliArgs extraArgs", () => {
  it("appends extraArgs after computed args", () => {
    const backend: CliBackendConfig = {
      ...MINIMAL_BACKEND,
      modelArg: "--model",
      extraArgs: ["--tools", "Bash,Read"],
    };
    const args = buildCliArgs({
      backend,
      baseArgs: ["-p"],
      modelId: "opus",
      useResume: false,
      promptArg: "hello",
    });
    expect(args).toContain("--tools");
    expect(args).toContain("Bash,Read");
    // extraArgs should come before the prompt
    const toolsIdx = args.indexOf("--tools");
    const promptIdx = args.indexOf("hello");
    expect(toolsIdx).toBeLessThan(promptIdx);
  });

  it("works without extraArgs", () => {
    const args = buildCliArgs({
      backend: MINIMAL_BACKEND,
      baseArgs: ["-p"],
      modelId: "opus",
      useResume: false,
      promptArg: "hello",
    });
    expect(args).not.toContain("--tools");
    expect(args).toContain("hello");
  });
});
