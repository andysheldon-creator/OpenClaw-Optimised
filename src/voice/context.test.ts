import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildVoiceContext } from "./context.js";

vi.mock("../logging.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-voice-ctx-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── buildVoiceContext ─────────────────────────────────────────────────────────

describe("buildVoiceContext", () => {
  it("includes identity name when configured", async () => {
    const result = await buildVoiceContext({
      cfg: {
        identity: { name: "Samantha" },
        agent: { workspace: tmpDir },
      } as any,
      sessionKey: "test-session",
    });

    expect(result).toContain("Samantha");
  });

  it("includes voice-specific instructions", async () => {
    const result = await buildVoiceContext({
      cfg: {
        agent: { workspace: tmpDir },
      } as any,
      sessionKey: "test-session",
    });

    expect(result).toContain("voice conversation");
    expect(result).toContain("concise");
  });

  it("loads SOUL.md from workspace when available", async () => {
    // Create a workspace with SOUL.md
    await fs.writeFile(
      path.join(tmpDir, "SOUL.md"),
      "I am a playful assistant who loves cats.",
      "utf8",
    );

    const result = await buildVoiceContext({
      cfg: {
        agent: { workspace: tmpDir },
      } as any,
      sessionKey: "test-session",
    });

    expect(result).toContain("playful assistant");
  });

  it("falls back to IDENTITY.md when SOUL.md missing", async () => {
    await fs.writeFile(
      path.join(tmpDir, "IDENTITY.md"),
      "I am a helpful robot.",
      "utf8",
    );

    const result = await buildVoiceContext({
      cfg: {
        agent: { workspace: tmpDir },
      } as any,
      sessionKey: "test-session",
    });

    expect(result).toContain("helpful robot");
  });

  it("truncates to maxChars limit", async () => {
    const result = await buildVoiceContext({
      cfg: {
        identity: { name: "TestBot" },
        agent: { workspace: tmpDir },
      } as any,
      sessionKey: "test-session",
      maxChars: 50,
    });

    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("handles missing workspace gracefully", async () => {
    const result = await buildVoiceContext({
      cfg: {
        agent: { workspace: "/nonexistent/path/nowhere" },
      } as any,
      sessionKey: "test-session",
    });

    // Should still produce a result with at least voice instructions
    expect(result).toContain("voice conversation");
  });

  it("handles empty config gracefully", async () => {
    const result = await buildVoiceContext({
      cfg: {} as any,
      sessionKey: "test-session",
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
