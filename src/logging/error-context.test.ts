import { describe, it, expect, beforeEach } from "vitest";
import {
  pushOperation,
  popOperation,
  getCurrentOperation,
  clearOperationStack,
  addBreadcrumb,
  sanitizeError,
  createContextualError,
  formatContextualError,
  sanitizeContextualErrorForSlack,
} from "./error-context.js";

describe("ErrorContext", () => {
  beforeEach(() => {
    clearOperationStack();
  });

  describe("operation stack", () => {
    it("should manage operation contexts", () => {
      expect(getCurrentOperation()).toBeUndefined();

      pushOperation({ operation: "test-op", sessionKey: "sess-123" });
      expect(getCurrentOperation()?.operation).toBe("test-op");

      pushOperation({ operation: "nested-op" });
      expect(getCurrentOperation()?.operation).toBe("nested-op");

      popOperation();
      expect(getCurrentOperation()?.operation).toBe("test-op");

      popOperation();
      expect(getCurrentOperation()).toBeUndefined();
    });

    it("should clear operation stack", () => {
      pushOperation({ operation: "op1" });
      pushOperation({ operation: "op2" });
      clearOperationStack();

      expect(getCurrentOperation()).toBeUndefined();
    });

    it("should track breadcrumbs", () => {
      pushOperation({ operation: "test" });
      addBreadcrumb("step 1");
      addBreadcrumb("step 2");

      const ctx = getCurrentOperation();
      expect(ctx?.breadcrumbs).toHaveLength(2);
      expect(ctx?.breadcrumbs?.[0]).toContain("step 1");
      expect(ctx?.breadcrumbs?.[1]).toContain("step 2");
    });
  });

  describe("sanitizeError", () => {
    it("should return non-Error objects as strings", () => {
      const result = sanitizeError("simple string");
      expect(result.message).toBe("simple string");
      expect(result.sanitized).toBe(true);
    });

    it("should redact file paths", () => {
      const err = new Error("Config loaded from /home/user/.openclawrc");
      const result = sanitizeError(err);

      expect(result.message).toContain("[REDACTED_PATH]");
      expect(result.sanitized).toBe(true);
    });

    it("should redact token-like strings", () => {
      const err = new Error("Token: abcdef1234567890abcdef1234567890");
      const result = sanitizeError(err);

      expect(result.message).not.toContain("abcdef1234567890");
      expect(result.sanitized).toBe(true);
    });

    it("should redact URLs with secrets", () => {
      const err = new Error("Failed at https://api.example.com?token=secret123");
      const result = sanitizeError(err);

      expect(result.message).toContain("[REDACTED_URL]");
      expect(result.sanitized).toBe(true);
    });

    it("should not modify clean errors", () => {
      const err = new Error("Something went wrong");
      const result = sanitizeError(err);

      expect(result.message).toBe("Something went wrong");
      expect(result.sanitized).toBe(false);
    });
  });

  describe("createContextualError", () => {
    it("should create error with context", () => {
      const err = createContextualError("test error", {
        code: "TEST_ERROR",
        context: { sessionKey: "sess-123", operation: "test" },
      });

      expect(err.message).toBe("test error");
      expect(err.code).toBe("TEST_ERROR");
      expect(err.context.sessionKey).toBe("sess-123");
      expect(err.context.operation).toBe("test");
    });

    it("should inherit context from operation stack", () => {
      pushOperation({ sessionKey: "sess-456", operation: "stack-op" });
      addBreadcrumb("test breadcrumb");

      const err = createContextualError("inherited error");

      expect(err.context.sessionKey).toBe("sess-456");
      expect(err.context.operation).toBe("stack-op");
      expect(err.context.breadcrumbs).toHaveLength(1);
    });

    it("should preserve original error", () => {
      const original = new Error("original");
      const err = createContextualError("wrapper", { originalError: original });

      expect(err.originalError).toBe(original);
    });
  });

  describe("formatContextualError", () => {
    it("should format error with all context", () => {
      const err = createContextualError("test message", {
        code: "CODE",
        context: {
          sessionKey: "sess-abc123def456",
          operation: "my-operation",
        },
      });

      const formatted = formatContextualError(err);

      expect(formatted).toContain("[sess-ab");
      expect(formatted).toContain("{my-operation}");
      expect(formatted).toContain("ERR_CODE");
      expect(formatted).toContain("test message");
    });

    it("should include breadcrumbs in formatted output", () => {
      pushOperation({ operation: "test" });
      addBreadcrumb("step 1");
      addBreadcrumb("step 2");

      const err = createContextualError("error with crumbs");
      const formatted = formatContextualError(err);

      expect(formatted).toContain("Breadcrumbs:");
      expect(formatted).toContain("step 1");
      expect(formatted).toContain("step 2");
    });
  });

  describe("sanitizeContextualErrorForSlack", () => {
    it("should sanitize error message", () => {
      const err = createContextualError("Token: abcdef1234567890abcdef1234567890");
      const sanitized = sanitizeContextualErrorForSlack(err);

      expect(sanitized.message).not.toContain("abcdef");
      expect(sanitized.sanitized).toBe(true);
    });

    it("should sanitize breadcrumbs", () => {
      pushOperation({ operation: "test" });
      addBreadcrumb("Auth failed at https://api.example.com?token=secret");

      const err = createContextualError("error");
      const sanitized = sanitizeContextualErrorForSlack(err);

      expect(sanitized.context.breadcrumbs?.[0]).toContain("[REDACTED_URL]");
    });

    it("should preserve non-sensitive content", () => {
      const err = createContextualError("normal error message", {
        context: { sessionKey: "sess-123" },
      });
      const sanitized = sanitizeContextualErrorForSlack(err);

      expect(sanitized.message).toBe("normal error message");
      expect(sanitized.context.sessionKey).toBe("sess-123");
    });
  });
});
