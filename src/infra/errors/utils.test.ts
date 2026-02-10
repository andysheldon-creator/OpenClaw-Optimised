import { describe, expect, it } from "vitest";
import { OpenClawErrorCodes } from "./error-codes.js";
import { OpenClawError } from "./openclaw-error.js";
import {
  errorLogContext,
  formatErrorForLog,
  formatErrorForUser,
  isRetryable,
  toError,
  toOpenClawError,
} from "./utils.js";

describe("error utils", () => {
  describe("toError", () => {
    it("passes through Error instances", () => {
      const source = new Error("boom");
      expect(toError(source)).toBe(source);
    });

    it("wraps strings as Error", () => {
      const err = toError("boom");
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("boom");
    });

    it("handles boom-like objects with message, status and code", () => {
      const err = toError({ message: "rate limited", status: 429, code: "TOO_MANY_REQUESTS" });
      expect(err.message).toBe("rate limited");
      expect((err as NodeJS.ErrnoException).code).toBe("TOO_MANY_REQUESTS");
      expect((err as Error & { status?: number }).status).toBe(429);
    });

    it("handles null and undefined", () => {
      expect(toError(null).message).toBe("null");
      expect(toError(undefined).message).toBe("undefined");
    });

    it("handles plain objects", () => {
      const err = toError({ foo: "bar" });
      expect(err.message).toContain('"foo":"bar"');
    });
  });

  describe("toOpenClawError", () => {
    it("returns passthrough for existing OpenClawError", () => {
      const source = new OpenClawError("already typed", {
        code: OpenClawErrorCodes.INTERNAL_ERROR,
      });
      expect(toOpenClawError(source)).toBe(source);
    });

    it("wraps generic Error with selected code", () => {
      const source = new Error("generic");
      const wrapped = toOpenClawError(source, OpenClawErrorCodes.GATEWAY_REQUEST_FAILED, {
        module: "gateway",
      });
      expect(wrapped).toBeInstanceOf(OpenClawError);
      expect(wrapped.code).toBe(OpenClawErrorCodes.GATEWAY_REQUEST_FAILED);
      expect(wrapped.message).toBe("generic");
      expect(wrapped.context.module).toBe("gateway");
    });

    it("wraps string errors", () => {
      const wrapped = toOpenClawError("oops", OpenClawErrorCodes.UNKNOWN_ERROR);
      expect(wrapped.message).toBe("oops");
      expect(wrapped.code).toBe(OpenClawErrorCodes.UNKNOWN_ERROR);
    });
  });

  describe("formatters", () => {
    it("formatErrorForLog preserves stack and prefixes OpenClawError code", () => {
      const err = new OpenClawError("log me", {
        code: OpenClawErrorCodes.INTERNAL_ERROR,
      });
      const text = formatErrorForLog(err);
      expect(text).toContain("[INTERNAL_ERROR]");
      expect(text).toContain("OpenClawError");
    });

    it("formatErrorForUser returns message only with no stack", () => {
      const err = new Error("user-facing");
      const output = formatErrorForUser(err);
      expect(output).toBe("user-facing");
      expect(output).not.toContain("at ");
    });

    it("formatErrorForUser returns fallback for non-error values", () => {
      expect(formatErrorForUser({ bad: true })).toBe("An unexpected error occurred");
    });
  });

  describe("errorLogContext", () => {
    it("returns structured fields for OpenClawError", () => {
      const err = new OpenClawError("ctx", {
        code: OpenClawErrorCodes.CONFIG_LOAD_FAILED,
        context: { module: "config", operation: "load" },
      });
      expect(errorLogContext(err)).toMatchObject({
        errorCode: OpenClawErrorCodes.CONFIG_LOAD_FAILED,
        module: "config",
        operation: "load",
      });
    });

    it("returns fallback fields for generic Error", () => {
      const err = Object.assign(new Error("generic"), { code: "EIO" });
      expect(errorLogContext(err)).toMatchObject({
        errorName: "Error",
        errorMessage: "generic",
        errorCode: "EIO",
      });
    });
  });

  describe("isRetryable", () => {
    it("returns true for retryable OpenClawError", () => {
      const err = new OpenClawError("retry", {
        code: OpenClawErrorCodes.CHANNEL_TIMEOUT,
        retryable: true,
      });
      expect(isRetryable(err)).toBe(true);
    });

    it("returns true for errno-like timeout code object", () => {
      expect(isRetryable({ code: "ETIMEDOUT" })).toBe(true);
    });

    it("returns false for non-retryable generic errors", () => {
      expect(isRetryable(new Error("boom"))).toBe(false);
    });
  });
});
