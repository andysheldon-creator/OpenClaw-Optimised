import { describe, expect, it } from "vitest";
import type { TemplateContext } from "../templating.js";
import { buildInboundMetaSystemPrompt, buildInboundUserContextPrefix } from "./inbound-meta.js";

const baseCtx = (): TemplateContext => ({
  ChatType: "channel",
  Provider: "slack",
  Surface: "slack",
});

describe("buildInboundMetaSystemPrompt with ThreadHistory", () => {
  it("sets has_thread_history when ThreadHistory is present", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [
        { sender: "Alice", body: "Hello", timestamp: 1000 },
        { sender: "Bob", body: "Hi there", timestamp: 2000 },
      ],
    };

    const result = buildInboundMetaSystemPrompt(ctx);
    const parsed = JSON.parse(result.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "{}");

    expect(parsed.flags.has_thread_history).toBe(true);
    expect(parsed.flags.has_thread_starter).toBe(false);
  });

  it("sets has_thread_starter when only ThreadStarterBody is present", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadStarterBody: "Original message",
    };

    const result = buildInboundMetaSystemPrompt(ctx);
    const parsed = JSON.parse(result.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "{}");

    expect(parsed.flags.has_thread_history).toBe(false);
    expect(parsed.flags.has_thread_starter).toBe(true);
  });

  it("prefers ThreadHistory over ThreadStarterBody in flags", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [{ sender: "Alice", body: "Hello", timestamp: 1000 }],
      ThreadStarterBody: "Original message",
    };

    const result = buildInboundMetaSystemPrompt(ctx);
    const parsed = JSON.parse(result.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "{}");

    expect(parsed.flags.has_thread_history).toBe(true);
    // ThreadStarterBody is suppressed when ThreadHistory exists
    expect(parsed.flags.has_thread_starter).toBe(false);
  });

  it("sets both flags to false when neither is present", () => {
    const ctx: TemplateContext = baseCtx();

    const result = buildInboundMetaSystemPrompt(ctx);
    const parsed = JSON.parse(result.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "{}");

    expect(parsed.flags.has_thread_history).toBe(false);
    expect(parsed.flags.has_thread_starter).toBe(false);
  });
});

describe("buildInboundUserContextPrefix with ThreadHistory", () => {
  it("injects thread history block when ThreadHistory is present", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [
        { sender: "Alice", body: "Hello everyone", timestamp: 1000 },
        { sender: "Bob", body: "Hi Alice", timestamp: 2000 },
      ],
    };

    const result = buildInboundUserContextPrefix(ctx);

    expect(result).toContain("Thread history (untrusted, for context):");
    expect(result).toContain("Alice");
    expect(result).toContain("Hello everyone");
    expect(result).toContain("Bob");
    expect(result).toContain("Hi Alice");
    // Should NOT contain thread starter block
    expect(result).not.toContain("Thread starter");
  });

  it("falls back to ThreadStarterBody when ThreadHistory is empty", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [],
      ThreadStarterBody: "Original question",
    };

    const result = buildInboundUserContextPrefix(ctx);

    expect(result).toContain("Thread starter (untrusted, for context):");
    expect(result).toContain("Original question");
    expect(result).not.toContain("Thread history");
  });

  it("falls back to ThreadStarterBody when ThreadHistory is undefined", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadStarterBody: "Original question",
    };

    const result = buildInboundUserContextPrefix(ctx);

    expect(result).toContain("Thread starter (untrusted, for context):");
    expect(result).toContain("Original question");
  });

  it("prefers ThreadHistory over ThreadStarterBody", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [{ sender: "Alice", body: "Thread message", timestamp: 1000 }],
      ThreadStarterBody: "Should not appear",
    };

    const result = buildInboundUserContextPrefix(ctx);

    expect(result).toContain("Thread history");
    expect(result).toContain("Thread message");
    expect(result).not.toContain("Thread starter");
    expect(result).not.toContain("Should not appear");
  });

  it("includes timestamp_ms in thread history entries", () => {
    const ctx: TemplateContext = {
      ...baseCtx(),
      ThreadHistory: [{ sender: "Alice", body: "Test", timestamp: 1700000000000 }],
    };

    const result = buildInboundUserContextPrefix(ctx);
    const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
    const parsed = JSON.parse(jsonMatch?.[1] ?? "[]");

    expect(parsed).toHaveLength(1);
    expect(parsed[0].timestamp_ms).toBe(1700000000000);
    expect(parsed[0].sender).toBe("Alice");
    expect(parsed[0].body).toBe("Test");
  });

  it("renders empty string when neither ThreadHistory nor ThreadStarterBody is set", () => {
    const ctx: TemplateContext = baseCtx();

    const result = buildInboundUserContextPrefix(ctx);

    expect(result).not.toContain("Thread history");
    expect(result).not.toContain("Thread starter");
  });
});
