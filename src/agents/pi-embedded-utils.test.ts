import { describe, expect, it } from "vitest";
import {
  cleanLlmResponse,
  extractFinalTagContent,
  isHallucinatedToolCall,
  stripThinkingTags,
} from "./pi-embedded-utils.js";

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

describe("stripThinkingTags", () => {
  it("strips <think>...</think> blocks", () => {
    expect(stripThinkingTags("<think>internal reasoning</think>Hello!")).toBe(
      "Hello!",
    );
  });

  it("strips <thinking>...</thinking> blocks", () => {
    expect(
      stripThinkingTags("<thinking>some analysis</thinking>The answer is 42."),
    ).toBe("The answer is 42.");
  });

  it("strips multiple thinking blocks", () => {
    expect(
      stripThinkingTags(
        "<think>first</think>Hello <think>second</think>world",
      ),
    ).toBe("Hello world");
  });

  it("handles case-insensitive tags", () => {
    expect(stripThinkingTags("<THINK>reasoning</THINK>result")).toBe("result");
  });

  it("returns original text when no thinking tags present", () => {
    expect(stripThinkingTags("Just normal text")).toBe("Just normal text");
  });

  it("returns empty string for empty input", () => {
    expect(stripThinkingTags("")).toBe("");
  });

  it("handles unclosed thinking tag (drops everything after opening tag)", () => {
    expect(stripThinkingTags("Prefix<think>rest of text")).toBe("Prefix");
  });
});

describe("extractFinalTagContent", () => {
  it("extracts content from <final> tags", () => {
    expect(extractFinalTagContent("<final>Hello!</final>")).toBe("Hello!");
  });

  it("returns undefined when no <final> tag present", () => {
    expect(extractFinalTagContent("Just normal text")).toBeUndefined();
  });

  it("handles whitespace in tags", () => {
    expect(extractFinalTagContent("< final >content< / final >")).toBe(
      "content",
    );
  });

  it("extracts content after stripping thinking", () => {
    const input =
      "<think>reasoning</think><final>The answer is 42.</final>";
    const stripped = stripThinkingTags(input);
    expect(extractFinalTagContent(stripped)).toBe("The answer is 42.");
  });
});

describe("cleanLlmResponse", () => {
  it("strips thinking and extracts final for well-formed output", () => {
    const input =
      "<think>Let me analyze this...</think><final>Here is your answer.</final>";
    expect(cleanLlmResponse(input)).toBe("Here is your answer.");
  });

  it("strips thinking when no final tag present", () => {
    expect(
      cleanLlmResponse("<think>reasoning</think>Plain response here."),
    ).toBe("Plain response here.");
  });

  it("returns original text when no tags present", () => {
    expect(cleanLlmResponse("Just a normal response")).toBe(
      "Just a normal response",
    );
  });

  it("handles empty string", () => {
    expect(cleanLlmResponse("")).toBe("");
  });

  it("handles real-world qwen2.5-coder output with leaked thinking", () => {
    const input = `<think>
The user is asking about the weather. I should provide a helpful response.
I'll check if I have access to weather data.
</think>

I don't have real-time weather data, but I can suggest checking a weather service like weather.com for your local forecast.`;
    const result = cleanLlmResponse(input);
    expect(result).not.toContain("<think>");
    expect(result).toContain("weather service");
  });

  it("handles Claude CLI output with thinking and final tags", () => {
    const input = `<think>The user wants to know about the project status. Let me check the workspace files.</think>
<final>The project is currently at v2.0.0-beta5 with all 13 backlog items complete.</final>`;
    expect(cleanLlmResponse(input)).toBe(
      "The project is currently at v2.0.0-beta5 with all 13 backlog items complete.",
    );
  });
});
