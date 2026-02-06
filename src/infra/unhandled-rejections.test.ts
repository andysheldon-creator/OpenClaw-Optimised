import { describe, expect, it } from "vitest";
import { isAbortError, isTransientNetworkError } from "./unhandled-rejections.js";

describe("isAbortError", () => {
  it("returns true for error with name AbortError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it('returns true for error with "This operation was aborted" message', () => {
    const error = new Error("This operation was aborted");
    expect(isAbortError(error)).toBe(true);
  });

  it("returns true for undici-style AbortError", () => {
    // Node's undici throws errors with this exact message
    const error = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    expect(isAbortError(error)).toBe(true);
  });

  it("returns true for object with AbortError name", () => {
    expect(isAbortError({ name: "AbortError", message: "test" })).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAbortError(new Error("Something went wrong"))).toBe(false);
    expect(isAbortError(new TypeError("Cannot read property"))).toBe(false);
    expect(isAbortError(new RangeError("Invalid array length"))).toBe(false);
  });

  it("returns false for errors with similar but different messages", () => {
    expect(isAbortError(new Error("Operation aborted"))).toBe(false);
    expect(isAbortError(new Error("aborted"))).toBe(false);
    expect(isAbortError(new Error("Request was aborted"))).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAbortError("string error")).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });

  it("returns false for plain objects without AbortError name", () => {
    expect(isAbortError({ message: "plain object" })).toBe(false);
  });
});

describe("isTransientNetworkError", () => {
  it("returns true for errors with transient network codes", () => {
    const codes = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "ECONNABORTED",
      "EPIPE",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ];

    for (const code of codes) {
      const error = Object.assign(new Error("test"), { code });
      expect(isTransientNetworkError(error), `code: ${code}`).toBe(true);
    }
  });

  it('returns true for TypeError with "fetch failed" message', () => {
    const error = new TypeError("fetch failed");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for fetch failed with network cause", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for nested cause chain with network error", () => {
    const innerCause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const outerCause = Object.assign(new Error("wrapper"), { cause: innerCause });
    const error = Object.assign(new TypeError("fetch failed"), { cause: outerCause });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for AggregateError containing network errors", () => {
    const networkError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const error = new AggregateError([networkError], "Multiple errors");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns false for regular errors without network codes", () => {
    expect(isTransientNetworkError(new Error("Something went wrong"))).toBe(false);
    expect(isTransientNetworkError(new TypeError("Cannot read property"))).toBe(false);
    expect(isTransientNetworkError(new RangeError("Invalid array length"))).toBe(false);
  });

  it("returns false for errors with non-network codes", () => {
    const error = Object.assign(new Error("test"), { code: "INVALID_CONFIG" });
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isTransientNetworkError("string error")).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
    expect(isTransientNetworkError({ message: "plain object" })).toBe(false);
  });

  it("returns false for AggregateError with only non-network errors", () => {
    const error = new AggregateError([new Error("regular error")], "Multiple errors");
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("returns true for Slack SDK wrapped errors with .original containing network code", () => {
    // Slack SDK stores the original error in `.original` instead of `.cause`
    const original = Object.assign(new Error("getaddrinfo ENOTFOUND slack.com"), {
      code: "ENOTFOUND",
    });
    const error = Object.assign(
      new Error("A request error occurred: getaddrinfo ENOTFOUND slack.com"),
      { code: "slack_webapi_request_error", original },
    );
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for Slack socket-mode wrapped errors with .original", () => {
    const original = Object.assign(new Error("getaddrinfo ENOTFOUND slack.com"), {
      code: "ENOTFOUND",
    });
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND slack.com"), {
      code: "slack_socket_mode_websocket_error",
      original,
    });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for errors with network error messages but no code", () => {
    const error = new Error("A request error occurred: getaddrinfo ENOTFOUND slack.com");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for errors with socket hang up message", () => {
    const error = new Error("socket hang up");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for errors with connect ECONNREFUSED message", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:443");
    expect(isTransientNetworkError(error)).toBe(true);
  });
});
