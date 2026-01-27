import { describe, it, expect } from "vitest";
import { normalizeGmailTarget } from "./normalize.js";

describe("normalizeGmailTarget", () => {
  it("normalizes email addresses", () => {
    expect(normalizeGmailTarget("test@example.com")).toBe("test@example.com");
    expect(normalizeGmailTarget("  test@example.com  ")).toBe("test@example.com");
  });

  it("normalizes thread IDs", () => {
    expect(normalizeGmailTarget("194a1234bc")).toBe("194a1234bc");
  });

  it("rejects invalid", () => {
    expect(normalizeGmailTarget("invalid")).toBe(null);
  });
});
