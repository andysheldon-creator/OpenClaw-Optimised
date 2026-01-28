import { describe, expect, it } from "vitest";

// Regression test for Evolution Queue #44 - message_id hints should be stripped
// from embedded agent prompts before they reach the model.
//
// The stripMessageIdHints function is private to run.ts, so we test the pattern
// matching directly to ensure the regex works correctly.

const MESSAGE_ID_LINE_RE = /^\s*\[message_id:\s*[^\]]+\]\s*$/im;

function stripMessageIdHints(prompt: string): string {
  if (!prompt.includes("[message_id:")) return prompt;
  const lines = prompt.split(/\r?\n/);
  const filtered = lines.filter((line) => !MESSAGE_ID_LINE_RE.test(line));
  return filtered.length === lines.length ? prompt : filtered.join("\n").trim();
}

describe("stripMessageIdHints", () => {
  it("strips message_id hint line from prompt", () => {
    const input = "[Discord gnox8339] Liam?\n[message_id: 1466099117699891389]";
    const result = stripMessageIdHints(input);
    expect(result).toBe("[Discord gnox8339] Liam?");
    expect(result).not.toContain("message_id");
    expect(result).not.toContain("1466099117699891389");
  });

  it("handles prompt without message_id hint", () => {
    const input = "[Discord gnox8339] Hello world";
    const result = stripMessageIdHints(input);
    expect(result).toBe(input);
  });

  it("handles multiline prompts with message_id hint at end", () => {
    const input = `[Discord gnox8339] First line
Second line
[message_id: abc123]`;
    const result = stripMessageIdHints(input);
    expect(result).toBe("[Discord gnox8339] First line\nSecond line");
  });

  it("handles prompt with message_id hint in middle", () => {
    const input = `Line 1
[message_id: xyz789]
Line 3`;
    const result = stripMessageIdHints(input);
    expect(result).toBe("Line 1\nLine 3");
  });

  it("handles WhatsApp format with message_id hint", () => {
    const input = "[WhatsApp 2026-01-28 07:54] Hello\n[message_id: 7b8b]";
    const result = stripMessageIdHints(input);
    expect(result).toBe("[WhatsApp 2026-01-28 07:54] Hello");
  });

  it("preserves message_id if it appears within text (not as standalone line)", () => {
    const input = "The message_id: 123 is embedded in this sentence";
    const result = stripMessageIdHints(input);
    // This should be preserved since it's not a standalone [message_id: ...] line
    expect(result).toBe(input);
  });

  it("handles empty string", () => {
    expect(stripMessageIdHints("")).toBe("");
  });

  it("handles string with only whitespace around hint", () => {
    const input = "  [message_id: test123]  ";
    const result = stripMessageIdHints(input);
    expect(result).toBe("");
  });
});
