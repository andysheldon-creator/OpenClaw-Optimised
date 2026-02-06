import { describe, expect, it } from "vitest";
import { markdownToSignalText, markdownToSignalTextChunks } from "./format.js";

describe("markdownToSignalText", () => {
  it("renders inline styles", () => {
    const res = markdownToSignalText("hi _there_ **boss** ~~nope~~ `code`");

    expect(res.text).toBe("hi there boss nope code");
    expect(res.styles).toEqual([
      { start: 3, length: 5, style: "ITALIC" },
      { start: 9, length: 4, style: "BOLD" },
      { start: 14, length: 4, style: "STRIKETHROUGH" },
      { start: 19, length: 4, style: "MONOSPACE" },
    ]);
  });

  it("renders links as label plus url when needed", () => {
    const res = markdownToSignalText("see [docs](https://example.com) and https://example.com");

    expect(res.text).toBe("see docs (https://example.com) and https://example.com");
    expect(res.styles).toEqual([]);
  });

  it("applies spoiler styling", () => {
    const res = markdownToSignalText("hello ||secret|| world");

    expect(res.text).toBe("hello secret world");
    expect(res.styles).toEqual([{ start: 6, length: 6, style: "SPOILER" }]);
  });

  it("renders fenced code blocks with monospaced styles", () => {
    const res = markdownToSignalText("before\n\n```\nconst x = 1;\n```\n\nafter");

    const prefix = "before\n\n";
    const code = "const x = 1;\n";
    const suffix = "\nafter";

    expect(res.text).toBe(`${prefix}${code}${suffix}`);
    expect(res.styles).toEqual([{ start: prefix.length, length: code.length, style: "MONOSPACE" }]);
  });

  it("renders lists without extra block markup", () => {
    const res = markdownToSignalText("- one\n- two");

    expect(res.text).toBe("• one\n• two");
    expect(res.styles).toEqual([]);
  });

  it("uses UTF-16 code units for offsets", () => {
    const res = markdownToSignalText("😀 **bold**");

    const prefix = "😀 ";
    expect(res.text).toBe(`${prefix}bold`);
    expect(res.styles).toEqual([{ start: prefix.length, length: 4, style: "BOLD" }]);
  });

  describe("duplicate URL display", () => {
    it("does not duplicate URL when label matches URL without protocol", () => {
      // [selfh.st](http://selfh.st) should render as "selfh.st" not "selfh.st (http://selfh.st)"
      const res = markdownToSignalText("[selfh.st](http://selfh.st)");
      expect(res.text).toBe("selfh.st");
    });

    it("does not duplicate URL when label matches URL without https protocol", () => {
      const res = markdownToSignalText("[example.com](https://example.com)");
      expect(res.text).toBe("example.com");
    });

    it("does not duplicate URL when label matches URL without www prefix", () => {
      const res = markdownToSignalText("[www.example.com](https://example.com)");
      expect(res.text).toBe("www.example.com");
    });

    it("does not duplicate URL when label matches URL without trailing slash", () => {
      const res = markdownToSignalText("[example.com](https://example.com/)");
      expect(res.text).toBe("example.com");
    });

    it("does not duplicate URL when label includes www but URL does not", () => {
      const res = markdownToSignalText("[example.com](https://www.example.com)");
      expect(res.text).toBe("example.com");
    });

    it("handles case-insensitive domain comparison", () => {
      const res = markdownToSignalText("[EXAMPLE.COM](https://example.com)");
      expect(res.text).toBe("EXAMPLE.COM");
    });

    it("still shows URL when label is meaningfully different", () => {
      const res = markdownToSignalText("[click here](https://example.com)");
      expect(res.text).toBe("click here (https://example.com)");
    });

    it("handles URL with path - should show URL when label is just domain", () => {
      // Label is just domain, URL has path - these are meaningfully different
      const res = markdownToSignalText("[example.com](https://example.com/page)");
      expect(res.text).toBe("example.com (https://example.com/page)");
    });

    it("does not duplicate when label matches full URL with path", () => {
      const res = markdownToSignalText("[example.com/page](https://example.com/page)");
      expect(res.text).toBe("example.com/page");
    });
  });

  describe("headings visual distinction", () => {
    it("renders headings as bold text", () => {
      const res = markdownToSignalText("# Heading 1");
      expect(res.text).toBe("Heading 1");
      expect(res.styles).toContainEqual({ start: 0, length: 9, style: "BOLD" });
    });

    it("renders h2 headings as bold text", () => {
      const res = markdownToSignalText("## Heading 2");
      expect(res.text).toBe("Heading 2");
      expect(res.styles).toContainEqual({ start: 0, length: 9, style: "BOLD" });
    });

    it("renders h3 headings as bold text", () => {
      const res = markdownToSignalText("### Heading 3");
      expect(res.text).toBe("Heading 3");
      expect(res.styles).toContainEqual({ start: 0, length: 9, style: "BOLD" });
    });
  });

  describe("blockquote visual distinction", () => {
    it("renders blockquotes with a visible prefix", () => {
      const res = markdownToSignalText("> This is a quote");
      // Should have some kind of prefix to distinguish it
      expect(res.text).toMatch(/^[│>]/);
      expect(res.text).toContain("This is a quote");
    });

    it("renders multi-line blockquotes with prefix", () => {
      const res = markdownToSignalText("> Line 1\n> Line 2");
      // Should start with the prefix
      expect(res.text).toMatch(/^[│>]/);
      expect(res.text).toContain("Line 1");
      expect(res.text).toContain("Line 2");
    });
  });

  describe("horizontal rule rendering", () => {
    it("renders horizontal rules as a visible separator", () => {
      const res = markdownToSignalText("Para 1\n\n---\n\nPara 2");
      // Should contain some kind of visual separator like ───
      expect(res.text).toMatch(/[─—-]{3,}/);
    });

    it("renders horizontal rule between content", () => {
      const res = markdownToSignalText("Above\n\n***\n\nBelow");
      expect(res.text).toContain("Above");
      expect(res.text).toContain("Below");
      // Should have a separator
      expect(res.text).toMatch(/[─—-]{3,}/);
    });
  });
});

describe("markdownToSignalTextChunks", () => {
  describe("link expansion chunk limit", () => {
    it("does not exceed chunk limit after link expansion", () => {
      // Create text that is close to limit, with a link that will expand
      const limit = 100;
      // Create text that's 90 chars, leaving only 10 chars of headroom
      const filler = "x".repeat(80);
      // This link will expand from "[link](url)" to "link (https://example.com/very/long/path)"
      const markdown = `${filler} [link](https://example.com/very/long/path/that/will/exceed/limit)`;

      const chunks = markdownToSignalTextChunks(markdown, limit);

      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(limit);
      }
    });

    it("handles multiple links near chunk boundary", () => {
      const limit = 100;
      const filler = "x".repeat(60);
      const markdown = `${filler} [a](https://a.com) [b](https://b.com) [c](https://c.com)`;

      const chunks = markdownToSignalTextChunks(markdown, limit);

      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(limit);
      }
    });
  });
});
