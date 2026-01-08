import { describe, expect, it } from "vitest";
import { markdownToTelegramHtml } from "./format.js";

describe("markdownToTelegramHtml", () => {
  it("strips the outer paragraph wrapper", () => {
    expect(markdownToTelegramHtml("hi")).toBe("hi");
  });

  it("converts emphasis to Telegram HTML", () => {
    expect(markdownToTelegramHtml("_oops_")).toBe("<em>oops</em>");
  });
});
