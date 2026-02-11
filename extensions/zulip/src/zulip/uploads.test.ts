import { describe, expect, it } from "vitest";
import { extractZulipUploadUrls, normalizeEmojiName } from "./uploads.js";

describe("normalizeEmojiName", () => {
  it("returns plain names unchanged", () => {
    expect(normalizeEmojiName("eyes")).toBe("eyes");
    expect(normalizeEmojiName("check_mark")).toBe("check_mark");
  });

  it("strips leading and trailing colons", () => {
    expect(normalizeEmojiName(":eyes:")).toBe("eyes");
    expect(normalizeEmojiName(":warning:")).toBe("warning");
  });

  it("handles double colons", () => {
    expect(normalizeEmojiName("::eyes::")).toBe("eyes");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(normalizeEmojiName(null)).toBe("");
    expect(normalizeEmojiName(undefined)).toBe("");
    expect(normalizeEmojiName("")).toBe("");
    expect(normalizeEmojiName("  ")).toBe("");
  });
});

describe("extractZulipUploadUrls", () => {
  const baseUrl = "https://zulip.example.com";

  it("extracts relative /user_uploads links", () => {
    const urls = extractZulipUploadUrls("[file](/user_uploads/abc123/photo.png)", baseUrl);
    expect(urls).toEqual(["https://zulip.example.com/user_uploads/abc123/photo.png"]);
  });

  it("extracts absolute URLs", () => {
    const urls = extractZulipUploadUrls(
      "see https://zulip.example.com/user_uploads/xyz/cat.jpg here",
      baseUrl,
    );
    expect(urls).toEqual(["https://zulip.example.com/user_uploads/xyz/cat.jpg"]);
  });

  it("deduplicates URLs", () => {
    const urls = extractZulipUploadUrls(
      "/user_uploads/a.png and /user_uploads/a.png again",
      baseUrl,
    );
    expect(urls).toHaveLength(1);
  });

  it("returns empty for no uploads", () => {
    expect(extractZulipUploadUrls("just text", baseUrl)).toEqual([]);
    expect(extractZulipUploadUrls("", baseUrl)).toEqual([]);
  });

  it("handles multiple uploads", () => {
    const urls = extractZulipUploadUrls(
      "[a](/user_uploads/1/a.png) and [b](/user_uploads/2/b.pdf)",
      baseUrl,
    );
    expect(urls).toHaveLength(2);
  });
});
