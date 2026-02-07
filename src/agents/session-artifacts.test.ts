import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  getToolResultArtifactRef,
  isArtifactRef,
  withToolResultArtifactRef,
} from "./session-artifacts.js";

describe("session artifact helpers", () => {
  it("detects artifact refs in toolResult details", () => {
    const ref = {
      id: "art_123",
      type: "tool-result" as const,
      toolName: "exec",
      createdAt: new Date().toISOString(),
      sizeBytes: 42,
      summary: "hello",
      path: "/tmp/art_123.json",
    };
    const message: AgentMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "exec",
      isError: false,
      content: [{ type: "text", text: "omitted" }],
      details: { artifactRef: ref },
      timestamp: Date.now(),
    };

    expect(isArtifactRef(ref)).toBe(true);
    expect(getToolResultArtifactRef(message)).toEqual(ref);
  });

  it("returns null when artifact ref is missing or malformed", () => {
    const message: AgentMessage = {
      role: "toolResult",
      toolCallId: "call-2",
      toolName: "exec",
      isError: false,
      content: [{ type: "text", text: "ok" }],
      details: { artifactRef: { id: "bad" } },
      timestamp: Date.now(),
    };

    expect(getToolResultArtifactRef(message)).toBeNull();
  });

  it("merges artifact refs into toolResult details", () => {
    const ref = {
      id: "art_456",
      type: "tool-result" as const,
      createdAt: new Date().toISOString(),
      sizeBytes: 123,
      summary: "summary",
      path: "/tmp/art_456.json",
    };
    const details = withToolResultArtifactRef({ foo: "bar" }, ref);
    expect(details.foo).toBe("bar");
    expect(details.artifactRef).toEqual(ref);
    expect(details.artifactVersion).toBe(1);
  });
});
