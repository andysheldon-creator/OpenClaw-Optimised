import { describe, expect, it } from "vitest";
import { stripReasoningTagsFromText } from "./reasoning-tags.js";

describe("stripReasoningTagsFromText", () => {
  describe("basic functionality", () => {
    it("returns text unchanged when no reasoning tags present", () => {
      const input = "Hello, this is a normal message.";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });

    it("strips proper think tags", () => {
      const input = "Hello <think>internal reasoning</think> world!";
      expect(stripReasoningTagsFromText(input)).toBe("Hello  world!");
    });

    it("strips thinking tags", () => {
      const input = "Before <thinking>some thought</thinking> after";
      expect(stripReasoningTagsFromText(input)).toBe("Before  after");
    });

    it("strips thought tags", () => {
      const input = "A <thought>hmm</thought> B";
      expect(stripReasoningTagsFromText(input)).toBe("A  B");
    });

    it("strips antthinking tags", () => {
      const input = "X <antthinking>internal</antthinking> Y";
      expect(stripReasoningTagsFromText(input)).toBe("X  Y");
    });

    it("strips multiple reasoning blocks", () => {
      const input = "<think>first</think>A<think>second</think>B";
      expect(stripReasoningTagsFromText(input)).toBe("AB");
    });
  });

  describe("code block preservation (issue #3952)", () => {
    it("preserves think tags inside fenced code blocks", () => {
      const input = "Use the tag like this:\n```\n<think>reasoning</think>\n```\nThat's it!";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });

    it("preserves think tags inside inline code", () => {
      const input =
        "The `<think>` tag is used for reasoning. Don't forget the closing `</think>` tag.";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });

    it("preserves tags in fenced code blocks with language specifier", () => {
      const input = "Example:\n```xml\n<think>\n  <thought>nested</thought>\n</think>\n```\nDone!";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });

    it("handles mixed real tags and code tags", () => {
      const input = "<think>hidden</think>Visible text with `<think>` example.";
      expect(stripReasoningTagsFromText(input)).toBe("Visible text with `<think>` example.");
    });

    it("preserves both opening and closing tags in backticks", () => {
      const input = "Use `<think>` to open and `</think>` to close.";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });
  });

  describe("edge cases", () => {
    it("preserves unclosed <think without angle bracket", () => {
      const input = "Here is how to use <think tags in your code";
      expect(stripReasoningTagsFromText(input)).toBe(input);
    });

    it("strips lone closing tag outside code", () => {
      const input = "You can start with <think and then close with </think>";
      expect(stripReasoningTagsFromText(input)).toBe(
        "You can start with <think and then close with",
      );
    });

    it("handles tags with whitespace", () => {
      const input = "A < think >content< /think > B";
      expect(stripReasoningTagsFromText(input)).toBe("A  B");
    });

    it("handles empty input", () => {
      expect(stripReasoningTagsFromText("")).toBe("");
    });

    it("handles null-ish input", () => {
      expect(stripReasoningTagsFromText(null as unknown as string)).toBe(null);
    });
  });

  describe("strict vs preserve mode", () => {
    it("strict mode truncates on unclosed tag", () => {
      const input = "Before <think>unclosed content after";
      expect(stripReasoningTagsFromText(input, { mode: "strict" })).toBe("Before");
    });

    it("preserve mode keeps content after unclosed tag", () => {
      const input = "Before <think>unclosed content after";
      expect(stripReasoningTagsFromText(input, { mode: "preserve" })).toBe(
        "Before unclosed content after",
      );
    });
  });

  describe("trim options", () => {
    it("trims both sides by default", () => {
      const input = "  <think>x</think>  result  <think>y</think>  ";
      expect(stripReasoningTagsFromText(input)).toBe("result");
    });

    it("trim=none preserves whitespace", () => {
      const input = "  <think>x</think>  result  ";
      expect(stripReasoningTagsFromText(input, { trim: "none" })).toBe("    result  ");
    });

    it("trim=start only trims start", () => {
      const input = "  <think>x</think>  result  ";
      expect(stripReasoningTagsFromText(input, { trim: "start" })).toBe("result  ");
    });
  });
});
