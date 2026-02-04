import { describe, expect, it } from "vitest";
import { classifyFailoverReason } from "./pi-embedded-helpers.js";
import { DEFAULT_AGENTS_FILENAME } from "./workspace.js";

const _makeFile = (overrides: Partial<WorkspaceBootstrapFile>): WorkspaceBootstrapFile => ({
  name: DEFAULT_AGENTS_FILENAME,
  path: "/tmp/AGENTS.md",
  content: "",
  missing: false,
  ...overrides,
});
describe("classifyFailoverReason", () => {
  it("returns a stable reason", () => {
    expect(classifyFailoverReason("invalid api key")).toBe("auth");
    expect(classifyFailoverReason("no credentials found")).toBe("auth");
    expect(classifyFailoverReason("no api key found")).toBe("auth");
    expect(classifyFailoverReason("429 too many requests")).toBe("rate_limit");
    expect(classifyFailoverReason("resource has been exhausted")).toBe("rate_limit");
    expect(
      classifyFailoverReason(
        '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      ),
    ).toBe("rate_limit");
    expect(classifyFailoverReason("invalid request format")).toBe("format");
    expect(classifyFailoverReason("credit balance too low")).toBe("billing");
    expect(classifyFailoverReason("deadline exceeded")).toBe("timeout");
    expect(classifyFailoverReason("string should match pattern")).toBe("format");
    expect(classifyFailoverReason("bad request")).toBeNull();
    expect(
      classifyFailoverReason(
        "messages.84.content.1.image.source.base64.data: At least one of the image dimensions exceed max allowed size for many-image requests: 2000 pixels",
      ),
    ).toBeNull();
    expect(classifyFailoverReason("image exceeds 5 MB maximum")).toBeNull();
  });
  it("classifies OpenAI usage limit errors as rate_limit", () => {
    expect(classifyFailoverReason("You have hit your ChatGPT usage limit (plus plan)")).toBe(
      "rate_limit",
    );
  });

  it("classifies network errors as network for failover with retry", () => {
    // Node.js fetch/undici errors (the exact error from issue #7185)
    expect(classifyFailoverReason("TypeError: fetch failed")).toBe("network");
    expect(classifyFailoverReason("fetch failed")).toBe("network");
    expect(classifyFailoverReason("Failed to fetch")).toBe("network");

    // DNS and connection errors
    expect(classifyFailoverReason("ENOTFOUND api.anthropic.com")).toBe("network");
    expect(classifyFailoverReason("connect ECONNREFUSED 127.0.0.1:443")).toBe("network");
    expect(classifyFailoverReason("read ECONNRESET")).toBe("network");
    expect(classifyFailoverReason("socket hang up")).toBe("network");
    expect(classifyFailoverReason("socket closed unexpectedly")).toBe("network");
    expect(classifyFailoverReason("network error")).toBe("network");
    expect(classifyFailoverReason("connection reset by peer")).toBe("network");

    // HTTP gateway errors indicating network/infrastructure issues
    expect(classifyFailoverReason("502 Bad Gateway")).toBe("network");
    expect(classifyFailoverReason("503 Service Unavailable")).toBe("network");
    // Note: 504 Gateway Timeout is correctly classified as "timeout" (it IS a timeout)
    expect(classifyFailoverReason("504 Gateway Timeout")).toBe("timeout");
    expect(classifyFailoverReason("bad gateway")).toBe("network");
    expect(classifyFailoverReason("service unavailable")).toBe("network");

    // Should not match unrelated errors
    expect(classifyFailoverReason("invalid response from server")).toBeNull();
    expect(classifyFailoverReason("unexpected response format")).toBeNull();
  });
});
