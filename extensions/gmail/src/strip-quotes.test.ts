import { describe, it, expect } from "vitest";
import { stripQuotes } from "./strip-quotes.js";

describe("stripQuotes", () => {
  it("removes gmail quote div", () => {
    const html = `<div>Hello<div class="gmail_quote">On ... wrote: ...</div></div>`;
    expect(stripQuotes(html)).toBe("Hello");
  });
});
