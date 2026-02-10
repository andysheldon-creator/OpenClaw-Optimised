import { describe, expect, it } from "vitest";
import { OpenClawErrorCodes } from "./error-codes.js";
import { OpenClawError } from "./openclaw-error.js";

describe("OpenClawError", () => {
  it("preserves stack trace from cause", () => {
    const cause = new Error("network down");
    const err = new OpenClawError("request failed", {
      code: OpenClawErrorCodes.GATEWAY_REQUEST_FAILED,
      cause,
    });

    expect(err.stack).toContain("Caused by:");
  });

  it("returns ErrorShape with code, message, retryable and retryAfterMs", () => {
    const err = new OpenClawError("retry later", {
      code: OpenClawErrorCodes.UNAVAILABLE,
      retryable: true,
      retryAfterMs: 1500,
      context: { module: "gateway" },
    });

    expect(err.toErrorShape()).toEqual({
      code: OpenClawErrorCodes.UNAVAILABLE,
      message: "retry later",
      details: { module: "gateway" },
      retryable: true,
      retryAfterMs: 1500,
    });
  });

  it("omits details when context is empty", () => {
    const err = new OpenClawError("no details", {
      code: OpenClawErrorCodes.UNKNOWN_ERROR,
    });

    const shape = err.toErrorShape();
    expect(shape.details).toBeUndefined();
  });

  it("returns structured log context including module and operation", () => {
    const err = new OpenClawError("boom", {
      code: OpenClawErrorCodes.INTERNAL_ERROR,
      context: { module: "gateway", operation: "invoke" },
      retryable: false,
    });

    expect(err.toLogContext()).toMatchObject({
      errorCode: OpenClawErrorCodes.INTERNAL_ERROR,
      errorMessage: "boom",
      module: "gateway",
      operation: "invoke",
      retryable: false,
    });
  });

  it("handles missing cause without adding caused-by marker", () => {
    const err = new OpenClawError("plain error", {
      code: OpenClawErrorCodes.UNKNOWN_ERROR,
    });
    expect(err.stack).not.toContain("Caused by:");
  });

  it("defaults retryable to false", () => {
    const err = new OpenClawError("default retry", {
      code: OpenClawErrorCodes.UNKNOWN_ERROR,
    });
    expect(err.retryable).toBe(false);
    expect(err.toErrorShape().retryable).toBe(false);
  });

  it("toErrorShape falls back to code when message is empty", () => {
    const err = new OpenClawError("", {
      code: OpenClawErrorCodes.GATEWAY_REQUEST_FAILED,
    });
    const shape = err.toErrorShape();
    expect(shape.message).toBe(OpenClawErrorCodes.GATEWAY_REQUEST_FAILED);
    expect(shape.message.length).toBeGreaterThan(0);
  });

  it("sets name to OpenClawError", () => {
    const err = new OpenClawError("named", {
      code: OpenClawErrorCodes.UNKNOWN_ERROR,
    });
    expect(err.name).toBe("OpenClawError");
  });
});
