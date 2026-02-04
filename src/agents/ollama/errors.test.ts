import { describe, expect, it } from "vitest";

import { isOllamaApiError, isOverBudgetError, OllamaApiError, OverBudgetError } from "./errors.js";

describe("errors", () => {
  describe("OverBudgetError", () => {
    it("creates error with correct properties", () => {
      const error = new OverBudgetError({
        estimatedTokens: 50000,
        budgetTokens: 32000,
      });

      expect(error.name).toBe("OverBudgetError");
      expect(error.code).toBe("over_budget");
      expect(error.estimatedTokens).toBe(50000);
      expect(error.budgetTokens).toBe(32000);
      expect(error.overBy).toBe(18000);
    });

    it("generates default message", () => {
      const error = new OverBudgetError({
        estimatedTokens: 50000,
        budgetTokens: 32000,
      });

      expect(error.message).toContain("50000");
      expect(error.message).toContain("32000");
      expect(error.message).toContain("18000");
    });

    it("accepts custom message", () => {
      const error = new OverBudgetError({
        estimatedTokens: 50000,
        budgetTokens: 32000,
        message: "Custom error message",
      });

      expect(error.message).toBe("Custom error message");
    });

    it("is instance of Error", () => {
      const error = new OverBudgetError({
        estimatedTokens: 50000,
        budgetTokens: 32000,
      });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("isOverBudgetError", () => {
    it("returns true for OverBudgetError", () => {
      const error = new OverBudgetError({
        estimatedTokens: 50000,
        budgetTokens: 32000,
      });

      expect(isOverBudgetError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isOverBudgetError(new Error("test"))).toBe(false);
      expect(isOverBudgetError(null)).toBe(false);
      expect(isOverBudgetError(undefined)).toBe(false);
      expect(isOverBudgetError("string")).toBe(false);
    });
  });

  describe("OllamaApiError", () => {
    it("creates error with correct properties", () => {
      const error = new OllamaApiError({
        message: "API failed",
        code: "http_500",
        status: 500,
        endpoint: "/api/generate",
      });

      expect(error.name).toBe("OllamaApiError");
      expect(error.message).toBe("API failed");
      expect(error.code).toBe("http_500");
      expect(error.status).toBe(500);
      expect(error.endpoint).toBe("/api/generate");
    });

    it("is instance of Error", () => {
      const error = new OllamaApiError({
        message: "API failed",
        code: "http_500",
        endpoint: "/api/generate",
      });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("isOllamaApiError", () => {
    it("returns true for OllamaApiError", () => {
      const error = new OllamaApiError({
        message: "API failed",
        code: "http_500",
        endpoint: "/api/generate",
      });

      expect(isOllamaApiError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isOllamaApiError(new Error("test"))).toBe(false);
      expect(isOllamaApiError(new OverBudgetError({ estimatedTokens: 1, budgetTokens: 0 }))).toBe(
        false,
      );
    });
  });
});
