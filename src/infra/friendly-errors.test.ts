import { describe, expect, it } from "vitest";
import { getFriendlyError, formatFriendlyError, enhanceErrorMessage } from "./friendly-errors.js";

describe("friendly-errors", () => {
  describe("getFriendlyError", () => {
    it("detects 401 authentication errors", () => {
      const err = { status: 401, message: "Unauthorized" };
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Authentication Failed");
    });

    it("detects invalid API key errors", () => {
      const err = new Error("Invalid API key provided");
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Authentication Failed");
    });

    it("detects missing API key errors", () => {
      const err = new Error("No API key found for provider");
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("API Key Not Found");
    });

    it("detects ECONNREFUSED errors", () => {
      const err = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Connection Refused");
    });

    it("detects ETIMEDOUT errors", () => {
      const err = Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" });
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Connection Timeout");
    });

    it("detects rate limit errors", () => {
      const err = { status: 429, message: "Too many requests" };
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Rate Limited");
    });

    it("detects model not found errors", () => {
      const err = new Error("Model 'gpt-5-turbo' does not exist");
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Model Not Found");
    });

    it("detects context length errors", () => {
      const err = new Error("Maximum context length exceeded");
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Context Too Long");
    });

    it("detects config errors", () => {
      const err = Object.assign(new Error("Invalid config"), { code: "INVALID_CONFIG" });
      const friendly = getFriendlyError(err);
      expect(friendly).not.toBeNull();
      expect(friendly?.title).toBe("Invalid Configuration");
    });

    it("returns null for unknown errors", () => {
      const err = new Error("Something weird happened");
      const friendly = getFriendlyError(err);
      expect(friendly).toBeNull();
    });
  });

  describe("formatFriendlyError", () => {
    it("formats error with title, description, and suggestions", () => {
      const friendly = {
        title: "Test Error",
        description: "This is a test error",
        suggestions: ["Try this", "Or this"],
      };
      const formatted = formatFriendlyError(friendly);
      expect(formatted).toContain("Test Error");
      expect(formatted).toContain("This is a test error");
      expect(formatted).toContain("Try this");
      expect(formatted).toContain("Or this");
    });

    it("includes docs link when provided", () => {
      const friendly = {
        title: "Test Error",
        description: "Test",
        suggestions: ["Fix it"],
        docsLink: "https://docs.example.com",
      };
      const formatted = formatFriendlyError(friendly);
      expect(formatted).toContain("https://docs.example.com");
    });
  });

  describe("enhanceErrorMessage", () => {
    it("returns friendly message for known errors", () => {
      const err = { status: 401, message: "Unauthorized" };
      const enhanced = enhanceErrorMessage(err);
      expect(enhanced).toContain("Authentication Failed");
      expect(enhanced).toContain("Unauthorized");
    });

    it("returns original message for unknown errors", () => {
      const err = new Error("Unknown error xyz");
      const enhanced = enhanceErrorMessage(err);
      expect(enhanced).toBe("Unknown error xyz");
    });
  });
});
